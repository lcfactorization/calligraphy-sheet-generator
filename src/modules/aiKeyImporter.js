// v1.1.0 模块：API Key 文件导入
// v3.0.4：KEY_PATTERNS 改为由 aiProviders.PROVIDERS 的 keyShape 派生（契约 §3.6）
// v1.5.1：新增**结构化导入**，支持「已知类型」与「未知类型」两类 Key 一起批量导入。
//
// ── 为什么需要结构化导入 ──────────────────────────────────────────────────
// 旧实现只会用正则从整份文本里「捞 Key 字符串」，捞出来的条目**只有 Key 本身**。
// 于是未知厂商的 Key 导入后：引擎判不出来、baseUrl 不知道、模型 ID 不知道 ——
// 用户还得手工去设置面板一项项补。结构化格式让文件自己携带这些信息。
//
// ── 支持的三种格式（按优先级依次尝试）──────────────────────────────────
// 1) **JSON**（推荐，最不容易歧义）
//      [ { "key": "sk-…", "baseUrl": "https://api.x.com/v1", "modelId": "x-chat",
//          "providerId": "sensenova", "label": "备注" }, … ]
//    顶层也可以写成 { "keys": [ … ] }。字段别名：apiKey/key/密钥、baseUrl/base_url/url、
//    modelId/model/model、providerId/provider/engine、label/name/备注。
//
// 2) **CSV / TSV**（带表头，表头名同上；列顺序任意）
//      key,baseUrl,modelId
//      sk-…,https://api.x.com/v1,x-chat
//
// 3) **CSV / TSV**（无表头，按位置）—— 前两个字段里哪个是 URL 就认哪个是 baseUrl：
//      sk-…,https://api.x.com/v1,x-chat          （key, baseUrl, modelId[, label]）
//      https://api.x.com/v1,sk-…,x-chat          （baseUrl, key, modelId[, label]）
//
// 4) **回退：正则提取**（旧行为，完全保留）—— 整份文本里按注册表 keyShape.pattern 捞 Key。
//    适用于「一份文档里散落着若干 Key」的场景；这些条目只有 Key，引擎靠形状或探测判定。
//
// 返回结构向后兼容：{ ok, filename, count, keys:[{ key, type, label, … }] }，
// 新增可选字段 providerId / baseUrl / modelId / label。**本模块保持纯函数（不写注册表）** ——
// 自定义引擎的落库由调用方（设置面板）完成，便于单测。

import { PROVIDERS, detectProviderId, getProvider } from './aiProviders.js';

const SK_IMPORT_LABEL = 'DeepSeek（可能为其它 sk- 引擎，请用检测确认）';

/**
 * 由 PROVIDERS 的 keyShape.pattern 派生文本提取规则。
 * - 按 pattern 源码去重（sk- 家族共用同一 pattern → 只产出一条）
 * - pattern 以 sk- 开头者一律映射回旧语义 type='deepseek' 并加歧义提示
 */
function buildKeyPatterns() {
    const out = [];
    const seen = new Set();
    for (const p of PROVIDERS) {
        const src = p && p.keyShape && p.keyShape.pattern;
        if (!src || seen.has(src)) continue;
        seen.add(src);
        const isSkFamily = /^sk-/.test(src);
        out.push({
            type: isSkFamily ? 'deepseek' : p.id,
            label: isSkFamily ? SK_IMPORT_LABEL : p.label,
            regex: new RegExp(src, 'g')
        });
    }
    return out;
}

// ========== 引擎提取规则（未来新增引擎只需改 aiProviders.js） ==========
export const KEY_PATTERNS = buildKeyPatterns();

