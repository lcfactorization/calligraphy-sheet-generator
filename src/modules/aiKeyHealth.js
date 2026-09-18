// v3.0.4 新增：AI Key 健康探测 + 确定性评分 + 自动优选
// 契约：docs/v304_升级方案与接口契约.md §3.3
//
// 约束
//  - 不使用 Web Worker（vite-plugin-singlefile 不会内联 Worker）；探测在主线程用 fetch。
//  - 探测串行（并发 1），每个约 8s 超时（AbortController）。
//  - 离线（navigator.onLine === false）时跳过探测，且不覆盖已有裁决。
//  - 绝不写入 ai_zuci_cache_v1。
//  - probeKey 永不 throw：失败一律以 { ok:false, ... } 的 Verdict 返回。

import { PROVIDERS, getProvider, detectProviderId, providerLabel } from './aiProviders.js';
import { getAllKeys } from './aiKeyStore.js';

const HEALTH_KEY = 'ai_key_health_v1';
const TTL_MS = 30 * 60 * 1000;      // 裁决有效期 30 分钟
const DEFAULT_TIMEOUT_MS = 8000;    // 单个探测约 8s
const HISTORY_MAX = 10;             // 历史成功率保留最近 10 次
const RATELIMIT_WINDOW_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 存储
// ---------------------------------------------------------------------------

function readAll() {
    try {
        const m = JSON.parse(localStorage.getItem(HEALTH_KEY) || '{}');
        return m && typeof m === 'object' ? m : {};
    } catch (e) {
        return {};
    }
}

function writeAll(map) {
    try {
        localStorage.setItem(HEALTH_KEY, JSON.stringify(map));
    } catch (e) {
        /* 配额满等情况忽略 */
    }
}

function isOnline() {
    try {
        return !(typeof navigator !== 'undefined' && navigator.onLine === false);
    } catch (e) {
        return true;
    }
}

function now() {
    return Date.now();
}

// ---------------------------------------------------------------------------
// 引擎 / 模型解析
// ---------------------------------------------------------------------------

/**
 * v3.0.4 关键能力：解析「应当依次尝试哪些引擎」。
 * 这是「不用自己选择」的实现核心 —— 多个引擎共用同一 Key 前缀时
 * （sk- 被 DeepSeek / Moonshot / 硅基流动 / 阿里百炼 共用，sk-or-v1- 属 OpenRouter），
 * 仅凭字符串无法判定，因此返回**候选列表**由探测逐个试，命中即止。
 *
 * 解析顺序：
 *   1. entry.providerId 显式指定 → 唯一候选（最高优先级，用户/上次探测的结论）
 *   2. detectProviderId 形状唯一 → 唯一候选
 *   3. 形状歧义（多家共用）→ 返回全部匹配该形状的引擎
 *   4. 形状完全未知 → 仅用「零 token 且会校验鉴权」的 /models 端点做免费扫描
 *      （这是唯一能零成本试错的路径；OpenRouter 的 /models 是公开的，
 *       不校验鉴权，故已被 modelsEndpointValidatesAuth:false 排除）
 * @param {{key:string, providerId?:string}} entry
 * @returns {Array} Provider[]
 */
function resolveProviderCandidates(entry) {
    if (!entry || typeof entry.key !== 'string') return [];
    const key = entry.key.trim();
    if (!key) return [];

    // 1) 显式指定 → 唯一候选
    if (entry.providerId) {
        const p = getProvider(entry.providerId);
        if (p) return [p];
    }
    // 2) 形状唯一判定
    const detected = detectProviderId(key);
    if (detected) {
        const p = getProvider(detected);
        if (p) return [p];
    }
    // 3) 形状歧义 → 全部匹配的引擎
    const shaped = PROVIDERS.filter(
        (p) => p.keyShape && typeof p.keyShape.test === 'function' && p.keyShape.test(key)
    );
    if (shaped.length > 0) return shaped;

    // 4) 形状未知 → 零 token 的 /models 免费扫描
    return PROVIDERS.filter(
        (p) => p.modelsPath && p.modelsEndpointValidatesAuth && p.cors === 'verified'
    );
}

