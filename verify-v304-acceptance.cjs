#!/usr/bin/env node
/**
 * verify-v304-acceptance.cjs — regression coverage for the v3.0.4 post-acceptance fixes.
 *
 * Run:  node verify-v304-acceptance.cjs
 * No network. No real API key. Only Node built-ins.
 *
 * Why this file exists
 * --------------------
 * The independent acceptance review reproduced a BLOCKING defect (the 📋 copy button is
 * dead in the new default "auto" mode) and found 8 further polish defects. The reviewer
 * explicitly noted that "no test covers it". This suite locks every one of those nine
 * fixes in place so they cannot silently regress.
 *
 * Two kinds of assertions are used, deliberately:
 *   1. Behavioural — real modules imported with stubbed browser globals.
 *   2. Source-level — settingsCenter.js / CSS / .gitignore wiring that cannot be driven
 *      headlessly without a DOM. These are *wiring* checks (e.g. "the AbortController is
 *      created before the first await"), not style checks.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = __dirname;

// ===========================================================================
// 1. Browser global stubs (must be installed BEFORE importing ESM modules)
// ===========================================================================

class MemoryStorage {
    constructor() { this._m = new Map(); }
    getItem(k) { const v = this._m.get(String(k)); return v === undefined ? null : v; }
    setItem(k, v) { this._m.set(String(k), String(v)); }
    removeItem(k) { this._m.delete(String(k)); }
    clear() { this._m.clear(); }
    key(i) { return Array.from(this._m.keys())[i] ?? null; }
    get length() { return this._m.size; }
}

function defineGlobal(name, value) {
    Object.defineProperty(globalThis, name, {
        value, writable: true, configurable: true, enumerable: true
    });
}
defineGlobal('localStorage', new MemoryStorage());
defineGlobal('navigator', { onLine: true });

let fetchHandler = async () => { throw new Error('no fetch handler installed'); };
let fetchLog = [];
globalThis.fetch = async (url, init = {}) => {
    const rec = {
        url: String(url),
        method: String((init && init.method) || 'GET').toUpperCase(),
        body: init && init.body ? String(init.body) : null
    };
    fetchLog.push(rec);
    return fetchHandler(rec.url, init, rec);
};

function resp(status, body, opts = {}) {
    const ok = status >= 200 && status < 300;
    return {
        ok,
        status,
        headers: new Map(Object.entries(opts.headers || {})),
        async json() {
            if (typeof body === 'function') return body();
            if (typeof body === 'string') return JSON.parse(body);
            return body;
        },
        async text() {
            if (opts.text !== undefined) return opts.text;
            if (typeof body === 'string') return body;
            try { return JSON.stringify(body); } catch { return ''; }
        }
    };
}

const GOOD_CHAT = { choices: [{ message: { content: '{"a":1}' } }] };

// ===========================================================================
// 2. Test harness
// ===========================================================================

const rows = [];
let nPass = 0, nFail = 0;

function fmt(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'string') return JSON.stringify(v.length > 80 ? v.slice(0, 77) + '...' : v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try { const s = JSON.stringify(v); return s && s.length > 110 ? s.slice(0, 107) + '...' : String(s); }
    catch { return String(v); }
}

function record(name, pass, actual, expected, note) {
    rows.push({ name, pass, actual: fmt(actual), expected: fmt(expected), note: note || '' });
    if (pass) nPass++; else nFail++;
}

function eq(name, actual, expected, note) {
    let pass;
    try { pass = JSON.stringify(actual) === JSON.stringify(expected); }
    catch { pass = Object.is(actual, expected); }
    record(name, pass, actual, expected, note);
    return pass;
}

function truthy(name, actual, note) { return record(name, !!actual, actual, true, note); }

function approx(name, actual, expected, eps, note) {
    const pass = typeof actual === 'number' && Math.abs(actual - expected) <= (eps || 1e-9);
    record(name, pass, actual, expected, note);
    return pass;
}

function section(title) { console.log('\n### ' + title); }

// ===========================================================================
// 3. Modules under test
// ===========================================================================

const SRC = path.join(ROOT, 'src', 'modules');
const urlOf = (f) => pathToFileURL(path.join(SRC, f)).href;
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Strip JS comments before asserting on source text.
 * Necessary because the fix comments deliberately quote the OLD broken code
 * (e.g. "原实现硬编码了 `github_pat_`"), so a naive substring check on raw
 * source would report a false positive for every fix.
 * The `[^:"'`\\]` guard keeps `https://` inside string literals intact.
 */
