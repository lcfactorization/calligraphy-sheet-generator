#!/usr/bin/env node
/**
 * probe-free-quota-docs.cjs —— 免费额度"正文取证"器（渲染后取文本，交人工判读）
 * ============================================================================
 * 为什么需要它：定价/额度页几乎全是 JS 渲染，curl 拿回来是空壳或模板变量
 *   （实测 OpenRouter 的限速表在 HTML 里就是 `{FREE_MODEL_RATE_LIMIT_RPM}`）。
 *   而 scripts/provider-catalog-override.json 里的每条额度都必须有 https 出处，
 *   出处必须是**厂商自己的页面正文**，不能是聚合站、也不能凭记忆。
 *
 * 本脚本**只取证、不判定**：它把页面渲染后的可见文本落盘，由人工读、再把事实
 * 抄进 override（带 source + asOf + verified）。自动生成额度是假的安全 ——
 * 谁也不能保证解析器不误读"最高节省 90%"成"免费 90%"。
 *
 * 运行：
 *   node scripts/probe-free-quota-docs.cjs                       # 跑内置清单
 *   node scripts/probe-free-quota-docs.cjs --only groq,zhipu     # 只跑几家
 *   node scripts/probe-free-quota-docs.cjs --out _free_quota_docs
 * 产物：_free_quota_docs/<id>.txt      渲染后可见文本
 *       _free_quota_docs/index.json    状态 / 最终 URL / 文本长度 / 命中关键词的行
 * 退出码：0 全部有正文；3 所有目标都取不到正文（多半是网络或浏览器不可用）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const argVal = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = path.resolve(ROOT, argVal('out', '_free_quota_docs'));

/** 取证目标：只列厂商自己的域名（官方文档 / 定价 / 速率限制页） */
const TARGETS = [
    ['gemini', 'Free tier 限速与可用模型', 'https://ai.google.dev/gemini-api/docs/rate-limits', ['free tier', 'Free layer', 'RPM', 'RPD']],
    ['groq', '免费档速率限制', 'https://console.groq.com/docs/rate-limits', ['rate limit', 'requests per', 'tokens per', 'developer']],
    ['mistral', '免费/实验档用量上限', 'https://mistral.ai/pricing', ['free', 'experiment', 'request per']],
    ['cerebras', '免费/试用档速率', 'https://inference-docs.cerebras.ai/support/rate-limits', ['free', 'trial', 'tokens per day']],
    ['cohere', 'Trial key 用量', 'https://docs.cohere.com/docs/rate-limits', ['trial', 'requests per', 'production']],
    ['zhipu', '免费模型清单与计费', 'https://bigmodel.cn/pricing', ['免费', '元/千', 'Token', '限流']],
    ['siliconflow', '注册赠送额度与免费模型', 'https://docs.siliconflow.com/cn/faqs/billing-rules', ['赠送', '免费', '元', '额度']],
    ['modelscope', 'API-Inference 免费调用次数', 'https://modelscope.cn/docs/model-service/API-Inference/intro', ['免费', '每日', '次数', '限流']],
    ['sensenova', '公测/免费档积分', 'https://www.sensenova.cn/token-plan', ['免费', '积分', '公测', '¥0']],
    ['volcano', '方舟免费额度政策', 'https://www.volcengine.com/product/ark', ['免费', '额度', 'Token', '试用']],
    ['hunyuan', 'TokenHub 新人免费体验包', 'https://cloud.tencent.com/document/product/1823/130053', ['免费', '万 Tokens', '有效期', '领取']],
    ['radeon', 'AMD TokenFactory 是否免费', 'https://developer.amd.com.cn/radeon/tokenfactory', ['免费', '额度', '限流', '每日']],
    ['stepfun', '限时免费与限速', 'https://platform.stepfun.com/docs/zh/guides/pricing/details', ['免费', '限时', 'RPM', 'TPM']],
    ['novita-ai', '免费模型与注册券', 'https://novita.ai/docs/guides/pricing', ['free', 'credit', 'per month']],
    ['huggingface', 'Inference Credits', 'https://huggingface.co/docs/inference-providers/en/pricing', ['free', 'credit', 'per month']],
];

function findChrome() {
    const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
    const hits = [];
    const walk = (dir, depth) => {
        if (depth > 3 || !fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            const p = path.join(dir, name);
            let st = null;
            try { st = fs.statSync(p); } catch { continue; }
            if (!st.isDirectory()) continue;
            const exe = path.join(p, 'chrome-win64', 'chrome.exe');
            if (fs.existsSync(exe)) hits.push(exe);
            else walk(p, depth + 1);
        }
    };
    walk(cacheDir, 0);
    return hits[0] || null;
}

(async () => {
    const only = argVal('only', '');
    const wanted = only ? new Set(only.split(',').map(s => s.trim())) : null;
    const puppeteer = require('puppeteer');
    fs.mkdirSync(OUT, { recursive: true });
    const exe = findChrome();
    const browser = await puppeteer.launch({
        headless: 'shell', ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const index = [];
    try {
        for (const [id, why, url, keys] of TARGETS) {
            if (wanted && !wanted.has(id)) continue;
            const page = await browser.newPage();
            const rec = { id, why, url, finalUrl: null, http: null, chars: 0, hits: [], error: null };
            try {
                await page.setViewport({ width: 1280, height: 1600 });
                const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                rec.http = resp ? resp.status() : null;
                rec.finalUrl = page.url();
                await new Promise(r => setTimeout(r, 2500));   // 等正文水合
                const text = await page.evaluate(() => {
                    const root = document.querySelector('main, article, .doc-content, body');
                    return (root && root.innerText) || document.body.innerText || '';
                });
                rec.chars = text.length;
                fs.writeFileSync(path.join(OUT, `${id}.txt`),
                    `# ${id} —— 取证理由：${why}\n# 来源 ${url}\n# 最终 ${rec.finalUrl}  HTTP ${rec.http}  取回于 ${new Date().toISOString()}\n\n${text}\n`);
                const norm = text.replace(/\s+/g, ' ');
                for (const k of keys) {
                    let i = 0, n = 0;
                    while (n < 3) {
                        const at = norm.toLowerCase().indexOf(k.toLowerCase(), i);
                        if (at < 0) break;
                        rec.hits.push(norm.slice(Math.max(0, at - 90), at + 150));
                        i = at + k.length; n++;
                    }
                }
            } catch (e) {
                rec.error = String(e && e.message || e).slice(0, 160);
            }
            await page.close();
            index.push(rec);
            console.log(`${rec.error ? '✗ ' : (rec.chars > 800 ? '✓ ' : '! ')} ${id.padEnd(12)} HTTP ${String(rec.http).padEnd(4)} ${String(rec.chars).padStart(7)} 字  命中 ${rec.hits.length}${rec.error ? '  ⚠ ' + rec.error : ''}`);
        }
    } finally {
        await browser.close();
    }
    fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
    const usable = index.filter(r => r.chars > 800).length;
    console.log(`\n取到正文 ${usable}/${index.length} 家 → ${OUT}`);
    console.log('下一步：人工读这些 txt，把额度事实抄进 scripts/provider-catalog-override.json（source+asOf+verified），');
    console.log('        再跑 node scripts/generate-provider-catalog.mjs && npm run verify:catalog');
    process.exit(index.length && usable === 0 ? 3 : 0);
})().catch(e => { console.error('运行失败：' + (e && e.stack || e)); process.exit(4); });
