/**
 * ════════════════════════════════════════════════════════════════
 * 字帖生成器 — 客户端双轨 PDF 导出（Agent-B · v2.4.0）
 * ════════════════════════════════════════════════════════════════
 *
 * 双轨策略：
 *   - client-jspdf  : jsPDF + svg2pdf.js 纯矢量导出（DOM SVG → 1:1 mm 坐标）
 *   - client-print  : 浏览器原生 window.print（包装 .a4-page 让 print.css 生效）
 *
 * 拒绝 html2canvas 位图化，保证 PDF 文字矢量、可缩放、可选择。
 * 物理单位遵循 src/contracts/interfaces.js 的 A4_PORTRAIT 契约。
 */

import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { A4_SHEET_LAYOUT, SHEET_LAYOUT } from '../contracts/interfaces.js';
import { waitForStrokes } from '../modules/strokes.js';

/** 每页行数（11 行/页，依据 SHEET_LAYOUT.rowsPerPage） */
const ROWS_PER_PAGE = SHEET_LAYOUT.rowsPerPage;  // 11
/** 单行物理高度（v2.4.3：字格 18mm + 辅助行 6mm = 24mm，去掉间距让四线格均匀分布） */
const ROW_HEIGHT_MM = SHEET_LAYOUT.cellSizeMM + SHEET_LAYOUT.auxRowMM + SHEET_LAYOUT.rowGapMM;  // 24
/** 顶部边距 */
const PADDING_TOP = A4_SHEET_LAYOUT.paddingTopMM;     // 8
const PADDING_X = A4_SHEET_LAYOUT.paddingMM;            // 6
/** 页眉 Y 坐标（顶部边距 8 + 页眉区 4） */
const HEADER_Y_MM = PADDING_TOP + 4;
/** 首行 Y 坐标（页眉下留 4mm 起始间距） */
const FIRST_ROW_Y_MM = HEADER_Y_MM + 4;
/** 页脚 Y 坐标（底部边距 8 之上） */
const FOOTER_Y_MM = A4_SHEET_LAYOUT.heightMM - A4_SHEET_LAYOUT.paddingBottomMM - 3;
/** 左右起始 X */
const START_X_MM = PADDING_X;
/** 内容水平居中 X（A4 宽 210 / 2） */
const CENTER_X_MM = A4_SHEET_LAYOUT.widthMM / 2;
/** 右对齐 X */
const RIGHT_X_MM = A4_SHEET_LAYOUT.widthMM - PADDING_X;

/**
 * 显示全屏加载遮罩，返回移除函数
 */
function showLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pdf-export-loading';
    overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(0,0,0,0.45);' +
        'font-family:system-ui,sans-serif;color:#fff;font-size:16px;';
    overlay.innerHTML =
        '<div style="padding:28px 48px;background:linear-gradient(135deg,#f59e0b,#d97706);' +
        'border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.3);text-align:center">' +
        '<div style="font-size:30px;margin-bottom:8px">⏳</div>' +
        '<div>正在生成矢量 PDF，请稍候…</div></div>';
    document.body.appendChild(overlay);
    return () => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
}

/**
 * 显示非阻塞 toast 提示（复用全局 .puppeteer-toast 样式，已含打印时隐藏规则）
 * v2.7.x：替代 alert 阻塞，避免打印对话框延迟出现
 * @param {string} msg - 提示文本
 * @param {number} duration - 持续时间（毫秒），默认 1500
 */
function showToast(msg, duration = 1500) {
    const existing = document.querySelector('.puppeteer-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'puppeteer-toast info';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => { if (t.parentNode) t.remove(); }, 300);
    }, duration);
}

/**
 * 等待关键字体就绪（拼音 + 当前汉字字体）
 */
async function waitForFonts() {
    try {
        await document.fonts.ready;
        const fontSelect = document.getElementById('font-select');
        const cnFamily = fontSelect ? fontSelect.value : 'TW-Kai';
        const pinyinOk = document.fonts.check('16px TeXGyreAdventor');
        const cnOk = document.fonts.check(`16px ${cnFamily}`);
        if (!pinyinOk || !cnOk) {
            await new Promise(r => setTimeout(r, 1500));
            await document.fonts.ready;
        }
    } catch (e) {
        console.warn('[pdfExport] 字体等待异常:', e);
    }
}

