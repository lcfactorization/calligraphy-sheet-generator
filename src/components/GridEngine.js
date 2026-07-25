/**
 * ════════════════════════════════════════════════════════════════
 * 矢量 SVG 字格渲染引擎 v2.4.1 — 绿色网格 + 11 格/行版式
 * ════════════════════════════════════════════════════════════════
 *
 * 依据用户参考 PDF（字帖_2026-07-06.pdf）的版式规范重写：
 *  - 所有网格线条统一绿色（深绿外框 + 中绿中线 + 浅绿虚线）
 *  - 每行 11 格：左 5 米字格（范字/描红/空白）+ 右 6 田字格（带拼音组词/空白）
 *  - 每行上方辅助行：左 18mm 四线格写拼音 + 右侧笔画数 + hanzi-writer 笔画 SVG
 *  - 每页 11 行分页
 *
 * 依赖契约：src/contracts/interfaces.js（GRID_COLORS / SHEET_LAYOUT / A4_SHEET_LAYOUT）
 */

import { GRID_COLORS, GRID_COLOR_PRESETS, SHEET_LAYOUT, A4_SHEET_LAYOUT } from '../contracts/interfaces.js';
import { pinyin } from '../modules/pinyin.js';
import { getZuCi } from '../modules/zuci.js';
import { loadStrokes, clearStrokeQueue } from '../modules/strokes.js';
// v2.5.3：颜色由 settingsCenter 管理（用户可在侧栏快切）
import { getSettings } from '../modules/settingsCenter.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 笔顺循环色板（首字彩色笔顺示范用） */
const STROKE_ORDER_COLORS = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5', '#8E24AA'];

/**
 * v2.5.3：获取当前网格颜色（基于 settingsCenter 的 gridColorPreset）
 * 如果预设不存在或被禁用，回退到默认 GRID_COLORS（传统绿）
 * @returns {Object} { primary, secondary, dashed, pinyin, zuci, stroke }
 */
function getActiveGridColors() {
    try {
        const settings = getSettings();
        const presetId = settings.gridColorPreset;
        if (presetId && presetId !== 'green') {
            const preset = GRID_COLOR_PRESETS.find(p => p.id === presetId);
            if (preset && preset.colors) {
                return { ...preset.colors, stroke: GRID_COLORS.stroke };
            }
        }
    } catch (e) { /* 静默回退 */ }
    return GRID_COLORS;
}

/**
 * 创建 SVG 子元素并批量设置属性
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
 */
function resolveStrokePath(stroke) {
    if (typeof stroke === 'string') return stroke;
    if (stroke && typeof stroke === 'object' && typeof stroke.path === 'string') return stroke.path;
    return '';
}

/**
 * ════════════════════════════════════════════════════════════════
 * 网格绘制函数（全绿配色）
 * ════════════════════════════════════════════════════════════════
 */

