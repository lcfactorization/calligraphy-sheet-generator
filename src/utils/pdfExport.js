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
import { getFontSources } from '../modules/fontManager.js';

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
        console.log('[pdfExport] waitForFonts 字体就绪状态:', {
            cnFamily,
            pinyinReady: pinyinOk,
            cnReady: cnOk,
            fontsReady: true
        });
        if (!pinyinOk || !cnOk) {
            console.log('[pdfExport] 字体未就绪，等待 1500ms 后重试');
            await new Promise(r => setTimeout(r, 1500));
            await document.fonts.ready;
            const pinyinOk2 = document.fonts.check('16px TeXGyreAdventor');
            const cnOk2 = document.fonts.check(`16px ${cnFamily}`);
            console.log('[pdfExport] waitForFonts 重检状态:', {
                pinyinReady: pinyinOk2,
                cnReady: cnOk2
            });
        }
    } catch (e) {
        console.warn('[pdfExport] 字体等待异常:', e);
    }
}

/**
 * UA 平台检测（v2.8.4 跨平台日志增强）
 * 打印 HarmonyOS / iOS Safari / Android Chrome 检测结果，便于排查兼容性问题
 * @returns {{ isHarmonyOS:boolean, isIOSSafari:boolean, isAndroidChrome:boolean, isMobile:boolean, ua:string }}
 */
