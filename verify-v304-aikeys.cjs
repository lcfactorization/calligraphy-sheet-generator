#!/usr/bin/env node
/**
 * verify-v304-aikeys.cjs — independent verification of the v3.0.4 AI API-key subsystem.
 *
 * Run:  node verify-v304-aikeys.cjs
 * No network. No real API key. Only Node built-ins.
 *
 * Strategy: stub the browser globals (localStorage / navigator / fetch) BEFORE importing
 * the ESM modules, then drive every branch with a programmable fetch stub.
 */
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

// ===========================================================================
// 1. Browser global stubs
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

// Node 22 defines read-only `navigator` / possibly `localStorage` getters on globalThis,
// so plain assignment throws. Override with defineProperty.
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
        body: init && init.body ? String(init.body) : null,
        headers: (init && init.headers) || {}
    };
    fetchLog.push(rec);
    return fetchHandler(rec.url, init, rec);
};

// Canned HTTP response factory.
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

function resetEnv() {
    localStorage.clear();
    navigator.onLine = true;
    fetchLog = [];
    fetchHandler = async () => { throw new Error('no fetch handler installed'); };
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
    if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 57) + '...' : v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try { const s = JSON.stringify(v); return s && s.length > 90 ? s.slice(0, 87) + '...' : String(s); }
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
    const p = typeof actual === 'number' && Math.abs(actual - expected) <= (eps || 1e-9);
    record(name, p, actual, expected, note);
    return p;
}

function verifierShape(name, v) {
    const need = ['id', 'ok', 'code', 'kind', 'latencyMs', 'jsonOk', 'free', 'modelId', 'message', 'checkedAt'];
    const missing = need.filter(k => !(k in (v || {})));
    record(name, missing.length === 0, missing.length ? 'missing: ' + missing.join(',') : 'all fields present',
        'all fields present');
}

const KINDS = new Set(['ok', 'auth', 'quota', 'ratelimit', 'model', 'unreachable', 'unsupported', 'unknown']);

// ===========================================================================
// 3. Import modules under test (after stubs are installed)
// ===========================================================================

const SRC = path.join(__dirname, 'src', 'modules');
const urlOf = (f) => pathToFileURL(path.join(SRC, f)).href;

let P, H, S, I, Z;
let ZUCI_LOAD_ERROR = null;

async function loadModules() {
    P = await import(urlOf('aiProviders.js'));
    H = await import(urlOf('aiKeyHealth.js'));
    S = await import(urlOf('aiKeyStore.js'));
    I = await import(urlOf('aiKeyImporter.js'));
    try {
        Z = await import(urlOf('aiZuci.js'));
    } catch (e) {
        ZUCI_LOAD_ERROR = e && e.message ? e.message : String(e);
    }
}

// ===========================================================================
// 4. Tests
// ===========================================================================

const SK = 'sk-abcdefghijklmnopqrstuvwx1234';           // generic sk-, 28 body chars
const SK_OR = 'sk-or-v1-abcdefghijklmnopqrstuvwx1234';  // openrouter
const ARK = 'ark-abcdefghijklmnopqrstuvwx1234';
const GSK = 'gsk_ABCDEFGHIJKLMNOPQRSTUVWX1234';
const GEM = 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456';
const GHP = 'github_pat_ABCDEFGHIJKLMNOPQRSTUVWX0123456789';
const HEX32 = '0123456789abcdef0123456789abcdef';

async function testProviders() {
    resetEnv();
    eq('A1 detectProviderId(sk- generic)', P.detectProviderId(SK), null,
        'ambiguous: deepseek/moonshot/siliconflow/dashscope all share sk-');
    eq('A2 detectProviderId(sk-or-v1-)', P.detectProviderId(SK_OR), 'openrouter',
        'OpenRouter must win the ordering check');
    eq('A3 detectProviderId(ark-)', P.detectProviderId(ARK), 'volcano');
    eq('A4 detectProviderId(gsk_)', P.detectProviderId(GSK), 'groq');
    eq('A5 detectProviderId(AIzaSy)', P.detectProviderId(GEM), 'gemini');
    eq('A6 detectProviderId(github_pat_)', P.detectProviderId(GHP), null, 'not in registry');
    eq('A7 detectProviderId(32-hex)', P.detectProviderId(HEX32), null,
        'zhipu shape is <32hex>.<secret>, a bare hex must NOT match');
    eq('A8 detectProviderId("")', P.detectProviderId(''), null);
    eq('A9 detectProviderId(null)', P.detectProviderId(null), null);
    eq('A10 detectProviderId(12345 non-string)', P.detectProviderId(12345), null);

    eq('A11 detectApiKeyType(sk-) legacy', P.detectApiKeyType(SK), 'deepseek');
    eq('A12 detectApiKeyType(ark-) legacy', P.detectApiKeyType(ARK), 'volcano');
    eq('A13 detectApiKeyType(gsk_) legacy', P.detectApiKeyType(GSK), 'unknown');
    eq('A14 detectApiKeyType(null) legacy', P.detectApiKeyType(null), 'unknown');
    eq('A15 detectProviderId(zhipu 32hex.secret)', P.detectProviderId(HEX32 + '.abcdefghijklmnop'), 'zhipu');

    eq('B1 resolveProviderId(sk-) legacy fallback', P.resolveProviderId(SK), 'deepseek',
        'must fall back for BC even though detectProviderId is null');
    eq('B2 resolveProviderId(sk-or-v1-)', P.resolveProviderId(SK_OR), 'openrouter');
    eq('B3 resolveProviderId(ark-)', P.resolveProviderId(ARK), 'volcano');
    eq('B4 resolveProviderId(gsk_)', P.resolveProviderId(GSK), 'groq');
    eq('B5 resolveProviderId(AIzaSy)', P.resolveProviderId(GEM), 'gemini');
    eq('B6 resolveProviderId(github_pat_)', P.resolveProviderId(GHP), null);
    eq('B7 resolveProviderId(32-hex)', P.resolveProviderId(HEX32), null);
    eq('B8 resolveProviderId("")', P.resolveProviderId(''), null);
    eq('B9 resolveProviderId(null)', P.resolveProviderId(null), null);
    eq('B10 resolveProviderId(sk-, explicit moonshot)', P.resolveProviderId(SK, 'moonshot'), 'moonshot');
    eq('B11 resolveProviderId(sk-, explicit bogus)', P.resolveProviderId(SK, 'nope'), 'deepseek',
        'invalid explicit id must fall through to shape/legacy');
    eq('B12 getProvider(nope)', P.getProvider('nope'), null);
    eq('B13 providerLabel(nope)', P.providerLabel('nope'), '未知引擎');
}

