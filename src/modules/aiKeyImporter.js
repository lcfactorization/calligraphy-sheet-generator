// v1.1.0 模块：API Key 文件导入（txt/md/csv/docx → 正则匹配）
// 支持：DeepSeek（sk-）、火山引擎豆包（ark-），预留小米 MiMo（mimo-）等
// 输出：匹配到的 Key 列表（去重），供设置面板填充

// ========== 引擎前缀表（未来新增引擎在此扩展） ==========
export const KEY_PATTERNS = [
    { type: 'deepseek', label: 'DeepSeek', regex: /sk-[A-Za-z0-9_-]{20,}/g },
    { type: 'volcano', label: '火山引擎豆包', regex: /ark-[A-Za-z0-9_-]{20,}/g },
    // 预留：小米 MiMo / 其他引擎
    // { type: 'mimo', label: '小米 MiMo', regex: /mimo-[A-Za-z0-9_-]{20,}/g },
];

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
            if (!seen.has(key)) {
                seen.add(key);
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