/**
 * 绘制米字格：外框粗实线 + 中线细实线 + 对角线细虚线（全绿）
 * @param {SVGElement} svg
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawMiziGrid(svg, colors) {
    svg.setAttribute('viewBox', '0 0 100 100');
    const C = colors || getActiveGridColors();

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    // 中线（水平+垂直，细实线，中绿）
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 50, x2: 100, y2: 50,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
    svg.appendChild(svgEl('line', {
        x1: 50, y1: 0, x2: 50, y2: 100,
        stroke: C.secondary, 'stroke-width': 0.6
    }));

    // 两条对角线（细虚线，浅绿）
    // v2.4.12：dasharray 从 '3,3' 改为 '6,4'，缩放后约 0.97mm 段 + 0.65mm 间隙，虚线明显
    // 去掉 vector-effect:non-scaling-stroke（Puppeteer 兼容性问题），改用增大 dasharray 值
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 0, x2: 100, y2: 100,
        stroke: C.dashed, 'stroke-width': 0.5,
        'stroke-dasharray': '6,4'
    }));
    svg.appendChild(svgEl('line', {
        x1: 100, y1: 0, x2: 0, y2: 100,
        stroke: C.dashed, 'stroke-width': 0.5,
        'stroke-dasharray': '6,4'
    }));
}

/**
 * 绘制田字格：外框粗实线 + 中线细实线（全绿）
 * @param {SVGElement} svg
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawTianGrid(svg, colors) {
    svg.setAttribute('viewBox', '0 0 100 100');
    const C = colors || getActiveGridColors();

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    // 中线（水平+垂直）
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 50, x2: 100, y2: 50,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
    svg.appendChild(svgEl('line', {
        x1: 50, y1: 0, x2: 50, y2: 100,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
}

/**
 * 绘制回字格：外框粗实线 + 内框60%居中（全绿）
 * @param {SVGElement} svg
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawHuiGrid(svg, colors) {
    svg.setAttribute('viewBox', '0 0 100 100');
    const C = colors || getActiveGridColors();

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    // 内框（60%居中：20,20 → 80,80）
    svg.appendChild(svgEl('rect', {
        x: 20, y: 20, width: 60, height: 60,
        fill: 'none',
        stroke: C.secondary,
        'stroke-width': 0.6
    }));
}

/**
 * v2.5.3 新增：绘制九宫格：外框 + 三等分虚线（3×3 布局）
 * 参考 gemini-code 设计，三等分线为虚线，颜色用 dashed 色
 * @param {SVGElement} svg
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawJiugongGrid(svg, colors) {
    svg.setAttribute('viewBox', '0 0 100 100');
    const C = colors || getActiveGridColors();

    // v2.5.3：外框由 createRowBorderSVG 统一绘制，此处仅画三等分虚线
    // 两条垂直三等分线（x=33.3, x=66.6）
    svg.appendChild(svgEl('line', {
        x1: 100 / 3, y1: 0, x2: 100 / 3, y2: 100,
        stroke: C.dashed, 'stroke-width': 0.6,
        'stroke-dasharray': '6,4'
    }));
    svg.appendChild(svgEl('line', {
        x1: 200 / 3, y1: 0, x2: 200 / 3, y2: 100,
        stroke: C.dashed, 'stroke-width': 0.6,
        'stroke-dasharray': '6,4'
    }));
    // 两条水平三等分线（y=33.3, y=66.6）
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 100 / 3, x2: 100, y2: 100 / 3,
        stroke: C.dashed, 'stroke-width': 0.6,
        'stroke-dasharray': '6,4'
    }));
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 200 / 3, x2: 100, y2: 200 / 3,
        stroke: C.dashed, 'stroke-width': 0.6,
        'stroke-dasharray': '6,4'
    }));
}

/**
 * 绘制拼音田字格：上30%拼音区 + 下70%田字格（全绿）
 *  - 外框 + y=30水平分隔线 + 垂直中线（仅下半部分）+ 水平中线（y=65）
 *  - 拼音文字在 y=15 居中
 * @param {SVGElement} svg
 * @param {Object} data - { pinyin, fontFamily }
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawPinyinTianGrid(svg, data, colors) {
    svg.setAttribute('viewBox', '0 0 100 100');
    const C = colors || getActiveGridColors();

    const { pinyin: py = '', fontFamily = 'TW-Kai' } = data || {};

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    // 上30%分隔线（y=30，水平实线）
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 30, x2: 100, y2: 30,
        stroke: C.secondary, 'stroke-width': 0.6
    }));

    // 垂直中线（仅下半部分 y=30~100）
    svg.appendChild(svgEl('line', {
        x1: 50, y1: 30, x2: 50, y2: 100,
        stroke: C.secondary, 'stroke-width': 0.6
    }));

    // 水平中线（仅下半部分 y=65）
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 65, x2: 100, y2: 65,
        stroke: C.secondary, 'stroke-width': 0.6
    }));

    // 拼音文字（上半部分 y=15 居中）
    if (py) {
        const text = svgEl('text', {
            x: 50, y: 15,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': 'TeXGyreAdventor, serif',
            'font-size': 14,
            fill: C.pinyin
        });
        text.textContent = py;
        svg.appendChild(text);
    }
}

/**
 * 绘制带拼音+组词的田字格（四宫格布局）
 *  - 上半部分（y=0~50）：左右两格，各写一个字的拼音
 *  - 下半部分（y=50~100）：左右两格，各写一个组词汉字
 *  - 词语中每个字都有独立的拼音
 * @param {SVGElement} svg
 * @param {Object} data - { word, fontFamily }
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawTianWithPinyinZuci(svg, data, colors) {
    svg.setAttribute('viewBox', '0 0 100 100');
    const C = colors || getActiveGridColors();

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    // 中线（水平+垂直）
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 50, x2: 100, y2: 50,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
    svg.appendChild(svgEl('line', {
        x1: 50, y1: 0, x2: 50, y2: 100,
        stroke: C.secondary, 'stroke-width': 0.6
    }));

    const { word = '', fontFamily = 'TW-Kai' } = data || {};
    // 词语拆分为单字（最多2个字）
    const chars = Array.from(word).slice(0, 2);

    // 为每个字生成拼音（调用 pinyin-pro）
    const pinyins = chars.map(c => {
        if (!c) return '';
        try {
            return pinyin(c, { toneType: 'symbol', segment: true, nonZh: 'consecutive' }) || '';
        } catch {
            return '';
        }
    });

    // 上半部分：每个字的拼音（y=25 居中）
    // v2.4.3：font-size 从 11 改为 14，适当放大，在小格子内居中
    [0, 1].forEach(i => {
        if (!pinyins[i]) return;
        const text = svgEl('text', {
            x: i === 0 ? 25 : 75,
            y: 25,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': 'TeXGyreAdventor, serif',
            'font-size': 14,
            fill: C.pinyin
        });
        text.textContent = pinyins[i];
        svg.appendChild(text);
    });

    // 下半部分：每个字（y=75 居中）
    [0, 1].forEach(i => {
        if (!chars[i]) return;
        const text = svgEl('text', {
            x: i === 0 ? 25 : 75,
            y: 75,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': `${fontFamily}, serif`,
            'font-size': 32,
            fill: C.zuci
        });
        text.textContent = chars[i];
        svg.appendChild(text);
    });
}

/**
 * 绘制汉字（范字或描红）
 * @param {SVGElement} svg
 * @param {string} char
 * @param {Object} opts - { color, opacity, fontFamily, y, fontSize }
 */
