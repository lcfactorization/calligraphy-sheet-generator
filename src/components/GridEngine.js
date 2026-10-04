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
import { getAiPinyin } from '../modules/aiZuci.js';  // v2.9.9：AI 拼音纠错缓存回退
import { loadStrokes, clearStrokeQueue } from '../modules/strokes.js';
// v2.5.3：颜色由 settingsCenter 管理（用户可在侧栏快切）
import { getSettings } from '../modules/settingsCenter.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 笔顺循环色板（首字彩色笔顺示范用） */
const STROKE_ORDER_COLORS = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5', '#8E24AA'];

/**
 * v3.0.7：拼音专用字体。拼音文字**不随用户选择的字体变化**，
 *   因此不带 data-ge-font="user" 标记 —— 切换字体时这些节点一个属性都不用改。
 */
const PINYIN_FONT_FAMILY = 'TeXGyreAdventor, serif';

/**
 * v3.0.7：cell SVG 的分层类名。
 *   网格层（线条/内框）与内容层（字/拼音/组词/笔顺）分开，
 *   于是「只改网格颜色或式样」可以清空重画网格层而**原地保留**内容层节点 ——
 *   内容层的重建才是贵的那部分：拼音要过 pinyin-pro + AI 纠错缓存，
 *   组词要查词库，笔画要走 hanzi-writer 的异步加载队列。
 */
