// v3.0.0 模块B：AI 组词补齐 + 拼音纠错（双引擎：DeepSeek / 火山引擎豆包）
// 核心优化：本地预分流(单/多音字) + 三模式提示词 + 缓存穿透修复 + 进度修复 + 重试机制 + 5分钟超时
// 兼容：火山方舟 ARK Key / DeepSeek 官方 Key，自动识别前缀
// 缓存：localStorage 单 JSON Map，key = ai_zuci_cache_v1
//   条目结构：{ zuci:[词1,词2], pinyin:"纠正后拼音", pinyinFixed:bool, pinyinChecked:bool, wordsDetail:[{w,p,pos,note}], ts:number }

import cnchar from 'cnchar';
import words from 'cnchar-words';
import customZuCi from '../data/customZuCi.js';
import { pinyin } from './pinyin.js';

// 注册 cnchar 插件（幂等）
try { cnchar.use(words); } catch (e) { /* 忽略重复注册 */ }

// ========== 引擎与模型配置 ==========
// deepseek-v4-flash 已经官方文档核实（2026-07-31 正式版公测，API 调用名即 deepseek-v4-flash）
// 豆包两个模型 ID 未离线核实；若账户无权限会报 403，可用补丁C逃生门换模型
const AI_PROVIDERS = {
    deepseek: {
        endpoint: 'https://api.deepseek.com/chat/completions',
        model: 'deepseek-v4-flash',
        label: 'DeepSeek',
        supportJsonMode: true
    },
    volcano: {
        endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        model: 'doubao-seed-2-0-lite-260428',
        modelFullCheck: 'doubao-seed-2-1-turbo-260628',
        label: '豆包',
        labelFullCheck: '豆包Turbo',
        supportJsonMode: true   // v3.0.0：实测 doubao-seed-2-0-lite-260428 支持 response_format json_object（2026-08-07 90字测试通过）
    }
};

const CACHE_KEY = 'ai_zuci_cache_v1';
const HARD_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟硬超时
const MAX_RETRY = 3; // 弱模型 JSON 不稳定时的最大重试次数

// ========== 工具函数：引擎识别 ==========
export function detectApiKeyType(key) {
    if (!key || typeof key !== 'string') return 'unknown';
    const trimmed = key.trim();
    if (trimmed.startsWith('sk-')) return 'deepseek';
    if (trimmed.startsWith('ark-')) return 'volcano';
    return 'unknown';
}

