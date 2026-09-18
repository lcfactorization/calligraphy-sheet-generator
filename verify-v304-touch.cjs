#!/usr/bin/env node
/**
 * verify-v304-touch.cjs — v3.0.4 触屏/平板笔顺弹窗自适应 · 独立验证脚本
 * ============================================================================
 * 独立测试工程（test-impl）产出，**不是**实现方自测。目标：证伪。
 *
 * 覆盖：
 *   A. 纯函数 solveLayout —— 7 设备 × n=1..4 的"装得下"性质 + 桌面非回归断言
 *   B. 真实渲染布局 —— 每设备打开 n=1..4 个弹窗，断言全部窗口落在 visualViewport
 *      内、互不重叠、关闭按钮可达；桌面断言 s===1 && cols===n
 *   B7. W3 验收 —— 渲染后（post-transform）有效触摸目标 ≥34/44/22；头部不溢出、
 *      标题不被压没；主体 scrollHeight ≤ clientHeight 且信息行可见
 *   C. 触摸行为 —— 同字聚焦、.sd-flash 真实 CSS、触摸目标、拖拽 clamp、
 *      maximized 重置、关闭即时重排
 *   D. 桌面载重行为 —— z 序 10003..10006、ESC 关最上层、药丸 240×40 精确还原
 *   E. W4 验收 —— visualViewport 纯平移（offset 变 / 尺寸不变）是否触发重排，
 *      并断言 overlay 重新对准可视区、无窗口被裁
 *
 * 运行：node verify-v304-touch.cjs      退出码：任一 FAIL → 非 0
 *
 * 关键环境事实（已实测，见脚本内注释）：
 *   - Puppeteer 23.11.1 + 本地 Chrome 131，不下载浏览器
 *   - hasTouch:true 即令 (pointer:coarse)/(hover:none) 命中 → 触摸路径可测
 *   - isMobile:true 时 innerWidth(611/780/1140…) ≠ clientWidth/visualViewport.width
 *     → 所有边界断言一律基于 visualViewport，绝不用 innerWidth
 *   - page.setViewport() 在 mobile/hasTouch 变化时会内部 reload 页面，
 *     因此"窗口上挂的测量函数"会被清掉 → 本脚本每次测量都重新注入函数
 */
'use strict';

const path = require('path');
const fs = require('fs');

const PORT = 3011;
const TOL = 2;                       // 像素容差
const CHARS = ['融', '燕', '鸳', '鸯'];
const SHOT_DIR = __dirname;

// 触摸目标下限（契约 S7 / WCAG 2.5.5 最小可点尺寸）
const T_CLOSE = 34, T_PLAY = 44, T_THUMB = 22;

// 前两台按"精细指针/桌面"，其余按"粗略指针/触摸"
const DEVICES = [
    { id: 'desktop-1920x1080', w: 1920, h: 1080, touch: false, coarse: false },
    { id: 'laptop-1280x800', w: 1280, h: 800, touch: false, coarse: false },
    { id: 'tablet-1180x820', w: 1180, h: 820, touch: true, coarse: true },
    { id: 'tablet-820x1180', w: 820, h: 1180, touch: true, coarse: true },
    { id: 'tablet-800x1280', w: 800, h: 1280, touch: true, coarse: true },
    { id: 'phone-390x844', w: 390, h: 844, touch: true, coarse: true },
    { id: 'phone-844x390', w: 844, h: 390, touch: true, coarse: true },
];

// ════════════════════════ 结果收集 ════════════════════════
const results = [];
let seq = 0;
function record(group, name, status, detail) {
    results.push({ id: ++seq, group, name, status, detail });
    console.log(`  [${status}] ${name}${detail ? ' — ' + detail : ''}`);
}
const pass = (g, n, d) => record(g, n, 'PASS', d);
const fail = (g, n, d) => record(g, n, 'FAIL', d);
const warn = (g, n, d) => record(g, n, 'WARN', d);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function poll(fn, timeout = 20000, interval = 150) {
    const t0 = Date.now();
    for (;;) {
        let ok = false;
        try { ok = await fn(); } catch (_) { ok = false; }
        if (ok) return true;
        if (Date.now() - t0 > timeout) return false;
        await sleep(interval);
    }
}

/**
 * 外部并发编辑（例如另一个进程重写 public/*.html）会让 dev server 触发 Vite full-reload，
 * 把执行上下文销毁 → "Execution context was destroyed"。这是环境噪声，不是产品缺陷。
 * 重试前回滚本次尝试产生的记录与观测数组，避免重复计数或半途数据污染断言。
 */
async function runWithRetry(label, fn, attempts = 3) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const snap = {
            results: results.length,
            fit: (global.__fitObs || []).length,
            render: (global.__renderObs || []).length,
        };
        try { return await fn(); }
        catch (err) {
            results.length = snap.results;
            if (global.__fitObs) global.__fitObs.length = snap.fit;
            if (global.__renderObs) global.__renderObs.length = snap.render;
            const transient = /Execution context was destroyed|Target closed|Session closed|Cannot find context|Navigating frame|detached/i.test(err.message || '');
            if (transient && attempt < attempts) {
                console.log(`  (${label} 遇到页面重载，重试 ${attempt}/${attempts - 1}…)`);
                await sleep(900);
                continue;
            }
            throw err;
        }
    }
}