function resolveModel(provider, entry) {
    if (!provider) return null;
    const ms = Array.isArray(provider.models) ? provider.models : [];
    if (entry && entry.modelId) {
        const hit = ms.find((m) => m.id === entry.modelId);
        if (hit) return hit;
        return { id: entry.modelId, tier: 'paid', jsonMode: null }; // 未知模型按付费处理
    }
    return ms.find((m) => !m.fullCheck) || ms[0] || null;
}

function joinUrl(base, path) {
    return String(base || '').replace(/\/$/, '') + (path || '');
}

function buildUrl(provider, path, key, authStyle) {
    let url = joinUrl(provider.baseUrl, path);
    if (authStyle === 'query-key') {
        url += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
    }
    return url;
}

function buildHeaders(provider, key, authStyle) {
    const h = { 'Content-Type': 'application/json' };
    if (authStyle !== 'query-key') h['Authorization'] = 'Bearer ' + key;
    return h;
}

// AbortSignal.any 兼容兜底（旧 WebView / Safari < 17.4）
function combineSignals(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
    const ctrl = new AbortController();
    const forward = () => ctrl.abort();
    a.addEventListener('abort', forward, { once: true });
    b.addEventListener('abort', forward, { once: true });
    return ctrl.signal;
}

async function timedFetch(url, init, timeoutMs, outerSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: combineSignals(outerSignal, ctrl.signal) });
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// 错误分类与文案
// ---------------------------------------------------------------------------

function classify(status) {
    if (status === 401) return 'auth';
    if (status === 402) return 'quota';
    if (status === 403) return 'quota'; // 歧义：标记不可用，但不判为 Key 无效
    if (status === 404) return 'model';
    if (status === 429) return 'ratelimit'; // 不得标记为不可用
    return 'unknown';
}

function messageFor(kind, status) {
    switch (kind) {
        case 'auth':
            return `API Key 无效或已过期（HTTP ${status}）`;
        case 'quota':
            return status === 403
                ? '无该模型权限或额度已耗尽（HTTP 403；不能据此判定 Key 无效）'
                : `账户额度不足（HTTP ${status}）`;
        case 'model':
            return '模型 ID 不存在或未开通（HTTP 404），请在注册表中更换模型';
        case 'ratelimit':
            return '请求过于频繁（HTTP 429），Key 可用但暂时限流';
        case 'unreachable':
            return '无法连接：可能是浏览器跨域(CORS)限制或网络不可达';
        case 'unsupported':
            return '无法识别该 Key 所属引擎，请手动指定引擎后再检测';
        default:
            return `探测失败（HTTP ${status}）`;
    }
}

function persist(verdict, ok) {
    if (!verdict || !verdict.id) return;
    if (!isOnline()) return; // 离线不覆盖已有裁决
    try {
        const all = readAll();
        const prev = all[verdict.id];
        const hist = Array.isArray(prev && prev.hist) ? prev.hist.slice(-(HISTORY_MAX - 1)) : [];
        hist.push(!!ok);
        all[verdict.id] = { ...verdict, hist };
        writeAll(all);
    } catch (e) {
        /* 忽略 */
    }
}

// ---------------------------------------------------------------------------
// 探测
// ---------------------------------------------------------------------------

/** 失败信息量排序：越小越"确定"，用于多候选时挑最值得报告的失败原因 */
function failureRank(kind) {
    switch (kind) {
        case 'auth': return 1;
        case 'quota': return 2;
        case 'model': return 3;
        case 'ratelimit': return 4;
        case 'unknown': return 5;
        default: return 6;      // unreachable / unsupported
    }
}

/**
 * 对**单个指定引擎**做一次探测（不写裁决，由 probeKey 统一决定是否落库）。
 * 两阶段：零 token 的 /models 鉴权快路径 → 3 token 的 chat 能力探测。
 * @returns {Promise<object>} Verdict
 */