function detectPlatform() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const isHarmonyOS = /harmonyos/i.test(ua) || /HuaweiBrowser/i.test(ua);
    const isIOSSafari = /ipad|iphone|ipod/i.test(ua);
    const isAndroidChrome = /android/i.test(ua) && /chrome/i.test(ua);
    const isMobile = isHarmonyOS || isIOSSafari || (/mobile|android|iphone|ipad|ipod|harmonyos|huaweibrowser/i.test(ua)
        && !/windows nt|macintosh|cros|x11/i.test(ua));
    console.log('[pdfExport] UA 平台检测结果:', {
        ua,
        isHarmonyOS,
        isIOSSafari,
        isAndroidChrome,
        isMobile
    });
    return { ua, isHarmonyOS, isIOSSafari, isAndroidChrome, isMobile };
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
    const _ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const _fontSel = document.getElementById('font-select');
    const _fontName = _fontSel ? _fontSel.options[_fontSel.selectedIndex].text : '';
    const _inputText = document.getElementById('inputText');
    const _charCount = _inputText ? _inputText.value.length : -1;
    console.log('[pdfExport] exportVectorPDF 入口', {
        opts,
        UA: _ua,
        charCount: _charCount,
        fontName: _fontName
    });
    const platform = detectPlatform();
    const removeOverlay = showLoadingOverlay();
    try {
        await waitForFonts();
        console.log('[pdfExport] waitForFonts 完成');

        const gridContainer = document.getElementById('grid-container');
        if (!gridContainer) {
            throw new Error('未找到 #grid-container，请先生成字帖');
        }

        // v2.4.1：每行由「辅助行 + 字格行」配对构成，需一并写入
        const auxRows = gridContainer.querySelectorAll('.grid-svg-aux-row');
        const svgRows = gridContainer.querySelectorAll('.grid-svg-row');
        console.log('[pdfExport] 找到 grid-container:', {
            auxRowsLength: auxRows.length,
            svgRowsLength: svgRows.length
        });
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
        console.log('[pdfExport] 读取页眉页脚输入:', {
            headerLeft,
            headerCenter,
            headerRight,
            footerText
        });

        const format = opts.format || 'a4';
        const orientation = opts.landscape ? 'landscape' : 'portrait';

        const pdf = new jsPDF({ orientation, unit: 'mm', format });

        const totalPages = Math.ceil(svgRows.length / ROWS_PER_PAGE);
        console.log('[pdfExport] 计算总页数:', {
            totalPages,
            ROWS_PER_PAGE,
            svgRowsLength: svgRows.length
        });

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
            if (pageIdx > 0) pdf.addPage();

            // v2.4.4：先绘制 SVG 内容，再绘制页眉页脚（确保页眉页脚不被 SVG 覆盖）

            // 字格行 + 辅助行（SVG 矢量写入）
            const startRow = pageIdx * ROWS_PER_PAGE;
            const endRow = Math.min(startRow + ROWS_PER_PAGE, svgRows.length);
            console.log('[pdfExport] 页循环开始:', {
                pageIdx,
                startRow,
                endRow
            });
            for (let r = startRow; r < endRow; r++) {
                // 辅助行先写入（位于字格行上方）
                const auxEl = auxRows[r];
                const auxY = FIRST_ROW_Y_MM + (r - startRow) * ROW_HEIGHT_MM;
                console.log('[pdfExport] SVG 写入前:', {
                    rowIndex: r,
                    auxY,
                    hasAux: !!auxEl
                });
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
                console.log('[pdfExport] SVG 字格写入:', {
                    rowIndex: r,
                    y,
                    hasSvgEl: !!svgEl
                });
                try {
                    await svg2pdf(svgEl, pdf, { x: START_X_MM, y });
                    console.log('[pdfExport] SVG 字格写入成功:', { rowIndex: r });
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
            const _headerRightText = `${headerRight} · 第 ${pageIdx + 1} 页共 ${totalPages} 页`;
            pdf.text(_headerRightText, RIGHT_X_MM, HEADER_Y_MM, { align: 'right' });

            // 页脚 — 重置字体设置后绘制
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(46, 125, 50);  // 绿色 #2E7D32
            pdf.text(footerText, CENTER_X_MM, FOOTER_Y_MM, { align: 'center' });
            // 页脚右下角页码
            pdf.setFontSize(8);
            const _footerPageText = `第 ${pageIdx + 1} / ${totalPages} 页`;
            pdf.text(_footerPageText, RIGHT_X_MM, FOOTER_Y_MM, { align: 'right' });
            console.log('[pdfExport] 页眉页脚绘制完成:', {
                pageIdx,
                headerLeft,
                headerCenter,
                headerRightDrawn: _headerRightText,
                footerTextDrawn: footerText,
                footerPageDrawn: _footerPageText
            });
        }

        const ts =
            `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
            `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const filename = `字帖_${ts}.pdf`;
        console.log('[pdfExport] PDF 保存前:', {
            filename,
            totalPages,
            platform: platform.isHarmonyOS ? 'HarmonyOS' : (platform.isIOSSafari ? 'iOS' : (platform.isAndroidChrome ? 'Android' : 'Desktop'))
        });
        pdf.save(filename);
        return filename;
    } catch (error) {
        console.error('[pdfExport] 矢量 PDF 生成错误:', error);
        if (error && error.stack) {
            console.error('[pdfExport] error.stack:', error.stack);
        }
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
 *
 * v2.9.0：printDirect 改为 async，入口加移动端 UA 路由
 *   - 移动端（HarmonyOS/Android/iOS/iPadOS 13+）改走 printViaIframe() 静态独立打印文档
 *   - 桌面维持现有逻辑零改动（已验证正确）
 *   - 异常自动回退到就地打印
 */
export async function printDirect() {
    const _ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const _fontSel = document.getElementById('font-select');
    const _fontName = _fontSel ? _fontSel.options[_fontSel.selectedIndex].text : '';
    const _inputText = document.getElementById('inputText');
    const _charCount = _inputText ? _inputText.value.length : -1;
    console.log('[pdfExport] printDirect 入口', {
        UA: _ua,
        charCount: _charCount,
        fontName: _fontName
    });

    // v2.9.0：移动端 UA 路由（含 iPadOS 13+ 触屏判定）
    // 根因：移动端打印管线异步读取实时 DOM，cleanup 永远先于分页渲染执行，
    //       含页眉页脚的 wrapper 被销毁后管线读到的是屏幕态 DOM（无页眉页脚）
    // 桌面 print() 模态阻塞无此问题，维持现有路径零退化
    const _isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const _mobileUA = _isIPadOS || (
        /Mobile|Android|iPhone|iPad|iPod|HarmonyOS|HuaweiBrowser|Mobile Safari/i.test(_ua)
        && !/Windows NT|Macintosh|CrOS|X11/i.test(_ua)
    );
    if (_mobileUA) {
        try {
            return await printViaIframe();
        } catch (e) {
            console.error('[pdfExport] iframe 打印路径异常，回退到就地打印:', e);
            // 清理可能已创建的 iframe（防泄漏）
            document.querySelectorAll('iframe.print-frame').forEach(f => f.remove());
            // 继续执行下面的现有 printDirect 逻辑作为降级
        }
    }

    const platform = detectPlatform();
    const grid = document.getElementById('grid-container');
    if (!grid) {
        console.error('[pdfExport] 未找到 #grid-container');
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
    console.log('[pdfExport] printDirect 页眉页脚读取完成:', {
        hLeft,
        hCenter,
        hRight,
        fText
    });

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
    const _pagesInfo = pages.map((p, i) => ({
        pageIdx: i,
        childCount: p.length,
        charCount: p.filter(c => c && c.classList && c.classList.contains('grid-svg-row')).length
    }));
    console.log('[pdfExport] 分页段计算完成:', {
        pagesLength: pages.length,
        totalChildren: gridChildren.length,
        pagesInfo: _pagesInfo
    });

    // 创建分页段容器
    const wrapper = document.createElement('div');
    wrapper.className = 'a4-page pdf-print-wrapper';
    wrapper.style.cssText = 'position:relative;width:100%;';

    const removedBreakRows = [];   // RC4：记录被移除 page-break 的行，cleanup 时恢复

    pages.forEach((pageChildren, idx) => {
        const section = document.createElement('div');
        section.className = 'print-page-section';
        const isFirstPage = idx === 0;
        const isLastPage = idx === totalPages - 1;
        if (isFirstPage) section.classList.add('first-page-section');
        if (isLastPage) section.classList.add('last-page-section');

        // 1. 页眉
        const header = document.createElement('div');
        header.className = 'page-section-header';
        header.innerHTML =
            `<span class="ph-left">${truncate(hLeft, 22)}</span>` +
            `<span class="ph-center">${truncate(hCenter, 16)}</span>` +
            `<span class="ph-right">${truncate(hRight, 22)}</span>`;
        section.appendChild(header);

        // 2. 内容区：行对包裹（aux + row 两两一对）
        const content = document.createElement('div');
        content.className = 'page-section-content';
        let pair = null;
        for (const c of pageChildren) {
            if (c.classList && c.classList.contains('page-break')) {
                removedBreakRows.push(c);                 // RC4：先记录
                c.classList.remove('page-break');
                c.removeAttribute('data-page-break');
            }
            if (c.classList && c.classList.contains('grid-svg-aux-row')) {
                pair = document.createElement('div');     // RC5：新行对
                pair.className = 'print-row-pair';
                content.appendChild(pair);
                pair.appendChild(c);
            } else if (pair) {
                pair.appendChild(c);
                pair = null;
            } else {
                content.appendChild(c);                   // 兜底：无配对直接插入
            }
        }
        // 每页第一个辅助行强制页顶线（幂等）
        const firstAux = content.querySelector('.grid-svg-aux-row');
        if (firstAux) firstAux.classList.add('page-top');
        section.appendChild(content);

        // 3. 页脚
        const footer = document.createElement('div');
        footer.className = 'page-section-footer';
        footer.innerHTML =
            `<span class="pf-center">${truncate(fText, 32)}</span>` +
            `<span class="pf-page">第 ${idx + 1} 页 / 共 ${totalPages} 页</span>`;
        section.appendChild(footer);

        wrapper.appendChild(section);
    });

    grid.parentNode.insertBefore(wrapper, grid);

    // RC1 修复 v2（v2.8.9）：精确感知打印状态，删除误触发的 focus/visibilitychange
    // 根因：v2.8.7 的 focus/visibilitychange 在移动端打印预览生命周期中会误触发 cleanup
    // 导致 wrapper 被提前销毁，打印管线读到屏幕态 DOM（无页眉页脚）
    // v2.9.0：删除 pagehide 监听——系统打印预览不触发 pagehide，该监听无收益且在国产 ROM 冻结场景有隐患
    // 改用 matchMedia('print').change 精确感知打印状态 + afterprint + 120s 兜底
    let cleaned = false;
    let printMediaQuery = null;
    let onPrintChange = null;
    let fallbackTimer = null;

    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        console.log('[pdfExport] cleanup 开始');
        removedBreakRows.forEach(r => {                   // RC4：恢复分页标记
            r.classList.add('page-break');
            r.setAttribute('data-page-break', '');
        });
        pages.flat().forEach(c => grid.appendChild(c));
        if (wrapper.parentNode) {
            wrapper.parentNode.insertBefore(grid, wrapper);
            wrapper.remove();
        }
        window.removeEventListener('afterprint', cleanup);
        if (printMediaQuery && onPrintChange) {
            try {
                if (printMediaQuery.removeEventListener) {
                    printMediaQuery.removeEventListener('change', onPrintChange);
                } else if (printMediaQuery.removeListener) {
                    // Safari < 14 兼容
                    printMediaQuery.removeListener(onPrintChange);
                }
            } catch (e) { /* 忽略解绑异常 */ }
        }
        if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
        console.log('[pdfExport] cleanup 完成');
    };

    // afterprint：桌面 Chrome 主要触发器，移动端部分浏览器也支持
    window.addEventListener('afterprint', cleanup);

    // matchMedia('print')：精确感知打印状态变化
    // 打印开始时 matches=true，打印结束时 matches=false（用户关闭预览或完成打印）
    try {
        printMediaQuery = window.matchMedia('print');
        onPrintChange = (ev) => {
            console.log('[pdfExport] matchMedia(print) change:', ev.matches);
            // matches=false 表示打印流程结束
            if (!ev.matches) cleanup();
        };
        if (printMediaQuery.addEventListener) {
            printMediaQuery.addEventListener('change', onPrintChange);
        } else if (printMediaQuery.addListener) {
            // Safari < 14 兼容
            printMediaQuery.addListener(onPrintChange);
        }
    } catch (e) {
        console.warn('[pdfExport] matchMedia(print) 不支持，仅依赖 afterprint', e);
    }

    // v2.9.0：pagehide 监听已删除（系统打印预览不触发 pagehide，无收益且有国产 ROM 冻结隐患）
    // 移动端已改走 iframe 静态打印文档路径，本 cleanup 仅服务桌面/降级路径

    // 120s 超长兜底（仅作内存回收，绝不影响打印管线读取窗口）
    fallbackTimer = setTimeout(cleanup, 120000);

    // v2.8.1：移动端检测（HarmonyOS / Android / iOS / 手机浏览器）
    // 移动端 window.print() 对 @media print 支持有限，需特殊引导
    const ua = navigator.userAgent || '';
    const isMobileUA = /Mobile|Android|iPhone|iPad|iPod|HarmonyOS|HuaweiBrowser|Mobile Safari/i.test(ua)
        && !/Windows NT|Macintosh|CrOS|X11/i.test(ua);
    const isHarmonyOS = /HarmonyOS|HuaweiBrowser/i.test(ua);
    console.log('[pdfExport] 移动端检测: isMobileUA=', isMobileUA, 'isHarmonyOS=', isHarmonyOS);

    try {
        // v2.4.5：显示加载遮罩，等待字体+笔画就绪后再打印
        const printOverlay = showLoadingOverlay();

        // v2.8.5：移动端简化提示（原 6 秒冗长提示改为 1.5 秒简短提示）
        // 原因：用户已主动点击打印按钮，再提示"用浏览器菜单"已无意义
        if (isMobileUA) {
            showToast('正在准备打印…', 1500);
        }

        console.log('[pdfExport] 字体等待开始');
        waitForFonts().then(async () => {
            console.log('[pdfExport] 字体等待完成');
            // v2.7.x 优化：等待笔画队列加载完成（最多等2秒，原10秒过长）
            console.log('[pdfExport] waitForStrokes 开始 (2000ms)');
            await waitForStrokes(2000);
            console.log('[pdfExport] waitForStrokes 完成');
            // 给浏览器一点时间渲染最终 DOM
            await new Promise(r => setTimeout(r, 300));
            printOverlay();
            // v2.8.5：移除"请取消勾选页眉页脚"toast（移动端浏览器无此选项，纯属多余）
            // v2.8.5：在 window.print() 调用前后增加详细日志，便于移动端排查
            console.log('[pdfExport] 准备调用 window.print()，UA=', navigator.userAgent.substring(0, 80));
            console.log('[pdfExport] 视口=', window.innerWidth + 'x' + window.innerHeight, 'DPR=', window.devicePixelRatio);
            console.log('[pdfExport] print-page-section 数量=', document.querySelectorAll('.print-page-section').length);
            console.log('[pdfExport] page-break 标记数量=', document.querySelectorAll('.page-break').length);

            // v2.8.1：用 requestAnimationFrame 同步触发 window.print()
            // 原因：移动端浏览器（HarmonyOS / iOS Safari）严格要求 window.print()
            // 在用户手势上下文内调用，async/await 链会脱离手势上下文导致调用被吞
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    console.log('[pdfExport] 调用 window.print()');
                    try {
                        window.print();
                        console.log('[pdfExport] window.print() 调用成功');
                    } catch (e) {
                        console.error('[pdfExport] window.print 抛错:', e);
                        showToast('打印失败：' + (e && e.message ? e.message : '未知错误') + '，建议使用浏览器菜单的「网页转 PDF」', 5000);
                    }
                });
            });
        });
    } catch (error) {
        console.error('[pdfExport] 打印错误:', error);
        if (error && error.stack) {
            console.error('[pdfExport] error.stack:', error.stack);
        }
        showToast('打印时出错: ' + error.message, 4000);
        cleanup();
    }
}