// ========== 从文本中提取所有 Key（去重） ==========
export function extractKeysFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const found = [];
    const seen = new Set();
    for (const p of KEY_PATTERNS) {
        const re = new RegExp(p.regex.source, 'g');
        let m;
        while ((m = re.exec(text)) !== null) {
            const key = m[0].trim();
            if (seen.has(key)) continue;
            seen.add(key);
            // v3.0.4：形状可唯一判定时以真实引擎为准（如 sk-or-v1- → openrouter），
            // 避免把 OpenRouter Key 误标为 DeepSeek。仅当形状歧义（多个 sk- 引擎共用）
            // 时才回退到 pattern 携带的旧语义 type/label。
            const detected = detectProviderId(key);
            if (detected) {
                const prov = getProvider(detected);
                found.push({ key, type: detected, label: prov ? prov.label : p.label });
            } else {
                found.push({ key, type: p.type, label: p.label });
            }
        }
    }
    return found;
}

// ========== 结构化导入：字段名归一化 ==========
// 中英文表头都收，减少「因为写了个中文表头就整份失败」的挫败感。
const FIELD_ALIASES = {
    key: ['key', 'apikey', 'api_key', 'api-key', '密钥', 'key值', 'token'],
    baseurl: ['baseurl', 'base_url', 'base-url', 'url', 'endpoint', '接口地址', '接口', '地址'],
    modelid: ['modelid', 'model_id', 'model', '模型', '模型id', '模型名'],
    providerid: ['providerid', 'provider_id', 'provider', 'engine', '引擎', '厂商'],
    label: ['label', 'name', '备注', '名称', '说明']
};

