// v2.9.9 模块B：AI 组词补齐 + 拼音纠错
// 对默认词库（customZuCi + cnchar-words）缺失的字，调用 DeepSeek 大模型补齐二字组词并核对拼音。
// 功能：注音核对（多音字修正）+ 精准组词（杜绝地名/人名专有名词，词性多样化）+ 全局拼音校验
// 缓存：localStorage 单 JSON Map，key = ai_zuci_cache_v1
//   条目结构：{ zuci: [词1,词2], pinyin: "纠正后拼音", pinyinFixed: bool, wordsDetail: [{w,p,pos,note}], ts: number }
// API Key：localStorage key = deepseek_api_key（独立于 calligraphy_settings）
// DeepSeek endpoint：https://api.deepseek.com/chat/completions，model = deepseek-chat

import cnchar from 'cnchar';
import words from 'cnchar-words';
import customZuCi from '../data/customZuCi.js';
import { pinyin } from './pinyin.js';  // v2.9.9：生成预设拼音供 AI 核对

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
 * v2.9.9：从 AI 缓存读取某字的纠正后拼音（供 GridEngine.js 调用）
 * 仅当 AI 明确修正了拼音（pinyinFixed=true）时返回纠正值，否则返回 null（让 pinyin-pro 结果生效）
 * @returns {string|null} 纠正后的拼音（带声调符号），无纠正返回 null
 */
