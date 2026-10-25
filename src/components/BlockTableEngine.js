/**
 * ════════════════════════════════════════════════════════════════
 * 生字卡表格版式渲染引擎 v3.1.1（block-table）
 * ════════════════════════════════════════════════════════════════
 *
 * 依据：docs/生字卡表格版式_实施方案与智能体提示词_v3.1.0.md §2（渲染规格，冻结设计）
 *       + §12（P1 增补：A 显式分页 / B 拼音四线格，冻结设计）
 * 契约：src/contracts/blockTable.js（BLOCK_TABLE_LAYOUT / BT_DEFAULT_SETTINGS / BT_ZUCI_LEVELS，
 *       所有尺寸/档位数值一律引用契约，本文件不写魔法数）
 *
 * v3.1.1 变更（§12，用户实测两问题修复 + 2026-10-24 增补指令）：
 *   A 显式分页 —— renderBlockSheet 产出 .bt-sheet > .bt-page × n，彻底不依赖浏览器
 *      碎片化算法。**每页块数固定 5 个生字**（§12.A.2，2026-10-24 用户指令，覆盖
 *      原"实测两档"设计）：首页（含页头）与后续页一律 5 块，末页以空网格块补满
 *      到 5（§12.A.4，空块不写 data-char/data-pinyin/data-zuci-multi）。页头
 *      （标题/日期/年级/姓名栏）仅出现在第 1 页（§12.A.3）且做了**压缩**（字号/
 *      行高/间距收紧，CSS 侧），给 5 块让出空间。引擎仍实测页头高与块 footprint，
 *      但用途改为**验证性守卫**：页头高 + 5×块footprint ≤ 277−2mm 必须成立，
 *      不成立时 console.warn 并给首页加 .bt-head-compact 进一步压缩页头间距。
 *      页几何：屏幕态 .bt-page = 210×297mm 纸张卡片（10mm 内边距模拟 @page 页边距，
 *      内容盒恰为 190×277mm）；打印态 .bt-page 高冻结为 277mm（§12.A.1）、
 *      padding 0、页间 page-break-after:always、末页 auto —— 两种媒体的内容盒
 *      恒等，守卫实测对屏幕与打印同时成立（WYSIWYG）。
 *   B 拼音四线格 —— 线条层与文字层分离：线条 SVG（viewBox 0 0 100 30 +
 *      preserveAspectRatio:none，只含 line，合法）铺满贴左缘的一格宽盒子；
 *      文字 SVG（正方形 viewBox + xMidYMid meet）**等比缩放**，字符保持原字体
 *      宽高比，修复原先整体拉伸导致的失真（§12.B.7）。
 *
 * 复用矩阵（每个子能力都站在已验证的代码上）：
 *   - 格子绘制          → GridEngine.createGridCellSVG（userGrid:true，格型跟随用户选择）
 *   - 行级统一边框       → GridEngine.createRowBorderSVG
 *   - 拼音（含 AI 纠错） → aiZuci.getAiPinyin → pinyin() 回退
 *   - 笔画拆解          → strokes.loadStrokes 异步队列（离线 hanziDataStore，失败静默）
 *   - 笔画数            → hanziDataStore.getCharDataAsync 的 strokes.length
 *   - 组词词源          → aiZuci.getAiZuciMulti（B 并行交付，typeof 防御）→ zuci.getZuCi 二字词回退
 *   - 颜色预设          → GRID_COLOR_PRESETS + 本文件照抄 GridEngine.getActiveGridColors
 *
 * 类名纪律（隔离现有事件委托的基石，§2.1）：
 *   - 主表格格子**有意复用** .grid-svg-cell[data-char]（userGrid:true）与
 *     .grid-svg-row-border：笔顺演示弹窗（strokeDemoModal 查 .grid-svg-cell[data-char]）、
 *     repaintSheetGrid 定向重绘（查 .grid-svg-cell / .grid-svg-row-border）、
 *     applySheetFont 字体切换（查 [data-ge-font="user"]）全部零改动生效。
 *   - 其余元素全部 bt- 前缀；**绝不出现** .grid-svg-row（经典 manualEdit 委托目标）与
 *     .grid-svg-aux-row（pdfExport 查询目标）——旧代码命中不到，新代码互不误触。
 *   - .bt-zcell 内不放 data-char：组词区点击不会触发笔顺演示，编辑入口归 btManualEdit。
 *
 * 纯函数模块：不绑定任何 document/window 级事件（接线是 Agent-C 的职责）。
 */

import '../styles/block-table.css';
import { GRID_COLORS, GRID_COLOR_PRESETS } from '../contracts/interfaces.js';
import { BLOCK_TABLE_LAYOUT, BT_DEFAULT_SETTINGS, BT_ZUCI_LEVELS } from '../contracts/blockTable.js';
import { createGridCellSVG, createRowBorderSVG } from './GridEngine.js';
import { getSettings } from '../modules/settingsCenter.js';
import { pinyin } from '../modules/pinyin.js';
import { getAiPinyin, getAiZuciMulti } from '../modules/aiZuci.js';
import { getZuCi } from '../modules/zuci.js';
import { loadStrokes, clearStrokeQueue } from '../modules/strokes.js';
import { getCharDataAsync } from '../modules/hanziDataStore.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 拼音专用字体（与 GridEngine.PINYIN_FONT_FAMILY 同约定）：
 * 不随用户选择的字体变化，因此不带 data-ge-font="user" 标记。
 */
const PINYIN_FONT_FAMILY = 'TeXGyreAdventor, serif';

/** 笔画数 pill 的异步填充兜底：无数据留空（与样张"后"字一致），绝不抛错 */
const STROKE_PILL_UNIT = '画';

// ── v3.1.1 显式分页常量（§12.A 冻结值；@page 边距契约在 block-table.css 打印段）──
// v3.1.2 起 @page margin:0，页边距由 .bt-page 自身 padding 提供：
// 打印态 .bt-page=210×296mm+padding 10mm→内容盒 190×276mm；屏幕态 297mm 卡片+10mm→内容盒 277mm。
// 本常量取屏幕内容盒（恒等），较打印内容盒保守 1mm，守卫预算 277−2=275mm 对两种媒介同时成立。
const BT_PAGE_CONTENT_MM = 277;
// 每页块数（契约 blocksPerPage，v3.1.1 用户指令：每页 6 个生字，覆盖早前"实测两档"与
// "固定 5 块"设计）；首页（含压缩页头）与后续页一律 6 块，末页以空块补满到 6。
const BT_BLOCKS_PER_PAGE = BLOCK_TABLE_LAYOUT.blocksPerPage;
// 分页守卫安全余量（§12.A.2：277 − 2mm；≥2mm，吸收打印亚像素取整与行末余量）
const BT_PAGE_RESERVE_MM = 2;
// CSS mm → px 换算（CSS 规范恒等式：1in = 96px = 25.4mm）。实测与契约估算共用。
const BT_MM_TO_PX = 96 / 25.4;
// 拼音文字层字号（正方形 viewBox 0 0 100 100 内的 SVG 单位）：
// 渲染高 = 50/100 × 信息行高 8mm = 4.0mm ≈ 四线格中段（2.67mm）的 150%，
// 与经典辅助行的 160% 出头观感一致；最长拼音 zhuāng ≈ 3.3em ≈ 13.2mm ≤ 一格宽 13.5mm。
// 等比缩放由 viewBox + meet 保证，改此值不会引起宽高比失真（§12.B.7）。
const PINYIN_TEXT_FONT_SIZE = 50;

// ════════════════════════════════════════════════════════════════
// 内部小工具
// ════════════════════════════════════════════════════════════════