/**
 * v2.9.0：移动端专用——隐藏 iframe 静态独立打印文档
 *
 * 根因：移动端打印管线异步读取实时 DOM，cleanup 永远先于分页渲染执行，
 *       含页眉页脚的 wrapper 被销毁后管线读到的是屏幕态 DOM（无页眉页脚）。
 * 方案：创建独立 iframe 打印文档，主文档零改动、零 cleanup。
 *       iframe 文档静态恒定，异步打印管线任意时刻读取结果一致。
 *
 * 销毁策略（多 Agent 审查后调整）：
 *   - 删除 afterprint/focus/60s 三重触发器（复刻原 bug 竞态拓扑）
 *   - 仅保留 window.pagehide（用户离开页面时回收内存）
 *   - 下次打印开头清旧 iframe（幂等清理，本函数入口已实现）
 *   - iframe 常驻 opacity:0/pointer-events:none，无视觉/交互成本
 *
 * 手势上下文（多 Agent 审查后调整）：
 *   - iwin.print() 用 requestAnimationFrame 嵌套调用，与现有 printDirect 一致
 *   - 最大限度保留用户手势上下文，防止 iOS Safari 静默吞掉 print()
 */
async function printViaIframe() {
    const grid = document.getElementById('grid-container');
    if (!grid) {
        showToast('未找到字帖内容，请先生成字帖', 2500);
        return;
    }
    const inputText = document.getElementById('inputText');
    if (inputText && !inputText.value.trim()) {
        showToast('请先输入汉字并生成字帖', 2500);
        return;
    }

    // ── 页眉页脚文本（与 printDirect 相同的读取/截断逻辑） ──
    const fontSelect = document.getElementById('font-select');
    const fontDisplayName = fontSelect ? fontSelect.options[fontSelect.selectedIndex].text : '';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hLeft = document.getElementById('headerLeft')?.value ||
        `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const hCenter = document.getElementById('headerCenter')?.value || '练习字帖';
    const _hrInput = document.getElementById('headerRight')?.value || '';
    let hRight;
    if (_hrInput && _hrInput !== '字体练习') {
        hRight = _hrInput;
    } else {
        let fn = (fontDisplayName || '').replace(/^★\s*/, '').replace(/\.(ttf|otf|woff|woff2)$/i, '');
        const cn = (fn.match(/[\u4e00-\u9fff]/g) || []);
        if (cn.length > 6 && fn.includes('体')) fn = fn.replace(/体/, '');
        const cn2 = (fn.match(/[\u4e00-\u9fff]/g) || []);
        if (cn2.length > 6) { let c = 0, r = ''; for (const ch of fn) { if (/[\u4e00-\u9fff]/.test(ch)) c++; if (c > 6) break; r += ch; } fn = r; }
        hRight = fn ? fn + '练习' : '';
    }
    const fText = document.getElementById('footerText')?.value || '评分：☆☆☆☆☆　______年___月___日';

    // ── 网格主色解析为具体色值（内联使用，不依赖 CSS 变量） ──
    const gridColor = (document.documentElement.style.getPropertyValue('--grid-theme-color') || '').trim()
        || (document.documentElement.style.getPropertyValue('--grid-primary-color') || '').trim()
        || '#2E7D32';

    const removeOverlay = showLoadingOverlay();
    let iframe = null;
    try {
        console.log('[iframe-print] 等待字体与笔画…');
        await waitForFonts();
        await waitForStrokes(2000);

        // 清理上一轮遗留 iframe（懒清理策略：本入口是唯一清理点）
        document.querySelectorAll('iframe.print-frame').forEach(f => f.remove());

        // ── 创建隐藏 iframe（禁用 display:none / visibility:hidden，部分引擎会跳过渲染） ──
        iframe = document.createElement('iframe');
        iframe.className = 'print-frame';
        iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(iframe);
        const iwin = iframe.contentWindow;
        const idoc = iframe.contentDocument;

        // ── 骨架（<base> 让 ./fonts/ 相对路径可解析） ──
        // v2.9.8：强制 light 主题，防止移动端浏览器对 iframe 施加 dark 模式
        //   - <html data-theme="light"> → light 主题 CSS 变量生效
        //   - <meta name="color-scheme" content="light"> → 移动端 UA 使用 light 样式
        //   - html/body 内联 background:#fff → 杜绝 dark 背景透出形成"黑框"
        //   - 额外 <style> 强制 light 变量 → 不依赖 @media print 即可生效
        const baseUrl = location.href.substring(0, location.href.lastIndexOf('/') + 1);
        idoc.open();
        idoc.write('<!DOCTYPE html>' +
            '<html data-theme="light" style="color-scheme:light;background:#fff">' +
            '<head><meta charset="UTF-8"><meta name="color-scheme" content="light"><base href="' + baseUrl + '">' +
            '<style>' +
            // v2.9.8：iframe 内强制 light 主题变量（不依赖 [data-theme='dark'] 是否被浏览器忽略）
            'html,body{background:#fff!important;color:#1e293b!important;}' +
            'body::before{display:none!important;}' +
            '.grid-svg-cell{color:#000!important;}' +
            '.grid-svg-cell text{fill:#000!important;}' +
            '.page-section-header,.page-section-footer{background:#fff!important;}' +
            '.print-page-section{background:#fff!important;}' +
            '</style>' +
            '</head>' +
            '<body style="margin:0;padding:0;background:#fff">' +
            '</body></html>');
        idoc.close();

        // ── 克隆主文档全部 <style> 节点（含 grid-svg.css 的 mm 尺寸、print.css 的 @page 与 @media print，零漂移） ──
        document.querySelectorAll('style').forEach(s => {
            try { idoc.head.appendChild(idoc.importNode(s, true)); } catch (e) { /* 跳过异常样式节点 */ }
        });

        // ── iframe 内重新注册字体（document.fonts 每文档独立） ──
        const fontSources = getFontSources();
        await Promise.all(fontSources.map(([name, url]) => {
            try {
                const ff = new iwin.FontFace(name, 'url("' + url + '")', { display: 'swap' });
                return Promise.race([
                    ff.load().then(f => idoc.fonts.add(f)),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('font timeout')), 5000))
                ]).catch(e => console.warn('[iframe-print] 字体加载失败:', name, e));
            } catch (e) { console.warn('[iframe-print] FontFace 创建失败:', name, e); return Promise.resolve(); }
        }));
        await idoc.fonts.ready;
        console.log('[iframe-print] 字体就绪，已注册:', fontSources.map(f => f[0]).join(','));

        // ── 按 .page-break 分组（只读主文档，不做任何修改） ──
        const gridChildren = Array.from(grid.children);
        const pages = [];
        let currentPage = [];
        for (const child of gridChildren) {
            currentPage.push(child);
            if (child.classList && child.classList.contains('page-break')) {
                pages.push(currentPage);
                currentPage = [];
            }
        }
        if (currentPage.length > 0) pages.push(currentPage);
        const totalPages = pages.length;
        console.log('[iframe-print] 分页段数:', totalPages);

        // ── 组装分页段（克隆进 iframe 文档） ──
        const wrapper = idoc.createElement('div');
        wrapper.className = 'a4-page pdf-print-wrapper';
        pages.forEach((pageChildren, idx) => {
            const section = idoc.createElement('div');
            section.className = 'print-page-section';
            if (idx === 0) section.classList.add('first-page-section');
            if (idx === totalPages - 1) section.classList.add('last-page-section');

            // 页眉（颜色内联具体色值）
            const header = idoc.createElement('div');
            header.className = 'page-section-header';
            header.style.cssText = 'color:' + gridColor + ';border-bottom-color:' + gridColor + ';';
            header.innerHTML =
                '<span class="ph-left">' + truncate(hLeft, 22) + '</span>' +
                '<span class="ph-center">' + truncate(hCenter, 16) + '</span>' +
                '<span class="ph-right">' + truncate(hRight, 22) + ' · 第 ' + (idx + 1) + ' 页共 ' + totalPages + ' 页</span>';
            section.appendChild(header);

            // 内容：行对包裹 + 克隆（importNode 深克隆保真内联 SVG）
            const content = idoc.createElement('div');
            content.className = 'page-section-content';
            let pair = null;
            for (const c of pageChildren) {
                const clone = idoc.importNode(c, true);
                // 克隆侧剥离 .page-break（分页由 section 边界承担；主文档原类不动）
                if (clone.classList) {
                    clone.classList.remove('page-break');
                    clone.removeAttribute('data-page-break');
                }
                if (clone.classList && clone.classList.contains('grid-svg-aux-row')) {
                    pair = idoc.createElement('div');
                    pair.className = 'print-row-pair';
                    content.appendChild(pair);
                    pair.appendChild(clone);
                } else if (pair) {
                    pair.appendChild(clone);
                    pair = null;
                } else {
                    content.appendChild(clone);
                }
            }
            const firstAux = content.querySelector('.grid-svg-aux-row');
            if (firstAux) firstAux.classList.add('page-top');   // 每页首行强制页顶线
            section.appendChild(content);

            // 页脚
            const footer = idoc.createElement('div');
            footer.className = 'page-section-footer';
            footer.style.cssText = 'color:' + gridColor + ';border-top-color:' + gridColor + ';';
            footer.innerHTML =
                '<span class="pf-center">' + truncate(fText, 32) + '</span>' +
                '<span class="pf-page">第 ' + (idx + 1) + ' 页 / 共 ' + totalPages + ' 页</span>';
            section.appendChild(footer);

            wrapper.appendChild(section);
        });
        idoc.body.appendChild(wrapper);
        console.log('[iframe-print] DOM 组装完成，section 数=', idoc.querySelectorAll('.print-page-section').length);

        // ── 渲染稳定（双 rAF）后打印 ──
        // 多 Agent 审查：用 rAF 嵌套调用 iwin.print()，与现有 printDirect 一致，保留用户手势上下文
        await new Promise(r => iwin.requestAnimationFrame(() => iwin.requestAnimationFrame(r)));
        console.log('[iframe-print] 调用 iframe.contentWindow.print()');

        try {
            iwin.print();
            console.log('[iframe-print] iwin.print() 调用成功');
        } catch (e) {
            console.error('[iframe-print] iwin.print 抛错:', e);
            showToast('打印失败：' + (e && e.message ? e.message : '未知错误') + '，建议使用浏览器菜单的「网页转 PDF」', 5000);
        }

        // ── 销毁策略（多 Agent 审查后调整） ──
        // 删除 afterprint（Android Chrome 立即触发，复刻原 bug 竞态）
        // 删除 focus（移动端不可靠且误触发）
        // 删除 60s 兜底（移动端预览停留常 >60s，过短会导致 iframe 被提前销毁）
        // 仅保留 window.pagehide（用户离开页面时回收内存）
        // 主要清理依靠下次打印开头的 document.querySelectorAll('iframe.print-frame').forEach(f => f.remove())
        const destroy = () => {
            if (!iframe || !iframe.parentNode) return;
            iframe.remove();
            window.removeEventListener('pagehide', destroy);
            console.log('[iframe-print] iframe 已销毁（pagehide 触发）');
        };
        window.addEventListener('pagehide', destroy);
    } finally {
        removeOverlay();
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