// ════════════════════════ 浏览器侧测量（每次 evaluate 现注入） ════════════════════════
function measureInPage() {
    const vv = window.visualViewport;
    const vl = vv ? (vv.offsetLeft || 0) : 0;
    const vt = vv ? (vv.offsetTop || 0) : 0;
    const vw = (vv && vv.width) ? vv.width : document.documentElement.clientWidth;
    const vh = (vv && vv.height) ? vv.height : document.documentElement.clientHeight;
    const ov = document.querySelector('.sd-overlay');
    const s = ov ? (parseFloat(ov.style.getPropertyValue('--sd-s')) || 1) : 1;
    const cols = ov ? (parseInt(ov.style.getPropertyValue('--sd-cols'), 10) || 1) : 1;
    const gap = ov ? (parseFloat(getComputedStyle(ov).columnGap) || 0) : 0;
    const live = [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing'));
    const wins = live.map(w => {
        const r = w.getBoundingClientRect();
        const cb = w.querySelector('.sd-btn-close');
        const cr = cb ? cb.getBoundingClientRect() : null;
        return {
            char: w.dataset.char || '',
            minimized: w.classList.contains('minimized'),
            maximized: w.classList.contains('maximized'),
            free: w.classList.contains('sd-free'),
            dragging: w.classList.contains('dragging'),
            flash: w.classList.contains('sd-flash'),
            z: parseInt(w.style.zIndex, 10) || 0,
            rect: { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height },
            close: cr ? { l: cr.left, t: cr.top, r: cr.right, b: cr.bottom, w: cr.width, h: cr.height } : null,
            closeOffset: cb ? { w: cb.offsetWidth, h: cb.offsetHeight } : null,
        };
    });
    return {
        vl, vt, vw, vh, s, cols, gap,
        closing: document.querySelectorAll('.sd-window.closing').length,
        wins,
        innerW: window.innerWidth,
        clientW: document.documentElement.clientWidth,
        vvL: vv ? vv.offsetLeft : 0,
        vvScale: vv ? vv.scale : 1,
        docScrollW: document.documentElement.scrollWidth,
        coarse: window.matchMedia('(pointer: coarse)').matches,
    };
}

function viewportKeyInPage() {
    const vv = window.visualViewport;
    return vv ? [vv.offsetLeft, vv.offsetTop, vv.width, vv.height].join(',') : 'none';
}

/**
 * 触摸目标 / 头部 / 主体的渲染后（post-transform）几何测量。
 * getBoundingClientRect() 已包含 .sd-window 上的 transform: scale(var(--sd-s))，
 * 因此这里的 width/height 就是用户手指实际命中的尺寸。
 */
function measureFitInPage() {
    const ov = document.querySelector('.sd-overlay');
    const s = ov ? (parseFloat(ov.style.getPropertyValue('--sd-s')) || 1) : 1;
    const wins = [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing'));
    const expanded = wins.find(w => !w.classList.contains('minimized') && !w.classList.contains('maximized')) || wins[0] || null;
    const out = { s, close: [], play: null, header: null, body: null, slider: null };

    // 每个窗口（含药丸）的关闭按钮有效尺寸；同时记录窗口矩形以判定是否被 overflow:hidden 裁掉
    for (const w of wins) {
        const cb = w.querySelector('.sd-btn-close');
        if (!cb) continue;
        const r = cb.getBoundingClientRect();
        const wr = w.getBoundingClientRect();
        out.close.push({
            char: w.dataset.char || '',
            minimized: w.classList.contains('minimized'),
            maximized: w.classList.contains('maximized'),
            effW: r.width, effH: r.height,
            offW: cb.offsetWidth, offH: cb.offsetHeight,
            winTop: wr.top, winBottom: wr.bottom, winLeft: wr.left, winRight: wr.right,
            clipTop: Math.max(0, wr.top - r.top),       // 被窗口上边缘裁掉的量
            clipLeft: Math.max(0, wr.left - r.left),
            clipRight: Math.max(0, r.right - wr.right),
            clipBottom: Math.max(0, r.bottom - wr.bottom),
        });
    }

    if (expanded) {
        const play = expanded.querySelector('.sd-play-btn');
        if (play) { const r = play.getBoundingClientRect(); out.play = { effW: r.width, effH: r.height, offH: play.offsetHeight }; }

        const header = expanded.querySelector('.sd-window-header');
        const title = expanded.querySelector('.sd-window-title');
        const controls = expanded.querySelector('.sd-window-controls');
        if (header && title && controls) {
            const hr = header.getBoundingClientRect(), tr = title.getBoundingClientRect(), cr = controls.getBoundingClientRect();
            const btn = controls.querySelector('button');
            const br = btn ? btn.getBoundingClientRect() : null;
            out.header = {
                hW: hr.width, hScrollW: header.scrollWidth, hClientW: header.clientWidth,
                cW: cr.width, cR: cr.right, hR: hr.right, hL: hr.left,
                tW: tr.width, tL: tr.left, tR: tr.right,
                btnW: br ? br.width : 0, btnH: br ? br.height : 0,
                btnTop: br ? br.top : 0, btnBottom: br ? br.bottom : 0,
                hTop: hr.top, hBottom: hr.bottom,
                winW: expanded.getBoundingClientRect().width,
            };
        }

        const body = expanded.querySelector('.sd-window-body');
        if (body) {
            const info = expanded.querySelector('.sd-info');
            const br = body.getBoundingClientRect();
            const ir = info ? info.getBoundingClientRect() : null;
            const csB = getComputedStyle(body);
            out.body = {
                clientH: body.clientHeight, scrollH: body.scrollHeight,
                clientW: body.clientWidth, scrollW: body.scrollWidth,
                padBottom: parseFloat(csB.paddingBottom) || 0,
                padTop: parseFloat(csB.paddingTop) || 0,
                h: br.height,
                infoH: ir ? ir.height : null,
                infoBottom: ir ? ir.bottom : null,
                bodyBottom: br.bottom,
                infoVisible: ir ? (ir.height > 0 && ir.bottom <= br.bottom + 1 && ir.top >= br.top - 1) : null,
            };
        }

        const slider = expanded.querySelector('.sd-speed-slider');
        if (slider) { const r = slider.getBoundingClientRect(); out.slider = { x: r.left, y: r.top, w: r.width, h: r.height }; }
    }

    // ── 每个窗口的"盒内守恒"原始量（布局单位；scrollHeight/offsetHeight 不受 transform 影响）──
    // 用于断言 --sd-hdr + body 内容 <= 440，以及 header/body 无内部溢出。
    out.windows = wins.map(w => {
        const cs = getComputedStyle(w);
        const hdr = w.querySelector('.sd-window-header');
        const body = w.querySelector('.sd-window-body');
        const stage = w.querySelector('.sd-stage');
        return {
            char: w.dataset.char || '',
            minimized: w.classList.contains('minimized'),
            maximized: w.classList.contains('maximized'),
            // ⚠ getComputedStyle 对未注册的自定义属性返回"未求值 token 流"
            //    （实测 "clamp(40px, calc(40px / 0.8), 56px)"），parseFloat → NaN。
            //    故 --sd-hdr 的"已求值"值必须取 header 的 used height（clamp 已求值）。
            hdrVarRaw: cs.getPropertyValue('--sd-hdr'),
            hdrH: hdr ? (parseFloat(getComputedStyle(hdr).height) || 0) : 0,
            sVar: parseFloat(cs.getPropertyValue('--sd-s')) || 1,
            winOffH: w.offsetHeight, winOffW: w.offsetWidth,
            winClientH: w.clientHeight,
            hdrScrollH: hdr ? hdr.scrollHeight : null,
            hdrClientH: hdr ? hdr.clientHeight : null,
            bodyScrollH: body ? body.scrollHeight : null,
            bodyClientH: body ? body.clientHeight : null,
            stageOff: stage ? stage.offsetHeight : null,
            stageEff: stage ? stage.getBoundingClientRect().height : null,
        };
    });
    return out;
}

const insideViewport = (r, m, tol = TOL) =>
    r.l >= m.vl - tol && r.t >= m.vt - tol &&
    r.r <= m.vl + m.vw + tol && r.b <= m.vt + m.vh + tol;

const rectsOverlap = (a, b, tol = 0.5) =>
    !(a.r <= b.l + tol || b.r <= a.l + tol || a.b <= b.t + tol || b.b <= a.t + tol);

const fmtRect = (r) => `[${r.l.toFixed(1)},${r.t.toFixed(1)} ${r.w.toFixed(1)}x${r.h.toFixed(1)}]`;

/**
 * 读取触摸媒体查询里三个控件的 clamp 补偿表达式（CSSOM 真实规则文本）。
 *
 * 为什么不用像素/getBoundingClientRect 测滑块拇指：实测本环境（Puppeteer 23 + headless Chrome 131）
 *   - getComputedStyle(input,'::-webkit-slider-thumb') 返回**宿主 input** 的盒子（242×4），不是拇指；
 *   - CDP DOM.getDocument({pierce:true}) 只暴露 UA shadow 里的 track DIV，没有拇指节点；
 *   - 注入 !important 的拇指背景色后整页截图 0 个哨兵像素 → 该伪元素的 paint 覆盖在 headless 下不生效。
 * 故拇指改用"实测 s + 实测 CSSOM 规则"推导：layout = clamp(base, base/s, cap)，effective = layout × s。
 * 这是本环境能做到的最强证据，报告中标为 derived。
 */
async function readTouchRules(page) {
    return page.evaluate(() => {
        const out = { vars: {} };
        const want = {
            close: '.sd-window-controls button',
            play: '.sd-play-btn',
            thumb: '.sd-speed-slider::-webkit-slider-thumb',
        };
        for (const ss of document.styleSheets) {
            let rules; try { rules = ss.cssRules; } catch (_) { continue; }
            const scan = (list, inTouch) => {
                for (const r of list) {
                    if (r.cssRules && !r.selectorText) { scan(r.cssRules, inTouch || /hover: none|pointer: coarse/.test(r.conditionText || '')); continue; }
                    if (!r.selectorText) continue;
                    // 自定义属性定义（--sd-*）——补偿表达式已从声明值搬到这里
                    for (let i = 0; i < r.style.length; i++) {
                        const p = r.style.item(i);
                        if (!p || p.slice(0, 2) !== '--') continue;
                        const v = r.style.getPropertyValue(p);
                        if (!out.vars[p] || inTouch) out.vars[p] = { decl: v, inTouch, selector: r.selectorText.replace(/\s+/g, ' ').trim() };
                    }
                    for (const k of Object.keys(want)) {
                        if (r.selectorText.replace(/\s+/g, ' ').trim() === want[k]) {
                            const w = r.style.getPropertyValue('width') || r.style.getPropertyValue('height');
                            if (!out[k] || inTouch) out[k] = { text: r.cssText.slice(0, 200), inTouch, decl: w };
                        }
                    }
                }
            };
            scan(rules, false);
        }
        return out;
    });
}

/** 从 clamp(base, calc(base/var(--sd-s,1)), cap) 声明里解析出 (base, cap) */
function parseClamp(decl) {
    if (!decl) return null;
    const m = /clamp\(\s*([\d.]+)px\s*,\s*calc\(\s*([\d.]+)px\s*\/\s*var\(--sd-s\s*,\s*1\s*\)\s*\)\s*,\s*([\d.]+)px\s*\)/.exec(decl);
    if (!m) return null;
    return { base: parseFloat(m[1]), inner: parseFloat(m[2]), cap: parseFloat(m[3]) };
}

/**
 * 解析某控件的补偿规则：声明值可能是字面 clamp(...)（旧写法），
 * 也可能只是 var(--sd-btn) —— 此时沿 CSSOM 找到 --sd-btn 的定义再解析。
 * 返回 { pc, rawDecl, varName, varDecl, varInTouch }。
 */
function resolveCompRule(rules, key) {
    const r = rules && rules[key];
    if (!r || !r.decl) return { pc: null, rawDecl: r ? r.decl : null };
    const m = /var\(\s*(--sd-[a-z0-9-]+)\s*\)/i.exec(r.decl);
    if (m) {
        const def = rules.vars && rules.vars[m[1]];
        return { pc: def ? parseClamp(def.decl) : null, rawDecl: r.decl, varName: m[1], varDecl: def ? def.decl : null, varInTouch: def ? def.inTouch : false };
    }
    return { pc: parseClamp(r.decl), rawDecl: r.decl };
}



// ════════════════════════ 主流程 ════════════════════════
async function main() {
    let puppeteer;
    try { puppeteer = require('puppeteer'); }
    catch (e) { console.error('✗ puppeteer 未安装'); process.exit(1); }

    // ── 1. 程序化启动 dev server（open:false，绝不弹窗） ──
    const { createServer } = await import('vite');
    const server = await createServer({
        configFile: path.join(__dirname, 'vite.config.js'),
        server: { open: false, port: PORT, host: '127.0.0.1', strictPort: true },
    });
    await server.listen();
    const BASE = (server.resolvedUrls && server.resolvedUrls.local && server.resolvedUrls.local[0]
        ? server.resolvedUrls.local[0] : `http://127.0.0.1:${PORT}/`).replace(/\/$/, '');
    console.log(`\n═══ v3.0.4 触屏/平板笔顺弹窗 · 独立验证 ═══`);
    console.log(`dev server: ${BASE}`);

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    // 抑制新手引导浮层：否则它会盖住笔顺弹窗，使截图无法呈现触摸目标（对几何断言无影响）
    await page.evaluateOnNewDocument(() => {
        try {
            localStorage.setItem('onboarding_never_show', 'true');
            localStorage.setItem('onboarding_completed', 'true');
        } catch (_) {}
    });
    const pageErrors = [];
    let navCount = 0;
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) pageErrors.push('[console] ' + m.text().slice(0, 200)); });
    page.on('framenavigated', f => { if (f === page.mainFrame()) navCount++; });

    // 共享辅助（闭包，依赖 page）
    const ctx = {
        page, BASE,
        async goto(vp) {
            await page.setViewport(vp);
            await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            return navCount;                      // 基线
        },
        async measure() { return page.evaluate(measureInPage); },
        navCount() { return navCount; },
        async waitReady(timeout = 150000) {
            return poll(async () => page.evaluate(async () => {
                try { return (await import('/src/modules/hanziDataStore.js')).isReady(); } catch (e) { return false; }
            }), timeout, 300);
        },
        // 等 visualViewport 稳定（模拟真实设备的稳态；offset 与尺寸都不再变化）
        async waitViewportStable(maxMs = 9000) {
            const t0 = Date.now();
            let last = null, lastChange = Date.now();
            while (Date.now() - t0 < maxMs) {
                const k = await page.evaluate(viewportKeyInPage);
                if (k !== last) { last = k; lastChange = Date.now(); }
                else if (Date.now() - lastChange > 700) return true;
                await sleep(120);
            }
            return false;
        },
        async closeAll() {
            await page.evaluate(async () => (await import('/src/modules/strokeDemoModal.js')).closeAllStrokeDemo());
            await poll(async () => page.evaluate(() => document.querySelectorAll('.sd-window').length === 0), 6000, 100);
            await sleep(250);
        },
        async openChars(chars) {
            await page.evaluate(async (cs) => {
                const m = await import('/src/modules/strokeDemoModal.js');
                for (const c of cs) m.openStrokeDemo(c);
            }, chars);
            const ok = await poll(async () => page.evaluate((want) => {
                const live = [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing'));
                return live.length === want && live.every(w => w.querySelector('.sd-stage-bg svg'));
            }, chars.length), 30000, 200);
            await sleep(500);
            return ok;
        },
    };

    const solverMatrix = [];
    try {
        // ══════════════════════════════════════════════════════════
        // A. 纯函数 solveLayout
        // ══════════════════════════════════════════════════════════
        console.log('\n── A. 纯函数 solveLayout（7 设备 × n=1..4）──');
        await ctx.goto({ width: 1280, height: 800 });

        const matrix = await page.evaluate(async (devices) => {
            const mod = await import('/src/modules/strokeDemoModal.js');
            const out = [];
            for (const d of devices) {
                for (let n = 1; n <= 4; n++) {
                    const availW = Math.max(40, d.w - 40);
                    const availH = Math.max(40, d.h - 40);
                    const sMax = d.coarse ? 1.6 : 1.0;
                    const r = mod.solveLayout(n, availW, availH, sMax);
                    // gap 取自真实计算样式（CSS: gap = calc(12px * var(--sd-s))）
                    const probe = document.createElement('div');
                    probe.className = 'sd-overlay';
                    probe.style.setProperty('--sd-s', String(r.s));
                    probe.style.setProperty('--sd-cols', String(r.cols));
                    document.body.appendChild(probe);
                    const cs = getComputedStyle(probe);
                    const gap = parseFloat(cs.columnGap) || 0;
                    const rowGap = parseFloat(cs.rowGap) || 0;
                    probe.remove();
                    out.push({
                        device: d.id, n, availW, availH, sMax,
                        cols: r.cols, rows: r.rows, s: r.s, gap, rowGap,
                        fitW: r.cols * 340 * r.s + (r.cols - 1) * gap,
                        fitH: r.rows * 440 * r.s + (r.rows - 1) * rowGap,
                        // 契约 §3.8 规范性公式（v3.0.4 修订后）：CSS 必须写
                        // gap: calc(12px * var(--sd-s))，间距随 s 缩放，
                        // 故渲染行宽 = (cols*340 + (cols-1)*12) * s。
                        contractW: (r.cols * 340 + (r.cols - 1) * 12) * r.s,
                        contractH: (r.rows * 440 + (r.rows - 1) * 12) * r.s,
                    });
                }
            }
            return out;
        }, DEVICES.map(d => ({ id: d.id, w: d.w, h: d.h, coarse: d.coarse })));
        solverMatrix.push(...matrix);

        console.log('  (cols,rows,s) 矩阵：');
        for (const d of DEVICES) {
            const row = matrix.filter(x => x.device === d.id).map(x => `n=${x.n}:(${x.cols},${x.rows},${x.s.toFixed(4)})`).join('  ');
            console.log(`    ${d.id.padEnd(20)} ${row}`);
        }

        // A1. 装得下（gap 取真实计算值）
        for (const d of DEVICES) {
            const rows = matrix.filter(x => x.device === d.id);
            const bad = rows.filter(x => x.fitW > x.availW + 0.05 || x.fitH > x.availH + 0.05);
            const slackW = Math.min(...rows.map(x => x.availW - x.fitW));
            const slackH = Math.min(...rows.map(x => x.availH - x.fitH));
            if (bad.length === 0) pass('A.求解器装得下', `${d.id} n=1..4 全部 fit`, `最小余量 W=${slackW.toFixed(2)}px H=${slackH.toFixed(2)}px`);
            else fail('A.求解器装得下', `${d.id} 溢出 ${bad.length} 例`,
                bad.map(x => `n=${x.n} W+${(x.fitW - x.availW).toFixed(1)} H+${(x.fitH - x.availH).toFixed(1)}`).join('; '));
        }

        // A2. 桌面非回归（最关键断言）
        console.log('\n  ── A2. 桌面非回归（最关键断言）──');
        for (const devId of ['desktop-1920x1080', 'laptop-1280x800']) {
            const rows = matrix.filter(x => x.device === devId && x.n >= 1 && x.n <= 3);
            const bad = rows.filter(x => !(x.s === 1 && x.cols === x.n));
            const obs = rows.map(x => `n=${x.n}→(cols=${x.cols},s=${x.s})`).join(' ');
            if (bad.length === 0) pass('A.桌面非回归', `${devId} n=1..3 均 s=1 且 cols=n`, obs);
            else fail('A.桌面非回归', `${devId} 非回归被破坏`, obs + ' | 期望 (cols=n,s=1)');
        }
        {
            const r4 = matrix.find(x => x.device === 'desktop-1920x1080' && x.n === 4);
            if (r4 && r4.s === 1 && r4.cols === 4) pass('A.桌面非回归', '1920×1080 n=4 → cols=4,s=1', `(cols=${r4.cols},s=${r4.s})`);
            else fail('A.桌面非回归', '1920×1080 n=4 期望 cols=4,s=1', JSON.stringify(r4));
        }
        {
            const r4b = matrix.find(x => x.device === 'laptop-1280x800' && x.n === 4);
            // 契约 §3.8 修订后措辞：「桌面 s 在 1×N 横排放得下时恒为 1，放不下时按公式缩小」。
            // 1280×800 + 4 窗即"放不下"的情形 → s<1 是**契约规定的正确行为**，
            // 且旧版此处溢出 156px（S2），新版不溢出。
            if (r4b && r4b.s < 1 && r4b.fitW <= r4b.availW + TOL && r4b.fitH <= r4b.availH + TOL) {
                pass('A.桌面非回归(边界)', `1280×800 n=4 按契约缩小 s=${r4b.s.toFixed(4)} 且不溢出`,
                    `旧版此例溢出 156px(S2)，新版按 §3.8 公式缩小后不溢出`);
            } else if (r4b && r4b.s === 1) {
                pass('A.桌面非回归(边界)', '1280×800 n=4 时 s=1（横排放得下）');
            } else {
                fail('A.桌面非回归(边界)', '1280×800 n=4 既非 s=1 也不满足不溢出', JSON.stringify(r4b));
            }
        }

        // A3. 契约 §3.8 规范性公式 vs 代码（gap 是否随 s 缩放）——规格↔代码一致性
        const diverge = matrix.filter(x => x.contractW > x.availW + 0.05 || x.contractH > x.availH + 0.05);
        if (diverge.length === 0) pass('A.契约一致性', '契约 §3.8 公式（gap 随 s 缩放）与代码一致（0 例偏差）');
        else fail('A.契约一致性', `契约 §3.8 公式在 ${diverge.length}/${matrix.length} 例不成立`,
            diverge.slice(0, 3).map(x => `${x.device}/n=${x.n} 契约宽 ${x.contractW.toFixed(1)}>availW ${x.availW}`).join('; '));

        // ══════════════════════════════════════════════════════════
        // B. 真实渲染布局（逐设备）
        // ══════════════════════════════════════════════════════════
        console.log('\n── B. 真实渲染布局（逐设备，n=1..4）──');
        for (const dev of DEVICES) {
            console.log(`\n  ▸ ${dev.id} (${dev.w}×${dev.h}${dev.touch ? ', touch+isMobile' : ''})`);
            try { await runWithRetry(dev.id, () => runDevice(ctx, dev)); }
            catch (err) { fail('B.渲染', `${dev.id} 运行异常`, err.message); }
        }

        // ══════════════════════════════════════════════════════════
        // B7. W3 修复验收：缩放补偿后的有效触摸目标 / 头部 / 主体
        // ══════════════════════════════════════════════════════════
        console.log('\n── B7. W3 有效触摸目标（post-transform）──');
        try { assertTouchTargets(); }
        catch (err) { fail('B7.触摸目标', '断言异常', err.message); }

        // ══════════════════════════════════════════════════════════
        // C. 触摸行为（手机 390×844）
        // ══════════════════════════════════════════════════════════
        console.log('\n── C. 触摸行为（phone-390x844, isMobile+hasTouch）──');
        try { await runWithRetry('C.触摸行为', () => runTouchBehaviour(ctx, DEVICES.find(d => d.id === 'phone-390x844'))); }
        catch (err) { fail('C.触摸行为', '运行异常', err.message); }

        // ══════════════════════════════════════════════════════════
        // D. 桌面载重行为（1920×1080）
        // ══════════════════════════════════════════════════════════
        console.log('\n── D. 桌面载重行为（desktop-1920x1080）──');
        try { await runWithRetry('D.桌面载重', () => runDesktopLoadBearing(ctx, DEVICES.find(d => d.id === 'desktop-1920x1080'))); }
        catch (err) { fail('D.桌面载重', '运行异常', err.message); }

        // ══════════════════════════════════════════════════════════
        // E. W4 修复验收：visualViewport 纯平移（offset 变 / 尺寸不变）
        // ══════════════════════════════════════════════════════════
        console.log('\n── E. visualViewport 纯平移（offset 变化 / 尺寸不变）──');
        try { await runPanFix(ctx); }
        catch (err) { fail('E.视口平移', '运行异常', err.message); }

    } catch (err) {
        fail('全局', '验证流程异常', err.message + '\n' + (err.stack || ''));
    } finally {
        await browser.close().catch(() => {});
        try { await server.close(); } catch (_) {}
    }

    // ════════════════════════ 汇总 ════════════════════════
    const fails = results.filter(r => r.status === 'FAIL');
    const warns = results.filter(r => r.status === 'WARN');
    const passes = results.filter(r => r.status === 'PASS');

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  PASS / FAIL 汇总表');
    console.log('══════════════════════════════════════════════════════════════');
    const W = 42;
    for (const r of results) {
        const nm = r.name.length > W ? r.name.slice(0, W - 1) + '…' : r.name.padEnd(W);
        console.log(`  ${r.status.padEnd(4)} | ${r.group.padEnd(16)} | ${nm} | ${r.detail || ''}`);
    }
    console.log('──────────────────────────────────────────────────────────────');
    console.log(`  PASS=${passes.length}  FAIL=${fails.length}  WARN=${warns.length}  (总计 ${results.length})`);

    console.log('\n── 渲染观测 (s, cols) 矩阵 ──');
    for (const d of DEVICES) {
        const rows = (global.__renderObs || []).filter(x => x.device === d.id);
        if (rows.length) console.log(`  ${d.id.padEnd(20)} ${rows.map(x => `n=${x.n}:(s=${x.s.toFixed(4)},cols=${x.cols})`).join('  ')}`);
    }

    if (pageErrors.length) {
        console.log('\n── 页面错误（前 8 条）──');
        pageErrors.slice(0, 8).forEach(e => console.log('  ! ' + e));
    }

    console.log('\n── 截图 ──');
    const shots = [];
    for (const d of DEVICES) shots.push(`debug-v304-touch-${d.id}.png`);
    shots.push('debug-v304-touch-phone-390x844-n2.png', 'debug-v304-touch-phone-844x390-n1.png');
    for (const s of shots) {
        const f = path.join(SHOT_DIR, s);
        if (fs.existsSync(f)) console.log('  ' + f);
    }

    if (fails.length) {
        console.log('\n✗ 失败断言：');
        fails.forEach(f => console.log(`  ✗ [${f.group}] ${f.name} — ${f.detail || ''}`));
        process.exitCode = 1;
    } else {
        console.log('\n✓ 所有 FAIL 级断言通过');
    }
    if (warns.length) {
        console.log('⚠ 非阻塞告警 / 规格分歧：');
        warns.forEach(f => console.log(`  ⚠ [${f.group}] ${f.name} — ${f.detail || ''}`));
    }
}

