// v3.0.0 模块B：AI 组词补齐 + 拼音纠错（多引擎：注册表驱动）
// 核心优化：本地预分流(单/多音字) + 三模式提示词 + 缓存穿透修复 + 进度修复 + 重试机制 + 5分钟超时
// v3.0.4：删除本地前缀识别，统一走 aiProviders 注册表；模型覆盖改为按引擎作用域
//
// ── v1.3.0：缓存 schema 化（key = ai_zuci_cache_v2，自动迁移 v1）────────────────
// 旧结构是一个裸 Map `{ [字]: entry }`：没有版本、没有来源、没有时间戳、没有回收策略，
// AI 产出 / 用户手改 / 导入数据混在一个无差别空间里且无限增长。现改为带 schema 的条目：
//   {
//     schemaVersion: 2,
//     source: 'user' | 'import' | 'ai' | 'default',  // 来源（provenance）
//     provider: string | null,                        // source==='ai' 时的引擎 id
//     model:    string | null,                        // source==='ai' 时的模型 id
//     updatedAt: number,                              // epoch ms，TTL/回收依据
//     pinyin: string, pinyinFixed: boolean, pinyinChecked: boolean,
//     zuci: string[], userEdited: boolean
//   }
//   · 兼容字段（迁移自 v1，仍被 srcTier / 导入流程使用）：src / wordsDetail /
//     pinyinVariants / userSpecified。
//
// ── TTL / 回收策略 ─────────────────────────────────────────────────────────
//   · source==='user'（或 userEdited）—— 永不回收。
//   · source==='ai'                     —— AI_ENTRY_TTL_MS（默认 90 天）后过期。
//   · 'default' / 'import'              —— DEFAULT_ENTRY_TTL_MS（180 天）后过期。
//   · 条目总数上限 MAX_CACHE_ENTRIES=3000，超出时**优先淘汰最先过期的非用户条目**。
//   GC 惰性执行：每次页面加载至多一次（首次访问缓存时触发），不在每次读取时全量扫描。
//   可用 gcCache() / getCacheStats() 手动触发与观测。
//
// ── 数据层校验 ─────────────────────────────────────────────────────────────
//   所有写入（AI 产出 / 手动修改 / 导入预填充）统一经 utils/sanitize.js 的
//   sanitizeChar / sanitizeZuci / sanitizePinyin 清洗后再落缓存 —— 在数据层拦截脏数据，
//   而不是只在渲染时兜底。
//
// ── 来源查询 ───────────────────────────────────────────────────────────────
//   getPinyinSource(char) 供渲染层做「用户 / AI / 默认」来源徽标，返回
//   'user' | 'ai' | 'default' | null（'import' 归入 'default'）。

import cnchar from 'cnchar';
import words from 'cnchar-words';
import customZuCi from '../data/customZuCi.js';
import { pinyin } from './pinyin.js';
import { getProvider, resolveProviderId, detectApiKeyType, buildRequestBody } from './aiProviders.js';
import { sanitizeChar, sanitizeZuci, sanitizePinyin } from '../utils/sanitize.js';

// 注册 cnchar 插件（幂等）
try { cnchar.use(words); } catch { /* 忽略重复注册 */ }

// 向后兼容导出（契约 §3.2/§3.5）：导出名与旧语义均保持不变
export { detectApiKeyType };

const CACHE_KEY = 'ai_zuci_cache_v2';        // 新 schema 存储键
const LEGACY_CACHE_KEY = 'ai_zuci_cache_v1'; // 迁移来源（迁移后删除）
const CACHE_SCHEMA_VERSION = 2;

// ── v1.5.4：超时分级（旧实现是全局固定 5 分钟，对大批量生字明显不够用）────────────
// 用户实测：200+ 生字时 5 分钟会被硬中断，明明还能继续却报「超时」。
// 现按任务类型分级，并让「组词 / 拼音」的额度随生字数增长：
//   · 组词（fillMissing，不含拼音校验）  ：基准 5 min；生字 > 200 时，每多 20 字 +2 min
//   · 拼音（fixPinyin 单独，或与组词并存）：基准 5 min，同样按每 20 字 +2 min 增长
//   · 全量检测（fullCheck，三模式全跑）  ：固定 10 min（本身已是逐字校验，不再叠加）
// 注：额度以「超出基准的那部分生字」计（(n - 200) / 20 向上取整），200 字以内不延长。
export const TIMEOUT_BASE_MS = {
    zuci: 5 * 60 * 1000,
    pinyin: 5 * 60 * 1000,
    full: 10 * 60 * 1000
};
export const TIMEOUT_GROWTH_THRESHOLD = 200;   // 生字超过这个数才开始延长
export const TIMEOUT_GROWTH_STEP_CHARS = 20;   // 每 20 个生字…
export const TIMEOUT_GROWTH_STEP_MS = 2 * 60 * 1000; // …加 2 分钟

/**
 * 计算本次任务的超时额度（毫秒）。
 * @param {number} charCount 生字数量
 * @param {{fullCheck?:boolean, fixPinyin?:boolean, fillMissing?:boolean}} opts
 * @returns {number}
 */
export function computeTimeoutMs(charCount, { fullCheck = false, fixPinyin = false, fillMissing = false } = {}) {
    const n = Number.isFinite(charCount) && charCount > 0 ? charCount : 0;
    if (fullCheck) return TIMEOUT_BASE_MS.full;
    // 组词 / 拼音都取 5 分钟基准，取二者中「适用」的那个（并存时同一份额度，不叠加）
    const base = (fillMissing || fixPinyin) ? Math.max(
        fillMissing ? TIMEOUT_BASE_MS.zuci : 0,
        fixPinyin ? TIMEOUT_BASE_MS.pinyin : 0
    ) : TIMEOUT_BASE_MS.zuci;
    const extraChars = Math.max(0, n - TIMEOUT_GROWTH_THRESHOLD);
    const steps = Math.ceil(extraChars / TIMEOUT_GROWTH_STEP_CHARS);
    return base + steps * TIMEOUT_GROWTH_STEP_MS;
}

/** 超时额度的可读描述，供 UI / 错误文案使用（如「5 分钟」/「9 分钟（300 字）」）。 */
export function describeTimeout(ms, charCount = 0) {
    const mins = Math.round(ms / 60000);
    return charCount > TIMEOUT_GROWTH_THRESHOLD
        ? `${mins} 分钟（${charCount} 字，已按每 20 字 +2 分钟延长）`
        : `${mins} 分钟`;
}

const MAX_RETRY = 3; // 弱模型 JSON 不稳定时的最大重试次数

// TTL 与容量上限
export const AI_ENTRY_TTL_MS = 90 * 24 * 60 * 60 * 1000;       // AI 条目 90 天
const DEFAULT_ENTRY_TTL_MS = 180 * 24 * 60 * 60 * 1000;        // default / import 条目 180 天
export const MAX_CACHE_ENTRIES = 3000;
// v1 迁移时保留的兼容字段（仍被 srcTier / 导入流程读取）
const CARRY_FIELDS = ['wordsDetail', 'pinyinVariants', 'userSpecified'];

// ========== 工具函数：引擎与模型解析（注册表驱动） ==========

function joinUrl(base, path) {
    return String(base || '').replace(/\/$/, '') + (path || '');
}

/** 从注册表挑选模型：wantFull 时优先 fullCheck 强模型，否则取默认模型。 */
function pickProviderModel(provider, wantFull) {
    const ms = (provider && Array.isArray(provider.models)) ? provider.models : [];
    if (wantFull) {
        const f = ms.find(m => m.fullCheck);
        if (f) return f;
    }
    return ms.find(m => !m.fullCheck) || ms[0] || null;
}

/**
 * 模型覆盖（补丁C 逃生门），改为按引擎作用域：
 *   优先读 ai_model_override_<providerId>；
 *   回退旧的全局 ai_model_override —— 仅对 deepseek / volcano 生效，避免污染新引擎。
 */
function readModelOverride(providerId) {
    try {
        if (providerId) {
            const scoped = localStorage.getItem('ai_model_override_' + providerId);
            if (scoped && scoped.trim()) return scoped.trim();
        }
        if (providerId === 'deepseek' || providerId === 'volcano') {
            const global = localStorage.getItem('ai_model_override');
            if (global && global.trim()) return global.trim();
        }
    } catch { /* localStorage 不可用时忽略 */ }
    return '';
}

