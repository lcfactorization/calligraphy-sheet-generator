/**
 * ════════════════════════════════════════════════════════════════
 * 矢量 SVG 字格渲染引擎（Agent-A · 阶段 1）
 * ════════════════════════════════════════════════════════════════
 *
 * 职责：
 *  - createGridCellSVG：纯 Inline SVG 渲染单个字格（4 网格 × 3 模式）
 *  - renderSheet：高层编排，生成拼音行 + 字格行 + 笔顺缩略图
 *
 * 设计原则：
 *  - SVG 上不设 width/height，物理尺寸完全由 grid-svg.css 控制（保证打印 18mm）
 *  - viewBox="0 0 100 100"（pinyin-tian 为 0 0 100 130），preserveAspectRatio="xMidYMid meet"
 *  - 所有线条 stroke-width="0.6"（viewBox 100 单位下 0.6%，打印清晰）
 *  - 中心虚线统一 stroke-dasharray="3,3"
 *
 * 依赖契约：src/contracts/interfaces.js（GridCellProps / resolveGridProps）
 */

import { resolveGridProps, MM_TO_PX, A4_PORTRAIT, MAX_COLS_A4_18MM } from '../contracts/interfaces.js';
import { pinyin } from '../modules/pinyin.js';
import { getZuCi } from '../modules/zuci.js';
import { loadStrokes } from '../modules/strokes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 笔顺循环色板（印泥红 → 朱砂 → 琥珀 → 松柏 → 靛蓝） */
const STROKE_ORDER_COLORS = ['#9E2A2B', '#D97777', '#F59E0B', '#339933', '#6366f1'];

/** 单页字帖行数（A4 18mm 下 5 行约 90mm + 拼音行 30mm = 120mm，留足边距） */
const ROWS_PER_PAGE = 5;

/** 字格行内模式分布：首字 stroke-order，2-3 字 trace，其余 blank */
const STROKE_ORDER_INDEX = 0;
const TRACE_INDICES = [1, 2];

/**
 * 创建 SVG 子元素并批量设置属性
 * @param {string} name - SVG 元素名（rect/line/path/text 等）
 * @param {Object} attrs - 属性键值对
 * @returns {SVGElement}
 */
function svgEl(name, attrs = {}) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    return el;
}

/**
 * 取笔画 path d 字符串（兼容字符串数组与 hanzi-writer 对象数组 {path, ...}）
 * @param {string|Object} stroke
 * @returns {string}
 */
function resolveStrokePath(stroke) {
    if (typeof stroke === 'string') return stroke;
    if (stroke && typeof stroke === 'object' && typeof stroke.path === 'string') return stroke.path;
    return '';
}

/**
 * 绘制网格线（4 种 gridType）
 * @param {SVGElement} svg
 * @param {Object} opts - { gridType, primaryColor, secondaryColor }
 */
function drawGridLines(svg, opts) {
    const { gridType, primaryColor, secondaryColor } = opts;
    const strokeAttrs = { stroke: secondaryColor, 'stroke-width': 0.6, 'stroke-dasharray': '3,3' };

    if (gridType === 'pinyin-tian') {
        // viewBox 0 0 100 130：上 30% 拼音四线三格 + 下 100 田字格
        svg.setAttribute('viewBox', '0 0 100 130');
        // 拼音四线三格：4 条水平实线 y=0,10,20,30
        [0, 10, 20, 30].forEach(y => {
            svg.appendChild(svgEl('line', {
                x1: 0, y1: y, x2: 100, y2: y,
                stroke: secondaryColor, 'stroke-width': 0.6
            }));
        });
        // 田字格下半部分 y=30..130
        svg.appendChild(svgEl('rect', {
            x: 0, y: 30, width: 100, height: 100,
            fill: 'none', stroke: primaryColor, 'stroke-width': 0.6
        }));
        // 十字虚线（中线 y=80, x=50）
        svg.appendChild(svgEl('line', { x1: 0, y1: 80, x2: 100, y2: 80, ...strokeAttrs }));
        svg.appendChild(svgEl('line', { x1: 50, y1: 30, x2: 50, y2: 130, ...strokeAttrs }));
        return;
    }

    // 通用 100×100 田字格基础
    svg.setAttribute('viewBox', '0 0 100 100');
    // 外框
    svg.appendChild(svgEl('rect', {
        x: 0, y: 0, width: 100, height: 100,
        fill: 'none', stroke: primaryColor, 'stroke-width': 0.6
    }));
    // 十字虚线（水平 y=50 + 垂直 x=50）
    svg.appendChild(svgEl('line', { x1: 0, y1: 50, x2: 100, y2: 50, ...strokeAttrs }));
    svg.appendChild(svgEl('line', { x1: 50, y1: 0, x2: 50, y2: 100, ...strokeAttrs }));

    if (gridType === 'mizi') {
        // 米字格：tian 基础 + 两条对角线虚线
        svg.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 100, y2: 100, ...strokeAttrs }));
        svg.appendChild(svgEl('line', { x1: 100, y1: 0, x2: 0, y2: 100, ...strokeAttrs }));
    } else if (gridType === 'hui') {
        // 回字格：外框 + 内框 60%（x=20 y=20 w=60 h=60）
        svg.appendChild(svgEl('rect', {
            x: 20, y: 20, width: 60, height: 60,
            fill: 'none', stroke: secondaryColor, 'stroke-width': 0.6
        }));
    }
    // gridType === 'tian'：仅外框 + 十字虚线，无需额外
}

