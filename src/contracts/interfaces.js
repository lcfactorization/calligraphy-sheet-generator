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
 * @typedef {'tian' | 'mizi' | 'hui' | 'pinyin-tian'} GridType
 *  - tian        : 田字格（外框 + 十字虚线）
 *  - mizi        : 米字格（外框 + 十字 + 双对角线虚线）
 *  - hui         : 回字格（外框 + 内框 60%）
 *  - pinyin-tian : 拼音田字格（上 30% 四线三格 + 下 70% 田/米字格）
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
