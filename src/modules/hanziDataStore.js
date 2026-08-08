// 汉字笔画数据离线存储与检索模块（v2.9.8 新增）
// ============================================================================
// 设计目标：
//   1. 完全离线可用 — 数据源为 public/hanzi-data/hanzi-data.bin（11.75MB Gzip 二进制，
//      解压后为 9574 个汉字的 JSON 字典），不依赖任何 CDN。
//   2. 主线程零阻塞 — 使用 Web Worker 异步 fetch + gunzip 解压，主线程仅在接收结果时
//      做一次 structured clone（约几百毫秒，一次性开销）。
//   3. 可扩展新汉字 — 通过 setCharData/importCustomData 接口支持运行时插入冷僻字、
//      新造字；通过 exportCustomData/persistCustomData 支持 localStorage 持久化，
//      为"通过代码自行制造新汉字 JSON 数据"的后续探索预留空间。
//   4. 检索 O(1) — 加载完成后字符查询为对象属性访问（哈希表）。
//
// 数据结构（单个汉字）：
//   {
//     strokes:    string[]         — SVG 路径数组（MakeMeAHanzi 坐标系：x 0-1024, y -124~900）
//     medians:    number[][][]     — 每一笔的中心线坐标序列 [[[x,y],[x,y],...], ...]
//     radStrokes: number[] | undefined — 偏旁部首对应的笔画索引（如 [0,1,2] 表示前三笔是偏旁）
//   }
//
// 数据源格式与压缩方案详见 docs/离线汉字数据方案_v2.9.8.md
// ============================================================================

import { gunzipSync } from 'fflate';

// 数据源 URL（Vite public 目录，构建后位于站点 /hanzi-data/）
// v3.0.2：加载顺序调整为 embedded.js → .bin → CDN 逐字 fallback
//   根因：IDM 等下载插件会拦截 .bin 后缀的大文件请求接管为下载，
//         导致浏览器 fetch 拿到空响应、hanzi-data.bin 加载失败、笔画笔顺缺失。
//   embedded.js 是 .js 后缀，IDM 不拦截；用 <script> 加载后从 window.HANZI_DATA_BASE64 取值。
//   .bin 仍作为 Worker 主线程降级路径（puppeteer 内部 headless Chrome 无 IDM，.bin 可正常 fetch）。
// v2.9.8：使用 import.meta.env.BASE_URL 适配 GitHub Pages 子路径部署（base: './'）
// 并通过 new URL 转为绝对 URL，确保 Web Worker 中也能正确 fetch（Worker 的 base 可能是 blob URL）
const _BASE = import.meta.env.BASE_URL;
const DATA_BIN_URL = new URL(`${_BASE}hanzi-data/hanzi-data.bin`, location.href).href;
const DATA_JS_URL = new URL(`${_BASE}hanzi-data/hanzi-data-embedded.js`, location.href).href;

// 网络备选数据源（hanzi-writer 官方 CDN，仅在内置+自定义数据均无此字时使用）
// 与 hanzi-writer 默认 charDataLoader 一致，确保冷僻字也能在线获取
const NETWORK_DATA_BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/';

const CUSTOM_STORAGE_KEY = 'calligraphy_custom_hanzi_data_v1';

// 内部状态
let _charDataMap = null;            // 解压后的字典对象 { 字: {strokes, medians, radStrokes} }
let _customDataMap = new Map();     // 用户自定义/扩展字符数据（查询优先级高于内置数据）
let _networkCache = new Map();      // 网络加载的字符数据缓存（内存，不自动持久化）
let _readyPromise = null;           // 加载完成 Promise
let _loadError = null;              // 加载错误（用于诊断）
let _worker = null;                 // Web Worker 实例（解压完成后终止）

/**
 * 通过 <script> 标签加载 hanzi-data-embedded.js（绕开 IDM 对 .bin 的拦截）。
 * embedded.js 把 Base64 字符串挂到 window.HANZI_DATA_BASE64，本函数负责 atob + gunzip + JSON.parse。
 * @returns {Promise<void>}
 */
