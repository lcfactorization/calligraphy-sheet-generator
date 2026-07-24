/**
 * ════════════════════════════════════════════════════════════════
 * 字帖生成器 — 左侧栏组件（Agent-C · v2.4.0 朱砂暖宣双栏工作台）
 * ════════════════════════════════════════════════════════════════
 *
 * 职责：
 *  1. 把现有 #input-container 与页眉页脚 .panel 运行时移入 #appSidebar
 *     （保留所有元素 ID，不破坏 main.js 既有事件绑定）
 *  2. 新增"网格类型"切换组（田/米/回/拼音田字格）
 *  3. 新增"描红透明度"滑块（0.1–0.4，契约默认 0.25）
 *  4. 新增"预设场景"快速选择（从 templates.js 读取）
 *  5. 状态持久化到 localStorage（key: calligraphy_sidebar_state）
 *  6. 派发自定义事件 'calligraphy:sidebar-updated'，供 main.js / GridEngine 消费
 *  7. 移动端（<768px）侧栏改为可折叠抽屉
 *
 * 对接契约：src/contracts/interfaces.js
 *  - GridType: 'tian' | 'mizi' | 'hui' | 'pinyin-tian'
 *  - RenderMode.trace 的 traceOpacity: 0.1–0.4，默认 0.25
 *  - DEFAULT_GRID_CELL_PROPS.primaryColor = '#9E2A2B'（印泥红）
 */

import { templates } from '../data/templates.js';
// v2.4.7：网格类型/描红透明度统一由 settingsCenter 管理，确保侧栏与设置中心改同一全局变量
import { getSettings, updateSetting } from '../modules/settingsCenter.js';
// v2.5.3：颜色预设（与 interfaces.js 同步）
import { GRID_COLOR_PRESETS } from '../contracts/interfaces.js';

const SIDEBAR_KEY = 'calligraphy_sidebar_state';

/** 网格类型选项（与 interfaces.js GridType 对齐）
 *  v2.5.3：新增九宫格（jiugong） */
const GRID_TYPES = [
    { id: 'tian',        label: '田字格' },
    { id: 'mizi',        label: '米字格' },
    { id: 'jiugong',     label: '九宫格' },
    { id: 'hui',         label: '回字格' },
    { id: 'pinyin-tian', label: '拼音田' }
];

/** 默认侧栏状态（v2.4.4：默认米字格，描红透明度默认 0.1） */
const DEFAULT_STATE = {
    gridType: 'mizi',
    traceOpacity: 0.1,
    lastTemplateId: null
};

/**
 * 获取侧栏状态（合并默认值，对外导出供 main.js 读取）
 * v2.4.7：gridType 和 traceOpacity 从 settingsCenter 读取（单一数据源），
 *         lastTemplateId 保留在侧栏自有 localStorage
 */
export function getSidebarState() {
    const settings = getSettings();
    let lastTemplateId = null;
    try {
        const raw = localStorage.getItem(SIDEBAR_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            lastTemplateId = parsed.lastTemplateId || null;
        }
    } catch { /* 静默降级 */ }
    return {
        gridType: settings.gridType || DEFAULT_STATE.gridType,
        traceOpacity: settings.traceOpacity != null ? settings.traceOpacity : DEFAULT_STATE.traceOpacity,
        // v2.5.3：网格颜色预设
        gridColorPreset: settings.gridColorPreset || 'green',
        lastTemplateId
    };
}

/**
 * v2.4.7：保存侧栏状态 — gridType/traceOpacity 委托给 settingsCenter，
 *         lastTemplateId 保留在侧栏 localStorage
 */
function saveSidebarState(state) {
    try {
        // gridType 和 traceOpacity 写入 settingsCenter（单一数据源）
        if (state.gridType != null) updateSetting('gridType', state.gridType);
        if (state.traceOpacity != null) updateSetting('traceOpacity', state.traceOpacity);
        // lastTemplateId 保留在侧栏
        if (state.lastTemplateId != null) {
            const raw = localStorage.getItem(SIDEBAR_KEY);
            const existing = raw ? JSON.parse(raw) : {};
            existing.lastTemplateId = state.lastTemplateId;
            localStorage.setItem(SIDEBAR_KEY, JSON.stringify(existing));
        }
    } catch { /* 容量满或隐私模式，静默降级 */ }
}

