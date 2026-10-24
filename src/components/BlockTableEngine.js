/**
 * ════════════════════════════════════════════════════════════════
 * 生字卡表格版式渲染引擎 v3.1.0（block-table）
 * ════════════════════════════════════════════════════════════════
 *
 * 依据：docs/生字卡表格版式_实施方案与智能体提示词_v3.1.0.md §2（渲染规格，冻结设计）
 * 契约：src/contracts/blockTable.js（BLOCK_TABLE_LAYOUT / BT_DEFAULT_SETTINGS / BT_ZUCI_LEVELS，
 *       所有尺寸/档位数值一律引用契约，本文件不写魔法数）
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
        // 列数夹取到契约可选档位范围（8~12）；行数下限 2（§2.3"至少 2 行"），
        // 上限 50 仅为防御脏数据（契约未定义上限）
        cols: clampInt(s.btCols, BLOCK_TABLE_LAYOUT.colsDefault, minCols, maxCols),
        rows: clampInt(s.btMainRows, BLOCK_TABLE_LAYOUT.mainRowsDefault, 2, 50),
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
 * 短四线格拼音 SVG（§2.2）。
 * viewBox 0 0 100 30 + preserveAspectRatio none，与 GridEngine.createAuxRow
 * 的四线格同构：只画中间两条细线（y=10/y=20），上下两条线由信息行边框提供；
 * 文字节点同 makePinyinText 约定：TeXGyreAdventor + data-ge-role="pinyin"
 * （repaintSheetGrid 的拼音着色查询可直接命中）。
 */
function buildPinyinBoxSVG(py, colors) {
    const box = el('div', 'bt-pinyin-box');
    const svg = svgEl('svg', {
        viewBox: '0 0 100 30',
        preserveAspectRatio: 'none'
    });
    // 中间两条细线（stroke-width 0.8，同 createAuxRow）
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 10, x2: 100, y2: 10,
        stroke: colors.secondary, 'stroke-width': 0.8
    }));
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 20, x2: 100, y2: 20,
        stroke: colors.secondary, 'stroke-width': 0.8
    }));
    if (py) {
        const text = svgEl('text', {
            x: 50, y: 15,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': PINYIN_FONT_FAMILY,
            'font-size': 16,
            fill: colors.pinyin,
            'data-ge-role': 'pinyin'
        });
        text.textContent = py;
        svg.appendChild(text);
    }
    box.appendChild(svg);
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
 * 组词格小 SVG：虚线十字定位线（组词面板固定样式，参照样张，不随 gridType 变化）
 * + 可选词字。类名纪律：容器是 .bt-zcell（div），**不是** .grid-svg-cell。
 */
function buildZuciCellSVG(ch, fontFamily, colors, opacity) {
    const svg = svgEl('svg', { viewBox: '0 0 100 100' });
    svg.appendChild(svgEl('line', {
        x1: 0, y1: 50, x2: 100, y2: 50,
        stroke: colors.dashed, 'stroke-width': 0.5, 'stroke-dasharray': '6,4'
    }));
    svg.appendChild(svgEl('line', {
        x1: 50, y1: 0, x2: 50, y2: 100,
        stroke: colors.dashed, 'stroke-width': 0.5, 'stroke-dasharray': '6,4'
    }));
    // hidden 档（opacity 0）词字节点不创建，词文本只留在 data-zuci-multi 属性里
    if (ch && opacity > 0) {
        svg.appendChild(makeZuciWordText(ch, fontFamily, colors, opacity));
    }
    return svg;
}

/**
 * 组词面板（§2.4）：.bt-zhead（"组词" pill + 三档位 pill，当前档高亮）
 * + .bt-zrow × btZuciRows，每行 4 格（词字占前 N 格，N=词长 2–4，余格空白）。
 */
function buildZuciPanel(words, bt, colors, fontFamily) {
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
    for (let r = 0; r < bt.zuciRows; r++) {
        const zrow = el('div', 'bt-zrow');
        const wcs = Array.from(words[r] || '').slice(0, BLOCK_TABLE_LAYOUT.zuciCols);
        for (let c = 0; c < BLOCK_TABLE_LAYOUT.zuciCols; c++) {
            const zcell = el('div', 'bt-zcell');
            zcell.appendChild(buildZuciCellSVG(wcs[c] || '', fontFamily, colors, opacity));
            zrow.appendChild(zcell);
        }
        // 行级统一边框复用 createRowBorderSVG（.grid-svg-row-border 类被
        // repaintSheetGrid 的重着色查询覆盖，颜色预设切换自动生效）
        zrow.appendChild(createRowBorderSVG(BLOCK_TABLE_LAYOUT.zuciCols, colors));
        panel.appendChild(zrow);
    }
    return panel;
}

/**
 * 单字一块（§2.1）：信息行 + 主表格（左列）与 组词面板（右列）。
 * 信息行置于 .bt-main 首位：其 border-bottom:none 与主表格首行外框相接（§2.2），
 * 与参考样张 DOM 同构（样张 .main 内含 info）。
 */