/**
 * 截断文本，防止页眉页脚溢出
 */
function truncate(text, max) {
    const arr = Array.from(text || '');
    return arr.length > max ? arr.slice(0, max).join('') + '…' : (text || '');
}

/**
 * 客户端矢量 PDF 导出（jsPDF + svg2pdf.js）
 * 直接读取 DOM 中的 SVG 节点，按 1:1 毫米矢量坐标生成 PDF
 * @param {Object} opts - { headerLeft, headerCenter, headerRight, footerText, format, landscape }
 */
export async function exportVectorPDF(opts = {}) {
    const removeOverlay = showLoadingOverlay();
    try {
        await waitForFonts();

        const gridContainer = document.getElementById('grid-container');
        if (!gridContainer) {
            throw new Error('未找到 #grid-container，请先生成字帖');
        }

        // v2.4.1：每行由「辅助行 + 字格行」配对构成，需一并写入
        const auxRows = gridContainer.querySelectorAll('.grid-svg-aux-row');
        const svgRows = gridContainer.querySelectorAll('.grid-svg-row');
        if (svgRows.length === 0) {
            throw new Error('未检测到字格行（.grid-svg-row），请先生成字帖');
        }

        // 读取页眉页脚（回退到 DOM 输入框或默认值）
        const fontSelect = document.getElementById('font-select');
        const fontDisplayName = fontSelect
            ? fontSelect.options[fontSelect.selectedIndex].text
            : '';
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const defaultHeaderLeft =
            `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 ` +
            `${pad(now.getHours())}:${pad(now.getMinutes())}`;

        const headerLeft = truncate(
            opts.headerLeft ?? (document.getElementById('headerLeft')?.value || defaultHeaderLeft),
            22
        );
        const headerCenter = truncate(
            opts.headerCenter ?? (document.getElementById('headerCenter')?.value || '练习字帖'),
            16
        );
        // v2.5.2：页眉右侧 — 用户自定义优先，否则用字体名+练习
        const _hrInput = opts.headerRight ?? document.getElementById('headerRight')?.value ?? '';
        let headerRight;
        if (_hrInput && _hrInput !== '字体练习') {
            headerRight = _hrInput;
        } else {
            let fn = (fontDisplayName || '').replace(/^★\s*/, '').replace(/\.(ttf|otf|woff|woff2)$/i, '');
            const cn = (fn.match(/[\u4e00-\u9fff]/g) || []);
            if (cn.length > 6 && fn.includes('体')) fn = fn.replace(/体/, '');
            const cn2 = (fn.match(/[\u4e00-\u9fff]/g) || []);
            if (cn2.length > 6) { let c=0,r=''; for (const ch of fn) { if (/[\u4e00-\u9fff]/.test(ch)) c++; if (c>6) break; r+=ch; } fn=r; }
            headerRight = fn ? fn + '练习' : '';
        }
        headerRight = truncate(headerRight, 22);
        const footerText = truncate(
            opts.footerText ?? (document.getElementById('footerText')?.value || '评分：☆☆☆☆☆　______年___月___日'),
            32
        );

        const format = opts.format || 'a4';
        const orientation = opts.landscape ? 'landscape' : 'portrait';

        const pdf = new jsPDF({ orientation, unit: 'mm', format });

        const totalPages = Math.ceil(svgRows.length / ROWS_PER_PAGE);

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
            if (pageIdx > 0) pdf.addPage();

            // v2.4.4：先绘制 SVG 内容，再绘制页眉页脚（确保页眉页脚不被 SVG 覆盖）

            // 字格行 + 辅助行（SVG 矢量写入）
            const startRow = pageIdx * ROWS_PER_PAGE;
            const endRow = Math.min(startRow + ROWS_PER_PAGE, svgRows.length);
            for (let r = startRow; r < endRow; r++) {
                // 辅助行先写入（位于字格行上方）
                const auxEl = auxRows[r];
                const auxY = FIRST_ROW_Y_MM + (r - startRow) * ROW_HEIGHT_MM;
                if (auxEl) {
                    try {
                        await svg2pdf(auxEl, pdf, { x: START_X_MM, y: auxY });
                    } catch (err) {
                        console.warn(`[pdfExport] 第 ${r + 1} 行辅助行 SVG 写入失败:`, err);
                    }
                }
                // 字格行写入（辅助行下方 6mm + 1mm 间距）
                const svgEl = svgRows[r];
                const y = auxY + SHEET_LAYOUT.auxRowMM + SHEET_LAYOUT.rowGapMM;
                try {
                    await svg2pdf(svgEl, pdf, { x: START_X_MM, y });
                } catch (err) {
                    console.warn(`[pdfExport] 第 ${r + 1} 行字格行 SVG 写入失败:`, err);
                }
            }

            // v2.4.4：页眉区域白色背景矩形（覆盖可能的 SVG 溢出）
            pdf.setFillColor(255, 255, 255);
            pdf.rect(0, 0, A4_SHEET_LAYOUT.widthMM, PADDING_TOP + 2, 'F');
            // 页脚区域白色背景矩形
            pdf.rect(0, FOOTER_Y_MM - 4, A4_SHEET_LAYOUT.widthMM, A4_SHEET_LAYOUT.paddingBottomMM + 4, 'F');

            // 页眉（左/中/右）— 重置字体设置后绘制
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(46, 125, 50);  // 绿色 #2E7D32
            pdf.text(headerLeft, START_X_MM, HEADER_Y_MM, { align: 'left' });
            pdf.text(headerCenter, CENTER_X_MM, HEADER_Y_MM, { align: 'center' });
            pdf.text(
                `${headerRight} · 第 ${pageIdx + 1} 页共 ${totalPages} 页`,
                RIGHT_X_MM,
                HEADER_Y_MM,
                { align: 'right' }
            );

            // 页脚 — 重置字体设置后绘制
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(46, 125, 50);  // 绿色 #2E7D32
            pdf.text(footerText, CENTER_X_MM, FOOTER_Y_MM, { align: 'center' });
            // 页脚右下角页码
            pdf.setFontSize(8);
            pdf.text(`第 ${pageIdx + 1} / ${totalPages} 页`, RIGHT_X_MM, FOOTER_Y_MM, { align: 'right' });
        }

        const ts =
            `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
            `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const filename = `字帖_${ts}.pdf`;
        pdf.save(filename);
        return filename;
    } catch (error) {
        console.error('[pdfExport] 矢量 PDF 生成错误:', error);
        alert('生成矢量 PDF 时出错: ' + error.message);
        throw error;
    } finally {
        removeOverlay();
    }
}