async function testRegistry() {
    resetEnv();
    const ids = P.PROVIDERS.map(p => p.id);
    const specIds = ['deepseek', 'volcano', 'zhipu', 'moonshot', 'siliconflow', 'dashscope',
        'openrouter', 'minimax', 'stepfun', 'qianfan', 'hunyuan', 'gemini', 'groq'];
    const missing = specIds.filter(x => !ids.includes(x));
    eq('P1 all 13 spec engines present', missing, []);
    eq('P2 no duplicate provider ids', ids.length, new Set(ids).size);
    truthy('P3 xunfei/spark NOT present (CORS-unusable)',
        !ids.some(x => /spark|xunfei|xfyun/i.test(x)));

    const or = P.getProvider('openrouter');
    eq('P4 openrouter.modelsEndpointValidatesAuth === false', or.modelsEndpointValidatesAuth, false,
        'contract: /models is public, cannot validate a key');
    eq('P5 openrouter.modelsPath', or.modelsPath, '/models');
    eq('P6 gemini.cors !== verified', P.getProvider('gemini').cors, 'unverified');
    eq('P7 groq.cors !== verified', P.getProvider('groq').cors, 'unverified');
    eq('P8 volcano.modelsPath === null', P.getProvider('volcano').modelsPath, null);
    eq('P9 deepseek.baseUrl', P.getProvider('deepseek').baseUrl, 'https://api.deepseek.com');
    eq('P10 dashscope.baseUrl', P.getProvider('dashscope').baseUrl,
        'https://dashscope.aliyuncs.com/compatible-mode/v1');
    eq('P11 moonshot.baseUrl', P.getProvider('moonshot').baseUrl, 'https://api.moonshot.cn/v1');
    eq('P12 minimax.modelsPath === null', P.getProvider('minimax').modelsPath, null);

    const badTier = P.PROVIDERS.flatMap(p => (p.models || [])
        .filter(m => !['free', 'cheap', 'paid'].includes(m.tier))
        .map(m => p.id + ':' + m.id + '=' + m.tier));
    eq('P13 all model tiers in enum', badTier, []);
    const noSignup = P.PROVIDERS.filter(p => !p.signupUrl || !p.note || typeof p.priority !== 'number').map(p => p.id);
    eq('P14 every provider has signupUrl+note+priority', noSignup, []);

    // Contract §3.2: modelsEndpointValidatesAuth=true requires modelsPath != null to be meaningful.
    const uselessFlag = P.PROVIDERS.filter(p => !p.modelsPath && p.modelsEndpointValidatesAuth === true).map(p => p.id);
    record('P15 flag validatesAuth=true but modelsPath=null (inconsistent)', uselessFlag.length === 0,
        uselessFlag, [], 'harmless but contradicts the intent of the flag');

    // Keys that can never be auto-detected (test:()=>false and no pattern).
    const undetectable = P.PROVIDERS.filter(p => p.keyShape && typeof p.keyShape.test === 'function'
        && p.keyShape.test('probe-key-value-1234567890') === false && !p.keyShape.pattern).map(p => p.id);
    record('P16 engines with no detectable shape (expected: stepfun, hunyuan)', true,
        undetectable, 'informational');

    // Confirm the sk-or-v1 ordering explicitly via a direct shape probe.
    const skMatches = P.PROVIDERS.filter(p => p.keyShape.test(SK_OR)).map(p => p.id);
    eq('P17 sk-or-v1- matches exactly one provider', skMatches, ['openrouter']);
    const skGenericMatches = P.PROVIDERS.filter(p => p.keyShape.test(SK)).map(p => p.id);
    truthy('P18 generic sk- matches >1 provider (ambiguity is real)', skGenericMatches.length > 1,
        'matched: ' + skGenericMatches.join(','));
}

// --- C: candidate auto-resolution (the heart of the change) ---
function installAutoResolveFetch() {
    fetchHandler = async (url, init) => {
        const m = String((init && init.method) || 'GET').toUpperCase();
        if (url.includes('api.deepseek.com')) return resp(401, { error: 'invalid key' });
        if (url.includes('api.moonshot.cn')) return resp(401, { error: 'invalid key' });
        if (url.includes('api.siliconflow.cn')) return resp(401, { error: 'invalid key' });
        if (url.includes('dashscope.aliyuncs.com')) {
            if (url.endsWith('/models')) return resp(200, { data: [] });
            if (m === 'POST') return resp(200, GOOD_CHAT);
        }
        throw new Error('unexpected fetch: ' + m + ' ' + url);
    };
}

/**
 * 让 DeepSeek 对 chat 探测返回 429（按分类算 ok:true），其余引擎本可接受该 Key 但永不被触及。
 * 提到模块作用域：C11 与 C12 分属两个子进程分组，都要用同一份 fetch 剧本。
 */
function installRateLimitedDeepseek() {
    fetchHandler = async (url, init) => {
        if (url.includes('api.deepseek.com')) {
            if (url.endsWith('/models')) return resp(200, { data: [] });
            return resp(429, { error: 'rate limited' }); // ok:true per classification
        }
        if (url.includes('dashscope.aliyuncs.com')) {
            if (url.endsWith('/models')) return resp(200, { data: [] });
            return resp(200, GOOD_CHAT);
        }
        if (url.includes('/models')) return resp(401, {});
        return resp(401, {});
    };
}

async function testAutoResolution() {
    resetEnv();
    installAutoResolveFetch();
    const v = await H.probeKey({ id: 'k1', key: SK });

    eq('C1a probeKey ok', v.ok, true);
    eq('C1b probeKey providerId === dashscope', v.providerId, 'dashscope',
        'auto-disambiguated a generic sk- key to the only 200 responder');
    eq('C1c probeKey kind', v.kind, 'ok');
    truthy('C1d message names dashscope', String(v.message).includes('阿里云百炼') || String(v.message).includes('qwen'),
        'message=' + v.message);
    verifierShape('C1e Verdict shape complete', v);

    const posts = fetchLog.filter(r => r.method === 'POST');
    const gets = fetchLog.filter(r => r.method === 'GET');
    eq('C2 total fetch calls === 5 (4 GET /models + 1 POST)', fetchLog.length, 5);
    eq('C3 GET /models calls === 4', gets.length, 4);
    eq('C4 exactly one POST', posts.length, 1);
    truthy('C5 the only POST went to the winner (dashscope)',
        posts[0] && posts[0].url.includes('dashscope.aliyuncs.com'), posts[0] && posts[0].url);
    const loserPosts = posts.filter(r => !r.url.includes('dashscope.aliyuncs.com'));
    eq('C6 losers made ZERO chat/completions POSTs (zero-token losers)', loserPosts.length, 0,
        'DeepSeek/Moonshot/SiliconFlow must be rejected at the /models fast path');
    truthy('C7 all 4 losers/winner probed /models first',
        gets.every(r => r.url.endsWith('/models')), gets.map(r => r.url));

    // Explicit providerId must pin a single candidate (no probing of others).
    resetEnv();
    installAutoResolveFetch();
    const v2 = await H.probeKey({ id: 'k1', key: SK, providerId: 'moonshot' });
    eq('C8 explicit providerId pins candidate (moonshot, 401)', v2.kind, 'auth');
    eq('C9 explicit providerId => only 1 fetch (no /models for others)', fetchLog.length, 1);
    eq('C10 explicit providerId preserved in verdict', v2.providerId, 'moonshot');

    // Adversarial: an EARLIER candidate returning 429 (ok:true) short-circuits the loop,
    // so a rate-limited ambiguous sk- key is permanently attributed to the wrong engine.
    resetEnv();
    installRateLimitedDeepseek();
    const v429 = await H.probeKey({ id: 'k1', key: SK });
    const reachedDashscope = fetchLog.some(r => r.url.includes('dashscope'));
    record('C11 429 from the FIRST candidate short-circuits ambiguity resolution',
        v429.providerId !== 'deepseek', { providerId: v429.providerId, ok: v429.ok, reachedDashscope },
        'should keep probing other candidates before attributing the key',
        'regression guard (was failing pre-fix): a rate-limited key must not be attributed to the first candidate');

}

// --- C12: 探测成功后把**正确**的引擎回写进 store ---
// 单独成组：需要「先往磁盘塞旧明文 ai_api_keys，再让 aiKeyStore 首次加载并迁移」，
// 而 store 的加载是一次性闩死的（见 Runner 处说明），组内无法二次重置。
async function testWritebackAmbiguous() {
    resetEnv();
    installRateLimitedDeepseek();
    localStorage.setItem('ai_api_keys', JSON.stringify([
        { id: 'k1', type: 'deepseek', key: SK, label: 'DeepSeek', createdAt: 1 }
    ]));
    await H.probeAll([{ id: 'k1', key: SK }]);
    // v3.0.6：回写不再直接改明文键，而是走 store 的 setKeyProviderRaw/setKeyModel。
    //   memory 模式下磁盘上**不应该**再有任何明文 Key —— 这本身就是被测的安全属性。
    const wb = S.getAllKeys();
    record('C12 probeAll writes the mis-attributed providerId back to the store',
        !wb[0] || wb[0].providerId !== 'deepseek', { providerId: wb[0] && wb[0].providerId }, 'not deepseek',
        'regression guard (was failing pre-fix): probeAll must persist the CORRECT engine');
    eq('C12b memory mode leaves no plaintext key list on disk', localStorage.getItem('ai_api_keys'), null,
        'security property of the v1.3.0 storage model: 明文迁移后必须删除磁盘副本');
}