function stripJsComments(s) {
    return s
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, '$1');
}
function stripCssComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, ' ');
}
/** Read a JS source file with comments removed. */
const readJs = (rel) => stripJsComments(readSrc(rel));
/** Read a CSS source file with comments removed. */
const readCss = (rel) => stripCssComments(readSrc(rel));

let P, Z, S, H;

async function loadModules() {
    P = await import(urlOf('aiProviders.js'));
    Z = await import(urlOf('aiZuci.js'));
    S = await import(urlOf('aiKeyStore.js'));
    H = await import(urlOf('aiKeyHealth.js'));
}

// ===========================================================================
// 4. Suites
// ===========================================================================

// --- #1 BLOCKING: copy button must resolve the '__auto__' sentinel ----------
function suiteCopyAutoSentinel() {
    section('#1 copy button — __auto__ sentinel (BLOCKING)');
    const src = readJs('src/modules/settingsCenter.js');

    // Locate the copy handler block.
    const copyStart = src.indexOf("const aiKeyCopyBtn = overlay.querySelector('#scAiKeyCopy')");
    truthy('F1.1 copy handler found', copyStart > 0);
    if (copyStart < 0) return;
    const copyBlock = src.slice(copyStart, src.indexOf("const aiKeySelect = overlay.querySelector('#scAiKeySelect')", copyStart));

    truthy('F1.2 copy handler skips lookup for __auto__',
        /id\s*!==\s*'__auto__'/.test(copyBlock),
        'must not do find(k => k.id === "__auto__")');
    truthy('F1.3 copy handler falls back to getEffectiveKeyEntry()',
        /getEffectiveKeyEntry\(\)/.test(copyBlock),
        'mirrors the delete handler');
    truthy('F1.4 copy handler still guards __add_new__',
        /__add_new__/.test(copyBlock));
    truthy('F1.5 copy status labels the auto-mode source',
        /自动选择当前生效/.test(copyBlock));

    // Ordering: the sentinel must be tested BEFORE the find() call, otherwise a
    // '__auto__' id would still be passed to find() first.
    const guardIdx = copyBlock.search(/id\s*!==\s*'__auto__'/);
    const findIdx = copyBlock.indexOf('k.id === id');
    truthy('F1.6 sentinel guard precedes the id lookup',
        guardIdx >= 0 && findIdx >= 0 && guardIdx < findIdx,
        `guard@${guardIdx} find@${findIdx}`);

    // All three sentinel-consuming handlers must agree (eye / copy / delete).
    const eyeBlock = src.slice(
        src.indexOf("const aiKeyToggleBtn = overlay.querySelector('#scAiKeyToggle')"),
        copyStart
    );
    const delBlock = src.slice(src.indexOf("const aiKeyRemoveBtn = overlay.querySelector('#scAiKeyRemove')"));
    truthy('F1.7 eye handler handles __auto__', /__auto__/.test(eyeBlock) && /getEffectiveKeyEntry/.test(eyeBlock));
    truthy('F1.8 delete handler handles __auto__', /__auto__/.test(delBlock) && /getEffectiveKeyEntry/.test(delBlock));
    truthy('F1.9 all three handlers share the fallback pattern',
        /getEffectiveKeyEntry/.test(eyeBlock) && /getEffectiveKeyEntry/.test(copyBlock) && /getEffectiveKeyEntry/.test(delBlock));
}

