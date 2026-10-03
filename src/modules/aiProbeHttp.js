// v1.5.4 新增：AI 探测类模块共用的 HTTP 底座。
//
// 背景：aiKeyHealth（"挑一把能用的"）与 aiDiagnostics（"解释为什么不能用"）
// 是两个职责不同的模块，**业务逻辑必须保持分离**；但它们脚下的 HTTP 细节
// 曾经各自复制了一份，且已经开始漂移：
//   · joinUrl：一处 `.replace(/\/$/, '')`，一处 `.replace(/\/+$/, '')`
//     → 用户填 `https://api.x.com/v1//` 时，两条路径拼出的 URL 不同，
//       于是「体检绿、优选红」这类无法复现的怪现象就会出现。
//   · combineSignals：aiKeyHealth 版缺 `outerSignal === undefined` 的显式
//     短路语义（两者行为恰好相同，但意图不明）；aiDiagnostics 版忘了在
//     原生 `AbortSignal.any` 可用时也保留旧监听器的回收路径。
// 因此把「URL 拼接 / 在线判定 / 带超时的 fetch / Anthropic 版本头」这四个
// 纯基础设施抽到这里，成为唯一事实来源；两个模块继续各自拥有请求体构造、
// 错误分类与结论裁决。
//
// 约束（与全仓一致）：不使用 Web Worker；不依赖 DOM；可在 node 环境单测。

/** Anthropic Messages API 的版本头是硬性要求（缺失直接 400） */
export const ANTHROPIC_VERSION = '2023-06-01';

/**
 * 拼接 Base URL 与路径。
 * 剥掉 Base 末尾的**全部**斜杠（用户常把 `/v1/` 甚至 `/v1//` 粘进来），
 * 并保证路径以单个斜杠开头再拼接，避免出现 `//chat/completions`。
 */
export function joinUrl(base, path) {
    const b = String(base || '').trim().replace(/\/+$/, '');
    const p = String(path || '');
    if (!p) return b;
    return b + (p.startsWith('/') ? p : '/' + p);
}

/**
 * 是否联网。宿主环境可能没有 navigator（node / SSR），此时一律视为在线，
 * 由真实的 fetch 失败去报错 —— 不要用「猜」来代替「试」。
 */
export function isOnline() {
    try {
        return !(typeof navigator !== 'undefined' && navigator.onLine === false);
    } catch {
        return true;
    }
}

/**
 * 合并两个 AbortSignal（原生 AbortSignal.any 不可用时降级为手动转发）。
 * 旧实现的两个细节坑：
 *   1. 手动转发时监听器用了 `{ once: true }`，但**从未移除**另一个信号上的
 *      监听器 —— 外部 signal 长期存活（如用户手动中断用的那个）时会积累监听器。
 *   2. 未短路「只有一个信号」的情形，会白造一个 AbortController。
 * 这里两者都处理掉，并在原生可用时也走同一条「只暴露一个 signal」的路径。
 */
export function combineSignals(a, b) {
    if (!a) return b || undefined;
    if (!b) return a;
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        return AbortSignal.any([a, b]);
    }
    const merged = new AbortController();
    const forward = () => {
        merged.abort();
        // 立即回收：两个信号都可能在后续被反复使用（例如同一个外部 signal
        // 贯穿整轮探测），不清掉就会逐次累积。
        a.removeEventListener('abort', forward);
        b.removeEventListener('abort', forward);
    };
    a.addEventListener('abort', forward);
    b.addEventListener('abort', forward);
    if (a.aborted || b.aborted) forward();
    return merged.signal;
}

/**
 * 带超时的 fetch。
 * @param {string} url
 * @param {RequestInit} init
 * @param {number} timeoutMs 本次请求的超时（超时以 AbortError 抛出）
 * @param {AbortSignal} [outerSignal] 外部取消信号（用户点「中断」）
 */
export async function timedFetch(url, init, timeoutMs, outerSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: combineSignals(outerSignal, ctrl.signal) });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 统一的消息头构造。两个模块此前各写一份，Anthropic 的 `anthropic-version`
 * 常量也曾各写一遍（改一处漏一处是迟早的事）。
 * @param {{protocol?:string, authStyle?:string}} provider
 * @param {string} key
 */
export function buildAuthHeaders(provider, key) {
    const h = { 'Content-Type': 'application/json' };
    if (provider && provider.protocol === 'anthropic') {
        h['x-api-key'] = key;
        h['anthropic-version'] = ANTHROPIC_VERSION;
        return h;
    }
    const authStyle = (provider && provider.authStyle) || 'bearer';
    if (authStyle !== 'query-key') h['Authorization'] = 'Bearer ' + key;
    return h;
}

/**
 * query-key 鉴权（如 Google Gemini）把 Key 放进查询串。
 * 单独抽出来是因为两个模块都要用，而「URL 里已经有 ?」的分支极易写漏。
 */
export function withQueryKey(url, key) {
    return url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
}