function _loadViaEmbeddedScript() {
    return new Promise((resolve, reject) => {
        // 已加载过则直接取值（幂等）
        if (typeof window !== 'undefined' && window.HANZI_DATA_BASE64) {
            try {
                _charDataMap = _decodeEmbeddedBase64(window.HANZI_DATA_BASE64);
                console.info(`[hanziData] embedded.js 数据加载完成（已缓存），共 ${Object.keys(_charDataMap).length} 字`);
                resolve();
                return;
            } catch (e) {
                reject(e);
                return;
            }
        }
        const script = document.createElement('script');
        script.src = DATA_JS_URL;
        script.async = true;
        script.onload = () => {
            try {
                if (!window.HANZI_DATA_BASE64) {
                    throw new Error('embedded.js 加载完成但 window.HANZI_DATA_BASE64 为空');
                }
                _charDataMap = _decodeEmbeddedBase64(window.HANZI_DATA_BASE64);
                console.info(`[hanziData] embedded.js 数据加载完成，共 ${Object.keys(_charDataMap).length} 字`);
                resolve();
            } catch (e) {
                reject(e);
            }
        };
        script.onerror = () => reject(new Error('embedded.js 加载失败（网络错误或文件不存在）'));
        document.head.appendChild(script);
    });
}

/** 解码 embedded.js 的 Base64+Gzip 数据为字典对象 */
function _decodeEmbeddedBase64(base64Str) {
    // atob 返回二进制字符串，逐字节写入 Uint8Array
    const binary = atob(base64Str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const decompressed = gunzipSync(bytes);
    const jsonStr = new TextDecoder('utf-8').decode(decompressed);
    return JSON.parse(jsonStr);
}

/**
 * 初始化汉字数据加载（幂等，可重复调用）。
 * 返回 Promise，resolve 后即可同步调用 getCharData。
 * v3.0.2：加载顺序调整为 embedded.js（<script>，绕开 IDM 拦截 .bin）
 *   → .bin Worker（puppeteer 内部无 IDM）→ .bin 主线程降级 → CDN 逐字 fallback。
 */
export function initHanziData() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = new Promise((resolve, reject) => {
        // 1. 优先用 <script> 加载 embedded.js（绕开 IDM 对 .bin 的拦截）
        _loadViaEmbeddedScript().then(resolve).catch((embeddedErr) => {
            console.warn('[hanziData] embedded.js 加载失败，降级到 .bin Worker:', embeddedErr.message || embeddedErr);
            // 2. embedded.js 失败 → 降级到 Web Worker + .bin（puppeteer 内部无 IDM，.bin 可正常 fetch）
            _loadViaWorker().then(resolve).catch(reject);
        });
    });
    return _readyPromise;
}

/** Web Worker 加载 .bin（主线程零阻塞） */
function _loadViaWorker() {
    return new Promise((resolve, reject) => {
        try {
            _worker = new Worker(new URL('./hanziDataWorker.js', import.meta.url), { type: 'module' });
            const timeoutId = setTimeout(() => {
                // 30 秒未就绪，降级主线程
                console.warn('[hanziData] Worker 加载超时，降级主线程');
                try { _worker.terminate(); } catch (_) {}
                _fallbackMainThread().then(resolve).catch(reject);
            }, 30000);

            _worker.onmessage = (e) => {
                if (e.data && e.data.type === 'ready') {
                    clearTimeout(timeoutId);
                    _charDataMap = e.data.map;
                    try { _worker.terminate(); } catch (_) {}
                    _worker = null;
                    console.info(`[hanziData] 离线数据加载完成（.bin Worker），共 ${Object.keys(_charDataMap).length} 字`);
                    resolve();
                } else if (e.data && e.data.type === 'error') {
                    clearTimeout(timeoutId);
                    console.warn('[hanziData] Worker 报错，降级主线程:', e.data.error);
                    try { _worker.terminate(); } catch (_) {}
                    _worker = null;
                    _fallbackMainThread().then(resolve).catch(reject);
                }
            };
            _worker.onerror = (err) => {
                clearTimeout(timeoutId);
                console.warn('[hanziData] Worker 异常，降级主线程:', err.message || err);
                try { _worker.terminate(); } catch (_) {}
                _worker = null;
                _fallbackMainThread().then(resolve).catch(reject);
            };
            _worker.postMessage({ type: 'load', url: DATA_BIN_URL });
        } catch (e) {
            console.warn('[hanziData] Worker 创建失败，降级主线程:', e);
            _worker = null;
            _fallbackMainThread().then(resolve).catch(reject);
        }
    });
}

