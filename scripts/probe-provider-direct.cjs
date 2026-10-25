// probe-provider-direct.cjs —— 厂商「浏览器直连」取证关口
// ============================================================================
// 为什么需要它：本项目是纯前端应用，浏览器直接拿用户 Key 调厂商 HTTP API。
// 厂商能不能直连只有一件事说了算：**真浏览器在真源上发真请求，能不能读到响应**。
// 用 Node 的 fetch 看响应头会得出错误结论 —— 实测差异：
//   · Groq：Node 探测 403 无 ACAO ⇒ 判「不可直连」；真浏览器 401 可读 ⇒ 实际可直连。
//   · 火山方舟：真浏览器无 Key 探测被拦；但注册表带 Key 实测过 ⇒ 错误响应不带 ACAO
//     ≠ 成功响应不带。所以本关口把结论分成三档，绝不把「读不到」直接判成「不可用」。
//
// 三档结论：
//   DIRECT-CONFIRMED  能读到状态码与 body ⇒ 确认可直连
//   NEEDS-KEY         请求失败但主机可达 ⇒ 只能由带 Key 的实测来定论（不内置、不谎报）
//   HOST-UNREACHABLE  连 no-cors opaque 请求都失败 ⇒ 本机网络不可达，记「未实测」
//
// 自证（跑之前先证明量具有效，否则一切绿都无意义）：
//   正控 3 家：注册表已用真 Key 确认可直连的，必须读得到（读不到 = 探针/源失效）
//   负控 1 家：已知不带 ACAO 的跨源端点，必须被拦（竟然读得到 = 同源策略没生效，空断言）
//   页面 Origin 必须严格等于生产源，换源后 ACAO 判定无意义
//
// 运行：node scripts/probe-provider-direct.cjs [--ids a,b,c] [--out <dir>] [--json]
// 退出码：0=取证完成；3=自证失败（结论作废）；4=正控里出现「注册表称可直连但读不到」
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const PROD_ORIGIN = 'https://calligraphy-sheet-generator.pages.dev';
const DOC_URL = PROD_ORIGIN + '/';

const ARGS = process.argv.slice(2);
const argVal = (name, dflt) => {
    const i = ARGS.indexOf('--' + name);
    return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : dflt;
};

