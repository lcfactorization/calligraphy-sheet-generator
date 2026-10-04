#!/usr/bin/env node
// ============================================================================
// verify-incremental-refresh.cjs — v3.0.7「定向重绘」真浏览器取证
//
// 要证明的事（用户原话）：
//   1. 切换字体不需要刷新就能重新生成字帖，且拼音、笔画笔顺、网格、颜色都不重算；
//   2. 只切网格颜色 / 网格式样时，只重画网格，生字、组词、拼音、笔画笔顺都不重新生成。
//
// 判据怎么来的：全量重建 = renderSheet() 把 #grid-container 清空重画，
//   于是**每一个** DOM 节点都是新的。定向重绘则原地改写属性。
//   所以本脚本先给容器内所有元素打上 data-probe 标记，操作之后：
//     · 标记还在  → 该节点没被重建（便宜的证据）
//     · 标记没了  → 该节点被重建了
//   再配合 window.__getStrokeQueueStatus().pending 在**同一个 JS turn 内**同步读数
//   （page.evaluate 里点击完立刻读，中间不会跑微任务），
//   判断这次操作有没有重新排队 loadStrokes()——那是全量重建里最贵的一段。
//
// 负控（N 组，永远运行，不需要环境变量）：改输入文本属于内容变更，
//   必须走全量重建 —— 探针必须**全部消失**、笔画队列必须**重新排起**。
//   如果 N 组也绿着让探针存活，说明探针方法本身失效，上面 F/C/G 三组的
//   "绿"就是空绿。这一组就是用来咬人的。
//
// 只读取证，不改产品代码。输出人读表格 + JSON。
// ============================================================================
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.INCR_PORT || 5212);
const BLOCK_FONTS = process.env.INCR_BLOCK_FONTS !== '0';
// INCR_BASE 指定时跳过 vite dev，直接对这个地址取证 —— 用来验**构建产物**（vite preview + dist/），
// 而不是只验开发态。minify 之后的行为必须自己证一遍，不能靠"开发态绿了所以产物也绿"。
const EXTERNAL_BASE = process.env.INCR_BASE || '';

const rows = [];
function record(name, pass, observed, expected, note) {
    rows.push({ name, pass: !!pass, observed, expected, note: note || '' });
    console.log(`${pass ? '[PASS]' : '[FAIL]'} ${name}`);
    console.log(`        observed: ${fmt(observed)}`);
    if (!pass) console.log(`        expected: ${fmt(expected)}`);
    if (note) console.log(`        note:     ${note}`);
}
function eq(name, observed, expected, note) { record(name, observed === expected, observed, expected, note); }
function gt(name, v, note) { record(name, v > 0, v, '>0', note); }
function fmt(v) {
    let s;
    try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
    if (s === undefined) s = 'undefined';
    return s.length > 200 ? s.slice(0, 197) + '...' : s;
}

// ── 页面内取值：一次性把整张字帖的"指纹"抓回来 ──────────────────────────────
function snapshotInPage() {
    const c = document.getElementById('grid-container');
    if (!c) return null;
    const q = (s) => Array.from(c.querySelectorAll(s));
    const attr = (els, a) => els.map(e => e.getAttribute(a));
    const txt = (els) => els.map(e => e.textContent);
    return {
        probedTotal: q('[data-probe]').length,
        strokePaths: q('.grid-svg-stroke-box path').length,
        strokePathsProbed: q('.grid-svg-stroke-box path[data-probe]').length,
        strokeBoxes: q('.grid-svg-stroke-box').length,
        auxPinyin: txt(q('.grid-svg-aux-row [data-ge-role="pinyin"]')),
        auxPinyinProbed: q('.grid-svg-aux-row [data-ge-role="pinyin"][data-probe]').length,
        auxPinyinFonts: attr(q('.grid-svg-aux-row [data-ge-role="pinyin"]'), 'font-family'),
        glyphTexts: txt(q('[data-ge-font="user"]')),
        glyphFonts: attr(q('[data-ge-font="user"]'), 'font-family'),
        glyphProbed: q('[data-ge-font="user"][data-probe]').length,
        cellPinyin: txt(q('.grid-svg-cell [data-ge-role="pinyin"]')),
        cellZuci: txt(q('.grid-svg-cell [data-ge-role="zuci"]')),
        cellZuciProbed: q('.grid-svg-cell [data-ge-role="zuci"][data-probe]').length,
        gridLineStrokes: attr(q('.ge-grid-layer line'), 'stroke'),
        gridLinesProbed: q('.ge-grid-layer line[data-probe]').length,
        cellGridTypes: attr(q('.grid-svg-cell'), 'data-grid-type'),
        userGridTypes: attr(q('.grid-svg-cell[data-ge-usergrid]'), 'data-grid-type'),
        charRows: attr(q('.grid-svg-row'), 'data-char'),
        rowZuci: attr(q('.grid-svg-row'), 'data-zuci'),
        primaryVar: getComputedStyle(document.documentElement).getPropertyValue('--grid-primary-color').trim(),
        strokeQueue: window.__getStrokeQueueStatus ? window.__getStrokeQueueStatus() : null
    };
}

