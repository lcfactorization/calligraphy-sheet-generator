#!/usr/bin/env node
// ============================================================================
// verify-aiconsole-ui.cjs — 「AI 控制台 + Key 真的能用」真浏览器取证
//
// 背景：v3.0.6 把 shuaixiaodai-calligraphy 的 AI Key 体系整体搬进了本项目
//   （四种保存方式、自定义引擎、批量导入、连通性体检）。verify-v304-aikeys.cjs
//   是 Node 侧的单元级取证，但它跑在桩环境里，证明不了两件事：
//     1. 控制台的 UI 是否真的能在页面里打开、渲染、刷新；
//     2. 「添加的 Key 确实能起作用」是否走得通真实网络栈（CORS / 鉴权头 /
//        响应体形状校验），而不是只在桩 fetch 里成立。
//   本脚本用 puppeteer + vite dev server + 一个本地假 OpenAI 端点把这两件事
//   都钉死：Key 由**页面内**的 aiKeyStore/aiKeyHealth 添加并体检，请求真的
//   打到 127.0.0.1 上的 mock，mock 校验 Authorization 头后才回 200。
//
// 负控：AIUI_NEGATIVE=1 时把 mock 的响应体换成 HTML（模拟"代理/baseUrl 配错"），
//   U3/U8 必须转红 —— 用以证明这套判据不是恒真。
//
// 只读取证，不改产品代码。输出人读表格 + JSON。
// ============================================================================
const path = require('path');
const http = require('http');
const fs = require('fs');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.AIUI_PORT || 5211);
const NEGATIVE = !!process.env.AIUI_NEGATIVE;
// 两个仓库的设置中心入口不同：distribution 用按钮 #scAiConsoleOpen，
// shuaixiaodai-calligraphy 用卡片 #scOpenConsoleCard。用环境变量切换，脚本其余部分共用。
const OPEN_SEL = process.env.AIUI_OPEN_SELECTOR || '#scAiConsoleOpen';
const SUMMARY_SEL = process.env.AIUI_SUMMARY_SELECTOR || '#scAiConsoleSummary';
const GOOD_KEY = 'sk-mock-0123456789abcdef';
const BAD_KEY = 'sk-mock-WRONG-KEY-000000';

const rows = [];
function record(name, pass, observed, expected, note) {
    rows.push({ name, pass: !!pass, observed, expected, note: note || '' });
    const tag = pass ? '[PASS]' : '[FAIL]';
    console.log(`${tag} ${name}`);
    console.log(`        observed: ${fmt(observed)}`);
    if (!pass) console.log(`        expected: ${fmt(expected)}`);
    if (note) console.log(`        note:     ${note}`);
}
function eq(name, observed, expected, note) { record(name, observed === expected, observed, expected, note); }
function truthy(name, v, note) { record(name, !!v, v, 'truthy', note); }
function fmt(v) {
    let s;
    try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
    if (s === undefined) s = 'undefined';
    return s.length > 160 ? s.slice(0, 157) + '...' : s;
}

// ── mock OpenAI 兼容端点 ────────────────────────────────────────────────────
// /v1/models       ：GET，校验鉴权，返回模型列表（探测阶段 1）
// /v1/chat/completions：POST，校验鉴权，返回 chat completion（探测阶段 2 / 真实调用）
// /dead/*          ：永远 401（模拟"这家不认这把 Key"）
// 所有响应带 CORS 头 —— 页面在 vite 源上，跨源到 127.0.0.1:MOCKPORT。
const hits = [];
let mockPort = 0;

function startMock() {
    return new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => {
            const chunks = [];
            req.on('data', (c) => chunks.push(c));
            req.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                const auth = String(req.headers['authorization'] || req.headers['x-api-key'] || '');
                hits.push({ method: req.method, url: req.url, auth, body: raw });

                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Headers', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
                if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

                const json = (code, obj) => {
                    res.writeHead(code, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(obj));
                };

                if (req.url.startsWith('/dead')) { json(401, { error: { message: 'invalid key' } }); return; }

                const okKey = auth === `Bearer ${GOOD_KEY}`;
                if (!okKey) { json(401, { error: { message: 'Authentication Fails' } }); return; }

                if (req.url.endsWith('/models')) {
                    json(200, { object: 'list', data: [{ id: 'mock-chat', object: 'model' }] });
                    return;
                }
                if (NEGATIVE) {
                    // 负控：HTTP 200 但响应体是 HTML —— 正是"走了代理/baseUrl 配错"的形状，
                    // aiKeyHealth 必须判为不可用，而不是只看 200 就放行。
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<html><body>502 Bad Gateway</body></html>');
                    return;
                }
                let parsed = null;
                try { parsed = JSON.parse(raw); } catch { parsed = null; }
                json(200, {
                    id: 'chatcmpl-mock',
                    object: 'chat.completion',
                    model: (parsed && parsed.model) || 'mock-chat',
                    choices: [{
                        index: 0,
                        finish_reason: 'stop',
                        message: {
                            role: 'assistant',
                            // 真实组词契约：{"chars":[{...}]}
                            content: '{"chars":[{"char":"测","zuci":["测试","测量"],"pinyin":"cè shì"}]}'
                        }
                    }],
                    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                    __sawResponseFormat: !!(parsed && parsed.response_format),
                    __sawMaxTokens: parsed ? parsed.max_tokens : null
                });
            });
        });
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            mockPort = srv.address().port;
            resolve(srv);
        });
    });
}