function drawChar(svg, char, opts = {}) {
    if (!char) return;
    const { color = '#000', opacity = 1, fontFamily = 'TW-Kai', y = 50, fontSize = 72 } = opts;
    const text = svgEl('text', {
        x: 50,
        y: y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': `${fontFamily}, serif`,
        'font-size': fontSize,
        fill: color,
        opacity: opacity
    });
    text.textContent = char;
    svg.appendChild(text);
}

/**
 * 绘制彩色笔顺（stroke-order 模式）
 * @param {SVGElement} svg
 * @param {string[]|Object[]} strokeOrder
 */
function drawStrokeOrder(svg, strokeOrder) {
    if (!Array.isArray(strokeOrder) || strokeOrder.length === 0) return false;
    const group = svgEl('g', {
        transform: 'scale(1, -1) translate(0, -100)'
    });
    strokeOrder.forEach((stroke, i) => {
        const d = resolveStrokePath(stroke);
        if (!d) return;
        // hanzi-writer 的 path 是 1024×1024 viewBox，缩放到 100×100
        const path = svgEl('path', {
            d,
            fill: STROKE_ORDER_COLORS[i % STROKE_ORDER_COLORS.length],
            transform: 'scale(0.09765625)'  // 100/1024
        });
        group.appendChild(path);
    });
    svg.appendChild(group);
    return true;
}

/**
 * ════════════════════════════════════════════════════════════════
 * createRowBorderSVG —— 行级统一边框（v2.4.14 新增）
 * ════════════════════════════════════════════════════════════════
 * 将整行的外框 + 12 条竖线绘制在同一个 SVG 中，
 * 消除多个独立 cell SVG 因亚像素定位累积误差导致的竖线粗细不一致。
 *
 * viewBox: 0 0 (cellCount*100) 100，每 100 单位 = 1 格
 * 所有竖线在同一个坐标系内，shape-rendering: crispEdges 对齐整数像素
 *
 * @param {number} cellCount - 每行格子数（默认 11）
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖（需含 primary 字段）
 * @returns {SVGElement} SVG.grid-svg-row-border
 */