/**
 * 解析生效引擎。签名保持不变（key 可以是字符串，也可以是 entry 对象）。
 * 解析顺序：entry.providerId → detectProviderId(形状唯一) → 旧前缀语义兜底 → unknown。
 * 模型解析顺序（v1.4.0 固化）：
 *   ai_model_override_<providerId> → entry.modelId → 注册表默认（fullCheck 强模型 / 首个模型）。
 * 返回结构保留 { type, endpoint, model, label, supportJsonMode }，并新增若干字段（不删旧字段）。
 */
export function getAiProvider(key, fullCheck = false) {
    const entry = (key && typeof key === 'object') ? key : null;
    const rawKey = entry ? entry.key : key;
    const providerId = resolveProviderId(rawKey, entry && entry.providerId);
    if (!providerId) {
        return {
            type: 'unknown', providerId: null, endpoint: '', baseUrl: '',
            chatPath: '/chat/completions', modelsPath: null, model: '',
            label: '未知', supportJsonMode: false, authStyle: 'bearer'
        };
    }
    const p = getProvider(providerId);
    const model = pickProviderModel(p, !!fullCheck);
    let modelId = model ? model.id : '';
    if (entry && entry.modelId) modelId = entry.modelId;
    const ov = readModelOverride(providerId);
    if (ov) modelId = ov; // 覆盖优先级最高（原逃生门语义）
    return {
        type: providerId,
        providerId,
        endpoint: joinUrl(p.baseUrl, p.chatPath),
        baseUrl: p.baseUrl,
        chatPath: p.chatPath,
        modelsPath: p.modelsPath,
        model: modelId,
        label: p.label,
        supportJsonMode: model ? (model.jsonMode !== false) : true,
        authStyle: p.authStyle || 'bearer'
    };
}

// ========== 工具函数：多音字判定（修复 pinyin-pro 兼容性） ==========
// pinyin-pro 的 multiple:true 返回空格分隔字符串（如 "cháng zhǎng"），不是数组，必须双判
function isPolyphone(char) {
    try {
        const res = pinyin(char, { multiple: true, toneType: 'symbol' });
        if (Array.isArray(res)) return res.length > 1;
        if (typeof res === 'string') return res.trim().split(/\s+/).length > 1;
        return false;
    } catch {
        return false;
    }
}

// ========== 工具函数：缓存读写（v2 schema） ==========

let _cache = null;      // 内存缓存（懒加载，避免每次读都 JSON.parse）
let _gcDone = false;    // 本次页面加载是否已跑过 GC

function _readV2() {
    try {
        const m = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    } catch { return {}; }
}

function _writeV2(map) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch { /* 配额满则忽略 */ }
}

/** 把任意 patch 规整为 v2 条目形状（所有写入的唯一入口） */
function _buildEntry(patch) {
    const src = (patch.source === 'user' || patch.source === 'import' ||
        patch.source === 'ai' || patch.source === 'default') ? patch.source : 'default';
    const entry = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        source: src,
        provider: patch.provider || null,
        model: patch.model || null,
        updatedAt: (typeof patch.updatedAt === 'number') ? patch.updatedAt : Date.now(),
        pinyin: sanitizePinyin(patch.pinyin),
        pinyinFixed: patch.pinyinFixed === true,
        pinyinChecked: patch.pinyinChecked === true,
        zuci: sanitizeZuci(patch.zuci),
        userEdited: patch.userEdited === true
    };
    if (patch.src) entry.src = patch.src; // 兼容字段：srcTier / 降级统计仍读它
    for (const f of CARRY_FIELDS) {
        if (patch[f] !== undefined) entry[f] = patch[f];
    }
    return entry;
}

/** 把 v1 条目升级为 v2 形状（推断 source，updatedAt 用 now 而非 0，避免被 TTL 立即回收） */
function _upgradeV1Entry(old, now) {
    const userEdited = old.userEdited === true;
    const src = (typeof old.src === 'string') ? old.src : '';
    let source = 'default';
    if (userEdited) source = 'user';
    else if (src || old.provider) source = 'ai';
    let provider = old.provider || null;
    let model = old.model || null;
    if (!provider && src.indexOf(':') > 0) {
        provider = src.slice(0, src.indexOf(':'));
        model = model || src.slice(src.indexOf(':') + 1);
    }
    const patch = {
        source, provider, model, updatedAt: now,
        pinyin: old.pinyin,
        pinyinFixed: old.pinyinFixed,
        pinyinChecked: old.pinyinChecked,
        zuci: old.zuci,
        userEdited
    };
    if (src) patch.src = src;
    for (const f of CARRY_FIELDS) if (old[f] !== undefined) patch[f] = old[f];
    return _buildEntry(patch);
}

/**
 * 迁移 ai_zuci_cache_v1 → v2（首次访问缓存时自动调用）。
 * 幂等：迁移后删除 v1 键，重复调用返回 0。
 * @returns {number} 迁移的条目数
 */
export function migrateCacheV1toV2() {
    let raw;
    try { raw = localStorage.getItem(LEGACY_CACHE_KEY); } catch { return 0; }
    if (!raw) return 0;

    let count = 0;
    try {
        const v1 = JSON.parse(raw);
        if (v1 && typeof v1 === 'object' && !Array.isArray(v1)) {
            const v2 = _cache || _readV2();
            const now = Date.now();
            for (const [rawChar, old] of Object.entries(v1)) {
                const char = sanitizeChar(rawChar);
                if (!char || !old || typeof old !== 'object') continue;
                if (v2[char]) continue; // 已有 v2 数据不覆盖
                v2[char] = _upgradeV1Entry(old, now);
                count++;
            }
            _writeV2(v2);
            _cache = v2;
        }
    } catch { /* 损坏的 v1：直接丢弃，仅保证 v1 键被移除 */ }
    try { localStorage.removeItem(LEGACY_CACHE_KEY); } catch { /* 忽略 */ }
    return count;
}

/** 条目的过期时间点（epoch ms） */
function _expiryOf(entry) {
    const ttl = (entry.source === 'ai') ? AI_ENTRY_TTL_MS : DEFAULT_ENTRY_TTL_MS;
    return ((typeof entry.updatedAt === 'number') ? entry.updatedAt : 0) + ttl;
}

function _isUserEntry(entry) {
    return entry.source === 'user' || entry.userEdited === true;
}

/**
 * 惰性回收：过期清理 + 容量上限淘汰。
 * - 'user' 条目永不回收
 * - 'ai' 超 AI_ENTRY_TTL_MS、'default'/'import' 超 DEFAULT_ENTRY_TTL_MS 即删除
 * - 总数超 MAX_CACHE_ENTRIES 时，优先淘汰「最先过期」的非用户条目
 * @param {number} [now] 当前时间戳（便于测试注入）
 * @returns {{removed:number, remaining:number}}
 */
export function gcCache(now = Date.now()) {
    const map = _cache || _readV2();
    let removed = 0;

    for (const [char, entry] of Object.entries(map)) {
        if (!entry || typeof entry !== 'object') { delete map[char]; removed++; continue; }
        if (_isUserEntry(entry)) continue;                 // 用户条目永不回收
        if (now > _expiryOf(entry)) {                      // 超过该来源的 TTL
            delete map[char];
            removed++;
        }
    }

    const keys = Object.keys(map);
    if (keys.length > MAX_CACHE_ENTRIES) {
        const victims = keys
            .filter(c => map[c] && !_isUserEntry(map[c]))
            .map(c => ({ c, exp: _expiryOf(map[c]) }))
            .sort((a, b) => a.exp - b.exp);                // 最先过期者优先淘汰
        let over = keys.length - MAX_CACHE_ENTRIES;
        for (const v of victims) {
            if (over <= 0) break;
            delete map[v.c];
            removed++;
            over--;
        }
    }

    _cache = map;
    _writeV2(map);
    return { removed, remaining: Object.keys(map).length };
}

/**
 * 缓存统计（供设置面板 / 诊断使用）。
 * @returns {{total:number,user:number,ai:number,defaultCount:number,importCount:number,oldest:number|null,newest:number|null}}
 */