// 正控：注册表 cors='verified' 且我们已知错误响应也带 ACAO 的（读不到就是探针坏了）
const POSITIVE = [
    { id: 'deepseek', baseUrl: 'https://api.deepseek.com', chatPath: '/chat/completions' },
    { id: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', chatPath: '/chat/completions' },
    { id: 'moonshot', baseUrl: 'https://api.moonshot.cn/v1', chatPath: '/chat/completions' },
];
// 负控：跨源且已知不发 ACAO —— 必须被拦，否则「读不到」这一档全是假警报
const NEGATIVE = { id: 'negative-control', baseUrl: 'https://example.com', chatPath: '/' };

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

// 从注册表读内置厂商清单（不重复维护一份 baseURL，避免两处漂移）
const { pathToFileURL } = require('url');
async function builtinTargets() {
    const mod = await import(pathToFileURL(path.join(ROOT, 'src', 'modules', 'aiProviders.js')).href);
    return mod.PROVIDERS.filter((p) => !p.custom && /^https:\/\//.test(p.baseUrl || ''))
        .map((p) => ({
            id: p.id, baseUrl: p.baseUrl, chatPath: p.chatPath || '/chat/completions',
            protocol: p.protocol || 'openai', modelsPath: p.modelsPath === undefined ? '/models' : p.modelsPath,
            corsClaim: p.cors || 'unverified',
        }));
}

async function probeInBrowser(page, t) {
    return page.evaluate(async (target) => {
        const url = target.baseUrl.replace(/\/$/, '') + target.chatPath;
        const anthropic = target.protocol === 'anthropic';
        // 单次探测上限 12s：不可达的主机否则会挂住整轮取证（219 家 × 2 请求）
        const TO = 12000;
        // 第一层：no-cors GET —— 只为区分「主机不可达」与「主机可达但被 CORS 拦」。
        // 两者在 cors 模式下都是同一个 TypeError，不区分就会把网络问题报成厂商问题。
        let reachable = null;
        try {
            const r0 = await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(TO) });
            reachable = { ok: true, type: r0.type };
        } catch (e) { reachable = { ok: false, error: String(e && e.name || e.message || e) }; }
        // 第二层：真实调用形状（POST + 预检触发的请求头），Key 用明显无效的值
        const headers = { 'Content-Type': 'application/json', Origin: location.origin };
        if (anthropic) {
            headers['x-api-key'] = 'probe-invalid-key';
            headers['anthropic-version'] = '2023-06-01';
        } else {
            headers.Authorization = 'Bearer probe-invalid-key';
        }
        const body = anthropic
            ? JSON.stringify({ model: 'probe', max_tokens: 1, messages: [{ role: 'user', content: '1' }] })
            : JSON.stringify({ model: 'probe', messages: [{ role: 'user', content: '1' }], max_tokens: 1 });
        try {
            const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(TO) });
            let bodyLen = 0;
            try { bodyLen = (await r.text()).length; } catch { bodyLen = -1; }
            return { verdict: 'DIRECT-CONFIRMED', status: r.status, bodyLen, reachable };
        } catch (e) {
            // AbortError/TimeoutError = 连接挂起，主机状态未知，不能算「可直连」也不能算「被 CORS 拦」
            const nm = String(e && e.name || '');
            if (nm === 'TimeoutError' || nm === 'AbortError') {
                return { verdict: 'TIMEOUT', error: nm, reachable };
            }
            return {
                verdict: reachable && reachable.ok ? 'NEEDS-KEY' : 'HOST-UNREACHABLE',
                error: String(e && e.message || e), reachable,
            };
        }
    }, t);
}

