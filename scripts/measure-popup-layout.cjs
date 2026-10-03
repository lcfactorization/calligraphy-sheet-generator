#!/usr/bin/env node
// ============================================================================
// measure-popup-layout.cjs — 笔顺演示弹窗布局实测取证（诊断用，不参与构建）
//
// 目的：用真机尺寸的 headless Chromium 量出弹窗的实际几何，回答两个问题：
//   Q1 单窗口时，弹窗是否位于「可视视口(visualViewport)」的正中央？偏差多少 px？
//   Q2 2/3/4 窗口时，是否溢出可视区？每一行是否水平居中？排布是否均衡？
//
// 只读测量，不改产品代码。输出 JSON + 人读表格。
// ============================================================================
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = Number(process.env.MEASURE_PORT || 5199);
// 几何稳定轮询超时；设为 1 可做负控（必然全部 UNSTABLE、退出码 1）
const STABLE_TIMEOUT = Number(process.env.MEASURE_STABLE_TIMEOUT || 8000);
// 连续多少次采样一致才算稳定。默认 6（= 600ms 静止），不是 2。
// ⚠ 实测踩过：stableFor=2（240ms）会在 desktop n=1 上采到一个 **平台期** ——
//   overlay 的内联 top 已经是正确值（540px），但窗口还在插槽内做入场收尾，
//   bbox 中心偏 7.6px；再等 1500ms 自行回到 dy=0。即「假阳性」，不是产品缺陷。
//   抬到 6 次是把判据收紧（更难判稳），负控 MEASURE_STABLE_TIMEOUT=1 依旧成立。
const STABLE_FOR = Number(process.env.MEASURE_STABLE_FOR || 6);
// 采样前的固定沉降时间，与稳定性轮询解耦（理由见下面 grid 循环里的注释）
const SETTLE_MS = Number(process.env.MEASURE_SETTLE_MS || 700);
const DEBUG_STABLE = !!process.env.MEASURE_DEBUG_STABLE;
const ROOT = path.resolve(__dirname, '..');

