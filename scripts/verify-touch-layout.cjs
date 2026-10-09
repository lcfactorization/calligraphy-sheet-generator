#!/usr/bin/env node
/**
 * verify-touch-layout.cjs — 触屏 / mobile 布局完整性关口
 * ============================================================================
 * 目的：把"DOM 跑偏 / 控件错位"变成可量化、可重跑的断言，而不是主观印象。
 *
 * 每设备 7 组断言：
 *   L1 横向溢出   —— documentElement/body 的 scrollWidth 不得超过可视视口宽度
 *   L2 出屏元素   —— 不得有可见元素越过视口左右边界；
 *                    只报"根 offending 元素"（父级已出屏则不重复计），避免级联噪声。
 *                    祖先为 overflow-x:auto/scroll 且容器本身在屏内 → 超出部分由
 *                    该容器滚动条承接（A4 字帖在手机上的既定设计），不判 FAIL；
 *                    祖先为 hidden/clip（静默裁切、滚不到）仍判 FAIL。
 *   L3 固定控件重叠 —— 屏幕上的 fixed 交互控件两两不得重叠（历史上 print/history
 *                    两个 FAB 曾像素级完全重叠）
 *   L3b FAB 压按钮 —— fixed 控件不得压住流程中的交互控件（≥25% 判 FAIL）：
 *                    FAB 与页头按钮一个 fixed 一个流程，L3 抓不到这类遮挡
 *   L4 触摸目标   —— 可见交互控件最小边长 ≥ 44px（< 34px 记 FAIL，34–43 记 WARN）
 *   L5 抽屉可达   —— 打开侧栏抽屉后，抽屉本体与其内部全部控件必须完整落在视口内
 *   L6 滚动可达性 —— 横向滚动容器滚到两端后，子元素不得仍有部分停在容器内侧之外
 *                    （overflow-x:auto + justify-content:flex-end/center 的经典死区；
 *                     Chrome 不计左侧溢出到 scrollWidth，所以只能几何判定）
 *
 * 测量前会先跳过新手引导（引导浮层按设计就要盖住控件，不属常态 UI），并等 toast 消失。
 * 豁免：处于收起态的 off-canvas 抽屉（.app-sidebar / .history-sidebar 无 .open）
 *       本身就在屏外，属设计意图，不计入 L2/L3。
 *
 * 运行：
 *   node scripts/verify-touch-layout.cjs [--url <file|http>] [--out <dir>] [--only <id子串>]
 *   每次运行先跑 10 项负控夹具（关口自证），自证失败直接退出 3（判据已失效，绿了也不能信）
 *   退出码：任一 FAIL → 1；仅 WARN → 0；夹具自证失败 → 3
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const TOL = 2;                       // 像素容差
const FAIL_TARGET = 34;              // 最小边长低于此 = FAIL
const GOOD_TARGET = 44;              // WCAG 2.5.5 目标尺寸

const DEFAULT_URL = 'file://' + path.join(ROOT, 'dist', 'index.html').replace(/\\/g, '/');

const DEVICES = [
    { id: 'phone-390x844', w: 390, h: 844, touch: true },
    { id: 'phone-844x390', w: 844, h: 390, touch: true },
    { id: 'phone-360x740', w: 360, h: 740, touch: true },
    { id: 'tablet-800x1280', w: 800, h: 1280, touch: true },
    { id: 'tablet-820x1180', w: 820, h: 1180, touch: true },
    { id: 'tablet-1180x820', w: 1180, h: 820, touch: true },
    { id: 'laptop-1280x800', w: 1280, h: 800, touch: false },
    { id: 'desktop-1920x1080', w: 1920, h: 1080, touch: false },
];

function findChrome() {
    const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
    const found = [];
    if (fs.existsSync(cacheDir)) {
        for (const v of fs.readdirSync(cacheDir)) {
            found.push(path.join(cacheDir, v, 'chrome-win64', 'chrome.exe'));
            found.push(path.join(cacheDir, v, 'chrome-linux64', 'chrome'));
            found.push(path.join(cacheDir, v, 'chrome-linux', 'chrome'));
        }
    }
    for (const p of found) if (fs.existsSync(p)) return p;
    return puppeteer.executablePath();
}

const args = process.argv.slice(2);
function argVal(flag, dflt) {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const URL_ = argVal('--url', DEFAULT_URL);
const OUT = argVal('--out', path.join(ROOT, '_touch_layout_report'));
const ONLY = argVal('--only', '');

const rows = [];
let nFail = 0, nWarn = 0, nPass = 0;
function record(device, group, name, status, detail) {
    rows.push({ device, group, name, status, detail });
    if (status === 'FAIL') nFail++; else if (status === 'WARN') nWarn++; else nPass++;
    console.log(`  [${status}] ${device} ${group}/${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * 页内测量：返回结构化几何事实。
 * 全部断言基于 visualViewport（isMobile 下 innerWidth ≠ 实际可见宽度）。
 * 注意：本函数会被序列化后在页面上下文执行，因此**不得**引用模块作用域常量，
 * 需要的外部数值一律通过参数传入。
 */
