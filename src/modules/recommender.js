/**
 * AI 智能推荐模块（规则版，离线可用）
 *
 * 数据来源（只读，不修改）：
 *  - vocabulary.js：分级字库（按难度/主题分类的汉字）
 *  - templates.js：预设模板（按场景分类的整段文本）
 *
 * 提供三个推荐维度：
 *  - 按难度：初级 / 中级 / 高级
 *  - 按主题：动物 / 植物 / 数字 / 颜色 / 自然 等（跨难度聚合）
 *  - 按场景：唐诗宋词 / 三字经 / 节日 等（来自 templates）
 *
 * 交互规则：
 *  - 单字点击 → 追加到输入框尾部（不覆盖原内容）
 *  - 模板点击 → 覆盖输入框内容（模板通常较长）
 *  - 关闭：点击遮罩 / 关闭按钮 / 按 Esc
 */

import { vocabulary } from '../data/vocabulary.js';
import templates from '../data/templates.js';

// ── 难度级别配置 ──
const DIFFICULTY_LEVELS = [
  { key: 'beginner',     label: '初级', desc: '1-5 画' },
  { key: 'intermediate', label: '中级', desc: '6-10 画' },
  { key: 'advanced',     label: '高级', desc: '10+ 画' }
];

// ── 主题分类中文映射（vocabulary.js 的 key → 中文标签）──
const THEME_LABELS = {
  numbers:    '数字',
  nature:     '自然',
  animals:    '动物',
  plants:     '植物',
  body:       '人体',
  colors:     '颜色',
  weather:    '天气',
  actions:    '动作',
  objects:    '物品',
  concepts:   '概念',
  emotions:   '情感',
  culture:    '文化',
  philosophy: '哲学'
};

// 主题展示顺序（常用在前）
const THEME_ORDER = [
  'numbers', 'nature', 'animals', 'plants', 'body', 'colors',
  'weather', 'actions', 'objects', 'concepts', 'emotions', 'culture', 'philosophy'
];

// ── 场景（模板分类）展示标签 ──
const SCENE_LABELS = {
  '唐诗宋词': '📜 唐诗宋词',
  '三字经':   '📖 三字经',
  '千字文':   '📚 千字文',
  '常用字':   '✏️ 常用字',
  '成语':     '💎 成语',
  '节日':     '🎉 节日'
};

// ── DOM 选择器配置 ──
const INPUT_SELECTOR = '#inputText';
const BTN_ANCHOR_SELECTOR = '#clear-btn'; // 推荐按钮插入到"清除"按钮之前

