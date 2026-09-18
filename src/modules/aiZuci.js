// v3.0.0 模块B：AI 组词补齐 + 拼音纠错（多引擎：注册表驱动）
// 核心优化：本地预分流(单/多音字) + 三模式提示词 + 缓存穿透修复 + 进度修复 + 重试机制 + 5分钟超时
// v3.0.4：删除本地前缀识别，统一走 aiProviders 注册表；模型覆盖改为按引擎作用域
// 缓存：localStorage 单 JSON Map，key = ai_zuci_cache_v1
//   条目结构：{ zuci:[词1,词2], pinyin:"纠正后拼音", pinyinFixed:bool, pinyinChecked:bool, wordsDetail:[{w,p,pos,note}], src:"<providerId>:<modelId>", ts:number }

import cnchar from 'cnchar';
import words from 'cnchar-words';
import customZuCi from '../data/customZuCi.js';
import { pinyin } from './pinyin.js';
import { getProvider, resolveProviderId, detectApiKeyType } from './aiProviders.js';

// 注册 cnchar 插件（幂等）
try { cnchar.use(words); } catch (e) { /* 忽略重复注册 */ }

// 向后兼容导出（契约 §3.2/§3.5）：导出名与旧语义均保持不变
export { detectApiKeyType };

const CACHE_KEY = 'ai_zuci_cache_v1';
const HARD_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟硬超时
const MAX_RETRY = 3; // 弱模型 JSON 不稳定时的最大重试次数

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
    } catch (e) { /* localStorage 不可用时忽略 */ }
    return '';
}

/**
 * 解析生效引擎。签名保持不变（key 可以是字符串，也可以是 entry 对象）。
 * 解析顺序：entry.providerId → detectProviderId(形状唯一) → 旧前缀语义兜底 → unknown。
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
    } catch (e) {
        return false;
    }
}

// ========== 工具函数：缓存读写 ==========
function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; }
}
function saveCache(map) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch (e) { /* 配额满则忽略 */ }
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
 * 强制 pinyinFixed:true / pinyinChecked:true / userEdited:true，
 * 否则 getAiPinyin() 只认 pinyinFixed===true 不返回手动拼音；
 * 留空字段由旧值兜底（组词留空 = 保留旧值）。
 * @param {string} char - 汉字
 * @param {{zuci?:string[], pinyin?:string}} data - 手动输入
 */
export function updateAiZuciCache(char, data) {
    if (!char) return;
    const cache = loadCache();
    const prev = cache[char] || {};
    cache[char] = {
        ...prev,
        zuci: Array.isArray(data.zuci) && data.zuci.length > 0
            ? data.zuci.slice(0, 2) : (prev.zuci || []),
        pinyin: typeof data.pinyin === 'string' && data.pinyin.trim()
            ? data.pinyin.trim() : (prev.pinyin || ''),
        pinyinFixed: true,
        pinyinChecked: true,
        wordsDetail: prev.wordsDetail || [],
        userEdited: true,
        ts: Date.now()
    };
    saveCache(cache);
}

/**
 * 清除手动修改标记（浮层"清除手动修改"按钮用），回到 AI/默认 逻辑
 * @param {string} char - 汉字
 */