/** 把任意表头/键名归一化为标准字段名；不认识返回 '' */
function normalizeFieldName(raw) {
    const t = String(raw == null ? '' : raw).trim().toLowerCase().replace(/^["'\s]+|["'\s]+$/g, '');
    if (!t) return '';
    for (const [canon, aliases] of Object.entries(FIELD_ALIASES)) {
        if (aliases.includes(t)) return canon;
    }
    return '';
}

const URL_RE = /^https?:\/\/\S+$/i;

function isUrl(v) { return URL_RE.test(String(v || '').trim()); }

/**
 * 「这一格真的像 API Key 吗」——**分隔符解析专用**的护栏。
 *
 * 为什么必须有：CSV 解析会把「任意一行里的逗号」当成列分隔符，于是**普通中文散文**
 * 也会被切成若干字段。例如一行「今天天气不错，没有什么密钥。」会被解析成
 * key='今天天气不错' + modelId='没有什么密钥。'，凭空造出一条假 Key 条目。
 * （这是本轮由测试抓到的真实缺陷，不是假想。）
 *
 * 判据：可打印 ASCII、无空白、长度 ≥ 8 —— 足以排除中文散文、句子、URL 之外的普通词，
 * 又不会误杀真实 Key（含 `bce-v3/ALTAK-…` 这类带斜杠的形状）。
 */
const KEY_TOKEN_RE = /^[\x21-\x7E]{8,}$/;
function looksLikeKeyToken(v) {
    const t = String(v || '').trim();
    return !!t && KEY_TOKEN_RE.test(t);
}

/** 规整一条结构化记录；无 key 或无（baseUrl/providerId）时返回 null */
function normalizeStructuredItem(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    const key = String(raw.key == null ? '' : raw.key).trim();
    if (!key) return null;
    const baseUrl = String(raw.baseurl == null ? '' : raw.baseurl).trim().replace(/\/+$/, '');
    let providerId = String(raw.providerid == null ? '' : raw.providerid).trim();
    const modelId = String(raw.modelid == null ? '' : raw.modelid).trim();
    const label = String(raw.label == null ? '' : raw.label).trim();

    // baseUrl 只接受 http(s)：拒绝 javascript:/data: 之类被当成接口地址
    const safeBaseUrl = isUrl(baseUrl) ? baseUrl : '';

    // providerId 必须指向已登记的引擎，否则忽略（用户可能把引擎名写错）
    if (providerId && !getProvider(providerId)) providerId = '';

    // v1.5.1：给了 baseUrl 但没给 providerId 时，**先看它是不是某个内置引擎的地址**。
    //   否则「key,https://developer.amd.com.cn/radeon/api/v1,Qwen3.8-27B」这种行
    //   会被当成未知厂商、白白建出一个与内置 radeon 重复的自定义引擎。
    if (!providerId && safeBaseUrl) {
        const norm = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
        const hit = PROVIDERS.find((p) => norm(p.baseUrl) === norm(safeBaseUrl));
        if (hit) providerId = hit.id;
    }

    if (!safeBaseUrl && !providerId) {
        // 只有 Key：退回形状判定，等价于旧行为
        const detected = detectProviderId(key);
        const prov = detected ? getProvider(detected) : null;
        const item = {
            key,
            type: detected || 'unknown',
            label: label || (prov ? prov.label : '未知引擎（导入时未提供 baseUrl，请手动指定）')
        };
        if (modelId) item.modelId = modelId;
        item.source = source;
        return item;
    }

    const item = { key, source };
    if (providerId) {
        item.providerId = providerId;
        item.type = providerId;
        item.label = label || (getProvider(providerId) || {}).label || providerId;
    } else {
        // 未知厂商：type 留 'unknown'，由调用方按 baseUrl 建/找自定义引擎后回填 providerId
        let host = safeBaseUrl;
        try { host = new URL(safeBaseUrl).host; } catch { /* 保留原串 */ }
        item.baseUrl = safeBaseUrl;
        item.type = 'unknown';
        item.label = label || host;
    }
    if (modelId) item.modelId = modelId;
    return item;
}

/** 尝试按 JSON 解析 */
function tryParseJson(text) {
    const t = String(text || '').trim();
    if (!t || (t[0] !== '[' && t[0] !== '{')) return null;
    let data;
    try { data = JSON.parse(t); } catch { return null; }
    const arr = Array.isArray(data) ? data
        : (data && Array.isArray(data.keys)) ? data.keys
            : (data && Array.isArray(data.providers)) ? data.providers
                : null;
    if (!arr) return null;

    const out = [];
    for (const raw of arr) {
        if (!raw || typeof raw !== 'object') continue;
        // 字段别名归一化（只认第一层）
        const mapped = {};
        for (const [k, v] of Object.entries(raw)) {
            const canon = normalizeFieldName(k);
            if (canon && mapped[canon] == null) mapped[canon] = v;
        }
        const item = normalizeStructuredItem(mapped, 'json');
        if (item) out.push(item);
    }
    return out;
}

/** 按分隔符切行（容忍 CRLF / 空行 / 行首注释 #） */
function splitLines(text) {
    return String(text || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
}

/** 按分隔符切字段（逗号 / 制表符 / 中文逗号），并去掉包裹引号 */
function splitFields(line) {
    return line.split(/[,\t，]/).map((f) => f.trim().replace(/^["']|["']$/g, ''));
}

/** 尝试按 CSV/TSV 解析（先表头映射，再位置回退） */
function tryParseDelimited(text) {
    const lines = splitLines(text);
    if (lines.length === 0) return null;

    const firstFields = splitFields(lines[0]);
    const headerMap = firstFields.map(normalizeFieldName);
    const headerHits = headerMap.filter(Boolean).length;
    // 表头判定：至少命中 2 个已知字段名，且该行本身不含 URL（否则可能是数据行）
    const hasHeader = headerHits >= 2 && !firstFields.some(isUrl);

    const out = [];
    const dataLines = hasHeader ? lines.slice(1) : lines;

    for (const line of dataLines) {
        const fields = splitFields(line);
        if (fields.length < 2) continue; // 单字段行交给正则回退处理
        const mapped = {};

        if (hasHeader) {
            fields.forEach((v, i) => {
                const canon = headerMap[i];
                if (canon && v && mapped[canon] == null) mapped[canon] = v;
            });
        } else {
            // 位置回退：前两个字段里哪个是 URL 就认哪个是 baseUrl
            const urlIdx = fields.findIndex(isUrl);
            if (urlIdx === 0) {
                mapped.baseurl = fields[0];
                mapped.key = fields[1];
            } else if (urlIdx > 0) {
                mapped.key = fields[0];
                mapped.baseurl = fields[urlIdx];
            } else {
                // 没有 URL：按 providerId,key,modelId 解释（引擎名必须是已登记的 id）
                if (getProvider(fields[0])) {
                    mapped.providerid = fields[0];
                    mapped.key = fields[1];
                } else {
                    mapped.key = fields[0];
                }
            }
            // 剩余字段里挑一个当 modelId（排除已用作 key/baseUrl/providerId 的值）
            const used = new Set([mapped.key, mapped.baseurl, mapped.providerid].filter(Boolean));
            const rest = fields.filter((f) => f && !used.has(f));
            if (rest.length > 0) mapped.modelid = rest[0];
            if (rest.length > 1) mapped.label = rest[1];
        }

        const item = normalizeStructuredItem(mapped, hasHeader ? 'csv' : 'csv-pos');
        if (!item) continue;
        // 护栏：分隔符解析出的「Key」必须是 ASCII 令牌。中文散文里的一行会被逗号切成
        // 若干字段并凑出一个假 Key，这里把它挡掉 —— 这类行随后会由正则回退处理
        // （散文里真正的 Key 仍能被 keyShape.pattern 捞出来，功能不损失）。
        if (!looksLikeKeyToken(item.key)) continue;
        out.push(item);
    }
    return out.length > 0 ? out : null;
}

/** 按 (key, modelId) 去重；同 key 不同模型保留为不同条目 */
function dedupeItems(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
        const sig = it.key + '\u0000' + (it.modelId || '');
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(it);
    }
    return out;
}

/**
 * 解析文本 → 结构化条目列表（纯函数，便于单测）。
 * @param {string} text
 * @returns {{ items: Array, format: 'json'|'csv'|'csv-pos'|'pattern' }}
 */
export function parseKeysFromText(text) {
    const json = tryParseJson(text);
    if (json && json.length > 0) return { items: dedupeItems(json), format: 'json' };

    const csv = tryParseDelimited(text);
    if (csv && csv.length > 0) {
        const hasPos = csv.some((i) => i.source === 'csv-pos');
        return { items: dedupeItems(csv), format: hasPos ? 'csv-pos' : 'csv' };
    }

    return { items: dedupeItems(extractKeysFromText(text)), format: 'pattern' };
}

// ========== 读取文件为文本（docx 需解压 document.xml） ==========
async function readFileAsText(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.docx')) {
        // docx = zip，取 word/document.xml，剥 XML 标签
        const buf = await file.arrayBuffer();
        const zip = await import('fflate');
        const files = zip.unzipSync(new Uint8Array(buf));
        const xmlKey = Object.keys(files).find(k => k.endsWith('word/document.xml'));
        if (!xmlKey) return '';
        const xml = new TextDecoder().decode(files[xmlKey]);
        // 提取 <w:t> 文本节点内容，按段落拼接
        const texts = [];
        const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
        let m;
        while ((m = re.exec(xml)) !== null) {
            texts.push(m[1]);
        }
        return texts.join('\n');
    }
    // txt / md / csv 直接读
    return await file.text();
}

// ========== 主入口：解析文件 → 返回匹配 Key 列表 ==========
/**
 * @param {File} file
 * @returns {Promise<{ok:boolean, filename?:string, count?:number, keys?:Array,
 *   format?:string, needsProvider?:number, error?:string}>}
 *   needsProvider：其中有多少条是「未知厂商」（带 baseUrl、需要先建自定义引擎）
 */
export async function importKeysFromFile(file) {
    if (!file) return { ok: false, error: '未选择文件' };
    const text = await readFileAsText(file);
    const { items, format } = parseKeysFromText(text);
    const needsProvider = items.filter((i) => !i.providerId && i.baseUrl).length;
    return {
        ok: true,
        filename: file.name,
        count: items.length,
        keys: items,
        format,
        needsProvider
    };
}