async function probeOneProvider(entry, provider, timeoutMs, signal, started) {
    const key = entry.key.trim();
    const model = resolveModel(provider, entry);
    const modelId = model ? model.id : null;
    const baseV = {
        id: entry.id || null,
        ok: false,
        code: 0,
        kind: 'unknown',
        latencyMs: 0,
        jsonOk: false,
        free: !!(model && model.tier === 'free'),
        modelId,
        providerId: provider.id,
        message: '',
        checkedAt: started
    };

    const authStyle = provider.authStyle || 'bearer';
    const headers = buildHeaders(provider, key, authStyle);
    const chatPath = provider.chatPath || '/chat/completions';

    try {
        // 阶段 1：/models 零 token 快路径（仅当该端点会校验鉴权）
        if (provider.modelsPath && provider.modelsEndpointValidatesAuth) {
            try {
                const mResp = await timedFetch(
                    buildUrl(provider, provider.modelsPath, key, authStyle),
                    { method: 'GET', headers },
                    timeoutMs,
                    signal
                );
                if (mResp.status === 401) {
                    // 401：该引擎不认这把 Key。多候选场景下这通常只意味着
                    // "不是这家"，由 probeKey 决定是否继续试下一个候选。
                    return {
                        ...baseV, code: 401, kind: 'auth',
                        latencyMs: now() - started, message: messageFor('auth', 401)
                    };
                }
                // 其它状态不阻断：以阶段 2 的 chat 探测为准
            } catch (e) {
                /* /models 失败不阻断（可能仅该端点 CORS 受限） */
            }
        }

        // 阶段 2：chat 能力探测（max_tokens:3），先带 response_format。
        // 引擎拒绝 response_format 的方式有两种，都必须处理：
        //   信号 1（规范）：HTTP 400/422，错误文本提到 response_format / json_object
        //   信号 2（不合规，v3.0.4 追加）：HTTP 200 但响应体退化 —— 实测 ModelScope 的
        //     Qwen/Qwen3.8-Flash-Next 在 max_tokens:3 + response_format 下返回
        //     {"choices":null,...}（HTTP 200）。若只认信号 1，这类引擎会被误判为
        //     "走了代理或 baseUrl 配置错误"，把**真实可用**的引擎报成不可用。
        // 两种信号都只降级一次（去掉 response_format 重发），不做无限重试。
        const body = {
            model: modelId,
            messages: [{ role: 'user', content: '1' }],
            max_tokens: 3,
            response_format: { type: 'json_object' }
        };
        const url = buildUrl(provider, chatPath, key, authStyle);
        let usedJson = true;

        const send = () => timedFetch(
            url,
            { method: 'POST', headers, body: JSON.stringify(body) },
            timeoutMs,
            signal
        );

        // 解析响应体并判定是否为 OpenAI 兼容的 chat completion。
        // 仅凭 HTTP 200 不足以判定可用：代理/错误 baseUrl 可能返回 200 + HTML/错误页。
        // 注意 max_tokens:3 只截断 message.content，不会截断 HTTP 响应体，
        // 因此 resp.json() 仍应得到完整 JSON —— 不得为"截断"放宽此校验。
        const readChat = async (r) => {
            let d = null;
            try { d = await r.json(); } catch (e) { d = null; }
            return {
                data: d,
                valid: !!(d && Array.isArray(d.choices) && d.choices.length > 0
                    && d.choices[0] && d.choices[0].message)
            };
        };

        let resp = await send();
        let parsed = resp.ok ? await readChat(resp) : { data: null, valid: false };

        // 信号 1：400/422 且错误文本指向 response_format
        if (!resp.ok && (resp.status === 400 || resp.status === 422)) {
            const firstText = await resp.text().catch(() => '');
            if (/response_format|json_object|json mode/i.test(firstText)) {
                delete body.response_format;
                usedJson = false;
                resp = await send();
                parsed = resp.ok ? await readChat(resp) : { data: null, valid: false };
            }
        }

        // 信号 2：200 但响应体不是 chat completion，且本次仍带着 response_format
        if (resp.ok && !parsed.valid && usedJson) {
            delete body.response_format;
            usedJson = false;
            resp = await send();
            parsed = resp.ok ? await readChat(resp) : { data: null, valid: false };
        }

        const latencyMs = now() - started;

        if (!resp.ok) {
            const kind = classify(resp.status);
            const ok = kind === 'ratelimit'; // 限流不代表 Key 不可用
            return {
                ...baseV, ok, code: resp.status, kind, latencyMs, jsonOk: false,
                message: messageFor(kind, resp.status)
            };
        }

        if (!parsed.valid) {
            // 降级重试后仍不是 chat completion → 才判定为代理/baseUrl 问题
            return {
                ...baseV, ok: false, code: resp.status, kind: 'unknown', latencyMs, jsonOk: false,
                message: `端点有响应（HTTP ${resp.status}）但响应体不是 chat completion`
                    + '（通常意味着走了代理或 baseUrl 配置错误）'
            };
        }
        // jsonOk 表示“response_format 被接受”（max_tokens:3 下正文可能被截断，
        // 因此不把“能否 JSON.parse”作为硬条件，避免误判为不可用）
        const content = (parsed.data.choices[0].message && parsed.data.choices[0].message.content) || '';
        const jsonOk = usedJson && typeof content === 'string' && content.length > 0;
        return {
            ...baseV, ok: true, code: resp.status, kind: 'ok', latencyMs, jsonOk,
            message: `可用（${provider.label} · ${modelId || '默认模型'}，${latencyMs}ms）`
        };
    } catch (err) {
        const latencyMs = now() - started;
        const isAbort = !!(err && err.name === 'AbortError');
        return {
            ...baseV, ok: false, code: 0, kind: 'unreachable', latencyMs, jsonOk: false,
            message: isAbort
                ? `探测超时（>${timeoutMs}ms）：可能是浏览器跨域(CORS)限制或网络不可达`
                : messageFor('unreachable', 0)
        };
    }
}