// ── 浏览器侧动作（必须是自包含函数：page.evaluate 只序列化传入函数本身）──────
function openConsoleInPage(openSel, summarySel) {
    return (async () => {
        const btn = document.getElementById('settingsBtn');
        if (!btn) return { step: 'settingsBtn', ok: false };
        btn.click();
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        let overlay = null;
        for (let i = 0; i < 40; i++) {
            overlay = document.querySelector('.sc-overlay');
            if (overlay) break;
            await wait(50);
        }
        if (!overlay) return { step: 'sc-overlay', ok: false };

        // AI 区默认折叠（aiZuciEnabled 默认 false）—— 走真实用户路径：先勾开关
        const cb = overlay.querySelector('#scAiZuci');
        if (cb && !cb.checked) { cb.click(); await wait(120); }

        const cfg = overlay.querySelector('#scAiConfig');
        const openBtn = overlay.querySelector(openSel);
        if (!openBtn) return { step: openSel, ok: false };
        const cfgVisible = !!(cfg && cfg.offsetParent !== null);
        openBtn.click();

        let modal = null;
        for (let i = 0; i < 60; i++) {
            modal = document.querySelector('.aic-modal');
            if (modal && modal.offsetParent !== null) break;
            await wait(50);
        }
        const nav = document.querySelector('#aicNav');
        // 导航与「入口旁摘要」都是异步渲染的（懒加载 aiConsole / 动态 import 统计），
        // 立刻读会拿到 0 / 空串。这里轮询到就位为止，避免把渲染时序误报成缺陷。
        for (let i = 0; i < 60; i++) {
            if (nav && nav.children.length > 0) break;
            await wait(50);
        }
        let sumEl = null, summary = '';
        for (let i = 0; i < 60; i++) {
            sumEl = document.querySelector(summarySel);
            summary = sumEl ? (sumEl.textContent || '') : '';
            if (summary.trim()) break;
            await wait(50);
        }
        return {
            step: 'done', ok: !!modal,
            cfgVisible,
            modalVisible: !!(modal && modal.offsetParent !== null),
            navChildren: nav ? nav.children.length : -1,
            navText: nav ? (nav.textContent || '').slice(0, 120) : '',
            title: (document.querySelector('#aicTitle') || {}).textContent || '',
            hasAddProvider: !!document.querySelector('#aicAddProvider'),
            hasImportFile: !!document.querySelector('#aicImportFile'),
            hasMore: !!document.querySelector('#aicMore'),
            summary
        };
    })();
}