/**
 * 获取当前网格颜色（GridEngine.getActiveGridColors 未导出，照抄其实现）。
 * 颜色来源：settingsCenter.gridColorPreset → GRID_COLOR_PRESETS → 回退 GRID_COLORS。
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

/** 把网格色阶同步到 CSS 变量（与 GridEngine.syncGridColorVars 同构）。
 *  v3.1.2：块帖渲染此前完全不写 CSS 变量，只依赖 settingsCenter.applySettings 初始化时写过；
 *          一旦走到未初始化的路径（首次渲染顺序变化 / 独立调用），.bt-* 的
 *          var(--grid-primary-color, #2E7D32) 就回落到绿色。渲染入口显式写一次消除该隐患。 */
function syncGridColorVars(colors) {
    if (!colors) return;
    const root = document.documentElement;
    if (colors.primary) {
        root.style.setProperty('--grid-primary-color', colors.primary);
        root.style.setProperty('--grid-theme-color', colors.primary);
    }
    if (colors.secondary) root.style.setProperty('--grid-secondary-color', colors.secondary);
    if (colors.dashed) root.style.setProperty('--grid-dashed-color', colors.dashed);
    if (colors.pinyin) root.style.setProperty('--grid-pinyin-color', colors.pinyin);
    if (colors.zuci) root.style.setProperty('--grid-zuci-color', colors.zuci);
}

/** 创建 SVG 子元素并批量设置属性（与 GridEngine.svgEl 同款） */
function svgEl(name, attrs = {}) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    return el;
}

/** 创建 HTML 元素（可选类名） */
function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
}

/** 整数夹取：非法值回退 fallback，合法值夹到 [min, max]（防御脏 localStorage 数据） */
function clampInt(value, fallback, min, max) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