export function getAiPinyin(char) {
    const cache = loadCache();
    const entry = cache[char];
    if (entry && entry.pinyinFixed === true && typeof entry.pinyin === 'string' && entry.pinyin) {
        return entry.pinyin;
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
 * v2.9.9：直连 DeepSeek API，为一批汉字执行"注音核对 + 精准组词 + 全局拼音校验"。
 * @param {Array<{char:string, pinyin:string}>} charPinyinPairs 汉字+预设拼音数组（建议 ≤10）
 * @param {{apiKey:string, signal?:AbortSignal}} opts
 * @returns {Promise<Object>} AI 返回的 JSON 对象（chars[] + fix_count + fixes[]）
 */
export async function callDeepSeekDirect(charPinyinPairs, { apiKey, signal } = {}) {
    const endpoint = 'https://api.deepseek.com/chat/completions';
    const systemPrompt =
        '你是一位专业的汉语教学与拼音专家。请根据用户提供的生字列表及预设注音，执行"注音核对、精准组词与全局拼音校验"任务。' +
        '核心规则：\n' +
        '1. 注音优先锁定：组词前必须先核对预设拼音。如预设拼音有误（特别是多音字），自动修正并记录，组词须符合正确读音。\n' +
        '2. 高质量组词：每个生字精选且仅生成 2 个二字词组。\n' +
        '   - 严禁使用单纯作为地名、人名且无法体现字义的专有名词（如"鹤"禁用"鹤壁""鹤岗"）\n' +
        '   - 词组须鲜明、准确地体现生字的核心本义、引申义或常用义\n' +
        '   - 同一字的 2 个词组在词性（名词/动词/形容词等）或语义上要有明显区分\n' +
        '3. 全局校验：复核所有词组的带声调拼音（重点检查多音字、变调、轻声），统计修正次数。\n\n' +
        '严格返回 JSON 对象，格式如下，不要输出任何多余文字、不要使用 markdown 代码块：\n' +
        '{\n' +
        '  "chars": [\n' +
        '    {\n' +
        '      "char": "鹤",\n' +
        '      "pinyin_original": "hè",\n' +
        '      "pinyin_corrected": "hè",\n' +
        '      "pinyin_fixed": false,\n' +
        '      "words": [\n' +
        '        {"w":"仙鹤","p":"xiān hè","pos":"名词","note":"体现鹤本义，长寿象征的水鸟"},\n' +
        '        {"w":"鹤立","p":"hè lì","pos":"动词","note":"形容突出出众，引申义"}\n' +
        '      ]\n' +
        '    }\n' +
        '  ],\n' +
        '  "fix_count": 1,\n' +
        '  "fixes": [\n' +
        '    {"char":"差","from":"chā","to":"chà","reason":"多音字语境修正"}\n' +
        '  ]\n' +
        '}';

    // 构建用户消息：生字列表（含预设拼音）
    const lines = charPinyinPairs.map((p, i) => `${i + 1}. ${p.char}（${p.pinyin || '无'}）`);
    const userPrompt = `请处理以下生字（括号内为预设拼音，由 pinyin-pro 自动生成，可能有多音字误读）：\n${lines.join('\n')}`;

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
            max_tokens: 4096,
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
 * v2.9.9 主流程：筛选默认不合格的字 → 生成预设拼音 → 调用 DeepSeek 注音核对+组词+校验 → 校验 → 写缓存。
 *
 * 返回结果包含组词统计和拼音纠错报告。
 *
 * @param {string[]} chars 汉字数组（可含重复/非汉字，内部去重过滤）
 * @param {{apiKey:string, signal?:AbortSignal}} opts
 * @returns {Promise<{total:number, ai:number, default:number, missing:number, elapsed:number,
 *                     pinyinChecked:number, pinyinFixed:number, fixes:Array}>}
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

    // v2.9.9：为待补齐的字生成 pinyin-pro 预设拼音（供 AI 核对）
    const charPinyinPairs = toFetch.map(c => {
        let py = '';
        try {
            py = pinyin(c, { toneType: 'symbol', segment: true, nonZh: 'consecutive' }) || '';
        } catch (e) { py = ''; }
        return { char: c, pinyin: py };
    });

    // 分批调用 DeepSeek（每批 ≤10 字），支持中断
    const BATCH = 10;
    let fetchedCount = 0;
    let allFixes = [];  // v2.9.9：收集所有批次的拼音纠错明细

    for (let i = 0; i < charPinyinPairs.length; i += BATCH) {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        const batch = charPinyinPairs.slice(i, i + BATCH);
        let result = {};
        try {
            result = await callDeepSeekDirect(batch, { apiKey, signal });
        } catch (err) {
            // 中断直接抛出；其他错误中断本次批次但继续后续（已补的写入缓存）
            if (err.name === 'AbortError') throw err;
            continue;
        }

        // v2.9.9：解析新 JSON 格式 — chars[] 数组 + fixes[] 数组
        const charsArr = Array.isArray(result.chars) ? result.chars : [];
        for (const entry of charsArr) {
            const c = entry.char;
            if (!c || typeof c !== 'string') continue;

            // 校验组词：每个词必须为二字、且包含该字
            const wordsArr = Array.isArray(entry.words) ? entry.words : [];
            const validWords = wordsArr
                .filter(w => w && typeof w.w === 'string' && w.w.length === 2 && w.w.includes(c))
                .slice(0, 2)
                .map(w => ({ w: w.w, p: w.p || '', pos: w.pos || '', note: w.note || '' }));

            if (validWords.length > 0) {
                cache[c] = {
                    zuci: validWords.map(w => w.w),           // 向后兼容：zuci.js 使用
                    pinyin: typeof entry.pinyin_corrected === 'string' ? entry.pinyin_corrected : '',
                    pinyinFixed: entry.pinyin_fixed === true,
                    wordsDetail: validWords,                  // 详细信息（词性/说明，供 UI 展示）
                    ts: Date.now()
                };
                fetchedCount++;
            }
        }

        // v2.9.9：收集拼音纠错明细
        const fixesArr = Array.isArray(result.fixes) ? result.fixes : [];
        for (const f of fixesArr) {
            if (f && f.char) {
                allFixes.push({
                    char: f.char,
                    from: f.from || '',
                    to: f.to || '',
                    reason: f.reason || ''
                });
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
        elapsed: Date.now() - start,
        // v2.9.9：拼音纠错报告
        pinyinChecked: fetchedCount,           // 本次 AI 处理的字数（已核对拼音）
        pinyinFixed: allFixes.length,          // 纠正拼音次数
        fixes: allFixes                        // 纠错明细
    };
}