// ════════════════════════ B. 单设备渲染 ════════════════════════
async function runDevice(ctx, dev) {
    const { page } = ctx;
    global.__renderObs = global.__renderObs || [];

    const vp = dev.touch
        ? { width: dev.w, height: dev.h, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
        : { width: dev.w, height: dev.h };
    const navBase = await ctx.goto(vp);
    const ready = await ctx.waitReady();
    if (!ready) warn('B.数据就绪', `${dev.id} hanzi 数据未在 150s 内就绪`);

    // 环境自检：确认 coarse 与预期一致（防"触摸测试其实跑在桌面路径"）
    const env = await page.evaluate(() => ({
        coarse: window.matchMedia('(pointer: coarse)').matches,
        innerW: window.innerWidth, clientW: document.documentElement.clientWidth,
        vvW: window.visualViewport && window.visualViewport.width,
    }));
    if (dev.coarse !== env.coarse) warn('B.环境', `${dev.id} coarse 期望 ${dev.coarse} 实得 ${env.coarse}`, JSON.stringify(env));

    // 生成字格
    await page.evaluate((txt) => {
        const el = document.getElementById('inputText');
        if (el) { el.value = txt; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
        const btn = document.getElementById('generate-btn');
        if (btn) btn.click();
    }, CHARS.join(''));
    const gridOk = await poll(async () => page.evaluate(() => document.querySelectorAll('.grid-svg-cell').length > 0), 25000, 200);
    if (!gridOk) warn('B.字格', `${dev.id} 未渲染出 .grid-svg-cell`);

    // 等视口稳定（真实设备稳态；否则会测到浏览器自动平移的中间态）
    const stable = await ctx.waitViewportStable();
    if (!stable) warn('B.视口稳定', `${dev.id} visualViewport 在 9s 内未稳定`);

    const perDevice = [];
    for (let n = 1; n <= 4; n++) {
        await ctx.closeAll();
        await ctx.openChars(CHARS.slice(0, n));
        await sleep(450);

        const m = await ctx.measure();
        perDevice.push({ n, s: m.s, cols: m.cols });

        // B1. 全部窗口在可视区内（S1/S2）
        const out = m.wins.filter(x => !insideViewport(x.rect, m));
        if (out.length === 0) {
            pass('B.可视区内', `${dev.id} n=${n} 全部 ${m.wins.length} 窗在视口内`,
                `s=${m.s.toFixed(4)} cols=${m.cols} gap=${m.gap.toFixed(2)}px vv=[${m.vl},${m.vt} ${m.vw}x${m.vh}] ` +
                m.wins.map(x => `${x.char}${x.minimized ? '(药丸)' : ''}${fmtRect(x.rect)}`).join(' '));
        } else {
            fail('B.可视区内', `${dev.id} n=${n} 有 ${out.length} 窗被裁切/出屏`,
                out.map(x => `${x.char}${fmtRect(x.rect)} vv=[${m.vl},${m.vt} ${m.vw}x${m.vh}]`).join('; '));
        }

        // B2. 关闭按钮可达
        const unreachable = [];
        for (const win of m.wins) {
            if (!win.close) { unreachable.push(`${win.char}:无关闭按钮`); continue; }
            const inVp = insideViewport(win.close, m);
            const cx = (win.close.l + win.close.r) / 2, cy = (win.close.t + win.close.b) / 2;
            const occl = m.wins.some(o => o !== win && cx > o.rect.l && cx < o.rect.r && cy > o.rect.t && cy < o.rect.b);
            if (!inVp || win.close.w <= 0 || win.close.h <= 0 || occl) {
                unreachable.push(`${win.char}${win.minimized ? '(药丸)' : ''} inVp=${inVp} occ=${occl} ${fmtRect(win.close)}`);
            }
        }
        if (unreachable.length === 0) pass('B.关闭可达', `${dev.id} n=${n} 所有关闭按钮可达`, `${m.wins.length} 个`);
        else fail('B.关闭可达', `${dev.id} n=${n} 不可达关闭按钮`, unreachable.join('; '));

        // B3. 互不重叠
        const overlaps = [];
        for (let i = 0; i < m.wins.length; i++)
            for (let j = i + 1; j < m.wins.length; j++)
                if (rectsOverlap(m.wins[i].rect, m.wins[j].rect)) overlaps.push(`${m.wins[i].char}×${m.wins[j].char}`);
        if (overlaps.length === 0) pass('B.不重叠', `${dev.id} n=${n} 无重叠`);
        else fail('B.不重叠', `${dev.id} n=${n} 重叠对`, overlaps.join('; '));

        // B4. 桌面渲染非回归
        if (!dev.touch && n <= 3) {
            if (Math.abs(m.s - 1) < 1e-6 && m.cols === n) pass('B.桌面渲染非回归', `${dev.id} n=${n} 渲染 s=1 cols=${n}`, `gap=${m.gap.toFixed(2)}px`);
            else fail('B.桌面渲染非回归', `${dev.id} n=${n} 期望 s=1,cols=${n}`, `实得 s=${m.s} cols=${m.cols}`);
        }

        // B5. 无残影
        if (m.closing === 0) pass('B.无残影', `${dev.id} n=${n} 无 .closing 残留`);
        else warn('B.无残影', `${dev.id} n=${n} 仍有 ${m.closing} 个 closing 残影`);

        // B6. 触摸目标 / 头部 / 主体的渲染后几何（W3 缩放补偿）
        try {
            const fit = await page.evaluate(measureFitInPage);
            if (!global.__touchRules) {
                try { global.__touchRules = await readTouchRules(page); } catch (_) {}
            }
            // A/B：把播放按钮改回补偿前的 44px 布局高，量 body 内容高度的变化
            let ab = null;
            if (dev.coarse) {
                ab = await page.evaluate(() => {
                    const win = [...document.querySelectorAll('.sd-window')].find(w => !w.classList.contains('minimized'));
                    if (!win) return null;
                    const body = win.querySelector('.sd-window-body');
                    const play = win.querySelector('.sd-play-btn');
                    const cur = { scrollH: body.scrollHeight, clientH: body.clientHeight, playOffH: play.offsetHeight };
                    const st = document.createElement('style'); st.id = '__abPrefix';
                    st.textContent = '.sd-play-btn{height:44px !important;}';
                    document.head.appendChild(st);
                    const pre = { scrollH: body.scrollHeight, clientH: body.clientHeight, playOffH: play.offsetHeight };
                    st.remove();
                    return { cur, pre };
                }).catch(() => null);
            }
            global.__fitObs = global.__fitObs || [];
            global.__fitObs.push({ device: dev.id, n, coarse: dev.coarse, ab, ...fit });
        } catch (e) {
            warn('B.触摸目标几何', `${dev.id} n=${n} 测量失败`, e.message.slice(0, 120));
        }

        if (n === 4) await page.screenshot({ path: path.join(SHOT_DIR, `debug-v304-touch-${dev.id}.png`) }).catch(() => {});
        // 手机两个重点场景单独留档（n=2 竖屏 / n=1 横屏），便于人工核对补偿后的触摸目标
        if (dev.id === 'phone-390x844' && n === 2) await page.screenshot({ path: path.join(SHOT_DIR, 'debug-v304-touch-phone-390x844-n2.png') }).catch(() => {});
        if (dev.id === 'phone-844x390' && n === 1) await page.screenshot({ path: path.join(SHOT_DIR, 'debug-v304-touch-phone-844x390-n1.png') }).catch(() => {});
    }
    global.__renderObs.push(...perDevice.map(x => ({ device: dev.id, n: x.n, s: x.s, cols: x.cols })));

    // 诊断：设备测量期间若发生意外导航（Vite HMR full-reload 等），布局快照会失真
    const navAfter = ctx.navCount();
    if (navAfter !== navBase) {
        warn('B.导航干扰', `${dev.id} 测量期间发生 ${navAfter - navBase} 次额外导航`,
            'dev server 的 full-reload 会重置页面；本脚本每次测量都重新注入函数，故断言仍有效');
    }
}

// ════════════════════════ C. 触摸行为 ════════════════════════
async function runTouchBehaviour(ctx, dev) {
    const { page } = ctx;
    await ctx.goto({ width: dev.w, height: dev.h, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    await ctx.waitReady();
    await ctx.waitViewportStable();

    // C0. 环境确认
    const env = await page.evaluate(() => ({ coarse: window.matchMedia('(pointer: coarse)').matches, vv: window.visualViewport.width, inner: window.innerWidth }));
    if (env.coarse) pass('C.环境', '触摸模拟下 isCoarsePointer 为真', `vv=${env.vv} innerWidth=${env.inner}（断言一律用 visualViewport）`);
    else fail('C.环境', '触摸模拟下 (pointer:coarse) 未命中 → 触摸路径未被测到', JSON.stringify(env));

    // C1. 触摸目标尺寸（单窗，s≈1.03）
    await ctx.closeAll();
    await ctx.openChars([CHARS[0]]);
    const m1 = await ctx.measure();
    const w0 = m1.wins[0];
    const closeOff = w0.closeOffset, closeEff = w0.close;
    const play = await page.evaluate(() => {
        const b = document.querySelector('.sd-play-btn');
        const r = b.getBoundingClientRect();
        return { offW: b.offsetWidth, offH: b.offsetHeight, effH: r.height };
    });
    if (closeOff.w >= 34 && closeOff.h >= 34) pass('C.触摸目标', `关闭按钮布局尺寸 ${closeOff.w}×${closeOff.h} ≥ 34`, 'S7 CSS 生效（默认 26）');
    else fail('C.触摸目标', `关闭按钮布局尺寸 ${closeOff.w}×${closeOff.h} < 34`, 'S7 媒体查询未生效');
    if (play.offH >= 44) pass('C.触摸目标', `播放按钮布局高 ${play.offH} ≥ 44`, 'S7 CSS 生效（默认 36）');
    else fail('C.触摸目标', `播放按钮布局高 ${play.offH} < 44`, 'S7 媒体查询未生效');
    if (closeEff.w >= 34 - 0.6 && play.effH >= 44 - 0.6) pass('C.触摸目标(有效)', `单窗 s=${m1.s.toFixed(3)} 时关闭 ${closeEff.w.toFixed(1)}px / 播放 ${play.effH.toFixed(1)}px`);
    else fail('C.触摸目标(有效)', `单窗 s=${m1.s.toFixed(3)} 时关闭 ${closeEff.w.toFixed(1)}px / 播放 ${play.effH.toFixed(1)}px 低于阈值`);

    // C2. 同字二次点击 = 聚焦；不重复开窗、不自动播放；.sd-flash 可观测
    const before = await page.evaluate(() => [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing')).length);
    const focusProbe = await page.evaluate(async (c) => {
        const m = await import('/src/modules/strokeDemoModal.js');
        m.openStrokeDemo(c);
        const live = [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing'));
        const w = live[0];
        return {
            count: live.length,
            flashClass: w.classList.contains('sd-flash'),
            animName: getComputedStyle(w).animationName,
            fgPlaying: w.querySelector('.sd-stage-fg').classList.contains('sd-playing'),
            fgOpacity: getComputedStyle(w.querySelector('.sd-stage-fg')).opacity,
            playText: w.querySelector('.sd-play-text').textContent.trim(),
        };
    }, CHARS[0]);
    if (before === 1 && focusProbe.count === 1) pass('C.同字聚焦', '同字二次调用仅 1 个窗口（聚焦非新建）', `count=${focusProbe.count}`);
    else fail('C.同字聚焦', '同字二次调用窗口数异常', `before=${before} after=${focusProbe.count}`);
    if (!focusProbe.fgPlaying && focusProbe.playText === '播放' && parseFloat(focusProbe.fgOpacity) === 0)
        pass('C.不自动播放', '聚焦后未自动播放', `fgPlaying=${focusProbe.fgPlaying} text=${focusProbe.playText} fgOpacity=${focusProbe.fgOpacity}`);
    else fail('C.不自动播放', '聚焦触发了播放', JSON.stringify(focusProbe));
    const cssRule = await page.evaluate(() => {
        for (const ss of document.styleSheets) {
            let rules; try { rules = ss.cssRules; } catch (_) { continue; }
            for (const r of rules) if (r.selectorText && r.selectorText.includes('.sd-window.sd-flash')) return r.cssText.slice(0, 120);
        }
        return null;
    });
    if (focusProbe.flashClass && /sd-flash-ring/.test(focusProbe.animName)) pass('C.sd-flash CSS', '.sd-flash 命中真实动画规则', `animationName=${focusProbe.animName}`);
    else fail('C.sd-flash CSS', '.sd-flash 无有效动画（S5 未修好）', `class=${focusProbe.flashClass} animationName=${focusProbe.animName}`);
    if (cssRule) pass('C.sd-flash CSSOM', '.sd-window.sd-flash 规则存在于样式表', cssRule);
    else fail('C.sd-flash CSSOM', '.sd-window.sd-flash 规则在样式表中不存在', 'S5 未修好');

    // C3. 多窗时有效触摸目标缩小（信息性）
    await ctx.closeAll();
    await ctx.openChars([CHARS[0], CHARS[1]]);
    const m2 = await ctx.measure();
    const eff2 = m2.wins[0].close;
    if (eff2 && eff2.w < 34 - 0.6) {
        warn('C.触摸目标(多窗)', `n=2 时 s=${m2.s.toFixed(3)}，关闭按钮有效尺寸 ${eff2.w.toFixed(1)}px < 34`,
            '布局 34px 被全局 transform:scale(s) 等比缩小：s<1 时跌破 34px 触摸指引');
    } else {
        pass('C.触摸目标(多窗)', `n=2 时 s=${m2.s.toFixed(3)}，关闭按钮有效尺寸 ${eff2 ? eff2.w.toFixed(1) : '?'}px`);
    }

    // C4. 拖拽 clamp
    await ctx.closeAll();
    await ctx.openChars([CHARS[0]]);
    const dragResult = await page.evaluate(async () => {
        const win = document.querySelector('.sd-window');
        const header = win.querySelector('.sd-window-header');
        const hr = header.getBoundingClientRect();
        const cx = hr.left + hr.width / 2, cy = hr.top + hr.height / 2;
        const mk = (type, x, y) => {
            const t = new Touch({ identifier: 1, target: header, clientX: x, clientY: y, pageX: x, pageY: y });
            const empty = type === 'touchend';
            return new TouchEvent(type, { touches: empty ? [] : [t], targetTouches: empty ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
        };
        const snap = () => { const r = win.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, free: win.classList.contains('sd-free') }; };
        header.dispatchEvent(mk('touchstart', cx, cy));
        document.dispatchEvent(mk('touchmove', cx + 4000, cy + 4000));
        const br = snap();
        document.dispatchEvent(mk('touchmove', cx - 8000, cy - 8000));
        const tl = snap();
        document.dispatchEvent(mk('touchend', cx, cy));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { br, tl, after: snap() };
    });
    const m4 = await ctx.measure();
    const brOk = insideViewport(dragResult.br, m4), tlOk = insideViewport(dragResult.tl, m4), afterOk = insideViewport(dragResult.after, m4);
    if (dragResult.br.free && dragResult.tl.free && brOk && tlOk && afterOk)
        pass('C.拖拽clamp', '拖到视口外后仍完全可达（双向）', `右下${fmtRect(dragResult.br)} 左上${fmtRect(dragResult.tl)} 抬起后${fmtRect(dragResult.after)}`);
    else fail('C.拖拽clamp', '拖拽后窗口出屏', `free=${dragResult.br.free}/${dragResult.tl.free} brOk=${brOk} tlOk=${tlOk} afterOk=${afterOk} ` +
        `右下${fmtRect(dragResult.br)} 左上${fmtRect(dragResult.tl)} vv=[${m4.vl},${m4.vt} ${m4.vw}x${m4.vh}]`);

    // C5. maximized 重置
    await ctx.closeAll();
    await ctx.openChars([CHARS[0]]);
    await page.evaluate(() => document.querySelector('.sd-window .sd-btn-max').click());
    await sleep(350);
    const maxedBefore = await page.evaluate(() => [...document.querySelectorAll('.sd-window')].filter(w => w.classList.contains('maximized')).length);
    await page.evaluate(async (c) => (await import('/src/modules/strokeDemoModal.js')).openStrokeDemo(c), CHARS[1]);
    await poll(async () => page.evaluate(() => [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing')).length === 2), 20000, 150);
    await sleep(500);
    const m5 = await ctx.measure();
    const maxedCount = m5.wins.filter(w => w.maximized).length;
    const outside5 = m5.wins.filter(w => !insideViewport(w.rect, m5));
    if (maxedBefore === 1 && maxedCount === 0 && outside5.length === 0)
        pass('C.max重置', '新窗口打开后旧 maximized 被重置，且全部在视口内', `之前 maximized=${maxedBefore} 之后=${maxedCount}`);
    else fail('C.max重置', 'maximized 未被正确重置', `maxedBefore=${maxedBefore} maxedAfter=${maxedCount} 出屏=${outside5.length} ` + m5.wins.map(w => `${w.char}:max=${w.maximized}${fmtRect(w.rect)}`).join(' '));

    await page.evaluate(() => { const w = [...document.querySelectorAll('.sd-window')].filter(x => !x.classList.contains('closing'))[0]; w.querySelector('.sd-btn-max').click(); });
    await sleep(300);
    await page.evaluate(() => { const w = [...document.querySelectorAll('.sd-window')].filter(x => !x.classList.contains('closing'))[1]; w.querySelector('.sd-btn-max').click(); });
    await sleep(400);
    const m5b = await ctx.measure();
    const maxedCount2 = m5b.wins.filter(w => w.maximized).length;
    const outside5b = m5b.wins.filter(w => !insideViewport(w.rect, m5b));
    if (maxedCount2 === 1 && outside5b.length === 0)
        pass('C.max唯一', '连续最大化两个窗口后仅 1 个 maximized 且在视口内', `maximized=${maxedCount2}`);
    else fail('C.max唯一', `同时存在 ${maxedCount2} 个 maximized（S10 场景）`, `出屏=${outside5b.length} ` + m5b.wins.map(w => `${w.char}:max=${w.maximized}${fmtRect(w.rect)}`).join(' '));

    // C6. 关闭即时重排
    await ctx.closeAll();
    await ctx.openChars([CHARS[0], CHARS[1], CHARS[2]]);
    const reflow = await page.evaluate(() => {
        const live = [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing'));
        const posOf = (w) => { const r = w.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; };
        const before = {};
        live.forEach(w => { before[w.dataset.char] = posOf(w); });
        const victim = live[0];
        const t0 = performance.now();
        victim.querySelector('.sd-btn-close').click();
        const remaining = [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing'));
        const after = {};
        remaining.forEach(w => { after[w.dataset.char] = posOf(w); });
        const syncMs = performance.now() - t0;
        return new Promise(res => requestAnimationFrame(() => {
            res({ syncMs, frameMs: performance.now() - t0, before, after, remaining: remaining.length });
        }));
    });
    const moved = Object.keys(reflow.after).filter(c => {
        const b = reflow.before[c], a = reflow.after[c];
        return b && (b[0] !== a[0] || b[1] !== a[1]);
    });
    if (reflow.remaining === 2 && moved.length >= 1 && reflow.syncMs < 160)
        pass('C.关闭即时重排', `关闭到重排 ${reflow.syncMs.toFixed(1)}ms（同步）/ ${reflow.frameMs.toFixed(1)}ms（下一帧）`,
            `剩余 2 窗，${moved.length} 个位置已改变（原实现固定 160ms 死等）`);
    else fail('C.关闭即时重排', '关闭未即时重排或耗时过长',
        `sync=${reflow.syncMs.toFixed(1)}ms frame=${reflow.frameMs.toFixed(1)}ms remaining=${reflow.remaining} moved=${moved.length}`);
    await sleep(500);
    const ghost = await page.evaluate(() => document.querySelectorAll('.sd-window.closing').length);
    if (ghost === 0) pass('C.残影清理', '关闭动画结束后残影已移除');
    else fail('C.残影清理', `仍有 ${ghost} 个 .closing 残影残留`);
}

// ════════════════════════ D. 桌面载重行为 ════════════════════════
async function runDesktopLoadBearing(ctx, dev) {
    const { page } = ctx;
    await ctx.goto({ width: dev.w, height: dev.h });
    await ctx.waitReady();

    await ctx.closeAll();
    await ctx.openChars([CHARS[0], CHARS[1], CHARS[2]]);
    let m = await ctx.measure();

    // D1. z 序阶梯 10003..10006
    const zs = m.wins.map(w => w.z);
    const sorted = [...zs].sort((a, b) => a - b);
    const ladder = sorted.every((v, i) => v === 10003 + i) && new Set(zs).size === zs.length;
    if (ladder) pass('D.z序', `z-index 阶梯正确 ${zs.join(',')}`, '10003 起、无重复');
    else fail('D.z序', 'z-index 阶梯异常', zs.join(','));

    // D2. 同字点击 = 聚焦（并记录新的最上层）
    const cntBefore = m.wins.length;
    await page.evaluate(async (c) => (await import('/src/modules/strokeDemoModal.js')).openStrokeDemo(c), CHARS[0]);
    await sleep(250);
    m = await ctx.measure();
    if (cntBefore === 3 && m.wins.length === 3) pass('D.同字聚焦', '桌面同字点击不新建窗口', `count=${m.wins.length}`);
    else fail('D.同字聚焦', '桌面同字点击新建了窗口', `before=${cntBefore} after=${m.wins.length}`);

    // D3. 最小化药丸 240×40 精确还原
    const pillChar = m.wins.reduce((a, b) => (b.z > a.z ? b : a)).char;   // 最上层（= 刚被聚焦的字）
    await page.evaluate((c) => { const w = [...document.querySelectorAll('.sd-window')].find(x => x.dataset.char === c); w.querySelector('.sd-btn-min').click(); }, pillChar);
    await sleep(350);
    m = await ctx.measure();
    const pill = m.wins.find(w => w.minimized);
    if (pill && Math.abs(pill.rect.w - 240) < 2 && Math.abs(pill.rect.h - 40) < 2) pass('D.药丸', '最小化药丸 240×40', `${pill.char}${fmtRect(pill.rect)}`);
    else fail('D.药丸', '最小化药丸尺寸异常', pill ? `${pill.char}${fmtRect(pill.rect)}` : '无 minimized 窗口');
    await page.evaluate(() => { const w = [...document.querySelectorAll('.sd-window')].find(x => x.classList.contains('minimized')); w.querySelector('.sd-btn-max').click(); });
    await sleep(350);
    m = await ctx.measure();
    const restored = m.wins.find(w => w.char === pillChar);
    if (restored && !restored.minimized && Math.abs(restored.rect.w - 340) < 2 && Math.abs(restored.rect.h - 440) < 2) pass('D.药丸还原', '恢复后回到 340×440', fmtRect(restored.rect));
    else fail('D.药丸还原', '恢复后尺寸异常', restored ? fmtRect(restored.rect) : '未找到');

    // D4. ESC 关最上层（按 z-index 判定"最上层"，而非 DOM 顺序）
    m = await ctx.measure();
    const topChar = m.wins.reduce((a, b) => (b.z > a.z ? b : a)).char;
    const beforeChars = m.wins.map(w => w.char);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await sleep(400);
    const mAfter = await ctx.measure();
    const afterChars = mAfter.wins.map(w => w.char);
    const closedTop = mAfter.wins.length === m.wins.length - 1 && !afterChars.includes(topChar);
    if (closedTop) pass('D.ESC', `ESC 关闭最上层(z=${m.wins.reduce((a, b) => (b.z > a.z ? b : a)).z} ${topChar})`, `${beforeChars.join('')} → ${afterChars.join('')}`);
    else fail('D.ESC', 'ESC 未关闭最上层', `最上层=${topChar} ${beforeChars.join('')} → ${afterChars.join('')}`);
}

// ════════════════════════ B7. W3 触摸目标验收 ════════════════════════
/**
 * 断言"渲染后（post-transform）"的有效触摸目标 ≥ 34 / 44 / 22。
 * 仅在粗略指针设备上断言：精细指针（桌面鼠标）下该媒体查询刻意不生效，
 * 桌面走 26/36/14 的原始尺寸是设计意图（见 CSS S7 注释与 deviceEnv 契约）。
 */
function assertTouchTargets() {
    const obs = (global.__fitObs || []).slice();
    const rules = global.__touchRules || {};

    // ── 拇指：由实测 s + 实测 CSSOM 规则推导（本环境无法直接测该伪元素，见 readTouchRules 注释） ──
    // 补偿表达式现已搬进 --sd-thumb，resolveCompRule 会自动跟随 var() 解析。
    const thumbComp = resolveCompRule(rules, 'thumb');
    const thumbRule = thumbComp.pc;
    const thumbEff = (s) => {
        if (!thumbRule) return null;
        const layout = Math.min(thumbRule.cap, Math.max(thumbRule.base, thumbRule.inner / s));
        return { layout, eff: layout * s, saturated: thumbRule.inner / s > thumbRule.cap };
    };

    // ── 紧凑测量表 ──
    console.log('  device              n |    s     | close eff/layout | close visible | play eff/layout | thumb eff* | header | body scrollH/clientH padB | infoClip');
    for (const d of DEVICES) {
        for (const r of obs.filter(x => x.device === d.id).sort((a, b) => a.n - b.n)) {
            const c0 = r.close[0];
            const c = c0 ? `${c0.effW.toFixed(1)}/${c0.offW}` : '-';
            const vis = c0 ? `${Math.max(0, c0.effW - c0.clipLeft - c0.clipRight).toFixed(1)}x${Math.max(0, c0.effH - c0.clipTop - c0.clipBottom).toFixed(1)}` : '-';
            const p = r.play ? `${r.play.effH.toFixed(1)}/${r.play.offH}` : '-';
            // 拇指推导只在粗略指针下成立（精细指针刻意不命中该媒体查询，拇指仍为 14px）
            const t = d.coarse ? thumbEff(r.s) : null;
            const th = d.coarse ? (t ? `${t.eff.toFixed(1)}${t.saturated ? '!' : ''}` : 'n/a') : 'n/a(细指针)';
            const hdr = r.header ? (r.header.hScrollW > r.header.hClientW + 1 ? `OVF ${r.header.hScrollW}>${r.header.hClientW}` : `ok ${r.header.tW.toFixed(0)}px`) : '-';
            const bod = r.body ? `${r.body.scrollH}/${r.body.clientH} ${r.body.padBottom.toFixed(0)}` : '-';
            const clip = r.body ? (r.body.infoBottom - r.body.bodyBottom) : null;
            console.log(`  ${d.id.padEnd(19)} ${r.n} | ${r.s.toFixed(4)} | ${c.padEnd(16)} | ${vis.padEnd(13)} | ${p.padEnd(15)} | ${th.padEnd(10)} | ${hdr.padEnd(6)} | ${bod.padEnd(24)} | ${clip === null ? '-' : clip.toFixed(2)}`);
        }
    }

    for (const d of DEVICES.filter(x => x.coarse)) {
        const rows = obs.filter(x => x.device === d.id);
        if (!rows.length) { fail('B7.触摸目标', `${d.id} 无测量数据`); continue; }

        const closeBad = [], visBad = [], playBad = [], thumbBad = [];
        for (const r of rows) {
            for (const c of r.close) {
                if (c.effW < T_CLOSE - 0.6 || c.effH < T_CLOSE - 0.6)
                    closeBad.push(`n=${r.n}${c.minimized ? '(药丸)' : ''} ${c.effW.toFixed(1)}×${c.effH.toFixed(1)} @s=${r.s.toFixed(4)}`);
                const vw = c.effW - c.clipLeft - c.clipRight, vh = c.effH - c.clipTop - c.clipBottom;
                if (vw < T_CLOSE - 0.6 || vh < T_CLOSE - 0.6)
                    visBad.push(`n=${r.n}${c.minimized ? '(药丸)' : ''} ${vw.toFixed(1)}×${vh.toFixed(1)}（裁上${c.clipTop.toFixed(2)}/下${c.clipBottom.toFixed(2)}）@s=${r.s.toFixed(4)}`);
            }
            if (r.play && r.play.effH < T_PLAY - 0.6) playBad.push(`n=${r.n} ${r.play.effH.toFixed(1)} @s=${r.s.toFixed(4)}`);
            const t = thumbEff(r.s);
            if (t && (t.eff < T_THUMB - 0.8 || t.saturated)) thumbBad.push(`n=${r.n} ${t.eff.toFixed(1)}${t.saturated ? '(触顶饱和)' : ''} @s=${r.s.toFixed(4)}`);
        }
        const minS = Math.min(...rows.map(r => r.s));
        const minClose = Math.min(...rows.flatMap(r => r.close.map(c => c.effW)));
        const minVis = Math.min(...rows.flatMap(r => r.close.map(c => Math.min(c.effW - c.clipLeft - c.clipRight, c.effH - c.clipTop - c.clipBottom))));
        const minPlay = Math.min(...rows.filter(r => r.play).map(r => r.play.effH));
        const minThumb = Math.min(...rows.map(r => (thumbEff(r.s) || { eff: NaN }).eff));

        if (closeBad.length === 0) pass('B7.关闭目标≥34(rect)', `${d.id} n=1..4 全部达标`, `最小有效 ${minClose.toFixed(1)}px（min s=${minS.toFixed(4)}）`);
        else fail('B7.关闭目标≥34(rect)', `${d.id} ${closeBad.length} 例 <34px`, closeBad.join('; '));

        if (visBad.length === 0) pass('B7.关闭目标≥34(可见/去裁切)', `${d.id} n=1..4 全部达标`, `最小可见 ${minVis.toFixed(1)}px`);
        else fail('B7.关闭目标≥34(可见/去裁切)', `${d.id} ${visBad.length} 例实际可见 <34px`, visBad.join('; '));

        if (playBad.length === 0) pass('B7.播放目标≥44', `${d.id} n=1..4 全部达标`, `最小有效 ${minPlay.toFixed(1)}px`);
        else fail('B7.播放目标≥44', `${d.id} ${playBad.length} 例 <44px`, playBad.join('; '));

        if (!thumbRule) warn('B7.滑块目标≥22(推导)', `${d.id} 未取到拇指 clamp 规则`);
        else if (thumbBad.length === 0) pass('B7.滑块目标≥22(推导)', `${d.id} n=1..4 全部达标`, `最小推导有效 ${minThumb.toFixed(1)}px（rule: ${thumbComp.varDecl || thumbComp.rawDecl}）`);
        else fail('B7.滑块目标≥22(推导)', `${d.id} ${thumbBad.length} 例 <22px 或触顶`, thumbBad.join('; '));
    }

    // ── 补偿规则：声明可引用 --sd-*，但最终必须解析为 clamp(base, base/var(--sd-s), cap) ──
    //    且规则与变量定义都必须落在 (hover:none),(pointer:coarse) 块内；base 固定 34/44/22。
    const EXPECT_BASE = { close: 34, play: 44, thumb: 22 };
    const VAR_NAME = { close: '--sd-btn', play: '--sd-play', thumb: '--sd-thumb' };
    const ruleProblems = [];
    const ruleSummary = [];
    for (const k of ['close', 'play', 'thumb']) {
        const comp = resolveCompRule(rules, k);
        const host = rules[k];
        ruleSummary.push(`${k}:${host ? host.decl : 'missing'}→${comp.varName || '(字面)'}=${comp.varDecl || comp.rawDecl}`);
        if (!host) { ruleProblems.push(`${k}: 未找到规则`); continue; }
        if (!host.inTouch) ruleProblems.push(`${k}: 规则不在触摸媒体查询内`);
        if (comp.varName) {
            if (comp.varName !== VAR_NAME[k]) ruleProblems.push(`${k}: 引用 ${comp.varName}，期望 ${VAR_NAME[k]}`);
            if (!comp.varInTouch) ruleProblems.push(`${k}: ${comp.varName} 未在触摸媒体查询内定义`);
        }
        if (!comp.pc) { ruleProblems.push(`${k}: 声明非 clamp(base, base/var(--sd-s), cap)（实得 ${comp.varDecl || comp.rawDecl}）`); continue; }
        const b = EXPECT_BASE[k];
        if (comp.pc.base !== b || comp.pc.inner !== b) ruleProblems.push(`${k}: base 应为 ${b}px，实得 base=${comp.pc.base} inner=${comp.pc.inner}`);
        if (comp.pc.cap < comp.pc.base) ruleProblems.push(`${k}: cap ${comp.pc.cap} < base ${comp.pc.base}`);
    }
    if (ruleProblems.length === 0) {
        pass('B7.补偿规则', '三条补偿规则位于触摸媒体查询内，且均解析为 clamp(base, base/var(--sd-s), cap)（base 34/44/22）',
            ruleSummary.join(' | '));
    } else {
        fail('B7.补偿规则', '补偿规则不满足契约（缺失 / 不在触摸媒体查询内 / base 不符）', ruleProblems.join('; '));
    }

    // ── 盒内守恒：冻结 340×440 盒里 --sd-hdr + body 内容 <= 440，且 header/body 内部不溢出 ──
    //    这是本轮"一致空间重分配"的核心不变量；药丸单列检查 header（上轮缺陷就在这）。
    const boxObs = obs.filter(x => x.coarse && x.windows);
    const boxBad = [];
    let worstStage = null;   // 有效舞台最小者
    let worstSum = null;
    for (const r of boxObs) {
        for (const w of r.windows) {
            // hdrH = --sd-hdr 的已求值布局高（header used height）；bodyScrollH 为布局单位。
            const sum = w.hdrH + (w.bodyScrollH || 0);
            if (!worstSum || sum > worstSum.sum) worstSum = { sum, r, w };
            if (sum > 440 + 0.5)
                boxBad.push(`${r.device}/n=${r.n}${w.minimized ? '(药丸)' : ''} --sd-hdr ${w.hdrH.toFixed(1)} + body ${w.bodyScrollH} = ${sum.toFixed(1)} > 440`);
            if (w.bodyScrollH !== null && w.bodyScrollH > w.bodyClientH + 1)
                boxBad.push(`${r.device}/n=${r.n} body scrollH ${w.bodyScrollH} > clientH ${w.bodyClientH}`);
            if (w.hdrScrollH !== null && w.hdrScrollH > w.hdrClientH + 1)
                boxBad.push(`${r.device}/n=${r.n}${w.minimized ? '(药丸)' : ''} header scrollH ${w.hdrScrollH} > clientH ${w.hdrClientH}`);
            // 药丸 body 为 display:none（无舞台），不参与舞台评估
            if (!w.minimized && w.stageEff !== null && w.stageEff > 0 && (!worstStage || w.stageEff < worstStage.eff))
                worstStage = { eff: w.stageEff, off: w.stageOff, r, w };
        }
    }
    if (!boxObs.length) {
        warn('B7.盒内守恒(340×440)', '无窗口盒测量数据');
    } else if (boxBad.length === 0) {
        pass('B7.盒内守恒(340×440)', `${boxObs.length} 例：--sd-hdr+body ≤440 且 header/body 均 scrollH≤clientH（含药丸）`,
            `最大占用 ${worstSum.sum.toFixed(1)}px（${worstSum.r.device}/n=${worstSum.r.n}${worstSum.w.minimized ? '(药丸)' : ''}，--sd-hdr=${worstSum.w.hdrH.toFixed(1)} body=${worstSum.w.bodyScrollH}）`);
    } else {
        fail('B7.盒内守恒(340×440)', `${boxBad.length} 处越界/内部溢出`, boxBad.slice(0, 8).join('; '));
    }

    // ── 舞台让位是否过度：最坏有效舞台尺寸（补偿的来源，也是唯一被牺牲项）──
    if (worstStage) {
        const eff = worstStage.eff, off = worstStage.off;
        const detail = `最坏 ${worstStage.r.device}/n=${worstStage.r.n} s=${worstStage.r.s.toFixed(4)}：布局 ${off}px × s = 有效 ${eff.toFixed(1)}px（补偿前 260×s=${(260 * worstStage.r.s).toFixed(1)}px）`;
        if (eff >= 120) pass('B7.舞台让位可接受', '有效舞台 ≥120px，汉字仍可辨识', detail);
        else warn('B7.舞台让位可接受', `有效舞台仅 ${eff.toFixed(1)}px，可能影响辨识`, detail);
    }

    // ── 头部装得下（横向，取补偿生效设备中的最坏 s） ──
    const hdrRows = obs.filter(x => x.header && x.coarse);
    if (hdrRows.length) {
        const worst = hdrRows.reduce((a, b) => (b.s < a.s ? b : a));
        const h = worst.header;
        const overflow = h.cR > h.hR + 1 || h.hScrollW > h.hClientW + 1;
        if (!overflow && h.tW > 20)
            pass('B7.头部装得下(横向)', `最坏 s=${worst.s.toFixed(4)}（${worst.device} n=${worst.n}）三按钮+标题不溢出 340px`,
                `窗口宽 ${h.winW.toFixed(1)} 按钮 ${h.btnW.toFixed(1)}×${h.btnH.toFixed(1)} 控件组 ${h.cW.toFixed(1)} 标题 ${h.tW.toFixed(1)}px scroll ${h.hScrollW}/${h.hClientW}`);
        else
            fail('B7.头部装得下(横向)', `最坏 s=${worst.s.toFixed(4)} 头部溢出或标题被压没`,
                `overflow=${overflow} 标题宽 ${h.tW.toFixed(1)} 控件右缘 ${h.cR.toFixed(1)} header 右缘 ${h.hR.toFixed(1)} scroll ${h.hScrollW}/${h.hClientW}`);
    } else warn('B7.头部装得下(横向)', '无头部测量数据');

    // ── 头部纵向：补偿后的按钮不得高出 40px 标题栏而被 .sd-window{overflow:hidden} 裁掉 ──
    const vertBad = [];
    for (const r of obs.filter(x => x.coarse)) {
        for (const c of r.close) {
            const clip = c.clipTop + c.clipBottom;
            if (clip > 0.5) vertBad.push(`${r.device}/n=${r.n}${c.minimized ? '(药丸)' : ''} @s=${r.s.toFixed(4)} 裁上${c.clipTop.toFixed(2)}+下${c.clipBottom.toFixed(2)}=${clip.toFixed(2)}px`);
        }
    }
    if (vertBad.length === 0) {
        pass('B7.按钮不被标题栏裁切', '所有补偿后的控制按钮完整落在窗口盒内（无 overflow:hidden 裁切）');
    } else {
        const worst = vertBad[0];
        fail('B7.按钮不被标题栏裁切', `${vertBad.length} 例被窗口 overflow:hidden 纵向裁掉`,
            `窗口内容盒仅 40px（标题栏），按钮按 34/s 放大后在 s<0.85 时超出；例：` + vertBad.slice(0, 6).join('; '));
    }

    // ── 主体：真正的裁切判据 = 内容越过 padding box（或信息行越出 body） ──
    const bodyObs = obs.filter(x => x.body);
    const realClip = bodyObs.filter(x => (x.body.scrollH - x.body.clientH - x.body.padBottom > 1) || x.body.infoVisible === false);
    const benign = bodyObs.filter(x => !((x.body.scrollH - x.body.clientH - x.body.padBottom > 1) || x.body.infoVisible === false) && x.body.scrollH > x.body.clientH + 1);
    const abRows = bodyObs.filter(x => x.ab);
    const abWorst = abRows.length ? abRows.reduce((a, b) => ((b.ab.cur.scrollH - b.ab.pre.scrollH) > (a.ab.cur.scrollH - a.ab.pre.scrollH) ? b : a)) : null;

    if (realClip.length === 0) {
        pass('B7.主体不裁切', `${bodyObs.length} 例内容未越过 padding box，信息行全部可见`,
            benign.length ? `${benign.length} 例仅"侵入 padding"（scrollH>clientH 但未越界，视觉无碍）` : '无任何溢出');
    } else {
        fail('B7.主体不裁切', `${realClip.length}/${bodyObs.length} 例信息行被裁`,
            realClip.map(x => `${x.device}/n=${x.n} s=${x.s.toFixed(4)} info 越出 body ${(x.body.infoBottom - x.body.bodyBottom).toFixed(2)}px（scrollH ${x.body.scrollH}, clientH ${x.body.clientH}, padB ${x.body.padBottom}）`).join('; '));
    }
    if (abWorst) {
        const d = abWorst.ab.cur.scrollH - abWorst.ab.pre.scrollH;
        const msg = `A/B 实测：把播放按钮还原成补偿前的 44px 布局高，body 内容高度变化最大为 ${d}px（${abWorst.device}/n=${abWorst.n} s=${abWorst.s.toFixed(4)}：play ${abWorst.ab.cur.playOffH}px→${abWorst.ab.pre.playOffH}px，scrollH ${abWorst.ab.cur.scrollH}→${abWorst.ab.pre.scrollH}）`;
        if (d > 0) warn('B7.主体溢出归因', '补偿是 body 内容增高的直接原因（补偿前 28/28 例均恰好 398=clientH）', msg);
        else pass('B7.主体溢出归因', '补偿未改变 body 内容高度', msg);
    }
}


// ════════════════════════ E. W4 视口纯平移验收 ════════════════════════
async function runPanFix(ctx) {
    // dev server 的 HMR full-reload 可能在测量中途销毁执行上下文；此处重试一次
    for (let attempt = 1; attempt <= 2; attempt++) {
        const snapshot = results.length;      // 失败重试时丢弃半途记录，避免重复计数
        try { return await runPanFixOnce(ctx); }
        catch (err) {
            results.length = snapshot;
            const transient = /Execution context was destroyed|Target closed|Session closed|Cannot find context/i.test(err.message);
            if (transient && attempt === 1) { console.log('  (E 段遇到页面重载，重试一次…)'); await sleep(600); continue; }
            throw err;
        }
    }
}

async function runPanFixOnce(ctx) {
    const { page } = ctx;
    await ctx.goto({ width: 800, height: 1280, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.waitReady();
    await ctx.waitViewportStable();
    await ctx.closeAll();
    const opened = await ctx.openChars([CHARS[0], CHARS[1]]);
    if (!opened) warn('E.场景', '两窗未在 30s 内就绪，测量可能失真');

    // (1) 无变化的 scroll/resize 不应触发回调（去抖 + 变化判定）
    const noop = await page.evaluate(async () => {
        const { onViewportChange } = await import('/src/utils/deviceEnv.js');
        let fired = 0;
        const un = onViewportChange(() => fired++);
        const vv = window.visualViewport;
        try { vv.dispatchEvent(new Event('scroll')); } catch (e) {}
        try { vv.dispatchEvent(new Event('resize')); } catch (e) {}
        window.dispatchEvent(new Event('resize'));
        await new Promise(r => setTimeout(r, 400));
        un();
        return { fired };
    });
    if (noop.fired === 0) pass('E.无变化不重排', '尺寸与偏移均未变时不触发回调（无谓重排被抑制）');
    else warn('E.无变化不重排', `尺寸与偏移均未变时仍触发 ${noop.fired} 次回调`, '可能为真实视口抖动；非致命');

    // (2) 纯平移：offset 变、尺寸不变 → 必须触发重排，且 overlay 重新对准可视区
    const PAN_L = 212, PAN_T = 90;
    const pan = await page.evaluate(async ({ PAN_L, PAN_T }) => {
        const vv = window.visualViewport;
        const { onViewportChange } = await import('/src/utils/deviceEnv.js');
        const rects = () => [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing'))
            .map(w => { const r = w.getBoundingClientRect(); return { char: w.dataset.char, l: r.left, t: r.top, r: r.right, b: r.bottom }; });
        const ovRect = () => { const r = document.querySelector('.sd-overlay').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const base = { l: vv.offsetLeft, t: vv.offsetTop, w: vv.width, h: vv.height };
        const rectsBefore = rects(), ovBefore = ovRect();
        let fired = 0;
        const un = onViewportChange(() => { fired++; });
        const fake = { l: base.l + PAN_L, t: base.t + PAN_T };
        let patchOk = false;
        try {
            Object.defineProperty(vv, 'offsetLeft', { get: () => fake.l, configurable: true });
            Object.defineProperty(vv, 'offsetTop', { get: () => fake.t, configurable: true });
            patchOk = (vv.offsetLeft === fake.l && vv.offsetTop === fake.t);
        } catch (e) { patchOk = false; }
        // 真实设备"双指缩放后平移"由 visualViewport 的 scroll 事件上报（尺寸不变）
        try { vv.dispatchEvent(new Event('scroll')); } catch (e) {}
        await new Promise(r => setTimeout(r, 650));
        const ovAfter = ovRect(), rectsAfter = rects();
        un();
        try { delete vv.offsetLeft; delete vv.offsetTop; } catch (e) {}
        return {
            base, fake, patchOk, fired, ovBefore, ovAfter, rectsBefore, rectsAfter,
            restored: { l: vv.offsetLeft, t: vv.offsetTop }, vw: vv.width, vh: vv.height,
        };
    }, { PAN_L, PAN_T });

    const fr = (r) => `[${r.l.toFixed(1)},${r.t.toFixed(1)} ${(r.r - r.l).toFixed(1)}x${(r.b - r.t).toFixed(1)}]`;
    console.log(`  平移前 vv=(${pan.base.l},${pan.base.t}) ${pan.base.w}x${pan.base.h}；平移后 vv=(${pan.fake.l},${pan.fake.t})（尺寸不变）`);
    console.log(`  回调触发 ${pan.fired} 次；offset 注入 ${pan.patchOk ? '成功' : '失败'}；还原后 vv=(${pan.restored.l},${pan.restored.t})`);
    console.log(`  overlay ${fr(pan.ovBefore)} → ${fr(pan.ovAfter)}`);
    console.log(`  平移前窗口 ` + pan.rectsBefore.map(x => `${x.char}${fr({ l: x.l, t: x.t, r: x.r, b: x.b })}`).join(' '));
    console.log(`  平移后窗口 ` + pan.rectsAfter.map(x => `${x.char}${fr({ l: x.l, t: x.t, r: x.r, b: x.b })}`).join(' '));

    const vis = { vl: pan.fake.l, vt: pan.fake.t, vw: pan.vw, vh: pan.vh };
    const clipped = (rs) => rs.filter(r => r.l < vis.vl - TOL || r.r > vis.vl + vis.vw + TOL || r.t < vis.vt - TOL || r.b > vis.vt + vis.vh + TOL);
    const clipAmt = (rs) => Math.max(0, ...rs.map(r => Math.max(vis.vl - r.l, r.r - (vis.vl + vis.vw), vis.vt - r.t, r.b - (vis.vt + vis.vh))));
    const before = clipped(pan.rectsBefore), after = clipped(pan.rectsAfter);
    const amtBefore = clipAmt(pan.rectsBefore);

    if (!pan.patchOk) {
        warn('E.纯平移重排', 'visualViewport.offset* 不可注入 → 无法端到端验证纠偏', '仅验证了监听路径');
    } else if (after.length === 0 && pan.fired >= 1 && amtBefore > 1) {
        pass('E.纯平移重排', `offset 变、尺寸不变 → 触发 ${pan.fired} 次并重新对准可视区`,
            `不纠偏则会被裁 ${amtBefore.toFixed(0)}px（平移前 ${before.length}/${pan.rectsBefore.length} 窗已在目标可视区外）；纠偏后 ${after.length} 窗被裁`);
    } else if (after.length > 0) {
        fail('E.纯平移重排', `平移后仍有 ${after.length} 窗被裁`,
            `fired=${pan.fired} ` + after.map(r => `${r.char}${fr({ l: r.l, t: r.t, r: r.r, b: r.b })}`).join('; ') + ` 可视区=[${vis.vl},${vis.vt} ${vis.vw}x${vis.vh}]`);
    } else {
        warn('E.纯平移重排', `触发 ${pan.fired} 次但基线已在目标可视区内，区分度不足`, '未能构造出"纠偏前被裁"的对照');
    }
}


main().catch(err => {
    console.error('未捕获错误:', err);
    process.exit(1);
});