export function getCacheStats() {
    const map = loadCache();
    let user = 0, ai = 0, defaultCount = 0, importCount = 0;
    let oldest = Infinity, newest = -Infinity;
    for (const entry of Object.values(map)) {
        if (!entry || typeof entry !== 'object') continue;
        if (_isUserEntry(entry)) user++;
        else if (entry.source === 'ai') ai++;
        else if (entry.source === 'import') importCount++;
        else defaultCount++;
        const t = (typeof entry.updatedAt === 'number') ? entry.updatedAt : 0;
        if (t < oldest) oldest = t;
        if (t > newest) newest = t;
    }
    return {
        total: Object.keys(map).length,
        user, ai, defaultCount, importCount,
        oldest: (oldest === Infinity) ? null : oldest,
        newest: (newest === -Infinity) ? null : newest
    };
}

/**
 * 拼音来源（供渲染层做「用户 / AI / 默认」徽标）。
 * 'import' 归入 'default'（非 AI、非手动）。
 * @param {string} char
 * @returns {'user'|'ai'|'default'|null} 无该字条目时返回 null
 */
export function getPinyinSource(char) {
    const entry = loadCache()[char];
    if (!entry || typeof entry !== 'object') return null;
    if (_isUserEntry(entry)) return 'user';
    if (entry.source === 'ai') return 'ai';
    return 'default';
}

/** 懒加载缓存：首次访问时迁移 v1 并跑一次 GC（不在每次读取时扫描） */
function loadCache() {
    if (_cache) return _cache;
    migrateCacheV1toV2();
    if (!_cache) _cache = _readV2();
    if (!_gcDone) { _gcDone = true; gcCache(); }
    return _cache;
}

function saveCache(map) {
    _cache = map;
    _writeV2(map);
}

export function getAiZuci(char) {
    const cache = loadCache();
    const entry = cache[char];
    if (entry) {
        // ★ v1.2.0：手动修改最高优先（userEdited 时 zuci 空则返回 null）
        if (entry.userEdited === true) {
            if (Array.isArray(entry.zuci) && entry.zuci.length > 0) {
                return entry.zuci.slice(0, 2);
            }
            return null; // 手动清空组词 → 不回落 AI/默认
        }
        if (Array.isArray(entry.zuci) && entry.zuci.length > 0) {
            return entry.zuci.slice(0, 2);
        }
    }
    return null;
}

export function getAiPinyin(char) {
    const cache = loadCache();
    const entry = cache[char];
    if (entry) {
        // ★ v1.2.0：userEdited 条目 pinyinFixed 恒为 true（updateAiZuciCache 已强制），天然满足原条件
        if (entry.userEdited === true && typeof entry.pinyin === 'string' && entry.pinyin) {
            return entry.pinyin;
        }
        if (entry.pinyinFixed === true && typeof entry.pinyin === 'string' && entry.pinyin) {
            return entry.pinyin;
        }
    }
    return null;
}

// ========== v1.2.0：手动修改模式（写缓存） ==========
// loadCache / saveCache 为模块私有函数，本模块内直接调用

/**
 * 手动修改写入缓存（优先级最高：手动 > AI > 默认词库）
 * 强制 pinyinFixed:true / pinyinChecked:true / userEdited:true / source:'user'，
 * 否则 getAiPinyin() 只认 pinyinFixed===true 不返回手动拼音；
 * 留空字段由旧值兜底（组词留空 = 保留旧值）。
 * 所有写入经 sanitize* 清洗（数据层闸门）。
 * @param {string} char - 汉字
 * @param {{zuci?:string[], pinyin?:string}} data - 手动输入
 */
export function updateAiZuciCache(char, data) {
    const c = sanitizeChar(char);
    if (!c || !data) return;
    const cache = loadCache();
    const prev = cache[c] || {};
    const prevZuci = Array.isArray(prev.zuci) ? prev.zuci : [];
    const hasNewZuci = Array.isArray(data.zuci) && data.zuci.length > 0;
    const rawPinyin = (typeof data.pinyin === 'string' && data.pinyin.trim())
        ? data.pinyin : (prev.pinyin || '');
    cache[c] = _buildEntry({
        ...prev,
        zuci: hasNewZuci ? sanitizeZuci(data.zuci).slice(0, 2) : prevZuci,
        pinyin: rawPinyin,
        pinyinFixed: true,
        pinyinChecked: true,
        userEdited: true,
        source: 'user',
        // 内容已由用户改写 → 不再声称由某个 AI 引擎产出（src 兼容字段保留，供 srcTier 追溯）
        provider: null,
        model: null,
        updatedAt: Date.now()
    });
    saveCache(cache);
}

/**
 * 清除手动修改标记（浮层"清除手动修改"按钮用），回到 AI/默认 逻辑
 * @param {string} char - 汉字
 */
export function clearUserEdit(char) {
    const c = sanitizeChar(char);
    if (!c) return;
    const cache = loadCache();
    const entry = cache[c];
    if (!entry || entry.userEdited !== true) return;

    delete entry.userEdited;
    // 来源回退：原本有 AI 出处则回到 'ai'（并从 src 还原引擎/模型），否则回到 'default'
    if (entry.source === 'user') {
        const hasAi = !!(entry.src || entry.provider);
        entry.source = hasAi ? 'ai' : 'default';
        if (hasAi && entry.src && entry.src.indexOf(':') > 0) {
            entry.provider = entry.src.slice(0, entry.src.indexOf(':'));
            entry.model = entry.model || entry.src.slice(entry.src.indexOf(':') + 1);
        }
    }
    // 清除后若该字已无任何数据与出处（原本就是默认词库），整体删除条目
    const hasZuci = Array.isArray(entry.zuci) && entry.zuci.length > 0;
    const hasPinyin = !!entry.pinyin;
    const hasAi = entry.source === 'ai' || !!entry.src;
    if (!hasZuci && !hasPinyin && !hasAi) delete cache[c];
    saveCache(cache);
}

/**
 * 判断该字是否处于手动修改状态
 * @param {string} char - 汉字
 * @returns {boolean}
 */
export function isUserEdited(char) {
    const cache = loadCache();
    return !!(cache[char] && cache[char].userEdited === true);
}

/**
 * 批量预填充缓存（导入增强用）
 * 用户指定即视为已纠音：pinyinFixed:true / pinyinChecked:true / userSpecified:true，
 * 来源标记为 source:'import'。
 * @param {Object} charMap { 字: {zuci:[], pinyin:'', pinyinVariants:[], wordsDetail:[], userSpecified:true} }
 * @returns {number} 实际写入字数
 */
export function preloadAiZuciCache(charMap) {
    if (!charMap || typeof charMap !== 'object') return 0;
    const cache = loadCache();
    let n = 0;
    for (const [rawChar, data] of Object.entries(charMap)) {
        const char = sanitizeChar(rawChar);
        if (!char || !data || typeof data !== 'object') continue;
        const prev = cache[char] || {};
        const prevZuci = Array.isArray(prev.zuci) ? prev.zuci : [];
        const hasNewZuci = Array.isArray(data.zuci) && data.zuci.length > 0;
        cache[char] = _buildEntry({
            zuci: hasNewZuci ? data.zuci : prevZuci,
            pinyin: data.pinyin || prev.pinyin || '',
            pinyinFixed: true,                     // 用户指定即视为已纠音
            pinyinChecked: true,
            source: 'import',
            updatedAt: Date.now(),
            wordsDetail: Array.isArray(data.wordsDetail) ? data.wordsDetail : (prev.wordsDetail || []),
            pinyinVariants: Array.isArray(data.pinyinVariants) ? data.pinyinVariants : [],
            userSpecified: true
        });
        n++;
    }
    saveCache(cache);
    return n;
}

// ========== 工具函数：默认词库操作 ==========
export function isDefaultZuciOK(char) {
    try {
        const custom = customZuCi[char] || [];
        if (custom.length >= 2) return true;
        const w = cnchar.words(char);
        const twoChar = (w || []).filter(word => typeof word === 'string' && word.length === 2);
        return twoChar.length >= 2;
    } catch { return false; }
}

function getDefaultZuci(char) {
    try {
        const custom = customZuCi[char] || [];
        if (custom.length >= 2) return custom.slice(0, 2);
        const w = cnchar.words(char);
        const twoChar = (w || []).filter(word => typeof word === 'string' && word.length === 2);
        if (twoChar.length >= 2) return twoChar.slice(0, 2);
        return [...new Set([...custom, ...twoChar])].slice(0, 2);
    } catch { return []; }
}