// --- D: probeKey never throws ---
async function testNeverThrows() {
    resetEnv();
    fetchHandler = async () => { throw new TypeError('Failed to fetch'); };
    const v1 = await H.probeKey({ id: 'd1', key: SK });
    eq('D1a TypeError -> ok false', v1.ok, false);
    eq('D1b TypeError -> kind unreachable', v1.kind, 'unreachable');
    eq('D1c TypeError -> code 0', v1.code, 0);
    verifierShape('D1d Verdict shape', v1);

    resetEnv();
    fetchHandler = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    const v2 = await H.probeKey({ id: 'd2', key: SK });
    eq('D2a AbortError -> ok false', v2.ok, false);
    eq('D2b AbortError -> kind unreachable', v2.kind, 'unreachable');
    truthy('D2c AbortError message mentions timeout', String(v2.message).includes('超时'), v2.message);

    resetEnv();
    fetchHandler = async () => ({}); // malformed response object: no .ok, no .status
    const v3 = await H.probeKey({ id: 'd3', key: SK });
    eq('D3a malformed response -> ok false', v3.ok, false);
    eq('D3b malformed response -> kind unknown', v3.kind, 'unknown');

    // Adversarial: HTTP 200 whose body is NOT an OpenAI chat completion.
    resetEnv();
    fetchHandler = async (url, init) => {
        if (String(init.method).toUpperCase() === 'GET') return resp(401, {});
        return resp(200, { totally: 'not a chat completion' });
    };
    const v4 = await H.probeKey({ id: 'd4', key: SK, providerId: 'volcano' });
    record('D4 200 with non-chat body is accepted as ok:true (jsonOk:false) — task expects ok:false',
        v4.ok === false, { ok: v4.ok, kind: v4.kind, jsonOk: v4.jsonOk }, { ok: false },
        'regression guard (was failing pre-fix): a 200 body that is not a chat completion must be rejected');
    verifierShape('D5 all probes returned a Verdict object', v1);

    resetEnv();
    const v5 = await H.probeKey(null);
    eq('D6 probeKey(null) -> unsupported, no throw', v5.kind, 'unsupported');
    const v6 = await H.probeKey({ id: 'x', key: '   ' });
    eq('D7 probeKey(blank key) -> unsupported', v6.kind, 'unsupported');
    eq('D8 no fetch for unsupported', fetchLog.length, 0);
}

// --- E: error classification ---
async function classifyCase(status, extra) {
    resetEnv();
    fetchHandler = async (url, init) => {
        if (extra && extra.throwNetwork) throw new TypeError('Failed to fetch');
        return resp(status, { error: 'x' }, extra || {});
    };
    return H.probeKey({ id: 'e', key: ARK, providerId: 'volcano' });
}

async function testClassification() {
    const cases = [
        [401, 'auth', false], [402, 'quota', false], [403, 'quota', false],
        [404, 'model', false], [429, 'ratelimit', true], [500, 'unknown', false]
    ];
    for (const [status, kind, ok] of cases) {
        const v = await classifyCase(status);
        eq(`E${status} HTTP ${status} -> kind ${kind}`, v.kind, kind);
        eq(`E${status}b HTTP ${status} -> ok ${ok}`, v.ok, ok);
        truthy(`E${status}c kind is a legal enum value`, KINDS.has(v.kind), v.kind);
    }
    const vNet = await classifyCase(0, { throwNetwork: true });
    eq('E900 network throw -> kind unreachable', vNet.kind, 'unreachable');
    eq('E901 network throw -> ok false', vNet.ok, false);
    truthy('E902 unreachable message mentions CORS/跨域',
        String(vNet.message).includes('跨域') || String(vNet.message).includes('CORS'), vNet.message);
    truthy('E903 429 message is not a hard failure', String((await classifyCase(429)).message).includes('可用'),
        'ratelimit must not read as unusable');
}

// --- F: response_format downgrade ---
async function testJsonDowngrade() {
    resetEnv();
    let post = 0;
    fetchHandler = async (url, init) => {
        if (String(init.method).toUpperCase() !== 'POST') return resp(200, { data: [] });
        post++;
        if (post === 1) return resp(400, { error: 'x' }, { text: 'response_format is not supported by this model' });
        return resp(200, GOOD_CHAT);
    };
    const v = await H.probeKey({ id: 'f', key: ARK, providerId: 'volcano' });
    eq('F1 downgrade -> ok true', v.ok, true);
    eq('F2 downgrade -> jsonOk false', v.jsonOk, false);
    eq('F3 exactly 2 POSTs (original + retry)', post, 2);
    const b0 = JSON.parse(fetchLog[0].body);
    const b1 = JSON.parse(fetchLog[1].body);
    truthy('F4 first attempt carried response_format', !!b0.response_format, b0.response_format);
    truthy('F5 retry dropped response_format', !('response_format' in b1), Object.keys(b1).join(','));
    eq('F6 retry kept model/messages/max_tokens', [b1.model, b1.max_tokens, b1.messages.length],
        [b0.model, b0.max_tokens, b0.messages.length]);

    resetEnv();
    let post2 = 0;
    fetchHandler = async (url, init) => {
        if (String(init.method).toUpperCase() !== 'POST') return resp(200, { data: [] });
        post2++;
        return resp(400, { error: 'bad' }, { text: 'temperature out of range' });
    };
    const v2 = await H.probeKey({ id: 'f2', key: ARK, providerId: 'volcano' });
    eq('F7 unrelated 400 is NOT retried (1 POST)', post2, 1);
    eq('F8 unrelated 400 -> ok false', v2.ok, false);
    eq('F9 unrelated 400 -> kind unknown', v2.kind, 'unknown');
}

// --- G: offline ---
async function testOffline() {
    resetEnv();
    const stored = {
        k1: {
            id: 'k1', ok: true, code: 200, kind: 'ok', latencyMs: 7, jsonOk: true,
            free: false, modelId: 'm', message: 'prior', checkedAt: Date.now(), hist: [true]
        }
    };
    localStorage.setItem('ai_key_health_v1', JSON.stringify(stored));
    navigator.onLine = false;

    const v = await H.probeKey({ id: 'k1', key: SK });
    eq('G1 offline -> kind unreachable', v.kind, 'unreachable');
    eq('G2 offline -> code 0', v.code, 0);
    eq('G3 offline -> zero fetch calls', fetchLog.length, 0);
    const after = JSON.parse(localStorage.getItem('ai_key_health_v1'));
    eq('G4 offline did NOT overwrite the stored verdict', after, stored,
        'spec constraint #9: offline must skip probing AND preserve prior verdicts');

    navigator.onLine = true;
}

// --- H: probeAll ---
async function testProbeAll() {
    resetEnv();
    localStorage.setItem('ai_api_keys', JSON.stringify([
        { id: 'k1', type: 'deepseek', key: SK, label: 'DeepSeek', createdAt: 1 }
    ]));
    installAutoResolveFetch();
    const progress = [];
    const out = await H.probeAll([{ id: 'k1', key: SK }], { onProgress: p => progress.push(p) });

    eq('H1 probeAll returns 1 verdict', out.length, 1);
    // v3.0.6：回写走 store（setKeyProviderRaw / setKeyModel），不再直接改明文键。
    //   memory 模式下磁盘上不该出现任何 Key —— 这本身也是被测的安全属性。
    const after = S.getAllKeys();
    eq('H2 probeAll wrote providerId back into the store', (after[0] || {}).providerId, 'dashscope',
        'claimed feature: successful probe back-fills the engine');
    eq('H3 probeAll wrote modelId back', (after[0] || {}).modelId, 'qwen-turbo');
    eq('H3b memory mode leaves no plaintext key list on disk', localStorage.getItem('ai_api_keys'), null,
        'security property of the v1.3.0 storage model');
    eq('H4 onProgress fired once', progress.length, 1);
    eq('H5 onProgress payload', [progress[0].done, progress[0].total, progress[0].id, progress[0].ok],
        [1, 1, 'k1', true]);

    // Isolation: one throwing key must not sink the rest.
    resetEnv();
    let call = 0;
    fetchHandler = async (url, init) => {
        call++;
        if (call <= 1) throw new TypeError('Failed to fetch');
        return resp(200, GOOD_CHAT);
    };
    const out2 = await H.probeAll([
        { id: 'bad', key: SK, providerId: 'volcano' },
        { id: 'good', key: ARK, providerId: 'volcano' }
    ]);
    eq('H6 probeAll isolated a throwing key (2 results)', out2.length, 2);
    eq('H7 first key failed', [out2[0].id, out2[0].ok, out2[0].kind], ['bad', false, 'unreachable']);
    eq('H8 second key still succeeded', [out2[1].id, out2[1].ok], ['good', true]);

    resetEnv();
    eq('H9 probeAll([]) -> []', await H.probeAll([]), []);
    eq('H10 probeAll(non-array) -> []', await H.probeAll(null), []);
}