const DEVICES = [
    { id: 'desktop-1920x1080', w: 1920, h: 1080, touch: false },
    { id: 'laptop-1280x800',   w: 1280, h: 800,  touch: false },
    { id: 'tablet-1180x820',   w: 1180, h: 820,  touch: true },
    { id: 'tablet-820x1180',   w: 820,  h: 1180, touch: true },
    { id: 'phone-390x844',     w: 390,  h: 844,  touch: true },
    { id: 'phone-844x390',     w: 844,  h: 390,  touch: true },
    { id: 'phone-360x640',     w: 360,  h: 640,  touch: true },
];
const CHARS = ['永', '春', '风', '月'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 浏览器侧：采集一次完整几何快照
function snapshotInPage() {
    const vv = window.visualViewport;
    const vis = {
        left: vv ? (vv.offsetLeft || 0) : 0,
        top: vv ? (vv.offsetTop || 0) : 0,
        w: vv && vv.width ? vv.width : document.documentElement.clientWidth,
        h: vv && vv.height ? vv.height : document.documentElement.clientHeight,
        scale: vv ? (vv.scale || 1) : 1,
    };
    const layout = {
        w: document.documentElement.clientWidth,
        h: document.documentElement.clientHeight,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        cssVh: (() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;height:100vh;width:0;visibility:hidden'; document.body.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return h; })(),
    };
    const ov = document.querySelector('.sd-overlay');
    const ovs = ov ? (() => {
        const r = ov.getBoundingClientRect();
        const cs = getComputedStyle(ov);
        return {
            rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height },
            display: cs.display,
            cols: cs.getPropertyValue('--sd-cols') || ov.style.getPropertyValue('--sd-cols'),
            s: cs.getPropertyValue('--sd-s') || ov.style.getPropertyValue('--sd-s'),
            inlineLeft: ov.style.left || '', inlineTop: ov.style.top || '',
            maxWidth: cs.maxWidth, maxHeight: cs.maxHeight,
        };
    })() : null;

    const live = [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing'));
    const wins = live.map(w => {
        const r = w.getBoundingClientRect();
        const slot = w.closest('.sd-slot');
        return {
            title: (w.querySelector('.sd-window-title') || {}).textContent || '',
            rect: { left: +r.left.toFixed(1), top: +r.top.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
            cls: [...w.classList].filter(c => ['minimized', 'maximized', 'sd-free'].includes(c)),
            colStart: slot ? (slot.style.gridColumnStart || '') : '',
        };
    });

    return { vis, layout, overlay: ovs, wins,
             coarse: window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches };
}

// Node 侧：把一份快照压成几何指纹（纯函数，便于打印 diff）
// ⚠ 必须是纯 Node 函数：早先把它写成"页面里调用 snapshotInPage"，
//   但 page.evaluate 只序列化传入函数本身，snapshotInPage 在页面里并不存在
//   → 每次都抛 ReferenceError，被 catch 吞掉后伪装成"几何不稳定"，
//     整份报告 28/28 全红且原因不可见。教训：稳定性判据自己也要能被证伪。
function geometryKey(s) {
    const r1 = (x) => +(+x).toFixed(1);
    const parts = s.wins.map(w => [w.rect.left, w.rect.top, w.rect.w, w.rect.h].join(','));
    const ov = s.overlay ? [s.overlay.inlineLeft, s.overlay.inlineTop, s.overlay.cols, s.overlay.s].join('|') : 'none';
    return ov + '#' + parts.join('#') + '#vis=' + [r1(s.vis.left), r1(s.vis.top), r1(s.vis.w), r1(s.vis.h), r1(s.vis.scale)].join(',');
}

/**
 * 轮询到几何稳定（连续 stableFor+1 次采样指纹一致）再返回，取代固定 sleep。
 * 固定 sleep 会采到入场动画 / 重排的过渡帧，产生假阳性。
 * 负控：MEASURE_STABLE_TIMEOUT=1 → 必然全部 UNSTABLE 且退出码 1（证明判据会咬人）。
 * @returns {Promise<boolean>} 是否在超时前稳定
 */
async function waitGeometryStable(page, { timeout = STABLE_TIMEOUT, interval = 120, stableFor = STABLE_FOR } = {}) {
    const t0 = Date.now();
    let last = null, hits = 0;
    while (Date.now() - t0 < timeout) {
        // 采样失败必须显式报错，不能伪装成"不稳定"
        const snap = await page.evaluate(snapshotInPage);
        const key = geometryKey(snap);
        if (key === last) {
            if (++hits >= stableFor) return true;
        } else {
            if (DEBUG_STABLE && last !== null) console.log(`    [unstable] ${last}\n          ->   ${key}`);
            hits = 0;
            last = key;
        }
        await sleep(interval);
    }
    if (DEBUG_STABLE) console.log(`    [timeout] last=${last}`);
    return false;
}

// 分析：把快照换算成「用户能感知的缺陷」
function analyze(snap) {
    const { vis, wins } = snap;
    const cx = vis.left + vis.w / 2, cy = vis.top + vis.h / 2;
    const out = { n: wins.length, overflow: [], center: null, rows: [] };
    if (!wins.length) return out;

    // 整体包围盒 + 溢出
    let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
    for (const w of wins) {
        L = Math.min(L, w.rect.left); T = Math.min(T, w.rect.top);
        R = Math.max(R, w.rect.right); B = Math.max(B, w.rect.bottom);
        const o = {
            left: Math.max(0, +(vis.left - w.rect.left).toFixed(1)),
            top: Math.max(0, +(vis.top - w.rect.top).toFixed(1)),
            right: Math.max(0, +(w.rect.right - (vis.left + vis.w)).toFixed(1)),
            bottom: Math.max(0, +(w.rect.bottom - (vis.top + vis.h)).toFixed(1)),
        };
        const amt = Math.max(o.left, o.top, o.right, o.bottom);
        if (amt > 0.5) out.overflow.push({ title: w.title.trim(), ...o, amt });
    }
    out.bbox = { w: +(R - L).toFixed(1), h: +(B - T).toFixed(1) };
    // Q1：整体包围盒中心 vs 可视视口中心
    out.center = { dx: +(((L + R) / 2) - cx).toFixed(1), dy: +(((T + B) / 2) - cy).toFixed(1) };

    // Q2：分行后量每行是否水平居中。
    // 分行依据「垂直区间是否重叠」而不是 top 值：同一行里窗口(440)与药丸(40)高度悬殊，
    // 即便 align-items:center 对齐了中线，top 也必然不同，按 top 分组会把一行误判成多行。
    const sorted = [...wins].sort((a, b) => a.rect.top - b.rect.top);
    const rows = [];
    for (const w of sorted) {
        const cur = rows[rows.length - 1];
        if (cur && w.rect.top < cur.bottom - 1 && w.rect.bottom > cur.top + 1) {
            cur.items.push(w);
            cur.top = Math.min(cur.top, w.rect.top);
            cur.bottom = Math.max(cur.bottom, w.rect.bottom);
        } else {
            rows.push({ items: [w], top: w.rect.top, bottom: w.rect.bottom });
        }
    }
    for (const g of rows) {
        const l = Math.min(...g.items.map(w => w.rect.left));
        const r = Math.max(...g.items.map(w => w.rect.right));
        out.rows.push({
            count: g.items.length,
            dx: +(((l + r) / 2) - cx).toFixed(1),          // 行中心相对视口中心的水平偏差
            width: +(r - l).toFixed(1),
            slack: +((vis.w - (r - l)) / 2).toFixed(1),      // 两侧剩余
        });
    }
    return out;
}

(async () => {
    const { createServer } = await import('vite');
    const server = await createServer({
        configFile: path.join(ROOT, 'vite.config.js'),
        root: ROOT,
        server: { open: false, port: PORT, host: '127.0.0.1', strictPort: true },
    });
    await server.listen();
    const BASE = (server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${PORT}/`).replace(/\/$/, '');
    console.log(`dev server: ${BASE}\n`);

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
        try { localStorage.setItem('onboarding_never_show', 'true'); localStorage.setItem('onboarding_completed', 'true'); } catch (_) {}
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const report = [];
    for (const dev of DEVICES) {
        await page.setViewport(dev.touch
            ? { width: dev.w, height: dev.h, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
            : { width: dev.w, height: dev.h });
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        // 等汉字数据就绪
        for (let i = 0; i < 200; i++) {
            const ok = await page.evaluate(async () => { try { return (await import('/src/modules/hanziDataStore.js')).isReady(); } catch (_) { return false; } }).catch(() => false);
            if (ok) break;
            await sleep(300);
        }
        for (let n = 1; n <= 4; n++) {
            await page.evaluate(async () => (await import('/src/modules/strokeDemoModal.js')).closeAllStrokeDemo());
            await sleep(400);
            await page.evaluate(async (cs) => { const m = await import('/src/modules/strokeDemoModal.js'); for (const c of cs) m.openStrokeDemo(c); }, CHARS.slice(0, n));
            for (let i = 0; i < 100; i++) {
                const cnt = await page.evaluate(() => [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing')).length);
                if (cnt === n) break;
                await sleep(200);
            }
            // 等几何稳定再采样：固定 sleep 会采到入场动画/重排的过渡帧，产生假阳性
            // （实测过一次 n=4 误报）。判据 = 连续 STABLE_FOR 次快照的所有窗口 rect 完全一致。
            // ⚠ 这段固定 settle 必须与稳定性轮询**解耦**：早先没有它，于是负控
            //   MEASURE_STABLE_TIMEOUT=1 把轮询时间也一并抹掉，open/close 节奏被拉满，
            //   渲染进程直接崩（detached Frame）—— 退出码虽是 1，却是"崩了"而不是
            //   "判据咬人了"，等于负控失效。有了固定 settle，负控只改判据、不改节奏。
            await sleep(SETTLE_MS);
            const stable = await waitGeometryStable(page);
            const snap = await page.evaluate(snapshotInPage);
            const a = analyze(snap);
            report.push({ device: dev.id, n, stable, vis: { w: Math.round(snap.vis.w), h: Math.round(snap.vis.h) },
                          layoutVh: Math.round(snap.layout.cssVh), coarse: snap.coarse,
                          cols: snap.overlay?.cols, s: snap.overlay?.s,
                          winCount: a.n, minimized: snap.wins.filter(w => w.cls.includes('minimized')).length,
                          center: a.center, rows: a.rows, overflow: a.overflow,
                          inlineLT: snap.overlay ? `${snap.overlay.inlineLeft || 'auto'}/${snap.overlay.inlineTop || 'auto'}` : '' });
        }
    }

    // ══ Q1 深度验证：页面缩放后 visualViewport 与布局视口分离 ══
    // 这是"单窗口不在可见区正中央"的真实成因：fixed 元素的 50% 基准是布局视口，
    // 缩放后可见区只是布局视口的一小块且可能带偏移，纯 CSS 居中必然偏出可见区。
    // 用 CDP 的 page scale factor 直接构造缩放稳态（比合成双指手势更确定、可复现）。
    console.log('\n══ 页面缩放 2x 后的居中验证（visualViewport ≠ 布局视口）══');
    const cdp = await page.target().createCDPSession();
    const zoomReport = [];
    for (const dev of DEVICES.filter(d => d.touch)) {
        for (const n of [1, 3]) {
            await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
            await page.setViewport({ width: dev.w, height: dev.h, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
            await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            for (let i = 0; i < 200; i++) {
                const ok = await page.evaluate(async () => { try { return (await import('/src/modules/hanziDataStore.js')).isReady(); } catch (_) { return false; } }).catch(() => false);
                if (ok) break;
                await sleep(300);
            }
            await page.evaluate(async (cs) => { const m = await import('/src/modules/strokeDemoModal.js'); for (const c of cs) m.openStrokeDemo(c); }, CHARS.slice(0, n));
            await sleep(SETTLE_MS);
            await waitGeometryStable(page);
            // 构造缩放：scale=2 → 可见区缩为布局视口的一半
            await cdp.send('Emulation.setDeviceMetricsOverride', {
                width: dev.w, height: dev.h, deviceScaleFactor: 2, mobile: true, scale: 2,
            });
            // 缩放会触发 visualViewport.resize → 去抖重排 → 重新锚定，必须等它落定
            await sleep(SETTLE_MS);
            const stable = await waitGeometryStable(page);
            const snap = await page.evaluate(snapshotInPage);
            const a = analyze(snap);

            // A/B 对照：清掉 JS 写入的内联 left/top → 退化为"纯 CSS left/top:50%"（旧行为），
            // 当场量出偏差后再原样恢复。用于证明锚定确实起了作用，而不是靠推导。
            const ab = await page.evaluate(() => {
                const ov = document.querySelector('.sd-overlay');
                if (!ov) return null;
                const keep = { left: ov.style.left, top: ov.style.top };
                ov.style.left = ''; ov.style.top = '';
                const vv = window.visualViewport;
                const cx = (vv ? vv.offsetLeft : 0) + (vv && vv.width ? vv.width : innerWidth) / 2;
                const cy = (vv ? vv.offsetTop : 0) + (vv && vv.height ? vv.height : innerHeight) / 2;
                const live = [...document.querySelectorAll('.sd-window')].filter(w => !w.classList.contains('closing'));
                let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
                for (const w of live) { const r = w.getBoundingClientRect();
                    L = Math.min(L, r.left); T = Math.min(T, r.top); R = Math.max(R, r.right); B = Math.max(B, r.bottom); }
                const res = live.length ? { dx: +(((L + R) / 2) - cx).toFixed(1), dy: +(((T + B) / 2) - cy).toFixed(1) } : null;
                ov.style.left = keep.left; ov.style.top = keep.top;
                return res;
            });

            zoomReport.push({
                device: dev.id, n, stable,
                vis: { w: Math.round(snap.vis.w), h: Math.round(snap.vis.h), left: snap.vis.left, top: snap.vis.top },
                layout: { w: snap.layout.innerW, h: snap.layout.innerH },
                scale: +snap.vis.scale.toFixed(2),
                diverged: Math.abs(snap.vis.w * snap.vis.scale - snap.layout.innerW) > 2,
                inlineLT: snap.overlay ? `${snap.overlay.inlineLeft || 'auto'} / ${snap.overlay.inlineTop || 'auto'}` : '',
                center: a.center, cssOnlyCenter: ab, overflow: a.overflow.length,
            });
        }
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    console.log('device              n  st  vis       layout    scale diverged  修复后(dx,dy)   纯CSS(dx,dy)    ovr  inlineLeft/Top');
    console.log('-'.repeat(128));
    for (const r of zoomReport) {
        // 未达几何稳态 = 测量无效，必须算可疑：否则会"抖一下就绿"，关口失去自证能力
        const bad = !r.stable || !r.center || Math.abs(r.center.dx) > 4 || Math.abs(r.center.dy) > 4 || r.overflow;
        const css = r.cssOnlyCenter ? `${r.cssOnlyCenter.dx},${r.cssOnlyCenter.dy}` : 'n/a';
        const ctr = r.center ? `${r.center.dx},${r.center.dy}` : 'n/a';
        console.log(`${r.device.padEnd(19)} ${r.n}  ${(r.stable ? 'Y' : 'N').padEnd(3)} ${`${r.vis.w}x${r.vis.h}`.padEnd(9)} ${`${r.layout.w}x${r.layout.h}`.padEnd(9)} ` +
            `${String(r.scale).padEnd(5)} ${String(r.diverged).padEnd(9)} ${ctr.padEnd(15)} ` +
            `${css.padEnd(15)} ${String(r.overflow).padEnd(4)} ${r.inlineLT}${bad ? (r.stable ? '  <<<' : '  <<<UNSTABLE') : ''}`);
    }
    const zoomBad = zoomReport.filter(r => !r.stable || !r.center || Math.abs(r.center.dx) > 4 || Math.abs(r.center.dy) > 4 || r.overflow).length;
    console.log(`\n缩放场景可疑: ${zoomBad} / ${zoomReport.length}  (视口确已分离: ${zoomReport.filter(r => r.diverged).length}, 几何稳定: ${zoomReport.filter(r => r.stable).length})`);

    await browser.close();
    await server.close();

    // ── 人读输出 ──
    console.log('device              n  vis        cols  s      min  st  center(dx,dy)   rows(count@dx)         overflow');
    console.log('-'.repeat(122));
    let bad = 0;
    for (const r of report) {
        const rows = r.rows.map(x => `${x.count}@${x.dx}`).join(' ');
        const ov = r.overflow.length ? r.overflow.map(o => `${o.title}:${o.amt}px`).join(',') : '-';
        const winMismatch = r.winCount !== r.n;
        const offCenter = !r.center || Math.abs(r.center.dx) > 2 || Math.abs(r.center.dy) > 2;
        const rowOff = r.rows.some(x => Math.abs(x.dx) > 2);
        const flag = (!r.stable || winMismatch || offCenter || rowOff || r.overflow.length)
            ? (r.stable && !winMismatch ? '  <<<' : '  <<<UNSTABLE') : '';
        if (flag) bad++;
        const ctr = r.center ? `${r.center.dx},${r.center.dy}` : 'n/a';
        console.log(
            `${r.device.padEnd(19)} ${r.n}  ${`${r.vis.w}x${r.vis.h}`.padEnd(10)} ${String(r.cols).padEnd(5)} ${String(r.s).padEnd(6)} ${String(r.minimized).padEnd(4)} ` +
            `${(r.stable ? 'Y' : 'N').padEnd(3)} ${ctr.padEnd(15)} ${rows.padEnd(22)} ${ov}${flag}`);
    }
    console.log('-'.repeat(122));
    console.log(`可疑条目: ${bad} / ${report.length}   几何稳定: ${report.filter(r => r.stable).length}/${report.length}   pageErrors: ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    require('fs').writeFileSync(path.join(__dirname, 'popup-layout-report.json'),
        JSON.stringify({ grid: report, pinchZoom: zoomReport }, null, 2));
    console.log('JSON -> scripts/popup-layout-report.json');
    process.exitCode = (bad + zoomBad) ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