/** 数值夹取：同上，不取整（透明度用） */
function clampNum(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

/**
 * 读取 bt* 设置子集。
 * 合并语义（方案冻结）：`{ ...BT_DEFAULT_SETTINGS, ...getSettings() }` ——
 * 契约默认值在前，用户已保存的设置覆盖之；settingsCenter 尚未声明 bt* 键时
 * 由 BT_DEFAULT_SETTINGS 兜底，渲染层不感知接线进度。
 * @returns {Object} { cols, rows, traceCount, traceOpacity, referenceCell,
 *                     zuciEnabled, zuciLevel, zuciRows, title, showHeaderMeta }
 */
function readBtSettings() {
    const s = { ...BT_DEFAULT_SETTINGS, ...getSettings() };
    const minCols = Math.min(...BLOCK_TABLE_LAYOUT.colsOptions);
    const maxCols = Math.max(...BLOCK_TABLE_LAYOUT.colsOptions);
    return {
        // 列数夹取到契约可选档位范围（8~12）
        cols: clampInt(s.btCols, BLOCK_TABLE_LAYOUT.colsDefault, minCols, maxCols),
        // 行数固定 2（v3.1.1 监督员 F2 加固）：每页 5 块的分页预算以 2 行主表为前提，
        // 手改 localStorage 传入的其他值不生效（否则 overflow:hidden 会裁切末块，
        // 重现 §12.A 要修复的缺陷类别）；行数配置留待后续版本与分页预算联动开放
        // v3.1.1：行数 1-3（用户指令），动态装箱分页使任意组合均不越页
        rows: clampInt(s.btMainRows, BLOCK_TABLE_LAYOUT.mainRowsDefault, 1, 3),
        // 描摹格数契约范围 0–5；组词行数契约范围 1–4
        traceCount: clampInt(s.btTraceCount, BLOCK_TABLE_LAYOUT.traceCountDefault, 0, 5),
        traceOpacity: clampNum(s.btTraceOpacity, BLOCK_TABLE_LAYOUT.traceOpacityDefault, 0, 1),
        referenceCell: !!s.btReferenceCell,
        zuciEnabled: !!s.btZuciEnabled,
        zuciLevel: BT_ZUCI_LEVELS.some(l => l.id === s.btZuciLevel)
            ? s.btZuciLevel
            : BT_DEFAULT_SETTINGS.btZuciLevel,
        zuciRows: clampInt(s.btZuciRows, BLOCK_TABLE_LAYOUT.zuciRowsDefault, 1, 4),
        title: (typeof s.btTitle === 'string' && s.btTitle) ? s.btTitle : BT_DEFAULT_SETTINGS.btTitle,
        showHeaderMeta: !!s.btShowHeaderMeta
    };
}

/** 组词档位 → 透明度（查契约档位表；未知档位按显示处理，防御） */
function levelOpacity(level) {
    const lv = BT_ZUCI_LEVELS.find(l => l.id === level);
    return lv ? lv.opacity : 1;
}

/**
 * 词源清洗：只留 2–4 字词（上限引用契约组词列数），剔除经典回退源的
 * "组词"/"练字" 占位词 —— 占位词不算真词，走"全空白"降级而非写入面板。
 */
function cleanWords(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(w => {
        if (typeof w !== 'string') return false;
        const len = Array.from(w).length;
        return len >= 2 && len <= BLOCK_TABLE_LAYOUT.zuciCols && w !== '组词' && w !== '练字';
    });
}

/**
 * 组词词源（§2.4 优先级）：
 *   ① getAiZuciMulti（手动 userEdited > AI multi）—— 函数由 Agent-B 并行交付，
 *      这里做 typeof 防御：未定义/抛错/返回空一律回退下一级；
 *   ② getZuCi 经典二字词回退；
 *   ③ 全空白（防御式降级，不阻塞渲染）。
 */
function resolveZuciWords(char) {
    try {
        if (typeof getAiZuciMulti === 'function') {
            const multi = getAiZuciMulti(char);
            const cleaned = cleanWords(multi);
            if (cleaned.length > 0) return cleaned;
        }
    } catch (e) { /* 静默回退 */ }
    try {
        const cleaned = cleanWords(getZuCi(char) || []);
        if (cleaned.length > 0) return cleaned;
    } catch (e) { /* 静默：全空白 */ }
    return [];
}

/** 拼音取值：getAiPinyin（AI 纠正/手动，多音字修正）优先 → pinyin() try/catch 回退 → 空 */
function resolvePinyin(char) {
    try {
        const aiPy = getAiPinyin(char);
        if (typeof aiPy === 'string' && aiPy) return aiPy;
    } catch (e) { /* 静默回退 */ }
    try {
        return pinyin(char, { toneType: 'symbol', segment: true, nonZh: 'consecutive' }) || '';
    } catch (e) {
        return '';
    }
}

// ════════════════════════════════════════════════════════════════
// 片段构造（页头 / 信息行 / 主表格 / 组词面板）
// ════════════════════════════════════════════════════════════════

/** 姓名栏下划线空位（样式由 .bt-meta-blank 提供，跟随 currentColor 适配 dark） */
function buildMetaBlank() {
    return el('span', 'bt-meta-blank');
}

/**
 * 姓名栏空白小格（§2.1）：4 个 9mm 简单空白格。
 * 刻意**不用** createGridCellSVG / .grid-svg-cell / data-char：
 * 小格只是填写位，绝不能触发笔顺演示委托或被 repaintSheetGrid 重绘。
 */
function buildNameBoxSVG(colors) {
    const svg = svgEl('svg', { viewBox: '0 0 100 100' });
    svg.setAttribute('class', 'bt-name-box');
    // 3.0 SVG 单位 ≈ 0.27mm（9mm 格），与主表行边框（2.0/100×13.5mm≈0.27mm）视觉同粗
    svg.appendChild(svgEl('rect', {
        x: 1.5, y: 1.5, width: 97, height: 97,
        fill: 'none', stroke: colors.primary, 'stroke-width': 3
    }));
    return svg;
}

/** 页头（btShowHeaderMeta 开时）：标题 + 年_月_日 · 年级__年__班 · 姓名 + 4 小格 */
function buildSheetHead(bt, colors) {
    const head = el('div', 'bt-sheet-head');

    const h1 = document.createElement('h1');
    h1.className = 'bt-title';
    h1.textContent = bt.title;
    head.appendChild(h1);

    const meta = el('div', 'bt-meta-line');

    // 年_月_日
    const dateItem = el('span', 'bt-meta-item');
    dateItem.append(
        buildMetaBlank(), document.createTextNode('年'),
        buildMetaBlank(), document.createTextNode('月'),
        buildMetaBlank(), document.createTextNode('日')
    );

    // 年级__年__班
    const gradeItem = el('span', 'bt-meta-item');
    gradeItem.append(
        document.createTextNode('年级：'),
        buildMetaBlank(), document.createTextNode('年'),
        buildMetaBlank(), document.createTextNode('班')
    );

    // 姓名：+ 4 个空白小格（格数与组词列数同为冻结值 4，见 §2.1）
    const nameItem = el('span', 'bt-meta-item');
    nameItem.append(document.createTextNode('姓名：'));
    const boxes = el('span', 'bt-name-boxes');
    for (let i = 0; i < BLOCK_TABLE_LAYOUT.zuciCols; i++) {
        boxes.appendChild(buildNameBoxSVG(colors));
    }
    nameItem.appendChild(boxes);

    meta.append(dateItem, gradeItem, nameItem);
    head.appendChild(meta);
    return head;
}

/**
 * 短四线格拼音盒（§2.2 + §12.B 线字分离，v3.1.1 重写）。
 *
 * 结构：.bt-pinyin-box（一格宽，贴信息行左缘，贴左由 CSS 负 margin 实现）
 *   ├─ svg.bt-pinyin-lines  线条层：viewBox 0 0 100 30 + preserveAspectRatio="none"
 *   │   铺满盒子。只含 line 无文字，"none" 拉伸对线条合法（§12.B.7）；
 *   │   只画中间两条细线（y=10/y=20，与 GridEngine.createAuxRow 同构），
 *   │   上下两条线由信息行边框提供；右缘不画竖线（§12.B.8）。
 *   └─ svg.bt-pinyin-text   文字层：正方形 viewBox 0 0 100 100 +
 *       preserveAspectRatio="xMidYMid meet" —— **等比缩放**，字符保持原字体
 *       宽高比（修复 v3.1.0 对含文字 SVG 整体拉伸导致的变形，§12.B.7）。
 *       meet 在 13.5×8mm 盒内按高适配并居中，文字节点垂直对准中间两线之间
 *       （y=50 即盒高中线 = 中段两线的几何中心）。
 *
 * 文字节点保持 makePinyinText 同款约定：TeXGyreAdventor + data-ge-role="pinyin"
 * （btRecolor 的拼音着色查询直接命中该 text 节点）。
 */
function buildPinyinBoxSVG(py, colors) {
    const box = el('div', 'bt-pinyin-box');

    // 线条层（只有 line，无文字 → preserveAspectRatio:"none" 合法）
    const lines = svgEl('svg', {
        class: 'bt-pinyin-lines',
        viewBox: '0 0 100 30',
        preserveAspectRatio: 'none',
        'aria-hidden': 'true'
    });
    // 中间两条细线（stroke-width 0.8，同 createAuxRow）
    lines.appendChild(svgEl('line', {
        x1: 0, y1: 10, x2: 100, y2: 10,
        stroke: colors.secondary, 'stroke-width': 0.8
    }));
    lines.appendChild(svgEl('line', {
        x1: 0, y1: 20, x2: 100, y2: 20,
        stroke: colors.secondary, 'stroke-width': 0.8
    }));
    box.appendChild(lines);

    // 文字层（正方形 viewBox + meet：等比缩放，宽高比不失真）
    if (py) {
        const textSvg = svgEl('svg', {
            class: 'bt-pinyin-text',
            viewBox: '0 0 100 100',
            preserveAspectRatio: 'xMidYMid meet'
        });
        const text = svgEl('text', {
            x: 50, y: 50,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': PINYIN_FONT_FAMILY,
            'font-size': PINYIN_TEXT_FONT_SIZE,
            fill: colors.pinyin,
            'data-ge-role': 'pinyin'
        });
        text.textContent = py;
        textSvg.appendChild(text);
        box.appendChild(textSvg);
    }
    return box;
}

/**
 * 笔画数 pill："N画" 由 hanziDataStore 异步填充。
 * pill 文本整体必须匹配 /^\d+画$/（验收断言 4），故不带"笔画"等前缀标签；
 * 数据缺失时留空（灰底小药丸，与样张"后"字一致）。
 */
function fillStrokeCountPill(char, pill) {
    Promise.resolve()
        .then(() => getCharDataAsync(char))
        .then(data => {
            // 块已随重新生成从 DOM 移除 → 忽略本次异步结果
            if (!pill.isConnected) return;
            const n = (data && Array.isArray(data.strokes)) ? data.strokes.length : 0;
            if (n > 0) pill.textContent = `${n}${STROKE_PILL_UNIT}`;
        })
        .catch(() => { /* 静默：无数据留空，不阻塞渲染 */ });
}

/**
 * 组词词字 text 节点（§2.4 冻结标记）：
 *   data-ge-font="user"     → applySheetFont 切换字体时定向覆盖
 *   data-ge-role="bt-zuci-word" → btApplyZuciLevel 定向增删；刻意**不带**
 *   data-ge-trace（描摹透明度只管主表格，btApplyTraceOpacity 不得误伤词字）。
 */
function makeZuciWordText(ch, fontFamily, colors, opacity) {
    const text = svgEl('text', {
        x: 50, y: 50,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': `${fontFamily}, serif`,
        'font-size': 72,
        fill: colors.zuci,
        opacity: String(opacity),
        'data-ge-font': 'user',
        'data-ge-role': 'bt-zuci-word'
    });
    text.textContent = ch;
    return text;
}

/**
 * 组词格（v3.1.1 重构，用户反馈：组词格此前固定田字格不跟随格型变化）：
 *   - 线条改由 createGridCellSVG({ userGrid: true }) 产出 → 跟随 settings.gridType
 *     （田/米/九宫/回/拼音田），且 repaintSheetGrid 的格型/颜色定向重绘自动覆盖本格；
 *   - 词字为独立叠加文字层（.bt-zcell-text，绝对定位铺满格内），
 *     保持 data-ge-font="user" + data-ge-role="bt-zuci-word" 标记不变；
 *   - 隔离纪律不变：createGridCellSVG 无 char → 不产生 data-char（笔顺演示不触发）；
 *     容器仍为 .bt-zcell（div），不带 .grid-svg-row 类名。
 */
function buildZuciCell(ch, fontFamily, colors, opacity, gridType) {
    const frag = document.createDocumentFragment();
    frag.appendChild(createGridCellSVG({
        gridType: gridType || 'tian',
        mode: 'blank',
        userGrid: true,
        colors
    }));
    // hidden 档（opacity 0）词字节点不创建，词文本只留在 data-zuci-multi 属性里
    if (ch && opacity > 0) {
        const textSvg = svgEl('svg', { viewBox: '0 0 100 100', class: 'bt-zcell-text' });
        textSvg.appendChild(makeZuciWordText(ch, fontFamily, colors, opacity));
        frag.appendChild(textSvg);
    }
    return frag;
}

/**
 * 组词面板（§2.4）：.bt-zhead（"组词" pill + 三档位 pill，当前档高亮）
 * + .bt-zrow × btZuciRows，每行 4 格（词字占前 N 格，N=词长 2–4，余格空白）。
 */
function buildZuciPanel(words, bt, colors, fontFamily, gridType, zrows) {
    const panel = el('div', 'bt-zuci');
    panel.setAttribute('data-bt-level', bt.zuciLevel);

    // 档位头：三档文案"隐藏/描摹/显示"，当前档高亮（点击循环由接线层绑定）
    const zhead = el('div', 'bt-zhead');
    const label = el('span', 'bt-pill');
    label.textContent = '组词';
    zhead.appendChild(label);
    BT_ZUCI_LEVELS.forEach(lv => {
        const p = el('span', 'bt-pill bt-pill-level');
        p.setAttribute('data-bt-zlevel', lv.id);
        p.textContent = lv.label;
        if (lv.id === bt.zuciLevel) p.classList.add('bt-active');
        zhead.appendChild(p);
    });
    panel.appendChild(zhead);

    const opacity = levelOpacity(bt.zuciLevel);
    // v3.1.1（用户指令）：面板行数跟随生字行数（控制符覆盖时），否则用设置 btZuciRows；
    // AI 固定 2 词 → 前 2 行填词，更多行为空白临写格
    const panelRows = Math.max(1, zrows || bt.zuciRows);
    for (let r = 0; r < panelRows; r++) {
        const zrow = el('div', 'bt-zrow');
        const wcs = Array.from(words[r] || '').slice(0, BLOCK_TABLE_LAYOUT.zuciCols);
        for (let c = 0; c < BLOCK_TABLE_LAYOUT.zuciCols; c++) {
            const zcell = el('div', 'bt-zcell');
            zcell.appendChild(buildZuciCell(wcs[c] || '', fontFamily, colors, opacity, gridType));
            zrow.appendChild(zcell);
        }
        // 行级统一边框复用 createRowBorderSVG（.grid-svg-row-border 类被
        // repaintSheetGrid 的重着色查询覆盖，颜色预设切换自动生效）
        // v3.1.2：同主表格 —— 首行画上边、每行只画下边，杜绝相邻行叠成双倍粗横线
        zrow.appendChild(createRowBorderSVG(BLOCK_TABLE_LAYOUT.zuciCols, colors, { top: r === 0 }));
        panel.appendChild(zrow);
    }
    return panel;
}

/**
 * 单字一块（§2.1）：信息行 + 主表格（左列）与 组词面板（右列）。
 * 信息行置于 .bt-main 首位：其 border-bottom:none 与主表格首行外框相接（§2.2），
 * 与参考样张 DOM 同构（样张 .main 内含 info）。
 *
 * @param {string} char - 生字；opts.empty=true 时忽略（传 ''）
 * @param {Object} [opts] - { asyncFills=true, empty=false }
 *   asyncFills=false 用于分页测量块（§12.A.2）：测量块测完即删，跳过
 *   loadStrokes / 笔画数异步填充，避免向共享队列重复压入与正式渲染相同的任务。
 *   empty=true 用于页末补齐的空块（§12.A.4）：保留完整骨架（信息行边框 +
 *   四线格线条 + 空 pill 占位 + 主表空白格 + 组词面板空格与虚线），但
 *   **不写 data-char / data-pinyin / data-zuci-multi**，拼音/笔画/词字内容全空
 *   —— btApplyZuciLevel 按 .bt-block 的 data-zuci-multi 取词，属性缺失即
 *   words 为空、天然跳过（不崩溃）；createGridCellSVG 对空 char 不写
 *   data-char（GridEngine 内 "if (char)"），笔顺演示委托与 repaintSheetGrid
 *   均不会把空块当真字处理。
 */
function buildBlock(char, bt, colors, fontFamily, gridType, opts = {}) {
    const asyncFills = opts.asyncFills !== false;
    const empty = opts.empty === true;
    // v3.1.1：每生字行数 —— 控制符（字后数字/回车）最高优先级，其次设置 btMainRows
    const rows = Math.max(1, opts.rowsOverride || bt.rows);
    const block = el('div', 'bt-block');

    // ── 拼音与组词派生数据留在块属性上（定向改写读回，不重查词库）──
    // 空块一律不写属性、不留内容（§12.A.4）
    const py = empty ? '' : resolvePinyin(char);
    const words = empty ? [] : resolveZuciWords(char).slice(0, 2);   // 组词最多 2 个（跟随行数显示，空行补齐）
    if (!empty) {
        block.setAttribute('data-char', char);
        block.setAttribute('data-pinyin', py);
        block.setAttribute('data-zuci-multi', words.join('|'));
    }

    // ── 左列：信息行 + 主表格 ──
    const main = el('div', 'bt-main');

    // 信息行（§2.2）：短四线格拼音 + "N画" pill + 笔画拆解序列
    // 空块：拼音盒只有四线格线条（无文字层）、pill 留空占位、拆解序列留空
    const info = el('div', 'bt-info');
    info.appendChild(buildPinyinBoxSVG(py, colors));
    const pill = el('span', 'bt-pill');
    info.appendChild(pill);
    const strip = el('div', 'bt-stroke-strip');
    info.appendChild(strip);
    // 复用 loadStrokes 异步队列（离线数据，失败静默留空，不阻塞渲染）
    if (asyncFills && !empty) {
        // v3.1.1：data-bt-strip 标记（并行改写期间丢失，补回）——笔画自愈补种与验收 15e-3 依赖
        strip.setAttribute('data-bt-strip', char);
        // v3.1.1（用户反馈：爨/麤等多笔画字拆解条被静默裁切）：
        //   ① 悬停提示 + 指针手型（点击观看动态笔顺演示，转发逻辑在 main.js 委托）；
        //   ② loadStrokes 异步填充完成后做一次自适应归一化（btNormalizeStrokeStrip）：
        //      按笔数均分条带宽度等比缩小（下限 2.5mm，正方形不变形），放不下时截断并
        //      显示 "+N" 徽标（N=未展示笔数），绝不再静默裁切。
        strip.title = '笔画笔顺拆解 · 点击观看动态演示';
        loadStrokes(char, strip);
        fillStrokeCountPill(char, pill);
        if (typeof MutationObserver === 'function') {
            const mo = new MutationObserver(() => {
                if (strip.querySelector('svg')) {
                    mo.disconnect();
                    btNormalizeStrokeStrip(strip);
                }
            });
            mo.observe(strip, { childList: true });
        }
    }
    block.setAttribute('data-bt-rows', String(rows));
    main.appendChild(info);

    // 主表格（§2.3）：行数 = max(btMainRows, 2)，列数 = btCols，固定 cols×rows 格。
    // 格 0 = 范字（btReferenceCell=false 时改描摹）；格 1..btTraceCount = 描摹；
    // 其余 = blank 临写。全部走 createGridCellSVG（userGrid:true）。
    // 空块：全部格子 blank（无范字/描摹字形，仅网格）。
    for (let r = 0; r < rows; r++) {
        const row = el('div', 'bt-row');
        for (let c = 0; c < bt.cols; c++) {
            const gi = r * bt.cols + c;
            let mode = 'blank';
            if (!empty) {
                if (gi === 0) {
                    mode = bt.referenceCell ? 'reference' : 'trace';
                } else if (gi <= bt.traceCount) {
                    mode = 'trace';
                }
            }
            row.appendChild(createGridCellSVG({
                gridType,
                mode,
                char: empty ? '' : char,
                pinyin: py,          // 留 data-py：切拼音田格型时定向重绘可直接读回
                fontFamily,
                traceOpacity: bt.traceOpacity,
                colors,
                userGrid: true       // 格型跟随用户选择（repaintSheetGrid 覆盖的前提）
            }));
        }
        // 行级统一边框（消除竖线粗细不一，复用 GridEngine 产出）
        // v3.1.2：.bt-row 上下紧邻 —— 只让首行画上边、每行画下边，
        //   否则行间边界会叠成 2 条横线（4 单位 = 0.54mm）而竖线只有 2 单位（0.27mm），
        //   视觉上「分隔行的横实线比边框竖线粗一倍」。改后横竖线同为 0.27mm。
        row.appendChild(createRowBorderSVG(bt.cols, colors, { top: r === 0 }));
        main.appendChild(row);
    }
    block.appendChild(main);

    // ── 右列：组词面板（btZuciEnabled 开时；空块传入空词表 → 全空白格） ──
    if (bt.zuciEnabled) {
        block.appendChild(buildZuciPanel(words, bt, colors, fontFamily, gridType, rows));
    }

    return block;
}

// ════════════════════════════════════════════════════════════════
// 显式分页（§12.A，v3.1.1）：每页固定 5 块 + 页末补空块 + 分页守卫
// ════════════════════════════════════════════════════════════════

/**
 * 分页守卫实测（§12.A.2，2026-10-24 增补：每页块数已固定为 5，实测用途由
 * "决定每页块数"改为 **验证性守卫**）。
 *
 * 做法：向 document.body 挂一个临时隐藏测量容器（position:absolute +
 * visibility:hidden + left:-9999px），内部为与正式渲染**完全同构**的
 * .bt-sheet（注入同一组 --bt-* 变量）> .bt-page，放入页头与一个标准块
 * （asyncFills:false，不触发笔画异步队列），getBoundingClientRect 实测：
 *   - 页内容盒高   = .bt-page 盒高 − 上下 padding（屏幕卡片 297mm − 2×10mm = 277mm；
 *                   v3.1.2 打印态为 .bt-page 296mm − 2×10mm = 276mm（@page margin:0），
 *                   守卫按 275mm 预算对两者皆保守）
 *   - 页头足迹     = 页头盒高 + margin-bottom（line-height 定值，不依赖字体度量）
 *   - 标准块足迹   = 块盒高 + margin-bottom（块几何全为 mm 定值，结果确定）
 * 守卫判据：页头足迹 + BT_BLOCKS_PER_PAGE × 块足迹 ≤ 内容盒 − 2mm（275mm）。
 * 按现行契约尺寸估算 ≈ 23 + 5×40 = 223mm，裕量很大；若未来参数变化导致不成立，
 * 调用方按返回的 compactNeeded 给首页追加 .bt-head-compact（CSS 侧进一步压缩
 * 页头间距）并 console.warn 留诊断线索。测完立即移除测量节点（finally 保证）。
 *
 * @returns {{headFootMM:number, blockFootMM:number, contentMM:number,
 *            guardOk:boolean, compactNeeded:boolean, measured:boolean}}
 */
function measurePageCapacity(bt, colors, fontFamily, gridType, sampleChar) {
    // 契约值估算兜底：仅 document.body 不可用/测量抛错等极端防御路径，
    // 正常浏览器路径不会走到（守卫以主路径实测为准）
    const fallback = () => {
        const mainH = BLOCK_TABLE_LAYOUT.infoRowMM + bt.rows * BLOCK_TABLE_LAYOUT.cellSizeMM;
        const zuciH = bt.zuciEnabled
            ? BLOCK_TABLE_LAYOUT.infoRowMM + bt.zuciRows * BLOCK_TABLE_LAYOUT.cellSizeMM
            : 0;
        const blockFoot = Math.max(mainH, zuciH) + BLOCK_TABLE_LAYOUT.blockGapMM;
        // 压缩页头的估算值（仅兜底）：title 22px×1.2 + 3mm + meta 9mm + 4mm ≈ 23mm
        const headFoot = bt.showHeaderMeta ? 23 : 0;
        const guardOk = headFoot + BT_BLOCKS_PER_PAGE * blockFoot
            <= BT_PAGE_CONTENT_MM - BT_PAGE_RESERVE_MM;
        return {
            headFootMM: headFoot, blockFootMM: blockFoot,
            contentMM: BT_PAGE_CONTENT_MM, guardOk, compactNeeded: !guardOk, measured: false
        };
    };
    if (typeof document === 'undefined' || !document.body) return fallback();
    try {
        const probe = el('div', 'bt-sheet');
        injectSheetVars(probe, bt);
        probe.style.position = 'absolute';
        probe.style.left = '-9999px';
        probe.style.top = '0';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';

        const mPage = el('div', 'bt-page');
        let head = null;
        if (bt.showHeaderMeta) {
            head = buildSheetHead(bt, colors);
            mPage.appendChild(head);
        }
        mPage.appendChild(buildBlock(sampleChar, bt, colors, fontFamily, gridType, { asyncFills: false }));
        probe.appendChild(mPage);
        document.body.appendChild(probe);
        try {
            const pcs = getComputedStyle(mPage);
            const contentPx = mPage.getBoundingClientRect().height
                - (parseFloat(pcs.paddingTop) || 0)
                - (parseFloat(pcs.paddingBottom) || 0);
            // 足迹 = 盒高 + margin-bottom（getBoundingClientRect 不含 margin）
            const footPx = (node) => {
                const r = node.getBoundingClientRect();
                const mb = parseFloat(getComputedStyle(node).marginBottom) || 0;
                return r.height + mb;
            };
            const headPx = head ? footPx(head) : 0;
            const blockPx = footPx(mPage.lastChild);
            const headFootMM = headPx / BT_MM_TO_PX;
            const blockFootMM = blockPx / BT_MM_TO_PX;
            const contentMM = contentPx / BT_MM_TO_PX;
            const budgetMM = contentMM - BT_PAGE_RESERVE_MM;
            const needMM = headFootMM + BT_BLOCKS_PER_PAGE * blockFootMM;
            const guardOk = needMM <= budgetMM;
            if (!guardOk) {
                // §12.A.2：守卫不成立必须留诊断线索（勿静默）
                console.warn(
                    `[BlockTableEngine] 分页守卫不成立：页头 ${headFootMM.toFixed(1)}mm + ` +
                    `${BT_BLOCKS_PER_PAGE}×块 ${blockFootMM.toFixed(1)}mm = ${needMM.toFixed(1)}mm ` +
                    `> 预算 ${budgetMM.toFixed(1)}mm —— 首页已加 .bt-head-compact 压缩页头间距`
                );
            }
            return {
                headFootMM, blockFootMM, contentMM,
                guardOk, compactNeeded: !guardOk, measured: true
            };
        } finally {
            // 测完立即移除测量节点（§12.A.2），不留任何调试残留
            document.body.removeChild(probe);
        }
    } catch (e) {
        return fallback();
    }
}

// ════════════════════════════════════════════════════════════════
// 导出 API（签名冻结，Agent-C 依赖）
// ════════════════════════════════════════════════════════════════

/** 向 .bt-sheet（正式渲染容器或测量容器）注入契约几何变量（css 只消费变量） */
function injectSheetVars(sheet, bt) {
    sheet.style.setProperty('--bt-cell', `${BLOCK_TABLE_LAYOUT.cellSizeMM}mm`);
    sheet.style.setProperty('--bt-name-cell', `${BLOCK_TABLE_LAYOUT.nameBoxCellMM}mm`);
    sheet.style.setProperty('--bt-info-h', `${BLOCK_TABLE_LAYOUT.infoRowMM}mm`);
    sheet.style.setProperty('--bt-block-gap', `${BLOCK_TABLE_LAYOUT.blockGapMM}mm`);
    sheet.style.setProperty('--bt-main-zuci-gap', `${BLOCK_TABLE_LAYOUT.mainZuciGapMM}mm`);
    sheet.style.setProperty('--bt-pad', `${BLOCK_TABLE_LAYOUT.sheetPaddingMM}mm`);
    sheet.style.setProperty('--bt-cols', String(bt.cols));
    sheet.style.setProperty('--bt-zcols', String(BLOCK_TABLE_LAYOUT.zuciCols));
}

/**
 * renderBlockSheet —— 生字卡表格版式整页渲染（v3.1.1 显式分页，§12.A）。
 *
 * 结构：.bt-sheet > .bt-page × n。每页固定高度（屏幕 297mm 纸张卡片、打印 277mm
 * 内容区），页间 page-break-after:always（末页 auto，CSS 见 block-table.css），
 * 打印分页完全由显式容器决定，**不依赖浏览器碎片化算法**。
 * 每页块数固定 BT_BLOCKS_PER_PAGE = 5（§12.A.2，2026-10-24 用户指令）：首页
 * （含压缩页头，§12.A.3）与后续页一律 5 块；末页以空块补满到 5（§12.A.4）。
 * 渲染时经 measurePageCapacity 实测页头/块 footprint 做**验证性守卫**，不成立时
 * 首页追加 .bt-head-compact（CSS 进一步压缩页头间距）并 console.warn。
 * 分页元数据（页数/每页块数/实测足迹/守卫结论）以 data-bt-* 属性留在 .bt-sheet
 * 上，供验收关口（verify-block-table 断言组 14）直读。
 *
 * @param {string} input - 生字文本（与 renderSheet 同规则：只保留 [\u4e00-\u9fa5]）
 * @param {Object} [options] - { fontFamily='TW-Kai', gridType='mizi' }；
 *        bt* 参数内部从 getSettings() 读取（BT_DEFAULT_SETTINGS 合并语义见 readBtSettings）
 * @returns {DocumentFragment} 根为 .bt-sheet 的文档片段（尺寸以 --bt-* CSS 变量注入）
 */
export function renderBlockSheet(input = '', options = {}) {
    const fragment = document.createDocumentFragment();

    // v2.4.18 语义沿用：重新生成前清空旧的笔画加载队列，避免旧任务积压
    clearStrokeQueue();

    const { fontFamily = 'TW-Kai', gridType = 'mizi' } = options || {};
    const bt = readBtSettings();
    const colors = getActiveGridColors();
    // v3.1.2：块帖渲染入口同步写全 CSS 变量（见 syncGridColorVars 注释）
    syncGridColorVars(colors);

    // ── v3.1.1 输入解析（含控制符，§12.A.2 三次调整）：──
    //   生字后跟数字（1-9）→ 该字按数字行（至少 1 行）【最高优先级】；
    //   生字后跟回车（CR/LF）→ 该字固定 2 行；
    //   其余生字 → bt.rows（设置"每生字行数"，默认 2）。
    //   数字/回车为块帖专用控制符；经典表格的 CJK 过滤天然忽略它们。
    const entries = parseCharEntries(input);
    if (entries.length === 0) return fragment;

    // ── 纸张容器：契约尺寸以 CSS 变量注入，block-table.css 只消费变量 ──
    const sheet = el('div', 'bt-sheet');
    injectSheetVars(sheet, bt);

    // ── 显式分页（§12.A，v3.1.1 三次调整：按实测块足迹装箱，行数可变）──
    const cap = measurePageCapacity(bt, colors, fontFamily, gridType, entries[0].char);
    const budget = BT_PAGE_CONTENT_MM - BT_PAGE_RESERVE_MM;   // 275mm
    const footOf = (rows, zrows) => blockFootMM(rows, zrows);  // 主表/组词行数独立取大（公式确定性）

    // 贪心装箱：页 1 扣除页头足迹；单块超预算（极端控制符）时独立成页并告警
    const packed = [];
    let cur = [];
    let used = bt.showHeaderMeta ? cap.headFootMM : 0;
    for (const e of entries) {
        const rows = e.rows || bt.rows;
        const zrows = e.rows != null ? rows : bt.zuciRows;   // 控制符覆盖 → 组词行跟随；否则设置值
        const foot = footOf(rows, zrows);
        if (foot > budget - (cur.length === 0 && used > 0 ? used : 0) && cur.length === 0) {
            console.warn('[bt] 单块足迹超页预算：rows=' + rows + ' foot=' + foot.toFixed(1) + 'mm ≥ ' + budget + 'mm');
        }
        if (used + foot > budget && cur.length > 0) {
            packed.push(cur);
            cur = [];
            used = 0;
        }
        cur.push({ char: e.char, rows, zrows, blank: false });
        used += foot;
    }
    if (cur.length > 0) packed.push(cur);

    // 末页空块补满（§12.A.4：默认行数空块，网格满页、内容留空），直到不再容纳
    const last = packed[packed.length - 1];
    let lastUsed = last.reduce((a, e) => a + footOf(e.rows, e.zrows), packed.length === 1 && bt.showHeaderMeta ? cap.headFootMM : 0);
    while (lastUsed + footOf(bt.rows, bt.zuciRows) <= budget) {
        last.push({ char: '', rows: bt.rows, zrows: bt.zuciRows, blank: true });
        lastUsed += footOf(bt.rows, bt.zuciRows);
    }

    const pageCount = packed.length;
    const maxUsed = packed.reduce((mx, pg, i) => {
        const u = pg.reduce((a, e) => a + footOf(e.rows, e.zrows), i === 0 && bt.showHeaderMeta ? cap.headFootMM : 0);
        return Math.max(mx, u);
    }, 0);
    console.log('[bt] 分页参数: chars=', entries.length, 'rows默认=', bt.rows, 'pages=', pageCount, 'maxUsed=', maxUsed.toFixed(1) + 'mm');

    // 分页元数据（验收断言组 14 的判定依据）
    sheet.setAttribute('data-bt-pages', String(pageCount));
    sheet.setAttribute('data-bt-max-used-mm', maxUsed.toFixed(2));
    sheet.setAttribute('data-bt-block-mm', footOf(bt.rows).toFixed(2));
    sheet.setAttribute('data-bt-head-mm', cap.headFootMM.toFixed(2));
    sheet.setAttribute('data-bt-guard-ok', maxUsed <= budget ? '1' : '0');

    packed.forEach((pageBlocks, pi) => {
        const page = el('div', 'bt-page');
        page.setAttribute('data-bt-blocks', String(pageBlocks.length));
        // 页头（标题/日期/年级/姓名栏）仅出现在第 1 页（§12.A.3）；
        // 守卫不成立时首页追加压缩类（CSS 侧进一步收紧页头间距）
        if (pi === 0 && bt.showHeaderMeta) {
            page.appendChild(buildSheetHead(bt, colors));
            if (cap.compactNeeded) page.classList.add('bt-head-compact');
        }
        for (const e of pageBlocks) {
            page.appendChild(buildBlock(e.char, bt, colors, fontFamily, gridType, {
                empty: e.blank,
                rowsOverride: e.rows
            }));
        }
        sheet.appendChild(page);
    });

    fragment.appendChild(sheet);

    // ── v3.1.1 笔画自愈补种（用户反馈：预设切换后偶发无笔画笔顺信息）──
    // 挂载后 3.5s / 7s 两次幂等补种：只补"完全为空"的条与 pill（已有内容的一律不动）。
    scheduleStrokeHeal(sheet);

    return fragment;
}

/**
 * parseCharEntries —— 输入解析为 {char, rows} 序列（v3.1.1 控制符，§12.A.2）。
 *   - 生字后跟数字（1-9）→ rows = 数字（至少 1）【最高优先级】；
 *   - 生字后跟回车（
 或 
）→ rows = 2；
 *   - 其余 → rows = null（渲染时取 bt.rows 设置值）。
 * 数字/回车控制符只作用于块帖；经典表格的 CJK 过滤天然忽略。
 * @param {string} input
 * @returns {{char: string, rows: number|null}[]}
 */
function parseCharEntries(input) {
    const seq = [...String(input || '')];
    const entries = [];
    for (let i = 0; i < seq.length; i++) {
        const ch = seq[i];
        if (!/[一-龥]/.test(ch)) continue;
        let rows = null;
        let j = i + 1;
        if (j < seq.length && /[1-9]/.test(seq[j])) {
            rows = Math.min(5, Math.max(1, parseInt(seq[j], 10)));   // 上限 5 行（用户指令）
            j++;
        }
        if (rows === null && j < seq.length) {
            const nc = seq[j].charCodeAt(0);
            if (nc === 10 || nc === 13) {           // 回车（LF/CR）控制符 → 2 行
                rows = 2;
                j++;
                if (j < seq.length && seq[j].charCodeAt(0) === 10) j++; // CRLF 连写（无尾随文字，避免历史断行）
            }
        }
        entries.push({ char: ch, rows });
        i = j - 1;
    }
    return entries;
}

/**
 * blockFootMM —— 块足迹公式（v3.1.1 行数可变）：信息行 8mm + rows×格 13.5mm + 块距 5mm。
 * 确定性公式替代逐样本实测（信息行/格距均为契约定值，不随字体度量漂移）。
 * @param {number} rows
 */
function blockFootMM(rows, zrows) {
    const r = Math.max(1, rows || 1);
    const z = Math.max(1, zrows || r);
    const mainH = BLOCK_TABLE_LAYOUT.infoRowMM + r * BLOCK_TABLE_LAYOUT.cellSizeMM;
    const zuciH = BLOCK_TABLE_LAYOUT.infoRowMM + z * BLOCK_TABLE_LAYOUT.cellSizeMM;
    return Math.max(mainH, zuciH) + BLOCK_TABLE_LAYOUT.blockGapMM;
}

/**
 * scheduleStrokeHeal —— 块帖笔画信息自愈补种（v3.1.1）。
 * 两轮（+3.5s / +7s）：空拆解条重新入队 loadStrokes、空 pill 重新 fillStrokeCountPill；
 * 幂等（有内容即跳过），不影响正常渲染与分页预算。
 * @param {HTMLElement} sheet - .bt-sheet（挂载后生效）
 */
function scheduleStrokeHeal(sheet) {
    if (typeof setTimeout !== 'function') return;
    const healPass = () => {
        if (!sheet.isConnected) return;
        // 1) 空拆解条补种（仅真块：data-bt-strip 已写、且没有任何子节点）
        sheet.querySelectorAll('.bt-stroke-strip[data-bt-strip]').forEach(strip => {
            if (strip.children.length === 0) {
                loadStrokes(strip.getAttribute('data-bt-strip'), strip);
            }
        });
        // 2) 空 pill 补种（仅真块且 pill 仍无"画"字）
        sheet.querySelectorAll('.bt-block[data-char] .bt-info .bt-pill').forEach(pill => {
            if (!/画$/.test(pill.textContent || '')) {
                fillStrokeCountPill(pill.closest('.bt-block').getAttribute('data-char'), pill);
            }
        });
    };
    let tries = 0;
    const whenMounted = () => {
        tries++;
        if (!sheet.isConnected) {
            if (tries < 40) setTimeout(whenMounted, 250);
            return;
        }
        setTimeout(healPass, 3500);
        setTimeout(healPass, 7000);
    };
    whenMounted();
}

/**
 * btApplyZuciLevel —— 定向改写组词档位（btZuciLevel 设置变更时由 main.js 调用）。
 *
 * 只做三件事，**不重建块、不重查词库**：
 *   1) .bt-zuci 置 data-bt-level；
 *   2) 档位 pill 高亮同步（.bt-active）；
 *   3) 词字 text 节点增删改：hidden → 删除全部词字节点；trace/full → 从所属
 *      .bt-block 的 data-zuci-multi（回退 data-zuci）读词文本重建节点（透明度查
 *      BT_ZUCI_LEVELS 档位表；字体从本块 [data-ge-font="user"] 节点读回，
 *      该属性由 applySheetFont 保持最新）。
 *
 * 空块（§12.A.4 页末补齐块）无 data-zuci-multi → 词文本为空 → 只做档位属性与
 * pill 高亮同步，不创建任何词字节点（天然跳过，不崩溃）。
 *
 * @param {HTMLElement} container - #grid-container
 * @param {string} level - 'hidden' | 'trace' | 'full'
 * @returns {{cells:number}} 处理的 .bt-zuci 数
 */
export function btApplyZuciLevel(container, level) {
    if (!container) return { cells: 0 };
    const lv = BT_ZUCI_LEVELS.find(l => l && l.id === level);
    if (!lv) return { cells: 0 };   // 未知档位不改写（防御）

    const colors = getActiveGridColors();
    const panels = container.querySelectorAll('.bt-zuci');

    panels.forEach(panel => {
        // 1) 档位属性
        panel.setAttribute('data-bt-level', lv.id);

        // 2) 档位 pill 高亮同步
        panel.querySelectorAll('[data-bt-zlevel]').forEach(p => {
            const active = p.getAttribute('data-bt-zlevel') === lv.id;
            p.classList.toggle('bt-active', active);
        });

        // 3) 词字增删改（词文本从块属性读回）
        const block = panel.closest('.bt-block');
        const raw = block
            ? (block.getAttribute('data-zuci-multi') || block.getAttribute('data-zuci') || '')
            : '';
        const words = raw.split('|').map(w => w.trim()).filter(Boolean);
        let ff = '';
        if (block) {
            const glyph = block.querySelector('[data-ge-font="user"]');
            if (glyph) ff = glyph.getAttribute('font-family') || '';
        }
        if (!ff) ff = 'TW-Kai, serif';

        panel.querySelectorAll('.bt-zrow').forEach((zrow, r) => {
            const wcs = Array.from(words[r] || '');
            zrow.querySelectorAll('.bt-zcell').forEach((zcell, c) => {
                // 只摘词字节点，格内虚线定位线原地保留
                zcell.querySelectorAll('[data-ge-role="bt-zuci-word"]').forEach(n => n.remove());
                if (lv.opacity <= 0) return;        // hidden：词字节点不创建
                const ch = wcs[c] || '';
                if (!ch) return;                    // 词短于 4 字 → 余格空白
                // v3.1.1：词字进独立叠加层（基格 svg 已是 createGridCellSVG 产出，不可污染）
                let overlay = zcell.querySelector('.bt-zcell-text');
                if (!overlay) {
                    overlay = svgEl('svg', { viewBox: '0 0 100 100', class: 'bt-zcell-text' });
                    zcell.appendChild(overlay);
                }
                overlay.appendChild(makeZuciWordText(ch, ff, colors, lv.opacity));
            });
        });
    });

    return { cells: panels.length };
}

/**
 * btApplyTraceOpacity —— 定向改写块帖描摹格透明度（btTraceOpacity 变更时由 main.js 调用）。
 *
 * 与经典 applySheetTraceOpacity 同思路，但选择器限定 **.bt-block 范围内** 的
 * [data-ge-trace]：块帖描摹透明度与经典 traceOpacity 相互独立，
 * main.js 会分流调用本函数，经典路径不受影响。词字节点不带 data-ge-trace，
 * 不会被误伤。只改 opacity 属性，不重建任何节点。
 *
 * @param {HTMLElement} container - #grid-container
 * @param {number} opacity - 0~1
 * @returns {{texts:number}} 改动的描摹文字节点数
 */
export function btApplyTraceOpacity(container, opacity) {
    if (!container || opacity == null) return { texts: 0 };
    const v = Number(opacity);
    if (!Number.isFinite(v)) return { texts: 0 };
    const texts = container.querySelectorAll('.bt-block [data-ge-trace]');
    texts.forEach(t => t.setAttribute('opacity', String(v)));
    return { texts: texts.length };
}

/**
 * btNormalizeStrokeStrip —— 拆解条自适应归一化（v3.1.1，多笔画字不裁切）。
 *
 * 触发：loadStrokes 异步填充出第一个 svg 后（MutationObserver 一次性触发）。
 * 规则：
 *   1. n 笔均分条带宽度（含 0.5mm 间距），每笔正方形等比缩放，
 *      尺寸夹取 [2.5mm, 6mm] —— 字号宽高比不失真（与拼音四线格同原则）；
 *   2. 全部缩到下限仍放不下（爨 30 画 / 麤 33 画级别）：截断超出部分
 *      并显示 ".bt-strip-more" 徽标 "+N"（N = 未展示笔数），徽标与拆解条
 *      点击均可打开动态笔顺演示（转发逻辑在 main.js 委托）。
 * 不改变拆解条自身高度（信息行 8mm 冻结），分页预算不受影响。
 * @param {HTMLElement} strip - .bt-stroke-strip（已填充 svg）
 */
function btNormalizeStrokeStrip(strip) {
    if (!strip || !strip.isConnected) return;
    const svgs = strip.querySelectorAll('svg');
    const n = svgs.length;
    if (!n) return;
    const w = strip.clientWidth;
    if (!w) return; // 块仍在隐藏测量容器中（不该发生：填充发生在挂载后），留待下次
    const gap = 0.5 * BT_MM_TO_PX;
    const minPx = 2.5 * BT_MM_TO_PX;
    const maxPx = 6 * BT_MM_TO_PX;
    // v3.1.1（用户反馈：17 画"臂"右侧 ~1/3 空白）—— 精确均分填满算法：
    //   size = w/n − gap（每笔右缘带 0.5mm 间距，含末笔），条带被**恰好填满**，
    //   不再有"临界浮点误入截断分支 → 统一压到下限 → 右侧大片留白"的缺陷。
    //   仅当均分后 size < 2.5mm 下限（笔画极多）才截断：以下限展示前 visible 笔
    //   并预留 "+N" 徽标宽度；少于下限需求的笔画数（≤~13 笔）保持 6mm 上限原尺寸。
    let visible = n;
    let size = w / n - gap;
    if (size >= maxPx) {
        size = maxPx;                       // 少笔画：上限封顶（与经典拆解条观感一致）
    } else if (size >= minPx) {
        // 中等笔画：精确均分填满（不再额外比较，直接取均分值，消除临界误差）
        size = Math.floor(size * 100) / 100; // 0.01px 精度向下取整，保证 n×(size+gap) ≤ w
    } else {
        // 极多笔画：下限展示 + "+N" 徽标（徽标宽度预留后重算可见数）
        size = minPx;
        const moreBadge = 9 * BT_MM_TO_PX;
        visible = Math.max(1, Math.floor((w - moreBadge + gap) / (size + gap)));
    }
    svgs.forEach((svg, i) => {
        svg.style.width = size.toFixed(2) + 'px';
        svg.style.height = size.toFixed(2) + 'px';
        svg.style.display = i < visible ? 'block' : 'none';
    });
    let badge = strip.querySelector('.bt-strip-more');
    if (visible < n) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'bt-strip-more';
            strip.appendChild(badge);
        }
        badge.textContent = '+' + (n - visible);
        badge.title = '还有 ' + (n - visible) + ' 笔未展示 · 点击观看动态笔顺演示';
    } else if (badge) {
        badge.remove();
    }
}