export function clearUserEdit(char) {
    if (!char) return;
    const cache = loadCache();
    if (cache[char] && cache[char].userEdited) {
        delete cache[char].userEdited;
        // 若该字无 AI 结果（原本就是默认词库），可整体删除条目
        if (!cache[char].zuci && !cache[char].pinyinFixed) {
            delete cache[char];
        }
        saveCache(cache);
    }
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
 * 批量预填充 ai_zuci_cache_v1（导入增强用）
 * 用户指定即视为已纠音：pinyinFixed:true / pinyinChecked:true / userSpecified:true
 * @param {Object} charMap { 字: {zuci:[], pinyin:'', pinyinVariants:[], wordsDetail:[], userSpecified:true} }
 * @returns {number} 实际写入字数
 */
export function preloadAiZuciCache(charMap) {
    if (!charMap || typeof charMap !== 'object') return 0;
    const cache = loadCache();
    let n = 0;
    for (const [char, data] of Object.entries(charMap)) {
        if (!char || !/[一-龥]/.test(char)) continue;
        const prev = cache[char] || {};
        cache[char] = {
            zuci: Array.isArray(data.zuci) && data.zuci.length ? data.zuci : prev.zuci || [],
            pinyin: data.pinyin || prev.pinyin || '',
            pinyinFixed: true,                     // 用户指定即视为已纠音
            pinyinChecked: true,
            pinyinVariants: Array.isArray(data.pinyinVariants) ? data.pinyinVariants : [],
            wordsDetail: Array.isArray(data.wordsDetail) ? data.wordsDetail : prev.wordsDetail || [],
            userSpecified: true,
            ts: Date.now()
        };
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
    } catch (e) { return false; }
}

function getDefaultZuci(char) {
    try {
        const custom = customZuCi[char] || [];
        if (custom.length >= 2) return custom.slice(0, 2);
        const w = cnchar.words(char);
        const twoChar = (w || []).filter(word => typeof word === 'string' && word.length === 2);
        if (twoChar.length >= 2) return twoChar.slice(0, 2);
        return [...new Set([...custom, ...twoChar])].slice(0, 2);
    } catch (e) { return []; }
}

// ========== 工具函数：健壮 JSON 解析 ==========
function extractJsonRobust(content) {
    if (!content || typeof content !== 'string') return null;
    let text = content.trim();
    // 预处理：去掉常见开场白、结束语
    text = text.replace(/^(好的|以下是|结果如下|为你生成|根据要求)[\s\S]{0,50}?[\n\r]/, '');
    text = text.replace(/[\n\r][\s\S]{0,100}?(如有问题|需要调整|请告知|希望对你有帮助)[\s\S]*$/, '');
    // 1. 直接解析
    try { return JSON.parse(text); } catch (e) { /* 继续 */ }
    // 2. 剥离 markdown 代码块
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlock) {
        try { return JSON.parse(codeBlock[1].trim()); } catch (e) { /* 继续 */ }
    }
    // 3. indexOf/lastIndexOf 截取首个完整 JSON 对象（比正则贪婪匹配更稳健）
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch (e) { /* 继续 */ }
    }
    // 4. 提取数组
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
        try { return JSON.parse(text.slice(firstBracket, lastBracket + 1)); } catch (e) { /* 继续 */ }
    }
    return null;
}