/**
 * 探测单个 Key。永不 throw。
 *
 * v3.0.4：支持**多候选自动消歧** —— 当 Key 形状被多个引擎共用（如 sk-）或完全未知时，
 * 会依次对候选引擎发起探测，命中即止，并把命中的 providerId 写进裁决，
 * 供调用方回写 entry.providerId，从而实现"用户无需手动选择引擎"。
 *
 * 成本控制：候选里凡带「会校验鉴权的 /models」端点的，先用零 token 的 /models 排除，
 * 因此 sk- 歧义集（DeepSeek / Moonshot / 硅基流动 / 百炼）通常只花 1 次 chat 探测。
 *
 * @param {{id?:string, key:string, providerId?:string, modelId?:string}} entry
 * @param {{signal?:AbortSignal, timeoutMs?:number}} [opts]
 * @returns {Promise<import('./aiKeyHealth.js').Verdict>}
 */
export async function probeKey(entry, opts = {}) {
    const timeoutMs = (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0)
        ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const started = now();
    const base = {
        id: entry && entry.id ? entry.id : null,
        ok: false,
        code: 0,
        kind: 'unknown',
        latencyMs: 0,
        jsonOk: false,
        free: false,
        modelId: null,
        providerId: entry && entry.providerId ? entry.providerId : null,
        message: '',
        checkedAt: started
    };

    if (!entry || typeof entry.key !== 'string' || !entry.key.trim()) {
        return { ...base, kind: 'unsupported', message: messageFor('unsupported', 0) };
    }

    const candidates = resolveProviderCandidates(entry);
    if (candidates.length === 0) {
        return { ...base, kind: 'unsupported', message: messageFor('unsupported', 0) };
    }

    if (!isOnline()) {
        return { ...base, kind: 'unreachable', message: '当前离线，已跳过探测（保留上次裁决）' };
    }

    let best = null;        // 最值得报告的失败（ok:false）
    let rateLimited = null; // 可用但"非定论"的结果（429，ok:true）——不得据此短路线程
    for (const provider of candidates) {
        if (opts.signal && opts.signal.aborted) break;
        const v = await probeOneProvider(entry, provider, timeoutMs, opts.signal, started);
        // 只有真正成功（kind==='ok'）才算定论：立即返回并落库。
        // 429（ratelimit）虽然 ok:true（Key 可用），但并不能证明"这把 Key 属于该引擎"，
        // 因此多候选时必须继续探测其余候选，否则会把限流的 Key 永久误判给第一个引擎。
        if (v.ok && v.kind === 'ok') {
            persist(v, true);
            return v;
        }
        if (v.ok && v.kind === 'ratelimit') {
            if (!rateLimited) rateLimited = v;
            continue;
        }
        if (!best || failureRank(v.kind) < failureRank(best.kind)) best = v;
    }

    // 用户主动取消 → 不写裁决（避免把"取消"误记为"不可用"）
    if (opts.signal && opts.signal.aborted) {
        return best || rateLimited || { ...base, kind: 'unknown', message: '已取消检测' };
    }

    // 没有任何候选给出定论：若有 429 则返回它（Key 可用），否则报告最有信息量的失败。
    // 注意：429 的结果 ok:true，但调用方（probeAll）不得据其回写 providerId（见下方 kind==='ok' 门）。
    const finalV = rateLimited || best || { ...base, kind: 'unknown', message: messageFor('unknown', 0) };
    persist(finalV, !!finalV.ok);
    return finalV;
}