/**
 * 浏览器直接打印（保留兼容，调用 window.print）
 * 先把 #grid-container 内容包装进 .a4-page 容器再打印
 * v2.4.4：添加打印专用页眉页脚元素（position:fixed 每页重复）
 * 依赖 src/styles/print.css 的 @page + .a4-page 规则
 */
export function printDirect() {
    const grid = document.getElementById('grid-container');
    if (!grid) {
        alert('未找到 #grid-container，请先生成字帖');
        return;
    }
    const inputText = document.getElementById('inputText');
    if (inputText && !inputText.value.trim()) {
        alert('请先输入汉字并生成字帖');
        return;
    }

    // 读取页眉页脚内容
    const fontSelect = document.getElementById('font-select');
    const fontDisplayName = fontSelect
        ? fontSelect.options[fontSelect.selectedIndex].text
        : '';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hLeft = document.getElementById('headerLeft')?.value ||
        `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const hCenter = document.getElementById('headerCenter')?.value || '练习字帖';
    // v2.5.2：页眉右侧 — 用户自定义优先，否则用字体名+练习
    const _hrInput2 = document.getElementById('headerRight')?.value || '';
    let hRight;
    if (_hrInput2 && _hrInput2 !== '字体练习') {
        hRight = _hrInput2;
    } else {
        let fn2 = (fontDisplayName || '').replace(/^★\s*/, '').replace(/\.(ttf|otf|woff|woff2)$/i, '');
        const cn3 = (fn2.match(/[\u4e00-\u9fff]/g) || []);
        if (cn3.length > 6 && fn2.includes('体')) fn2 = fn2.replace(/体/, '');
        const cn4 = (fn2.match(/[\u4e00-\u9fff]/g) || []);
        if (cn4.length > 6) { let c=0,r=''; for (const ch of fn2) { if (/[\u4e00-\u9fff]/.test(ch)) c++; if (c>6) break; r+=ch; } fn2=r; }
        hRight = fn2 ? fn2 + '练习' : '';
    }
    const fText = document.getElementById('footerText')?.value || '评分：☆☆☆☆☆　______年___月___日';

    // v2.4.12：将字格按 page-break 拆分为独立分页段，每段正常文档流布局
    // DOM 顺序：header → content(字格) → footer
    // 原因：Chrome window.print() 中 position:absolute/fixed 的负值定位有 bug
    //       （负 top 元素被推到页脚、负 bottom 元素下半部被裁剪）
    //       改用正常文档流 + flex column + margin-top:auto 实现稳定定位
    const gridChildren = Array.from(grid.children);
    const pages = [];
    let currentPage = [];
    for (const child of gridChildren) {
        currentPage.push(child);
        if (child.classList.contains('page-break')) {
            pages.push(currentPage);
            currentPage = [];
        }
    }
    if (currentPage.length > 0) pages.push(currentPage);
    const totalPages = pages.length;

    // 创建分页段容器
    const wrapper = document.createElement('div');
    wrapper.className = 'a4-page pdf-print-wrapper';
    wrapper.style.cssText = 'position:relative;width:100%;';

    pages.forEach((pageChildren, idx) => {
        const section = document.createElement('div');
        section.className = 'print-page-section';
        // v2.4.15：用 JS 类名标记首页和末页，比 :first-child/:last-child 更可靠
        if (idx === 0) section.classList.add('first-page-section');
        if (idx === totalPages - 1) section.classList.add('last-page-section');

        // 1. 页眉（DOM 第一个，正常流在 section 顶部 = padding-top 处）
        const header = document.createElement('div');
        header.className = 'page-section-header';
        header.innerHTML =
            `<span class="ph-left">${truncate(hLeft, 22)}</span>` +
            `<span class="ph-center">${truncate(hCenter, 16)}</span>` +
            `<span class="ph-right">${truncate(hRight, 22)}</span>`;
        section.appendChild(header);

        // 2. 内容区（字格，正常流，在页眉和页脚之间）
        const content = document.createElement('div');
        content.className = 'page-section-content';
        for (const c of pageChildren) {
            // v2.4.17：移除每页最后一行的 .page-break 类和 data-page-break 属性
            // 根因：.grid-svg-row.page-break 的 page-break-after:always 在 section 内部
            // 触发分页，把页脚 .page-section-footer 顶到下一页，导致页脚丢失/空白页
            // 每页的分页由 section 边界自然完成（min-height:295mm 占满页面），
            // 内容内部不需要 page-break
            if (c.classList && c.classList.contains('page-break')) {
                c.classList.remove('page-break');
                c.removeAttribute('data-page-break');
            }
            content.appendChild(c);
        }
        section.appendChild(content);

        // 3. 页脚（DOM 最后，margin-top:auto 推到 section 底部）
        const footer = document.createElement('div');
        footer.className = 'page-section-footer';
        footer.innerHTML =
            `<span class="pf-center">${truncate(fText, 32)}</span>` +
            `<span class="pf-page">第 ${idx + 1} 页 / 共 ${totalPages} 页</span>`;
        section.appendChild(footer);

        wrapper.appendChild(section);
    });

    grid.parentNode.insertBefore(wrapper, grid);

    // v2.4.12：动态注入 @page margin:0 覆盖 print.css 的 29mm 边距
    // 原因：window.print() 路径用 .print-page-section 的 padding 控制边距（17.5mm 顶部给页眉）
    //       print.css 的 @page margin:29mm 是给 Puppeteer headerTemplate 用的，window.print() 不需要
    //       此样式在 cleanup 中移除，不影响 Puppeteer 路径
    const pageMarginStyle = document.createElement('style');
    pageMarginStyle.id = 'print-direct-page-margin';
    pageMarginStyle.textContent = '@media print { @page { size: A4 portrait; margin: 0 !important; } }';
    document.head.appendChild(pageMarginStyle);

    const cleanup = () => {
        // 移除动态注入的 @page margin:0 样式
        if (pageMarginStyle.parentNode) pageMarginStyle.parentNode.removeChild(pageMarginStyle);
        // 恢复：将子元素移回 grid
        pages.flat().forEach(c => grid.appendChild(c));
        if (wrapper.parentNode) {
            wrapper.parentNode.insertBefore(grid, wrapper);
            wrapper.remove();
        }
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    // v2.8.1：移动端检测（HarmonyOS / Android / iOS / 手机浏览器）
    // 移动端 window.print() 对 @media print 支持有限，需特殊引导
    const ua = navigator.userAgent || '';
    const isMobileUA = /Mobile|Android|iPhone|iPad|iPod|HarmonyOS|HuaweiBrowser|Mobile Safari/i.test(ua)
        && !/Windows NT|Macintosh|CrOS|X11/i.test(ua);
    const isHarmonyOS = /HarmonyOS|HuaweiBrowser/i.test(ua);

    try {
        // v2.4.5：显示加载遮罩，等待字体+笔画就绪后再打印
        const printOverlay = showLoadingOverlay();

        // v2.8.1：移动端优先提示，引导用户使用浏览器原生"网页转 PDF"
        if (isMobileUA) {
            const hint = isHarmonyOS
                ? '📱 MatePad/华为手机用户：建议点击浏览器底部 ∷ 菜单 → 保存 PDF（或 更多 → WPS 网页转 PDF），效果更佳。即将打开打印对话框…'
                : '📱 移动端建议使用浏览器菜单 → 网页转 PDF / 保存为 PDF。即将打开打印对话框…';
            showToast(hint, 6000);
        }

        waitForFonts().then(async () => {
            // v2.7.x 优化：等待笔画队列加载完成（最多等2秒，原10秒过长）
            await waitForStrokes(2000);
            // 给浏览器一点时间渲染最终 DOM
            await new Promise(r => setTimeout(r, 300));
            printOverlay();
            // v2.7.x 优化：alert 改非阻塞 toast，立即调用 window.print()
            // 提示用户取消浏览器默认页眉页脚（CSS 无法禁止 Chrome 的页眉页脚选项）
            showToast('正在准备打印…请在对话框中取消勾选「页眉和页脚」', 1500);

            // v2.8.1：用 requestAnimationFrame 同步触发 window.print()
            // 原因：移动端浏览器（HarmonyOS / iOS Safari）严格要求 window.print()
            // 在用户手势上下文内调用，async/await 链会脱离手势上下文导致调用被吞
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    try {
                        window.print();
                    } catch (e) {
                        console.error('[pdfExport] window.print 抛错:', e);
                        showToast('打印失败：' + (e && e.message ? e.message : '未知错误') + '，建议使用浏览器菜单的「网页转 PDF」', 5000);
                    }
                    // 兜底清理（部分浏览器 afterprint 不触发）
                    setTimeout(cleanup, 1000);
                });
            });
        });
    } catch (error) {
        console.error('[pdfExport] 打印错误:', error);
        showToast('打印时出错: ' + error.message, 4000);
        cleanup();
    }
}

/**
 * 统一入口：根据 opts.track 选择轨道
 * track='client-print'   → printDirect()
 * track='client-jspdf'   → exportVectorPDF()
 * @param {Object} opts - 见 PdfExportOptions（contracts/interfaces.js）
 */
export async function exportPDF(opts = {}) {
    const track = opts.track || 'client-jspdf';
    if (track === 'client-print') return printDirect();
    return exportVectorPDF(opts);
}

export default exportPDF;