// ========== 工具函数：健壮 JSON 解析 ==========
function extractJsonRobust(content) {
    if (!content || typeof content !== 'string') return null;
    let text = content.trim();
    // 预处理：去掉常见开场白、结束语
    text = text.replace(/^(好的|以下是|结果如下|为你生成|根据要求)[\s\S]{0,50}?[\n\r]/, '');
    text = text.replace(/[\n\r][\s\S]{0,100}?(如有问题|需要调整|请告知|希望对你有帮助)[\s\S]*$/, '');
    // 1. 直接解析
    try { return JSON.parse(text); } catch { /* 继续 */ }
    // 2. 剥离 markdown 代码块
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlock) {
        try { return JSON.parse(codeBlock[1].trim()); } catch { /* 继续 */ }
    }
    // 3. indexOf/lastIndexOf 截取首个完整 JSON 对象（比正则贪婪匹配更稳健）
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch { /* 继续 */ }
    }
    // 4. 提取数组
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
        try { return JSON.parse(text.slice(firstBracket, lastBracket + 1)); } catch { /* 继续 */ }
    }
    return null;
}

// ========== 核心：三模式提示词构建 ==========
// v1.5.2 提示词强化（针对弱模型 JSON 不稳 / 词性缺失 / 杜撰词语三类真实失效）：
//   1. 统一的「铁律」段前置：只输出 JSON、不得杜撰、不得人名地名、恰好 2 词、
//      拼音必须带声调且与词语读音一致、词性不得留空。
//   2. 每个模式都给 **few-shot 正例**（弱模型照抄样例的准确率远高于读规则）。
//   3. 显式禁止 markdown 代码块围栏 —— 它是"返回无法解析为 JSON"的头号原因。
//   4. 词性要求「两词不同」时给出可选值清单，避免模型自由发挥写出「其它」这类无用标注。
//   5. 强调 JSON 内不得出现未转义的换行与引号，避免弱模型把说明文字塞进字段。
const PROMPT_COMMON_RULES = `【铁律，必须全部遵守】
1. 只输出一个 JSON 对象，不要输出任何解释、前后缀、markdown 代码块（不要 \`\`\`json）。
2. 只处理用户列出的汉字，每个字恰好给出 2 个词，一个不多一个不少。
3. 词语必须是真实存在的【二字】常用词（长度严格为 2），且必须包含该字本身。
   禁止杜撰词、生造词、网络流行语、成语（四字）、四字以上短语、专业术语。
4. 严禁人名、地名、国名、机构名、商标名（如"李白""北京""苹果手机"）。
5. 两个词的词性必须不同（一个名词 + 一个动词 / 形容词 / 副词等），
   pos 字段只能从这些值里选：名词、动词、形容词、副词、量词、数词、代词、介词、连词、助词。
6. pinyin 与 p 字段必须带声调符号（如 máo tǎn），不得用数字声调（mao2 tan3）。
7. 拼音必须与该词在词典中的实际读音一致；多音字以词语中的读音为准。
8. JSON 内不得出现未转义的换行符或双引号。`;

function buildSystemPrompt(mode) {
    if (mode === 'fast') {
        // 快速组词模式：极致精简，仅补齐组词，不校验
        return `你是小学语文组词专家。你的唯一任务：给每个汉字组 2 个小学常用二字词。

${PROMPT_COMMON_RULES}

【正例】
输入：1. 毯（tǎn）
输出：{"chars":[{"char":"毯","pinyin":"tǎn","words":[{"w":"地毯","p":"dì tǎn","pos":"名词","note":"铺在地上的毯子"},{"w":"毛毯","p":"máo tǎn","pos":"名词","note":""}]}]}
（注：若两词恰好都是名词，请把其中一个换成词性不同的常用词，如"毯子"→"毯"加"铺毯"式动词搭配；确实无动词搭配时，两词词性可同为名词，但 pos 必须如实填写。）

输出格式（必须含 pos 和 note 字段，不得增删字段）：
{"chars":[{"char":"毯","pinyin":"tǎn","words":[{"w":"地毯","p":"dì tǎn","pos":"名词","note":""},{"w":"毛毯","p":"máo tǎn","pos":"名词","note":""}]}]}`;
    }
    if (mode === 'single_check') {
        // 单音字校验模式：核验已有组词，不纠错拼音
        return `你是小学语文组词专家。你的唯一任务：核验每个字已有的组词是否合适，不合适的替换成更合适的。

${PROMPT_COMMON_RULES}

【补充规则（本模式专属）】
- 单音字拼音唯一，pinyin_original 与 pinyin_corrected 必须相同，pinyin_fixed 固定为 false。
- 若"已有"里的词不合格（不存在 / 非二字 / 含人名地名 / 生僻），必须替换；
  合格的词要保留，不要为了"看起来有新意"而无故换词。
- fix_count 等于被替换的词数（按词计）；fixes 数组每项说明一个字被替换的原因。
  没有替换时 fix_count 为 0、fixes 为空数组 []。

【正例】
输入：1. 毯（tǎn） 已有：地毯/毛毯
输出：{"chars":[{"char":"毯","pinyin_original":"tǎn","pinyin_corrected":"tǎn","pinyin_fixed":false,"words":[{"w":"地毯","p":"dì tǎn","pos":"名词","note":""},{"w":"毛毯","p":"máo tǎn","pos":"名词","note":""}]}],"fix_count":0,"fixes":[]}

输出格式（不得增删字段）：
{"chars":[{"char":"毯","pinyin_original":"tǎn","pinyin_corrected":"tǎn","pinyin_fixed":false,"words":[{"w":"地毯","p":"dì tǎn","pos":"名词","note":""},{"w":"毛毯","p":"máo tǎn","pos":"名词","note":""}]}],"fix_count":0,"fixes":[]}`;
    }
    // poly_check 模式：多音字深度校验
    return `你是小学语文拼音与组词专家。你的唯一任务：为多音字组词，并确保组词与拼音的音义匹配。

${PROMPT_COMMON_RULES}

【多音字专属规则】
- 先确定所组词语中该字读哪个音，再据此填写 pinyin_corrected 与 p（两处必须一致）。
- 若预设拼音与该词语读音不匹配，以词语读音为准，并置 pinyin_fixed 为 true。
- 若"已有"词中该字的读音与预设拼音不符，同样要纠正并计入 fix_count。
- 两个词若能让该字读**不同**的音，优先这样选（更能体现多音字的区别），但不得为此杜撰词。

【正例】
输入：1. 薄（bó） 已有：单薄
输出：{"chars":[{"char":"薄","pinyin_original":"bó","pinyin_corrected":"báo","pinyin_fixed":true,"words":[{"w":"薄饼","p":"báo bǐng","pos":"名词","note":"一种面食"},{"w":"单薄","p":"dān bó","pos":"形容词","note":"不厚实"}]}],"fix_count":1,"fixes":[{"char":"薄","from":"bó","to":"báo","reason":"薄饼中读báo"}]}

输出格式（不得增删字段）：
{"chars":[{"char":"薄","pinyin_original":"bó","pinyin_corrected":"báo","pinyin_fixed":true,"words":[{"w":"薄饼","p":"báo bǐng","pos":"名词","note":"食物"},{"w":"单薄","p":"dān bó","pos":"形容词","note":"少"}]}],"fix_count":1,"fixes":[{"char":"薄","from":"bó","to":"báo","reason":"薄饼中读báo"}]}`;
}

// ========== 核心：API 直连调用（含错误分类） ==========
/** 统一错误文案（保留数字状态码，供 getErrorSuggestion 匹配） */
function buildApiErrMsg(status, label, errText) {
    let m = `AI API [${label}] ${status}`;
    switch (status) {
        case 400:
        case 422: m += '：请求被拒绝（可能是模型不支持 response_format/json_object，或参数不合法）'; break;
        case 401: m += '：API Key 无效或已过期'; break;
        case 402: m += '：账户额度不足'; break;
        case 403: m += '：无该模型权限或额度已耗尽'; break;
        case 404: m += '：模型 ID 不存在或未开通，请确认模型名'; break;
        case 429: m += '：请求过频，触发限流'; break;
        default: m += `：${String(errText || '').slice(0, 150)}`;
    }
    return m;
}