export function createRowBorderSVG(cellCount = 11, colors) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'grid-svg-row-border');
    svg.setAttribute('viewBox', `0 0 ${cellCount * 100} 100`);
    svg.setAttribute('preserveAspectRatio', 'none');
    // v2.5.0：改用 geometricPrecision，确保矢量 PDF 中 stroke 宽度精确渲染
    //   crispEdges 会将细线对齐到整像素，导致 0.3mm 级别的线在打印时视觉上过细
    svg.setAttribute('shape-rendering', 'geometricPrecision');

    // 外框（四条边，统一线宽和颜色）
    // v2.5.0：BORDER_SW 从 1.6 调整为 2.0 SVG 单位 ≈ 0.324mm
    //   v2.4.18 矫枉过正：1.6 单位(≈0.26mm)在矢量 PDF 中视觉上过细
    //   2.0 是 1.6(细) 和 3.6(粗) 之间的中间值，与页顶实线线宽一致
    //   换算：每格 16.2mm = 100 SVG 单位 → 2.0 / 100 * 16.2 = 0.324mm
    // v2.5.1：改用填充矩形代替 stroke，确保 PDF 中线宽精确
    //   stroke 在 PDF 中因 crispEdges + preserveAspectRatio:none 渲染为 0 宽度
    //   填充矩形始终按精确尺寸渲染，与页顶 border-top 一致
    //   线宽 2.0 SVG 单位 = 2.0/100 * 16.2mm = 0.324mm，与页顶实线一致
    // v2.5.3：COLOR 从 GRID_COLORS.primary 改为动态获取，支持颜色快切
    const BORDER_SW = 2.0;
    const COLOR = (colors && colors.primary) || getActiveGridColors().primary;
    const W = cellCount * 100;

    // 上边
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: BORDER_SW, fill: COLOR }));
    // 下边
    svg.appendChild(svgEl('rect', { x: 0, y: 100 - BORDER_SW, width: W, height: BORDER_SW, fill: COLOR }));
    // 左边
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: BORDER_SW, height: 100, fill: COLOR }));
    // 右边
    svg.appendChild(svgEl('rect', { x: W - BORDER_SW, y: 0, width: BORDER_SW, height: 100, fill: COLOR }));
    // 内部竖线（居中于网格线，cellCount-1 条，把行分成 cellCount 格）
    // 相邻格子共用的边只绘制一次（统一绘制，无重复）
    for (let i = 1; i < cellCount; i++) {
        svg.appendChild(svgEl('rect', { x: i * 100 - BORDER_SW / 2, y: 0, width: BORDER_SW, height: 100, fill: COLOR }));
    }

    return svg;
}

/**
 * ════════════════════════════════════════════════════════════════
 * createGridCellSVG —— 核心契约函数（v2.4.1 重写）
 * ════════════════════════════════════════════════════════════════
 * v2.4.14：外框由 createRowBorderSVG 统一绘制，cell 内不再画外框 rect，
 *          仅保留中线/对角线/内容，消除竖线粗细不一致
 * v2.5.3：新增 'jiugong' 九宫格类型；所有 draw* 函数支持动态颜色
 *
 * @param {Object} options
 *   - gridType: 'mizi' | 'tian' | 'hui' | 'pinyin-tian' | 'pinyin-zuci' | 'jiugong'
 *   - mode: 'reference' | 'trace' | 'blank' | 'stroke-order'
 *   - char, pinyin, zuci, word, fontFamily, traceOpacity
 *   - colors: 可选颜色覆盖（v2.5.3）
 * @returns {SVGElement}
 */