/**
 * 串行探测多个 Key（并发 1）。单个失败不影响其余。
 * @param {Array} entries
 * @param {{signal?:AbortSignal, onProgress?:(p:{done:number,total:number,id:string,ok:boolean})=>void}} [opts]
 * @returns {Promise<Array>}
 */
export async function probeAll(entries, opts = {}) {
    const list = Array.isArray(entries) ? entries : [];
    const out = [];
    const total = list.length;
    let done = 0;
    for (const e of list) {
        if (opts.signal && opts.signal.aborted) break;
        let v;
        try {
            v = await probeKey(e, opts); // 串行：并发恒为 1
        } catch (err) {
            v = {
                id: e && e.id ? e.id : null, ok: false, code: 0, kind: 'unknown',
                latencyMs: 0, jsonOk: false, free: false, modelId: null,
                message: '探测异常：' + (err && err.message ? err.message : String(err)),
                checkedAt: now()
            };
        }
        // v3.0.4：把探测命中的引擎回写到 Key 条目，使后续组词调用能直接按
        // entry.providerId 正确路由（歧义 sk- Key 无需用户再选一次）。
        // 仅在**定论**（kind==='ok'）时回写：429 等 ok:true 但非定论的结果不能证明
        // 引擎归属，写回会把限流的 Key 永久误标（且裁决 TTL 内不再纠正）。
        if (v.ok && v.kind === 'ok' && v.providerId && e && e.id) {
            try {
                writeBackProvider(e.id, v.providerId, v.modelId);
            } catch (err) {
                /* 回写失败不影响探测结果 */
            }
        }
        out.push(v);
        done++;
        if (typeof opts.onProgress === 'function') {
            try {
                opts.onProgress({ done, total, id: v.id, ok: v.ok });
            } catch (e2) {
                /* 忽略回调异常 */
            }
        }
    }
    return out;
}

/** 把命中的引擎/模型回写到 ai_api_keys 条目（可选字段，向后兼容）。 */
function writeBackProvider(keyId, providerId, modelId) {
    let list = [];
    try {
        list = JSON.parse(localStorage.getItem('ai_api_keys') || '[]');
    } catch (e) {
        return;
    }
    if (!Array.isArray(list)) return;
    let changed = false;
    for (const k of list) {
        if (k && k.id === keyId) {
            if (k.providerId !== providerId) { k.providerId = providerId; changed = true; }
            if (modelId && k.modelId !== modelId) { k.modelId = modelId; changed = true; }
            // v3.0.4 追加：消歧成功后同步 type / label。
            //   否则用「未识别」形状加入的 Key 即使探测成功，下拉框仍显示「未识别」，
            //   用户看不出自动识别到底识别成了哪家（实测：agnes 探测成功后 label 仍是"未识别"）。
            const lab = providerLabel(providerId);
            if (k.type !== providerId) { k.type = providerId; changed = true; }
            if (k.label !== lab) { k.label = lab; changed = true; }
        }
    }
    if (changed) {
        try { localStorage.setItem('ai_api_keys', JSON.stringify(list)); } catch (e) { /* 忽略 */ }
    }
}

// ---------------------------------------------------------------------------
// 裁决读取
// ---------------------------------------------------------------------------

/** 读取某 Key 的裁决；超过 30 分钟 TTL 视为 null。 */
export function getVerdict(id) {
    if (!id) return null;
    const v = readAll()[id];
    if (!v || typeof v !== 'object') return null;
    if (typeof v.checkedAt !== 'number') return null;
    if (now() - v.checkedAt > TTL_MS) return null;
    return v;
}