/** 派发侧栏更新事件，通知 main.js / GridEngine 重渲染 */
function dispatchUpdate(detail) {
    document.dispatchEvent(new CustomEvent('calligraphy:sidebar-updated', { detail }));
}

/* ────────────────────────────────────────────────
 * 分节构建器
 * ──────────────────────────────────────────────── */

/** 创建"网格类型"切换分节 */
function createGridTypeSection(state) {
    const section = document.createElement('div');
    section.className = 'sidebar-section';
    const activeType = state.gridType || 'tian';

    section.innerHTML = `
        <div class="sidebar-section-title">📐 网格类型</div>
        <div class="grid-type-group" role="group" aria-label="网格类型切换">
            ${GRID_TYPES.map(t => `
                <button type="button"
                    class="grid-type-btn ${t.id === activeType ? 'active' : ''}"
                    data-grid-type="${t.id}"
                    aria-pressed="${t.id === activeType}">${t.label}</button>
            `).join('')}
        </div>
    `;

    section.querySelectorAll('.grid-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.gridType;
            // 切换 active 高亮
            section.querySelectorAll('.grid-type-btn').forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-pressed', isActive);
            });
            // v2.4.7：saveSidebarState 委托给 settingsCenter，会自动派发 'calligraphy:settings-updated'
            // 无需再手动 dispatchUpdate（避免双重渲染）
            const next = { ...getSidebarState(), gridType: type };
            saveSidebarState(next);
        });
    });
    return section;
}

/** 创建"描红透明度"滑块分节 */
function createOpacitySection(state) {
    const section = document.createElement('div');
    section.className = 'sidebar-section';
    const opacity = (state.traceOpacity != null ? state.traceOpacity : 0.1);

    section.innerHTML = `
        <div class="sidebar-section-title">🖌️ 描红透明度</div>
        <div class="opacity-slider-wrap">
            <input type="range" class="opacity-slider" id="traceOpacitySlider"
                min="0.05" max="0.3" step="0.05" value="${opacity}"
                aria-label="描红透明度">
            <span class="opacity-value" id="traceOpacityValue">${opacity.toFixed(2)}</span>
        </div>
    `;

    const slider = section.querySelector('#traceOpacitySlider');
    const valEl = section.querySelector('#traceOpacityValue');

    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        valEl.textContent = v.toFixed(2);
        // v2.4.7：saveSidebarState 委托给 settingsCenter，会自动派发 'calligraphy:settings-updated'
        const next = { ...getSidebarState(), traceOpacity: v };
        saveSidebarState(next);
    });

    return section;
}

/**
 * v2.5.3 新增：创建"线框颜色"快切分节
 * 性能影响：仅 4 个色块按钮，点击后通过 settingsCenter 触发重渲染，开销 < 1ms
 * 视觉上每个色块显示预设的 primary 色，hover 显示名称，点击切换并高亮
 */
function createColorPresetSection(state) {
    const section = document.createElement('div');
    section.className = 'sidebar-section';
    const activePreset = state.gridColorPreset || 'green';

    section.innerHTML = `
        <div class="sidebar-section-title">🎨 线框颜色</div>
        <div class="color-preset-group" role="group" aria-label="网格颜色切换">
            ${GRID_COLOR_PRESETS.map(p => `
                <button type="button"
                    class="color-preset-btn ${p.id === activePreset ? 'active' : ''}"
                    data-color-preset="${p.id}"
                    title="${p.name}"
                    aria-pressed="${p.id === activePreset}"
                    style="--swatch-color: ${p.colors.primary};">
                    <span class="color-swatch"></span>
                </button>
            `).join('')}
        </div>
    `;

    section.querySelectorAll('.color-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetId = btn.dataset.colorPreset;
            // 切换 active 高亮
            section.querySelectorAll('.color-preset-btn').forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-pressed', isActive);
            });
            // v2.5.3：写入 settingsCenter.gridColorPreset，触发 'calligraphy:settings-updated'
            // main.js 监听该事件并调用 handleGenerate() 重渲染
            updateSetting('gridColorPreset', presetId);
        });
    });
    return section;
}

