/**
 * ════════════════════════════════════════════════════════════════
 * v3.1.0 生字卡表格版式（block-table）契约层
 * ════════════════════════════════════════════════════════════════
 *
 * 独立于 interfaces.js：本文件只承载块帖版式契约，经典版式契约零改动
 * （接口隔离原则 + 最小回退面：删除本文件与消费方接线即完全清除该版式）。
 *
 * 版式（layoutType，页面级组织方式）与格型（gridType，单格线条样式）是
 * 正交维度：
 *   - 版式由 settings.layoutType 决定（'classic' | 'block-table'）；
 *   - 格型仍由 settings.gridType 决定，块帖主表格格子通过
 *     GridEngine.createGridCellSVG({ userGrid: true }) 跟随用户格型选择；
 *   - 因此本文件不做任何格型枚举，格型契约仍在 interfaces.js。
 *
 * 依据：docs/生字卡表格版式_实施方案与智能体提示词_v3.1.0.md §0 §2 §3
 */

/**
 * 字帖版式枚举（页面级组织方式，与格型正交）
 *  - classic     : 经典字帖（每字一行 11 格，GridEngine.renderSheet）
 *  - block-table : 生字卡表格（每字一块：信息行 + 主表格 + 组词面板）
 */
export const LAYOUT_TYPES = [
    { id: 'classic',     label: '经典字帖' },
    { id: 'block-table', label: '生字卡表格' }
];

/**
 * 生字卡表格版式常量（冻结值，实现不得散落魔法数，一律引用此处）
 *
 * 几何预算（A4 纵向 @page margin 10mm，内容区 190×277mm）：
 *   块宽 ≈ 主表 9×13.5(121.5) + gap 6 + 组词 4×13.5(54) = 181.5mm ✓
 *   块高 ≈ info 8 + 主表 2×13.5 + 间距 5 + zhead 8 + 组词 2×13.5 + 块距 5 ≈ 75.5mm → 每页约 3 块
 */
export const BLOCK_TABLE_LAYOUT = {
    cellSizeMM: 13.5,           // 单格边长
    colsOptions: [8, 9, 10, 12],
    colsDefault: 9,             // 主表每行格数
    mainRowsDefault: 2,         // 主表行数（至少 2，与参考样张一致）
    // 每页块数（v3.1.1 用户指令：每页 6 个生字，首页含压缩页头亦 6；页末空网格补满到 6）。
    // 分页预算实测：页头 21.98mm + 6×40.0mm = 261.98mm ≤ 275mm（277 − 2mm 余量）✓
    blocksPerPage: 6,
    traceCountDefault: 3,       // 描摹格数（格 0 为范字，格 1..N 描摹）
    traceOpacityDefault: 0.2,   // 描摹透明度（独立于经典 traceOpacity）
    referenceCellDefault: true, // 格 0 是否为范字（false 时格 0 也按描摹处理）
    infoRowMM: 8,               // 信息行高（拼音四线格 + 笔画数 + 笔画拆解序列）
    zuciCols: 4,                // 组词每行格数（容纳 4 字词）
    zuciRowsDefault: 2,         // 组词行数（= 词数）
    blockGapMM: 5,              // 块间距
    mainZuciGapMM: 6,           // 主表与组词面板水平间距
    sheetPaddingMM: 12,         // 屏幕纸张容器内边距
    nameBoxCellMM: 9,           // 姓名栏小格边长
    /**
     * 组词显示三档（需求 #3 冻结值：透明度即档位）
     *   hidden → 词字节点不创建，打印不出词
     *   trace  → 词字 20% 透明度描摹
     *   full   → 词字 100% 直接填写
     */
    zuciLevels: [
        { id: 'hidden', label: '隐藏', opacity: 0 },
        { id: 'trace',  label: '描摹', opacity: 0.2 },
        { id: 'full',   label: '显示', opacity: 1 }
    ]
};

/** 组词档位速查（渲染与定向改写共用同一份档位表） */
export const BT_ZUCI_LEVELS = BLOCK_TABLE_LAYOUT.zuciLevels;

/**
 * v3.1.0 块帖设置默认值。
 * settingsCenter 以 `{ ...DEFAULT_SETTINGS, ...BT_DEFAULT_SETTINGS }` 方式合并
 * （追加式，settingsCenter 自身不书写这些键的字面量）。
 * 默认 layoutType='classic'：未主动切换的用户行为零变化。
 */
export const BT_DEFAULT_SETTINGS = {
    layoutType: 'classic',      // 'classic' | 'block-table'
    btCols: 9,                  // 主表每行格数（8/9/10/12）
    btMainRows: 2,              // 主表行数（≥2）
    btTraceCount: 3,            // 描摹格数（0-5）
    btTraceOpacity: 0.2,        // 描摹透明度（0.05-0.3）
    btReferenceCell: true,      // 格 0 范字开关
    btZuciEnabled: true,        // 组词面板开关
    btZuciLevel: 'trace',       // 组词档位：'hidden' | 'trace' | 'full'
    btZuciRows: 2,              // 组词词数（1-4）
    btTitle: '练字字帖',         // 页头标题
    btShowHeaderMeta: true      // 页头日期/年级/姓名栏开关
};

/**
 * 版式判定辅助：是否块帖版式（main.js 分发与 UI 显隐共用，避免散落字符串比较）
 * @param {Object} settings - settingsCenter 的设置对象
 * @returns {boolean}
 */
export function isBlockTableLayout(settings) {
    return !!(settings && settings.layoutType === 'block-table');
}