/**
 * 绘制描红汉字（trace 模式）
 * @param {SVGElement} svg
 * @param {Object} opts - { char, primaryColor, traceOpacity, fontFamily, gridType }
 */
function drawTraceChar(svg, opts) {
    const { char, primaryColor, traceOpacity, fontFamily, gridType } = opts;
    if (!char) return;
    // pinyin-tian 汉字渲染在 y=80，其余在 y=50
    const cy = gridType === 'pinyin-tian' ? 80 : 50;
    const text = svgEl('text', {
        x: 50,
        y: cy,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fontFamily,
        'font-size': 72,
        fill: primaryColor,
        opacity: Math.min(Math.max(traceOpacity, 0.1), 0.4)
    });
    text.textContent = char;
    svg.appendChild(text);
}

/**
 * 绘制拼音文字（仅 pinyin-tian 模式）
 * @param {SVGElement} svg
 * @param {Object} opts - { pinyin, primaryColor, pinyinFontFamily }
 */
function drawPinyinText(svg, opts) {
    const { pinyin: py, primaryColor, pinyinFontFamily } = opts;
    if (!py) return;
    const text = svgEl('text', {
        x: 50,
        y: 18,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': pinyinFontFamily,
        'font-size': 9,
        fill: primaryColor
    });
    text.textContent = py;
    svg.appendChild(text);
}

/**
 * 绘制笔顺彩色笔画（stroke-order 模式）
 * 兼容 path 字符串数组与 hanzi-writer 对象数组 {path}
 * @param {SVGElement} svg
 * @param {string[]} strokeOrder
 * @param {string} gridType
 */
function drawStrokeOrder(svg, strokeOrder, gridType) {
    if (!Array.isArray(strokeOrder) || strokeOrder.length === 0) {
        return false;
    }
    // pinyin-tian 下半部分 y=30..130，把 0..100 范围的 path 平移到 30..130
    const translateY = gridType === 'pinyin-tian' ? 30 : 0;
    const group = svgEl('g', translateY ? { transform: `translate(0, ${translateY})` } : {});
    strokeOrder.forEach((stroke, i) => {
        const d = resolveStrokePath(stroke);
        if (!d) return;
        const path = svgEl('path', {
            d,
            fill: STROKE_ORDER_COLORS[i % STROKE_ORDER_COLORS.length]
        });
        group.appendChild(path);
    });
    svg.appendChild(group);
    return true;
}

/**
 * ════════════════════════════════════════════════════════════════
 * createGridCellSVG —— 核心契约函数
 * ════════════════════════════════════════════════════════════════
 * 创建单个 SVG 字格节点
 * @param {GridCellProps} options - 见 contracts/interfaces.js
 * @returns {SVGElement} <svg class="grid-svg-cell"> DOM 节点
 */
export function createGridCellSVG(options = {}) {
    const props = resolveGridProps(options);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'grid-svg-cell');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // 注意：viewBox 由 drawGridLines 根据 gridType 设置（pinyin-tian 为 100×130）
    // 不在 SVG 上设置 width/height，物理尺寸由 CSS grid-svg.css 控制
    svg.setAttribute('data-grid-type', props.gridType);
    svg.setAttribute('data-mode', props.mode);
    svg.setAttribute('data-char', props.char || '');

    // 1. 绘制网格线
    drawGridLines(svg, props);

    // 2. 拼音文字（仅 pinyin-tian 显示在四线三格区）
    if (props.gridType === 'pinyin-tian') {
        drawPinyinText(svg, props);
    }

    // 3. 根据模式绘制内容
    if (props.mode === 'stroke-order') {
        // 有 strokeOrder 数组 → 彩色笔顺；否则回退 trace
        const ok = drawStrokeOrder(svg, props.strokeOrder, props.gridType);
        if (!ok) {
            drawTraceChar(svg, props);
        }
    } else if (props.mode === 'trace') {
        drawTraceChar(svg, props);
    }
    // mode === 'blank'：仅网格，不绘制汉字

    return svg;
}