function collectPageGeometry(TOL, GOOD_TARGET) {
    const vv = window.visualViewport;
    const vw = Math.round(vv ? vv.width : window.innerWidth);
    const vh = Math.round(vv ? vv.height : window.innerHeight);

    const sel = (el) => {
        let s = el.tagName.toLowerCase();
        if (el.id) return s + '#' + el.id;
        const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) s += '.' + cls.join('.');
        const p = el.parentElement;
        if (p && p.id) s = '#' + p.id + ' > ' + s;
        else if (p) {
            const pc = (typeof p.className === 'string' ? p.className : '').trim().split(/\s+/)[0];
            if (pc) s = '.' + pc + ' > ' + s;
        }
        return s;
    };
    const text = (el) => ((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28)) || el.getAttribute('aria-label') || '';

    // 收起态 off-canvas 抽屉及其子孙：设计上就在屏外
    const collapsedDrawerSel = '.app-sidebar:not(.open), .history-sidebar:not(.open)';
    const collapsedHosts = new Set(document.querySelectorAll(collapsedDrawerSel));
    function inCollapsedDrawer(el) {
        for (let n = el; n; n = n.parentElement) if (collapsedHosts.has(n)) return true;
        return false;
    }

    const cs = (el) => getComputedStyle(el);
    function isVisible(el) {
        const st = cs(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    /**
     * "画在屏幕上"的矩形：getBoundingClientRect 给的是未裁剪的布局盒，
     * 滚动/裁切容器里的内容布局上很宽、实际只画出一截。判断遮挡必须用裁切后的盒子，
     * 否则会把"滚动区里被裁掉的半个链接"误判成"FAB 压住了它"。
     * fixed 元素的包含块是视口，祖先 overflow 裁不到它（无 transform 祖先时）。
     */
    function paintedRect(el) {
        const a = el.getBoundingClientRect();
        let l = a.left, t = a.top, r = a.right, b = a.bottom;
        if (cs(el).position === 'fixed') return { l, t, r, b, w: a.width, h: a.height };
        for (let n = el.parentElement; n; n = n.parentElement) {
            const st = cs(n);
            const cr = n.getBoundingClientRect();
            if (st.overflowX !== 'visible') {
                const inset = n.clientLeft || 0;
                l = Math.max(l, cr.left + inset);
                r = Math.min(r, cr.right - inset);
            }
            if (st.overflowY !== 'visible') {
                const inset = n.clientTop || 0;
                t = Math.max(t, cr.top + inset);
                b = Math.min(b, cr.bottom - inset);
            }
        }
        return { l, t, r, b, w: Math.max(0, r - l), h: Math.max(0, b - t) };
    }

    // ── L1 横向溢出 ──
    const de = document.documentElement, bd = document.body;
    const overflow = {
        vw, vh,
        docScrollWidth: de.scrollWidth,
        bodyScrollWidth: bd.scrollWidth,
        docClientWidth: de.clientWidth,
        // 造成溢出的最宽元素（用于定位元凶）
        widest: Array.from(document.querySelectorAll('body *'))
            .filter(el => !inCollapsedDrawer(el) && isVisible(el))
            .map(el => ({ s: sel(el), t: text(el), w: Math.round(el.getBoundingClientRect().width),
                          sw: el.scrollWidth }))
            .sort((a, b) => b.w - a.w).slice(0, 8)
    };

    // ── L2 出屏元素（只报根 offender） ──
    // 判据是"用户滚不到"，不是"画到视口外"。几何做法：累加所有可横向滚动祖先
    // 的可滚量 (scrollWidth - clientWidth)，元素越界量若落在可滚范围内即视为可达。
    // overflow-x:hidden 不提供可滚量 → 静默裁切照旧判 FAIL；
    // position:fixed 的包含块是视口，祖先滚动条帮不了它 → 可滚量记 0。
    function scrollSlack(el) {
        if (cs(el).position === 'fixed') return { slack: 0, by: null };
        let slack = 0, by = null;
        for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
            const ox = cs(n).overflowX;
            if (ox !== 'auto' && ox !== 'scroll') continue;
            const room = n.scrollWidth - n.clientWidth;
            if (room > 0) { slack += room; if (!by) by = sel(n); }
        }
        return { slack, by };
    }
    const offenders = [];
    const scrollClipped = [];   // 越界但由滚动容器承接（信息，不判 FAIL）
    (function walk(el, parentBad) {
        for (const c of el.children) {
            let bad = false;
            if (!inCollapsedDrawer(c) && isVisible(c)) {
                const r = c.getBoundingClientRect();
                if (r.left < -TOL || r.right > vw + TOL) {
                    const { slack, by } = scrollSlack(c);
                    if (r.right > vw + slack + TOL || r.left < -(slack + TOL)) {
                        bad = true;
                        offenders.push({
                            s: sel(c), t: text(c),
                            left: Math.round(r.left), right: Math.round(r.right),
                            w: Math.round(r.width), h: Math.round(r.height),
                            pos: cs(c).position,
                            why: by ? `超出可滚动范围(+${slack}px)` : (slack ? '可滚量不足' : '无滚动祖先/静默裁切')
                        });
                    } else {
                        scrollClipped.push({ s: sel(c), by });
                    }
                }
            }
            walk(c, bad || parentBad);
        }
    })(document.body, false);

    // ── L3 固定控件两两重叠 ──
    const fixedEls = Array.from(document.querySelectorAll('body *')).filter(el => {
        if (inCollapsedDrawer(el)) return false;
        const st = cs(el);
        if (st.position !== 'fixed') return false;
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        // 忽略铺满全屏的遮罩/容器（backdrop、body::before 替代品）
        if (r.width >= vw * 0.9 && r.height >= vh * 0.9) return false;
        // 只要真正可点的（按钮/链接/带 onclick 的容器）
        return /^(BUTTON|A|SELECT|INPUT)$/.test(el.tagName) || el.hasAttribute('tabindex');
    });
    const overlaps = [];
    for (let i = 0; i < fixedEls.length; i++) {
        for (let j = i + 1; j < fixedEls.length; j++) {
            const a = fixedEls[i].getBoundingClientRect(), b = fixedEls[j].getBoundingClientRect();
            const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ix > 4 && iy > 4) {
                overlaps.push({ a: sel(fixedEls[i]), b: sel(fixedEls[j]), ax: Math.round(ix), ay: Math.round(iy) });
            }
        }
    }

    // ── L3b 固定控件压住流程控件 ──
    // FAB 是 fixed 的，页头按钮是流程的：两者都不属于"两个 fixed 控件"，
    // L3 抓不到，但用户看到的就是"学习报告按钮被主题 FAB 挖掉一块"。
    // 浮层/抽屉内部的流程元素由其所属浮层自己负责（且多为 fixed 容器的后代），排除。
    const flowEls = Array.from(document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button]'))
        .filter(el => {
            if (inCollapsedDrawer(el)) return false;
            if (cs(el).position === 'fixed') return false;
            if (!isVisible(el)) return false;
            for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
                if (cs(n).position === 'fixed') return false;   // 位于抽屉/弹窗内
            }
            const r = el.getBoundingClientRect();
            return r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
        });
    const coverings = [];
    fixedEls.forEach(f => {
        const a = paintedRect(f);
        flowEls.forEach(el => {
            if (f.contains(el) || el.contains(f)) return;
            const b = paintedRect(el);
            const ix = Math.min(a.r, b.r) - Math.max(a.l, b.l);
            const iy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
            if (ix > 4 && iy > 4) {
                const area = Math.min(a.w * a.h, b.w * b.h);
                coverings.push({ a: sel(f), b: sel(el), pct: Math.round(100 * (ix * iy) / area),
                    ar: `${Math.round(a.l)},${Math.round(a.t)}→${Math.round(a.r)},${Math.round(a.b)}`,
                    br: `${Math.round(b.l)},${Math.round(b.t)}→${Math.round(b.r)},${Math.round(b.b)}` });
            }
        });
    });
    coverings.sort((x, y) => y.pct - x.pct);

    // ── L6 横向滚动容器可达性 ──
    // overflow-x:auto + justify-content:flex-end/center 会把溢出甩到**左侧**，
    // 而 scrollLeft 最小是 0 → 开头那段永远滚不到（本项目踩过一次）。
    // 注意不能用 scrollWidth 做前置门槛：Chrome 不把左侧溢出计入 scrollWidth
    // （实测 200px 容器装 2×150px 内容、flex-end 对齐时 scrollWidth 仍是 200）。
    // 判据是几何的：滚到最左后首个子元素仍有部分在容器左内侧之外 = 够不到；
    // 滚到最右后末个子元素仍有部分在容器右内侧之外 = 同理。
    const scrollIssues = [];
    Array.from(document.querySelectorAll('body *')).forEach(el => {
        const st = cs(el);
        if (st.overflowX !== 'auto' && st.overflowX !== 'scroll') return;
        if (inCollapsedDrawer(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right < 0 || r.left > vw) return;
        const kids = Array.from(el.children).filter(c => c.getBoundingClientRect().width > 0);
        if (!kids.length) return;
        const inner = { l: r.left + (el.clientLeft || 0), r: r.left + (el.clientLeft || 0) + el.clientWidth };
        const saved = el.scrollLeft;
        el.scrollLeft = 0;
        const f = kids[0].getBoundingClientRect();
        if (f.left < inner.l - TOL) {
            scrollIssues.push({ s: sel(el), first: sel(kids[0]), jc: st.justifyContent,
                side: '左', over: Math.round(inner.l - f.left) });
        }
        el.scrollLeft = 999999;
        const g2 = kids[kids.length - 1].getBoundingClientRect();
        if (g2.right > inner.r + TOL) {
            scrollIssues.push({ s: sel(el), first: sel(kids[kids.length - 1]), jc: st.justifyContent,
                side: '右', over: Math.round(g2.right - inner.r) });
        }
        el.scrollLeft = saved;
    });

    // ── L4 触摸目标 ──
    const targets = [];
    Array.from(document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button], [tabindex]:not([tabindex="-1"])'))
        .forEach(el => {
            if (inCollapsedDrawer(el)) return;
            if (!isVisible(el)) return;
            // 被 <label> 包裹的表单控件：真实命中区是整个 label（点文字也能勾选），
            // 按 label 的外框量，否则会把"14px 复选框 + 可点整行"误判成 14px 死区。
            const hit = (el.tagName === 'INPUT' || el.tagName === 'SELECT')
                ? (el.closest('label') || el)
                : el;
            if (!isVisible(hit)) return;
            const r = hit.getBoundingClientRect();
            // 只考核落在视口内的控件（屏外的谈不上可点）
            if (r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) return;
            const min = Math.min(r.width, r.height);
            if (min < GOOD_TARGET) {
                targets.push({ s: sel(hit), t: text(hit), w: Math.round(r.width), h: Math.round(r.height), min: Math.round(min) });
            }
        });
    targets.sort((a, b) => a.min - b.min);

    return { overflow, offenders, scrollClipped, overlaps, coverings, scrollIssues, targets, fixedCount: fixedEls.length };
}