export function createGridCellSVG(options = {}) {
    const {
        gridType = 'tian',
        mode = 'blank',
        char = '',
        pinyin: py = '',
        zuci = [],
        word = '',
        fontFamily = 'TW-Kai',
        traceOpacity = 0.3,
        strokeOrder = null,
        colors = null
    } = options;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'grid-svg-cell');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('data-grid-type', gridType);
    svg.setAttribute('data-mode', mode);
    if (char) svg.setAttribute('data-char', char);

    // 1. 绘制网格（v2.5.3：传入 colors，未传则由 draw* 内部读 getActiveGridColors）
    if (gridType === 'mizi') {
        drawMiziGrid(svg, colors);
    } else if (gridType === 'hui') {
        drawHuiGrid(svg, colors);
    } else if (gridType === 'jiugong') {
        // v2.5.3：九宫格（3×3 三等分虚线）
        drawJiugongGrid(svg, colors);
    } else if (gridType === 'pinyin-tian') {
        // 拼音田字格：上30%拼音 + 下70%田字格
        drawPinyinTianGrid(svg, { pinyin: py, fontFamily }, colors);
    } else if (gridType === 'pinyin-zuci') {
        drawTianWithPinyinZuci(svg, { word, fontFamily }, colors);
    } else {
        // 默认田字格
        drawTianGrid(svg, colors);
    }

    // 2. 根据模式绘制汉字（pinyin-zuci 模式已在网格函数内绘制拼音组词）
    if (gridType !== 'pinyin-zuci') {
        // pinyin-tian 网格的字放在下半部分 y=65，字号稍小
        const charY = gridType === 'pinyin-tian' ? 65 : 50;
        const charSize = gridType === 'pinyin-tian' ? 50 : 72;
        if (mode === 'reference') {
            // 范字：黑色
            drawChar(svg, char, { color: '#000', opacity: 1, fontFamily, y: charY, fontSize: charSize });
        } else if (mode === 'trace') {
            // 描红：黑色透明度可调
            drawChar(svg, char, { color: '#000', opacity: traceOpacity, fontFamily, y: charY, fontSize: charSize });
        } else if (mode === 'stroke-order') {
            // 笔顺：彩色笔画
            const ok = strokeOrder ? drawStrokeOrder(svg, strokeOrder) : false;
            if (!ok) {
                drawChar(svg, char, { color: '#000', opacity: 1, fontFamily, y: charY, fontSize: charSize });
            }
        }
        // blank 模式：仅网格
    }

    return svg;
}

/**
 * ════════════════════════════════════════════════════════════════
 * createAuxRow —— 辅助行（每行字格上方）
 * ════════════════════════════════════════════════════════════════
 *  - 左侧 18mm 宽：四线格写拼音
 *    · 四线格只画中间2条线（上下由字格行边界提供，4条线等距分布）
 *    · 每页第一行（isPageTop=true）顶部画一条粗实线（与外框同色同粗）
 *  - 右侧：左对齐笔画数 + hanzi-writer 笔画拆解 SVG
 * @param {string} char
 * @param {string} py
 * @param {Object} opts - { fontFamily, isPageTop, colors }
 * @returns {HTMLElement} div.grid-svg-aux-row
 */
export function createAuxRow(char, py, opts = {}) {
    const { fontFamily = 'TW-Kai', isPageTop = false, colors = null } = opts;
    const C = colors || getActiveGridColors();

    const row = document.createElement('div');
    row.className = 'grid-svg-aux-row';
    if (isPageTop) row.classList.add('page-top');

    // v2.5.0：页顶实线改回用 CSS border-top 实现
    //   v2.4.10 改用 CSS background-image，但它在 PDF 中无法渲染
    //   （print-color-adjust: exact 对 background-image 无效）
    //   border-top 是元素固有属性，打印/PDF 中自然显示，
    //   线宽与格子边框一致（2.0 SVG 单位 = 0.324mm），
    //   且天然撑满整个行宽，不会有分页孤立问题
    // v2.5.3：页顶实线颜色跟随网格主色（动态设置 inline style）
    if (isPageTop) {
        row.style.borderTopColor = C.primary;
    }

    // 左侧：四线格（18mm 宽，6mm 高）
    // viewBox 0 0 100 30：30单位=6mm，每mm=5单位
    // 4条线等距分布：y=0(上字格底/页顶粗线), y=10(中间线1), y=20(中间线2), y=30(下字格顶)
    const pinyinBox = document.createElement('div');
    pinyinBox.className = 'grid-svg-pinyin-box';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'pinyin-four-line');
    svg.setAttribute('viewBox', '0 0 100 30');
    svg.setAttribute('preserveAspectRatio', 'none');

    // 中间2条细线（y=10, y=20），4条线等距分布
    // 顶部线由页顶粗实线(isPageTop的background)或上一行字格底线提供
    // v2.4.12：统一两条中间线的颜色和透明度（之前上方0.45/下方1不一致）
    // v2.5.3：颜色用动态 C.secondary
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 10, x2: 100, y2: 10,
        stroke: C.secondary, 'stroke-width': 0.8
    }));
    // 下方中间线
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 20, x2: 100, y2: 20,
        stroke: C.secondary, 'stroke-width': 0.8
    }));

    // 拼音文字（居中于中间两格之间 y=15）
    // v2.4.4：font-size 从 11 改为 16（1.45倍），膨胀到约160%高度，明显出头
    // 中间两条线间距=10单位(2mm)，font-size=16 对应 3.2mm = 160%
    if (py) {
        const text = svgEl('text', {
            x: 50, y: 15,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': 'TeXGyreAdventor, serif',
            'font-size': 16,
            fill: C.pinyin
        });
        text.textContent = py;
        svg.appendChild(text);
    }
    pinyinBox.appendChild(svg);
    row.appendChild(pinyinBox);

    // 右侧：笔画数 + 笔画拆解 SVG
    const strokeBox = document.createElement('div');
    strokeBox.className = 'grid-svg-stroke-box';
    row.appendChild(strokeBox);

    // 异步加载笔画拆解（v2.4.5：队列化加载，不阻塞渲染）
    if (char) {
        loadStrokes(char, strokeBox);
    }

    return row;
}