/**
 * btRecolor —— 块帖 bt- 元素颜色定向刷新（v3.1.0 增补，集成审查缺口修补）。
 *
 * 背景：repaintSheetGrid 只覆盖 .grid-svg-cell 内部与 .grid-svg-aux-row /
 * .grid-svg-row-border，不覆盖 bt- 元素 —— gridColorPreset 变化后，块帖信息行
 * 四线格线条、拼音/词字文字色不会立即刷新。本函数补上这块：
 * main.js 在 block-table 模式下于 repaintSheetGrid 之后调用
 * btRecolor(container, colors)，colors 传 getActiveGridColors() 同构对象
 * （C 侧自行取色，或传 null/缺省由本函数用本地取色兜底）。
 *
 * 覆盖范围（.bt-block 与 .bt-sheet-head 内的全部 SVG 内联颜色，共 5 组）：
 *   ① .bt-pinyin-box line            → stroke = colors.secondary（四线格两条细线）
 *   ② [data-ge-role="pinyin"]        → fill   = colors.pinyin（信息行拼音文字；
 *      v3.1.1 线字分离后该节点位于 .bt-pinyin-text 文字层 SVG 内，后代选择器
 *      照常命中，无需感知层级变化）
 *   ③ [data-ge-role="bt-zuci-word"]  → fill   = colors.zuci（组词词字）
 *   ④ 其他 bt- 内联颜色（本实现盘点所得）：
 *        .bt-zcell line              → stroke = colors.dashed（组词格虚线十字）
 *        .bt-name-box rect           → stroke = colors.primary（姓名栏小格外框）
 *
 * 不重建任何节点，只写 stroke/fill 属性。CSS var（--grid-primary-color）驱动的
 * .bt-info/.bt-zhead 边框、档位 pill 高亮等不用管 —— repaintSheetGrid 的
 * syncGridColorVars 已全局更新；pill 底色等固定 CSS 色不随预设变化，同不处理。
 * 主表格格子与行边框的重着色仍由 repaintSheetGrid 负责，本函数不重复。
 *
 * @param {HTMLElement} container - #grid-container
 * @param {Object} [colors] - { primary, secondary, dashed, pinyin, zuci, stroke }；
 *        缺省/残缺字段以本地 getActiveGridColors() 兜底合并
 * @returns {{lines:number, texts:number}} lines=stroke 类属性写入数
 *          （含组词格虚线与姓名栏外框），texts=fill 类属性写入数
 */
