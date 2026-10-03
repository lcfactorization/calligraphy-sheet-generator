// 静态标记 → DOM 节点（v1.3.0 安全加固）
//
// 为什么需要本模块：
//   项目里有大量「编译期常量」标记（图标 SVG、弹窗骨架、模板常量）。它们不含任何
//   用户数据，但用 `el.innerHTML = CONST` 写入仍然会让静态扫描无法区分
//   「常量」与「用户数据」——于是要么放过所有 innerHTML，要么到处写例外。
//
//   本模块用 DOMParser 解析静态字符串，**完全不经过 innerHTML**，从而把
//   「src/ 全目录零 innerHTML」变成一条可以被测试机械验证的铁律
//   （见 tests/security/unsafe-innerhtml-scan.test.js）。
//
// 使用前提：入参必须是**编译期常量**（字面量或常量标识符），
//   严禁传入来自用户输入 / 文件导入 / AI 返回 / 网络 / localStorage 的字符串。
//   这类数据一律走 textContent / setAttribute / createElement。

const HTML_PARSER = new DOMParser();
const SVG_PARSER = new DOMParser();

/**
 * 把静态 HTML 字符串解析为 DocumentFragment。
 * 解析在独立的 inert document 中进行，脚本不会执行。
 * @param {string} markup 静态 HTML 标记
 * @returns {DocumentFragment}
 */
export function staticNodes(markup) {
    const doc = HTML_PARSER.parseFromString(String(markup ?? ''), 'text/html');
    const frag = document.createDocumentFragment();
    const body = doc.body;
    if (!body) return frag;
    // 先快照子节点再导入：importNode 是**拷贝**（不会从源文档摘除节点），
    // 直接 `while (body.firstChild) frag.appendChild(importNode(body.firstChild))`
    // 会因为 firstChild 永远非空而死循环。
    for (const node of Array.from(body.childNodes)) {
        frag.appendChild(document.importNode(node, true));
    }
    return frag;
}

/**
 * 把静态 SVG 字符串解析为 SVG 元素。
 * 用 image/svg+xml 模式解析，脚本不执行；解析失败时返回 null，由调用方决定降级。
 * @param {string} markup 静态 SVG 标记（必须只有一个根元素）
 * @returns {Element|null}
 */
export function svgNode(markup) {
    const doc = SVG_PARSER.parseFromString(String(markup ?? ''), 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName === 'parsererror') return null;
    return document.importNode(root, true);
}

/**
 * 用静态标记替换元素内容（替代 el.innerHTML = CONST）。
 * @param {Element} el 目标元素
 * @param {string} markup 静态 HTML 标记
 * @returns {Element}
 */
export function setStaticMarkup(el, markup) {
    if (el) el.replaceChildren(staticNodes(markup));
    return el;
}