function tagProbesInPage() {
    const c = document.getElementById('grid-container');
    if (!c) return 0;
    const all = c.querySelectorAll('*');
    let n = 0;
    all.forEach(el => { el.setAttribute('data-probe', 'P' + (n++)); });
    return n;
}

function untagProbesInPage() {
    const c = document.getElementById('grid-container');
    if (!c) return;
    c.querySelectorAll('[data-probe]').forEach(el => el.removeAttribute('data-probe'));
}

// 点击并在**同一个 JS turn 内**读笔画队列 —— 中间不给微任务/定时器机会跑，
// 这样 pending>0 只可能是"这次点击重新排队了 loadStrokes"。
function clickAndReadQueueInPage(selector) {
    const el = document.querySelector(selector);
    if (!el) return { clicked: false, pending: null };
    el.click();
    const st = window.__getStrokeQueueStatus ? window.__getStrokeQueueStatus() : null;
    return { clicked: true, pending: st ? st.pending : null, firstChars: st ? st.firstChars : null };
}

function setFontInPage(value) {
    const sel = document.getElementById('font-select');
    if (!sel) return { ok: false, from: null, to: null };
    const from = sel.value;
    sel.value = value;
    // 程序化改 value 不会触发 change，必须显式派发（与 fontManager 上传后的做法一致）
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const st = window.__getStrokeQueueStatus ? window.__getStrokeQueueStatus() : null;
    return { ok: true, from, to: sel.value, pending: st ? st.pending : null };
}

function setInputAndRefreshInPage(text) {
    const ta = document.getElementById('inputText');
    const btn = document.getElementById('generate-btn');
    if (!ta || !btn) return { ok: false };
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    btn.click();
    const st = window.__getStrokeQueueStatus ? window.__getStrokeQueueStatus() : null;
    return { ok: true, pending: st ? st.pending : null, firstChars: st ? st.firstChars : null };
}

function setTraceOpacityInPage(value) {
    // 描红透明度滑块：Sidebar 只监听 'input'（拖动时连发），走 settingsCenter
    // → calligraphy:settings-updated。这里也只发 'input'，与真实拖动一致。
    const input = document.getElementById('traceOpacitySlider');
    if (!input) return { ok: false, selector: null };
    const from = input.value;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const st = window.__getStrokeQueueStatus ? window.__getStrokeQueueStatus() : null;
    return { ok: true, selector: input.id || input.className, from, to: input.value, pending: st ? st.pending : null };
}

