// v1.1.0 模块：API Key 文件导入（txt/md/csv/docx → 正则匹配）
// v3.0.4：KEY_PATTERNS 改为由 aiProviders.PROVIDERS 的 keyShape 派生（契约 §3.6）
//  - 保留导出名与返回结构 { ok, filename, count, keys:[{key,type,label}] }
//  - 形状可唯一判定时用 detectProviderId 的真实引擎（sk-or-v1- → openrouter）；
//    仅形状歧义的 sk- 类 Key 回退旧语义 type='deepseek'，label 提示"可能为其它 sk- 引擎，请用检测确认"
//  - 输出：匹配到的 Key 列表（去重），供设置面板填充

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
export async function importKeysFromFile(file) {
    if (!file) return { ok: false, error: '未选择文件' };
    const text = await readFileAsText(file);
    const keys = extractKeysFromText(text);
    return { ok: true, filename: file.name, count: keys.length, keys };
}