/** 创建"预设场景"快速选择分节（按 category 分组） */
function createPresetSection(state) {
    const section = document.createElement('div');
    section.className = 'sidebar-section';
    section.innerHTML = `<div class="sidebar-section-title">📚 预设场景</div>`;

    const list = document.createElement('ul');
    list.className = 'preset-list';

    // 按 category 分组，保持 templates.js 顺序
    const grouped = {};
    const order = [];
    templates.forEach(t => {
        if (!grouped[t.category]) {
            grouped[t.category] = [];
            order.push(t.category);
        }
        grouped[t.category].push(t);
    });

    order.forEach(cat => {
        const label = document.createElement('li');
        label.className = 'preset-group-label';
        label.textContent = cat;
        list.appendChild(label);

        grouped[cat].forEach(t => {
            const li = document.createElement('li');
            li.className = 'preset-item';
            li.dataset.templateId = t.id;
            li.title = t.description || '';
            if (state.lastTemplateId === t.id) {
                li.style.background = 'rgba(158, 42, 43, 0.08)';
            }
            li.innerHTML = `
                <span class="preset-name">${t.name}</span>
                <span class="preset-meta">${t.charCount}字</span>
            `;
            li.addEventListener('click', () => applyTemplate(t));
            list.appendChild(li);
        });
    });

    section.appendChild(list);
    return section;
}