/** 清空全部裁决。 */
export function clearVerdicts() {
    try {
        localStorage.removeItem(HEALTH_KEY);
    } catch (e) {
        /* 忽略 */
    }
}

// ---------------------------------------------------------------------------
// 评分与优选
// ---------------------------------------------------------------------------

function clamp01(n) {
    if (typeof n !== 'number' || !isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

/**
 * v3.0.4：评分用的引擎解析。
 * 顺序：entry.providerId（用户指定 / 上次探测回写）→ verdict.providerId（本次探测命中）
 *      → detectProviderId 形状唯一判定 → null。
 * 注意：这里**不做** sk- 的旧语义兜底 —— 评分必须反映真实命中的引擎，
 * 否则歧义 Key 会被错误地按 DeepSeek 的免费档评分。
 */
function scoringProvider(entry, verdict) {
    if (!entry) return null;
    if (entry.providerId) {
        const p = getProvider(entry.providerId);
        if (p) return p;
    }
    if (verdict && verdict.providerId) {
        const p = getProvider(verdict.providerId);
        if (p) return p;
    }
    const detected = typeof entry.key === 'string' ? detectProviderId(entry.key) : null;
    return detected ? getProvider(detected) : null;
}

function tierFreeScore(entry, verdict) {
    const provider = scoringProvider(entry, verdict);
    const model = resolveModel(provider, entry);
    const tier = model ? model.tier : 'paid';
    // 归一化到 0..1（旧实现用 3/1/0，使 0.30 权重实际最多贡献 0.90，压倒了其它项）。
    if (tier === 'free') return 1;        // 永久免费
    if (tier === 'cheap') return 1 / 3;   // 免费额度(trial) / 低价
    return 0;                             // 付费
}

function stabilityOf(verdict) {
    const hist = verdict && Array.isArray(verdict.hist) ? verdict.hist : null;
    if (hist && hist.length > 0) {
        return hist.filter(Boolean).length / hist.length;
    }
    return verdict && verdict.ok ? 1 : 0;
}

function quotaRiskOf(verdict) {
    if (!verdict) return 0;
    let risk = 0;
    // 说明：`kind === 'quota'`（402/403）在 classify() 里被标记为 ok:false，
    //   而 scoreEntry 的硬门（verdict.ok !== true → 0）会先行返回，
    //   因此这里**不需要**再为 quota 扣分 —— 该分支曾存在但永不可达（死代码），
    //   已于 v3.0.4 验收修复中移除，避免误导读者以为"额度耗尽仍可能得正分"。
    //   仅 ratelimit（ok:true，近 1h 内 429）是可达的扣分项。
    if (verdict.kind === 'ratelimit' && (now() - (verdict.checkedAt || 0)) < RATELIMIT_WINDOW_MS) {
        risk += 0.5; // 近 1h 内 429
    }
    return risk;
}

/**
 * 确定性评分。硬门：探测失败（verdict 为空或 ok!==true）→ 0。
 * score = 0.30*freeScore + 0.20*speedScore + 0.25*jsonScore + 0.25*stability - quotaRisk
 *
 * freeScore 已归一化到 0..1（free=1 / cheap=1/3 / paid=0），各项权重含义一致：
 * 免费加成最多 +0.30，不再像旧 0..3 标度（最多 +0.90）那样压倒速度/JSON/稳定性。
 *
 * 实际排序（fast = latencyMs 0，stable = hist 全 true）：
 *   free  + jsonOk        = 0.30 + 0.20 + 0.25  + 0.25 = 1.000
 *   free  + json 降级      = 0.30 + 0.20 + 0.125 + 0.25 = 0.875
 *   cheap + jsonOk        = 0.10 + 0.20 + 0.25  + 0.25 = 0.800
 *   paid  + jsonOk        = 0.00 + 0.20 + 0.25  + 0.25 = 0.700
 *
 * 诚实说明：契约 §3.3 的 "json+stability(0.50) > free(0.30)" 仅在 json 与 stability
 * **同时**变差时才成立（两项合计可差 0.50 > 0.30）。若只 json 降级，最多只差
 * 0.25*0.5 = 0.125 < 0.30，因此"免费但 JSON 降级"仍高于"付费但 JSON 完好"。
 * 这是 0.30/0.25 权重组合的固有取舍，而非实现缺陷。
 *
 * 已知局限：jsonScore 的文档档位 0（"JSON 不可解析"）当前不可达 —— jsonOk 是布尔，
 * 评分只产出 1 或 0.5。探测在 max_tokens:3 下无法可靠区分"降级"与"解析失败"，
 * 故不臆造 0 档（详见交付报告）。
 *
 * v3.0.4 修订（由真实联网实测发现）：`speedScore = 1 - latencyMs/3000` 中的 latencyMs
 * 是**探测延迟**（max_tokens:3），它对推理型模型毫无代表性 —— 推理模型在 3 token 下
 * 秒回，但在真实组词负载（大 token 预算）下会先生成大量 reasoning token。
 * 实测同一任务（4 字全量检查）：
 *   · agnes:agnes-3.0-flash              → 12.9s
 *   · modelscope:Qwen/Qwen3.8-Flash-Next → 102–122s（约 8–9 倍）
 * 而两者探测延迟反而是 modelscope 更快（1528ms vs 3849ms），会导致"更慢的引擎得分更高"。
 * 因此新增 `model.slow` 标记（仅对**实测**过的模型设置）：标记后 speedScore 直接记 0，
 * 不再由失真的探测延迟给分。这是诚实的修正，不是臆造的惩罚项。
 */
export function scoreEntry(entry, verdict) {
    if (!entry) return 0;
    if (!verdict || verdict.ok !== true) return 0;
    const freeScore = tierFreeScore(entry, verdict);
    const provider = scoringProvider(entry, verdict);
    const model = resolveModel(provider, entry);
    // 实测已知慢的模型（推理型）不给速度分：探测延迟无法代表真实吞吐。
    const speedScore = (model && model.slow)
        ? 0
        : clamp01(1 - (verdict.latencyMs || 0) / 3000);
    const jsonScore = verdict.jsonOk ? 1 : 0.5; // 0.5 = 去掉 response_format 后可用
    const stability = clamp01(stabilityOf(verdict));
    const quotaRisk = quotaRiskOf(verdict);
    return 0.30 * freeScore + 0.20 * speedScore + 0.25 * jsonScore + 0.25 * stability - quotaRisk;
}

function priorityOf(entry, verdict) {
    const p = scoringProvider(entry, verdict);
    return p && typeof p.priority === 'number' ? p.priority : 0;
}

function latencyOf(verdict) {
    return verdict && typeof verdict.latencyMs === 'number' ? verdict.latencyMs : Infinity;
}

function isBetter(a, b) {
    if (a.score !== b.score) return a.score > b.score;
    const la = latencyOf(a.verdict);
    const lb = latencyOf(b.verdict);
    if (la !== lb) return la < lb;                       // latencyMs 升序
    const pa = priorityOf(a.entry);
    const pb = priorityOf(b.entry);
    if (pa !== pb) return pa > pb;                       // provider.priority 降序
    return (a.entry.createdAt || 0) < (b.entry.createdAt || 0); // createdAt 升序
}

/**
 * 在给定 Key 中选出最优。
 * @param {Array} entries
 * @returns {{entry:object, verdict:object|null, score:number}|null}
 */
export function pickBestKey(entries) {
    const list = Array.isArray(entries) ? entries.filter((e) => e && e.key) : [];
    if (list.length === 0) return null;
    let best = null;
    for (const e of list) {
        const verdict = getVerdict(e.id);
        const score = scoreEntry(e, verdict);
        const cand = { entry: e, verdict, score };
        if (!best || isBetter(cand, best)) best = cand;
    }
    return best;
}

/**
 * 读 aiKeyStore 全部 Key，返回最优 entry；无 Key 返回 null。不修改任何状态。
 * @returns {object|null}
 */
export function getBestKeyEntry() {
    let keys = [];
    try {
        keys = getAllKeys();
    } catch (e) {
        return null;
    }
    if (!Array.isArray(keys) || keys.length === 0) return null;
    const best = pickBestKey(keys);
    return best ? best.entry : null;
}