// ========== 核心：三模式提示词构建 ==========
function buildSystemPrompt(mode) {
    if (mode === 'fast') {
        // 快速组词模式：极致精简，仅补齐组词，不校验
        return `你是小学语文组词专家。只输出JSON，禁止任何前缀、后缀、解释、代码块。
任务：给每个汉字组2个小学常用二字词，必须包含该字，禁止人名地名。
输出格式（必须含pos和note字段）：
{"chars":[{"char":"毯","pinyin":"tǎn","words":[{"w":"地毯","p":"dì tǎn","pos":"","note":""},{"w":"毛毯","p":"máo tǎn","pos":"","note":""}]}]}`;
    }
    if (mode === 'single_check') {
        // 单音字校验模式：核验已有组词，不纠错拼音
        return `你是小学语文组词专家。只输出JSON，禁止任何前缀、后缀、解释。
任务：核验每个字已有的组词是否合适，不合适的替换。每字最终给出2个二字词，禁止人名地名，2词词性不同。
单音字拼音唯一，pinyin_fixed固定为false。
输出格式：
{"chars":[{"char":"毯","pinyin_original":"tǎn","pinyin_corrected":"tǎn","pinyin_fixed":false,"words":[{"w":"地毯","p":"dì tǎn","pos":"","note":""},{"w":"毛毯","p":"máo tǎn","pos":"","note":""}]}],"fix_count":0,"fixes":[]}`;
    }
    // poly_check 模式：多音字深度校验
    return `你是小学语文拼音与组词专家。只输出JSON，禁止任何前缀、后缀、解释。
任务：处理多音字，确保组词与拼音音义匹配。若提供"已有"组词，检查其拼音和语义是否匹配；不匹配则纠正。
规则：
1. 每字组2个小学常用二字词，必须包含该字，禁止人名地名，2词词性不同。
2. 根据所组词语的词义，标注对应正确拼音（带声调），保证音义一致。
3. 若预设拼音与词语读音不匹配，以词语正确读音为准，标记pinyin_fixed=true。
输出格式：
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

export async function callDeepSeekDirect(charPinyinPairs, {
    apiKey, signal, model: customModel, mode = 'fast', supportJsonMode = true,
    providerInfo = null, authStyle = ''
} = {}) {
    const provider = providerInfo || getAiProvider(apiKey);
    if (provider.type === 'unknown') {
        throw new Error('无法识别 API Key 类型：请在设置中使用受支持的引擎（如 sk- 开头的 DeepSeek、ark- 开头的火山引擎），或先运行“检测全部 Key 可用性”');
    }
    const auth = authStyle || provider.authStyle || 'bearer';
    const key = String(apiKey || '').trim();
    let endpoint = provider.endpoint;
    const headers = { 'Content-Type': 'application/json' };
    if (auth === 'query-key') {
        endpoint += (endpoint.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
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

    const reqBody = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        max_tokens: mode === 'fast' ? 2048 : 4096,
        temperature: 0.1
    };

    const doFetch = (withJson) => {
        const body = { ...reqBody };
        if (withJson) body.response_format = { type: 'json_object' };
        return fetch(endpoint, {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify(body)
        });
    };

    let resp = await doFetch(!!supportJsonMode);

    // 400/422 且提示 response_format 不支持 → 去掉该字段重试一次
    if (!resp.ok && supportJsonMode && (resp.status === 400 || resp.status === 422)) {
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
    const content = data?.choices?.[0]?.message?.content || '';
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
    } catch (e) {
        return 'unknown';
    }
}

// ========== 主流程：智能组词 + 校验（三模式分流 + 5分钟超时 + 重试） ==========
export async function fillMissingZuci(chars, {
    apiKey, providerId = null, signal,
    fullCheck = false, fillMissing = false, fixPinyin = false, onProgress
} = {}) {
    const start = Date.now();
    // v1.2.0：apiKey 兜底——未传 key 时从 aiKeyStore 读取生效 Key（动态 import 避免循环依赖）
    // v3.0.4：同时解析 providerId。原因：sk- 前缀被 Moonshot / 硅基流动 / 百炼 /
    //   OpenRouter 等多个引擎共用，仅凭 Key 字符串无法判定路由；必须由调用方
    //   （设置中心）把已探测消歧出的 providerId 传下来，否则会被旧前缀语义
    //   误判为 DeepSeek 并返回误导性的 401。
    let resolvedApiKey = apiKey;
    let resolvedProviderId = providerId;
    if (!resolvedApiKey || typeof resolvedApiKey !== 'string' || !resolvedApiKey.trim()) {
        try {
            const { getEffectiveKeyEntry } = await import('./aiKeyStore.js');
            const entry = getEffectiveKeyEntry();
            if (entry && typeof entry.key === 'string' && entry.key.trim()) {
                resolvedApiKey = entry.key;
                if (!resolvedProviderId && entry.providerId) resolvedProviderId = entry.providerId;
            }
        } catch (e) { /* 无可用 Key 时保持 undefined，走原有错误提示 */ }
    }
    // 显式 providerId 存在时以 entry 形态传入，使 getAiProvider 跳过形状推断
    const providerInfo = getAiProvider(
        resolvedProviderId ? { key: resolvedApiKey, providerId: resolvedProviderId } : resolvedApiKey,
        fullCheck
    );
    const needPinyinCheck = fullCheck || fixPinyin;
    const applyWords = fullCheck || fillMissing;

    // v3.0.4：模型来源改为注册表；poly_check 使用 fullCheck 强模型（若有）。
    // 按引擎作用域的覆盖（ai_model_override_<providerId>，旧全局键仅对 deepseek/volcano 生效）
    // 优先级最高，保证“逃生门”在任何模式下都能生效。
    const overrideModel = readModelOverride(providerInfo.providerId);
    const providerObj = getProvider(providerInfo.providerId);
    const fullCheckModel = pickProviderModel(providerObj, true);
    const defaultModel = overrideModel || providerInfo.model;
    const polyModel = overrideModel || (fullCheckModel ? fullCheckModel.id : providerInfo.model);

    // 5 分钟硬超时
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), HARD_TIMEOUT_MS);
    // 联动外部 signal（补丁A：兼容旧环境）
    const combinedSignal = combineSignals(signal, timeoutCtrl.signal);

    let timedOut = false;

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

    // 筛选待处理字（修复缓存穿透：needPinyinCheck 时要求 pinyinChecked 才能跳过）
    for (const c of uniqueChars) {
        const ent = cache[c];
        // ★ v1.2.0：用户手动修改过的字不参与 AI 处理（手动 > AI），计入已处理避免误报缺失
        if (ent && ent.userEdited === true) {
            aiCachedChars.push(c);
            continue;
        }
        const hasZuci = ent && Array.isArray(ent.zuci) && ent.zuci.length > 0;
        const hasPinyin = ent && ent.pinyinFixed === true;
        const hasPinyinChecked = ent && ent.pinyinChecked === true;

        if (needPinyinCheck) {
            // 需要拼音校验：必须 pinyinChecked=true 才能跳过
            if (hasPinyinChecked || (hasZuci && hasPinyin)) {
                aiCachedChars.push(c);
            } else {
                toFetch.push(c);
            }
        } else {
            // 补丁B：仅组词补齐模式下，只有"已有组词"才算已缓存。
            // 只有拼音纠正记录（zuci 为空）的字不能被跳过，否则永远补不上组词。
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
                    break;
                }
                const batch = charList.slice(i, i + batchSize);
                const pairs = batch.map(c => {
                    let py = '';
                    try {
                        py = pinyin(c, { toneType: 'symbol', segment: true, nonZh: 'consecutive' }) || '';
                    } catch (e) { py = ''; }
                    const existing = needPinyinCheck ? getDefaultZuci(c) : [];
                    return { char: c, pinyin: py, existing };
                });

                let result = null;
                for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
                    if (combinedSignal?.aborted) { timedOut = true; break; }
                    try {
                        const apiResult = await callDeepSeekDirect(pairs, {
                            apiKey: resolvedApiKey, signal: combinedSignal, model: useModel, mode,
                            supportJsonMode: providerInfo.supportJsonMode, providerInfo
                        });
                        result = apiResult.data;
                        break;
                    } catch (err) {
                        if (err.name === 'AbortError') { timedOut = true; break; }
                        lastError = err;
                        if (attempt < MAX_RETRY) {
                            // 短暂等待后重试（指数退避）
                            await new Promise(r => setTimeout(r, 500 * attempt));
                        }
                    }
                }
                if (combinedSignal?.aborted) { timedOut = true; break; }
                if (!result) {
                    // 该批次重试全失败，跳过但继续下一批
                    processedCount += batch.length;
                    if (typeof onProgress === 'function') {
                        onProgress({ processed: processedCount, total, mode, error: 'batch_failed' });
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
                    const hasWords = validWords.length > 0;
                    const pyFixed = fixPinyin && (entry.pinyin_fixed === true);
                    const correctedPy = typeof entry.pinyin_corrected === 'string'
                        ? entry.pinyin_corrected
                        : (entry.pinyin || '');

                    if (applyWords && hasWords) {
                        // 补丁B：保留旧条目里已有的拼音纠正记录，避免补齐组词时把纠正覆盖掉
                        const prev = cache[c] || {};
                        cache[c] = {
                            zuci: validWords.map(w => w.w),
                            pinyin: correctedPy || prev.pinyin || '',
                            pinyinFixed: pyFixed || prev.pinyinFixed === true,
                            pinyinChecked: needPinyinCheck || prev.pinyinChecked === true,
                            wordsDetail: validWords,
                            src: srcTag,
                            ts: Date.now()
                        };
                        fetchedCount++;
                    } else if (pyFixed) {
                        // 仅拼音纠错模式
                        cache[c] = {
                            zuci: [],
                            pinyin: correctedPy,
                            pinyinFixed: true,
                            pinyinChecked: true,
                            wordsDetail: [],
                            src: srcTag,
                            ts: Date.now()
                        };
                        fetchedCount++;
                    } else if (needPinyinCheck && !hasWords) {
                        // 校验模式但 AI 没返回有效组词：标记已检查但不写组词
                        cache[c] = {
                            zuci: [],
                            pinyin: correctedPy,
                            pinyinFixed: false,
                            pinyinChecked: true,
                            wordsDetail: [],
                            src: srcTag,
                            ts: Date.now()
                        };
                        fetchedCount++;
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
        noWorkNeeded
    };

    // 超时且有错误时附加诊断信息
    if (timedOut) {
        result.timeoutError = lastError ? lastError.message : '处理时间超过 5 分钟，已自动中断';
        result.suggestion = getErrorSuggestion(lastError, providerInfo);
    } else if (fetchedCount === 0 && total > 0 && lastError) {
        result.suggestion = getErrorSuggestion(lastError, providerInfo);
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
