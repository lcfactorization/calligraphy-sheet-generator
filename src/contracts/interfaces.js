/**
 * ════════════════════════════════════════════════════════════════
 * 字帖生成器 — 接口契约层（Master Agent · 阶段 0）
 * ════════════════════════════════════════════════════════════════
 *
 * 本文件定义矢量 SVG 字格引擎、双轨 PDF 导出、东方文房 UI 之间
 * 的标准数据契约。所有跨模块传参必须遵循此处定义的 Props，
 * 以确保多 Agent 并行开发时零冲突集成。
 *
 * 设计原则：
 *  - 纯数据契约，不含运行时逻辑（仅 JSDoc + 默认值）
 *  - 物理单位优先：cellSizeMM 为毫米，渲染层据此换算 mm→px/mm
 *  - 向后兼容：保留对旧版 60px 田字格的回退映射
 */

/**
 * 网格类型枚举
 * @typedef {'tian' | 'mizi' | 'hui' | 'pinyin-tian' | 'jiugong'} GridType
 *  - tian        : 田字格（外框 + 十字虚线）
 *  - mizi        : 米字格（外框 + 十字 + 双对角线虚线）
 *  - hui         : 回字格（外框 + 内框 60%）
 *  - pinyin-tian : 拼音田字格（上 30% 四线三格 + 下 70% 田/米字格）
 *  - jiugong     : 九宫格（外框 + 三等分虚线，3×3 布局）
 */

/**
 * 渲染模式枚举
 * @typedef {'stroke-order' | 'trace' | 'blank'} RenderMode
 *  - stroke-order : 首字笔顺示范（彩色笔画 + 编号）
 *  - trace        : 浅灰描红（透明度 0.1–0.4 可调）
 *  - blank        : 空白自写（仅网格，无范字）
 */

/**
 * 网格单元标准 Props（Agent-A / Agent-B / Agent-C 共同契约）
 * @typedef {Object} GridCellProps
 * @property {GridType}    gridType          - 网格类型，默认 'tian'
 * @property {string}      char              - 目标汉字（单字），空串表示无范字
 * @property {string}      pinyin            - 拼音（带声调符号），空串表示无拼音
 * @property {RenderMode}  mode              - 渲染模式，默认 'trace'
 * @property {string}      primaryColor      - 主色（外框/实线），默认 '#9E2A2B'（印泥红）
 * @property {string}      secondaryColor    - 辅色（虚线/辅助线），默认 '#F0B8B8'（朱砂浅）
 * @property {number}      traceOpacity      - 描红透明度 0.1–0.4，默认 0.25
 * @property {number}      cellSizeMM        - 物理边长（毫米），默认 18
 * @property {string}      fontFamily        - 汉字字体 CSS family，默认 'TW-Kai'
 * @property {string}      pinyinFontFamily  - 拼音字体 CSS family，默认 'TeXGyreAdventor'
 * @property {string[]}    [strokeOrder]     - 笔顺 SVG path 数组（hanzi-writer 提供），可选
 */

/** 默认 GridCellProps（用于 createGridCellSVG 的兜底合并） */
export const DEFAULT_GRID_CELL_PROPS = {
    gridType: 'tian',
    char: '',
    pinyin: '',
    mode: 'trace',
    primaryColor: '#9E2A2B',
    secondaryColor: '#F0B8B8',
    traceOpacity: 0.25,
    cellSizeMM: 18,
    fontFamily: 'TW-Kai',
    pinyinFontFamily: 'TeXGyreAdventor',
    strokeOrder: null
};

/**
 * ════════════════════════════════════════════════════════════════
 * v2.4.1 字帖版式契约 — 绿色网格 + 11 格/行 + 11 行/页
 * ════════════════════════════════════════════════════════════════
 * 依据用户参考 PDF（字帖_2026-07-06.pdf）的版式规范：
 *  - 所有网格线条统一绿色（深绿主色 + 浅绿辅色）
 *  - 每行 11 个格子：左侧 5 米字格 + 右侧 6 田字格
 *  - 每页 11 行（首行上方有辅助行：四线格拼音 + 笔画拆解 SVG）
 */

/** 绿色配色（替代 v2.4.0 朱砂暖宣，回归传统字帖绿） */
export const GRID_COLORS = {
    primary:   '#2E7D32',  // 深绿（外框稍粗实线）
    secondary: '#388E3C',  // 中绿（中线细实线）
    dashed:    '#66BB6A',  // 浅绿（对角线/辅助虚线）
    pinyin:    '#2E7D32',  // 拼音文字色
    zuci:      '#1B5E20',  // 组词文字色（更深以区分）
    stroke:    '#FF5722'   // 当前笔画高亮色（笔顺拆解用）
};

/**
 * v2.5.3：网格颜色预设（供侧栏颜色快切使用）
 * 每个预设包含 5 个色阶：primary/secondary/dashed/pinyin/zuci
 * stroke（笔画高亮色）固定为 #FF5722，不随预设变化
 */