function buildBlock(char, bt, colors, fontFamily, gridType) {
    const block = el('div', 'bt-block');
    block.setAttribute('data-char', char);

    // ── 拼音与组词派生数据留在块属性上（定向改写读回，不重查词库） ──
    const py = resolvePinyin(char);
    block.setAttribute('data-pinyin', py);
    const words = resolveZuciWords(char).slice(0, bt.zuciRows);
    block.setAttribute('data-zuci-multi', words.join('|'));

    // ── 左列：信息行 + 主表格 ──
    const main = el('div', 'bt-main');

    // 信息行（§2.2）：短四线格拼音 + "N画" pill + 笔画拆解序列
    const info = el('div', 'bt-info');
    info.appendChild(buildPinyinBoxSVG(py, colors));
    const pill = el('span', 'bt-pill');
    info.appendChild(pill);
    const strip = el('div', 'bt-stroke-strip');
    info.appendChild(strip);
    // 复用 loadStrokes 异步队列（离线数据，失败静默留空，不阻塞渲染）
    loadStrokes(char, strip);
    fillStrokeCountPill(char, pill);
    main.appendChild(info);

    // 主表格（§2.3）：行数 = max(btMainRows, 2)，列数 = btCols，固定 cols×rows 格。
    // 格 0 = 范字（btReferenceCell=false 时改描摹）；格 1..btTraceCount = 描摹；
    // 其余 = blank 临写。全部走 createGridCellSVG（userGrid:true）。
    for (let r = 0; r < bt.rows; r++) {
        const row = el('div', 'bt-row');
        for (let c = 0; c < bt.cols; c++) {
            const gi = r * bt.cols + c;
            let mode = 'blank';
            if (gi === 0) {
                mode = bt.referenceCell ? 'reference' : 'trace';
            } else if (gi <= bt.traceCount) {
                mode = 'trace';
            }
            row.appendChild(createGridCellSVG({
                gridType,
                mode,
                char,
                pinyin: py,          // 留 data-py：切拼音田格型时定向重绘可直接读回
                fontFamily,
                traceOpacity: bt.traceOpacity,
                colors,
                userGrid: true       // 格型跟随用户选择（repaintSheetGrid 覆盖的前提）
            }));
        }
        // 行级统一边框（消除竖线粗细不一，复用 GridEngine 产出）
        row.appendChild(createRowBorderSVG(bt.cols, colors));
        main.appendChild(row);
    }
    block.appendChild(main);

    // ── 右列：组词面板（btZuciEnabled 开时） ──
    if (bt.zuciEnabled) {
        block.appendChild(buildZuciPanel(words, bt, colors, fontFamily));
    }

    return block;
}

// ════════════════════════════════════════════════════════════════
// 导出 API（签名冻结，Agent-C 依赖）
// ════════════════════════════════════════════════════════════════

/**
 * renderBlockSheet —— 生字卡表格版式整页渲染。
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

    // 输入过滤与 renderSheet 同规则：仅保留汉字，过滤标点/字母/数字/空白
    const chars = String(input).match(/[\u4e00-\u9fa5]/g) || [];
    if (chars.length === 0) return fragment;

    // ── 纸张容器：契约尺寸以 CSS 变量注入，block-table.css 只消费变量 ──
    const sheet = el('div', 'bt-sheet');
    sheet.style.setProperty('--bt-cell', `${BLOCK_TABLE_LAYOUT.cellSizeMM}mm`);
    sheet.style.setProperty('--bt-name-cell', `${BLOCK_TABLE_LAYOUT.nameBoxCellMM}mm`);
    sheet.style.setProperty('--bt-info-h', `${BLOCK_TABLE_LAYOUT.infoRowMM}mm`);
    sheet.style.setProperty('--bt-block-gap', `${BLOCK_TABLE_LAYOUT.blockGapMM}mm`);
    sheet.style.setProperty('--bt-main-zuci-gap', `${BLOCK_TABLE_LAYOUT.mainZuciGapMM}mm`);
    sheet.style.setProperty('--bt-pad', `${BLOCK_TABLE_LAYOUT.sheetPaddingMM}mm`);
    sheet.style.setProperty('--bt-cols', String(bt.cols));
    sheet.style.setProperty('--bt-zcols', String(BLOCK_TABLE_LAYOUT.zuciCols));

    if (bt.showHeaderMeta) {
        sheet.appendChild(buildSheetHead(bt, colors));
    }

    const blocks = el('div', 'bt-blocks');
    chars.forEach(char => {
        blocks.appendChild(buildBlock(char, bt, colors, fontFamily, gridType));
    });
    sheet.appendChild(blocks);

    fragment.appendChild(sheet);
    return fragment;
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
                const svg = zcell.querySelector('svg');
                if (svg) svg.appendChild(makeZuciWordText(ch, ff, colors, lv.opacity));
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
 *   ② [data-ge-role="pinyin"]        → fill   = colors.pinyin（信息行拼音文字）
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