// --- I: scoring ---
async function testScoring() {
    resetEnv();
    const freeFast = { id: 's1', key: 'sk-x', providerId: 'siliconflow' };
    const paidSlow = { id: 's2', key: 'ark-x', providerId: 'volcano', modelId: 'doubao-seed-2-1-turbo-260628' };
    const vFreeFast = { id: 's1', ok: true, kind: 'ok', code: 200, latencyMs: 0, jsonOk: true, free: true, providerId: 'siliconflow', hist: [true], checkedAt: Date.now() };
    const vPaidSlow = { id: 's2', ok: true, kind: 'ok', code: 200, latencyMs: 2500, jsonOk: true, free: false, providerId: 'volcano', hist: [true], checkedAt: Date.now() };

    eq('I1 scoreEntry(entry, null) === 0 exactly', H.scoreEntry(freeFast, null), 0);
    eq('I2 scoreEntry(entry, {ok:false}) === 0 exactly', H.scoreEntry(freeFast, { ok: false }), 0);
    eq('I3 scoreEntry(entry, undefined) === 0', H.scoreEntry(freeFast, undefined), 0);
    eq('I4 scoreEntry(null, verdict) === 0', H.scoreEntry(null, vFreeFast), 0);

    const sFree = H.scoreEntry(freeFast, vFreeFast);
    const sPaid = H.scoreEntry(paidSlow, vPaidSlow);
    truthy('I5 free+fast+json-ok+stable > paid+slow', sFree > sPaid, `free=${sFree} paid=${sPaid}`);

    // Exact documented formula: 0.30*freeScore + 0.20*speed + 0.25*json + 0.25*stability - quotaRisk
    // freeScore is NORMALISED to 0..1 (free=1 / cheap=1/3 / paid=0). deepseek's default model
    // (deepseek-v4-flash) is tier 'cheap', so freeScore = 1/3 — NOT 1. The old test hardcoded 1
    // from the retired 0..3 scale, which also contradicted J3 (see report).
    const vMix = { id: 's3', ok: true, kind: 'ok', code: 200, latencyMs: 1500, jsonOk: true, free: false, providerId: 'deepseek', hist: [true, false], checkedAt: Date.now() };
    const expFree = 1 / 3, expSpeed = 1 - 1500 / 3000, expJson = 1, expStab = 0.5;
    const expected = 0.30 * expFree + 0.20 * expSpeed + 0.25 * expJson + 0.25 * expStab; // = 0.575
    approx('I6 exact formula (cheap normalised to 1/3, 1500ms, json ok, hist 50%)',
        H.scoreEntry({ id: 's3', key: 'sk-x', providerId: 'deepseek' }, vMix), expected, 1e-9);

    // Normalisation invariant — isolates the freeScore term with an identical verdict for all
    // three tiers, so the assertion is about the tier scale itself, not a magic total.
    const vTier = { id: 't', ok: true, kind: 'ok', code: 200, latencyMs: 0, jsonOk: true, free: false, hist: [true], checkedAt: Date.now() };
    const sFreeT = H.scoreEntry({ id: 't', key: 'sk-x', providerId: 'siliconflow' }, vTier);
    const sCheapT = H.scoreEntry({ id: 't', key: 'sk-x', providerId: 'deepseek' }, vTier);
    const sPaidT = H.scoreEntry({ id: 't', key: 'ark-x', providerId: 'volcano', modelId: 'doubao-seed-2-1-turbo-260628' }, vTier);
    approx('I6b freeScore normalisation: free - cheap === 0.30*(1 - 1/3)', sFreeT - sCheapT, 0.30 * (1 - 1 / 3), 1e-9);
    approx('I6c freeScore normalisation: cheap - paid === 0.30*(1/3)', sCheapT - sPaidT, 0.30 * (1 / 3), 1e-9);
    approx('I6d freeScore normalisation: free - paid === 0.30 (bounded, no longer 0.90)', sFreeT - sPaidT, 0.30, 1e-9);

    // --- I7: the CORRECTED §3.3 contract (freeScore normalised 0..1) ---
    // Reference orderings, all fast (latency 0), stable (hist [true]) unless noted:
    //   free+jsonOk(1.000) > free+json-degraded(0.875) > cheap+jsonOk(0.800) > paid+jsonOk(0.700)
    const vFast = (over) => Object.assign({ ok: true, kind: 'ok', code: 200, latencyMs: 0, jsonOk: true, hist: [true], checkedAt: Date.now() }, over || {});
    const eFree = { id: 's4', key: 'sk-x', providerId: 'siliconflow' };                                        // tier free
    const eCheap = { id: 's6', key: 'sk-x', providerId: 'deepseek' };                                          // tier cheap
    const ePaid = { id: 's5', key: 'ark-x', providerId: 'volcano', modelId: 'doubao-seed-2-1-turbo-260628' };  // tier paid
    const sFreeJsonOk = H.scoreEntry(eFree, vFast({ jsonOk: true }));
    const sFreeJsonDeg = H.scoreEntry(eFree, vFast({ jsonOk: false }));
    const sCheapJsonOk = H.scoreEntry(eCheap, vFast({ jsonOk: true }));
    const sPaidJsonOk = H.scoreEntry(ePaid, vFast({ jsonOk: true }));
    record('I7 corrected ordering: free+jsonOk > free+json-degraded > cheap+jsonOk > paid+jsonOk',
        sFreeJsonOk > sFreeJsonDeg && sFreeJsonDeg > sCheapJsonOk && sCheapJsonOk > sPaidJsonOk,
        { freeJsonOk: sFreeJsonOk, freeJsonDeg: sFreeJsonDeg, cheapJsonOk: sCheapJsonOk, paidJsonOk: sPaidJsonOk },
        'strictly decreasing 1.000 > 0.875 > 0.800 > 0.700',
        'free-but-json-degraded beating paid-but-perfect is DELIBERATE: the degraded key still works (response_format dropped)');
    approx('I7a free+jsonOk exact', sFreeJsonOk, 1.000, 1e-9);
    approx('I7b free+json-degraded exact', sFreeJsonDeg, 0.875, 1e-9);
    approx('I7c cheap+jsonOk exact', sCheapJsonOk, 0.800, 1e-9);
    approx('I7d paid+jsonOk exact', sPaidJsonOk, 0.700, 1e-9);

    // Companion — the thing that actually matters: a key that is BOTH json-degraded AND
    // stability-degraded must lose to a paid key with jsonOk + perfect stability.
    // Math: free+json0.5+s < paid+json1+perfect  ⇔  0.625 + 0.25*s < 0.70  ⇔  s < 0.30.
    // An ok:true verdict always ends its hist with true, so the realistic floor is
    // 1/HISTORY_MAX = 0.1 (nine prior failures). Both the realistic floor and the
    // theoretical floor 0 are checked.
    const sFreeBadRealistic = H.scoreEntry(eFree, vFast({ jsonOk: false, hist: [false, false, false, false, false, false, false, false, false, true] })); // stab 0.1 -> 0.650
    const sFreeBadFloor = H.scoreEntry(eFree, vFast({ jsonOk: false, hist: [false, false, false, false, false, false, false, false, false, false] }));      // stab 0   -> 0.625
    record('I7e free+json-degraded+stability-degraded (realistic hist 1/10) < paid+jsonOk+perfect',
        sFreeBadRealistic < sPaidJsonOk, { freeBad: sFreeBadRealistic, paidPerfect: sPaidJsonOk },
        'freeBad < paidPerfect', 'crossover requires stability < 0.30; at 1/10 the 0.30 free bonus no longer dominates');
    record('I7f free+json-degraded+stability-floor (theoretical) < paid+jsonOk+perfect',
        sFreeBadFloor < sPaidJsonOk, { freeBad: sFreeBadFloor, paidPerfect: sPaidJsonOk },
        'freeBad < paidPerfect', 'json floor 0.5 caps the real combined swing at 0.375 (spec loosely says 0.50)');
    // Documented boundary (not a defect): at MODERATE stability degradation (hist 50%) the free
    // key still wins 0.750 > 0.700. That is the deliberate "prefer free, good-enough keys" trade-off.
    const sFreeBadModerate = H.scoreEntry(eFree, vFast({ jsonOk: false, hist: [true, false] })); // stab 0.5 -> 0.750
    record('I7g free+json-degraded+stability-50% still beats paid+jsonOk+perfect (deliberate)',
        sFreeBadModerate > sPaidJsonOk, { freeBad: sFreeBadModerate, paidPerfect: sPaidJsonOk },
        'freeBad > paidPerfect', 'crossover is exactly stability < 0.30; documented as intended behaviour');

    // jsonScore==0 (documented "JSON unparseable") is unreachable: jsonOk is a boolean.
    const allScores = [true, false].map(j => H.scoreEntry(freeFast, { id: 'z', ok: true, kind: 'ok', code: 200, latencyMs: 0, jsonOk: j, providerId: 'siliconflow', hist: [true], checkedAt: Date.now() }));
    truthy('I8 jsonScore never reaches the documented 0.0 (only 0.5/1.0)',
        allScores.every(s => s > 0.3), 'scores=' + allScores.join(','));

    // quotaRisk quota branch is dead: quota verdicts are ok:false -> hard gate 0.
    const quotaV = { id: 'q', ok: false, kind: 'quota', code: 402, latencyMs: 10, jsonOk: false, providerId: 'deepseek', checkedAt: Date.now() };
    eq('I9 quota verdict is gated to 0 (quotaRisk +1 branch unreachable)', H.scoreEntry({ id: 'q', key: 'sk-x' }, quotaV), 0);
}