/**
 * ── 关口自证（负控夹具）──
 * 断言"会咬人"：如果 L1/L2 在故意做坏的夹具上不报 FAIL，说明判据已经失效，
 * 此时真机全绿毫无意义。因此 self-test 不通过就直接退出 1，不允许跑主测。
 */
const FIXTURES = [
    { name: 'L1/整页横向溢出',
      html: '<div style="width:3000px;height:20px">wide</div>',
      expect: (g) => g.overflow.docScrollWidth > g.overflow.vw ? null : '未检出 scrollWidth 溢出' },
    { name: 'L2/fixed 控件被推到屏外',
      html: '<button id="offBtn" style="position:fixed;left:calc(100vw + 40px);top:10px;width:60px;height:60px">x</button>',
      expect: (g) => g.offenders.some(o => /offBtn/.test(o.s)) ? null : '未检出屏外 fixed 按钮' },
    { name: 'L2/普通流元素越界',
      html: '<div style="width:100%;overflow:visible"><div id="leak" style="width:2000px;height:30px">leak</div></div>',
      expect: (g) => g.offenders.some(o => /leak/.test(o.s)) ? null : '未检出普通流越界元素' },
    { name: 'L2/静默裁切（overflow-x:hidden）',
      html: '<div id="clipBox" style="width:200px;overflow-x:hidden"><div id="clipped" style="width:900px;height:30px">c</div></div>',
      expect: (g) => g.offenders.some(o => /clipped/.test(o.s)) ? null : '未检出 hidden 静默裁切' },
    { name: 'L2/可滚动容器豁免（不该误报）',
      html: '<div id="scrollBox" style="width:200px;overflow-x:auto"><div id="scrolled" style="width:900px;height:30px">s</div></div>',
      expect: (g) => (g.offenders.some(o => /scrolled/.test(o.s)) ? '误报：可滚动容器内的内容被判越界'
                    : (!g.scrollClipped.some(o => /scrolled/.test(o.s)) ? '未记录滚动承接' : null)) },
    { name: 'L3/两个 fixed 按钮完全重叠',
      html: '<button id="ovA" style="position:fixed;left:20px;top:20px;width:50px;height:50px">a</button>'
          + '<button id="ovB" style="position:fixed;left:22px;top:22px;width:50px;height:50px">b</button>',
      expect: (g) => g.overlaps.length ? null : '未检出 fixed 控件重叠' },
    { name: 'L3b/固定 FAB 压住流程按钮',
      html: '<div style="position:relative;height:100px">'
          + '<button id="flowBtn" style="position:absolute;right:0;top:0;width:120px;height:44px">flow</button></div>'
          + '<button id="fabX" style="position:fixed;right:0;top:0;width:52px;height:52px">f</button>',
      expect: (g) => g.coverings.some(c => /fabX/.test(c.a) && /flowBtn/.test(c.b)) ? null : '未检出 FAB 压住流程按钮' },
    { name: 'L3b/裁切掉的部分不算遮挡（防误报）',
      html: '<div style="position:absolute;left:0;top:0;width:120px;overflow-x:auto">'
          + '<button id="clippedBtn" style="width:400px;height:44px">h</button></div>'
          + '<button id="fabY" style="position:fixed;right:0;top:0;width:52px;height:52px">f</button>',
      expect: (g) => g.coverings.some(c => /fabY/.test(c.a) && /clippedBtn/.test(c.b))
                    ? '误报：滚动容器已裁掉的按钮区域仍被算作遮挡' : null },
    { name: 'L6/justify-content:flex-end 把溢出甩到滚不到的左侧',
      html: '<div id="rail" style="display:flex;justify-content:flex-end;overflow-x:auto;width:200px">'
          + '<button style="width:150px;flex:none;height:44px">a</button>'
          + '<button style="width:150px;flex:none;height:44px">b</button></div>',
      expect: (g) => g.scrollIssues.some(o => /rail/.test(o.s)) ? null : '未检出滚不到的左侧溢出' },
    { name: 'L4/触摸目标过小',
      html: '<button id="tinyBtn" style="width:18px;height:18px">t</button>',
      expect: (g) => g.targets.some(t => /tinyBtn/.test(t.s)) ? null : '未检出 18px 按钮' },
];

