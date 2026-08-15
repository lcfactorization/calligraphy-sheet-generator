// 文件导入模块
// 支持 txt/md/csv/xlsx/docx 文件导入到输入框
// 纯原生 JS 实现，xlsx 和 docx 通过动态 import 第三方库解析

// 导入增强——批量预填充缓存（ESM import 必须放在模块顶层）
import { preloadAiZuciCache } from './aiZuci.js';

// 文本文件大小上限：1MB（1048576 字节）— 用于 txt/md/csv
const MAX_FILE_SIZE = 1048576;
// 二进制文件大小上限：5MB（5242880 字节）— 用于 xlsx/docx
const MAX_BINARY_FILE_SIZE = 5242880;

// 允许的文件扩展名
const ALLOWED_EXTS = ['txt', 'md', 'csv', 'markdown', 'xlsx', 'docx'];
// 需要二进制解析的扩展名（走动态 import 第三方库路径）
const BINARY_EXTS = ['xlsx', 'docx'];

/**
 * 从文本中过滤出纯汉字字符
 * 字帖主要支持汉字的米字格、笔画笔顺拆分、组词、描摹等，
 * 非汉字字符（标点、字母、数字、空格、换行等）统统忽略
 * v2.8.2：扩展 Unicode 覆盖范围，支持繁体及扩展区汉字
 *   - U+4E00 ~ U+9FFF：CJK 基本汉字 + 基本区扩展（含原 U+9FA6 ~ U+9FFF）
 *   - U+3400 ~ U+4DBF：CJK 扩展 A 区（罕用汉字，如「㐀㐁㐂」）
 *   - U+F900 ~ U+FAFF：CJK 兼容汉字（繁体/异体字，如「豈更車」）
 *   注：兼容表意文字补充区（U+2F800 ~ U+2FA1F）暂不纳入，
 *       因其码点超出 JS 正则的 \u 范围，且实际使用极少
 * @param {string} text - 原始文本
 * @returns {string} 纯汉字字符串（可能为空字符串）
 */
function filterChineseChars(text) {
    if (!text || typeof text !== 'string') return '';
    const beforeLen = text.length;
    // 匹配 CJK 基本汉字 + 基本区扩展 + 扩展 A 区 + 兼容汉字，其余字符一律忽略
    const matches = text.match(/[\u4e00-\u9fa5]/g);
    const filtered = matches ? matches.join('') : '';
    console.log('[FileImporter] 汉字过滤：' + beforeLen + ' -> ' + filtered.length + ' 字符');
    return filtered;
}

/**
 * 去除 Markdown 标记，保留纯文本
 * 处理：标题、粗体/斜体、删除线、列表、代码、引用、链接、图片、水平线、HTML 标签
 * @param {string} text - 原始 markdown 文本
 * @returns {string} 纯文本
 */