export const GRID_COLOR_PRESETS = [
    {
        id: 'green',
        name: '传统绿',
        colors: { primary: '#2E7D32', secondary: '#388E3C', dashed: '#66BB6A', pinyin: '#2E7D32', zuci: '#1B5E20' }
    },
    {
        id: 'red',
        name: '朱砂红',
        colors: { primary: '#9E2A2B', secondary: '#B14A4B', dashed: '#D97777', pinyin: '#9E2A2B', zuci: '#7A1F20' }
    },
    {
        id: 'blue',
        name: '靛青蓝',
        colors: { primary: '#1565C0', secondary: '#1976D2', dashed: '#64B5F6', pinyin: '#1565C0', zuci: '#0D47A1' }
    },
    {
        id: 'ink',
        name: '墨黑',
        colors: { primary: '#1F2937', secondary: '#374151', dashed: '#9CA3AF', pinyin: '#1F2937', zuci: '#111827' }
    }
];

/** 字帖版式常量
 *  v2.4.3：去掉 rowGapMM，辅助行紧贴字格行，四线格4条线均匀分布
 *  v2.4.7：整体缩放到90%（cellSizeMM 18→16.2, auxRowMM 6→5.4）
 *  每行高度 = 字格16.2mm + 辅助行5.4mm = 21.6mm
 *  11行/页 = 237.6mm，内容区 297-14-8=275mm，余 37.4mm（缓解页眉页脚遮挡）
 */
export const SHEET_LAYOUT = {
    cellsPerRow:  11,                          // 每行 11 格
    miziCount:    5,                            // 左侧 5 米字格
    tianCount:    6,                            // 右侧 6 田字格
    rowsPerPage:  11,                           // 每页 11 行
    scale:        0.9,                          // v2.4.7：缩放比例（90%）
    cellSizeMM:   16.2,                         // v2.4.7：单格 16.2mm（原18mm×0.9）
    auxRowMM:     5.4,                          // v2.4.7：辅助行高度 5.4mm（原6mm×0.9）
    rowGapMM:     0,                            // v2.4.3：去掉间距，四线格4条线均匀分布
    pageGapMM:    0,                            // 行与行之间间距（已含在行高内）
    /** 米字格内字色分布：[0]=范字黑色, [1,2]=描红0.1, [3,4]=空白 */
    miziModes:    ['reference', 'trace', 'trace', 'blank', 'blank'],
    /** 田字格内布局（v2.4.3）：
     *  [0]=词1完整(拼音+字) [1]=词1字1描红0.1 [2]=词1字2描红0.1
     *  [3]=词2完整(拼音+字) [4]=词2字1描红0.1 [5]=词2字2描红0.1 */
    tianModes:    ['word-full', 'word-trace-1', 'word-trace-2', 'word-full', 'word-trace-1', 'word-trace-2']
};

/** 单格物理宽度（11 格 × 18mm = 198mm，A4 纵向可用宽度 210 - 6×2 = 198mm，正好） */
export const A4_SHEET_LAYOUT = {
    widthMM:    210,
    heightMM:   297,
    paddingMM:  6,                              // 左右边距 6mm，容纳 11 × 18mm
    paddingTopMM: 8,                            // 顶部边距 8mm
    paddingBottomMM: 8                          // 底部边距 8mm
};

/** A4 纵向 11 行版式：每页可用高度 = 297 - 8 - 8 = 281mm，11行×(18+8+1+2)=319mm 不够
 *  调整：每行高度 = 18mm字格 + 8mm辅助行 + 1mm间距 = 27mm，11行 = 297mm 超出
 *  实际方案：每页 9 行（9×27=243mm + 8mm顶部 + 8mm底部 = 259mm 合理）
 *  但用户明确要求 11 行/页 → 需减小辅助行高度
 *  最终：辅助行 6mm + 字格 18mm + 间距 1mm = 25mm/行，11行=275mm + 边距16=291mm ✓
 */

/** 合并用户 Props 与默认值（浅合并） */
export function resolveGridProps(partial) {
    return { ...DEFAULT_GRID_CELL_PROPS, ...(partial || {}) };
}

/**
 * mm → px 换算（96 DPI 标准：1mm = 96/25.4 px ≈ 3.7795275591 px）
 * 用于屏幕预览；打印/PDF 直接使用 mm 单位。
 */
export const MM_TO_PX = 96 / 25.4;

/** 物理尺寸常量（A4 纵向） */
export const A4_PORTRAIT = {
    widthMM: 210,
    heightMM: 297,
    paddingMM: 12
};

/** 有效排版区域 = 210 - 12*2 = 186mm；18mm 格子最多 10 列（180mm） */
export const MAX_COLS_A4_18MM = Math.floor((A4_PORTRAIT.widthMM - A4_PORTRAIT.paddingMM * 2) / 18);

/**
 * 双轨 PDF 导出契约（Agent-B）
 * @typedef {'client-print' | 'client-jspdf' | 'server-puppeteer'} PdfTrack
 */

/**
 * @typedef {Object} PdfExportOptions
 * @property {PdfTrack}  track         - 导出轨道
 * @property {string}    format        - 'a4' | 'a3' | 'a5' | 'letter'
 * @property {boolean}   landscape     - 横向
 * @property {string}    headerLeft    - 页眉左
 * @property {string}    headerCenter  - 页眉中
 * @property {string}    headerRight   - 页眉右
 * @property {string}    footerText    - 页脚
 * @property {number}    cellSizeMM    - 格子边长 mm
 * @property {GridType}  gridType      - 网格类型
 */