// ── Anthropic Messages API 常量 ─────────────────────────────────────────
// 版本头是 Anthropic 的硬性要求，缺失会直接 400。
export const ANTHROPIC_VERSION = '2023-06-01';
// Anthropic 的 max_tokens 是**必填**字段（与 OpenAI 可选不同），必须有兜底值。
const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;

/**
 * 判断某个引擎是否走 Anthropic 原生 Messages API。
 * 缺省（无 protocol 字段）一律视为 OpenAI 兼容 —— 内置 18 家全是后者。
 * @param {object|null} provider
 * @returns {boolean}
 */
export function isAnthropicProtocol(provider) {
    return !!(provider && provider.protocol === 'anthropic');
}

/**
 * 从 Anthropic 响应体里取正文。
 * 结构：{ content: [ { type:'text', text:'...' }, ... ] }
 * 按 type==='text' 过滤后拼接 —— thinking / tool_use 块不带正文，不能直接取 [0]。
 * @param {*} data
 * @returns {string}
 */
export function extractAnthropicText(data) {
    const blocks = (data && Array.isArray(data.content)) ? data.content : [];
    return blocks
        .filter(b => b && b.type === 'text' && typeof b.text === 'string')
        .map(b => b.text)
        .join('')
        .trim();
}

/**
 * 调用 OpenAI 兼容端点或 Anthropic Messages 端点，返回解析后的业务 JSON。
 *
 * v1.5.2 支持两条协议路径：
 *   · openai    —— POST {baseUrl}{chatPath}，Authorization: Bearer，messages 数组，
 *                  可选 response_format，正文取 choices[0].message.content
 *   · anthropic —— POST {baseUrl}{chatPath}，x-api-key + anthropic-version，
 *                  system 为**顶层字段**（不能放进 messages），max_tokens 必填，
 *                  正文取 content[].text，**不支持 response_format**
 *
 * 请求参数（maxTokens / temperature / topP / extraParams）来自引擎配置，
 * 未设置的项使用内置默认值 —— 即「可设置，也可采用默认值」。
 */
export async function callDeepSeekDirect(charPinyinPairs, {
    apiKey, signal, model: customModel, mode = 'fast', supportJsonMode = true,
    providerInfo = null, authStyle = ''
} = {}) {
    const provider = providerInfo || getAiProvider(apiKey);
    if (provider.type === 'unknown') {
        throw new Error('无法识别 API Key 类型：请在设置中使用受支持的引擎（如 sk- 开头的 DeepSeek、ark- 开头的火山引擎），或先运行“检测全部 Key 可用性”');
    }
    const anthropic = isAnthropicProtocol(provider);
    // Anthropic 的鉴权头是 x-api-key（不是 Bearer），因此协议优先于 authStyle 字段
    const auth = anthropic ? 'x-api-key' : (authStyle || provider.authStyle || 'bearer');
    const key = String(apiKey || '').trim();
    let endpoint = provider.endpoint;
    const headers = { 'Content-Type': 'application/json' };
    if (auth === 'query-key') {
        endpoint += (endpoint.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
    } else if (auth === 'x-api-key') {
        headers['x-api-key'] = key;
        headers['anthropic-version'] = ANTHROPIC_VERSION;
    } else {
        headers['Authorization'] = `Bearer ${key}`;
    }
    const model = customModel || provider.model;

    const systemPrompt = buildSystemPrompt(mode);
    const lines = charPinyinPairs.map((p, i) => {
        const py = p.pinyin || '无';
        const ex = (Array.isArray(p.existing) && p.existing.length > 0) ? ` 已有：${p.existing.join('/')}` : '';
        return `${i + 1}. ${p.char}（${py}）${ex}`;
    });
    const userPrompt = `请处理以下生字：\n${lines.join('\n')}`;

    // 参数装配：内置默认值 → 引擎自定义值覆盖 → extraParams 最高
    // ⚠ 必须用 getProvider(providerId) 取回注册表条目，而不是直接用上面那个
    //   providerInfo —— 后者字段少，且模板里可能残留非用户输入的字段。
    //   且 providerInfo 默认值是 null（调用方可以只给 apiKey），因此这里取
    //   provider.providerId：provider 已在上面归一化，null 分支不会走到这儿。
    const providerRef = getProvider(provider.providerId) || null;
    // ⚠ 协议判定也必须基于注册表条目重算：providerInfo 可能是调用方构造的窄对象，
    //   若它没带 protocol 就会把 Anthropic 引擎误判成 OpenAI 兼容（实测踩过）。
    const isAnth = isAnthropicProtocol(providerRef) || isAnthropicProtocol(provider);
    const defaultMaxTokens = mode === 'fast' ? 2048 : 4096;

    const doFetch = (withJson) => {
        let body;
        if (isAnth) {
            // Anthropic：system 独立顶层字段；messages 只放 user/assistant；
            // 不接受 response_format（传了会 400），因此 withJson 在此无意义。
            body = buildRequestBody(providerRef, {
                model,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                max_tokens: providerRef && providerRef.maxTokens !== undefined
                    ? providerRef.maxTokens
                    : (defaultMaxTokens > ANTHROPIC_DEFAULT_MAX_TOKENS ? defaultMaxTokens : ANTHROPIC_DEFAULT_MAX_TOKENS)
            });
        } else {
            body = buildRequestBody(providerRef, {
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: defaultMaxTokens,
                temperature: 0.1
            });
            if (withJson) body.response_format = { type: 'json_object' };
        }
        return fetch(endpoint, {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify(body)
        });
    };

    // Anthropic 不支持 response_format，首轮就不带它
    const jsonCapable = !isAnth && !!supportJsonMode;
    let resp = await doFetch(jsonCapable);

    // 400/422 且提示 response_format 不支持 → 去掉该字段重试一次
    if (!resp.ok && jsonCapable && (resp.status === 400 || resp.status === 422)) {
        const firstText = await resp.text().catch(() => '');
        if (/response_format|json_object|json mode/i.test(firstText)) {
            resp = await doFetch(false);
        } else {
            throw new Error(buildApiErrMsg(resp.status, provider.label, firstText));
        }
    }

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(buildApiErrMsg(resp.status, provider.label, errText));
    }

    const data = await resp.json();
    const content = isAnth
        ? extractAnthropicText(data)
        : (data?.choices?.[0]?.message?.content || '');
    const parsed = extractJsonRobust(content);
    if (!parsed) {
        throw new Error(`AI 返回内容无法解析为 JSON（前200字：${content.slice(0, 200)}）`);
    }
    return { data: parsed, model, provider: provider.type, providerLabel: provider.label };
}

// ========== 工具：本地词语合法性校验 ==========
function validateWords(char, words) {
    if (!Array.isArray(words)) return [];
    return words
        .filter(w => w && typeof w.w === 'string' && w.w.length === 2 && w.w.includes(char) && w.p)
        .slice(0, 2)
        .map(w => ({ w: w.w, p: w.p, pos: w.pos || '', note: w.note || '' }));
}

/**
 * v1.5.4 新增：组词「补齐」的达标线 = 2 个词。
 *
 * 背景（真实缺陷）：旧实现把 `validWords.length > 0`（即只要 1 个词）当作成功落盘。
 * 「吩」这类字默认词库只给得出 1 个真实词（`吩 → ["吩咐","组词"]`，其中「组词」是
 * PLACEHOLDER 占位词，`isDefaultZuciOK('吩') === false`），AI 若也只回 1 个有效词，
 * 旧代码就写入 `zuci:['吩咐']` 且 `fetchedCount++`，于是：
 *   ① 本次运行被计为「已补齐」，用户看到「组词完毕」；
 *   ② 之后每次运行，跳过门 `hasZuci = ent.zuci.length > 0` 都为真 → 永远跳过该字，
 *      再也不会重试，缺陷被永久固化。
 * 修正后语义：
 *   · 凑满 TARGET_ZUCI_COUNT(2) 个词 → 才算补齐成功；
 *   · 只凑到 1 个词 → 记为「部分补齐」：**仍落盘**（已有的词对用户有价值，且原先就被
 *     跳过门当成功，去掉会让用户看到词变少），但**不计入 fetchedCount**，并计入
 *     `insufficient` 名单，供 UI 如实告知「N 字仅补到 1 个词」；
 *   · 一个字都没凑到 → 不落盘，计入 `insufficient`；
 *   · 跳过门同步收紧为 `isZuciComplete()`，使「只有 1 个词」的条目仍会在后续运行
 *     被重新送去 AI 补齐，直到凑满或确认无解。
 */