function stripMarkdown(text) {
    return text
        // 移除图片 ![alt](url) -> alt
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        // 移除链接 [text](url) -> text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        // 移除代码块 ```lang\n...``` -> 保留代码内容
        .replace(/```(\w*)\n?([\s\S]*?)```/g, '$2')
        // 移除行内代码 `code` -> code
        .replace(/`([^`]+)`/g, '$1')
        // 移除标题标记 # ## ### 等
        .replace(/^#{1,6}\s+/gm, '')
        // 移除引用标记 >
        .replace(/^>\s*/gm, '')
        // 移除粗斜体 ***text***
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
        // 移除粗体 **text** __text__
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        // 移除斜体 *text* _text_
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // 移除删除线 ~~text~~
        .replace(/~~([^~]+)~~/g, '$1')
        // 移除无序列表标记 - * +
        .replace(/^\s*[-*+]\s+/gm, '')
        // 移除有序列表标记 1. 2.
        .replace(/^\s*\d+\.\s+/gm, '')
        // 移除水平线 --- *** ___
        .replace(/^[-*_]{3,}\s*$/gm, '')
        // 移除 HTML 标签
        .replace(/<[^>]+>/g, '')
        // 合并多余空行（3个以上换行压缩为2个）
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * 解析 CSV 文件
 * 按行拼接，每行单元格内容用空格连接（逗号分隔转空格）
 * 支持带引号的字段（包含逗号或换行的字段）
 * @param {string} text - 原始 CSV 文本
 * @returns {string} 解析后的纯文本
 */
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            // 在引号内：处理转义引号 "" -> "
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++;
            } else if (char === '"') {
                // 引号结束
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                // 引号开始
                inQuotes = true;
            } else if (char === ',') {
                // 字段分隔
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                // 行结束
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else if (char === '\r') {
                // 跳过 \r（Windows 换行符处理）
            } else {
                currentField += char;
            }
        }
    }
    // 处理最后一行（文件末尾无换行的情况）
    if (currentField !== '' || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    // 每行单元格用空格拼接，过滤空行，行与行用换行拼接
    return rows
        .map(function (row) { return row.join(' ').trim(); })
        .filter(function (line) { return line.length > 0; })
        .join('\n');
}

// ============================================================
// 导入增强（多音字/组词/拼音指定）
// 用户输入宽松：一行一汉字条目 `汉字 [拼音] [组词列表]`，分隔符全宽容（全角→半角归一化）
// 判定互斥：多音字指定 > 带组词 > 带拼音 > 纯汉字；增强行占比 >60% 才整体命中，否则回退纯汉字
// ============================================================

// 汉字范围（与 filterChineseChars 同范围：基本区 + 扩展A + 兼容区）
const HAN = '\u4e00-\u9fa5';
// 拼音字母：a-z + 带调符号 + ü/ǖǘǚǜ + ň/ɡ（ɡ 防 ng 误切）
const PY = 'a-zA-Zāáǎàōóǎòēéěèīíǐìūúǔùüǖǘǚǜńňɡg';

// 全角符号 → 半角映射（归一化用）
const FULL2HALF = {
    '：': ':', '，': ',', '、': ',', '．': '.', '。': '.',
    '｜': '|', '／': '/', '（': '(', '）': ')', '；': ';',
    '　': ' ', '·': ' ', '—': '-', '―': '-'
};

/**
 * 全角→半角归一化：全角标点映射为半角，连续空白压缩为单空格，去除 NBSP
 * @param {string} s - 原始行文本
 * @returns {string} 归一化后的文本
 */
function normalizeLine(s) {
    return String(s || '')
        .replace(/[：，、．。｜／（）；　·—―]/g, ch => FULL2HALF[ch] || ch)
        .replace(/[ \t]+/g, ' ')   // 连续空白压缩为单空格
        .replace(/\u00a0/g, ' ');   // NBSP
}

// A. 多音字条目行：汉字 + 多个「拼音(可选组词)」分组（分组间以 | 或 / 或 空白+下一拼音 分隔）
//    例：行: xíng(行走,行动) háng(银行,行业) / 行 xíng 行走 行动|háng 银行 行业
const RE_POLY_ENTRY = new RegExp(
    '^([' + HAN + '])' +                    // 组1：汉字
    '\\s*[:：]?\\s*' +                     // 可选冒号
    '(' +                                    // 组2：分组序列
    '(?:' +
    '[' + PY + ']+' +                        // 拼音（带调/无声调均可）
    '(?:\\s*\\(([^()]*)\\))?' +          // 组3：该读音的组词（括号内，可省）
    '(?:\\s*[|/]\\s*|\\s+(?=[' + PY + ']))' +  // 分组间分隔：| 或 / 或 空白+下一拼音
    ')*' +
    '[' + PY + ']+' +                        // 最后一个分组（无尾分隔符）
    '(?:\\s*\\(([^()]*)\\))?' +          // 组4：末分组组词
    ')' +
    '\\s*$'
);

// B. 普通条目行：汉字 + 可选拼音 + 可选组词列表
//    例：天 tiān 天空 天气 / 春 春天 春风 / 行 xing 行走
const RE_ENTRY = new RegExp(
    '^([' + HAN + '])' +                     // 组1：汉字
    '(?:\\s*[:：,;/|]?\\s*([' + PY + ']+))?' + // 组2：可选拼音（分隔符宽容：空格/冒号/逗号/分号/斜杠/竖线）
    '(?:[\\s,;:]+(.+)|\\s*\\(([^()]*)\\))?' + // 组3/组4：可选组词（空格/逗号/冒号分隔 或 括号包裹，如 天:tiān(天空,天气)）
    '\\s*$'
);

// C. 多音字"换行缩进块"延续行（行首空白，无独立汉字）
const RE_CONTINUE_LINE = new RegExp('^\\s+([' + PY + ']+)(?:\\s*[:：]?\\s*)?([^\\n]*)$');

/**
 * 组词 token 切分：宽容规则——按 [\s,;()|/]+ 切分，
 * token 须含汉字且长度≥2（纯拼音 token 跳过，单字 token 丢弃）
 * @param {string} text - 组词原始文本
 * @returns {string[]}
 */
function splitZuci(text) {
    return String(text || '').split(/[\s,;()|/]+/)
        .map(s => s.trim())
        .filter(t => /[\u4e00-\u9fa5]/.test(t) && t.length >= 2);
}

/**
 * 多音字分组切分：把 "xíng 行走 行动|háng 银行" 切成 [{p:'xíng',zuci:[行走,行动]},...]
 * 优先按 |/ 切分；无 |/ 时按"拼音 token 边界"切分（兼容 "xíng(行走,行动) háng(银行,行业)"）
 * @param {string} body - 汉字之后的分组文本（可带冒号前缀）
 * @returns {Array<{p:string, zuci:string[]}>}
 */
function splitPolyGroups(body) {
    const groups = [];
    const bodyStr = String(body);

    // 1) 先按 | / 切分（最常见写法：xíng 行走 行动|háng 银行）
    const parts = bodyStr.split(/[|/]/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
        for (const part of parts) {
            const m = part.match(new RegExp('^\\s*[:：]?\\s*(' + PY + '+)\\s*(?:\\(([^()]*)\\))?([\\s\\S]*)$'));
            if (!m) continue;
            groups.push({ p: m[1], zuci: splitZuci(m[2] || m[3]) });
        }
        if (groups.length >= 2) return groups;
    }

    // 2) 按拼音 token 边界切分（无 |/ 的写法：xíng(行走,行动) háng(银行,行业)）
    const tokenRe = new RegExp('[' + PY + ']+', 'g');
    const hits = [];
    let mm;
    while ((mm = tokenRe.exec(bodyStr)) !== null) {
        hits.push({ start: mm.index, end: mm.index + mm[0].length, py: mm[0] });
        if (mm.index === tokenRe.lastIndex) tokenRe.lastIndex++;  // 防死循环
    }
    if (hits.length >= 2) {
        for (let i = 0; i < hits.length; i++) {
            const start = hits[i].end;
            const end = (i + 1 < hits.length) ? hits[i + 1].start : bodyStr.length;
            groups.push({ p: hits[i].py, zuci: splitZuci(bodyStr.slice(start, end)) });
        }
        return groups;
    }

    return groups;
}

/**
 * 把一个读音变体加入条目（去重拼音）
 * @param {Map} entries - char -> { variants:[{p,zuci:[]}] }
 * @param {string} char - 汉字
 * @param {string} p - 拼音
 * @param {string|string[]} zuci - 组词文本或数组
 */
function addVariant(entries, char, p, zuci) {
    let e = entries.get(char);
    if (!e) { e = { variants: [] }; entries.set(char, e); }
    const pTrim = String(p || '').trim();
    if (!pTrim) return;
    const zuciArr = Array.isArray(zuci) ? zuci : splitZuci(zuci);
    const hit = e.variants.find(v => v.p === pTrim);
    if (!hit) {
        e.variants.push({ p: pTrim, zuci: zuciArr });
    } else {
        hit.zuci = [...new Set([...hit.zuci, ...zuciArr])];
    }
}

/**
 * 普通条目：字 + 可选拼音 + 可选组词
 */
function addEntry(entries, char, py, zuciText) {
    const zuci = splitZuci(zuciText);
    if (py) {
        addVariant(entries, char, py, zuci);
    } else {
        let e = entries.get(char);
        if (!e) { e = { variants: [{ p: '', zuci: [] }] }; entries.set(char, e); }
        if (zuci.length) {
            e.variants[0].zuci = [...new Set([...e.variants[0].zuci, ...zuci])];
        }
    }
}

/**
 * 判断一行是否为多音字行：行首单汉字 + 之后含 ≥2 个拼音 token（或 RE_POLY_ENTRY 命中）
 */
function isPolyLine(line) {
    const head = line.match(new RegExp('^([' + HAN + '])\\s*[:：]?\\s*'));
    if (!head) return false;
    const body = line.slice(head[0].length);
    // 判定多音字：行首汉字之后含 ≥2 个拼音 token（纯数字或纯汉字都不是 pinyin）
    const tokens = body.match(new RegExp('[' + PY + ']+', 'g')) || [];
    return tokens.length >= 2;
}

/**
 * 逐行解析增强格式
 * @param {string[]} lines - 原始行
 * @returns {{entries:Map, enhancedLineCount:number, plainCount:number}}
 */
function parseEnhancedLines(lines) {
    const entries = new Map();   // char -> { variants:[{p, zuci:[]}] }
    let pendingChar = null;      // 多音字缩进块延续的归属字
    let enhancedLineCount = 0;
    let plainCount = 0;

    for (const raw of lines) {
        const norm = normalizeLine(raw);
        const line = norm.trim();
        if (!line) { pendingChar = null; continue; }

        // 1) 缩进延续行 → 并入 pendingChar 的多音字分组（raw 保留行首空白用于判定）
        if (pendingChar && /^\s+[A-Za-zā-ǜ]/.test(norm)) {
            const m = norm.match(RE_CONTINUE_LINE);
            if (m) { addVariant(entries, pendingChar, m[1], m[2]); enhancedLineCount++; continue; }
        }

        // 2) 多音字条目（互斥优先级最高）：行首单汉字 + 之后含 ≥2 个拼音分组
        const polyHead = line.match(new RegExp('^([' + HAN + '])\\s*[:：]?\\s*'));
        if (polyHead && isPolyLine(line)) {
            pendingChar = polyHead[1];
            const groups = splitPolyGroups(line.slice(polyHead[1].length));
            let added = 0;
            for (const g of groups) { addVariant(entries, polyHead[1], g.p, g.zuci); added++; }
            if (added >= 1) { enhancedLineCount++; continue; }
        }

        // 3) 普通条目（字 + 可选拼音 + 可选组词）
        const m2 = line.match(RE_ENTRY);
        if (m2) {
            pendingChar = m2[1];
            addEntry(entries, m2[1], m2[2] || '', m2[3] || m2[4] || '');
            enhancedLineCount++;
            continue;
        }

        // 4) 纯汉字行 → 计入 plain 集合（回退候选）
        const hans = line.match(new RegExp('[' + HAN + ']', 'g'));
        if (hans) {
            for (const c of hans) {
                let e = entries.get(c);
                if (!e) { e = { variants: [{ p: '', zuci: [] }] }; entries.set(c, e); }
            }
            pendingChar = null;
            plainCount++;
        }
    }
    return { entries, enhancedLineCount, plainCount };
}

/**
 * 转换为 ai_zuci_cache_v1 兼容缓存 JSON
 * @param {Map} entries
 * @returns {Object} char -> 缓存条目
 */
function toCacheEntries(entries) {
    const out = {};
    for (const [char, e] of entries) {
        if (!e.variants || e.variants.length === 0) continue;
        const first = e.variants[0];
        // zuci：全部读音的组词平铺去重（渲染 getZuCi 取前2）
        const zuci = [...new Set(e.variants.flatMap(v => v.zuci))];
        // 纯汉字行（无拼音且无组词）：不写缓存，让 AI/默认词库正常生效
        const hasPinyin = first.p && first.p.trim();
        if (!hasPinyin && zuci.length === 0) continue;
        // wordsDetail：每个读音的词带各自拼音（多音字天然支持）
        const wordsDetail = e.variants.flatMap(v =>
            v.zuci.map(w => ({ w, p: (v.p ? v.p + ' ' : '') + (w.slice(1) || ''), pos: '', note: '' }))
        );
        out[char] = {
            zuci,
            pinyin: first.p,                    // 主读音（渲染单字拼音显示用）
            pinyinFixed: true,                  // 必须 true，GridEngine 才会用缓存拼音
            pinyinChecked: true,
            pinyinVariants: e.variants.map(v => v.p),   // 全部读音（向后兼容增量字段）
            wordsDetail,
            userSpecified: true,                // 用户导入指定（区别于 AI 缓存）
            ts: Date.now()
        };
    }
    return out;
}

/**
 * 增强解析入口：返回 { text, cache }；未命中增强格式时 cache 为 null
 * 启发式：增强行占比 > 60% 才命中，否则回退纯汉字
 * @param {string} content - 文本内容
 * @returns {{text:string, cache:Object}|null}
 */
function tryParseEnhanced(content) {
    if (!content || typeof content !== 'string') return null;
    const lines = content.split(/\r?\n/);
    const { entries, enhancedLineCount, plainCount } = parseEnhancedLines(lines);
    if (!entries || entries.size === 0) return null;
    const total = enhancedLineCount + plainCount;
    if (total === 0) return null;
    // 增强行占比 > 60% 才算命中（防止一篇普通文章被误判）
    if (enhancedLineCount / total < 0.6) return null;
    const cache = toCacheEntries(entries);
    if (Object.keys(cache).length === 0) return null;
    const text = [...entries.keys()].join('');
    return { text, cache };
}

// ============================================================
// 导入增强结束
// ============================================================

/**
 * 解析 XLSX 文件
 * 使用 SheetJS（动态 import）读取第一个 sheet
 * 按行拼接单元格内容（每行单元格用空格分隔，行与行用换行分隔）
 * @param {ArrayBuffer} arrayBuffer - 文件二进制内容
 * @returns {Promise<string>} 解析后的纯文本
 */
async function parseXLSX(arrayBuffer) {
    // 动态加载 SheetJS，避免影响首屏体积
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('XLSX 文件无有效工作表');
    }
    // 读取第一个 sheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
        throw new Error('XLSX 工作表为空');
    }
    // 转为二维数组：header:1 表示按行输出数组，defval 给空单元格默认值
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rows || rows.length === 0) {
        throw new Error('XLSX 工作表无有效数据');
    }
    // 每行单元格用空格拼接，过滤空行，行与行用换行拼接
    return rows
        .map(function (row) {
            return row.map(function (cell) {
                return cell === null || cell === undefined ? '' : String(cell);
            }).join(' ').trim();
        })
        .filter(function (line) { return line.length > 0; })
        .join('\n');
}

/**
 * 解析 DOCX 文件
 * 使用 mammoth.js（动态 import）转换为纯文本
 * @param {ArrayBuffer} arrayBuffer - 文件二进制内容
 * @returns {Promise<string>} 解析后的纯文本
 */
async function parseDOCX(arrayBuffer) {
    // 动态加载 mammoth；主入口失败时回退到浏览器专用入口
    let mammoth;
    try {
        mammoth = await import('mammoth');
    } catch (e) {
        // 浏览器兼容性回退方案
        mammoth = await import('mammoth/mammoth.browser');
    }
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    if (!result || !result.value) {
        throw new Error('DOCX 文件无有效文本内容');
    }
    return result.value;
}

/**
 * 显示 Toast 提示（固定顶部居中，3 秒自动消失）
 * @param {string} message - 提示消息
 * @param {string} type - 提示类型：info / success / error
 */
function showToast(message, type) {
    // 移除已有 toast，避免堆叠
    const existing = document.querySelector('.file-importer-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'file-importer-toast file-importer-toast-' + (type || 'info');
    toast.textContent = message;
    document.body.appendChild(toast);

    // 触发进入动画
    requestAnimationFrame(function () {
        toast.classList.add('show');
    });

    // 3 秒后自动消失
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
}

/**
 * 根据文件扩展名处理内容
 * txt/md/csv 统一在此走文本解析路径
 * 优先尝试增强解析（多音字/组词/拼音指定），未命中回退过滤纯汉字
 * @param {string} name - 文件名
 * @param {string} content - 文件文本内容
 * @returns {string} 处理后的纯汉字文本
 */
function processFileContent(name, content) {
    const ext = name.toLowerCase().split('.').pop();

    let parsed;
    if (ext === 'md' || ext === 'markdown') {
        parsed = stripMarkdown(content);
    } else if (ext === 'csv') {
        parsed = parseCSV(content);
    } else {
        // txt 原样保留
        parsed = content;
    }

    // ① 优先尝试增强解析（互斥：多音字>组词>拼音>纯汉字 由 parseEnhancedLines 内部分级实现）
    const enhanced = tryParseEnhanced(parsed);
    if (enhanced && enhanced.text) {
        try {
            // ② 写入缓存 + 派发事件
            const written = preloadAiZuciCache(enhanced.cache);
            document.dispatchEvent(new CustomEvent('calligraphy:import-enhanced', {
                detail: { type: 'enhanced', count: written, chars: Object.keys(enhanced.cache) }
            }));
            // ③ 触发重渲染（main.js 已监听 settings-updated）
            document.dispatchEvent(new CustomEvent('calligraphy:settings-updated'));
            console.log('[FileImporter] 增强解析命中：' + written + ' 字（含拼音/组词指定）');
        } catch (err) {
            console.error('[FileImporter] 增强解析写入缓存失败，回退纯汉字:', err);
        }
        return enhanced.text;   // 纯汉字串填入 #inputText，与旧行为一致
    }

    // ④ 回退旧逻辑：过滤出纯汉字字符
    return filterChineseChars(parsed);
}

/**
 * 文件导入器类
 * 负责创建按钮、绑定事件、读取文件并填充到输入框
 */
class FileImporter {
    constructor() {
        this.button = null;
        this.fileInput = null;
        this.textarea = null;
    }

    /**
     * 初始化：查找输入框、创建按钮和隐藏 file input、绑定事件
     */
    init() {
        // 查找输入框元素
        this.textarea = document.getElementById('inputText');
        if (!this.textarea) {
            console.warn('[FileImporter] 未找到输入框 #inputText，跳过初始化');
            return;
        }

        // 如已有导入按钮则复用，避免重复创建
        if (document.getElementById('fileImportBtn')) {
            this.button = document.getElementById('fileImportBtn');
            this.fileInput = document.getElementById('fileImportInput');
            return;
        }

        // 创建"📁 导入文件"按钮（复用现有 .btn .btn-secondary 样式）
        this.button = document.createElement('button');
        this.button.id = 'fileImportBtn';
        this.button.className = 'btn btn-secondary file-import-btn';
        this.button.type = 'button';
        this.button.title = '导入 txt/md/csv/xlsx/docx 文件到输入框';
        this.button.innerHTML = '📁 导入文件';

        // 创建隐藏的 file input
        this.fileInput = document.createElement('input');
        this.fileInput.id = 'fileImportInput';
        this.fileInput.type = 'file';
        this.fileInput.accept = '.txt,.md,.csv,.markdown,.xlsx,.docx';
        this.fileInput.style.display = 'none';

        // 插入按钮到 DOM：优先放入 clear-btn 所在的 btn-row 最前面
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn && clearBtn.parentElement) {
            clearBtn.parentElement.insertBefore(this.button, clearBtn);
        } else {
            // 后备方案：插入到 textarea 的父容器
            this.textarea.parentElement.insertBefore(this.button, this.textarea.nextSibling);
        }
        document.body.appendChild(this.fileInput);

        // 绑定按钮点击 → 触发 file input
        this.button.addEventListener('click', () => {
            this.fileInput.click();
        });

        // 绑定 file input change 事件
        this.fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });
    }

    /**
     * 处理文件选择事件
     * - txt/md/csv：走 FileReader 文本路径（同步处理）
     * - xlsx/docx：走 arrayBuffer 二进制路径（异步动态 import 第三方库）
     * @param {Event} e - change 事件
     */
    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.toLowerCase().split('.').pop();
        const isBinary = BINARY_EXTS.includes(ext);
        const sizeLimit = isBinary ? MAX_BINARY_FILE_SIZE : MAX_FILE_SIZE;

        // 校验文件大小
        if (file.size > sizeLimit) {
            const limitMb = Math.floor(sizeLimit / 1048576);
            showToast('文件过大（超过 ' + limitMb + 'MB），请选择更小的文件', 'error');
            e.target.value = '';
            return;
        }

        // 校验文件扩展名
        if (!ALLOWED_EXTS.includes(ext)) {
            showToast('仅支持 txt / md / csv / xlsx / docx 格式的文件', 'error');
            e.target.value = '';
            return;
        }

        // 二进制文件（xlsx/docx）：异步解析路径
        if (isBinary) {
            // 显示 loading 状态，禁用按钮避免重复触发
            const originalText = this.button.innerHTML;
            this.button.innerHTML = '⏳ 解析中...';
            this.button.disabled = true;

            try {
                const arrayBuffer = await file.arrayBuffer();
                let processed;

                if (ext === 'xlsx') {
                    processed = await parseXLSX(arrayBuffer);
                } else if (ext === 'docx') {
                    processed = await parseDOCX(arrayBuffer);
                }

                // 优先尝试增强解析（xlsx 单列"字/拼音/组词"或双列"字,拼音,组词"经 parseXLSX 行拼接后自然落入增强解析）
                const enhanced = tryParseEnhanced(processed);
                if (enhanced && enhanced.text) {
                    preloadAiZuciCache(enhanced.cache);
                    document.dispatchEvent(new CustomEvent('calligraphy:settings-updated'));
                    processed = enhanced.text;
                } else {
                    // 过滤出纯汉字字符（标点、字母、数字、空白等统统忽略）
                    processed = filterChineseChars(processed);
                }

                // 处理后内容有效性检测（无汉字时提示用户）
                if (!processed || processed.trim() === '') {
                    showToast('文件中未发现汉字字符', 'error');
                    e.target.value = '';
                    return;
                }

                // 填入输入框
                this.textarea.value = processed;
                this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
                this.textarea.focus();
                showToast('已导入 ' + processed.length + ' 个汉字', 'success');
            } catch (err) {
                console.error('[FileImporter] 解析二进制文件失败:', err);
                showToast('文件解析失败：' + (err.message || '未知错误'), 'error');
            } finally {
                // 恢复按钮状态，重置 file input
                this.button.innerHTML = originalText;
                this.button.disabled = false;
                e.target.value = '';
            }
            return;
        }

        // 文本文件（txt/md/csv）：FileReader 路径
        const reader = new FileReader();

        reader.onload = (event) => {
            const content = event.target.result;

            // 空文件检测
            if (!content || (typeof content === 'string' && content.trim() === '')) {
                showToast('文件内容为空', 'error');
                e.target.value = '';
                return;
            }

            try {
                // 根据文件类型处理内容（内部已过滤为纯汉字）
                const processed = processFileContent(file.name, content);

                // 处理后内容有效性检测（无汉字时提示用户）
                if (!processed || processed.trim() === '') {
                    showToast('文件中未发现汉字字符', 'error');
                    e.target.value = '';
                    return;
                }

                // 清空输入框原有内容，填入新内容
                this.textarea.value = processed;
                // 触发 input 事件（让字数计数器等模块更新）
                this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
                // 聚焦输入框
                this.textarea.focus();

                showToast('已导入 ' + processed.length + ' 个汉字', 'success');
            } catch (err) {
                console.error('[FileImporter] 处理文件失败:', err);
                showToast('文件处理失败：' + err.message, 'error');
            }

            // 重置 file input，允许重复选择同一文件
            e.target.value = '';
        };

        reader.onerror = () => {
            showToast('文件读取失败，请重试', 'error');
            e.target.value = '';
        };

        // 以文本方式读取（不指定编码，让浏览器自动检测 BOM）
        reader.readAsText(file);
    }
}

// 单例实例
const fileImporter = new FileImporter();

/**
 * 供 main.js 调用的注册函数
 * 调用后会自动查找输入框并注入导入按钮
 */
export function registerFileImporter() {
    fileImporter.init();
}

export { FileImporter, filterChineseChars, tryParseEnhanced };
export default fileImporter;