const Recommender = {
  /** @type {HTMLTextAreaElement|null} */
  inputEl: null,
  /** @type {HTMLElement|null} */
  triggerBtn: null,
  /** @type {HTMLElement|null} */
  overlayEl: null,
  /** @type {HTMLElement|null} */
  bodyEl: null,
  /** 当前激活标签页 */
  activeTab: 'difficulty',
  /** 防止重复初始化 */
  inited: false,

  /** 初始化入口 */
  init() {
    if (this.inited) return;
    this.inputEl = document.querySelector(INPUT_SELECTOR);
    if (!this.inputEl) {
      console.warn('[Recommender] 未找到输入框 ' + INPUT_SELECTOR + '，跳过初始化');
      return;
    }
    this.createTriggerButton();
    this.createPanel();
    this.bindEvents();
    this.inited = true;
  },

  /** 创建"✨ 智能推荐"触发按钮 */
  createTriggerButton() {
    const anchor = document.querySelector(BTN_ANCHOR_SELECTOR);
    if (!anchor || !anchor.parentNode) {
      console.warn('[Recommender] 未找到按钮锚点 ' + BTN_ANCHOR_SELECTOR);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn rec-trigger';
    btn.id = 'recommendBtn';
    btn.title = 'AI 智能推荐汉字与模板';
    btn.innerHTML = '✨ 智能推荐';
    anchor.parentNode.insertBefore(btn, anchor);
    this.triggerBtn = btn;
  },

  /** 创建模态面板（默认隐藏）*/
  createPanel() {
    const overlay = document.createElement('div');
    overlay.className = 'rec-overlay';
    overlay.id = 'recOverlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="rec-modal" role="dialog" aria-modal="true" aria-labelledby="recTitle">
        <div class="rec-header">
          <h3 id="recTitle">✨ 智能推荐</h3>
          <button class="rec-close" type="button" aria-label="关闭推荐面板">×</button>
        </div>
        <div class="rec-tabs" role="tablist">
          <button class="rec-tab active" type="button" data-tab="difficulty" role="tab">按难度</button>
          <button class="rec-tab" type="button" data-tab="theme" role="tab">按主题</button>
          <button class="rec-tab" type="button" data-tab="scene" role="tab">按场景</button>
        </div>
        <div class="rec-body" id="recBody"></div>
        <div class="rec-footer">
          <span class="rec-tip">提示：字格点击「追加」到输入框；模板点击「覆盖」原内容</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlayEl = overlay;
    this.bodyEl = overlay.querySelector('#recBody');
    this.renderTab(this.activeTab);
  },

  /** 绑定所有事件 */
  bindEvents() {
    // 触发按钮 → 打开
    if (this.triggerBtn) {
      this.triggerBtn.addEventListener('click', () => this.open());
    }
    // 关闭按钮
    this.overlayEl.querySelector('.rec-close')
      .addEventListener('click', () => this.close());
    // 点击遮罩区域 → 关闭
    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) this.close();
    });
    // Esc 键 → 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.overlayEl.hidden) this.close();
    });
    // 标签页切换
    const tabs = this.overlayEl.querySelectorAll('.rec-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        this.activeTab = name;
        this.renderTab(name);
      });
    });
    // 内容区事件委托：字格 / 一键加载 / 模板
    this.bodyEl.addEventListener('click', (e) => {
      const charTile = e.target.closest('.rec-char');
      if (charTile) {
        this.appendChar(charTile.dataset.char);
        this.flashTile(charTile);
        return;
      }
      const loadAllBtn = e.target.closest('.rec-load-all');
      if (loadAllBtn) {
        this.appendChars(loadAllBtn.dataset.chars || '');
        this.flashBtn(loadAllBtn);
        return;
      }
      const tmplBtn = e.target.closest('.rec-template');
      if (tmplBtn) {
        this.replaceText(tmplBtn.dataset.text || '');
        this.flashTile(tmplBtn);
        return;
      }
    });
  },

  /** 渲染当前标签页内容 */
  renderTab(name) {
    if (!this.bodyEl) return;
    if (name === 'difficulty') {
      this.bodyEl.innerHTML = this.renderDifficulty();
    } else if (name === 'theme') {
      this.bodyEl.innerHTML = this.renderTheme();
    } else if (name === 'scene') {
      this.bodyEl.innerHTML = this.renderScene();
    }
    this.bodyEl.scrollTop = 0;
  },

  /**
   * 标签页1：按难度
   * 三个子分类（初级/中级/高级），每级按内部 category 分组展示，
   * 每个分组 8-10 字，并提供"一键加载该分类全部"按钮。
   */
  renderDifficulty() {
    return DIFFICULTY_LEVELS.map(level => {
      const levelData = vocabulary[level.key] || {};
      const allChars = Object.values(levelData).flat();
      const allCharsStr = allChars.join('');
      const groups = Object.entries(levelData).map(([cat, chars]) => {
        const catLabel = THEME_LABELS[cat] || cat;
        const tiles = chars.map(c =>
          `<button class="rec-char" type="button" data-char="${c}">${c}</button>`
        ).join('');
        return `
          <div class="rec-group">
            <div class="rec-group-title">${catLabel}</div>
            <div class="rec-chars">${tiles}</div>
          </div>`;
      }).join('');
      return `
        <section class="rec-section">
          <header class="rec-section-header">
            <span class="rec-level rec-level-${level.key}">${level.label}</span>
            <span class="rec-level-desc">${level.desc}</span>
            <button class="rec-load-all" type="button" data-chars="${allCharsStr}">一键加载该分类全部 (${allChars.length})</button>
          </header>
          ${groups}
        </section>`;
    }).join('');
  },

  /**
   * 标签页2：按主题
   * 跨难度聚合相同 category 的字（去重），每个主题展示 8-12+ 字。
   */
  renderTheme() {
    const aggregated = {};
    Object.values(vocabulary).forEach(levelData => {
      Object.entries(levelData).forEach(([cat, chars]) => {
        if (!aggregated[cat]) aggregated[cat] = [];
        chars.forEach(c => { if (!aggregated[cat].includes(c)) aggregated[cat].push(c); });
      });
    });
    return THEME_ORDER.filter(k => aggregated[k]).map(cat => {
      const chars = aggregated[cat];
      const catLabel = THEME_LABELS[cat] || cat;
      const tiles = chars.map(c =>
        `<button class="rec-char" type="button" data-char="${c}">${c}</button>`
      ).join('');
      return `
        <section class="rec-section">
          <header class="rec-section-header">
            <span class="rec-theme-badge">${catLabel}</span>
            <span class="rec-level-desc">${chars.length} 字</span>
            <button class="rec-load-all" type="button" data-chars="${chars.join('')}">一键加载该分类全部 (${chars.length})</button>
          </header>
          <div class="rec-chars">${tiles}</div>
        </section>`;
    }).join('');
  },

  /**
   * 标签页3：按场景
   * 从 templates.js 按 category 分组，展示模板名/作者/字数/预览，
   * 点击模板覆盖输入框内容。
   */
  renderScene() {
    const grouped = {};
    templates.forEach(t => {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push(t);
    });
    return Object.entries(grouped).map(([cat, list]) => {
      const header = SCENE_LABELS[cat] || cat;
      const cards = list.map(t => {
        const preview = t.text.length > 20 ? t.text.slice(0, 20) + '…' : t.text;
        const desc = (t.description || '').replace(/"/g, '&quot;');
        return `
          <button class="rec-template" type="button" data-text="${t.text}" title="${desc}">
            <div class="rec-tmpl-name">${t.name}</div>
            <div class="rec-tmpl-meta">${t.author || '通用'} · ${t.charCount}字</div>
            <div class="rec-tmpl-preview">${preview}</div>
          </button>`;
      }).join('');
      return `
        <section class="rec-section">
          <header class="rec-section-header">
            <span class="rec-scene-badge">${header}</span>
            <span class="rec-level-desc">${list.length} 个模板</span>
          </header>
          <div class="rec-templates">${cards}</div>
        </section>`;
    }).join('');
  },

  /** 打开面板 */
  open() {
    if (!this.overlayEl) return;
    this.overlayEl.hidden = false;
    document.body.style.overflow = 'hidden';
    this.renderTab(this.activeTab);
  },

  /** 关闭面板 */
  close() {
    if (!this.overlayEl) return;
    this.overlayEl.hidden = true;
    document.body.style.overflow = '';
  },

  /** 追加单字到输入框尾部（不覆盖）*/
  appendChar(ch) {
    if (!this.inputEl || !ch) return;
    const cur = this.inputEl.value.replace(/\s+$/, '');
    const max = this.inputEl.maxLength || 200;
    this.inputEl.value = (cur + ch).slice(0, max);
    this.dispatchInput();
  },

  /** 批量追加多字（不覆盖）*/
  appendChars(chars) {
    if (!this.inputEl || !chars) return;
    const cur = this.inputEl.value.replace(/\s+$/, '');
    const max = this.inputEl.maxLength || 200;
    this.inputEl.value = (cur + chars).slice(0, max);
    this.dispatchInput();
  },

  /** 覆盖输入框内容（用于模板加载）*/
  replaceText(text) {
    if (!this.inputEl || !text) return;
    const max = this.inputEl.maxLength || 200;
    this.inputEl.value = text.slice(0, max);
    this.dispatchInput();
  },

  /** 触发 input 事件以联动既有逻辑（字数统计、难度评估等）*/
  dispatchInput() {
    this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  },

  /** 字格点击高亮反馈 */
  flashTile(el) {
    el.classList.add('rec-flash');
    setTimeout(() => el.classList.remove('rec-flash'), 300);
  },

  /** 按钮点击高亮反馈 */
  flashBtn(el) {
    const orig = el.textContent;
    el.classList.add('rec-flash');
    el.textContent = '✓ 已加载';
    setTimeout(() => {
      el.classList.remove('rec-flash');
      el.textContent = orig;
    }, 800);
  }
};

/**
 * 供 main.js 调用的注册函数
 * 在 DOM 就绪后初始化推荐模块。
 */
export function registerRecommender() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Recommender.init());
  } else {
    Recommender.init();
  }
}

export default Recommender;