// --- J: pickBestKey tie-break ---
async function testPickBest() {
    resetEnv();
    const now = Date.now();
    const mk = (id, providerId, extra) => Object.assign({ id, key: 'k-' + id, providerId, createdAt: 1 }, extra || {});
    const mkHealth = (map) => localStorage.setItem('ai_key_health_v1', JSON.stringify(map));
    const V = (id, providerId, latencyMs, extra) => Object.assign({
        id, ok: true, kind: 'ok', code: 200, latencyMs, jsonOk: true, free: false,
        providerId, hist: [true], checkedAt: now
    }, extra || {});

    eq('J1 pickBestKey([]) -> null', H.pickBestKey([]), null);
    eq('J2 pickBestKey(null) -> null', H.pickBestKey(null), null);

    // score desc
    mkHealth({ a: V('a', 'volcano', 2900, { jsonOk: true }), b: V('b', 'volcano', 0, { jsonOk: true }) });
    const eFree = mk('a', 'siliconflow'); // tier free => higher score despite slow
    const ePaid = mk('b', 'volcano');     // tier cheap
    const best1 = H.pickBestKey([ePaid, eFree]);
    eq('J3 score desc wins over latency', best1.entry.id, 'a');

    // priority desc (equal score, equal latency, different provider priority)
    resetEnv();
    mkHealth({ p1: V('p1', 'volcano', 0), p2: V('p2', 'deepseek', 0) });
    const best2 = H.pickBestKey([mk('p1', 'volcano'), mk('p2', 'deepseek')]);
    eq('J4 equal score+latency -> higher provider.priority wins (deepseek 90 > volcano 85)',
        best2.entry.id, 'p2');

    // createdAt asc (equal score, latency, priority)
    resetEnv();
    mkHealth({ c1: V('c1', 'deepseek', 0), c2: V('c2', 'deepseek', 0) });
    const best3 = H.pickBestKey([mk('c1', 'deepseek', { createdAt: 200 }), mk('c2', 'deepseek', { createdAt: 100 })]);
    eq('J5 equal score+latency+priority -> older createdAt wins', best3.entry.id, 'c2');

    // latency asc — reachable only when speedScore saturates at 0 (latency >= 3000).
    resetEnv();
    mkHealth({ l1: V('l1', 'deepseek', 3000), l2: V('l2', 'deepseek', 999999) });
    const s1 = H.scoreEntry(mk('l1', 'deepseek'), V('l1', 'deepseek', 3000));
    const s2 = H.scoreEntry(mk('l2', 'deepseek'), V('l2', 'deepseek', 999999));
    eq('J6 saturated speedScore makes scores equal', s1, s2);
    const best4 = H.pickBestKey([mk('l2', 'deepseek'), mk('l1', 'deepseek')]);
    eq('J7 equal score -> lower latency wins (3000 < 999999)', best4.entry.id, 'l1',
        'latency tie-break is only reachable via speedScore saturation');

    // A failed verdict must never win over a scored one.
    resetEnv();
    mkHealth({ ok1: V('ok1', 'deepseek', 100), bad: { id: 'bad', ok: false, kind: 'auth', code: 401, latencyMs: 1, jsonOk: false, providerId: 'deepseek', checkedAt: now } });
    const best5 = H.pickBestKey([mk('bad', 'deepseek'), mk('ok1', 'deepseek')]);
    eq('J8 failed verdict cannot beat a usable one', best5.entry.id, 'ok1');

    // TTL: a stale verdict must be treated as missing (score 0).
    resetEnv();
    mkHealth({ old: { id: 'old', ok: true, kind: 'ok', code: 200, latencyMs: 0, jsonOk: true, providerId: 'siliconflow', hist: [true], checkedAt: now - 31 * 60 * 1000 } });
    eq('J9 verdict older than 30min TTL is ignored', H.getVerdict('old'), null);
    eq('J10 stale verdict => score 0', H.scoreEntry(mk('old', 'siliconflow'), H.getVerdict('old')), 0);

    resetEnv();
    eq('J11 getBestKeyEntry() with no keys -> null', H.getBestKeyEntry(), null);
}

// --- K: backwards compatibility ---
async function testBcLegacy() {
    resetEnv();
    localStorage.setItem('deepseek_api_key', '  ' + SK + '  ');
    const legacyList = S.getAllKeys();
    eq('K1 legacy migration creates exactly 1 entry', legacyList.length, 1);
    const e = legacyList[0] || {};
    eq('K2 migrated entry keeps the legacy field set', ['createdAt', 'id', 'key', 'label', 'type'].every(k => k in e), true,
        'a migrated entry must stay readable by old code paths');
    eq('K3 migrated type', e.type, 'deepseek');
    eq('K4 migrated label', e.label, 'DeepSeek');
    eq('K5 migrated key trimmed', e.key, SK);
    truthy('K6 migrated id generated', typeof e.id === 'string' && e.id.length > 0, e.id);
    // v3.0.6：内存优先存储模型下，迁移会把明文从磁盘**删除**，活跃 id 也只存内存。
    //   旧断言（读 localStorage['ai_active_key_id']）测的是已被刻意移除的行为。
    eq('K7 legacy plaintext key removed from disk after migration', localStorage.getItem('deepseek_api_key'), null,
        'security property: 旧版明文 Key 迁移后必须从磁盘删除');
    eq('K8 no plaintext key list left on disk', localStorage.getItem('ai_api_keys'), null);
    truthy('K8b migration notice is consumable exactly once', S.consumeKeyMigrationNotice() === true,
        'UI 需要一次性告知用户 Key 已不再落盘');
    eq('K8c migration notice is one-shot', S.consumeKeyMigrationNotice(), false);

    eq('K9 getActiveKeyValue() works for legacy user', S.getActiveKeyValue(), SK);
    eq('K10 getActiveKey() works', S.getActiveKey().id, e.id);
    eq('K11 copyActiveKey() works', S.copyActiveKey(), SK);
    eq('K12 getKeyMode() defaults to auto', S.getKeyMode(), 'auto');
    const eff = S.getEffectiveKeyEntry();
    eq('K13 getEffectiveKeyEntry() returns the single legacy key', eff && eff.key, SK,
        'a one-key legacy user must not be broken');
    eq('K14 detectKeyType re-export', S.detectKeyType(SK), 'deepseek');

    // migration is idempotent
    S.migrateLegacyKey();
    eq('K15 migration is idempotent', S.getAllKeys().length, 1);

    // An entry with NO providerId/modelId must work end-to-end.
    const prov = Z ? Z.getAiProvider(e) : P.resolveProviderId(e.key, e.providerId);
    if (Z) {
        eq('K16 providerId-less entry resolves via legacy semantics', prov.type, 'deepseek');
        eq('K17 providerId-less entry endpoint', prov.endpoint, 'https://api.deepseek.com/chat/completions');
        eq('K18 providerId-less entry keeps all legacy return fields',
            ['type', 'endpoint', 'model', 'label', 'supportJsonMode'].every(k => k in prov), true);
    } else {
        record('K16-K18 aiZuci import failed', false, ZUCI_LOAD_ERROR, 'module loads');
    }
}

