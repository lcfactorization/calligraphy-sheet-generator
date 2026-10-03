// 数据层校验工具（v1.3.0 安全加固）
//
// 管线铁律：
//   数据层校验 → DOM 一律 textContent / setAttribute → 禁止字符串拼 HTML
//
// 本模块是**数据层闸门**（在数据进入缓存/状态时就校验），而不是只在渲染时兜底。
// 任何来自用户的文本（文件导入、手动输入、localStorage 回读）都必须先经过这里的
// sanitize* 函数，再写入 DOM；渲染阶段一律使用 textContent / .value / safeSetAttr，
// 任何情况下都不要把用户数据拼进 innerHTML。
//
// 约束：纯函数、零 import、无顶层 DOM 访问（仅 safeText / safeSetAttr /
//       appendTextSpan / clearChildren 这几个写入辅助触碰 DOM），
//       以便在 Node 环境下直接 import 做单元测试。

// CJK 统一汉字范围：基本区 + 扩展 A + 兼容区
const CJK_CHAR_RE = /[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/;
const PURE_CJK_RE = /^[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]+$/;
// 拼音允许字符：拉丁字母 + ü + 带调元音 + 空格
const PINYIN_STRIP_RE = /[^a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ ]/g;
// 非法属性名：含空白/引号/尖括号/斜杠/等号
const BAD_ATTR_NAME_RE = /[\s"'<>/=]/;

/**
 * HTML 转义（& < > " ' /）。
 * 仅用于**必须**产出 HTML 字符串的极少数场景；常规渲染请直接用 textContent。
 * @param {*} s
 * @returns {string}
 */
export function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"'/]/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;'
    }[c]));
}

/**
 * 只保留一个汉字（CJK 基本区/扩展A/兼容区）；没有汉字时返回 ''。
 * @param {*} v
 * @returns {string}
 */
export function sanitizeChar(v) {
    const m = String(v ?? '').match(CJK_CHAR_RE);
    return m ? m[0] : '';
}

/**
 * 组词清洗：接受字符串或字符串数组。
 * 按 | , 、 / 及空白拆分；仅保留**纯汉字**且长度为 2-4 的项；去重；最多 4 项。
 * @param {string|string[]} v
 * @returns {string[]}
 */
export function sanitizeZuci(v) {
    const raw = Array.isArray(v) ? v : [v];
    const parts = [];
    for (const item of raw) {
        const s = String(item ?? '');
        if (!s) continue;
        parts.push(...s.split(/[|,、/\s]+/));
    }
    const out = [];
    for (const p of parts) {
        const t = p.trim();
        if (!t) continue;
        const n = Array.from(t).length;
        if (n < 2 || n > 4) continue;
        if (!PURE_CJK_RE.test(t)) continue;
        if (out.includes(t)) continue;
        out.push(t);
        if (out.length >= 4) break;
    }
    return out;
}

/**
 * 拼音清洗：只保留字母/ü/带调元音/空格；折叠连续空格；去首尾空白；截断至 32 字符。
 * @param {*} v
 * @returns {string}
 */
export function sanitizePinyin(v) {
    const s = String(v ?? '').replace(PINYIN_STRIP_RE, '').replace(/\s+/g, ' ').trim();
    return s.slice(0, 32);
}

/**
 * 安全写入文本：等价于 el.textContent = String(text ?? '')。
 * @param {Element} el
 * @param {*} text
 * @returns {Element}
 */
export function safeText(el, text) {
    if (el) el.textContent = String(text ?? '');
    return el;
}

/**
 * 在 parent 下追加一个只含纯文本的 <span>，用于替代「字符串拼 HTML」的写法。
 *
 * 典型场景：页眉/页脚的多个 span 需要按顺序插入。用本函数逐个追加，
 * 文本永远走 textContent，不经过 HTML 解析，因此页眉页脚等用户可控文本无法注入标记。
 *
 * @param {Document} doc 目标文档 —— 主文档或打印 iframe 的 document
 * @param {Element} parent 父元素
 * @param {string} className span 的类名
 * @param {*} text 纯文本内容
 * @returns {Element} 新建的 span
 */
export function appendTextSpan(doc, parent, className, text) {
    const span = doc.createElement('span');
    span.className = className;
    span.textContent = String(text ?? '');
    parent.appendChild(span);
    return span;
}

/**
 * 清空元素的所有子节点（替代 el.innerHTML = ''）。
 * @param {Element} el
 * @returns {Element}
 */
export function clearChildren(el) {
    if (el) while (el.firstChild) el.removeChild(el.firstChild);
    return el;
}

/**
 * 安全设置属性：拒绝含空白/引号/尖括号/斜杠/等号的属性名，拒绝 on* 事件属性。
 * @param {Element} el
 * @param {string} name
 * @param {*} value
 * @returns {Element}
 */
export function safeSetAttr(el, name, value) {
    const n = String(name ?? '');
    if (!el || !n) return el;
    if (BAD_ATTR_NAME_RE.test(n)) return el;
    if (/^on/i.test(n)) return el;
    el.setAttribute(n, String(value ?? ''));
    return el;
}