// --- #2 no "非免费" nag for cheap-tier engines ------------------------------
function suitePaidOnlyNag() {
    section('#2 paid-tier-only degradation nag');

    truthy('F2.1 srcTier is exported for testing', typeof Z.srcTier === 'function');

    // Real registry entries: deepseek is 'cheap', doubao turbo is 'paid', glm-4-flash is 'free'.
    eq('F2.2 deepseek-v4-flash is cheap', Z.srcTier('deepseek:deepseek-v4-flash'), 'cheap',
        'the engine most users actually have');
    eq('F2.3 doubao turbo is paid', Z.srcTier('volcano:doubao-seed-2-1-turbo-260628'), 'paid');
    eq('F2.4 doubao lite is cheap', Z.srcTier('volcano:doubao-seed-2-0-lite-260428'), 'cheap');
    eq('F2.5 glm-4-flash is free', Z.srcTier('zhipu:glm-4-flash'), 'free');
    eq('F2.6 moonshot is cheap', Z.srcTier('moonshot:moonshot-v1-8k'), 'cheap');
    eq('F2.7 gemini is cheap', Z.srcTier('gemini:gemini-2.0-flash'), 'cheap');

    // Fail-open cases: unknown sources must NOT be treated as degraded.
    eq('F2.8 unknown provider -> unknown', Z.srcTier('nosuchengine:whatever'), 'unknown');
    eq('F2.9 unknown model -> unknown', Z.srcTier('deepseek:no-such-model'), 'unknown');
    eq('F2.10 malformed src (no colon) -> unknown', Z.srcTier('deepseek'), 'unknown');
    eq('F2.11 empty src -> unknown', Z.srcTier(''), 'unknown');
    eq('F2.12 null src -> unknown', Z.srcTier(null), 'unknown');
    eq('F2.13 leading colon -> unknown', Z.srcTier(':model'), 'unknown');

    // The nag text must be scoped to the paid tier and must not claim "非免费".
    const zsrc = readJs('src/modules/aiZuci.js');
    truthy('F2.14 nag gated on paidChars > 0', /if\s*\(\s*paidChars\s*>\s*0\s*\)/.test(zsrc));
    // Extract just the tip construction, so the wording check cannot be satisfied
    // or defeated by surrounding comments.
    const tipIdx = zsrc.indexOf('const tip =');
    const tipLine = tipIdx >= 0 ? zsrc.slice(tipIdx, zsrc.indexOf(';', tipIdx)) : '';
    truthy('F2.15 nag no longer says "非免费模型"', tipLine.length > 0 && !/由非免费模型生成/.test(tipLine),
        'that wording nagged every DeepSeek user; tip=' + fmt(tipLine.slice(0, 60)));
    truthy('F2.16 nag wording names the high-price tier', /高价档/.test(tipLine));
    truthy('F2.17 freeChars exported in result', /freeChars,/.test(zsrc));
    truthy('F2.18 cheapChars exported in result', /cheapChars,/.test(zsrc));
    truthy('F2.19 paidChars exported in result', /paidChars,/.test(zsrc));
    truthy('F2.20 degradedChars kept as paidChars alias for BC',
        /const\s+degradedChars\s*=\s*paidChars/.test(zsrc));
    truthy('F2.21 dead isFreeSrc helper removed', !/function\s+isFreeSrc/.test(zsrc));
}

// --- #3 probe button must not get stuck disabled ----------------------------
function suiteProbeButtonNotStuck() {
    section('#3 probe button cannot get permanently disabled');
    const src = readJs('src/modules/settingsCenter.js');
    const block = src.slice(src.indexOf("const aiKeyProbeBtn = overlay.querySelector('#scAiKeyProbe')"));

    const disabledIdx = block.indexOf('aiKeyProbeBtn.disabled = true');
    const tryIdx = block.indexOf('try {', disabledIdx);
    const healthIdx = block.indexOf('await getHealthApi()', disabledIdx);
    truthy('F3.1 probe button found', disabledIdx > 0);
    truthy('F3.2 try block opens after disabling', tryIdx > disabledIdx);
    truthy('F3.3 getHealthApi() is awaited INSIDE the try',
        healthIdx > tryIdx && healthIdx < block.indexOf('} finally', tryIdx),
        'otherwise a failed import skips the finally and bricks the button');
    truthy('F3.4 finally always re-enables', /finally\s*\{[^}]*aiKeyProbeBtn\.disabled\s*=\s*false/.test(block));
}