const TARGET_ZUCI_COUNT = 2;

/** 组词是否已达标（≥2 个词）。用于跳过门与结果统计，统一口径。 */
function isZuciComplete(entry) {
    return !!(entry && Array.isArray(entry.zuci) && entry.zuci.length >= TARGET_ZUCI_COUNT);
}

// ========== 补丁A：AbortSignal.any 兼容兜底（旧 WebView/Safari<17.4 无此 API） ==========
function combineSignals(a, b) {
    if (!a) return b;
    if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
    const ctrl = new AbortController();
    const forward = () => ctrl.abort();
    a.addEventListener('abort', forward, { once: true });
    b.addEventListener('abort', forward, { once: true });
    return ctrl.signal;
}

// ========== 工具：判断缓存来源的档位 ==========
// src 形如 '<providerId>:<modelId>'。
// v3.0.4 修订：原实现把「非 free」一律视为降级，导致 DeepSeek / 火山 doubao-lite 这类
//   `cheap`（低价）引擎在**每一次**运行后都追加"由非免费模型生成"的提示 —— 而它们正是
//   绝大多数用户手头唯一可用的引擎，提示纯属噪音（见验收报告缺陷 #2）。
//   现改为精确三档：free / cheap / paid，只有真正 `paid`（高价档）才提示。
//   无法解析 src 时返回 'unknown'，按不降级处理（不打扰用户）。
export function srcTier(src) {
    try {
        const idx = String(src).indexOf(':');
        if (idx <= 0) return 'unknown';
        const pid = src.slice(0, idx);
        const mid = src.slice(idx + 1);
        const p = getProvider(pid);
        if (!p) return 'unknown';
        const m = (p.models || []).find(x => x.id === mid);
        if (!m || !m.tier) return 'unknown';
        return m.tier;
    } catch {
        return 'unknown';
    }
}