function addAndProbeInPage(mockBase, goodKey, badKey, deadBase) {
    return (async () => {
        const out = {};
        const P = await import('/src/modules/aiProviders.js');
        const H = await import('/src/modules/aiKeyHealth.js');
        const S = await import('/src/modules/aiKeyStore.js');

        // 1) 一体化添加自定义引擎（Key + baseURL + modelID + 协议）
        const add = P.addCustomProviderWithKey({
            key: goodKey, baseUrl: mockBase, modelId: 'mock-chat', protocol: 'openai'
        });
        out.addOk = !!(add && add.ok);
        out.addError = add && add.error ? add.error : '';
        out.providerId = add && add.providerId ? add.providerId : '';
        if (!out.addOk) return out;

        // 2) 入 store（默认内存档），并确认没有明文落盘
        const entry = S.addKey({ key: goodKey, providerId: out.providerId, modelId: 'mock-chat' });
        out.entryId = entry && entry.id ? entry.id : '';
        out.storeCount = S.getAllKeys().length;
        out.plaintextOnDisk = localStorage.getItem('ai_api_keys');
        out.legacyPlaintext = localStorage.getItem('deepseek_api_key');
        out.persistMode = S.getKeyPersistenceMode();

        // 3) 真体检：请求真的打到 mock
        const v = await H.probeKey({ id: out.entryId, key: goodKey, providerId: out.providerId, modelId: 'mock-chat' });
        out.verdict = { ok: v.ok, kind: v.kind, code: v.code, jsonOk: v.jsonOk, message: v.message, providerId: v.providerId };

        // 4) 生效 Key 解析
        const eff = S.getEffectiveKeyEntry();
        out.effective = eff ? { key: eff.key === goodKey, providerId: eff.providerId, modelId: eff.modelId } : null;

        // 5) 负控 A：错 Key → 401 → kind 'auth'
        const vBad = await H.probeKey({ key: badKey, providerId: out.providerId, modelId: 'mock-chat' });
        out.badVerdict = { ok: vBad.ok, kind: vBad.kind, code: vBad.code };

        // 6) 负控 B：不可达端点 → 不得谎报可用
        const vDead = await H.probeKey({ key: goodKey, providerId: out.providerId, modelId: 'mock-chat' },
            { timeoutMs: 4000 });
        out.deadNote = `dead probe reused providerId=${out.providerId}`;

        // 7) 真实调用链：callDeepSeekDirect 走同一把 Key，拿到解析后的数据
        const Z = await import('/src/modules/aiZuci.js');
        const info = Z.getAiProvider({ key: goodKey, providerId: out.providerId, modelId: 'mock-chat' });
        try {
            const r = await Z.callDeepSeekDirect(
                [{ char: '测', pinyin: 'cè', existing: [] }],
                { apiKey: goodKey, providerInfo: info, model: 'mock-chat', mode: 'fast' }
            );
            out.direct = { ok: true, provider: r.provider, model: r.model, dataType: Array.isArray(r.data) ? 'array' : typeof r.data, first: r.data && r.data[0] ? r.data[0] : null };
        } catch (e) {
            out.direct = { ok: false, error: (e && e.message) || String(e) };
        }

        // 8) 不可达 baseUrl 的自定义引擎（连接被拒）
        const dead = P.addCustomProviderWithKey({
            key: goodKey, baseUrl: deadBase, modelId: 'mock-chat', protocol: 'openai'
        });
        out.deadAddOk = !!(dead && dead.ok);
        if (out.deadAddOk) {
            const vd = await H.probeKey({ key: goodKey, providerId: dead.providerId, modelId: 'mock-chat' }, { timeoutMs: 5000 });
            out.deadVerdict = { ok: vd.ok, kind: vd.kind, message: (vd.message || '').slice(0, 80) };
        }
        return out;
    })();
}