/**
 * ════════════════════════════════════════════════════════════════
 * renderSheet —— 高层编排（v2.4.4 11 格/行版式）
 * ════════════════════════════════════════════════════════════════
 * 根据输入文本渲染整张字帖：
 *  - 每个汉字对应 1 行（11 格）+ 1 辅助行
 *  - 辅助行：左 18mm 四线格拼音（中间2条线）+ 右笔画数+SVG
 *    · 每页第一行辅助行顶部画粗实线
 *  - 字格行：左侧 5 格（gridType 由用户选择：田/米/回/拼音田）
 *           + 6 田字格（词1完整/词1字1描红/词1字2描红/词2完整/词2字1描红/词2字2描红）
 *  - 每 11 行分页
 * @param {string} input
 * @param {Object} options - { gridType, fontFamily, traceOpacity }
 * @returns {DocumentFragment}
 */
export function renderSheet(input = '', options = {}) {
    const fragment = document.createDocumentFragment();
    if (!input) return fragment;

    // v2.4.18：重新生成前清空旧的笔画加载队列，避免旧任务积压
    //   根因：页面初始化时生成默认生字表（278字）的笔画任务，
    //   用户输入新文本后新任务排到队尾，迟迟得不到处理
    clearStrokeQueue();

    const {
        gridType = 'mizi',
        fontFamily = 'TW-Kai',
        traceOpacity = 0.1
    } = options;

    // v2.5.3：一次性获取当前网格颜色，传给所有 cell / auxRow / rowBorder
    // 颜色来源：settingsCenter.gridColorPreset → GRID_COLOR_PRESETS → 回退 GRID_COLORS
    const colors = getActiveGridColors();

    // v2.8.3：把网格主色同步到 CSS 变量，供页眉页脚颜色同步使用
    // 修复根因：print.css 的 .page-section-header/footer 原硬编码 #2E7D32，
    //   切换朱砂红/靛青蓝/墨黑时页眉页脚不跟随。改用 var(--grid-primary-color)。
    if (colors && colors.primary) {
        document.documentElement.style.setProperty('--grid-primary-color', colors.primary);
    }

    // v2.8.2：预过滤 — 仅保留汉字字符（含繁体、扩展A区、兼容汉字），过滤所有标点、字母、数字、空白
    // 用户原则：字帖里用不上其他符号，这是基本原则
    const filteredInput = (function() {
        if (!input) return '';
        const matches = String(input).match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
        return matches ? matches.join('') : '';
    })();
    // 过滤掉空白字符，每个汉字对应一行
    const chars = Array.from(filteredInput).filter(c => /\S/.test(c) && c !== '\n' && c !== '\r');
    const { miziCount, tianCount, rowsPerPage } = SHEET_LAYOUT;

    chars.forEach((char, idx) => {
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

        // ── 计算组词（两字词语） ──
        let zuci = [];
        try {
            zuci = getZuCi(char) || [];
        } catch (e) {
            zuci = [];
        }
        // 取前两个两字词语
        const word1 = zuci[0] || '组词';
        const word2 = zuci[1] || '练字';
        // 拆分每个词语为单字
        const word1Chars = Array.from(word1).slice(0, 2);
        const word2Chars = Array.from(word2).slice(0, 2);
        while (word1Chars.length < 2) word1Chars.push('');
        while (word2Chars.length < 2) word2Chars.push('');

        // ── 1. 辅助行（拼音四线格 + 笔画SVG） ──
        // 每页第一行（idx % rowsPerPage === 0）画顶部粗实线
        const isPageTop = idx % rowsPerPage === 0;
        const auxRow = createAuxRow(char, py, { fontFamily, isPageTop, colors });
        fragment.appendChild(auxRow);

        // ── 2. 字格行 ──
        const charRow = document.createElement('div');
        charRow.className = 'grid-svg-row';
        charRow.setAttribute('data-char', char);
        charRow.setAttribute('data-pinyin', py);
        charRow.setAttribute('data-zuci', `${word1}|${word2}`);

        // 2.1 左侧 5 个字格（gridType 由用户选择：田/米/回/拼音田/九宫格）
        //   [0]范字黑色 [1]描红 [2]描红 [3]空白 [4]空白
        const miziModes = SHEET_LAYOUT.miziModes;
        for (let j = 0; j < miziCount; j++) {
            const cellMode = miziModes[j] || 'blank';
            const cell = createGridCellSVG({
                gridType: gridType,
                mode: cellMode,
                char,
                pinyin: py,
                fontFamily,
                traceOpacity,
                colors
            });
            charRow.appendChild(cell);
        }

        // 2.2 右侧 6 个田字格（v2.4.4：描红透明度跟随用户设置）
        //   [6]词1完整（拼音+字）  [7]词1字1描红  [8]词1字2描红
        //   [9]词2完整（拼音+字）  [10]词2字1描红 [11]词2字2描红
        const WORD_TRACE_OPACITY = traceOpacity;  // v2.4.4：词语描红透明度跟随用户设置

        // 第6格：词语1完整（四宫格：上拼音 + 下字）
        charRow.appendChild(createGridCellSVG({
            gridType: 'pinyin-zuci',
            mode: 'pinyin-zuci',
            word: word1,
            fontFamily,
            colors
        }));

        // 第7格：词语1第1字描红
        charRow.appendChild(createGridCellSVG({
            gridType: 'tian',
            mode: 'trace',
            char: word1Chars[0],
            fontFamily,
            traceOpacity: WORD_TRACE_OPACITY,
            colors
        }));

        // 第8格：词语1第2字描红
        charRow.appendChild(createGridCellSVG({
            gridType: 'tian',
            mode: 'trace',
            char: word1Chars[1],
            fontFamily,
            traceOpacity: WORD_TRACE_OPACITY,
            colors
        }));

        // 第9格：词语2完整（四宫格：上拼音 + 下字）
        charRow.appendChild(createGridCellSVG({
            gridType: 'pinyin-zuci',
            mode: 'pinyin-zuci',
            word: word2,
            fontFamily,
            colors
        }));

        // 第10格：词语2第1字描红
        charRow.appendChild(createGridCellSVG({
            gridType: 'tian',
            mode: 'trace',
            char: word2Chars[0],
            fontFamily,
            traceOpacity: WORD_TRACE_OPACITY,
            colors
        }));

        // 第11格：词语2第2字描红
        charRow.appendChild(createGridCellSVG({
            gridType: 'tian',
            mode: 'trace',
            char: word2Chars[1],
            fontFamily,
            traceOpacity: WORD_TRACE_OPACITY,
            colors
        }));

        // ── 3. 分页：每 rowsPerPage 行插入分页符 ──
        if ((idx + 1) % rowsPerPage === 0 && (idx + 1) < chars.length) {
            charRow.classList.add('page-break');
            charRow.setAttribute('data-page-break', '');
        }

        // v2.4.14：在 cells 之后插入行级统一边框 SVG（绝对定位，z-index:0 在 cells 下方）
        // 所有竖线在同一个 SVG 坐标系内，消除亚像素累积误差导致的粗细不一致
        // v2.5.3：传入 colors，使外框颜色跟随用户选择
        const rowBorder = createRowBorderSVG(SHEET_LAYOUT.cellsPerRow, colors);
        charRow.appendChild(rowBorder);

        fragment.appendChild(charRow);
    });

    return fragment;
}

// 显式导出常量（供上层集成 / 调试使用）
export { STROKE_ORDER_COLORS, SHEET_LAYOUT, GRID_COLORS, GRID_COLOR_PRESETS };
