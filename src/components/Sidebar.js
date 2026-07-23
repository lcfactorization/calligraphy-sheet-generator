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

const SIDEBAR_KEY = 'calligraphy_sidebar_state';

/** 网格类型选项（与 interfaces.js GridType 对齐） */
const GRID_TYPES = [
    { id: 'tian',        label: '田字格' },
    { id: 'mizi',        label: '米字格' },
    { id: 'hui',         label: '回字格' },
    { id: 'pinyin-tian', label: '拼音田' }
];

/** 默认侧栏状态（与 DEFAULT_GRID_CELL_PROPS 对齐） */
const DEFAULT_STATE = {
    gridType: 'tian',
    traceOpacity: 0.25,
    lastTemplateId: null
};

/** 获取侧栏状态（合并默认值，对外导出供 main.js 读取） */
export function getSidebarState() {
    try {
        const raw = localStorage.getItem(SIDEBAR_KEY);
        if (!raw) return { ...DEFAULT_STATE };
        return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_STATE };
    }
}

function saveSidebarState(state) {
    try {
        localStorage.setItem(SIDEBAR_KEY, JSON.stringify(state));
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
            // 持久化 + 派发
            const next = { ...getSidebarState(), gridType: type };
            saveSidebarState(next);
            dispatchUpdate({ gridType: type });
        });
    });
    return section;
}

/** 创建"描红透明度"滑块分节 */
function createOpacitySection(state) {
    const section = document.createElement('div');
    section.className = 'sidebar-section';
    const opacity = (state.traceOpacity != null ? state.traceOpacity : 0.25);

    section.innerHTML = `
        <div class="sidebar-section-title">🖌️ 描红透明度</div>
        <div class="opacity-slider-wrap">
            <input type="range" class="opacity-slider" id="traceOpacitySlider"
                min="0.1" max="0.4" step="0.05" value="${opacity}"
                aria-label="描红透明度">
            <span class="opacity-value" id="traceOpacityValue">${opacity.toFixed(2)}</span>
        </div>
    `;

    const slider = section.querySelector('#traceOpacitySlider');
    const valEl = section.querySelector('#traceOpacityValue');

    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        valEl.textContent = v.toFixed(2);
        const next = { ...getSidebarState(), traceOpacity: v };
        saveSidebarState(next);
        dispatchUpdate({ traceOpacity: v });
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
 *  2. 新增网格类型切换组、描红透明度滑块、预设场景列表
 *  3. 持久化状态到 localStorage
 *  4. 派发 'calligraphy:sidebar-updated' 事件
 *  5. 注册移动端抽屉切换
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

    // 2. 新增"网格类型"切换组
    sidebar.appendChild(createGridTypeSection(state));

    // 3. 新增"描红透明度"滑块
    sidebar.appendChild(createOpacitySection(state));

    // 4. 新增"预设场景"快速选择
    sidebar.appendChild(createPresetSection(state));

    // 5. 注册移动端抽屉切换按钮 + 遮罩
    const [btn, bd] = createDrawerToggle();
    document.body.appendChild(btn);
    document.body.appendChild(bd);

    // 6. 标记就绪（theme.css 可据此做首屏防闪）
    document.body.classList.add('sb-ready');

    // 7. 派发初始事件，通知 GridEngine 用当前 gridType / traceOpacity 渲染
    dispatchUpdate({
        gridType: state.gridType || 'tian',
        traceOpacity: (state.traceOpacity != null ? state.traceOpacity : 0.25)
    });
}

export default { initSidebar, getSidebarState };