// ========== 主流程：智能组词 + 校验（三模式分流 + 5分钟超时 + 重试） ==========
export async function fillMissingZuci(chars, {
    apiKey, providerId = null, modelId = null, signal,
    fullCheck = false, fillMissing = false, fixPinyin = false, onProgress
} = {}) {
    const start = Date.now();
    // v1.2.0：apiKey 兜底——未传 key 时从 aiKeyStore 读取生效 Key（动态 import 避免循环依赖）
    // v3.0.4：同时解析 providerId。原因：sk- 前缀被 Moonshot / 硅基流动 / 百炼 /
    //   OpenRouter 等多个引擎共用，仅凭 Key 字符串无法判定路由；必须由调用方
    //   （设置中心）把已探测消歧出的 providerId 传下来，否则会被旧前缀语义
    //   误判为 DeepSeek 并返回误导性的 401。
    // v1.4.0：同时解析 modelId。这是**修掉一个真实缺口**：此前 entry.modelId 虽被
    //   写入 aiKeyStore、也被 getAiProvider 读取，但 fillMissingZuci 只把
    //   {key, providerId} 传下去，modelId 在真实调用链上**从未生效**——
    //   「同一个 Key 换模型」在 UI 上存得下、跑起来却不换。现在按
    //   entry.modelId 一并透传（显式参数优先）。
    let resolvedApiKey = apiKey;
    let resolvedProviderId = providerId;
    let resolvedModelId = modelId;
    if (!resolvedApiKey || typeof resolvedApiKey !== 'string' || !resolvedApiKey.trim()) {
        try {
            const { getEffectiveKeyEntry } = await import('./aiKeyStore.js');
            const entry = getEffectiveKeyEntry();
            if (entry && typeof entry.key === 'string' && entry.key.trim()) {
                resolvedApiKey = entry.key;
                if (!resolvedProviderId && entry.providerId) resolvedProviderId = entry.providerId;
                if (!resolvedModelId && entry.modelId) resolvedModelId = entry.modelId;
            }
        } catch { /* 无可用 Key 时保持 undefined，走原有错误提示 */ }
    }
    // 显式 providerId / modelId 存在时以 entry 形态传入，使 getAiProvider 跳过形状推断
    const providerInfo = getAiProvider(
        (resolvedProviderId || resolvedModelId)
            ? { key: resolvedApiKey, providerId: resolvedProviderId, modelId: resolvedModelId }
            : resolvedApiKey,
        fullCheck
    );
    const needPinyinCheck = fullCheck || fixPinyin;
    const applyWords = fullCheck || fillMissing;

    // v3.0.4：模型来源改为注册表；poly_check 使用 fullCheck 强模型（若有）。
    // v1.4.0：优先级显式固化（此前 entry.modelId 与 fullCheck 强模型的先后关系含糊）：
    //   1. ai_model_override_<providerId>（localStorage 逃生门，应急用，最高）
    //   2. entry.modelId（用户在设置面板显式选定的模型 —— 属用户意图，不再被静默覆盖）
    //   3. 注册表默认：全量检查用 fullCheck 强模型，否则第一个非 fullCheck 模型
    // 之所以让「用户显式选定」压过「全量检查自动升档」：静默换掉用户刚选的模型
    //   会让人以为选择没生效。UI 已同步提示这一点。
    const overrideModel = readModelOverride(providerInfo.providerId);
    const providerObj = getProvider(providerInfo.providerId);
    const fullCheckModel = pickProviderModel(providerObj, true);
    const explicitModel = overrideModel || (resolvedModelId || '');
    const defaultModel = explicitModel || providerInfo.model;
    const polyModel = explicitModel || (fullCheckModel ? fullCheckModel.id : providerInfo.model);

    // ⚠ v1.5.4：超时额度在「去重 + 过滤汉字」之后才能算（要按真实生字数），
    //   因此先建 controller 占位，稍后再 setTimeout。见下方 `timeoutMs` 计算处。
    const timeoutCtrl = new AbortController();
    let timeoutId = null;
    // 联动外部 signal（补丁A：兼容旧环境）
    const combinedSignal = combineSignals(signal, timeoutCtrl.signal);

    let timedOut = false;
    let timeoutReason = '';   // 'timeout' | 'external'
    let timeoutMs = TIMEOUT_BASE_MS.zuci; // 占位，稍后按生字数修正

    // 去重 + 仅保留汉字
    const seen = new Set();
    const uniqueChars = [];
    for (const c of (chars || [])) {
        if (c && typeof c === 'string' && /[\u4e00-\u9fa5]/.test(c) && !seen.has(c)) {
            seen.add(c);
            uniqueChars.push(c);
        }
    }

    const cache = loadCache();
    const defaultOKChars = [];
    const aiCachedChars = [];
    const toFetch = [];

    // v1.5.4：超时额度按「真实生字数 + 任务类型」计算后正式启动计时器。
    //   放在这里的原因：必须先知道 uniqueChars.length，才能按每 20 字 +2 分钟延长。
    timeoutMs = computeTimeoutMs(uniqueChars.length, { fullCheck, fixPinyin, fillMissing });
    timeoutId = setTimeout(() => {
        timeoutReason = 'timeout';
        timeoutCtrl.abort();
    }, timeoutMs);

    // 筛选待处理字（修复缓存穿透：needPinyinCheck 时要求 pinyinChecked 才能跳过）
    for (const c of uniqueChars) {
        const ent = cache[c];
        // ★ v1.2.0：用户手动修改过的字不参与 AI 处理（手动 > AI），计入已处理避免误报缺失
        if (ent && ent.userEdited === true) {
            aiCachedChars.push(c);
            continue;
        }
        const hasZuci = isZuciComplete(ent);
        // v1.5.4：hasZuci 的口径由「≥1 个词」收紧为「≥2 个词」——只补到 1 个词的条目
        //   视为未达标，后续运行会继续送 AI 补齐，而不是被永久跳过。
        const hasPinyin = ent && ent.pinyinFixed === true;
        const hasPinyinChecked = ent && ent.pinyinChecked === true;

        if (needPinyinCheck) {
            // 需要拼音校验：必须 pinyinChecked=true 才能跳过；
            // v1.5.4：拼音已校验但组词未达标的条目仍要重跑，否则「吩」类字永远补不齐。
            if ((hasPinyinChecked || (hasZuci && hasPinyin)) && (hasZuci || !applyWords)) {
                aiCachedChars.push(c);
            } else {
                toFetch.push(c);
            }
        } else {
            // 补丁B：仅组词补齐模式下，只有"已有组词"才算已缓存。
            // 只有拼音纠正记录（zuci 为空）的字不能被跳过，否则永远补不上组词。
            // v1.5.4：门槛由「有 ≥1 个词」收紧为「≥2 个词」，1 个词的条目继续重试。
            if (hasZuci) {
                aiCachedChars.push(c);
            } else if (fillMissing && !isDefaultZuciOK(c)) {
                toFetch.push(c);
            } else if (!fillMissing) {
                toFetch.push(c);
            } else {
                defaultOKChars.push(c);
            }
        }
    }

    let fetchedCount = 0;
    let processedCount = 0;
    let allFixes = [];
    let lastError = null;
    // v1.5.4：本次运行「只补到 1 个词 / 一个词都没补到」的字，用于如实汇报（不再静默算成功）
    const insufficientChars = [];
    const total = toFetch.length;

    if (total > 0) {
        // 三模式分流
        const fastChars = [];        // 仅补齐组词（无校验需求）
        const singleCheckChars = []; // 单音字 + 需校验
        const polyCheckChars = [];   // 多音字 + 需校验

        for (const c of toFetch) {
            if (needPinyinCheck && isPolyphone(c)) {
                polyCheckChars.push(c);
            } else if (needPinyinCheck) {
                singleCheckChars.push(c);
            } else {
                fastChars.push(c);
            }
        }

        // 分批处理函数（含重试机制）
        const batchProcess = async (charList, mode, batchSize, useModel) => {
            // v3.0.4：记录生成来源 <providerId>:<modelId>，供 degradedChars 与 UI 诊断
            const srcTag = `${providerInfo.type}:${useModel || providerInfo.model}`;
            for (let i = 0; i < charList.length; i += batchSize) {
                if (combinedSignal?.aborted) {
                    timedOut = true;
                    timeoutReason = timeoutReason || 'external';
                    break;
                }
                const batch = charList.slice(i, i + batchSize);
                const pairs = batch.map(c => {
                    let py = '';
                    try {
                        py = pinyin(c, { toneType: 'symbol', segment: true, nonZh: 'consecutive' }) || '';
                    } catch { py = ''; }
                    const existing = needPinyinCheck ? getDefaultZuci(c) : [];
                    return { char: c, pinyin: py, existing };
                });

                let result = null;
                for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
                    if (combinedSignal?.aborted) { timedOut = true; timeoutReason = timeoutReason || 'external'; break; }
                    try {
                        const apiResult = await callDeepSeekDirect(pairs, {
                            apiKey: resolvedApiKey, signal: combinedSignal, model: useModel, mode,
                            supportJsonMode: providerInfo.supportJsonMode, providerInfo
                        });
                        result = apiResult.data;
                        break;
                    } catch (err) {
                        if (err.name === 'AbortError') { timedOut = true; timeoutReason = timeoutReason || 'external'; break; }
                        lastError = err;
                        if (attempt < MAX_RETRY) {
                            // 短暂等待后重试（指数退避）
                            await new Promise(r => setTimeout(r, 500 * attempt));
                        }
                    }
                }
                if (combinedSignal?.aborted) { timedOut = true; timeoutReason = timeoutReason || 'external'; break; }
                if (!result) {
                    // 该批次重试全失败，跳过但继续下一批。
                    // v1.5.4：applyWords 时必须把这一批字记入未达标名单 ——
                    //   否则「先报网络错、后报组词完毕」会让用户以为这些字已经处理过。
                    //   注：不写缓存，失败不该留下任何「已完成」的痕迹。
                    if (applyWords) {
                        for (const c of batch) {
                            if (cache[c] && cache[c].userEdited === true) continue;
                            insufficientChars.push({ char: c, got: 0, words: [], failed: true });
                        }
                    }
                    processedCount += batch.length;
                    if (typeof onProgress === 'function') {
                        onProgress({
                            processed: processedCount, total, mode, error: 'batch_failed',
                            elapsed: Date.now() - start, timeoutMs,
                            batchIndex: Math.floor(i / batchSize) + 1,
                            totalBatches: Math.ceil(charList.length / batchSize)
                        });
                    }
                    continue;
                }

                // 解析结果写入缓存
                const charsArr = Array.isArray(result.chars) ? result.chars : [];
                for (const entry of charsArr) {
                    const c = entry.char;
                    if (!c || typeof c !== 'string') continue;
                    // ★ v1.2.0：用户手动修改过的字，AI 结果不覆盖（手动 > AI）
                    if (cache[c] && cache[c].userEdited === true) {
                        continue;
                    }

                    const validWords = validateWords(c, entry.words);
                    const wordsComplete = validWords.length >= TARGET_ZUCI_COUNT;
                    const hasWords = validWords.length > 0;
                    const pyFixed = fixPinyin && (entry.pinyin_fixed === true);
                    const correctedPy = typeof entry.pinyin_corrected === 'string'
                        ? entry.pinyin_corrected
                        : (entry.pinyin || '');

                    if (applyWords && hasWords) {
                        // 补丁B：保留旧条目里已有的拼音纠正记录，避免补齐组词时把纠正覆盖掉
                        const prev = cache[c] || {};
                        cache[c] = _buildEntry({
                            zuci: validWords.map(w => w.w),
                            pinyin: correctedPy || prev.pinyin || '',
                            pinyinFixed: pyFixed || prev.pinyinFixed === true,
                            pinyinChecked: needPinyinCheck || prev.pinyinChecked === true,
                            wordsDetail: validWords,
                            src: srcTag,
                            source: 'ai',
                            provider: providerInfo.type,
                            model: useModel || providerInfo.model,
                            updatedAt: Date.now()
                        });
                        // v1.5.4：只有凑满 2 个词才算「补齐成功」；
                        //   只补到 1 个词仍落盘（不让用户看到词变少），但如实记入未达标名单。
                        if (wordsComplete) {
                            fetchedCount++;
                        } else {
                            insufficientChars.push({
                                char: c,
                                got: validWords.length,
                                words: validWords.map(w => w.w)
                            });
                        }
                    } else if (pyFixed) {
                        // 仅拼音纠错模式
                        cache[c] = _buildEntry({
                            zuci: [],
                            pinyin: correctedPy,
                            pinyinFixed: true,
                            pinyinChecked: true,
                            wordsDetail: [],
                            src: srcTag,
                            source: 'ai',
                            provider: providerInfo.type,
                            model: useModel || providerInfo.model,
                            updatedAt: Date.now()
                        });
                        fetchedCount++;
                    } else if (needPinyinCheck && !hasWords) {
                        // 校验模式但 AI 没返回有效组词：标记已检查但不写组词
                        cache[c] = _buildEntry({
                            zuci: [],
                            pinyin: correctedPy,
                            pinyinFixed: false,
                            pinyinChecked: true,
                            wordsDetail: [],
                            src: srcTag,
                            source: 'ai',
                            provider: providerInfo.type,
                            model: useModel || providerInfo.model,
                            updatedAt: Date.now()
                        });
                        fetchedCount++;
                    } else if (applyWords && !hasWords) {
                        // v1.5.4：补齐模式下 AI 一个字都没给（或给的全不合格）。
                        //   旧实现在这里**什么都不做也不记录** —— 用户既没拿到词，
                        //   也得不到任何「这个字没补上」的说明，只看到一句泛化的
                        //   「组词完毕」。现在如实记入未达标名单（got: 0），
                        //   并**不写缓存**（写个空组词会把该字永久钉成「已完成」）。
                        insufficientChars.push({ char: c, got: 0, words: [] });
                    }
                }

                // 收集纠错明细
                if (fixPinyin && Array.isArray(result.fixes)) {
                    for (const f of result.fixes) {
                        if (f && f.char) {
                            allFixes.push({
                                char: f.char,
                                from: f.from || '',
                                to: f.to || '',
                                reason: f.reason || ''
                            });
                        }
                    }
                }

                saveCache(cache);
                processedCount += batch.length;

                if (typeof onProgress === 'function') {
                    onProgress({
                        processed: processedCount,
                        total,
                        mode,
                        // v1.5.4：上报已耗时与超时额度，让 UI 能显示「时间的流逝」
                        elapsed: Date.now() - start,
                        timeoutMs,
                        batchIndex: Math.floor(i / batchSize) + 1,
                        totalBatches: Math.ceil(charList.length / batchSize)
                    });
                }
            }
        };

        // 1. 快速组词模式（批次 10）
        if (fastChars.length > 0 && !timedOut) {
            await batchProcess(fastChars, 'fast', 10, defaultModel);
        }

        // 2. 单音字校验模式（批次 10）
        if (singleCheckChars.length > 0 && !timedOut) {
            await batchProcess(singleCheckChars, 'single_check', 10, defaultModel);
        }

        // 3. 多音字深度校验模式（批次 6，用强模型）
        if (polyCheckChars.length > 0 && !timedOut) {
            await batchProcess(polyCheckChars, 'poly_check', 6, polyModel);
        }
    }

    clearTimeout(timeoutId);

    const ai = fetchedCount + aiCachedChars.length;
    const def = defaultOKChars.length;
    const missing = uniqueChars.length - ai - def;
    const elapsed = Date.now() - start;

    // 构建返回结果
    // v1.1.0：新增 noWorkNeeded 标志——当所有字都无需 AI 处理（默认词库已足够 或 已有缓存）时置 true，
    // 避免前端把"一切正常"误报为"未能处理任何字"
    const noWorkNeeded = uniqueChars.length > 0 && toFetch.length === 0;

    // v3.0.4：按来源档位统计已缓存字数。
    //   freeChars  —— 免费档模型产出
    //   cheapChars —— 低价档（DeepSeek / doubao-lite / qwen-turbo 等）
    //   paidChars  —— 高价档产出，**这才是值得提示用户"可换更省"的部分**
    //   degradedChars 保留为 paidChars 的别名（对外字段名不变，语义收窄）。
    // 不自动清缓存（会破坏 userEdited 语义），仅在 suggestion 中提示。
    let freeChars = 0, cheapChars = 0, paidChars = 0;
    for (const c of uniqueChars) {
        const ent = cache[c];
        if (!ent || ent.userEdited === true || !ent.src) continue;
        const t = srcTier(ent.src);
        if (t === 'free') freeChars++;
        else if (t === 'cheap') cheapChars++;
        else if (t === 'paid') paidChars++;
    }
    const degradedChars = paidChars;

    const result = {
        total: uniqueChars.length,
        ai,
        default: def,
        missing: Math.max(0, missing),
        elapsed,
        pinyinChecked: fetchedCount,
        pinyinFixed: allFixes.length,
        fixes: allFixes,
        model: providerInfo.model,
        provider: providerInfo.type,
        providerLabel: providerInfo.label,
        degradedChars,
        freeChars,
        cheapChars,
        paidChars,
        timedOut,
        partialSuccess: timedOut && fetchedCount > 0,
        noWorkNeeded,
        // v1.5.4：只补到 1 个词 / 一个词都没补到的字。以前这些字被静默计入成功，
        //   用户看到「组词完毕」却只得到「吩咐」一个词 —— 现在必须如实点名。
        insufficient: insufficientChars.slice(),
        insufficientCount: insufficientChars.length,
        // v1.5.4：超时额度与中断原因，供 UI 展示「本次额度 X 分钟」
        timeoutMs,
        timeoutReason,
        timeoutText: describeTimeout(timeoutMs, uniqueChars.length)
    };

    // 超时且有错误时附加诊断信息
    if (timedOut) {
        // v1.5.4：区分「额度耗尽」与「外部取消」——前者按实际额度描述，后者不谎称超时。
        if (timeoutReason === 'timeout') {
            result.timeoutError = `处理时间超过 ${describeTimeout(timeoutMs, uniqueChars.length)}，已自动中断`;
        } else if (lastError) {
            result.timeoutError = lastError.message;
        } else {
            result.timeoutError = '任务已被取消';
        }
        result.suggestion = getErrorSuggestion(lastError, providerInfo);
    } else if (fetchedCount === 0 && total > 0 && lastError) {
        result.suggestion = getErrorSuggestion(lastError, providerInfo);
    }

    // v1.5.4：组词未达标的字如实汇报（不再静默算成功）
    if (insufficientChars.length > 0) {
        // 去重：同一个字理论上只会在一个批次里被处理一次，但批次失败与结果解析
        // 是两条独立路径，保险起见按字去重（保留首次记录，失败标记优先）。
        const byChar = new Map();
        for (const x of insufficientChars) {
            const prev = byChar.get(x.char);
            if (!prev) { byChar.set(x.char, x); continue; }
            // 失败信息优先（比「0 个词」更能解释原因），但 got 取较大值
            if (x.failed && !prev.failed) byChar.set(x.char, { ...prev, failed: true });
            else if (x.got > prev.got) byChar.set(x.char, { ...x, failed: prev.failed || x.failed });
        }
        const list = [...byChar.values()];
        const oneWord = list.filter(x => x.got === 1);
        const zeroWord = list.filter(x => x.got === 0);
        const failedOnly = zeroWord.filter(x => x.failed);
        const parts = [];
        if (oneWord.length > 0) {
            const preview = oneWord.slice(0, 8).map(x => `${x.char}（仅「${x.words[0]}」）`).join('、');
            parts.push(`${oneWord.length} 字仅补到 1 个词：${preview}${oneWord.length > 8 ? ' 等' : ''}`);
        }
        if (zeroWord.length > 0) {
            parts.push(`${zeroWord.length} 字未补到任何词：${zeroWord.slice(0, 8).map(x => x.char).join('、')}${zeroWord.length > 8 ? ' 等' : ''}`);
        }
        let tip = parts.join('；');
        if (failedOnly.length > 0 && failedOnly.length === zeroWord.length) {
            tip += `（本批请求全部失败，可能是网络或额度问题）`;
        }
        const full = `${tip}。可再跑一次（这些字不会被视为已完成），或手动补充组词`;
        result.insufficient = list;
        result.insufficientCount = list.length;
        result.insufficientTip = full;
        result.suggestion = result.suggestion ? `${result.suggestion}；${full}` : full;
    }

    // 高价档产出提示（不自动清缓存）。
    // v3.0.4 修订：仅在 paidChars > 0 时提示 —— free / cheap 档（含 DeepSeek、doubao-lite）
    //   不再触发，避免对绝大多数用户每次运行都造成噪音。
    if (paidChars > 0) {
        const tip = `其中 ${paidChars} 字由高价档模型生成，如已配置免费或低价 Key，可在设置中点「🔍 检测全部 Key 可用性」后重跑（不会自动清除缓存）`;
        result.suggestion = result.suggestion ? `${result.suggestion}；${tip}` : tip;
    }

    return result;
}