/** 主线程降级加载（Worker 不可用时） */
async function _fallbackMainThread() {
    // 1. 先尝试 .bin（puppeteer 内部无 IDM，.bin 可正常 fetch）
    try {
        const resp = await fetch(DATA_BIN_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();
        const compressed = new Uint8Array(buf);
        const decompressed = gunzipSync(compressed);
        const jsonStr = new TextDecoder('utf-8').decode(decompressed);
        _charDataMap = JSON.parse(jsonStr);
        console.info(`[hanziData] 主线程降级加载完成（.bin），共 ${Object.keys(_charDataMap).length} 字`);
        return;
    } catch (binErr) {
        console.warn('[hanziData] 主线程 .bin 降级失败，最后尝试 embedded.js:', binErr.message || binErr);
    }
    // 2. .bin 也失败（如用户浏览器被 IDM 拦截且 Worker 也挂了）→ 最后尝试 embedded.js
    try {
        await _loadViaEmbeddedScript();
    } catch (err) {
        _loadError = err;
        console.error('[hanziData] 全部加载路径均失败（embedded.js + .bin Worker + .bin 主线程）:', err);
        // 最终降级：抛出错误，让上层处理（getCharDataAsync 会逐字走 CDN fallback）
        throw err;
    }
}

/** 返回加载完成 Promise（外部等待用） */
export function ready() {
    if (!_readyPromise) {
        // 未显式 init 时自动启动
        return initHanziData();
    }
    return _readyPromise;
}

/** 是否已加载完成（同步检查） */
export function isReady() {
    return _charDataMap !== null;
}

/** 加载错误信息（用于诊断） */
export function getLoadError() {
    return _loadError;
}

/**
 * 查询字符笔画数据（加载完成后同步调用）。
 * @param {string} char 单个汉字
 * @returns {{strokes:string[], medians:number[][][], radStrokes?:number[]}|null}
 *          返回深拷贝，防止外部修改污染内部数据；查无返回 null
 */
export function getCharData(char) {
    const ch = char.charAt(0);
    // 自定义数据优先
    if (_customDataMap.has(ch)) {
        return _cloneData(_customDataMap.get(ch));
    }
    if (_charDataMap && Object.prototype.hasOwnProperty.call(_charDataMap, ch)) {
        return _cloneData(_charDataMap[ch]);
    }
    return null;
}

/**
 * 异步查询字符笔画数据（含网络备选）。
 * 加载优先级：自定义数据 > 内置数据 > 网络缓存 > 网络加载（仅在线时）。
 * 网络加载成功后自动缓存到内存 _networkCache，下次查询直接命中缓存。
 * 离线（navigator.onLine === false）时不尝试网络加载，直接返回 null。
 * @param {string} char 单个汉字
 * @returns {Promise<{strokes:string[], medians:number[][][], radStrokes?:number[]}|null>}
 */
export async function getCharDataAsync(char) {
    const ch = char.charAt(0);
    // 1. 自定义数据优先
    if (_customDataMap.has(ch)) {
        return _cloneData(_customDataMap.get(ch));
    }
    // 2. 内置数据
    if (_charDataMap && Object.prototype.hasOwnProperty.call(_charDataMap, ch)) {
        return _cloneData(_charDataMap[ch]);
    }
    // 3. 网络缓存（之前从网络加载过）
    if (_networkCache.has(ch)) {
        return _cloneData(_networkCache.get(ch));
    }
    // 4. 网络加载备选（仅在线时）
    if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
            const resp = await fetch(NETWORK_DATA_BASE + encodeURIComponent(ch) + '.json');
            if (resp.ok) {
                const data = await resp.json();
                const normalized = _normalizeData(data);
                _networkCache.set(ch, normalized);
                console.info(`[hanziData] 网络备选加载"${ch}"成功（已缓存）`);
                return _cloneData(normalized);
            }
        } catch (e) {
            console.warn(`[hanziData] 网络备选加载"${ch}"失败:`, e.message || e);
        }
    }
    return null;
}

/** 检查字符是否有数据（内置或自定义，不含网络缓存） */
export function hasChar(char) {
    const ch = char.charAt(0);
    return _customDataMap.has(ch) ||
        (_charDataMap !== null && Object.prototype.hasOwnProperty.call(_charDataMap, ch));
}

/**
 * 插入或覆盖单个自定义字符数据（用于冷僻字、新造字）。
 * 数据结构会被规范化校验，不合法字段会被忽略。
 * @param {string} char 单个汉字
 * @param {{strokes:string[], medians:number[][][], radStrokes?:number[]}} data
 */
export function setCharData(char, data) {
    const ch = char.charAt(0);
    _customDataMap.set(ch, _normalizeData(data));
}

/** 批量导入自定义字符数据 */
export function importCustomData(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const [ch, data] of Object.entries(obj)) {
        _customDataMap.set(ch, _normalizeData(data));
    }
}

/** 导出全部自定义字符数据（用于持久化或分享） */
export function exportCustomData() {
    const result = {};
    for (const [ch, data] of _customDataMap) {
        result[ch] = data;
    }
    return result;
}

/** 自定义数据数量 */
export function getCustomCount() {
    return _customDataMap.size;
}