// --- K19-K23: backfillProviderIds（单独成组：需先塞磁盘再让 store 首次加载）---
async function testBcBackfill() {
    resetEnv();
    localStorage.setItem('ai_api_keys', JSON.stringify([
        { id: 'a', type: 'deepseek', key: 'sk-aaaaaaaaaaaaaaaaaaaa', label: 'DeepSeek', createdAt: 1 },
        { id: 'b', type: 'volcano', key: 'ark-aaaaaaaaaaaaaaaaaaaa', label: '火山引擎豆包', createdAt: 2 },
        { id: 'c', type: 'unknown', key: 'gsk_aaaaaaaaaaaaaaaaaaaa', label: '未知引擎', createdAt: 3 }
    ]));
    const n = S.backfillProviderIds();
    const bl = S.getAllKeys();
    eq('K19 backfill changed 2 entries', n, 2);
    eq('K20 deepseek entry got providerId', (bl.find(x => x.id === 'a') || {}).providerId, 'deepseek');
    eq('K21 volcano entry got providerId', (bl.find(x => x.id === 'b') || {}).providerId, 'volcano');
    eq('K22 unknown entry left untouched', 'providerId' in (bl.find(x => x.id === 'c') || { providerId: 1 }), false,
        'spec: unknown must not be guessed');
    eq('K23 backfill is idempotent (2nd run = 0)', S.backfillProviderIds(), 0);
}

// --- K24-K31: 自动/手动生效 Key 解析（单独成组，同上）---
async function testBcEffective() {
    resetEnv();
    localStorage.setItem('ai_api_keys', JSON.stringify([
        { id: 'k1', type: 'deepseek', key: 'sk-11111111111111111111', label: 'DeepSeek', createdAt: 1 },
        { id: 'k2', type: 'deepseek', key: 'sk-22222222222222222222', label: 'DeepSeek', createdAt: 2 }
    ]));
    localStorage.setItem('ai_active_key_id', 'k2');
    eq('K24 auto mode without auto id falls back to active id (documented deviation)', S.getEffectiveKeyEntry().id, 'k2');
    S.setAutoKeyId('k1');
    eq('K25 auto id wins in auto mode', S.getEffectiveKeyEntry().id, 'k1');
    // v3.0.6：ai_active_key_id 不再落盘，改为断言 store 的活跃指针未被 setAutoKeyId 覆盖
    eq('K26 setAutoKeyId did not clobber the user selection', S.getActiveKey().id, 'k2');
    S.setKeyMode('manual');
    eq('K27 manual mode uses the user selection', S.getEffectiveKeyEntry().id, 'k2');
    S.setKeyMode('auto');
    eq('K28 setKeyMode(bogus) coerces to auto', (S.setKeyMode('banana'), S.getKeyMode()), 'auto');
    eq('K29 getAutoKeyId()', S.getAutoKeyId(), 'k1');

    // removeKey housekeeping
    S.removeKey('k1');
    eq('K30 removing the auto-selected key clears the auto id', S.getAutoKeyId(), null);
    eq('K31 remaining key intact', S.getAllKeys().length, 1);
}

