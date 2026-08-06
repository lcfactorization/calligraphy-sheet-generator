// v2.9.9 模块B：AI 组词补齐
// 对默认词库（customZuCi + cnchar-words）缺失的字，调用 DeepSeek 大模型补齐二字组词。
// 缓存：localStorage 单 JSON Map，key = ai_zuci_cache_v1
// API Key：localStorage key = deepseek_api_key（独立于 calligraphy_settings）
// DeepSeek endpoint：https://api.deepseek.com/chat/completions，model = deepseek-chat

import cnchar from 'cnchar';
import words from 'cnchar-words';
import customZuCi from '../data/customZuCi.js';

// 自包含注册 words 插件（cnchar.use 幂等，重复调用安全；zuci.js 也会调用一次）
try { cnchar.use(words); } catch (e) { /* 忽略重复注册 */ }

const CACHE_KEY = 'ai_zuci_cache_v1';

/** 加载 AI 组词缓存（单 JSON Map） */
function loadCache() {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

/** 保存 AI 组词缓存（满则忽略） */
function saveCache(map) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(map));
    } catch (e) {
        /* localStorage 配额满则忽略 */
    }
}

/**
 * 从 AI 缓存读取某字的组词（供 zuci.js 调用，避免循环依赖）
 * @returns {string[]|null} 长度 1-2 的二字组词数组，无缓存返回 null
 */
export function getAiZuci(char) {
    const cache = loadCache();
    const entry = cache[char];
    if (entry && Array.isArray(entry.zuci) && entry.zuci.length > 0) {
        return entry.zuci.slice(0, 2);
    }
    return null;
}

/**
 * 判定默认组词（customZuCi + cnchar.words，不含 AI 缓存）是否合格。
 * 合格 = 默认路径不会产生 "组词" 占位符（与 getZuCi 的占位逻辑保持一致）。
 * 注意：不调用 zuci.js 的 getZuCi 以避免循环依赖，此处复制其核心判定逻辑。
 * @param {string} char 单个汉字
 * @returns {boolean}
 */
export function isDefaultZuciOK(char) {
    try {
        // 自定义词库已有 ≥2 条 → 默认直接返回，无占位
        const custom = customZuCi[char] || [];
        if (custom.length >= 2) return true;

        // 否则走 cnchar.words（与 getZuCi 一致：custom 不足 2 条时改用 cnchar）
        const w = cnchar.words(char);
        const twoChar = (w || []).filter(word => typeof word === 'string' && word.length === 2);
        // cnchar 二字词 ≥2 → 默认返回 2 条，无占位；否则会产生 "组词" 占位 → 不合格
        return twoChar.length >= 2;
    } catch (e) {
        return false;
    }
}

/**
 * 直连 DeepSeek API，为一批汉字补齐二字组词。
 * @param {string[]} chars 汉字数组（建议 ≤10）
 * @param {{apiKey:string, signal?:AbortSignal}} opts
 * @returns {Promise<Object<string,string[]>>} { 字: [词1, 词2], ... }
 */
export async function callDeepSeekDirect(chars, { apiKey, signal } = {}) {
    const endpoint = 'https://api.deepseek.com/chat/completions';
    const systemPrompt =
        '你是组词助手。为用户给出的每个汉字，各补充2个二字组词（每个词必须是两个字、且包含该汉字）。' +
        '要求：1) 优先小学生常用词、积极健康、无生僻字；2) 严格返回 JSON 对象，' +
        '格式为 {"字1":["词1","词2"],"字2":["词1","词2"]}；3) 不要输出任何多余文字、不要使用 markdown 代码块。';
    const userPrompt = `请为以下汉字各补充2个二字组词：${chars.join('、')}`;

    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        signal,
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 2048,
            response_format: { type: 'json_object' }
        })
    });

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`DeepSeek API ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        // 兜底：从可能包含 markdown 代码块的文本中提取首个 JSON 对象
        const m = content.match(/\{[\s\S]*\}/);
        if (m) {
            parsed = JSON.parse(m[0]);
        } else {
            throw new Error('DeepSeek 返回内容无法解析为 JSON');
        }
    }
    return parsed || {};
}

/**
 * 主流程：筛选默认不合格的字 → 调用 DeepSeek 补齐 → 校验 → 写缓存。
 * @param {string[]} chars 汉字数组（可含重复/非汉字，内部去重过滤）
 * @param {{apiKey:string, signal?:AbortSignal}} opts
 * @returns {Promise<{total:number, ai:number, default:number, missing:number, elapsed:number}>}
 */
export async function fillMissingZuci(chars, { apiKey, signal } = {}) {
    const start = Date.now();

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
    for (const c of uniqueChars) {
        if (isDefaultZuciOK(c)) {
            defaultOKChars.push(c);
        } else if (cache[c] && Array.isArray(cache[c].zuci) && cache[c].zuci.length > 0) {
            aiCachedChars.push(c);
        } else {
            toFetch.push(c);
        }
    }

    // 分批调用 DeepSeek（每批 ≤10 字），支持中断
    const BATCH = 10;
    let fetchedCount = 0;
    for (let i = 0; i < toFetch.length; i += BATCH) {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        const batch = toFetch.slice(i, i + BATCH);
        let result = {};
        try {
            result = await callDeepSeekDirect(batch, { apiKey, signal });
        } catch (err) {
            // 中断直接抛出；其他错误中断本次批次但继续后续（已补的写入缓存）
            if (err.name === 'AbortError') throw err;
            // 非中断错误：本批失败，跳过写入，继续下一批
            continue;
        }

        // 校验 + 写缓存：每个词必须为二字、且包含该字
        for (const c of batch) {
            const list = result[c];
            if (!Array.isArray(list)) continue;
            const valid = list
                .filter(w => typeof w === 'string' && w.length === 2 && w.includes(c))
                .slice(0, 2);
            if (valid.length > 0) {
                cache[c] = { zuci: valid, ts: Date.now() };
                fetchedCount++;
            }
        }
        saveCache(cache);

        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
    }

    const ai = fetchedCount + aiCachedChars.length;
    const def = defaultOKChars.length;
    const missing = uniqueChars.length - ai - def;

    return {
        total: uniqueChars.length,
        ai,
        default: def,
        missing,
        elapsed: Date.now() - start
    };
}