function traceOpacitiesInPage() {
    const c = document.getElementById('grid-container');
    if (!c) return [];
    return Array.from(c.querySelectorAll('[data-ge-trace="1"]')).map(e => e.getAttribute('opacity'));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    let server = null;
    let BASE = EXTERNAL_BASE;
    if (!BASE) {
        const { createServer } = await import('vite');
        server = await createServer({
            root: ROOT,
            configFile: path.join(ROOT, 'vite.config.js'),
            server: { port: PORT, strictPort: true, host: '127.0.0.1' }
        });
        await server.listen();
        BASE = `http://127.0.0.1:${PORT}`;
    }
    console.log(`target: ${BASE}  (BLOCK_FONTS=${BLOCK_FONTS})\n`);

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const pageErrors = [];
    let exitCode = 1;
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
        if (BLOCK_FONTS) {
            // 字体文件 20–36MB，本关口只断言 font-family **属性**，不需要真的下载字形。
            // 拦掉可以省下大量 CPU / 磁盘（用户机器过热会蓝屏）。
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const u = req.url();
                if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) { req.abort().catch(() => {}); }
                else req.continue().catch(() => {});
            });
        }
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // ── 准备：两个字，够覆盖 范字/描红/空白/拼音组词格 + 辅助行笔画 ──
        const TEXT = '永字';
        await page.waitForFunction(() => !!document.getElementById('generate-btn'), { timeout: 30000 });
        const init = await page.evaluate(setInputAndRefreshInPage, TEXT);
        eq('S1 初始渲染已触发', init.ok, true);
        gt('S2 初始渲染重新排队了笔画（说明队列探针是活的）', init.pending, `firstChars=${fmt(init.firstChars)}`);

        await page.waitForFunction(
            () => window.__getStrokeQueueStatus && window.__getStrokeQueueStatus().pending === 0,
            { timeout: 60000 }
        );
        await page.waitForFunction(
            () => document.querySelectorAll('#grid-container .grid-svg-stroke-box path').length > 0,
            { timeout: 60000 }
        );
        await sleep(300);

        const base = await page.evaluate(snapshotInPage);
        gt('S3 字格行数 = 2', base.charRows.length === 2 ? 2 : 0);
        gt('S4 辅助行笔画 path 已画出', base.strokePaths);
        gt('S5 用户字体文字节点存在', base.glyphTexts.length);
        gt('S6 辅助行拼音节点存在', base.auxPinyin.length);
        gt('S7 网格线存在', base.gridLineStrokes.length);
        eq('S8 生字 = 永/字', base.charRows.join(''), TEXT);

        const nProbes = await page.evaluate(tagProbesInPage);
        gt('S9 探针已打标', nProbes);

        // ══════════════ F 组：切换字体 ══════════════
        const fontOpts = await page.evaluate(() =>
            Array.from(document.getElementById('font-select').options).map(o => o.value));
        const curFont = await page.evaluate(() => document.getElementById('font-select').value);
        const nextFont = fontOpts.find(v => v !== curFont && v !== 'TeXGyreAdventor');
        const fRes = await page.evaluate(setFontInPage, nextFont);
        eq('F0 字体确实切到了另一个值', fRes.to, nextFont, `from=${fRes.from}`);
        eq('F1 切字体没有重新排队笔画', fRes.pending, 0);
        const afterF = await page.evaluate(snapshotInPage);
        eq('F2 探针总数不变（容器内无任何节点被重建）', afterF.probedTotal, nProbes);
        eq('F3 辅助行笔画 path 全部带探针（笔画笔顺未重建）', afterF.strokePathsProbed, base.strokePaths);
        eq('F4 辅助行拼音全部带探针（拼音未重建）', afterF.auxPinyinProbed, base.auxPinyin.length);
        eq('F5 辅助行拼音文本未变', afterF.auxPinyin.join('|'), base.auxPinyin.join('|'));
        eq('F6 组词文本未变', afterF.cellZuci.join('|'), base.cellZuci.join('|'));
        eq('F7 生字未变', afterF.charRows.join(''), TEXT);
        record('F8 用户字体文字的 font-family 确实改了',
            afterF.glyphFonts.every(f => f && f.indexOf(nextFont) === 0) &&
            afterF.glyphFonts.join('|') !== base.glyphFonts.join('|'),
            afterF.glyphFonts.slice(0, 3), `${nextFont}, serif`);
        eq('F9 拼音 font-family 未被误改（固定 TeXGyreAdventor）',
            afterF.auxPinyinFonts.join('|'), base.auxPinyinFonts.join('|'),
            base.auxPinyinFonts.slice(0, 2));
        eq('F10 网格线颜色未变', afterF.gridLineStrokes.join('|'), base.gridLineStrokes.join('|'));
        eq('F11 网格式样未变', afterF.cellGridTypes.join('|'), base.cellGridTypes.join('|'));

        // ══════════════ C 组：只切网格颜色 ══════════════
        const presets = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-color-preset]')).map(b => b.getAttribute('data-color-preset')));
        gt('C0a 颜色预设按钮存在', presets.length);
        const curPreset = await page.evaluate(() => {
            const el = document.querySelector('[data-color-preset].active');
            return el ? el.getAttribute('data-color-preset') : null;
        });
        const nextPreset = presets.find(p => p !== curPreset) || presets[presets.length - 1];
        const cRes = await page.evaluate(clickAndReadQueueInPage, `[data-color-preset="${nextPreset}"]`);
        eq('C0b 颜色预设按钮点到了', cRes.clicked, true, `preset=${nextPreset}`);
        eq('C1 切颜色没有重新排队笔画', cRes.pending, 0);
        const afterC = await page.evaluate(snapshotInPage);
        eq('C2 辅助行笔画 path 全部带探针（笔画笔顺未重建）', afterC.strokePathsProbed, base.strokePaths);
        eq('C3 辅助行拼音全部带探针（拼音未重建）', afterC.auxPinyinProbed, base.auxPinyin.length);
        eq('C4 组词格文字全部带探针（组词未重建）', afterC.cellZuciProbed, base.cellZuci.length);
        eq('C5 生字未变', afterC.charRows.join(''), TEXT);
        eq('C6 组词文本未变', afterC.cellZuci.join('|'), base.cellZuci.join('|'));
        eq('C7 拼音文本未变', afterC.auxPinyin.join('|') + '|' + afterC.cellPinyin.join('|'),
            base.auxPinyin.join('|') + '|' + base.cellPinyin.join('|'));
        record('C8 网格线颜色确实改了',
            afterC.gridLineStrokes.join('|') !== base.gridLineStrokes.join('|'),
            afterC.gridLineStrokes.slice(0, 3), `!= ${fmt(base.gridLineStrokes.slice(0, 3))}`);
        record('C9 --grid-primary-color 确实改了',
            afterC.primaryVar !== base.primaryVar, afterC.primaryVar, `!= ${base.primaryVar}`);
        eq('C10 网格式样未变', afterC.cellGridTypes.join('|'), base.cellGridTypes.join('|'));
        eq('C11 用户字体文字的 font-family 未被误改', afterC.glyphFonts.join('|'), afterF.glyphFonts.join('|'));

        // ══════════════ G 组：只切网格式样 ══════════════
        const types = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.grid-type-btn')).map(b => b.getAttribute('data-grid-type')));
        gt('G0a 网格类型按钮存在', types.length);
        const curType = afterC.userGridTypes[0];
        const nextType = types.find(t => t !== curType);
        const gRes = await page.evaluate(clickAndReadQueueInPage, `.grid-type-btn[data-grid-type="${nextType}"]`);
        eq('G0b 网格类型按钮点到了', gRes.clicked, true, `${curType} -> ${nextType}`);
        eq('G1 切式样没有重新排队笔画（最贵的一段没重跑）', gRes.pending, 0);
        const afterG = await page.evaluate(snapshotInPage);
        eq('G2 用户格 data-grid-type 确实改了', afterG.userGridTypes.join('|'),
            afterG.userGridTypes.map(() => nextType).join('|'));
        eq('G3 辅助行笔画 path 全部带探针（笔画笔顺未重建）', afterG.strokePathsProbed, base.strokePaths);
        eq('G4 辅助行拼音全部带探针（拼音未重建）', afterG.auxPinyinProbed, base.auxPinyin.length);
        eq('G5 生字未变', afterG.charRows.join(''), TEXT);
        eq('G6 组词文本未变', afterG.cellZuci.join('|'), base.cellZuci.join('|'));
        eq('G7 拼音文本未变', afterG.auxPinyin.join('|') + '|' + afterG.cellPinyin.join('|'),
            base.auxPinyin.join('|') + '|' + base.cellPinyin.join('|'));
        eq('G8 组词格文字全部带探针（右侧固定版式格未重建）', afterG.cellZuciProbed, base.cellZuci.length);
        record('G9 网格层确实被重画了（它的探针应当消失）',
            afterG.gridLinesProbed < base.gridLineStrokes.length,
            afterG.gridLinesProbed, `< ${base.gridLineStrokes.length}`);
        record('G10 非用户格（拼音组词格）式样保持固定',
            afterG.cellGridTypes.filter(t => t === 'pinyin-zuci').length ===
            base.cellGridTypes.filter(t => t === 'pinyin-zuci').length,
            afterG.cellGridTypes.filter(t => t === 'pinyin-zuci').length,
            base.cellGridTypes.filter(t => t === 'pinyin-zuci').length);

        // ══════════════ T 组：只拖描红透明度 ══════════════
        const opBefore = await page.evaluate(traceOpacitiesInPage);
        gt('T0 描红节点存在', opBefore.length);
        // 滑块 min=0.05 max=0.3 step=0.05：必须挑一个**合法且与当前不同**的档位，
        // 否则浏览器会把非法值吸附回去，diff 变空 → 判据失去意义。
        const opTarget = await page.evaluate(() => {
            const el = document.getElementById('traceOpacitySlider');
            if (!el) return null;
            const steps = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
            const cur = parseFloat(el.value);
            const next = steps.find(v => Math.abs(v - cur) > 1e-9);
            return next == null ? null : String(next);
        });
        record('T0b 找到可用的透明度档位', !!opTarget, opTarget, 'a legal step != current');
        const tRes = opTarget ? await page.evaluate(setTraceOpacityInPage, opTarget) : { ok: false };
        if (tRes.ok) {
            eq('T1 拖透明度没有重新排队笔画', tRes.pending, 0);
            const opAfter = await page.evaluate(traceOpacitiesInPage);
            record('T2 描红 opacity 确实改了', opAfter.join('|') !== opBefore.join('|'),
                opAfter.slice(0, 3), `!= ${fmt(opBefore.slice(0, 3))}`, `slider=${tRes.selector}`);
            const afterT = await page.evaluate(snapshotInPage);
            eq('T3 辅助行笔画 path 全部带探针（笔画笔顺未重建）', afterT.strokePathsProbed, base.strokePaths);
            eq('T4 生字未变', afterT.charRows.join(''), TEXT);
        } else {
            record('T1 找到描红透明度滑块', false, 'not found', 'a range input',
                '未找到滑块：T 组跳过（不影响 F/C/G/N 判据）');
        }

        // ══════════════ N 组：负控 —— 内容变更必须全量重建 ══════════════
        const NEW_TEXT = '山水';
        const nRes = await page.evaluate(setInputAndRefreshInPage, NEW_TEXT);
        eq('N0 负控已触发（改输入文本 + 点刷新字帖）', nRes.ok, true);
        record('N1 负控：内容变更确实重新排队了笔画（探针方法有效）',
            nRes.pending > 0, nRes.pending, '>0', `firstChars=${fmt(nRes.firstChars)}`);
        const afterN = await page.evaluate(snapshotInPage);
        eq('N2 负控：探针全部消失（容器被整体重建）', afterN.probedTotal, 0);
        eq('N3 负控：辅助行笔画 path 不再带探针', afterN.strokePathsProbed, 0);
        eq('N4 负控：生字换成了新输入', afterN.charRows.join(''), NEW_TEXT);

        // ══════════════ P 组：部编版整册生字预设（一个学期一个分组）══════════════
        // 放在 N 组之后：P4 会触发一次真实的全量重建，若放在前面会把探针提前抹掉，
        // 让 N2「探针全部消失」变成空绿。
        const presetGroups = await page.evaluate(() => {
            const list = document.querySelector('.preset-list');
            if (!list) return null;
            const out = [];
            let cur = null;
            Array.from(list.children).forEach(li => {
                if (li.classList.contains('preset-group-label')) {
                    cur = { label: li.textContent.trim(), items: [] };
                    out.push(cur);
                } else if (li.classList.contains('preset-item') && cur) {
                    const name = li.querySelector('.preset-name');
                    const meta = li.querySelector('.preset-meta');
                    cur.items.push({ name: name ? name.textContent.trim() : '', meta: meta ? meta.textContent.trim() : '' });
                }
            });
            return out;
        });
        record('P0 侧栏「预设场景」列表已渲染', !!presetGroups, presetGroups && presetGroups.length, 'a list');
        const semLabels = (presetGroups || []).map(g => g.label);
        const wantLabels = ['五年级上册', '五年级下册', '六年级上册'];
        eq('P1 三个学期各自成一个分组（组名＝学期名）',
            wantLabels.map(l => semLabels.indexOf(l) >= 0).join(','), 'true,true,true', `实际分组=${fmt(semLabels)}`);
        record('P2 学期分组按 五上→五下→六上 排序',
            semLabels.indexOf('五年级上册') < semLabels.indexOf('五年级下册') &&
            semLabels.indexOf('五年级下册') < semLabels.indexOf('六年级上册'),
            semLabels.filter(l => /^五|^六/.test(l)), '五年级上册 < 五年级下册 < 六年级上册');
        const semGroups = (presetGroups || []).filter(g => wantLabels.indexOf(g.label) >= 0);
        eq('P3 每个学期分组内恰好一条整册字表', semGroups.map(g => g.items.length).join(','), '1,1,1');
        eq('P4 三条字表标注的字数为 217/180/180',
            semGroups.map(g => g.items[0] && g.items[0].meta).join(','), '217字,180字,180字');

        // 点一次真实预设，证明「点击 → 填入输入框 → 重排整张字帖」这条链路对 180 字的整册字表也成立
        const clicked = await page.evaluate(() => {
            const list = document.querySelector('.preset-list');
            if (!list) return { ok: false };
            let hit = null;
            Array.from(list.children).forEach(li => {
                if (li.classList.contains('preset-group-label')) {
                    hit = li.textContent.trim() === '五年级下册' ? 'next' : (hit === 'next' ? null : hit);
                } else if (hit === 'next' && li.classList.contains('preset-item')) {
                    li.click();
                    hit = 'done';
                }
            });
            const ta = document.getElementById('inputText');
            return { ok: hit === 'done', len: ta ? ta.value.length : -1, head: ta ? ta.value.slice(0, 6) : '', tail: ta ? ta.value.slice(-4) : '' };
        });
        eq('P5 点到「五年级下册」那条预设', clicked.ok, true);
        eq('P6 输入框被填入 180 字', clicked.len, 180);
        eq('P7 填入内容首尾与教材原序一致', clicked.head + '…' + clicked.tail, '昼耘桑晓蝴蚂…渺享庸憎');
        await page.waitForFunction(() => document.querySelectorAll('#grid-container .grid-svg-row').length === 180, { timeout: 60000 });
        const afterP = await page.evaluate(() => ({
            rows: document.querySelectorAll('#grid-container .grid-svg-row').length,
            chars: Array.from(document.querySelectorAll('#grid-container .grid-svg-row')).map(r => r.getAttribute('data-char')).join('')
        }));
        eq('P8 字帖重排为 180 行（每字一行）', afterP.rows, 180);
        const taAfterP = await page.evaluate(() => document.getElementById('inputText').value);
        eq('P9 180 行逐字等于输入框内容（顺序也未被打乱）', afterP.chars, taAfterP);

        eq('Z1 全程无未捕获页面异常', pageErrors.length, 0, pageErrors.slice(0, 3).join(' | '));
    } catch (e) {
        record('HARNESS 自身异常', false,
            (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)), 'no throw');
    } finally {
        await browser.close();
        if (server) await server.close();
    }

    const nPass = rows.filter(r => r.pass).length;
    const nFail = rows.length - nPass;
    console.log('\n' + '='.repeat(78));
    console.log(`SUMMARY: ${nPass} passed, ${nFail} failed, ${rows.length} total`);
    console.log('='.repeat(78));
    if (nFail) {
        console.log('FAILED ASSERTIONS:');
        rows.filter(r => !r.pass).forEach(r => {
            console.log(`  - ${r.name}\n      observed: ${fmt(r.observed)}\n      expected: ${fmt(r.expected)}`);
        });
    }
    try {
        // 开发态与构建产物两份报告分开落盘，别互相覆盖证据
        const name = EXTERNAL_BASE ? 'incremental-refresh-report-dist.json' : 'incremental-refresh-report.json';
        fs.writeFileSync(path.join(__dirname, name),
            JSON.stringify({ target: BASE, rows }, null, 2));
        console.log(`report: scripts/${name}`);
    } catch { /* 报告写不进不影响判据 */ }
    exitCode = nFail ? 1 : 0;
    process.exitCode = exitCode;
})();