// --- #4 '⚠限流' badge must be reachable -------------------------------------
function suiteRatelimitBadgeReachable() {
    section('#4 ratelimit badge reachable');
    const src = readJs('src/modules/settingsCenter.js');
    const block = src.slice(src.indexOf('function verdictBadge(v)'));
    const fn = block.slice(0, block.indexOf('\n}'));

    const rlIdx = fn.indexOf("'ratelimit'");
    const okIdx = fn.indexOf('if (v.ok)');
    truthy('F4.1 ratelimit checked before the ok shortcut',
        rlIdx >= 0 && okIdx >= 0 && rlIdx < okIdx,
        '429 is ok:true, so an ok-first check makes ⚠限流 unreachable');
    truthy('F4.2 ratelimit returns the ⚠限流 badge', /ratelimit'\)\s*return\s*'⚠限流'/.test(fn));

    // Behavioural: reproduce the exact verdict shapes the probe emits.
    const hsrc = readJs('src/modules/aiKeyHealth.js');
    truthy('F4.3 ratelimit verdicts are ok:true',
        /const ok = kind === 'ratelimit'/.test(hsrc),
        'this is exactly why ok-first ordering was wrong');
}

// --- #5 dead quotaRisk branch removed ---------------------------------------
function suiteQuotaRiskDeadCode() {
    section('#5 quotaRisk dead branch removed');
    const hsrc = readJs('src/modules/aiKeyHealth.js');
    const fnStart = hsrc.indexOf('function quotaRiskOf(');
    const fn = hsrc.slice(fnStart, hsrc.indexOf('\n}', fnStart));
    truthy('F5.1 quotaRiskOf found', fnStart > 0);
    truthy('F5.2 no unreachable quota deduction',
        !/kind === 'quota'/.test(fn),
        'quota verdicts are ok:false and already gated to 0 by scoreEntry');
    truthy('F5.3 ratelimit deduction retained', /kind === 'ratelimit'/.test(fn));
    // The rationale lives in a comment, so check the RAW source for that one.
    const rawH = readSrc('src/modules/aiKeyHealth.js');
    const rawFn = rawH.slice(rawH.indexOf('function quotaRiskOf('), rawH.indexOf('\n}', rawH.indexOf('function quotaRiskOf(')));
    truthy('F5.4 rationale documented', /永不可达|死代码/.test(rawFn));
}

// --- #6 import hint derived from the registry -------------------------------
function suiteImportHintDerived() {
    section('#6 import-failure hint derived from registry');
    const src = readJs('src/modules/settingsCenter.js');
    truthy('F6.1 stale github_pat_ hint removed', !/github_pat_/.test(src),
        'no provider in the registry matches that prefix');

    const idx = src.indexOf('中未找到可识别的 API Key');
    const around = src.slice(Math.max(0, idx - 900), idx + 200);
    truthy('F6.2 hint is derived from PROVIDERS keyShape.hint', /PROVIDERS/.test(around) && /keyShape/.test(around) && /hint/.test(around));
    truthy('F6.3 derivation is failure-tolerant', /catch/.test(around));
}

// --- #7 no parallel double-run window ---------------------------------------
function suiteNoDoubleRun() {
    section('#7 no parallel double-run window');
    const src = readJs('src/modules/settingsCenter.js');
    const start = src.indexOf("const aiRunBtn = overlay.querySelector('#scAiRun')");
    const endMark = src.indexOf('// v1.2.1（问题6）：面板创建后异步加载 Key 列表并刷新下拉', start);
    const handler = src.slice(start, endMark > start ? endMark : src.length);
    truthy('F7.0 run handler delimited', handler.length > 1000, `len=${handler.length}`);

    const abortCheck = handler.indexOf('if (aiAbortCtrl) {');
    const controllerNew = handler.indexOf('aiAbortCtrl = new AbortController()');
    const firstAwait = handler.indexOf('await getKeyStoreApi()');
    truthy('F7.1 abort check present', abortCheck > 0);
    truthy('F7.2 controller created AFTER the abort check', controllerNew > abortCheck);
    truthy('F7.3 controller created BEFORE the first await',
        controllerNew > 0 && firstAwait > 0 && controllerNew < firstAwait,
        'otherwise a second click starts a parallel run during the probe');
    truthy('F7.4 exactly one AbortController creation in the handler',
        (handler.match(/aiAbortCtrl = new AbortController\(\)/g) || []).length === 1,
        'the old duplicate creation after the probe must be gone');
    truthy('F7.5 signal captured for downstream use', /const runSignal = aiAbortCtrl\.signal/.test(handler));
    truthy('F7.6 preparation phase wrapped so failures release the slot',
        /准备阶段/.test(handler) && /初始化失败/.test(handler));
    truthy('F7.7 probe receives the run signal', /probeKey\(effective, \{ signal: runSignal \}\)/.test(handler));
    truthy('F7.8 single endRun used by finally',
        /finally\s*\{\s*endRun\(\);\s*\}/.test(handler));
}

// --- #8 CSS/JS position agreement -------------------------------------------
function suiteClosingPositionConsistent() {
    section('#8 .closing position: CSS agrees with JS');
    const css = readCss('src/styles/strokeDemoModal.css');
    const js = readJs('src/modules/strokeDemoModal.js');

    const block = css.slice(css.indexOf('.sd-window.closing'));
    const decl = block.slice(0, block.indexOf('}'));
    truthy('F8.1 .closing declares position: fixed', /position:\s*fixed/.test(decl),
        'the ghost is appended to <body> and uses viewport coords');
    truthy('F8.2 no stale position: absolute in .closing', !/position:\s*absolute/.test(decl));
    truthy('F8.3 JS still sets position: fixed inline',
        /win\.style\.position\s*=\s*'fixed'/.test(js));
    // Documentation lives in a CSS comment, so check the RAW source here.
    const rawCss = readSrc('src/styles/strokeDemoModal.css');
    const rawBlock = rawCss.slice(rawCss.indexOf('.sd-window.closing'));
    truthy('F8.4 CSS/JS contradiction documented', /与 JS 不符|JS 语义一致/.test(rawBlock.slice(0, 800)));
}

// --- #9 .gitignore ----------------------------------------------------------
function suiteGitignore() {
    section('#9 .gitignore covers the Vite temp config bundle');
    const gi = readSrc('.gitignore');
    truthy('F9.1 vite.config.js.timestamp-*.mjs ignored',
        /vite\.config\.js\.timestamp-\*\.mjs/.test(gi));
}

// --- Bonus: contract/doc consistency ----------------------------------------
function suiteDocConsistency() {
    section('#10 docs match the shipped semantics');
    const cl = readSrc('CHANGELOG.md');
    const head = cl.slice(0, cl.indexOf('## v3.0.3'));
    truthy('F10.1 CHANGELOG documents the acceptance fixes', /独立验收后的修复/.test(head));
    truthy('F10.2 CHANGELOG no longer claims the false weight rationale',
        !/权重刻意让「JSON 稳定性 \+ 历史成功率（0\.50）」高于「免费（0\.30）」/.test(head));
    truthy('F10.3 CHANGELOG states the honest tradeoff', /诚实说明权重取舍/.test(head));
    truthy('F10.4 CHANGELOG documents the paid-only nag', /仅当 `paidChars > 0`/.test(head));
    truthy('F10.5 CHANGELOG .closing described as fixed', /\.closing` 立即脱离布局（`position: fixed`/.test(head));

    const contract = readSrc('docs/v304_升级方案与接口契约.md');
    truthy('F10.6 contract records the degradedChars revision', /degradedChars` 语义收窄/.test(contract));
    truthy('F10.7 contract records the sentinel-audit rule', /凡新增哨兵 option value/.test(contract));
}

// --- #11 user-supplied engines (agnes / ModelScope / APINEX) ----------------
// All metadata values below are MEASURED (curl + real Chromium fetch), not assumed.
//
// ⚠ The key constants are SHAPE-EQUIVALENT SYNTHETIC keys, not the real ones.
//   These assertions only exercise shape detection (detectProviderId / keyShape.test),
//   which depends purely on the pattern. Never commit real credentials to a test file.
const K_AGNES = 'sk-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2'; // generic sk- family
const K_APINEX = 'sk-apx' + '0123456789abcdef0123456789abcdef0123456789abcdef'; // 46 hex, unique
const K_MSSCOPE = 'ms-01234567-89ab-cdef-0123-456789abcdef'; // ms- + UUID, unique

function suiteUserSuppliedEngines() {
    section('#11 user-supplied engines registered with measured metadata');

    // --- existence + core config ---
    const agnes = P.getProvider('agnes');
    const ms = P.getProvider('modelscope');
    const apx = P.getProvider('apinex');
    truthy('G1.1 agnes registered', !!agnes);
    truthy('G1.2 modelscope registered', !!ms);
    truthy('G1.3 apinex registered', !!apx);

    eq('G1.4 agnes baseUrl (measured)', agnes && agnes.baseUrl, 'https://apihub.agnes-ai.com/v1');
    eq('G1.5 modelscope baseUrl (measured)', ms && ms.baseUrl, 'https://api-inference.modelscope.cn/v1');
    eq('G1.6 apinex baseUrl (measured)', apx && apx.baseUrl, 'https://api.apinex.bond/v1');
    eq('G1.7 all three use bearer auth',
        [agnes, ms, apx].map(p => p && p.authStyle), ['bearer', 'bearer', 'bearer']);

    // --- CORS verdicts: the whole point of a browser-only app ---
    eq('G2.1 agnes cors verified (ACAO:* on /models AND chat)', agnes && agnes.cors, 'verified');
    eq('G2.2 modelscope cors verified (ACAO:* on /models AND chat)', ms && ms.cors, 'verified');
    eq('G2.3 apinex cors FAILED (no ACAO on preflight or POST)', apx && apx.cors, 'failed');

    // --- /models auth-validation: only agnes can offer the zero-token fast path ---
    eq('G3.1 agnes /models validates auth (401 on bad key)', agnes && agnes.modelsPath, '/models');
    eq('G3.2 agnes modelsEndpointValidatesAuth true', agnes && agnes.modelsEndpointValidatesAuth, true);
    eq('G3.3 modelscope /models is public -> no fast path', ms && ms.modelsPath, null);
    eq('G3.4 modelscope modelsEndpointValidatesAuth false', ms && ms.modelsEndpointValidatesAuth, false);
    eq('G3.5 apinex has no usable /models', apx && apx.modelsPath, null);

    // --- key shape detection ---
    eq('G4.1 agnes sk- key is ambiguous (by design)', P.detectProviderId(K_AGNES), null,
        'sk- is shared with DeepSeek/Kimi/SiliconFlow/DashScope');
    eq('G4.2 agnes IS among the sk- candidates',
        P.PROVIDERS.filter(p => p.keyShape.test(K_AGNES)).map(p => p.id).includes('agnes'), true);
    eq('G4.3 apinex key uniquely detected', P.detectProviderId(K_APINEX), 'apinex');
    eq('G4.4 modelscope key uniquely detected', P.detectProviderId(K_MSSCOPE), 'modelscope');
    eq('G4.5 sk-apx excluded from the generic sk- test (exactly 1 match)',
        P.PROVIDERS.filter(p => p.keyShape.test(K_APINEX)).map(p => p.id), ['apinex']);
    eq('G4.6 ms- matches exactly one provider',
        P.PROVIDERS.filter(p => p.keyShape.test(K_MSSCOPE)).map(p => p.id), ['modelscope']);
    // The lenient import pattern must still catch the whole sk- family.
    truthy('G4.7 generic import pattern still covers sk-apx',
        /^sk-/.test(P.getProvider('apinex').keyShape.pattern));

    // --- tiers: the feature is "prefer free" ---
    eq('G5.1 agnes default model is free',
        agnes.models[0].tier, 'free');
    eq('G5.2 agnes default model is agnes-3.0-flash',
        agnes.models[0].id, 'agnes-3.0-flash');
    eq('G5.3 agnes default jsonMode verified true', agnes.models[0].jsonMode, true);
    eq('G5.4 modelscope models are all free',
        ms.models.every(m => m.tier === 'free'), true);
    eq('G5.5 modelscope default is Qwen/Qwen3.8-Flash-Next',
        ms.models[0].id, 'Qwen/Qwen3.8-Flash-Next');

    // --- measured-slowness flag + its effect on scoring ---
    eq('G6.1 modelscope default flagged slow (measured 102-122s/4 chars)',
        ms.models[0].slow, true);
    eq('G6.2 agnes default NOT flagged slow (measured 12.9s/4 chars)',
        !!agnes.models[0].slow, false);

    // scoreEntry must ignore the (meaningless) probe latency for a slow model.
    // Two identical verdicts differing ONLY in latency must score identically
    // when the model is flagged slow, and differently when it is not.
    const slowEntry = { id: 's1', key: K_MSSCOPE, providerId: 'modelscope' };
    const fastEntry = { id: 's2', key: K_AGNES, providerId: 'agnes' };
    const mk = (lat) => ({
        id: 'x', ok: true, kind: 'ok', code: 200, latencyMs: lat,
        jsonOk: true, free: true, providerId: null, modelId: null,
        message: '', checkedAt: Date.now()
    });
    const slowLow = H.scoreEntry(slowEntry, { ...mk(200), providerId: 'modelscope' });
    const slowHigh = H.scoreEntry(slowEntry, { ...mk(9000), providerId: 'modelscope' });
    approx('G6.3 slow model: latency no longer affects score', slowLow, slowHigh, 1e-9,
        `${slowLow} vs ${slowHigh}`);
    const fastLow = H.scoreEntry(fastEntry, { ...mk(200), providerId: 'agnes' });
    const fastHigh = H.scoreEntry(fastEntry, { ...mk(9000), providerId: 'agnes' });
    truthy('G6.4 normal model: latency still matters', fastLow > fastHigh,
        `${fastLow} vs ${fastHigh}`);

    // --- the two probe defects found by live testing ---
    const hsrc = readJs('src/modules/aiKeyHealth.js');
    const hraw = readSrc('src/modules/aiKeyHealth.js');
    truthy('G7.1a degenerate-200 downgrade guard present in code',
        /resp\.ok && !parsed\.valid && usedJson/.test(hsrc),
        'ModelScope returns 200 + {"choices":null} when response_format is unsupported');
    truthy('G7.1b rationale documented', /信号 2/.test(hraw));
    truthy('G7.2 signal 1 (400/422) retained', /resp\.status === 400 \|\| resp\.status === 422/.test(hsrc));
    truthy('G7.3 downgrade happens at most once per signal', /usedJson = false/.test(hsrc));
    truthy('G7.4 invalid body only reported after the retry',
        /if \(!parsed\.valid\)/.test(hsrc) && /降级重试后仍不是 chat completion/.test(hraw));

    truthy('G8.1 writeBackProvider syncs label', /k\.label !== lab/.test(hsrc));
    truthy('G8.2 writeBackProvider syncs type', /k\.type !== providerId/.test(hsrc));
    truthy('G8.3 providerLabel imported', /providerLabel/.test(hsrc.slice(0, hsrc.indexOf('const HEALTH_KEY'))));

    // --- apinex must not be able to win auto-selection ---
    const apxV = {
        id: 'a', ok: false, kind: 'unreachable', code: 0, latencyMs: 100,
        jsonOk: false, free: true, providerId: 'apinex', modelId: null,
        message: '', checkedAt: Date.now()
    };
    eq('G9.1 unreachable apinex scores 0', H.scoreEntry({ id: 'a', key: K_APINEX, providerId: 'apinex' }, apxV), 0);

    // --- G10. addKey must resolve the label from the registry, not the legacy prefix ---
    // Before this fix an sk-apx key was labelled "DeepSeek" — actively wrong, and since
    // that key can never pass a probe, writeBackProvider never corrected it.
    const mkStore = () => {
        localStorage.clear();
    };
    mkStore();
    const eApx = S.addKey({ key: K_APINEX });
    eq('G10.1 sk-apx addKey label is APINEX (not DeepSeek)', eApx.label, 'APINEX');
    eq('G10.2 sk-apx addKey type is apinex', eApx.type, 'apinex');
    eq('G10.3 sk-apx addKey sets providerId', eApx.providerId, 'apinex');

    mkStore();
    const eMs = S.addKey({ key: K_MSSCOPE });
    eq('G10.4 ms- addKey label is ModelScope 魔搭 (not 未知引擎)', eMs.label, 'ModelScope 魔搭');
    eq('G10.5 ms- addKey sets providerId', eMs.providerId, 'modelscope');

    // Legacy backward compatibility must be untouched for ambiguous sk- keys.
    mkStore();
    const eSk = S.addKey({ key: K_AGNES });
    eq('G10.6 ambiguous sk- still falls back to DeepSeek (BC)', eSk.label, 'DeepSeek');
    eq('G10.7 ambiguous sk- gets NO providerId (left for the probe)', eSk.providerId, undefined);

    // Explicit args must still win over shape detection (the write-back path relies on this).
    mkStore();
    const eExplicit = S.addKey({ key: K_AGNES, type: 'moonshot', label: '月之暗面 Kimi', providerId: 'moonshot' });
    eq('G10.8 explicit type/label/providerId override shape detection',
        [eExplicit.type, eExplicit.label, eExplicit.providerId], ['moonshot', '月之暗面 Kimi', 'moonshot']);

    mkStore();
    const eArk = S.addKey({ key: 'ark-' + 'a'.repeat(32) });
    eq('G10.9 ark- unchanged', [eArk.label, eArk.type, eArk.providerId], ['火山引擎豆包', 'volcano', 'volcano']);

    // detectKeyType (legacy export) must keep its old semantics — other callers depend on it.
    eq('G10.10 detectKeyType(sk-apx) still legacy deepseek', S.detectKeyType(K_APINEX), 'deepseek',
        'legacy export must not change; only addKey uses the registry');
    eq('G10.11 detectKeyType(ms-) still legacy unknown', S.detectKeyType(K_MSSCOPE), 'unknown');
}


async function main() {
    console.log('='.repeat(78));
    console.log('verify-v304-acceptance.cjs — post-acceptance fix regression suite');
    console.log('='.repeat(78));

    await loadModules();

    suiteCopyAutoSentinel();
    suitePaidOnlyNag();
    suiteProbeButtonNotStuck();
    suiteRatelimitBadgeReachable();
    suiteQuotaRiskDeadCode();
    suiteImportHintDerived();
    suiteNoDoubleRun();
    suiteClosingPositionConsistent();
    suiteGitignore();
    suiteDocConsistency();
    suiteUserSuppliedEngines();

    console.log('\n' + '='.repeat(78));
    for (const r of rows) {
        const tag = r.pass ? 'PASS' : 'FAIL';
        console.log(`[${tag}] ${r.name}`);
        console.log(`        observed: ${r.actual}`);
        if (!r.pass || process.env.VERBOSE) console.log(`        expected: ${r.expected}`);
        if (r.note) console.log(`        note:     ${r.note}`);
    }

    console.log('\n' + '='.repeat(78));
    console.log(`SUMMARY: ${nPass} passed, ${nFail} failed, ${rows.length} total`);
    if (nFail > 0) {
        console.log('\nFAILED ASSERTIONS:');
        rows.filter(r => !r.pass).forEach(r => {
            console.log(`  - ${r.name}\n      observed: ${r.actual}\n      expected: ${r.expected}`);
        });
    }
    console.log('='.repeat(78));

    process.exitCode = nFail > 0 ? 1 : 0;
}

main().catch(e => {
    console.error('HARNESS CRASH:', e && e.stack ? e.stack : e);
    process.exitCode = 2;
});