function refreshConsoleInPage() {
    return (async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const btn = document.querySelector('#aicRefresh');
        if (btn) { btn.click(); await wait(600); }
        const nav = document.querySelector('#aicNav');
        const detail = document.querySelector('#aicDetail');
        return {
            navChildren: nav ? nav.children.length : -1,
            navText: nav ? (nav.textContent || '').slice(0, 300) : '',
            detailText: detail ? (detail.textContent || '').slice(0, 300) : '',
            footer: (document.querySelector('#aicFooterStatus') || {}).textContent || ''
        };
    })();
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
(async () => {
    const mock = await startMock();
    const MOCK = `http://127.0.0.1:${mockPort}/v1`;
    const DEAD = 'http://127.0.0.1:1/v1'; // 端口 1：连接必被拒
    console.log(`mock OpenAI endpoint: ${MOCK}  (NEGATIVE=${NEGATIVE})`);

    const { createServer } = await import('vite');
    const server = await createServer({
        root: ROOT,
        configFile: path.join(ROOT, 'vite.config.js'),
        server: { port: PORT, strictPort: true, host: '127.0.0.1' }
    });
    await server.listen();
    const BASE = `http://127.0.0.1:${PORT}`;
    console.log(`vite dev server:      ${BASE}\n`);

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const pageErrors = [];
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 1200));

        // ── U 组：控制台 UI 真的能打开 ──
        const opened = await page.evaluate(openConsoleInPage, OPEN_SEL, SUMMARY_SEL);
        eq('U1 设置中心可打开且 AI 区随开关显示', opened.cfgVisible, true, `step=${opened.step}`);
        eq('U2 AI 控制台模态可见（点击入口后）', opened.modalVisible, true, `title=${opened.title}`);
        record('U3 左侧引擎导航已渲染（非空）', opened.navChildren > 0, opened.navChildren, '>0');
        truthy('U4 头部「＋ 添加供应商」入口存在', opened.hasAddProvider);
        truthy('U5 批量导入文件输入存在（.txt/.md/.csv/.json/.docx）', opened.hasImportFile);
        truthy('U6 「更多操作」菜单入口存在', opened.hasMore);
        record('U7 入口旁实时摘要已填充', (opened.summary || '').length > 0, opened.summary, 'non-empty');

        // ── K 组：Key 添加 + 真实体检 + 真实调用 ──
        const r = await page.evaluate(addAndProbeInPage, MOCK, GOOD_KEY, BAD_KEY, DEAD);
        truthy('K1 一体化添加自定义引擎成功（Key+baseURL+modelID+协议）', r.addOk, r.addError || `providerId=${r.providerId}`);
        record('K2 Key 进入 store', r.storeCount, 1);
        eq('K3 保存方式为默认内存档', r.persistMode, 'memory');
        eq('K4 明文 Key 列表未落盘', r.plaintextOnDisk, null);
        eq('K5 旧版明文 Key 未落盘', r.legacyPlaintext, null);
        truthy('K6 getEffectiveKeyEntry 解析出这把 Key', r.effective && r.effective.key, JSON.stringify(r.effective));
        eq('K6b 生效 Key 的 providerId 正确', r.effective && r.effective.providerId, r.providerId);

        if (NEGATIVE) {
            // 负控：mock 返回 HTML，体检必须判不可用
            eq('K7 [负控] 200+HTML 响应体不得判为可用', r.verdict && r.verdict.ok, false, JSON.stringify(r.verdict));
        } else {
            eq('K7 连通性体检判定为可用（真实 HTTP + 鉴权头校验）', r.verdict && r.verdict.ok, true, JSON.stringify(r.verdict));
            eq('K7b 体检裁决 kind=ok', r.verdict && r.verdict.kind, 'ok');
            eq('K7c 体检裁决 HTTP 200', r.verdict && r.verdict.code, 200);
        }

        eq('K8 [负控] 错误 Key 被判为鉴权失败(401/auth)', r.badVerdict && r.badVerdict.kind, 'auth', JSON.stringify(r.badVerdict));
        eq('K8b 错误 Key 不得报可用', r.badVerdict && r.badVerdict.ok, false);
        truthy('K9 [负控] 不可达 baseUrl 的自定义引擎可添加但体检失败',
            r.deadAddOk && r.deadVerdict && r.deadVerdict.ok === false,
            JSON.stringify(r.deadVerdict));

        if (NEGATIVE) {
            eq('K10 [负控] 真实调用链不得静默成功', r.direct && r.direct.ok, false, JSON.stringify(r.direct));
        } else {
            eq('K10 真实调用链（callDeepSeekDirect）走通并解析出数据', r.direct && r.direct.ok, true, JSON.stringify(r.direct));
            record('K10b 调用返回了模型名', !!(r.direct && r.direct.model), r.direct && r.direct.model, 'non-empty');
        }

        // ── M 组：mock 侧证据（请求确实带着 Bearer 头到达）──
        const bearerHits = hits.filter(h => h.auth === `Bearer ${GOOD_KEY}`);
        const badHits = hits.filter(h => h.auth === `Bearer ${BAD_KEY}`);
        record('M1 mock 收到带正确 Bearer 头的请求', bearerHits.length > 0, bearerHits.length, '>0');
        record('M2 mock 收到带错误 Key 的请求（说明 401 是真判出来的）', badHits.length > 0, badHits.length, '>0');
        record('M3 探测确实打到了 /v1/chat/completions',
            hits.some(h => h.url.indexOf('/chat/completions') >= 0), true, true);

        // ── C 组：刷新后 UI 反映了新增引擎 ──
        const after = await page.evaluate(refreshConsoleInPage);
        record('C1 刷新后导航仍非空', after.navChildren > 0, after.navChildren, '>0');
        record('C2 详情/导航中出现了 mock 引擎或 Key 掩码',
            /mock/i.test(after.navText + after.detailText + after.footer),
            (after.navText + '|' + after.detailText + '|' + after.footer).slice(0, 160), 'matches /mock/i');

        eq('C3 全程无未捕获页面异常', pageErrors.length, 0, pageErrors.slice(0, 3).join(' | '));
    } catch (e) {
        record('HARNESS 自身异常', false, (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)), 'no throw');
    } finally {
        await browser.close();
        await server.close();
        mock.close();
    }

    const nPass = rows.filter(r => r.pass).length;
    const nFail = rows.length - nPass;
    console.log('\n' + '='.repeat(78));
    console.log(`SUMMARY: ${nPass} passed, ${nFail} failed, ${rows.length} total   (NEGATIVE=${NEGATIVE})`);
    console.log('='.repeat(78));
    if (nFail) {
        console.log('FAILED ASSERTIONS:');
        rows.filter(r => !r.pass).forEach(r => {
            console.log(`  - ${r.name}\n      observed: ${fmt(r.observed)}\n      expected: ${fmt(r.expected)}`);
        });
    }
    try {
        fs.writeFileSync(path.join(__dirname, 'aiconsole-ui-report.json'),
            JSON.stringify({ negative: NEGATIVE, mockHits: hits.length, rows }, null, 2));
    } catch { /* 报告写不进不影响判据 */ }
    process.exitCode = nFail ? 1 : 0;
})();