// ========== 错误诊断建议 ==========
function getErrorSuggestion(error, providerInfo) {
    if (!error) return '';
    const msg = error.message || '';
    if (msg.includes('401')) return 'API Key 无效或已过期，请检查设置中的 Key 是否正确';
    if (msg.includes('402')) return '账户额度不足，请充值或更换其它引擎的 Key（可在设置中运行“检测全部 Key 可用性”）';
    if (msg.includes('403')) return '无该模型调用权限或账户额度已耗尽，请更换模型或充值（也可用 localStorage.setItem("ai_model_override_<引擎>","模型名") 临时换模型）';
    if (msg.includes('404')) return '模型未开通或模型 ID 不存在，请确认该引擎下的模型名，或用 localStorage.setItem("ai_model_override_<引擎>","正确模型ID") 临时切换';
    if (msg.includes('429')) return '请求过于频繁被限流，请等待 30 秒后重试';
    if (msg.includes('400') || msg.includes('422')) return '请求被拒绝：可能是该模型不支持 response_format/json_object，或参数不合法，建议更换模型';
    if (msg.includes('无法解析为 JSON')) return 'AI 模型返回格式异常，建议更换模型或减少单次处理字数';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        return '网络连接失败（可能是浏览器跨域 CORS 限制），请检查网络或更换 API 提供商';
    }
    if (msg.includes('超时') || msg.includes('timeout')) {
        return '请求超时，可能是网络延迟或模型负载高，建议减少单次处理字数或稍后重试';
    }
    return `错误详情：${msg.slice(0, 100)}。建议检查 API Key、网络连接后重试`;
}