/**
 * ════════════════════════════════════════════════════════════════
 * renderSheet —— 高层编排
 * ════════════════════════════════════════════════════════════════
 * 根据输入文本渲染整张字帖（拼音行 + 字格行 + 笔顺缩略图容器）
 * @param {string} input - 待渲染文本
 * @param {Object} options - { gridType, mode, cellSizeMM, fontFamily, traceOpacity, charsPerRow }
 * @returns {DocumentFragment} 可直接 appendChild 到 #grid-container
 */
export function renderSheet(input = '', options = {}) {
    const fragment = document.createDocumentFragment();
    if (!input) return fragment;

    const chars = Array.from(input);
    const {
        gridType = 'tian',
        mode = 'stroke-order',
        cellSizeMM = 18,
        fontFamily = 'TW-Kai',
        traceOpacity = 0.25,
        charsPerRow = Math.min(MAX_COLS_A4_18MM, 10)
    } = options;

    chars.forEach((char, i) => {
        // 跳过空白字符（保留换行作为软分页提示）
        if (char === '\n') return;

        // ── 计算拼音 ──
        let py = '';
        try {
            py = pinyin(char, {
                toneType: 'symbol',
                segment: true,
                nonZh: 'consecutive'
            }) || '';
        } catch (e) {
            py = '';
        }

        // ── 拼音行 ──
        const pinyinRow = document.createElement('div');
        pinyinRow.className = 'grid-svg-pinyin-row';
        for (let j = 0; j < charsPerRow; j++) {
            const span = document.createElement('span');
            // 仅首字格位置显示当前字拼音
            span.textContent = j === 0 ? py : '';
            pinyinRow.appendChild(span);
        }
        // 笔顺缩略图容器（异步加载，不阻塞渲染）
        const strokeContainer = document.createElement('div');
        strokeContainer.className = 'grid-svg-stroke-container';
        pinyinRow.appendChild(strokeContainer);
        fragment.appendChild(pinyinRow);

        // ── 字格行 ──
        const charRow = document.createElement('div');
        charRow.className = 'grid-svg-row';
        // 存储组词数据（供未来扩展 / 田字格组词模式使用）
        try {
            const zuci = getZuCi(char);
            charRow.setAttribute('data-zuci', (zuci || []).join('|'));
        } catch (e) {
            charRow.setAttribute('data-zuci', '');
        }

        for (let j = 0; j < charsPerRow; j++) {
            const cellMode = pickCellMode(j, mode);
            const cell = createGridCellSVG({
                gridType,
                char,
                pinyin: py,
                mode: cellMode,
                fontFamily,
                traceOpacity,
                cellSizeMM
            });
            charRow.appendChild(cell);
        }

        // ── 分页：每 ROWS_PER_PAGE 行插入分页符 ──
        if ((i + 1) % ROWS_PER_PAGE === 0) {
            charRow.classList.add('page-break');
            charRow.setAttribute('data-page-break', '');
        }

        fragment.appendChild(charRow);

        // ── 异步加载笔画缩略图（不阻塞渲染） ──
        loadStrokes(char, strokeContainer).catch(err => {
            // 静默失败：笔画加载不应阻断字帖渲染
            console.warn(`[GridEngine] loadStrokes 失败 ("${char}"):`, err);
        });
    });

    return fragment;
}

/**
 * 字格行内模式分布
 *  - mode='stroke-order'：首字 stroke-order，2-3 字 trace，其余 blank
 *  - mode='trace'：全部 trace
 *  - mode='blank'：全部 blank
 * @param {number} index 字格在行内的位置（0-based）
 * @param {RenderMode} sheetMode 整页模式
 * @returns {RenderMode}
 */
function pickCellMode(index, sheetMode) {
    if (sheetMode === 'trace') return 'trace';
    if (sheetMode === 'blank') return 'blank';
    // stroke-order（默认）
    if (index === STROKE_ORDER_INDEX) return 'stroke-order';
    if (TRACE_INDICES.includes(index)) return 'trace';
    return 'blank';
}

// 显式导出常量（供上层集成 / 调试使用）
export { STROKE_ORDER_COLORS, ROWS_PER_PAGE };