export function btRecolor(container, colors) {
    if (!container) return { lines: 0, texts: 0 };
    // 入参缺省/残缺防御：本地取色为底，调用方传入的非空字段覆盖之
    const base = getActiveGridColors();
    const C = (colors && typeof colors === 'object') ? { ...base, ...colors } : base;

    let lines = 0;
    let texts = 0;

    // ① 信息行四线格两条细线（stroke=secondary）
    if (C.secondary) {
        container.querySelectorAll('.bt-pinyin-box line').forEach(l => {
            l.setAttribute('stroke', C.secondary);
            lines++;
        });
    }

    // ② 拼音文字（fill=pinyin；范围限定块帖两容器，绝不误伤经典辅助行的同名节点）
    if (C.pinyin) {
        container.querySelectorAll('.bt-block [data-ge-role="pinyin"], .bt-sheet-head [data-ge-role="pinyin"]').forEach(t => {
            t.setAttribute('fill', C.pinyin);
            texts++;
        });
    }

    // ③ 组词词字（fill=zuci）
    if (C.zuci) {
        container.querySelectorAll('.bt-block [data-ge-role="bt-zuci-word"]').forEach(t => {
            t.setAttribute('fill', C.zuci);
            texts++;
        });
    }

    // ④ 其他 bt- 内联颜色：组词格虚线十字（dashed）+ 姓名栏小格外框（primary）
    if (C.dashed) {
        container.querySelectorAll('.bt-zcell line').forEach(l => {
            l.setAttribute('stroke', C.dashed);
            lines++;
        });
    }
    if (C.primary) {
        container.querySelectorAll('.bt-name-box rect').forEach(r => {
            r.setAttribute('stroke', C.primary);
            lines++;
        });
    }

    return { lines, texts };
}