/** 应用模板：填入 inputText 并触发生成（复用既有 generate-btn 事件） */
function applyTemplate(tpl) {
    const ta = document.getElementById('inputText');
    if (!ta) return;
    ta.value = tpl.text;
    // 触发 input 事件以更新字数计数器 / 难度评估
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // 同步页眉中心为模板名（若用户未自定义）
    const hc = document.getElementById('headerCenter');
    if (hc && hc.value === '练习字帖') {
        hc.value = tpl.name;
        hc.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // 点击生成按钮（保留 main.js 的生成逻辑）
    const genBtn = document.getElementById('generate-btn');
    if (genBtn) genBtn.click();

    // 持久化 + 派发
    const next = { ...getSidebarState(), lastTemplateId: tpl.id };
    saveSidebarState(next);
    dispatchUpdate({ template: tpl });

    // 移动端：应用后关闭抽屉
    if (window.matchMedia('(max-width: 768px)').matches) {
        closeDrawer();
    }
}

/* ────────────────────────────────────────────────
 * 移动端抽屉控制
 * ──────────────────────────────────────────────── */

let drawerBtn = null;
let backdrop = null;

function openDrawer() {
    const sb = document.getElementById('appSidebar');
    if (!sb) return;
    sb.classList.add('open');
    if (backdrop) backdrop.classList.add('show');
    if (drawerBtn) {
        drawerBtn.textContent = '✕';
        drawerBtn.setAttribute('aria-label', '关闭侧栏');
        drawerBtn.title = '关闭侧栏';
    }
}

function closeDrawer() {
    const sb = document.getElementById('appSidebar');
    if (!sb) return;
    sb.classList.remove('open');
    if (backdrop) backdrop.classList.remove('show');
    if (drawerBtn) {
        drawerBtn.textContent = '☰';
        drawerBtn.setAttribute('aria-label', '打开侧栏');
        drawerBtn.title = '打开侧栏';
    }
}

function createDrawerToggle() {
    drawerBtn = document.createElement('button');
    drawerBtn.className = 'sidebar-drawer-toggle';
    drawerBtn.type = 'button';
    drawerBtn.setAttribute('aria-label', '打开侧栏');
    drawerBtn.title = '打开侧栏';
    drawerBtn.textContent = '☰';
    drawerBtn.addEventListener('click', () => {
        const sb = document.getElementById('appSidebar');
        if (!sb) return;
        if (sb.classList.contains('open')) {
            closeDrawer();
        } else {
            openDrawer();
        }
    });

    // 抽屉遮罩（点击空白关闭）
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.addEventListener('click', closeDrawer);

    return [drawerBtn, backdrop];
}

/* ────────────────────────────────────────────────
 * 初始化入口
 * ──────────────────────────────────────────────── */

/**
 * 初始化侧栏
 *  1. 把现有 #input-container 和页眉页脚 .panel 移入 #appSidebar
 *  2. v2.4.4：网格类型+描红透明度插入 #input-container 内（紧挨智能推荐按钮）
 *  3. 预设场景列表留在侧栏底部
 *  4. 持久化状态到 localStorage
 *  5. 派发 'calligraphy:sidebar-updated' 事件
 *  6. 注册移动端抽屉切换
 */
export function initSidebar() {
    const sidebar = document.getElementById('appSidebar');
    if (!sidebar) return;
    // 幂等保护：避免重复挂载
    if (sidebar.dataset.mounted === '1') return;
    sidebar.dataset.mounted = '1';

    const state = getSidebarState();

    // 1. 把 .app 下直接子级 .panel（含 #input-container）移入侧栏
    //    保留所有元素 ID，DOM 节点移动不会丢失事件监听
    const panelsToMove = document.querySelectorAll('.app > .panel');
    panelsToMove.forEach(p => {
        if (p.parentElement !== sidebar) {
            sidebar.appendChild(p);
        }
    });

    // 2. v2.4.4：把"网格类型"和"描红透明度"插入 #input-container 内
    //    紧挨着智能推荐按钮（位于清除按钮行与生成按钮之间）
    //    v2.5.3：追加"线框颜色"快切分节
    const inputContainer = document.getElementById('input-container');
    if (inputContainer) {
        const generateBtn = document.getElementById('generate-btn');
        const insertBefore = generateBtn ? generateBtn.closest('.field-row') : null;
        const gridSection = createGridTypeSection(state);
        const opacitySection = createOpacitySection(state);
        const colorSection = createColorPresetSection(state);  // v2.5.3
        if (insertBefore) {
            inputContainer.insertBefore(gridSection, insertBefore);
            inputContainer.insertBefore(opacitySection, insertBefore);
            inputContainer.insertBefore(colorSection, insertBefore);
        } else {
            inputContainer.appendChild(gridSection);
            inputContainer.appendChild(opacitySection);
            inputContainer.appendChild(colorSection);
        }
    } else {
        // 回退：直接追加到侧栏
        sidebar.appendChild(createGridTypeSection(state));
        sidebar.appendChild(createOpacitySection(state));
        sidebar.appendChild(createColorPresetSection(state));
    }

    // 3. 新增"预设场景"快速选择（留在侧栏底部）
    sidebar.appendChild(createPresetSection(state));

    // 4. 注册移动端抽屉切换按钮 + 遮罩
    const [btn, bd] = createDrawerToggle();
    document.body.appendChild(btn);
    document.body.appendChild(bd);

    // 5. 标记就绪（theme.css 可据此做首屏防闪）
    document.body.classList.add('sb-ready');

    // 6. v2.4.7：监听设置中心变化，同步侧栏 UI（网格类型按钮高亮 / 透明度滑块值）
    //    确保设置中心和侧栏同名控件保持一致
    //    v2.5.3：追加颜色快切按钮高亮同步
    document.addEventListener('calligraphy:settings-updated', (e) => {
        const s = e.detail || {};
        // 同步网格类型按钮高亮
        if (s.gridType) {
            document.querySelectorAll('.grid-type-btn').forEach(b => {
                const isActive = b.dataset.gridType === s.gridType;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-pressed', isActive);
            });
        }
        // 同步描红透明度滑块
        if (s.traceOpacity != null) {
            const slider = document.getElementById('traceOpacitySlider');
            const valEl = document.getElementById('traceOpacityValue');
            if (slider) slider.value = s.traceOpacity;
            if (valEl) valEl.textContent = parseFloat(s.traceOpacity).toFixed(2);
        }
        // v2.5.3：同步颜色快切按钮高亮
        if (s.gridColorPreset) {
            document.querySelectorAll('.color-preset-btn').forEach(b => {
                const isActive = b.dataset.colorPreset === s.gridColorPreset;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-pressed', isActive);
            });
        }
    });
}

export default { initSidebar, getSidebarState };