export function getAiProvider(key, fullCheck = false) {
    const type = detectApiKeyType(key);
    if (type === 'unknown') {
        return { type: 'unknown', endpoint: '', model: '', label: '未知', supportJsonMode: false };
    }
    const config = AI_PROVIDERS[type];
    const useFullCheckModel = fullCheck && config.modelFullCheck;
    let model = useFullCheckModel || config.model;
    // 补丁C：紧急逃生门——若线上模型 ID 失效（403/404），可在浏览器控制台执行
    //   localStorage.setItem('ai_model_override', '正确的模型名')
    // 不重新打包即可换模型。平时不设置则完全无影响。
    try {
        const ov = localStorage.getItem('ai_model_override');
        if (ov && ov.trim()) model = ov.trim();
    } catch (e) { /* localStorage 不可用时忽略 */ }
    return {
        endpoint: config.endpoint,
        model,
        label: useFullCheckModel ? (config.labelFullCheck || config.label) : config.label,
        supportJsonMode: config.supportJsonMode ?? true,
        type
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
    if (entry && Array.isArray(entry.zuci) && entry.zuci.length > 0) {
        return entry.zuci.slice(0, 2);
    }
    return null;
}

export function getAiPinyin(char) {
    const cache = loadCache();
    const entry = cache[char];
    if (entry && entry.pinyinFixed === true && typeof entry.pinyin === 'string' && entry.pinyin) {
        return entry.pinyin;
    }
    return null;
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
export async function callDeepSeekDirect(charPinyinPairs, {
    apiKey, signal, model: customModel, mode = 'fast', supportJsonMode = true
} = {}) {
    const provider = getAiProvider(apiKey);
    if (provider.type === 'unknown') {
        throw new Error('无法识别 API Key 类型：请输入 sk- 开头（DeepSeek）或 ark- 开头（火山引擎）的 Key');
    }
    const endpoint = provider.endpoint;
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
    if (supportJsonMode) {
        reqBody.response_format = { type: 'json_object' };
    }

    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`
        },
        signal,
        body: JSON.stringify(reqBody)
    });

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let errMsg = `AI API [${provider.label}] ${resp.status}`;
        switch (resp.status) {
            case 401: errMsg += '：API Key 无效或已过期'; break;
            case 403: errMsg += '：无该模型权限或额度已耗尽'; break;
            case 429: errMsg += '：请求过频，触发限流'; break;
            default: errMsg += `：${errText.slice(0, 150)}`;
        }
        throw new Error(errMsg);
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

// ========== 主流程：智能组词 + 校验（三模式分流 + 5分钟超时 + 重试） ==========
export async function fillMissingZuci(chars, {
    apiKey, signal,
    fullCheck = false, fillMissing = false, fixPinyin = false, onProgress
} = {}) {
    const start = Date.now();
    const providerInfo = getAiProvider(apiKey, fullCheck);
    const needPinyinCheck = fullCheck || fixPinyin;
    const applyWords = fullCheck || fillMissing;

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
                            apiKey, signal: combinedSignal, model: useModel, mode,
                            supportJsonMode: providerInfo.supportJsonMode
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
            const fastModel = providerInfo.type === 'volcano'
                ? AI_PROVIDERS.volcano.model
                : providerInfo.model;
            await batchProcess(fastChars, 'fast', 10, fastModel);
        }

        // 2. 单音字校验模式（批次 10）
        if (singleCheckChars.length > 0 && !timedOut) {
            const checkModel = providerInfo.type === 'volcano'
                ? AI_PROVIDERS.volcano.model
                : providerInfo.model;
            await batchProcess(singleCheckChars, 'single_check', 10, checkModel);
        }

        // 3. 多音字深度校验模式（批次 6，用强模型）
        if (polyCheckChars.length > 0 && !timedOut) {
            const polyModel = providerInfo.type === 'volcano'
                ? (AI_PROVIDERS.volcano.modelFullCheck || AI_PROVIDERS.volcano.model)
                : providerInfo.model;
            await batchProcess(polyCheckChars, 'poly_check', 6, polyModel);
        }
    }

    clearTimeout(timeoutId);

    const ai = fetchedCount + aiCachedChars.length;
    const def = defaultOKChars.length;
    const missing = uniqueChars.length - ai - def;
    const elapsed = Date.now() - start;

    // 构建返回结果
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
        timedOut,
        partialSuccess: timedOut && fetchedCount > 0
    };

    // 超时且有错误时附加诊断信息
    if (timedOut) {
        result.timeoutError = lastError ? lastError.message : '处理时间超过 5 分钟，已自动中断';
        result.suggestion = getErrorSuggestion(lastError, providerInfo);
    } else if (fetchedCount === 0 && total > 0 && lastError) {
        result.suggestion = getErrorSuggestion(lastError, providerInfo);
    }

    return result;
}

// ========== 错误诊断建议 ==========
function getErrorSuggestion(error, providerInfo) {
    if (!error) return '';
    const msg = error.message || '';
    if (msg.includes('401')) return 'API Key 无效或已过期，请检查设置中的 Key 是否正确';
    if (msg.includes('403')) return '无该模型调用权限或账户额度已耗尽，请更换模型或充值（也可在控制台用 localStorage.setItem("ai_model_override","模型名") 临时换模型）';
    if (msg.includes('404')) return '模型未开通或模型ID不存在，请在火山方舟控制台开通对应模型（doubao-seed-2-0-lite-260428），或用 localStorage.setItem("ai_model_override","正确模型ID") 临时切换';
    if (msg.includes('429')) return '请求过于频繁被限流，请等待 30 秒后重试';
    if (msg.includes('无法解析为 JSON')) return 'AI 模型返回格式异常，建议更换模型或减少单次处理字数';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        return '网络连接失败，请检查网络或更换 API 提供商（DeepSeek / 火山引擎）';
    }
    if (msg.includes('超时') || msg.includes('timeout')) {
        return '请求超时，可能是网络延迟或模型负载高，建议减少单次处理字数或稍后重试';
    }
    return `错误详情：${msg.slice(0, 100)}。建议检查 API Key、网络连接后重试`;
}