/** 持久化自定义数据到 localStorage（用户添加的冷僻字在刷新后仍可用） */
export function persistCustomData() {
    try {
        localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(exportCustomData()));
        return true;
    } catch (e) {
        console.warn('[hanziData] 自定义数据持久化失败（可能超出 localStorage 配额）:', e);
        return false;
    }
}

/** 从 localStorage 加载自定义数据 */
export function loadCustomData() {
    try {
        const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
        if (raw) {
            importCustomData(JSON.parse(raw));
            console.info(`[hanziData] 从 localStorage 恢复 ${_customDataMap.size} 个自定义字符`);
        }
    } catch (e) {
        console.warn('[hanziData] 自定义数据加载失败:', e);
    }
}

/** 清空自定义数据 */
export function clearCustomData() {
    _customDataMap.clear();
    try { localStorage.removeItem(CUSTOM_STORAGE_KEY); } catch (_) {}
}

/** 清空网络缓存（内存中从 CDN 加载的冷僻字数据） */
export function clearNetworkCache() {
    _networkCache.clear();
}

/** 网络缓存数量 */
export function getNetworkCacheCount() {
    return _networkCache.size;
}

/**
 * 将网络缓存合并到自定义数据并持久化到 localStorage。
 * 用于把在线加载的冷僻字"备份"到本地，离线后仍可用。
 * @returns {boolean} 是否持久化成功
 */
export function persistNetworkCache() {
    if (_networkCache.size === 0) return true;
    for (const [ch, data] of _networkCache) {
        if (!_customDataMap.has(ch)) {
            _customDataMap.set(ch, data);
        }
    }
    _networkCache.clear();
    return persistCustomData();
}

/**
 * 辅助：通过代码构造新汉字数据（规范数据结构、做基本校验）。
 * 为今后"通过代码自行制造新汉字 JSON 数据"预留入口。
 * @param {string[]} strokes SVG 路径数组（每笔一个 path d 字符串）
 * @param {number[][][]} medians 每笔中心线坐标 [[[x,y],...], ...]
 * @param {number[]|undefined} radStrokes 偏旁笔画索引（可选）
 * @returns {{strokes:string[], medians:number[][][], radStrokes?:number[]}}
 */
export function buildCharData(strokes, medians, radStrokes) {
    return _normalizeData({ strokes, medians, radStrokes });
}

/** 内部：规范化数据结构 */
function _normalizeData(data) {
    if (!data || typeof data !== 'object') {
        return { strokes: [], medians: [] };
    }
    const strokes = Array.isArray(data.strokes)
        ? data.strokes.filter(s => typeof s === 'string' && s.length > 0)
        : [];
    const medians = Array.isArray(data.medians)
        ? data.medians.map(stroke => Array.isArray(stroke)
            ? stroke.map(pt => Array.isArray(pt) ? pt.map(Number) : [0, 0])
            : [])
        : [];
    const radStrokes = Array.isArray(data.radStrokes)
        ? data.radStrokes.filter(n => Number.isInteger(n) && n >= 0 && n < strokes.length)
        : undefined;
    return radStrokes && radStrokes.length > 0
        ? { strokes, medians, radStrokes }
        : { strokes, medians };
}

/** 内部：深拷贝数据（防止外部修改污染内部） */
function _cloneData(data) {
    return {
        strokes: data.strokes.slice(),
        medians: data.medians.map(stroke => stroke.map(pt => pt.slice())),
        radStrokes: data.radStrokes ? data.radStrokes.slice() : undefined
    };
}

/** 获取所有可用字符（内置 + 自定义），用于统计或浏览 */
export function getAllChars() {
    const set = new Set();
    if (_charDataMap) {
        for (const ch of Object.keys(_charDataMap)) set.add(ch);
    }
    for (const ch of _customDataMap.keys()) set.add(ch);
    return Array.from(set);
}

/** 内置字符总数 */
export function getBuiltinCount() {
    return _charDataMap ? Object.keys(_charDataMap).length : 0;
}

/**
 * 构建笔画数索引（运行时按需构建）。
 * @returns {Object<number, string[]>} { 1: ["一","乙"], 2: ["十","丁",...], ... }
 */
export function getStrokeCountIndex() {
    const index = {};
    const all = getAllChars();
    for (const ch of all) {
        const data = getCharData(ch);
        if (data && data.strokes) {
            const count = data.strokes.length;
            if (!index[count]) index[count] = [];
            index[count].push(ch);
        }
    }
    return index;
}

// 启动时自动从 localStorage 恢复自定义数据（幂等）
if (typeof window !== 'undefined') {
    try { loadCustomData(); } catch (_) {}
}