// --- L: getAiProvider routing ---
async function testRouting() {
    resetEnv();
    if (!Z) { record('L* getAiProvider tests', false, ZUCI_LOAD_ERROR, 'module loads'); return; }

    const p1 = Z.getAiProvider(SK);
    eq('L1 plain sk- string -> deepseek (legacy)', p1.type, 'deepseek');
    eq('L2 plain sk- string endpoint', p1.endpoint, 'https://api.deepseek.com/chat/completions');

    const p2 = Z.getAiProvider({ key: SK, providerId: 'moonshot' });
    eq('L3 entry{providerId:moonshot} -> moonshot (THE routing fix)', p2.type, 'moonshot',
        'must NOT be routed to DeepSeek');
    eq('L4 moonshot endpoint', p2.endpoint, 'https://api.moonshot.cn/v1/chat/completions');
    eq('L5 moonshot model', p2.model, 'moonshot-v1-8k');

    const p3 = Z.getAiProvider({ key: SK });
    eq('L6 entry without providerId -> legacy deepseek', p3.type, 'deepseek');

    const p4 = Z.getAiProvider({ key: GSK });
    eq('L7 gsk_ key -> groq', p4.type, 'groq');

    const p5 = Z.getAiProvider({ key: GHP });
    eq('L8 unknown key -> type unknown', p5.type, 'unknown');
    eq('L9 unknown key -> supportJsonMode false', p5.supportJsonMode, false);

    // per-engine model override
    resetEnv();
    localStorage.setItem('ai_model_override_moonshot', 'moonshot-v1-32k');
    localStorage.setItem('ai_model_override', 'deepseek-chat'); // legacy global
    eq('L10 scoped override applies to the new engine',
        Z.getAiProvider({ key: SK, providerId: 'moonshot' }).model, 'moonshot-v1-32k');
    eq('L11 legacy global override still applies to deepseek',
        Z.getAiProvider(SK).model, 'deepseek-chat');
    eq('L12 legacy global override must NOT leak into a new engine',
        Z.getAiProvider({ key: SK, providerId: 'siliconflow' }).model, 'Qwen/Qwen2.5-7B-Instruct');

    // detectApiKeyType re-export from aiZuci
    eq('L13 aiZuci re-exports detectApiKeyType (BC)', Z.detectApiKeyType(SK), 'deepseek');

    // --- L14: settingsCenter inline auto-disambiguation gate (source-level wiring check) ---
    // The resolver MUST keep legacy sk- -> deepseek (see K16/K17). The real defect lived in
    // settingsCenter.js: the inline probe was gated on `providerInfo.type === 'unknown'`, which
    // is never true for a legacy sk- key, so the headline feature was inert for exactly the
    // ambiguity it was built for. The correct gate is provider CERTAINTY:
    //   const providerCertain = !!resolvedEntry.providerId || !!detectProviderId(apiKey);
    //   if (!providerCertain) { ... probeKey ... }
    // A 900-char window starting at the certainty expression covers the gate + its probeKey
    // call (287 chars) but excludes the legitimate post-probe fallback guard (1120 chars).
    const scPath = path.join(__dirname, 'src', 'modules', 'settingsCenter.js');
    let scSrc = '';
    try { scSrc = require('node:fs').readFileSync(scPath, 'utf8'); } catch (e) { scSrc = ''; }
    const gateIdx = scSrc.indexOf('providerCertain');
    const gateWindow = gateIdx >= 0 ? scSrc.slice(Math.max(0, gateIdx - 40), gateIdx + 900) : '';
    const declaresCertainty = /const\s+providerCertain\s*=\s*!!resolvedEntry\.providerId\s*\|\|\s*!!detectProviderId\(apiKey\)/.test(gateWindow);
    const gateOpensProbe = /if\s*\(\s*!\s*providerCertain\s*\)\s*\{/.test(gateWindow) && /probeKey\s*\(/.test(gateWindow);
    const oldGateInWindow = /providerInfo\.type\s*===\s*['"]unknown['"]/.test(gateWindow);
    record('L14 settingsCenter gates inline disambiguation on provider CERTAINTY (providerId || detectProviderId)',
        declaresCertainty && gateOpensProbe,
        { declaresCertainty, gateOpensProbe, oldGateInWindow },
        'const providerCertain = !!resolvedEntry.providerId || !!detectProviderId(apiKey); if (!providerCertain) {...probeKey...}',
        'the old gate could never fire for a legacy sk- key, so the feature was inert');
    record('L14b retired type==="unknown" gate no longer guards the inline probe',
        !oldGateInWindow, { oldGateStillGuardsInlineProbe: oldGateInWindow }, false,
        'window = 900 chars from the first `providerCertain` mention');

    // Sanity: the resolver still returns deepseek for the legacy entry (BC preserved, K16/K17),
    // yet detectProviderId(SK) is null => providerCertain is false => the inline probe DOES run.
    const legacyEntry = { id: 'k1', key: SK, type: 'deepseek', label: 'DeepSeek', createdAt: 1 };
    const pLegacy = Z.getAiProvider(legacyEntry);
    eq('L14c legacy sk- entry still resolves to deepseek (BC preserved)', pLegacy.type, 'deepseek');
    eq('L14d generic sk- is NOT certain (detectProviderId null) => certainty gate opens', P.detectProviderId(SK), null);
}

// --- L15: 探测后路由自愈（单独成组：需先塞磁盘再让 store 首次加载）---
async function testRoutingRecovery() {
    resetEnv();
    if (!Z) { record('L15 recovery', false, ZUCI_LOAD_ERROR, 'module loads'); return; }
    const legacyEntry = { id: 'k1', key: SK, type: 'deepseek', label: 'DeepSeek', createdAt: 1 };
    installAutoResolveFetch();
    localStorage.setItem('ai_api_keys', JSON.stringify([legacyEntry]));
    await H.probeAll([legacyEntry]);
    const fixed = S.getAllKeys().find(x => x.id === 'k1') || {};
    const pFixed = Z.getAiProvider(fixed);
    record('L15 probeAll recovers the legacy sk- key (writes providerId, re-routes correctly)',
        pFixed.type === 'dashscope' && String(pFixed.endpoint).includes('dashscope'),
        { providerId: fixed.providerId, type: pFixed.type, endpoint: pFixed.endpoint },
        'dashscope',
        'the feature only works after the user clicks "检测全部 Key 可用性"');
}

// --- M: callDeepSeekDirect host routing ---
async function testCallDirect() {
    resetEnv();
    if (!Z) { record('M* callDeepSeekDirect tests', false, ZUCI_LOAD_ERROR, 'module loads'); return; }

    fetchHandler = async (url, init) => {
        if (String(init.method).toUpperCase() !== 'POST') return resp(200, { data: [] });
        return resp(200, { choices: [{ message: { content: '{"0":{"zuci":["测试"],"pinyin":"cè shì"}}' } }] });
    };
    const pairs = [{ char: '测', pinyin: 'cè', existing: [] }];

    const r1 = await Z.callDeepSeekDirect(pairs, {
        apiKey: SK,
        providerInfo: Z.getAiProvider({ key: SK, providerId: 'moonshot' })
    });
    const host1 = new URL(fetchLog[0].url).host;
    eq('M1 providerInfo(moonshot) posts to api.moonshot.cn', host1, 'api.moonshot.cn');
    eq('M2 provider reported by result', r1.provider, 'moonshot');

    resetEnv();
    fetchLog = [];
    fetchHandler = async (url, init) => {
        if (String(init.method).toUpperCase() !== 'POST') return resp(200, { data: [] });
        return resp(200, { choices: [{ message: { content: '{"0":{"zuci":["测试"],"pinyin":"cè shì"}}' } }] });
    };
    const r2 = await Z.callDeepSeekDirect(pairs, { apiKey: SK });
    eq('M3 plain sk- apiKey posts to api.deepseek.com (legacy)', new URL(fetchLog[0].url).host, 'api.deepseek.com');
    eq('M4 result provider deepseek', r2.provider, 'deepseek');
    truthy('M5 Authorization bearer header present',
        String(fetchLog[0].headers['Authorization'] || '').startsWith('Bearer '), fetchLog[0].headers['Authorization']);

    // fillMissingZuci: verify it accepts providerId and routes accordingly.
    resetEnv();
    fetchHandler = async (url, init) => {
        if (String(init.method).toUpperCase() !== 'POST') return resp(200, { data: [] });
        return resp(200, { choices: [{ message: { content: '{"0":{"zuci":["测试"],"pinyin":"cè shì","words":[{"w":"测试","p":"cè shì"}]}}' } }] });
    };
    let fmzError = null, fmzHost = null;
    try {
        await Z.fillMissingZuci(['测'], {
            apiKey: SK, providerId: 'moonshot', fullCheck: true, fillMissing: true,
            onProgress: () => {}
        });
        if (fetchLog.length) fmzHost = new URL(fetchLog[0].url).host;
    } catch (e) { fmzError = e && e.message ? e.message : String(e); }
    if (fmzError && !fmzHost) {
        record('M6 fillMissingZuci routes to moonshot host', false,
            'threw before fetch: ' + fmzError.slice(0, 80), 'api.moonshot.cn',
            'could not exercise full pipeline offline (local dict may satisfy the char)');
    } else {
        eq('M6 fillMissingZuci routes to moonshot host', fmzHost, 'api.moonshot.cn');
    }
}

// --- N: key importer ---
async function testImporter() {
    resetEnv();
    eq('N1 KEY_PATTERNS is a non-empty array', Array.isArray(I.KEY_PATTERNS) && I.KEY_PATTERNS.length > 0, true);
    const text = `my keys:\n${SK}\n${ARK}\n${GSK}\n`;
    const found = I.extractKeysFromText(text);
    const byType = {};
    found.forEach(f => { byType[f.type] = f.key; });
    eq('N2 finds the sk- key with legacy type deepseek', byType['deepseek'], SK);
    eq('N3 finds the ark- key as volcano', byType['volcano'], ARK);
    eq('N4 finds the gsk_ key as groq', byType['groq'], GSK);
    const skRec = found.find(f => f.key === SK);
    eq('N5 record shape {key,type,label}', Object.keys(skRec).sort(), ['key', 'label', 'type']);
    truthy('N6 sk- label warns about ambiguity',
        /可能为其它 sk- 引擎/.test(skRec.label), skRec.label);
    eq('N7 extractKeysFromText("") -> []', I.extractKeysFromText(''), []);
    eq('N8 extractKeysFromText(null) -> []', I.extractKeysFromText(null), []);
    eq('N9 de-duplicates repeated keys', I.extractKeysFromText(SK + '\n' + SK).length, 1);

    const file = { name: 'keys.txt', text: async () => text };
    const r = await I.importKeysFromFile(file);
    eq('N10 importKeysFromFile ok', r.ok, true);
    eq('N11 importKeysFromFile filename', r.filename, 'keys.txt');
    eq('N12 importKeysFromFile count', r.count, found.length);
    eq('N13 importKeysFromFile keys array', Array.isArray(r.keys), true);
    eq('N14 importKeysFromFile(null)', await I.importKeysFromFile(null), { ok: false, error: '未选择文件' });
}

// --- O: maskKey / misc ---
async function testMisc() {
    resetEnv();
    eq('O1 maskKey long key', S.maskKey('sk-1234567890'), 'sk-1…7890');
    eq('O2 maskKey exactly 8 chars unchanged', S.maskKey('12345678'), '12345678');
    eq('O3 maskKey short unchanged', S.maskKey('abc'), 'abc');
    eq('O4 maskKey("") -> ""', S.maskKey(''), '');
    eq('O5 maskKey(null) -> ""', S.maskKey(null), '');
    truthy('O6 maskKey never leaks the middle', !S.maskKey('sk-ABCDEFGHIJKLMNOP').includes('EFGHIJ'), S.maskKey('sk-ABCDEFGHIJKLMNOP'));

    // clearVerdicts
    localStorage.setItem('ai_key_health_v1', JSON.stringify({ x: { id: 'x' } }));
    H.clearVerdicts();
    eq('O7 clearVerdicts removes the health key', localStorage.getItem('ai_key_health_v1'), null);

    // addKey / setActiveKey / removeKey basics
    resetEnv();
    const added = S.addKey({ key: SK, providerId: 'moonshot', modelId: 'moonshot-v1-8k' });
    eq('O8 addKey returns entry with providerId', added.providerId, 'moonshot');
    eq('O9 addKey sets it active', S.getActiveKeyValue(), SK);
    eq('O10 addKey dedupes by key string', (S.addKey({ key: SK }), S.getAllKeys().length), 1);

    // probe never writes ai_zuci_cache_v1
    resetEnv();
    installAutoResolveFetch();
    await H.probeKey({ id: 'k1', key: SK });
    eq('O11 probing never writes ai_zuci_cache_v1', localStorage.getItem('ai_zuci_cache_v1'), null,
        'spec constraint: probes must not pollute the zuci cache');
}

// ===========================================================================
// 5. Runner
// ===========================================================================

// v3.0.6：每个分组跑在**独立子进程**里。
// 原因：aiKeyStore 已改为「内存优先」（借鉴 shuaixiaodai-calligraphy v1.3.0）——
//   模块首次被访问时把磁盘上的旧明文 Key 搬进内存并**删除磁盘副本**，此后
//   `localStorage.clear()` 再也清不掉内存里的条目（`_loaded` 已闩死）。
//   同一进程连跑多组 → 前一组遗留的 Key 会污染后一组（J11 就是这么假红的）。
//   Node ESM 没有清缓存的 API；给 URL 加 `?v=N` 也只会让 aiKeyHealth 拿到
//   **另一个** aiKeyStore 实例（它静态 import 的是不带 query 的路径）→ 更假。
//   子进程换来「每组一张干净的模块图」，等价于 A 的 vitest 里 `vi.resetModules()`。
// 因此：凡是需要「先往磁盘塞旧数据、再让 store 首次加载」的场景，
//   都必须自成一组（见 testBc* / testWriteback* / testRoutingRecovery 的拆分）。
const GROUPS = [
    ['Registry / detection', 'testProviders'],
    ['Registry sanity', 'testRegistry'],
    ['Candidate auto-resolution', 'testAutoResolution'],
    ['probe writeback (ambiguous sk-)', 'testWritebackAmbiguous'],
    ['probeKey never throws', 'testNeverThrows'],
    ['Error classification', 'testClassification'],
    ['response_format downgrade', 'testJsonDowngrade'],
    ['Offline behaviour', 'testOffline'],
    ['probeAll', 'testProbeAll'],
    ['Scoring', 'testScoring'],
    ['pickBestKey tie-break', 'testPickBest'],
    ['BC: legacy plaintext migration', 'testBcLegacy'],
    ['BC: backfillProviderIds', 'testBcBackfill'],
    ['BC: effective-key resolution', 'testBcEffective'],
    ['getAiProvider routing', 'testRouting'],
    ['routing recovery via probeAll', 'testRoutingRecovery'],
    ['callDeepSeekDirect / fillMissingZuci', 'testCallDirect'],
    ['Key importer', 'testImporter'],
    ['maskKey / misc', 'testMisc']
];

const GROUP_FNS = {
    testProviders, testRegistry, testAutoResolution, testWritebackAmbiguous,
    testNeverThrows, testClassification, testJsonDowngrade, testOffline,
    testProbeAll, testScoring, testPickBest,
    testBcLegacy, testBcBackfill, testBcEffective,
    testRouting, testRoutingRecovery, testCallDirect, testImporter, testMisc
};

const RESULT_MARKER = '\n__AIKEYS_RESULT__';

async function runOneGroup(index) {
    await loadModules();
    const [title, name] = GROUPS[index];
    const fn = GROUP_FNS[name];
    if (typeof fn !== 'function') throw new Error(`分组函数缺失: ${name}`);
    try {
        await fn();
    } catch (e) {
        // 带上前几帧调用栈：只有 message 时定位不到是产品代码还是剧本的问题
        const where = (e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : '');
        record(`[${title}] GROUP THREW`, false, ((e && e.message) || String(e)) + (where ? '  @ ' + where : ''), 'no throw');
    }
    return { title, rows, nPass, nFail, zuciLoadError: ZUCI_LOAD_ERROR };
}

/** 父进程侧：fork 一个子进程只跑第 index 组，取回结构化结果 */
function runGroupInChild(index) {
    const { spawnSync } = require('node:child_process');
    const r = spawnSync(process.execPath, [__filename], {
        encoding: 'utf8',
        env: { ...process.env, AIKEYS_GROUP: String(index) },
        maxBuffer: 64 * 1024 * 1024
    });
    const out = String(r.stdout || '');
    const at = out.lastIndexOf(RESULT_MARKER);
    if (at >= 0) {
        try { return JSON.parse(out.slice(at + RESULT_MARKER.length)); } catch { /* 落到下面的失败分支 */ }
    }
    return {
        title: GROUPS[index][0], nPass: 0, nFail: 1,
        rows: [{
            name: `[${GROUPS[index][0]}] 子进程未返回结果`, pass: false,
            actual: `exit=${r.status} signal=${r.signal} stderr=${String(r.stderr || '').slice(0, 400)}`,
            expected: 'JSON result'
        }]
    };
}

async function main() {
    console.log('v3.0.6 AI-key subsystem — independent verification');
    console.log('node ' + process.version + ' · no network · stubbed fetch · 每组独立子进程\n');

    const all = [];
    let pass = 0, fail = 0;
    for (let i = 0; i < GROUPS.length; i++) {
        const res = runGroupInChild(i);
        if (res.zuciLoadError) console.log(`[warn] ${res.title}: aiZuci.js could not be imported: ${res.zuciLoadError}`);
        console.log(`\n### ${res.title}`);
        for (const row of res.rows) {
            all.push(row);
            console.log(`[${row.pass ? 'PASS' : 'FAIL'}] ${row.name}`);
            console.log(`        observed: ${row.actual}`);
            if (!row.pass || process.env.VERBOSE) console.log(`        expected: ${row.expected}`);
            if (row.note) console.log(`        note:     ${row.note}`);
        }
        pass += res.nPass; fail += res.nFail;
    }

    console.log('\n' + '='.repeat(78));
    console.log(`SUMMARY: ${pass} passed, ${fail} failed, ${all.length} total`);
    if (fail > 0) {
        console.log('\nFAILED ASSERTIONS:');
        all.filter(x => !x.pass).forEach(x => {
            console.log(`  - ${x.name}\n      observed: ${x.actual}\n      expected: ${x.expected}`);
        });
    }
    console.log('='.repeat(78));

    process.exitCode = fail > 0 ? 1 : 0;
}

// ── 子进程模式：只跑一组，把结果以 JSON 交回父进程 ──
if (process.env.AIKEYS_GROUP !== undefined) {
    const idx = Number(process.env.AIKEYS_GROUP);
    runOneGroup(idx)
        .then((res) => {
            process.stdout.write(RESULT_MARKER + JSON.stringify(res) + '\n');
            process.exitCode = res.nFail > 0 ? 1 : 0;
        })
        .catch((e) => {
            process.stdout.write(RESULT_MARKER + JSON.stringify({
                title: (GROUPS[idx] || ['?'])[0],
                rows: [{ name: 'HARNESS CRASH', pass: false, actual: (e && e.stack) || String(e), expected: 'no crash' }],
                nPass: 0, nFail: 1
            }) + '\n');
            process.exitCode = 2;
        });
} else {
    main().catch(e => {
        console.error('HARNESS CRASH:', e && e.stack ? e.stack : e);
        process.exitCode = 2;
    });
}