async function runSelfTest(browser) {
    console.log('── 关口自证（负控夹具）──');
    let bad = 0;
    for (const fx of FIXTURES) {
        const page = await browser.newPage();
        try {
            await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
            await page.setContent('<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'
                + fx.html + '</body></html>', { waitUntil: 'load' });
            const g = await page.evaluate(collectPageGeometry, TOL, GOOD_TARGET);
            const err = fx.expect(g);
            if (err) { bad++; console.log(`  [BITE-FAIL] ${fx.name} — ${err}`); }
            else console.log(`  [bite ok] ${fx.name}`);
        } catch (e) {
            bad++; console.log(`  [BITE-FAIL] ${fx.name} — 异常 ${String(e).slice(0, 120)}`);
        } finally { await page.close(); }
    }
    console.log(bad ? `\n关口自证失败 ${bad} 项：判据已失效，本次结果不可信。\n`
                   : `\n关口自证通过：${FIXTURES.length} 项夹具全部会咬人。\n`);
    return bad;
}

(async () => {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const devices = ONLY ? DEVICES.filter(d => d.id.includes(ONLY)) : DEVICES;
    console.log(`URL : ${URL_}`);
    console.log(`OUT : ${OUT}`);
    console.log(`设备: ${devices.map(d => d.id).join(', ')}\n`);

    const browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: 'shell',
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });

    // 先自证关口会咬人；不通过则不出具"绿"结论
    const biteFail = await runSelfTest(browser);
    if (biteFail) {
        await browser.close();
        process.exit(3);
    }

    for (const d of devices) {
        const page = await browser.newPage();
        try {
            await page.setViewport({ width: d.w, height: d.h, deviceScaleFactor: 1,
                isMobile: d.touch, hasTouch: d.touch });
            page.on('pageerror', e => console.log(`    [pageerror] ${String(e).slice(0, 160)}`));
            await page.goto(URL_, { waitUntil: 'load', timeout: 60000 });
            // 等首屏字帖渲染完成（GridEngine 落地）
            await page.waitForFunction(() => {
                const gc = document.getElementById('grid-container');
                return gc && gc.children.length > 0;
            }, { timeout: 40000 }).catch(() => console.log('    (等 grid-container 超时)'));
            await sleep(700);
            // 引导浮层是"故意盖住控件"的教学遮罩，不属于常态 UI。先跳过引导，
            // 再量常态布局，否则 L3b 会把"气泡盖住按钮"当成 bug 误报。
            await page.evaluate(() => {
                const skip = document.querySelector('.ob-btn-skip');
                if (skip) skip.click();
            });
            await sleep(300);
            await page.evaluate(() => {
                document.querySelectorAll('.ob-overlay, .ob-bubble, .ob-hint').forEach(e => e.remove());
                document.querySelectorAll('.ob-spotlight').forEach(e => e.classList.remove('ob-spotlight'));
            });
            await page.waitForFunction(() => !document.querySelector('.puppeteer-toast'), { timeout: 6000 }).catch(() => {});
            // headless 无绘制表面时 transition/animation 不推进，量到的会是动画起点值。
            // 统一禁用后再测，保证所有断言读终态（量具修正，不是放宽判据）。
            await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
            await sleep(120);

            const g = await page.evaluate(collectPageGeometry, TOL, GOOD_TARGET);
            const vvW = g.overflow.vw;

            // L1
            const hx = Math.max(g.overflow.docScrollWidth, g.overflow.bodyScrollWidth);
            if (hx > vvW + TOL) {
                record(d.id, 'L1', '横向溢出', 'FAIL',
                    `scrollWidth=${hx} > viewport=${vvW}（超 ${hx - vvW}px）最宽元素: ` +
                    (g.overflow.widest[0] ? `${g.overflow.widest[0].s}=${g.overflow.widest[0].w}px` : 'n/a'));
            } else {
                record(d.id, 'L1', '横向溢出', 'PASS', `scrollWidth=${hx} ≤ ${vvW}`);
            }

            // L2
            const clipInfo = g.scrollClipped.length
                ? `（另有 ${g.scrollClipped.length} 处横向超出由可滚动容器承接: ` +
                  [...new Set(g.scrollClipped.map(o => o.by))].join(', ') + '）'
                : '';
            if (g.offenders.length) {
                record(d.id, 'L2', '出屏元素', 'FAIL',
                    g.offenders.slice(0, 6).map(o => `${o.s}[${o.left}→${o.right}](${o.why})`).join(' | ') + clipInfo);
            } else {
                record(d.id, 'L2', '出屏元素', 'PASS', '无元素越界' + clipInfo);
            }

            // L3
            if (g.overlaps.length) {
                record(d.id, 'L3', '固定控件重叠', 'FAIL',
                    g.overlaps.slice(0, 6).map(o => `${o.a} × ${o.b} (${o.ax}×${o.ay}px)`).join(' | '));
            } else {
                record(d.id, 'L3', '固定控件重叠', 'PASS', `${g.fixedCount} 个固定控件互不重叠`);
            }

            // L3b 固定控件压住流程控件（遮挡 ≥25% 才算问题，边缘擦过属正常排版）
            const heavy = g.coverings.filter(c => c.pct >= 25);
            if (heavy.length) {
                record(d.id, 'L3b', 'FAB 压住按钮', 'FAIL',
                    heavy.slice(0, 6).map(c => `${c.a}[${c.ar}] 压 ${c.b}[${c.br}] (${c.pct}%)`).join(' | '));
            } else if (g.coverings.length) {
                record(d.id, 'L3b', 'FAB 压住按钮', 'WARN',
                    '轻微擦边: ' + g.coverings.slice(0, 4).map(c => `${c.a}[${c.ar}]×${c.b}[${c.br}](${c.pct}%)`).join(' | '));
            } else {
                record(d.id, 'L3b', 'FAB 压住按钮', 'PASS', `${g.fixedCount} 个固定控件未压住流程控件`);
            }

            // L4（桌面精细指针只记 WARN，触摸设备未达标记 FAIL）
            const hard = g.targets.filter(t => t.min < FAIL_TARGET);
            if (hard.length) {
                record(d.id, 'L4', '触摸目标', d.touch ? 'FAIL' : 'WARN',
                    `<${FAIL_TARGET}px 共 ${hard.length} 个: ` + hard.slice(0, 6).map(t => `${t.s}=${t.w}×${t.h}`).join(' | '));
            } else if (g.targets.length) {
                record(d.id, 'L4', '触摸目标', d.touch ? 'WARN' : 'PASS',
                    `${g.targets.length} 个 <${GOOD_TARGET}px: ` + g.targets.slice(0, 6).map(t => `${t.s}=${t.w}×${t.h}`).join(' | '));
            } else {
                record(d.id, 'L4', '触摸目标', 'PASS', '全部 ≥44px');
            }

            // L5 抽屉（仅移动端抽屉形态：<769px）
            if (d.w <= 768) {
                // headless 无绘制表面时 transition 不推进，量到的是动画起点的 transform。
                // 注入禁动画样式，保证读到的是终态（这是量具修正，不是放宽判据）。
                await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
                await sleep(120);
                const opened = await page.evaluate(() => {
                    const btn = document.querySelector('.sidebar-drawer-toggle');
                    if (!btn) return { err: 'no .sidebar-drawer-toggle' };
                    btn.click();
                    const sb = document.getElementById('appSidebar');
                    const vv = window.visualViewport;
                    const vw = Math.round(vv.width), vh = Math.round(vv.height);
                    const r = sb.getBoundingClientRect();
                    const bad = [];
                    // 抽屉自身 overflow-y:auto，内部控件纵向超出视口属正常（可滚动）；
                    // 这里只判**横向**越界，以及是否越过抽屉自身左右边界。
                    sb.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea').forEach(el => {
                        const st = getComputedStyle(el);
                        if (st.display === 'none' || st.visibility === 'hidden') return;
                        const b = el.getBoundingClientRect();
                        if (b.width === 0 && b.height === 0) return;
                        if (b.left < -2 || b.right > vw + 2 || b.left < r.left - 2 || b.right > r.right + 2) {
                            bad.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : (el.className || '')} [${Math.round(b.left)}→${Math.round(b.right)}]`);
                        }
                    });
                    return { open: sb.classList.contains('open'), tf: getComputedStyle(sb).transform,
                        rect: { l: Math.round(r.left), rt: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }, vw, vh, bad };
                });
                if (opened.err) {
                    record(d.id, 'L5', '抽屉可达', 'FAIL', opened.err);
                } else if (!opened.open) {
                    record(d.id, 'L5', '抽屉可达', 'FAIL', '点击 ☰ 后 .app-sidebar 未获得 .open');
                } else if (opened.rect.l < -2) {
                    record(d.id, 'L5', '抽屉可达', 'FAIL',
                        `抽屉 left=${opened.rect.l} 未对准视口 (transform=${opened.tf})`);
                } else if (opened.bad.length) {
                    record(d.id, 'L5', '抽屉内控件', 'FAIL',
                        `${opened.bad.length} 个越界: ${opened.bad.slice(0, 6).join(' | ')}`);
                } else {
                    record(d.id, 'L5', '抽屉可达', 'PASS', `抽屉 ${opened.rect.l}→${opened.rect.rt} 视口宽 ${opened.vw}`);
                }
                await sleep(400);
            }

            // L6 横向滚动容器可达性
            if (g.scrollIssues.length) {
                record(d.id, 'L6', '滚动可达性', 'FAIL',
                    g.scrollIssues.slice(0, 5).map(o => `${o.s} 内 ${o.first} 有 ${o.over}px 在${o.side}侧滚不到（justify-content:${o.jc}）`).join(' | '));
            } else {
                record(d.id, 'L6', '滚动可达性', 'PASS', '滚动容器开头内容均可滚到');
            }

            await page.screenshot({ path: path.join(OUT, `shot-${d.id}.png`) });
            await page.evaluate(() => {
                const sb = document.getElementById('appSidebar');
                if (sb) sb.classList.remove('open');
            }).catch(() => {});
            fs.writeFileSync(path.join(OUT, `geom-${d.id}.json`), JSON.stringify(g, null, 2));
        } catch (e) {
            record(d.id, 'ERR', '执行异常', 'FAIL', String(e).slice(0, 200));
        } finally {
            await page.close();
        }
    }

    await browser.close();

    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ url: URL_, rows }, null, 2));
    const md = ['# 触屏布局关口报告', '', `URL: ${URL_}`, '',
        '| 设备 | 组 | 断言 | 结果 | 详情 |', '|---|---|---|---|---|',
        ...rows.map(r => `| ${r.device} | ${r.group} | ${r.name} | ${r.status} | ${String(r.detail || '').replace(/\|/g, '/')} |`),
        '', `FAIL=${nFail} WARN=${nWarn} PASS=${nPass}`].join('\n');
    fs.writeFileSync(path.join(OUT, 'report.md'), md);

    console.log(`\n════ FAIL=${nFail}  WARN=${nWarn}  PASS=${nPass} ════`);
    console.log(`报告: ${path.join(OUT, 'report.md')}`);
    process.exit(nFail ? 1 : 0);
})().catch(e => { console.error('脚本故障:', e); process.exit(2); });