const GRID_LAYER_CLASS = 'ge-grid-layer';
const CONTENT_LAYER_CLASS = 'ge-content-layer';

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
 * 绘制米字格：中线细实线 + 对角线细虚线
 *
 * v3.0.7：参数从「cell 根 svg」改为「网格层节点 `<g class="ge-grid-layer">`」。
 *   根因：切换网格颜色/式样原先只能整张字帖全量重建，连带重算拼音、重查组词、
 *   重新排队加载笔画（loadStrokes 是异步队列，最贵的一段）。分层之后网格层可以
 *   单独清空重画，内容层（字/拼音/组词）的 DOM 节点原地保留。
 *   viewBox 属于根 svg 的几何属性，统一由 createGridCellSVG 设置，不再由本函数负责。
 * @param {SVGElement} layer - 网格层 `<g>` 节点
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawMiziGrid(layer, colors) {
    const C = colors || getActiveGridColors();

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    // 中线（水平+垂直，细实线，中绿）
    layer.appendChild(svgEl('line', {
        x1: 0, y1: 50, x2: 100, y2: 50,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
    layer.appendChild(svgEl('line', {
        x1: 50, y1: 0, x2: 50, y2: 100,
        stroke: C.secondary, 'stroke-width': 0.6
    }));

    // 两条对角线（细虚线，浅绿）
    // v2.4.12：dasharray 从 '3,3' 改为 '6,4'，缩放后约 0.97mm 段 + 0.65mm 间隙，虚线明显
    // 去掉 vector-effect:non-scaling-stroke（Puppeteer 兼容性问题），改用增大 dasharray 值
    layer.appendChild(svgEl('line', {
        x1: 0, y1: 0, x2: 100, y2: 100,
        stroke: C.dashed, 'stroke-width': 0.5,
        'stroke-dasharray': '6,4'
    }));
    layer.appendChild(svgEl('line', {
        x1: 100, y1: 0, x2: 0, y2: 100,
        stroke: C.dashed, 'stroke-width': 0.5,
        'stroke-dasharray': '6,4'
    }));
}

/**
 * 绘制田字格：中线细实线（v3.0.7：画到网格层节点，viewBox 由 cell 根统一设置）
 * @param {SVGElement} layer - 网格层 `<g>` 节点
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawTianGrid(layer, colors) {
    const C = colors || getActiveGridColors();

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    // 中线（水平+垂直）
    layer.appendChild(svgEl('line', {
        x1: 0, y1: 50, x2: 100, y2: 50,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
    layer.appendChild(svgEl('line', {
        x1: 50, y1: 0, x2: 50, y2: 100,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
}

/**
 * 绘制回字格：内框60%居中（v3.0.7：画到网格层节点）
 * @param {SVGElement} layer - 网格层 `<g>` 节点
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawHuiGrid(layer, colors) {
    const C = colors || getActiveGridColors();

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    // 内框（60%居中：20,20 → 80,80）
    layer.appendChild(svgEl('rect', {
        x: 20, y: 20, width: 60, height: 60,
        fill: 'none',
        stroke: C.secondary,
        'stroke-width': 0.6
    }));
}

/**
 * v2.5.3 新增：绘制九宫格：三等分虚线（3×3 布局）
 * 参考 gemini-code 设计，三等分线为虚线，颜色用 dashed 色
 * v3.0.7：画到网格层节点，viewBox 由 cell 根统一设置
 * @param {SVGElement} layer - 网格层 `<g>` 节点
 * @param {Object} [colors] - v2.5.3 可选颜色覆盖
 */
function drawJiugongGrid(layer, colors) {
    const C = colors || getActiveGridColors();

    // v2.5.3：外框由 createRowBorderSVG 统一绘制，此处仅画三等分虚线
    // 两条垂直三等分线（x=33.3, x=66.6）
    layer.appendChild(svgEl('line', {
        x1: 100 / 3, y1: 0, x2: 100 / 3, y2: 100,
        stroke: C.dashed, 'stroke-width': 0.6,
        'stroke-dasharray': '6,4'
    }));
    layer.appendChild(svgEl('line', {
        x1: 200 / 3, y1: 0, x2: 200 / 3, y2: 100,
        stroke: C.dashed, 'stroke-width': 0.6,
        'stroke-dasharray': '6,4'
    }));
    // 两条水平三等分线（y=33.3, y=66.6）
    layer.appendChild(svgEl('line', {
        x1: 0, y1: 100 / 3, x2: 100, y2: 100 / 3,
        stroke: C.dashed, 'stroke-width': 0.6,
        'stroke-dasharray': '6,4'
    }));
    layer.appendChild(svgEl('line', {
        x1: 0, y1: 200 / 3, x2: 100, y2: 200 / 3,
        stroke: C.dashed, 'stroke-width': 0.6,
        'stroke-dasharray': '6,4'
    }));
}

/**
 * 绘制拼音田字格的**线条部分**：y=30 分隔线 + 下半垂直中线 + y=65 水平中线
 *
 * v3.0.7：原 drawPinyinTianGrid 把「网格线」和「拼音文字」画在同一个函数里，
 *   于是切换网格颜色时无法只重画线 —— 必然连带重建拼音文字节点。
 *   现拆开：线条归网格层，拼音文字归内容层（见 paintContentLayer）。
 * @param {SVGElement} layer - 网格层 `<g>` 节点
 * @param {Object} [colors]
 */
function drawPinyinTianGridLines(layer, colors) {
    const C = colors || getActiveGridColors();

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    // 上30%分隔线（y=30，水平实线）
    layer.appendChild(svgEl('line', {
        x1: 0, y1: 30, x2: 100, y2: 30,
        stroke: C.secondary, 'stroke-width': 0.6
    }));

    // 垂直中线（仅下半部分 y=30~100）
    layer.appendChild(svgEl('line', {
        x1: 50, y1: 30, x2: 50, y2: 100,
        stroke: C.secondary, 'stroke-width': 0.6
    }));

    // 水平中线（仅下半部分 y=65）
    layer.appendChild(svgEl('line', {
        x1: 0, y1: 65, x2: 100, y2: 65,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
}

/**
 * 绘制「拼音+组词」四宫格的**线条部分**：水平中线 + 垂直中线
 * v3.0.7：同上，线条与文字拆开，颜色切换不再重建文字
 * @param {SVGElement} layer - 网格层 `<g>` 节点
 * @param {Object} [colors]
 */
function drawPinyinZuciGridLines(layer, colors) {
    const C = colors || getActiveGridColors();

    // v2.4.14：外框由 createRowBorderSVG 统一绘制，此处不再画 rect
    layer.appendChild(svgEl('line', {
        x1: 0, y1: 50, x2: 100, y2: 50,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
    layer.appendChild(svgEl('line', {
        x1: 50, y1: 0, x2: 50, y2: 100,
        stroke: C.secondary, 'stroke-width': 0.6
    }));
}

/**
 * v3.0.7：按网格类型把线条画进网格层。首次渲染与定向重绘共用同一入口，
 *   避免两处 switch 各写一遍导致漂移。
 * @param {SVGElement} layer
 * @param {string} gridType
 * @param {Object} [colors]
 */
function paintGridLayer(layer, gridType, colors) {
    if (gridType === 'mizi') return drawMiziGrid(layer, colors);
    if (gridType === 'hui') return drawHuiGrid(layer, colors);
    if (gridType === 'jiugong') return drawJiugongGrid(layer, colors);
    if (gridType === 'pinyin-tian') return drawPinyinTianGridLines(layer, colors);
    if (gridType === 'pinyin-zuci') return drawPinyinZuciGridLines(layer, colors);
    return drawTianGrid(layer, colors);
}

/**
 * 拼音文字节点（固定使用 TeXGyreAdventor，**不随用户选择的字体变化**）
 * v3.0.7：打 data-ge-role="pinyin" 标记，供颜色定向重绘只改 fill 而不重建节点
 */
function makePinyinText(py, colors, { x, y, fontSize }) {
    const C = colors || getActiveGridColors();
    const text = svgEl('text', {
        x, y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': PINYIN_FONT_FAMILY,
        'font-size': fontSize,
        fill: C.pinyin,
        'data-ge-role': 'pinyin'
    });
    text.textContent = py;
    return text;
}

/**
 * v3.0.7：把内容（范字/描红/笔顺/拼音/组词）画进内容层。
 *   首次渲染与「网格类型变了」时的定向重绘共用，保证两条路径产出同构 DOM
 *   （pdfExport 直接读实时 DOM，结构漂移会让打印/导出版式走样）。
 * @param {SVGElement} layer - 内容层 `<g>` 节点
 * @param {Object} ctx - { gridType, mode, char, py, word, fontFamily, traceOpacity, strokeOrder }
 * @param {Object} [colors]
 */
function paintContentLayer(layer, ctx, colors) {
    const C = colors || getActiveGridColors();
    const {
        gridType = 'tian',
        mode = 'blank',
        char = '',
        py = '',
        word = '',
        fontFamily = 'TW-Kai',
        traceOpacity = 0.3,
        strokeOrder = null,
        strokeOrderNode = null
    } = ctx || {};

    // 「拼音+组词」四宫格：上排两个字的拼音 + 下排两个组词汉字
    if (gridType === 'pinyin-zuci') {
        const wordChars = Array.from(word).slice(0, 2);
        // v2.9.9：优先使用 AI 纠正后的拼音（多音字修正）
        const pys = wordChars.map(c => {
            if (!c) return '';
            const aiPy = getAiPinyin(c);
            if (aiPy) return aiPy;
            try {
                return pinyin(c, { toneType: 'symbol', segment: true, nonZh: 'consecutive' }) || '';
            } catch {
                return '';
            }
        });
        // 上半部分：每个字的拼音（y=25 居中）
        // v2.4.3：font-size 从 11 改为 14，适当放大，在小格子内居中
        [0, 1].forEach(i => {
            if (!pys[i]) return;
            layer.appendChild(makePinyinText(pys[i], C, { x: i === 0 ? 25 : 75, y: 25, fontSize: 14 }));
        });
        // 下半部分：每个字（y=75 居中，使用用户选择的字体）
        [0, 1].forEach(i => {
            if (!wordChars[i]) return;
            layer.appendChild(makeGlyphText(wordChars[i], fontFamily, {
                x: i === 0 ? 25 : 75, y: 75, fontSize: 32,
                color: C.zuci, opacity: 1, role: 'zuci'
            }));
        });
        return;
    }

    // 拼音田字格：拼音文字在上半部分 y=15 居中
    if (gridType === 'pinyin-tian' && py) {
        layer.appendChild(makePinyinText(py, C, { x: 50, y: 15, fontSize: 14 }));
    }

    // 汉字本体（pinyin-tian 的字放在下半部分 y=65，字号稍小）
    const charY = gridType === 'pinyin-tian' ? 65 : 50;
    const charSize = gridType === 'pinyin-tian' ? 50 : 72;
    if (mode === 'reference') {
        // 范字：currentColor（dark 模式自动反色，打印由 print.css 强制黑色）
        drawChar(layer, char, { color: 'currentColor', opacity: 1, fontFamily, y: charY, fontSize: charSize });
    } else if (mode === 'trace') {
        // 描红：currentColor + 透明度可调（dark 模式自动反色）
        drawChar(layer, char, { color: 'currentColor', opacity: traceOpacity, fontFamily, y: charY, fontSize: charSize, trace: true });
    } else if (mode === 'stroke-order') {
        // 笔顺：彩色笔画
        // v3.0.7：定向重绘时把已有的笔顺组直接搬回来（strokeOrderNode），
        //   避免重跑 loadStrokes()，也避免拿不到笔画数据时退化成普通范字。
        if (strokeOrderNode) {
            layer.appendChild(strokeOrderNode);
            return;
        }
        const ok = strokeOrder ? drawStrokeOrder(layer, strokeOrder) : false;
        if (!ok) {
            drawChar(layer, char, { color: 'currentColor', opacity: 1, fontFamily, y: charY, fontSize: charSize });
        }
    }
    // blank 模式：仅网格
}

/**
 * 用户字体的文字节点。
 * v3.0.7：打 data-ge-font="user" 标记 —— 切换字体时只需改这些节点的 font-family，
 *   拼音文字（TeXGyreAdventor 固定字体）不在其中，因此不会被误改。
 */
function makeGlyphText(ch, fontFamily, { x, y, fontSize, color, opacity, role }) {
    const text = svgEl('text', {
        x, y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': `${fontFamily}, serif`,
        'font-size': fontSize,
        fill: color,
        opacity: opacity,
        'data-ge-font': 'user',
        'data-ge-role': role
    });
    text.textContent = ch;
    return text;
}

/**
 * 绘制汉字（范字或描红）
 * v3.0.7：文字节点带 data-ge-font="user" 标记，切换字体时只改这些节点的 font-family；
 *   描红字另带 data-ge-trace，调整描红透明度时无需重建节点，只改 opacity 属性。
 * @param {SVGElement} layer - 内容层 `<g>` 节点
 * @param {string} char
 * @param {Object} opts - { color, opacity, fontFamily, y, fontSize, trace }
 */
function drawChar(layer, char, opts = {}) {
    if (!char) return;
    // v2.9.7：默认 currentColor，让范字在 dark 模式自动反色（继承 .grid-svg-cell 的 color）
    // 打印时由 print.css 强制 .grid-svg-cell { color: #000 } 保证黑字白纸
    const { color = 'currentColor', opacity = 1, fontFamily = 'TW-Kai', y = 50, fontSize = 72, trace = false } = opts;
    const text = makeGlyphText(char, fontFamily, {
        x: 50, y, fontSize, color, opacity, role: 'glyph'
    });
    if (trace) text.setAttribute('data-ge-trace', '1');
    layer.appendChild(text);
}

/**
 * 绘制彩色笔顺（stroke-order 模式）
 * @param {SVGElement} layer - 内容层 `<g>` 节点
 * @param {string[]|Object[]} strokeOrder
 */
function drawStrokeOrder(layer, strokeOrder) {
    if (!Array.isArray(strokeOrder) || strokeOrder.length === 0) return false;
    const group = svgEl('g', {
        transform: 'scale(1, -1) translate(0, -100)',
        // v3.0.7：标记笔顺组，供 repaintSheetGrid 在切换网格式样时原样保留
        //   （笔画坐标是 0–100 全格空间，与 gridType 无关，因此无需重算）
        'data-ge-role': 'stroke-order'
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
    layer.appendChild(group);
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
        colors = null,
        // v3.0.7：本格子的网格类型是否跟随用户选择（左侧 5 格为 true，右侧 6 格固定）
        userGrid = false
    } = options;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'grid-svg-cell');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // v3.0.7：viewBox 从各 draw*Grid 上移到此处 —— 它是根 svg 的几何属性，
    //   网格层被清空重画时不该跟着丢失
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('data-grid-type', gridType);
    svg.setAttribute('data-mode', mode);
    if (char) svg.setAttribute('data-char', char);
    // v3.0.7：把渲染时用的派生数据留在 DOM 上，定向重绘时直接读回，
    //   不必重新调用 pinyin() / getZuCi() / loadStrokes()
    if (py) svg.setAttribute('data-py', py);
    if (word) svg.setAttribute('data-word', word);
    if (userGrid) svg.setAttribute('data-ge-usergrid', '1');

    const gridLayer = svgEl('g', { class: GRID_LAYER_CLASS });
    const contentLayer = svgEl('g', { class: CONTENT_LAYER_CLASS });
    svg.appendChild(gridLayer);
    svg.appendChild(contentLayer);

    const ctx = { gridType, mode, char, py, word, fontFamily, traceOpacity, strokeOrder };
    paintGridLayer(gridLayer, gridType, colors);
    paintContentLayer(contentLayer, ctx, colors);

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
            'font-family': PINYIN_FONT_FAMILY,
            'font-size': 16,
            fill: C.pinyin,
            // v3.0.7：标记供颜色定向重绘只改 fill，不重建节点
            'data-ge-role': 'pinyin'
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
    // v2.8.5-hotfix：同时设置 --grid-theme-color 和 --grid-primary-color（向后兼容）
    // v3.0.7：抽成 syncGridColorVars，与定向重绘 repaintSheetGrid 共用同一份逻辑
    syncGridColorVars(colors);

    // v2.8.2：预过滤 — 仅保留汉字字符（含繁体、扩展A区、兼容汉字），过滤所有标点、字母、数字、空白
    // 用户原则：字帖里用不上其他符号，这是基本原则
    const filteredInput = (function() {
        if (!input) return '';
        const matches = String(input).match(/[\u4e00-\u9fa5]/g);
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
        // v2.9.9：优先使用 AI 纠正后的拼音（多音字修正）
        const aiPy = getAiPinyin(char);
        if (aiPy) py = aiPy;

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
                colors,
                // v3.0.7：左侧 5 格的网格式样跟随用户选择，切换时只重画这些格子
                userGrid: true
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

/* ════════════════════════════════════════════════════════════════
 * v3.0.7：定向重绘 API
 * ════════════════════════════════════════════════════════════════
 * 这三个函数是为「改一个外观设置就把整张字帖重建一遍」这个浪费而加的。
 *
 * 全量 renderSheet 每次都要为每个汉字：跑 pinyin-pro（含 AI 纠错缓存查询）、
 * 查组词词库、并把笔画任务推进 hanzi-writer 的异步加载队列（最贵的一段，
 * 逐字串行、每字都要 new 一个临时 HanziWriter 实例再销毁）。
 * 而「换个网格颜色」「换个网格式样」「换个字体」这三件事，
 * 上面这些派生结果**一个都没变**。
 *
 * 因此这里的定向重绘只做属性写入与网格层重画，
 * 内容层（生字 / 组词 / 拼音 / 笔画）的 DOM 节点原地保留、一个都不重建。
 * 取证见 scripts/verify-incremental-refresh.cjs：给节点打探针标记，
 * 操作后标记仍在即证明节点未被重建。
 */

/** 把网格主色同步到 CSS 变量（页眉页脚跟随，与 renderSheet 中的逻辑一致） */
function syncGridColorVars(colors) {
    if (colors && colors.primary) {
        document.documentElement.style.setProperty('--grid-primary-color', colors.primary);
        document.documentElement.style.setProperty('--grid-theme-color', colors.primary);
    }
}

/** 取当前用户选择的字体（与 main.js getRenderOptions 同源） */
function currentFontFamily() {
    const sel = document.getElementById('font-select');
    return sel ? sel.value : 'TW-Kai';
}

/**
 * 切换字体：只改「用户字体」文字节点的 font-family 属性。
 *
 * 不会碰的东西（这正是需求所在）：
 *  - 拼音文字 —— 用固定的 TeXGyreAdventor，不带 data-ge-font="user"，选择器根本命中不到
 *  - 笔画笔顺 SVG —— hanzi-writer 的路径数据与字体无关，不重新入队加载
 *  - 网格线与颜色 —— 与字体无关
 * @param {HTMLElement} container - #grid-container
 * @param {string} fontFamily
 * @returns {{texts:number}} 改动的文字节点数
 */
export function applySheetFont(container, fontFamily) {
    if (!container || !fontFamily) return { texts: 0 };
    const ff = `${fontFamily}, serif`;
    const texts = container.querySelectorAll('[data-ge-font="user"]');
    texts.forEach(t => t.setAttribute('font-family', ff));
    return { texts: texts.length };
}

/**
 * 调整描红透明度：只改描红字节点的 opacity 属性，不重建任何节点。
 * @param {HTMLElement} container
 * @param {number} opacity
 * @returns {{texts:number}}
 */
export function applySheetTraceOpacity(container, opacity) {
    if (!container || opacity == null) return { texts: 0 };
    const texts = container.querySelectorAll('[data-ge-trace="1"]');
    texts.forEach(t => t.setAttribute('opacity', String(opacity)));
    return { texts: texts.length };
}

/**
 * 重画网格的颜色与式样。
 *
 * 内容层节点原地保留：只有当某个格子的网格类型**真的变了**（例如米字格→拼音田），
 * 才重建那一个格子的内容层 —— 因为拼音田要把字下移到 y=65 并补一行拼音。
 * 即便如此，拼音也是从渲染时留在 DOM 上的 data-py 读回的，
 * **不重新调用 pinyin() / getZuCi() / loadStrokes()**。
 *
 * @param {HTMLElement} container - #grid-container
 * @param {Object} [options] - { gridType, colors, fontFamily, traceOpacity }；缺省时读当前设置
 * @returns {{cells:number, rebuiltContent:number, repainted:number}}
 */
export function repaintSheetGrid(container, options = {}) {
    if (!container) return { cells: 0, rebuiltContent: 0, repainted: 0 };
    const settings = getSettings();
    const colors = options.colors || getActiveGridColors();
    const gridType = options.gridType || settings.gridType || 'mizi';
    const fontFamily = options.fontFamily || currentFontFamily();
    const traceOpacity = options.traceOpacity != null
        ? options.traceOpacity
        : (settings.traceOpacity != null ? settings.traceOpacity : 0.1);

    syncGridColorVars(colors);

    const cells = container.querySelectorAll('.grid-svg-cell');
    let rebuiltContent = 0;
    let repainted = 0;

    cells.forEach(svg => {
        const gridLayer = svg.querySelector(`.${GRID_LAYER_CLASS}`);
        const contentLayer = svg.querySelector(`.${CONTENT_LAYER_CLASS}`);
        // 分层结构缺失（理论上不会出现）：跳过本格，让上层的全量重建兜底
        if (!gridLayer || !contentLayer) return;

        const oldType = svg.getAttribute('data-grid-type');
        // 只有跟随用户选择的格子才换式样；右侧 6 格（拼音组词格/田字格）版式是固定的
        const nextType = svg.hasAttribute('data-ge-usergrid') ? gridType : oldType;

        gridLayer.replaceChildren();
        paintGridLayer(gridLayer, nextType, colors);
        repainted++;

        if (nextType !== oldType) {
            svg.setAttribute('data-grid-type', nextType);
            // 先把笔顺组摘下来，再清空内容层 —— 否则 replaceChildren() 会连带销毁它，
            // 而重画笔顺需要 strokeOrder 数据（只有全量重建时的 loadStrokes 才有）。
            const strokeNode = contentLayer.querySelector('[data-ge-role="stroke-order"]');
            if (strokeNode) strokeNode.remove();
            contentLayer.replaceChildren();
            paintContentLayer(contentLayer, {
                gridType: nextType,
                mode: svg.getAttribute('data-mode') || 'blank',
                char: svg.getAttribute('data-char') || '',
                py: svg.getAttribute('data-py') || '',
                word: svg.getAttribute('data-word') || '',
                fontFamily,
                traceOpacity,
                strokeOrder: null,
                strokeOrderNode: strokeNode
            }, colors);
            rebuiltContent++;
        } else {
            // 式样没变 → 结构一个节点都不动，只写着色属性
            contentLayer.querySelectorAll('[data-ge-role="pinyin"]').forEach(t => t.setAttribute('fill', colors.pinyin));
            contentLayer.querySelectorAll('[data-ge-role="zuci"]').forEach(t => t.setAttribute('fill', colors.zuci));
        }
    });

    // 行级外框：createRowBorderSVG 画的所有 rect 用的都是 primary，直接改 fill 即可，无需重建
    container.querySelectorAll('.grid-svg-row-border rect').forEach(r => r.setAttribute('fill', colors.primary));

    // 辅助行：四线格的两条线 + 拼音着色 + 页顶实线颜色
    container.querySelectorAll('.grid-svg-aux-row').forEach(row => {
        row.querySelectorAll('.pinyin-four-line line').forEach(l => l.setAttribute('stroke', colors.secondary));
        row.querySelectorAll('[data-ge-role="pinyin"]').forEach(t => t.setAttribute('fill', colors.pinyin));
        if (row.classList.contains('page-top')) row.style.borderTopColor = colors.primary;
    });

    return { cells: cells.length, rebuiltContent, repainted };
}