(async () => {
    const exe = findChrome();
    const browser = await puppeteer.launch({
        headless: 'shell', ...(exe ? { executablePath: exe } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();

    // 用请求拦截把本站文档换成极小 HTML：Origin 仍是生产源，但不必下载 3.3MB 单文件产物
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const isDoc = req.resourceType() === 'document' && req.url().startsWith(DOC_URL);
        const settle = (p) => { try { Promise.resolve(p).catch(() => {}); } catch { /* noop */ } };
        if (isDoc) {
            settle(req.respond({
                status: 200, contentType: 'text/html; charset=utf-8',
                body: '<!DOCTYPE html><title>provider-direct-probe</title>',
            }));
        } else settle(req.continue());
    });

    await page.goto(DOC_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    const origin = await page.evaluate(() => location.origin);
    if (origin !== PROD_ORIGIN) {
        console.error(`页面源是 ${origin}，不是 ${PROD_ORIGIN} —— 换源后 ACAO 判定无意义，退出 3`);
        await browser.close();
        process.exit(3);
    }

    // ── 自证：正控 + 负控 ──
    const selfFail = [];
    console.log('── 关口自证（量具必须先证明自己会咬人）──');
    for (const t of POSITIVE) {
        const r = await probeInBrowser(page, t);
        console.log(`  正控 ${t.id.padEnd(10)} ${r.verdict} ${JSON.stringify(r).slice(0, 90)}`);
        if (r.verdict !== 'DIRECT-CONFIRMED') selfFail.push(`正控 ${t.id} 读不到 ⇒ 探针或页面源失效`);
    }
    {
        const r = await probeInBrowser(page, NEGATIVE);
        console.log(`  负控 ${NEGATIVE.id.padEnd(10)} ${r.verdict}`);
        if (r.verdict === 'DIRECT-CONFIRMED') selfFail.push('负控竟然可读 ⇒ 同源策略未生效，本轮全部结论作废');
    }
    if (selfFail.length) {
        console.error('\n自证失败：\n  ' + selfFail.join('\n  '));
        await browser.close();
        process.exit(3);
    }
    console.log('  自证通过：正控可读、负控被拦\n');

    // ── 正式取证 ──
    const builtins = await builtinTargets();
    // 候选清单（外扩厂商）从文件读，避免在脚本里硬编码一份会漂移的 baseURL
    const candFile = argVal('candidates', null);
    let candidates = [];
    if (candFile) {
        const raw = JSON.parse(fs.readFileSync(path.resolve(ROOT, candFile), 'utf8'));
        candidates = (raw.providers || raw).map((c) => ({
            id: c.id, baseUrl: c.baseUrl, chatPath: c.chatPath || '/chat/completions',
            protocol: c.protocol || 'openai', modelsPath: c.modelsPath === undefined ? '/models' : c.modelsPath,
            corsClaim: c.corsClaim || 'candidate',
        }));
    }
    const all = [...builtins, ...candidates.filter((c) => !builtins.some((b) => b.id === c.id))];
    const only = argVal('ids', null);
    const targets = only ? all.filter((b) => only.split(',').includes(b.id)) : all;
    const out = [];
    console.log(`── 内置 ${builtins.length} 家 + 候选 ${candidates.length} 家，本轮实测 ${targets.length} 家 ──`);
    for (const t of targets) {
        const r = await probeInBrowser(page, t);
        out.push({ ...t, ...r, probedAt: new Date().toISOString().slice(0, 10) });
        console.log(`  ${r.verdict.padEnd(17)} ${(t.corsClaim || '-').padEnd(11)} ${t.id.padEnd(12)} ${t.baseUrl}`);
    }
    await browser.close();

    // 与注册表的宣称对账：称 verified 却连错误响应都读不到 → 需要人工用真 Key 复核
    const mismatch = out.filter(o => o.corsClaim === 'verified' && o.verdict !== 'DIRECT-CONFIRMED');
    const promoted = out.filter(o => o.corsClaim !== 'verified' && o.verdict === 'DIRECT-CONFIRMED');
    const OUT_DIR = path.resolve(ROOT, argVal('out', '_provider_direct_probe'));
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({
        origin, probedAt: new Date().toISOString().slice(0, 10), rows: out,
    }, null, 2));
    const md = ['# 厂商浏览器直连取证', '', `页面源：${origin}`, '',
        '| 厂商 | 注册表称 | 实测 | 说明 |', '|---|---|---|---|',
        ...out.map(o => `| ${o.id} | ${o.corsClaim || '-'} | ${o.verdict} | ${o.status ? 'HTTP ' + o.status : String(o.error || '').slice(0, 60)} |`),
        '',
        `DIRECT-CONFIRMED=${out.filter(o => o.verdict === 'DIRECT-CONFIRMED').length}`,
        ` NEEDS-KEY=${out.filter(o => o.verdict === 'NEEDS-KEY').length}`,
        ` HOST-UNREACHABLE=${out.filter(o => o.verdict === 'HOST-UNREACHABLE').length}`,
        ` TIMEOUT=${out.filter(o => o.verdict === 'TIMEOUT').length}`, '',
        '注：NEEDS-KEY 表示**无 Key 时读不到响应**，可能是厂商只给成功响应发 ACAO，',
        '不能据此判定不可用；须由带 Key 的运行时体检（AI 控制台「检测」）定论。',
        ''].join('\n');
    fs.writeFileSync(path.join(OUT_DIR, 'report.md'), md);
    console.log(`\n报告：${path.join(OUT_DIR, 'report.md')}`);
    if (mismatch.length) {
        console.log(`\n与注册表不一致（称 verified 但无 Key 读不到，需真 Key 复核）：${mismatch.map(m => m.id).join(', ')}`);
    }
    if (promoted.length) {
        console.log(`可升格为已确证（注册表尚未标 verified 但无 Key 也读得到）：${promoted.map(m => m.id).join(', ')}`);
    }
    // 正控失败已在前面退出 3；这里不对「不一致」直接退出 4 —— 它是已知现象（错误响应不发 ACAO），
    // 交由人工/运行时体检定论，避免把量具用成常态红灯（常态红的门禁无人理会）。
    process.exit(0);
})().catch((e) => { console.error('运行失败：', e); process.exit(1); });
