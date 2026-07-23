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
import { A4_PORTRAIT } from '../contracts/interfaces.js';

/** 每页行数（A4 纵向可用 273mm，行高约 26mm，保留页眉页脚后取 8 行） */
const ROWS_PER_PAGE = 8;
/** 单行物理高度（字格 18mm + 拼音行 6mm + 行间距 2mm） */
const ROW_HEIGHT_MM = 26;
/** 页眉 Y 坐标（顶部 padding 12 + 页眉区 15） */
const HEADER_Y_MM = A4_PORTRAIT.paddingMM + 15;
/** 首行 Y 坐标（页眉下留 12mm 起始间距） */
const FIRST_ROW_Y_MM = HEADER_Y_MM + 12;
/** 页脚 Y 坐标（底部 padding 12 之上） */
const FOOTER_Y_MM = A4_PORTRAIT.heightMM - A4_PORTRAIT.paddingMM - 5;
/** 左右起始 X（padding 12） */
const START_X_MM = A4_PORTRAIT.paddingMM;
/** 内容水平居中 X（A4 宽 210 / 2） */
const CENTER_X_MM = A4_PORTRAIT.widthMM / 2;
/** 右对齐 X（右边 padding 12） */
const RIGHT_X_MM = A4_PORTRAIT.widthMM - A4_PORTRAIT.paddingMM;

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
        const headerRight = truncate(
            opts.headerRight ??
                (document.getElementById('headerRight')?.value ||
                    (fontDisplayName ? fontDisplayName + '字体' : '')),
            22
        );
        const footerText = truncate(
            opts.footerText ?? (document.getElementById('footerText')?.value || '评分：☆☆☆☆☆'),
            32
        );

        const format = opts.format || 'a4';
        const orientation = opts.landscape ? 'landscape' : 'portrait';

        const pdf = new jsPDF({ orientation, unit: 'mm', format });

        const totalPages = Math.ceil(svgRows.length / ROWS_PER_PAGE);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
            if (pageIdx > 0) pdf.addPage();

            // 页眉（左/中/右）
            pdf.setTextColor(51, 153, 51);
            pdf.text(headerLeft, START_X_MM, HEADER_Y_MM, { align: 'left' });
            pdf.text(headerCenter, CENTER_X_MM, HEADER_Y_MM, { align: 'center' });
            pdf.text(
                `${headerRight} · 第 ${pageIdx + 1} 页共 ${totalPages} 页`,
                RIGHT_X_MM,
                HEADER_Y_MM,
                { align: 'right' }
            );

            // 字格行（SVG 矢量写入）
            const startRow = pageIdx * ROWS_PER_PAGE;
            const endRow = Math.min(startRow + ROWS_PER_PAGE, svgRows.length);
            for (let r = startRow; r < endRow; r++) {
                const svgEl = svgRows[r];
                const y = FIRST_ROW_Y_MM + (r - startRow) * ROW_HEIGHT_MM;
                try {
                    await svg2pdf(svgEl, pdf, { x: START_X_MM, y });
                } catch (err) {
                    console.warn(`[pdfExport] 第 ${r + 1} 行 SVG 写入失败:`, err);
                }
            }

            // 页脚
            pdf.setTextColor(51, 153, 51);
            pdf.text(footerText, CENTER_X_MM, FOOTER_Y_MM, { align: 'center' });
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

    // 包装进 .a4-page 让 print.css 的可见性与分页规则生效
    const wrapper = document.createElement('div');
    wrapper.className = 'a4-page pdf-print-wrapper';
    wrapper.style.cssText = 'position:relative;width:100%;';
    grid.parentNode.insertBefore(wrapper, grid);
    wrapper.appendChild(grid);

    const cleanup = () => {
        if (wrapper.parentNode) {
            wrapper.parentNode.insertBefore(grid, wrapper);
            wrapper.remove();
        }
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    try {
        // 字体就绪后触发打印
        waitForFonts().then(() => {
            window.print();
            // 兜底清理（部分浏览器 afterprint 不触发）
            setTimeout(cleanup, 1000);
        });
    } catch (error) {
        console.error('[pdfExport] 打印错误:', error);
        alert('打印时出错: ' + error.message);
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
