#!/usr/bin/env node
// ============================================================================
// verify-block-table.cjs — v3.1.1「生字卡表格版式（block-table）」真浏览器验收关口
//
// 要证明的事（15 组断言 = 任务书 13 组 + v3.1.1 §12 新增 14/15 组）：
//   块帖版式（每字一块：信息行 + 主表格 + 组词面板）13 组断言全部成立，且
//   经典版式（每字一行 11 格）行为零回归。
//
// 页面准备模式（跟随 verify-incremental-refresh.cjs 的服务方式）：
//   · 程序内起 vite dev server（createServer + strictPort），对开发态取证；
//   · localStorage 写 calligraphy_settings —— 先读旧值再 merge（保留其他键），
//     设 layoutType='block-table' 后刷新，等 .bt-block 出现（15s 超时即 FAIL）；
//   · 生字固定用「排前后面」（参考样张同款，离线笔画/组词数据可用）。
//
// 并发渲染窗口的规避（本关口首跑踩到，写死为 prep 规矩）：
//   index.html 的输入框自带 198 字默认样张，应用载入后会用它自动生成一次；
//   块帖路径 handleGenerate 在 innerHTML=''（清空）与 appendChild（贴回）之间
//   隔着 await loadBtEngine() 的动态 import —— 若在自动生成在途时点击「刷新字帖」，
//   两次渲染会**堆叠**（实测 198+4=202 块）。因此每次刷新后必须：
//     ① 抢先清空输入框（把自动生成变成 0 块空渲染）；
//     ② 等 #grid-container.svg-mode 出现（该类只由 handleGenerate 添加，证明自动
//        生成至少已启动）；
//     ③ 等「渲染落定」：笔画队列空闲两次采样 + 容器节点数两次采样不变；
//   然后才点击生成 —— 保证点击时无任何在途渲染。
//
// 节点探针标记法（与 verify-incremental-refresh.cjs 同源）：
//   给第一个 .bt-block 打 data-probe 标记，定向改写（档位/格型/颜色）后标记仍在
//   → 证明块未被重建；配合断言 5/6 的档位与重绘结果，证明走的是定向改写分支。
//   快照时序依据：main.js 在每次 settings-updated 处理完都会 takeSettingsSnapshot()
//   （main.js:434），所以「zhead 点击（updateSetting）→ 定向改写 → 再派发」的链路里
//   diff 基线始终是最新的，恢复 trace 不会再触发全量重建把探针抹掉。
//
// 已知坑（TASK_BOARD「本轮踩到并写死为规矩的三个坑」）：
//   1. page.evaluate 只序列化传入的那个函数 —— 本脚本所有页面函数**自包含**，
//      数据一律当参数传，绝不闭包捕获 Node 作用域变量；
//   2. 不用 sed -i 改文件（CRLF 风险）；
//   3. 断言不写成恒真：每条断言都带 observed/expected，负向情形必须能翻红。
//   4. SVG 元素没有 .click()（那是 HTMLElement 的方法）—— 点 .grid-svg-cell 等
//      SVG 节点必须 dispatchEvent(new MouseEvent('click', {bubbles:true}))。
//
// 13 组断言索引（本文件内标签）：
//   1a-1c  结构：data-layout / .bt-block[data-char]=4 / .bt-info=1、主表格 9×2=18 格、行边框
//          （v3.1.1 分页补空块后，内容断言一律以 [data-char] 真块为样本，语义不变）
//   2a-2c  内容模式：格0 范字 opacity=1 / 格1-3 描摹≈0.2 / 其余格内容层为空
//   3a-3d  信息行：拼音字体 TeXGyreAdventor / .bt-pinyin-box 宽≈var(--bt-cell)
//          （13.5mm ±0.5mm，2026-10-24 用户反馈修复项）/ pill /^\d+画$/（空记 WARN）
//   4a-4b  组词面板：.bt-zrow=2、每行 4 格 / .bt-zcell 无 data-char
//   5a-5e  档位切换（探针法 + 真实点击链）：初始 trace → 点 .bt-zhead 一次=full
//          （词字 opacity=1）→ 再点=hidden（词字 0 且不弹编辑浮层）→ 探针全程在；
//          再经 localStorage 设 trace 派发恢复 opacity≈0.2（定向改写通道）
//   6a-6b  格型/换色定向重绘：mizi 对角线>0 / red 预设 → 行边框 #9E2A2B +
//          拼音盒线 #B14A4B + 词字 #7A1F20（btRecolor 五组覆盖）；探针全程在
//   7a-7b  笔顺演示隔离：点主表格格子 → .sd-overlay/.sd-window；关闭
//   8a-8c  组词编辑隔离：点 .bt-zcell → #btManualEditOverlay（.sc-modal，
//          #btmePinyin/#btmeZuci1/#btmeZuci2）且无新笔顺弹窗；关闭
//   9a-9c  经典回归：classic 无 bt- 元素 / pinyin-zuci 格 → 经典 manualEdit
//          （"手动修改" .sc-modal）/ 左侧字格不弹编辑浮层
//   10     窄屏 390×844：documentElement.scrollWidth ≤ 390（dist 产物优先，
//          dev 降级需剔除收起态历史抽屉这一版式无关干扰）
//   11a-11c aiZuci 缓存字节一致性（dev server 动态 import 同一模块实例）：
//          经典条目恰 10 键无 zuciMulti / multi 写读回环 / 经典再写 zuciMulti 仍在
//   12a-12c 打印：先复位 block-table 再取证 —— print 媒体档位 pill display=none、
//          .bt-block break-inside=avoid、page.pdf() >5KB（存 scripts/_bt_verify_test.pdf，
//          验完删除）
//   13a-13b 切换按钮：#layout-toggle-btn 点击（block-table 态）→ aria-pressed=false
//          + data-layout=classic + 真块 .bt-block[data-char]=0 + .grid-svg-row 出现；
//          再点回 block-table
//
// v3.1.1 新增断言组（§12 P1：A 显式分页（每页固定 5 块）/ B 拼音四线格）：
//   14a-14e 显式分页（22 字长文 → 5 页）：每个 .bt-page 恰 5 个 .bt-block 且页头
//          仅首页 / 每页最后一块 bottom ≤ 页内容底 − 1mm / 空块无 data-char·无
//          拼音文字·无词字·格内无文本·pill 留空 / page.pdf 页数 = ceil(真块数/5)
//          （正则数 /Type /Page，验完删除）/ 实测 页头footprint + 5×块footprint
//          ≤ 275mm（引擎守卫判据复算）
//   15a-15e 拼音四线格与拆解条 v3.1.1：文字层 SVG preserveAspectRatio 含 meet（线条层
//          仍 none，线字分离）/ 盒贴块左缘 ≤0.5mm 且宽 13.5mm ±0.5mm / 全部
//          拼音盒无竖线 line（四线格只留横线）/ 经典辅助行 createAuxRow 零影响
//          （在断言 9 经典态取证）
//   15e 多笔画拆解条：所有 .bt-stroke-strip 无溢出裁切（scrollWidth≤clientWidth+1）；
//          被 display:none 截断的条必须带 "+N" 徽标（.bt-strip-more）——绝不静默裁切
//
// 运行：npm run verify:blocktable （即 node scripts/verify-block-table.cjs）
// 退出码：任一 FAIL → 1；全部 PASS（含 WARN）→ 0
// 报告：scripts/block-table-report.json
// ============================================================================
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.BT_PORT || 5219);
// 生字与参考样张同款（demo 四字），离线笔画数据 / cnchar 词库均可用
const TEXT = '排前后面';
// 分页断言（组 14）用长文：23 字（含多笔画字"爨"，供断言 15e 取证）→ 每页固定 6 块
// → ceil(23/6)=4 页（3 页满 6 实块 + 末页 5 实块补 1 空块），各组断言均有样本
const PAGES_TEXT = '天地人和风云雨雪山水火木金土日月春秋冬夏晨昏';
// 每页块数（契约：引擎 BT_BLOCKS_PER_PAGE，此处镜像用于断言期望值）
const BT_PER_PAGE = 6;
// 主表格几何（契约默认值，断言 1c 用）：btCols=9 × btMainRows=2 = 18 格/块
const EXP_CELLS = 18;
// 描摹透明度（契约默认 0.2，容差 0.02）
const TRACE_OPACITY = 0.2;
const TRACE_TOL = 0.02;
// 拼音盒宽度（2026-10-24 用户反馈修复项）：恰一个格宽 --bt-cell（默认 13.5mm），
// 容差 0.5mm。CSS px 换算：1mm = 96/25.4 px（CSS 规范 1in=96px, 1in=25.4mm）。
const BT_CELL_MM = 13.5;
const PYBOX_TOL_MM = 0.5;
const MM_TO_PX = 96 / 25.4;

const rows = [];
function fmt(v) {
    let s;
    try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
    if (s === undefined) s = 'undefined';
    return s.length > 300 ? s.slice(0, 297) + '...' : s;
}
function record(name, status, observed, expected, note) {
    rows.push({ name, status, observed: fmt(observed), expected: fmt(expected), note: note || '' });
    console.log(`[${status}] ${name}`);
    console.log(`        observed: ${fmt(observed)}`);
    if (status === 'FAIL') console.log(`        expected: ${fmt(expected)}`);
    if (note) console.log(`        note:     ${note}`);
}
function check(name, cond, observed, expected, note) {
    record(name, cond ? 'PASS' : 'FAIL', observed, expected, note);
    return !!cond;
}
function warn(name, observed, note) { record(name, 'WARN', observed, '', note); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 页面内函数（全部自包含：只靠参数与页面自身状态，不闭包捕获 Node 变量） ──

/** 只写 localStorage（读旧值再 merge，保留其他键），**不**派发事件 —— 刷新前播种用 */
function writeSettingInPage(patch) {
    const KEY = 'calligraphy_settings';
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { cur = {}; }
    const merged = Object.assign({}, cur, patch);
    localStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
}

/** 读旧值再 merge 写回并派发 settings-updated —— 断言 5e/6 的定向改写入口 */
function setSettingInPage(patch) {
    const KEY = 'calligraphy_settings';
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { cur = {}; }
    const merged = Object.assign({}, cur, patch);
    localStorage.setItem(KEY, JSON.stringify(merged));
    document.dispatchEvent(new CustomEvent('calligraphy:settings-updated', { detail: merged }));
    return merged;
}

/** 清空输入框（抢在载入自动生成读取之前，把默认 198 字样张的自动渲染变成 0 块） */
function clearInputInPage() {
    const ta = document.getElementById('inputText');
    if (!ta) return false;
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

/** 填入生字并点「刷新字帖」（与 verify-incremental-refresh 同款） */
function setInputAndGenerateInPage(text) {
    const ta = document.getElementById('inputText');
    const btn = document.getElementById('generate-btn');
    if (!ta || !btn) return { ok: false };
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    btn.click();
    return { ok: true };
}

/**
 * 渲染落定判据（promise 型谓词）：笔画队列空闲 + 容器节点数两次采样（间隔 600ms）不变。
 * 用两条证据共同排除「clear 与 appendChild 之间的在途渲染」与「笔画异步队列还在填」。
 */
function renderSettledInPage() {
    return new Promise((resolve) => {
        const status = () => (window.__getStrokeQueueStatus
            ? window.__getStrokeQueueStatus()
            : { pending: 0, loading: false });
        const count = () => {
            const c = document.getElementById('grid-container');
            return c ? c.querySelectorAll('*').length : -1;
        };
        const s1 = status();
        const n1 = count();
        setTimeout(() => {
            const s2 = status();
            const n2 = count();
            resolve(!!(s1.pending === 0 && !s1.loading && s2.pending === 0 && !s2.loading && n1 === n2));
        }, 600);
    });
}

/** 给第一个 .bt-block 打 data-probe 探针标记（定向改写后查存活） */
function tagFirstBlockProbeInPage() {
    const b = document.querySelector('#grid-container .bt-block');
    if (!b) return false;
    b.setAttribute('data-probe', 'BT1');
    return true;
}

/**
 * 点击第一个块的 .bt-zhead（组词档位标题条）—— 走 btManualEdit 的 document 级
 * 委托真实点击链：档位循环 hidden→trace→full→hidden，写设置走 updateSetting。
 * .bt-zhead 是 div（HTMLElement），.click() 合法；返回点击后是否有编辑浮层（应无）。
 */
function clickZheadInPage() {
    const z = document.querySelector('#grid-container .bt-block .bt-zuci .bt-zhead');
    if (!z) return { clicked: false };
    z.click();
    return {
        clicked: true,
        btmeOpen: !!document.getElementById('btManualEditOverlay'),
        level: (document.querySelector('#grid-container .bt-zuci') || { getAttribute: () => null }).getAttribute('data-bt-level')
    };
}

/** 一次性抓回整张块帖的结构化事实（断言 1–4 的判定数据） */
function snapshotBlocksInPage() {
    const c = document.getElementById('grid-container');
    if (!c) return null;
    const sheet = c.querySelector('.bt-sheet');
    // --bt-cell 由 BlockTableEngine 以内联样式写死（"13.5mm"）；解析失败回退 null
    let btCellMM = null;
    if (sheet) {
        const raw = getComputedStyle(sheet).getPropertyValue('--bt-cell') || '';
        const m = raw.match(/([\d.]+)\s*mm/);
        if (m) btCellMM = parseFloat(m[1]);
    }
    // v3.1.1 显式分页：.bt-block 含页末补齐的空块（无 data-char，骨架同构）。
    // 内容断言（2/3/4/5b 组）的语义对象始终是"生字块"，一律以 [data-char] 真块
    // 为样本 —— 空块的骨架断言归组 14（14c）专管，此处不混入。
    const blocks = Array.from(c.querySelectorAll('.bt-block[data-char]'));
    return {
        layoutAttr: c.getAttribute('data-layout'),
        blockCount: blocks.length,
        blockCountAll: c.querySelectorAll('.bt-block').length,
        pageCount: sheet ? sheet.querySelectorAll(':scope > .bt-page').length : 0,
        zcellCharTotal: c.querySelectorAll('.bt-zcell[data-char]').length,
        btCellMM,
        blocks: blocks.map(b => {
            const cells = Array.from(b.querySelectorAll('.bt-main .grid-svg-cell'));
            const pill = b.querySelector('.bt-info .bt-pill');
            const py = b.querySelector('.bt-info [data-ge-role="pinyin"]');
            const pyBox = b.querySelector('.bt-info .bt-pinyin-box');
            const zuci = b.querySelector('.bt-zuci');
            const zrows = zuci ? Array.from(zuci.querySelectorAll('.bt-zrow')) : [];
            const c0 = cells[0] ? cells[0].querySelector('.ge-content-layer text') : null;
            return {
                char: b.getAttribute('data-char'),
                infoCount: b.querySelectorAll('.bt-info').length,
                cellCount: cells.length,
                rowBorderCount: b.querySelectorAll('.bt-main .grid-svg-row-border').length,
                cell0: c0 ? { text: c0.textContent, opacity: c0.getAttribute('opacity') } : null,
                traceCells: cells.slice(1, 4).map(s => {
                    const t = s.querySelector('.ge-content-layer text[data-ge-trace="1"]');
                    return t ? t.getAttribute('opacity') : null;
                }),
                blankTextCounts: cells.slice(4).map(s => s.querySelectorAll('.ge-content-layer text').length),
                pinyinFont: py ? py.getAttribute('font-family') : null,
                // 拼音盒实测布局宽（px）。1280 视口无 transform 缩放（缩放只在 ≤768px），
                // getBoundingClientRect 即未缩放布局盒。
                pinyinBoxW: pyBox ? Math.round(pyBox.getBoundingClientRect().width * 100) / 100 : null,
                pillText: pill ? pill.textContent : null,
                zuciLevel: zuci ? zuci.getAttribute('data-bt-level') : null,
                zrowCount: zrows.length,
                zcellCounts: zrows.map(r => r.querySelectorAll('.bt-zcell').length),
                words: b.getAttribute('data-zuci-multi') || ''
            };
        })
    };
}

(async () => {
    let server = null;
    let exitCode = 1;
    const pageErrors = [];
    const BASE = `http://127.0.0.1:${PORT}`;

    // ── 起 vite dev server（与 verify-incremental-refresh 同款服务方式） ──
    // watch.ignored 排除 scripts/**：本关口运行中会往 scripts/ 写 PDF（断言 12c），
    // 若被 vite 监听会触发 HMR full-reload，把页面执行上下文炸掉（"Execution
    // context was destroyed"），断言 10-13 会随机殉葬。
    const { createServer } = await import('vite');
    server = await createServer({
        root: ROOT,
        configFile: path.join(ROOT, 'vite.config.js'),
        server: {
            port: PORT, strictPort: true, host: '127.0.0.1',
            watch: { ignored: ['**/scripts/**', '**/dist/**'] }
        }
    });
    await server.listen();
    console.log(`target: ${BASE}  (TEXT=${TEXT})\n`);

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
        // 字体文件 16–36MB：断言 3 只看 font-family **属性**，不需要真的下载字形。
        // 拦掉省 CPU/磁盘（与 verify-incremental-refresh 的 BLOCK_FONTS 同理）。
        // 注意：hanzi-data（.bin/.js）不在拦截范围 —— 笔画数 pill 与组词依赖它。
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const u = req.url();
            if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) { req.abort().catch(() => {}); }
            else req.continue().catch(() => {});
        });

        /** 带超时的页面谓词等待；返回是否成功（超时不抛出，由调用方判 FAIL）。
         *  arg 可选：waitForFunction 的入参通道 —— 页面函数必须自包含（文件头坑 1），
         *  Node 侧常量（如期望块数）只能经参数传入，绝不能闭包捕获。 */
        const waitPageOn = (p, fn, timeout, arg) =>
            p.waitForFunction(fn, { timeout, polling: 400 }, arg).then(() => true).catch(() => false);
        const waitPage = (fn, timeout, arg) => waitPageOn(page, fn, timeout, arg);

        /**
         * 刷新后的确定性准备 + 生成（见文件头「并发渲染窗口的规避」）：
         * ① 等生成按钮 → ② 清空输入框 → ③ 等 svg-mode（自动生成已启动）
         * → ④ 等渲染落定 → ⑤ 填入目标生字点生成。返回 {ok} 或 null（准备失败，已记 FAIL）。
         */
        async function prepAndGenerateOn(p, label) {
            await p.waitForFunction(() => !!document.getElementById('generate-btn'), { timeout: 30000 });
            await p.evaluate(clearInputInPage);
            const started = await waitPageOn(p, () => {
                const c = document.getElementById('grid-container');
                return !!c && c.classList.contains('svg-mode');
            }, 30000);
            if (!started) {
                record(`P2[${label}] 载入自动生成未启动（svg-mode 未出现）`, 'FAIL',
                    '超时', 'handleGenerate 已启动');
                return null;
            }
            const settled = await waitPageOn(p, renderSettledInPage, 90000);
            if (!settled) {
                record(`P3[${label}] 渲染未落定（队列/DOM 两次采样不稳定）`, 'FAIL',
                    '超时', '笔画队列空闲且容器节点数稳定');
                return null;
            }
            return p.evaluate(setInputAndGenerateInPage, TEXT);
        }
        const prepAndGenerate = (label) => prepAndGenerateOn(page, label);

        // ════════════ 页面准备：localStorage merge + 刷新 + 生成 ════════════
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!document.getElementById('generate-btn'), { timeout: 30000 });
        // 先放一个哨兵键，模拟「老用户已有其他设置」，再验证 merge 确实保留旧键
        await page.evaluate(() => {
            let cur = {};
            try { cur = JSON.parse(localStorage.getItem('calligraphy_settings') || '{}') || {}; } catch (e) { cur = {}; }
            cur.__verify_keep = 'sentinel';
            localStorage.setItem('calligraphy_settings', JSON.stringify(cur));
        });
        // 先读旧值再 merge（保留其他键）设 layoutType='block-table'；只写不派发（马上要刷新）
        const seeded = await page.evaluate(writeSettingInPage, { layoutType: 'block-table' });
        check('P0 localStorage merge 保留旧键且 layoutType=block-table',
            seeded && seeded.layoutType === 'block-table' && seeded.__verify_keep === 'sentinel',
            seeded && { layoutType: seeded.layoutType, sentinelKept: seeded.__verify_keep },
            '{layoutType:"block-table", sentinelKept:"sentinel"}');
        // 关闭首访引导（浮层按设计盖住控件，与被测版式无关；独立 localStorage 键）
        await page.evaluate(() => {
            localStorage.setItem('onboarding_completed', 'true');
            localStorage.setItem('onboarding_never_show', 'true');
        });
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });

        const gen = await prepAndGenerate('block');
        let blocksOk = false;
        if (!gen || !gen.ok) {
            check(`P1[${'block'}] 生成已触发（填入「${TEXT}」并点刷新字帖）`, false,
                gen, '{ok:true}');
        } else {
            check(`P1[${'block'}] 生成已触发（填入「${TEXT}」并点刷新字帖）`, true, gen, '{ok:true}');
            // 等待 .bt-block 出现（15s 超时即 FAIL）
            blocksOk = await waitPage(
                () => document.querySelectorAll('#grid-container .bt-block').length > 0, 15000);
            if (check('B0 block-table 版式 15s 内渲染出 .bt-block', blocksOk,
                blocksOk ? '已出现' : '15s 超时未出现', '至少 1 块')) {
                // 等笔画数 pill 异步填充完成（hanziDataStore Worker 解压，本地 <10s）；
                // 超时不阻塞 —— 空 pill 走 WARN 通道（断言 3）
                await waitPage(() => {
                    const ps = Array.from(document.querySelectorAll('#grid-container .bt-info .bt-pill'));
                    return ps.length > 0 && ps.every(p => p.textContent.length > 0);
                }, 30000);
                await sleep(800); // 笔画拆解 SVG 异步队列的沉降窗口

                // ════════════ 断言 1：结构 ════════════
                const snap = await page.evaluate(snapshotBlocksInPage);
                check('1a #grid-container[data-layout="block-table"] 存在',
                    !!snap && snap.layoutAttr === 'block-table',
                    snap && snap.layoutAttr, '"block-table"');
                // v3.1.1 分页语义：blockCount 只数 [data-char] 真块（排/前/后/面）；
                // 页末补齐的空块（无 data-char）由断言组 14 专管，不计入本断言
                check('1b 真块 .bt-block[data-char] 数 = 4（排/前/后/面；空补块不计）',
                    !!snap && snap.blockCount === 4,
                    snap && { real: snap.blockCount, all: snap.blockCountAll }, 4);
                const structBad = (snap ? snap.blocks : []).map(b => ({
                    char: b.char, info: b.infoCount, cells: b.cellCount, border: b.rowBorderCount
                })).filter(x => x.info !== 1 || x.cells !== EXP_CELLS || x.border < 1);
                check(`1c 每块 .bt-info=1、.bt-main 格数=btCols(9)×btMainRows(2)=${EXP_CELLS}、含 .grid-svg-row-border`,
                    structBad.length === 0, structBad, '[]');

                // ════════════ 断言 2：内容模式（格 0 范字 / 格 1–3 描摹 / 其余空白） ════════════
                const cell0Bad = (snap ? snap.blocks : []).filter(b =>
                    !b.cell0 || !b.cell0.text || b.cell0.text.length === 0 ||
                    parseFloat(b.cell0.opacity) !== 1);
                check('2a 每块格 0 有非空 text 范字且 opacity=1',
                    cell0Bad.length === 0,
                    cell0Bad.map(b => ({ char: b.char, cell0: b.cell0 })), '[]');
                const traceBad = (snap ? snap.blocks : []).filter(b =>
                    b.traceCells.length !== 3 || b.traceCells.some(op =>
                        op === null || Math.abs(parseFloat(op) - TRACE_OPACITY) > TRACE_TOL));
                check('2b 格 1–3 带 data-ge-trace 且 opacity≈0.2（容差 0.02）',
                    traceBad.length === 0,
                    traceBad.map(b => ({ char: b.char, traceCells: b.traceCells })), '[]');
                const blankBad = (snap ? snap.blocks : []).filter(b =>
                    b.blankTextCounts.some(n => n !== 0));
                check('2c 其余格内容层（.ge-content-layer）无 text 子节点',
                    blankBad.length === 0,
                    blankBad.map(b => ({ char: b.char, blankTextCounts: b.blankTextCounts })), '[]');

                // ════════════ 断言 3：信息行（拼音字体 + 拼音盒宽 + 笔画数 pill） ════════════
                const pyBad = (snap ? snap.blocks : []).filter(b =>
                    !b.pinyinFont || b.pinyinFont.indexOf('TeXGyreAdventor') < 0);
                check('3a 每块信息行 [data-ge-role="pinyin"] 存在且 font-family 含 TeXGyreAdventor',
                    pyBad.length === 0,
                    pyBad.map(b => ({ char: b.char, pinyinFont: b.pinyinFont })), '[]');
                // 2026-10-24 用户反馈修复项：拼音盒只占一格宽（--bt-cell = 13.5mm ± 0.5mm）。
                // 期望 px 由页面实读的 --bt-cell 换算（页面内 getComputedStyle 是权威源），
                // 快照里拿不到时回退契约默认 13.5mm。
                const cellMM = snap && snap.btCellMM ? snap.btCellMM : BT_CELL_MM;
                const expPx = cellMM * MM_TO_PX;
                const tolPx = PYBOX_TOL_MM * MM_TO_PX;
                const pyBoxBad = (snap ? snap.blocks : []).map(b => ({
                    char: b.char, w: b.pinyinBoxW
                })).filter(x => x.w === null || Math.abs(x.w - expPx) > tolPx);
                check(`3b .bt-pinyin-box 计算宽 ≈ var(--bt-cell)（${cellMM}mm=${expPx.toFixed(2)}px，±${PYBOX_TOL_MM}mm=${tolPx.toFixed(2)}px；拼音只占一格宽）`,
                    pyBoxBad.length === 0,
                    { btCellMM: snap && snap.btCellMM, bad: pyBoxBad }, '[]');
                const pillBad = (snap ? snap.blocks : []).filter(b =>
                    b.pillText && !/^\d+画$/.test(b.pillText));
                check('3c 笔画数 pill 文本匹配 /^\\d+画$/（非空者）',
                    pillBad.length === 0,
                    pillBad.map(b => ({ char: b.char, pillText: b.pillText })), '[]');
                const pillEmpty = (snap ? snap.blocks : []).filter(b => !b.pillText);
                if (pillEmpty.length) {
                    warn('3d 部分 pill 为空（离线数据可能缺字，按规格记 WARN 不 FAIL）',
                        pillEmpty.map(b => b.char));
                } else {
                    check('3d 四字 pill 全部非空（排/前/后/面 均命中离线笔画数）',
                        (snap ? snap.blocks : []).map(b => b.pillText).join('|'),
                        '形如 7画|5画|6画|9画');
                }

                // ════════════ 断言 4：组词面板结构 ════════════
                const zrowBad = (snap ? snap.blocks : []).filter(b =>
                    b.zrowCount !== 2 || b.zcellCounts.some(n => n !== 4));
                check('4a 每块 .bt-zrow 数 = btZuciRows(2) 且每行 4 个 .bt-zcell',
                    zrowBad.length === 0,
                    zrowBad.map(b => ({ char: b.char, zrowCount: b.zrowCount, zcellCounts: b.zcellCounts })), '[]');
                check('4b .bt-zcell 无 data-char 属性（组词区点击不得触发笔顺演示委托）',
                    !!snap && snap.zcellCharTotal === 0,
                    snap && snap.zcellCharTotal, 0);

                // ════════════ 断言 5：组词档位切换（探针法 + 真实点击链） ════════════
                const tagged = await page.evaluate(tagFirstBlockProbeInPage);
                check('5a 探针已打标（第一个 .bt-block data-probe="BT1"）', tagged, tagged, true);
                const initLevel = snap && snap.blocks[0] ? snap.blocks[0].zuciLevel : null;
                check('5b 初始档位 = trace（契约默认 btZuciLevel）', initLevel === 'trace',
                    initLevel, '"trace"');

                // 5c 点 .bt-zhead 一次：ztouch 循环 trace→full。词字节点 opacity=1、
                // 探针仍在（updateSetting→btApplyZuciLevel 定向改写，不重建块）、不弹编辑浮层。
                const clickFull = await page.evaluate(clickZheadInPage);
                const fullOk = await waitPage(() => {
                    const p = document.querySelector('#grid-container .bt-zuci');
                    return !!p && p.getAttribute('data-bt-level') === 'full' &&
                        document.querySelectorAll('#grid-container [data-ge-role="bt-zuci-word"]').length > 0;
                }, 10000);
                const fullSnap = await page.evaluate(() => {
                    const p = document.querySelector('#grid-container .bt-zuci');
                    const b0 = document.querySelector('#grid-container .bt-block');
                    return {
                        level: p ? p.getAttribute('data-bt-level') : null,
                        wordCount: document.querySelectorAll('#grid-container [data-ge-role="bt-zuci-word"]').length,
                        opacities: Array.from(document.querySelectorAll('#grid-container [data-ge-role="bt-zuci-word"]'))
                            .slice(0, 8).map(t => t.getAttribute('opacity')),
                        probe: !!document.querySelector('#grid-container .bt-block[data-probe="BT1"]'),
                        btmeOpen: !!document.getElementById('btManualEditOverlay'),
                        words1: b0 ? (b0.getAttribute('data-zuci-multi') || '') : null
                    };
                });
                check('5c 点击 .bt-zhead 一次 → data-bt-level=full、词字 [data-ge-role="bt-zuci-word"] opacity=1、探针仍在、未弹编辑浮层',
                    clickFull.clicked && !clickFull.btmeOpen && fullOk &&
                    fullSnap.level === 'full' && fullSnap.wordCount > 0 &&
                    fullSnap.probe && !fullSnap.btmeOpen &&
                    fullSnap.opacities.every(o => parseFloat(o) === 1),
                    { click: clickFull, ...fullSnap },
                    '{level:"full", wordCount>0, opacities 全 1, probe:true, btmeOpen:false}');

                // 5d 再点 .bt-zhead 一次：full→hidden。词字节点 0、探针仍在。
                const clickHidden = await page.evaluate(clickZheadInPage);
                const hiddenOk = await waitPage(() => {
                    const p = document.querySelector('#grid-container .bt-zuci');
                    return !!p && p.getAttribute('data-bt-level') === 'hidden' &&
                        document.querySelectorAll('#grid-container [data-ge-role="bt-zuci-word"]').length === 0;
                }, 10000);
                const hiddenSnap = await page.evaluate(() => {
                    const p = document.querySelector('#grid-container .bt-zuci');
                    return {
                        level: p ? p.getAttribute('data-bt-level') : null,
                        wordCount: document.querySelectorAll('#grid-container [data-ge-role="bt-zuci-word"]').length,
                        probe: !!document.querySelector('#grid-container .bt-block[data-probe="BT1"]'),
                        btmeOpen: !!document.getElementById('btManualEditOverlay')
                    };
                });
                check('5d 再点击 .bt-zhead 一次 → data-bt-level=hidden、词字节点为 0、探针仍在（块未重建）',
                    clickHidden.clicked && hiddenOk && hiddenSnap.level === 'hidden' &&
                    hiddenSnap.wordCount === 0 && hiddenSnap.probe && !hiddenSnap.btmeOpen,
                    { click: clickHidden, ...hiddenSnap },
                    '{level:"hidden", wordCount:0, probe:true, btmeOpen:false}');

                // 5e 恢复：从 localStorage 设 btZuciLevel='trace' 派发 settings-updated
                //（定向改写通道：main.js APPEARANCE_KEYS 命中 → btApplyZuciLevel，非全量重建）
                await page.evaluate(setSettingInPage, { btZuciLevel: 'trace' });
                const traceOk = await waitPage(() => {
                    const p = document.querySelector('#grid-container .bt-zuci');
                    if (!p || p.getAttribute('data-bt-level') !== 'trace') return false;
                    const ws = Array.from(document.querySelectorAll('#grid-container [data-ge-role="bt-zuci-word"]'));
                    return ws.length > 0 && ws.every(t => Math.abs(parseFloat(t.getAttribute('opacity')) - 0.2) <= 0.02);
                }, 10000);
                const traceSnap = await page.evaluate(() => {
                    const p = document.querySelector('#grid-container .bt-zuci');
                    return {
                        level: p ? p.getAttribute('data-bt-level') : null,
                        wordCount: document.querySelectorAll('#grid-container [data-ge-role="bt-zuci-word"]').length,
                        opacities: Array.from(document.querySelectorAll('#grid-container [data-ge-role="bt-zuci-word"]'))
                            .slice(0, 8).map(t => t.getAttribute('opacity')),
                        probe: !!document.querySelector('#grid-container .bt-block[data-probe="BT1"]')
                    };
                });
                check('5e localStorage 设 btZuciLevel=trace 派发 → 词字 opacity≈0.2（容差 0.02）且探针仍在（定向改写通道）',
                    traceOk && traceSnap.level === 'trace' && traceSnap.wordCount > 0 &&
                    traceSnap.probe && traceSnap.opacities.every(o => Math.abs(parseFloat(o) - 0.2) <= 0.02),
                    traceSnap, '{level:"trace", opacities 全≈0.2, probe:true}');

                // ════════════ 断言 6：格型/颜色定向重绘 ════════════
                // 默认 gridType 已是 tian 或 mizi 取决于用户历史：先切 tian 再切回 mizi，
                // 证明对角线是「跟着设置走」的定向重绘结果，而不是默认值巧合。
                await page.evaluate(setSettingInPage, { gridType: 'tian' });
                await waitPage(() => {
                    const c = document.querySelector('#grid-container[data-layout="block-table"] .bt-main .grid-svg-cell');
                    return !!c && c.getAttribute('data-grid-type') === 'tian';
                }, 10000);
                await page.evaluate(setSettingInPage, { gridType: 'mizi' });
                const miziOk = await waitPage(() => {
                    const c = document.querySelector('#grid-container[data-layout="block-table"] .bt-main .grid-svg-cell');
                    return !!c && c.getAttribute('data-grid-type') === 'mizi';
                }, 10000);
                const miziSnap = await page.evaluate(() => {
                    const isDiag = (l) => {
                        const x1 = +l.getAttribute('x1'), y1 = +l.getAttribute('y1');
                        const x2 = +l.getAttribute('x2'), y2 = +l.getAttribute('y2');
                        return (x1 === 0 && y1 === 0 && x2 === 100 && y2 === 100) ||
                            (x1 === 100 && y1 === 0 && x2 === 0 && y2 === 100);
                    };
                    let diag = 0;
                    document.querySelectorAll('#grid-container .bt-main .grid-svg-cell .ge-grid-layer')
                        .forEach(g => g.querySelectorAll('line').forEach(l => { if (isDiag(l)) diag++; }));
                    return {
                        diag,
                        probe: !!document.querySelector('#grid-container .bt-block[data-probe="BT1"]')
                    };
                });
                check('6a gridType 切 mizi → .bt-main .grid-svg-cell 出现对角线 line（count>0）且探针仍在',
                    miziOk && miziSnap.diag > 0 && miziSnap.probe,
                    miziSnap, '{diag>0, probe:true}');

                await page.evaluate(setSettingInPage, { gridColorPreset: 'red' });
                const redOk = await waitPage(() => {
                    const r = document.querySelector('#grid-container .grid-svg-row-border rect');
                    const l = document.querySelector('#grid-container .bt-pinyin-box line');
                    const w = document.querySelector('#grid-container .bt-block [data-ge-role="bt-zuci-word"]');
                    return !!r && (r.getAttribute('fill') || '').toUpperCase() === '#9E2A2B' &&
                        !!l && (l.getAttribute('stroke') || '').toUpperCase() === '#B14A4B' &&
                        !!w && (w.getAttribute('fill') || '').toUpperCase() === '#7A1F20';
                }, 10000);
                const redSnap = await page.evaluate(() => {
                    const r = document.querySelector('#grid-container .grid-svg-row-border rect');
                    const l = document.querySelector('#grid-container .bt-pinyin-box line');
                    const w = document.querySelector('#grid-container .bt-block [data-ge-role="bt-zuci-word"]');
                    return {
                        borderFill: r ? r.getAttribute('fill') : null,
                        pinyinLineStroke: l ? l.getAttribute('stroke') : null,
                        wordFill: w ? w.getAttribute('fill') : null,
                        probe: !!document.querySelector('#grid-container .bt-block[data-probe="BT1"]')
                    };
                });
                check('6b gridColorPreset=red → 行边框 rect fill=#9E2A2B 且 .bt-pinyin-box line stroke=#B14A4B 且词字 fill=#7A1F20（btRecolor 生效）且探针仍在',
                    redOk && redSnap.probe &&
                    (redSnap.borderFill || '').toUpperCase() === '#9E2A2B' &&
                    (redSnap.pinyinLineStroke || '').toUpperCase() === '#B14A4B' &&
                    (redSnap.wordFill || '').toUpperCase() === '#7A1F20',
                    redSnap,
                    '{borderFill:"#9E2A2B", pinyinLineStroke:"#B14A4B", wordFill:"#7A1F20", probe:true}');

                // 探针使命完成，摘标（保持 DOM 干净再进弹窗断言）
                await page.evaluate(() => {
                    const b = document.querySelector('#grid-container .bt-block[data-probe="BT1"]');
                    if (b) b.removeAttribute('data-probe');
                });

                // ════════════ 断言 7：笔顺演示隔离（主表格格子 → 演示弹窗） ════════════
                // 注意：.grid-svg-cell 是 SVG 元素，没有 .click()（HTMLElement 专属），
                // 必须派发 MouseEvent 且 bubbles:true 才能冒泡到 #grid-container 的委托
                const cellClicked = await page.evaluate(() => {
                    const c = document.querySelector('#grid-container .bt-block .bt-main .grid-svg-cell[data-char]');
                    if (!c) return false;
                    c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    return true;
                });
                const demoOpened = await waitPage(() => document.querySelector('.sd-window') !== null, 10000);
                const demoSnap = await page.evaluate(() => ({
                    overlay: !!document.querySelector('.sd-overlay'),
                    windows: document.querySelectorAll('.sd-window').length
                }));
                check('7a 点击主表格格子（.grid-svg-cell[data-char]）→ 出现笔顺演示弹窗（.sd-overlay/.sd-window）',
                    cellClicked && demoOpened && demoSnap.windows > 0,
                    { clicked: cellClicked, ...demoSnap }, '{overlay:true, windows>=1}');
                const closeClicked = await page.evaluate(() => {
                    const b = document.querySelector('.sd-window .sd-btn-close');
                    if (!b) return false;
                    b.click();
                    return true;
                });
                const demoClosed = await waitPage(() => document.querySelectorAll('.sd-window').length === 0, 6000);
                check('7b 笔顺演示弹窗已关闭', closeClicked && demoClosed,
                    { closeClicked, windows: demoClosed ? 0 : '仍>0' }, '关闭成功');

                // ════════════ 断言 8：组词编辑隔离（.bt-zuci → btManualEdit 浮层） ════════════
                const zcellClicked = await page.evaluate(() => {
                    const z = document.querySelector('#grid-container .bt-block .bt-zuci .bt-zrow .bt-zcell');
                    if (!z) return false;
                    z.click();
                    return true;
                });
                const meOpened = await waitPage(() => document.getElementById('btManualEditOverlay') !== null, 6000);
                const meSnap = await page.evaluate(() => {
                    const ov = document.getElementById('btManualEditOverlay');
                    return {
                        open: !!ov,
                        scModal: !!(ov && ov.querySelector('.sc-modal')),
                        title: ov && ov.querySelector('.sc-title') ? ov.querySelector('.sc-title').textContent : '',
                        pinyin: !!(ov && ov.querySelector('#btmePinyin')),
                        z1: !!(ov && ov.querySelector('#btmeZuci1')),
                        z2: !!(ov && ov.querySelector('#btmeZuci2')),
                        sdWindows: document.querySelectorAll('.sd-window').length
                    };
                });
                check('8a 点击 .bt-zuci（非 .bt-zhead）→ #btManualEditOverlay（.sc-modal）出现，含 #btmePinyin/#btmeZuci1/#btmeZuci2 且无新笔顺弹窗',
                    zcellClicked && meOpened && meSnap.open && meSnap.scModal &&
                    meSnap.pinyin && meSnap.z1 && meSnap.z2 && meSnap.sdWindows === 0,
                    { clicked: zcellClicked, ...meSnap },
                    '{open:true, scModal:true, pinyin:true, z1:true, z2:true, sdWindows:0}');
                check('8b 浮层标题含「编辑生字卡」（btManualEdit 专属，非经典「手动修改」）',
                    meSnap.title.indexOf('编辑生字卡') >= 0, meSnap.title, '含"编辑生字卡"');
                const meClosed = await page.evaluate(() => {
                    const b = document.getElementById('btmeClose');
                    if (!b) return false;
                    b.click();
                    return true;
                });
                const meGone = await waitPage(() => document.getElementById('btManualEditOverlay') === null, 6000);
                check('8c btManualEdit 浮层已关闭', meClosed && meGone, { meClosed, gone: meGone }, '关闭成功');
            }
        }

        // ════════════ 断言 9：经典回归（layoutType=classic 零回归） ════════════
        await page.evaluate(writeSettingInPage, { layoutType: 'classic' });
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        const gen2 = await prepAndGenerate('classic');
        let classicOk = false;
        if (!gen2 || !gen2.ok) {
            check('9-prep 经典版式生成已触发', false, gen2, '{ok:true}');
        } else {
            classicOk = await waitPage(
                () => document.querySelectorAll('#grid-container .grid-svg-row').length > 0, 30000);
            const classicSnap = await page.evaluate(() => ({
                layout: (document.getElementById('grid-container') || { getAttribute: () => null }).getAttribute('data-layout'),
                rows: document.querySelectorAll('#grid-container .grid-svg-row').length,
                btAny: document.querySelectorAll('[class*="bt-"]').length,
                btBlocks: document.querySelectorAll('.bt-block').length
            }));
            check('9a 经典版式：layout=classic、4 行字格、无任何 bt- 类元素',
                classicOk && classicSnap.layout === 'classic' &&
                classicSnap.rows === 4 && classicSnap.btAny === 0 && classicSnap.btBlocks === 0,
                classicSnap, '{layout:"classic", rows:4, btAny:0, btBlocks:0}');

            // 15d 经典拼音辅助行零影响（§12.B.9；classic 态在此取证，标签归组 15）：
            // createAuxRow 的四线格保持冻结设计 —— preserveAspectRatio="none" +
            // 内嵌文字（与块帖 v3.1.1 的"线字分离"是两套独立实现，经典侧一个不动）
            const classicAux15d = await page.evaluate(() => {
                const aux = document.querySelector('#grid-container .grid-svg-aux-row');
                const t = aux ? aux.querySelector('[data-ge-role="pinyin"]') : null;
                const svg = t ? t.closest('svg') : null;
                return {
                    auxFound: !!aux,
                    lineCount: aux ? aux.querySelectorAll('line').length : 0,
                    pyFont: t ? t.getAttribute('font-family') : null,
                    par: svg ? svg.getAttribute('preserveAspectRatio') : null
                };
            });
            check('15d 经典辅助行（createAuxRow）零影响：四线格 line 存在、拼音 TeXGyreAdventor、preserveAspectRatio 保持 classic 冻结设计（none）',
                classicAux15d.auxFound && classicAux15d.lineCount >= 2 &&
                classicAux15d.pyFont && classicAux15d.pyFont.indexOf('TeXGyreAdventor') >= 0 &&
                classicAux15d.par === 'none',
                classicAux15d, '{auxFound:true, lineCount>=2, pyFont含TeXGyreAdventor, par:"none"}');

            // 9b 点击经典行右侧 pinyin-zuci 格（SVG 节点 → MouseEvent）→ 经典 manualEdit 浮层
            const pzClicked = await page.evaluate(() => {
                const c = document.querySelector('#grid-container .grid-svg-cell[data-grid-type="pinyin-zuci"]');
                if (!c) return false;
                c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                return true;
            });
            const classicMeOpened = await waitPage(() => document.getElementById('manualEditOverlay') !== null, 6000);
            const classicMeSnap = await page.evaluate(() => {
                const ov = document.getElementById('manualEditOverlay');
                return {
                    open: !!ov,
                    scModal: !!(ov && ov.querySelector('.sc-modal')),
                    title: ov && ov.querySelector('.sc-title') ? ov.querySelector('.sc-title').textContent : '',
                    pinyin: !!(ov && ov.querySelector('#mePinyin')),
                    z1: !!(ov && ov.querySelector('#meZuci1')),
                    z2: !!(ov && ov.querySelector('#meZuci2'))
                };
            });
            check('9b 点击经典行 pinyin-zuci 格 → 经典 manualEdit 浮层（含"手动修改"的 .sc-modal 与拼音/组词×2 inputs）',
                pzClicked && classicMeOpened && classicMeSnap.open && classicMeSnap.scModal &&
                classicMeSnap.title.indexOf('手动修改') >= 0 &&
                classicMeSnap.pinyin && classicMeSnap.z1 && classicMeSnap.z2,
                { clicked: pzClicked, ...classicMeSnap },
                '{open:true, scModal:true, title含"手动修改", pinyin/z1/z2:true}');
            await page.evaluate(() => {
                const b = document.getElementById('meClose');
                if (b) b.click();
            });
            await waitPage(() => document.getElementById('manualEditOverlay') === null, 6000);

            // 9c 点击经典行左侧字格（SVG 节点）→ 不弹编辑浮层（笔顺演示接管）
            const leftClicked = await page.evaluate(() => {
                const c = document.querySelector('#grid-container .grid-svg-cell[data-char]');
                if (!c) return false;
                c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                return true;
            });
            const leftDemoOpened = await waitPage(() => document.querySelector('.sd-window') !== null, 10000);
            const leftSnap = await page.evaluate(() => ({
                sdWindows: document.querySelectorAll('.sd-window').length,
                manualEdit: !!document.getElementById('manualEditOverlay'),
                btme: !!document.getElementById('btManualEditOverlay')
            }));
            check('9c 点击经典左侧字格：不弹编辑浮层（笔顺演示接管，.sd-window 出现）',
                leftClicked && leftDemoOpened && leftSnap.sdWindows > 0 &&
                !leftSnap.manualEdit && !leftSnap.btme,
                { clicked: leftClicked, ...leftSnap }, '{sdWindows>=1, manualEdit:false, btme:false}');
            try {
                await page.evaluate(() => {
                    const b = document.querySelector('.sd-window .sd-btn-close');
                    if (b) b.click();
                });
                await waitPage(() => document.querySelectorAll('.sd-window').length === 0, 6000);
            } catch (e9z) {
                record('HARNESS[9c 收尾] 关闭演示弹窗异常', 'FAIL',
                    (e9z && e9z.message ? e9z.message : String(e9z)), 'no throw');
            }
        }

        // ════════════ 断言 10：窄屏溢出（390×844 无横向溢出） ════════════
        // 测量域说明（本关口首跑实测踩坑，写死为规矩）：
        //   本断言对 **dist 构建产物（file://）** 取证 —— 与兄弟关口 verify:touch 同一
        //   测量域（其默认目标即 file://dist/index.html）。dev server（http://localhost）
        //   下存在一个**与版式无关**的干扰项：收起态历史抽屉（.history-sidebar，
        //   position:fixed + translateX(100%) 停在视口右外侧）会被计入
        //   documentElement.scrollWidth —— 同一浏览器同一时刻 A/B 实测：
        //   dev 下 classic=780 / block-table=780（隐藏抽屉后均回落 390）；
        //   dist 下 classic=390 / block-table=390（抽屉在但不被计入）。
        //   也就是说在 dev 上量，任何版式都会误报；本断言优先走 dist。
        try {
            const distIndex = path.join(ROOT, 'dist', 'index.html');
            const useDist = fs.existsSync(distIndex);
            let p10 = page;
            if (useDist) {
                p10 = await browser.newPage();
                await p10.setRequestInterception(true);
                p10.on('request', (req) => {
                    const u = req.url();
                    if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) { req.abort().catch(() => {}); }
                    else req.continue().catch(() => {});
                });
                await p10.setViewport({ width: 390, height: 844 });
                await p10.goto('file:///' + distIndex.split(path.sep).join('/'),
                    { waitUntil: 'load', timeout: 60000 });
            } else {
                warn('10-prep dist/index.html 不存在，降级 dev server 测量（先隐藏收起态历史抽屉剔除版式无关干扰）',
                    String(useDist));
                await page.evaluate(writeSettingInPage, { layoutType: 'block-table' });
                await page.setViewport({ width: 390, height: 844 });
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            }
            await p10.waitForFunction(() => !!document.getElementById('generate-btn'), { timeout: 60000 });
            await p10.evaluate(writeSettingInPage, { layoutType: 'block-table' });
            await p10.evaluate(() => {
                localStorage.setItem('onboarding_completed', 'true');
                localStorage.setItem('onboarding_never_show', 'true');
            });
            await p10.reload({ waitUntil: 'load', timeout: 60000 });
            const gen3 = await prepAndGenerateOn(p10, 'narrow');
            if (!gen3 || !gen3.ok) {
                check('10-prep 窄屏 block-table 生成已触发', false, gen3, '{ok:true}');
            } else {
                // dev 降级路径：隐藏收起态历史抽屉（版式无关的 scrollWidth 干扰项，见上注）
                let drawerSw = null;
                if (!useDist) {
                    drawerSw = await p10.evaluate(() => {
                        const hs = document.querySelector('.history-sidebar');
                        const sw = document.documentElement.scrollWidth;
                        if (hs) hs.style.display = 'none';
                        return sw;
                    });
                    if (drawerSw > 390) {
                        warn('10-prep dev 降级：收起态历史抽屉本身把 scrollWidth 抬到 >390（classic 同值，与版式无关）',
                            drawerSw);
                    }
                }
                const narrowReady = await waitPageOn(p10,
                    () => document.querySelectorAll('#grid-container .bt-block').length > 0, 20000);
                const narrowSnap = await p10.evaluate(() => {
                    const sheet = document.querySelector('.bt-sheet');
                    const r = sheet ? sheet.getBoundingClientRect() : null;
                    return {
                        sw: document.documentElement.scrollWidth,
                        bodySw: document.body.scrollWidth,
                        innerW: window.innerWidth,
                        sheetRight: r ? Math.round(r.right) : null,
                        sheetLeft: r ? Math.round(r.left) : null
                    };
                });
                check('10 窄屏 390×844 block-table：documentElement.scrollWidth ≤ 390（无横向溢出）',
                    narrowReady && narrowSnap.sw <= 390,
                    narrowSnap, '{sw<=390}');
                check('10b 窄屏 390×844：.bt-sheet 变换后视觉盒完全落在视口内（left≥0 且 right≤390）',
                    narrowReady && narrowSnap.sheetLeft !== null &&
                    narrowSnap.sheetLeft >= 0 && narrowSnap.sheetRight <= 390,
                    narrowSnap, '{sheetLeft>=0, sheetRight<=390}');
            }
            if (p10 !== page) await p10.close();
        } catch (e10) {
            record('HARNESS[断言 10] 自身异常', 'FAIL',
                (e10 && e10.message ? e10.message : String(e10)), 'no throw');
        }

        // ════════════ 断言 11：aiZuci 缓存字节一致性（经典条目零污染 + multi 回环） ════════════
        // dev server 可转换模块：page.evaluate 里动态 import('/src/modules/aiZuci.js')
        // 与应用主图同 URL → 同一模块实例；写读全部经该模块 + localStorage 回读，双保险。
        let cacheRes = null;
        let cacheErr = null;
        try {
            cacheRes = await page.evaluate(async () => {
                const m = await import('/src/modules/aiZuci.js');
                const out = {};
                // a) 经典写入：条目键集恰为 10 键，且无 zuciMulti
                m.updateAiZuciCache('测', { pinyin: 'cè', zuci: ['对策'] });
                let entry = null;
                try { entry = JSON.parse(localStorage.getItem('ai_zuci_cache_v2') || '{}')['测'] || null; } catch (e) { entry = null; }
                out.keysA = entry ? Object.keys(entry).sort() : null;
                out.hasMultiA = entry ? ('zuciMulti' in entry) : null;
                // b) multi 写 → 读回环
                m.updateAiZuciMulti('测', { pinyin: 'cè', zuciMulti: ['测试', '测验工具'] });
                out.multiB = m.getAiZuciMulti('测');
                // c) 经典再写：zuciMulti 经 CARRY_FIELDS 透传保留
                m.updateAiZuciCache('测', { zuci: ['对策', '测量'] });
                out.multiC = m.getAiZuciMulti('测');
                try { out.zuciC = JSON.parse(localStorage.getItem('ai_zuci_cache_v2') || '{}')['测'].zuci; } catch (e) { out.zuciC = null; }
                // 测完清理
                localStorage.removeItem('ai_zuci_cache_v2');
                return out;
            });
        } catch (e) {
            cacheErr = String(e && e.message ? e.message : e);
        }
        if (cacheErr) {
            check('11 aiZuci 缓存回环（dev server 动态 import）', false, cacheErr,
                'import 成功并完成三步回环');
        } else {
            const EXPECT_KEYS = ['model', 'pinyin', 'pinyinChecked', 'pinyinFixed',
                'provider', 'schemaVersion', 'source', 'updatedAt', 'userEdited', 'zuci'];
            check('11a updateAiZuciCache 条目键集恰为 10 键（schemaVersion,source,provider,model,updatedAt,pinyin,pinyinFixed,pinyinChecked,zuci,userEdited）且无 zuciMulti',
                JSON.stringify(cacheRes.keysA) === JSON.stringify(EXPECT_KEYS) && cacheRes.hasMultiA === false,
                { keys: cacheRes.keysA, hasZuciMulti: cacheRes.hasMultiA },
                { keys: EXPECT_KEYS, hasZuciMulti: false });
            check('11b updateAiZuciMulti(测,{zuciMulti:[测试,测验工具]}) → getAiZuciMulti(测) 深度等于 ["测试","测验工具"]',
                JSON.stringify(cacheRes.multiB) === JSON.stringify(['测试', '测验工具']),
                cacheRes.multiB, '["测试","测验工具"]');
            check('11c 再经经典 updateAiZuciCache 写 zuci 后 zuciMulti 仍在（CARRY_FIELDS 透传保留）',
                JSON.stringify(cacheRes.multiC) === JSON.stringify(['测试', '测验工具']),
                { multi: cacheRes.multiC, zuci: cacheRes.zuciC },
                '{multi:["测试","测验工具"], zuci:["对策","测量"]}');
        }

        // ════════════ 断言 12：打印媒体（先复位 block-table 再取证） ════════════
        // 上文断言 9 已把 page 切到 classic —— 打印断言必须在 block-table 版式下做，
        // 否则 .bt-block 不存在（首跑实锤：12a/12b 因此假红）。复位走「写 localStorage
        // + 刷新 + prepAndGenerate」的确定性通道，不走事件派发（layoutType 是结构键）。
        try {
            await page.evaluate(writeSettingInPage, { layoutType: 'block-table' });
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            const gen4 = await prepAndGenerate('print');
            const printReady = gen4 && gen4.ok ?
                await waitPage(() => document.querySelectorAll('#grid-container .bt-block').length > 0, 20000) : false;
            if (!printReady) {
                check('12-prep 打印取证前 block-table 复位', false,
                    { gen: gen4, blocksReady: printReady }, '.bt-block 已出现');
            } else {
                await page.setViewport({ width: 1280, height: 900 });
                await page.emulateMediaType('print');
                const printSnap = await page.evaluate(() => {
                    const pill = document.querySelector('#grid-container .bt-zhead .bt-pill-level');
                    const block = document.querySelector('#grid-container .bt-block');
                    return {
                        pillFound: !!pill,
                        pillDisplay: pill ? getComputedStyle(pill).display : null,
                        blockFound: !!block,
                        breakInside: block ? getComputedStyle(block).breakInside : null
                    };
                });
                check('12a print 媒体下档位 pill（.bt-zhead .bt-pill-level）display=none',
                    printSnap.pillFound && printSnap.pillDisplay === 'none',
                    printSnap, '{pillDisplay:"none"}');
                check('12b print 媒体下 .bt-block break-inside 计算值 = avoid（不跨页断块）',
                    printSnap.blockFound && printSnap.breakInside === 'avoid',
                    printSnap, '{breakInside:"avoid"}');
                const pdfPath = path.join(__dirname, '_bt_verify_test.pdf');
                try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch { /* 忽略 */ }
                let pdfSize = 0;
                let pdfErr = null;
                try {
                    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
                    pdfSize = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0;
                } catch (e) {
                    pdfErr = String(e && e.message ? e.message : e);
                }
                check('12c page.pdf() 产出非空（>5KB）', pdfSize > 5 * 1024,
                    `${pdfSize} bytes`, '>5120 bytes', pdfErr || undefined);
                try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch { /* 忽略 */ }
                await page.emulateMediaType('screen');
            }
        } catch (e12) {
            record('HARNESS[断言 12] 自身异常', 'FAIL',
                (e12 && e12.message ? e12.message : String(e12)), 'no throw');
        }

        // ════════════ 断言 13：版式切换按钮（#layout-toggle-btn） ════════════
        // 当前 page 处于 block-table 态（断言 12 复位后）。点击 → aria-pressed=false +
        // data-layout=classic + .bt-block=0 + .grid-svg-row 出现；再点回 block-table 恢复。
        // aria-pressed 语义：main.js syncLayoutBtn 把它设为 isBlockTableLayout 的字符串。
        try {
            const preSnap = await page.evaluate(() => {
                const btn = document.getElementById('layout-toggle-btn');
                const c = document.getElementById('grid-container');
                return {
                    btnFound: !!btn,
                    pressed: btn ? btn.getAttribute('aria-pressed') : null,
                    layout: c ? c.getAttribute('data-layout') : null,
                    // v3.1.1 口径：真块（[data-char]）数；空补块不计
                    blocks: document.querySelectorAll('#grid-container .bt-block[data-char]').length
                };
            });
            const toggleClick1 = await page.evaluate(() => {
                const btn = document.getElementById('layout-toggle-btn');
                if (!btn) return false;
                btn.click();
                return true;
            });
            // 结构键变更 → 全量重建：等 classic 四要素齐（按钮态 + 容器 + 真块清零 + 经典行出现）
            // （v3.1.1：.bt-block 计数用 [data-char] 真块口径，空补块不参与）
            const toClassic = await waitPage(() => {
                const btn = document.getElementById('layout-toggle-btn');
                const c = document.getElementById('grid-container');
                return !!btn && btn.getAttribute('aria-pressed') === 'false' &&
                    !!c && c.getAttribute('data-layout') === 'classic' &&
                    document.querySelectorAll('#grid-container .bt-block[data-char]').length === 0 &&
                    document.querySelectorAll('#grid-container .grid-svg-row').length > 0;
            }, 30000);
            const classicSnap13 = await page.evaluate(() => ({
                pressed: document.getElementById('layout-toggle-btn').getAttribute('aria-pressed'),
                layout: document.getElementById('grid-container').getAttribute('data-layout'),
                blocks: document.querySelectorAll('#grid-container .bt-block[data-char]').length,
                rows: document.querySelectorAll('#grid-container .grid-svg-row').length
            }));
            check('13a #layout-toggle-btn 点击（block-table 态）→ aria-pressed=false 且 data-layout=classic 且真块=0 且 .grid-svg-row 出现',
                preSnap.pressed === 'true' && preSnap.blocks > 0 &&
                toggleClick1 && toClassic &&
                classicSnap13.pressed === 'false' && classicSnap13.layout === 'classic' &&
                classicSnap13.blocks === 0 && classicSnap13.rows > 0,
                { pre: preSnap, clicked: toggleClick1, after: classicSnap13 },
                '{pre:{pressed:"true",blocks>0}, after:{pressed:"false", layout:"classic", blocks:0, rows>0}}');

            const toggleClick2 = await page.evaluate(() => {
                const btn = document.getElementById('layout-toggle-btn');
                if (!btn) return false;
                btn.click();
                return true;
            });
            const backBt = await waitPage(() => {
                const btn = document.getElementById('layout-toggle-btn');
                const c = document.getElementById('grid-container');
                return !!btn && btn.getAttribute('aria-pressed') === 'true' &&
                    !!c && c.getAttribute('data-layout') === 'block-table' &&
                    document.querySelectorAll('#grid-container .bt-block[data-char]').length === 4;
            }, 30000);
            const backSnap = await page.evaluate(() => ({
                pressed: document.getElementById('layout-toggle-btn').getAttribute('aria-pressed'),
                layout: document.getElementById('grid-container').getAttribute('data-layout'),
                blocks: document.querySelectorAll('#grid-container .bt-block[data-char]').length
            }));
            check('13b 再点击 #layout-toggle-btn → 恢复 block-table（aria-pressed=true、data-layout=block-table、真块 .bt-block[data-char]=4）',
                toggleClick2 && backBt && backSnap.pressed === 'true' &&
                backSnap.layout === 'block-table' && backSnap.blocks === 4,
                { clicked: toggleClick2, after: backSnap },
                '{pressed:"true", layout:"block-table", blocks:4}');
        } catch (e13) {
            record('HARNESS[断言 13] 自身异常', 'FAIL',
                (e13 && e13.stack ? e13.stack.split('\n').slice(0, 4).join(' | ') : String(e13)), 'no throw');
        }

        // ════════════ 断言 14：显式分页（v3.1.1 §12.A，每页固定 6 块） ════════════
        // 默认 4 字只有单页，证明不了"每页恰 6 块"；用 22 字长文 → ceil(22/6)=4 页
        // （前 3 页满 6 实块，末页 4 实块 + 2 空块补满），各组断言均有样本。
        try {
            const gen5 = await page.evaluate(setInputAndGenerateInPage, PAGES_TEXT);
            // 期望真块数经参数传入页面（自包含纪律，见文件头坑 1）
            const pagedReady = gen5 && gen5.ok ?
                await waitPage(
                    (n) => document.querySelectorAll('#grid-container .bt-block[data-char]').length === n,
                    20000, PAGES_TEXT.length) : false;
            if (!pagedReady) {
                check('14-prep 22 字多页渲染就绪（真块数 = 22）', false,
                    { gen: gen5, ready: pagedReady }, '真块数 = 23');
            } else {
                await sleep(1200); // 笔画异步队列沉降窗口（分页几何与笔画无关，等 DOM 稳定）
                const pg = await page.evaluate(() => {
                    const MM = 96 / 25.4;
                    const sheet = document.querySelector('#grid-container .bt-sheet');
                    const pages = sheet ? Array.from(sheet.querySelectorAll(':scope > .bt-page')) : [];
                    const facts = pages.map((p, i) => {
                        const blocks = Array.from(p.children).filter(n => n.classList.contains('bt-block'));
                        const cs = getComputedStyle(p);
                        const pr = p.getBoundingClientRect();
                        const contentBottom = pr.bottom - (parseFloat(cs.paddingBottom) || 0);
                        const last = blocks[blocks.length - 1];
                        return {
                            i,
                            directBlocks: blocks.length,
                            realBlocks: blocks.filter(b => b.hasAttribute('data-char')).length,
                            hasHead: !!p.querySelector('.bt-sheet-head'),
                            compact: p.classList.contains('bt-head-compact'),
                            // 每页最后一块底边到页内容底的余量（mm；§12.A 内容盒口径）
                            lastGapMM: last ? (contentBottom - last.getBoundingClientRect().bottom) / MM : null
                        };
                    });
                    return {
                        pagesAttr: sheet ? Number(sheet.getAttribute('data-bt-pages')) : null,
                        perPageAttr: sheet ? Number(sheet.getAttribute('data-bt-per-page')) : null,
                        blockMM: sheet ? Number(sheet.getAttribute('data-bt-block-mm')) : null,
                        headMM: sheet ? Number(sheet.getAttribute('data-bt-head-mm')) : null,
                        guardOk: sheet ? sheet.getAttribute('data-bt-guard-ok') : null,
                        realChars: document.querySelectorAll('#grid-container .bt-block[data-char]').length,
                        facts
                    };
                });
                const expPages = Math.ceil(PAGES_TEXT.length / BT_PER_PAGE);

                // 14a 每个 .bt-page 恰好 5 个直接 .bt-block（实块+空补块）；页数/每页数
                // 元数据一致；实块分布加总 = 22；页头仅首页（§12.A.2/A.3）
                const distOk = pg.facts.map(f => f.realBlocks).reduce((a, b) => a + b, 0) === pg.realChars;
                const lastReal = pg.facts.length ? pg.facts[pg.facts.length - 1].realBlocks : -1;
                const heads = pg.facts.filter(f => f.hasHead);
                const headOk = heads.length === 0 ? true : (heads.length === 1 && heads[0].i === 0);
                const badA = pg.facts.filter(f => f.directBlocks !== BT_PER_PAGE)
                    .map(f => ({ i: f.i, directBlocks: f.directBlocks }));
                check(`14a 每个 .bt-page 恰 ${BT_PER_PAGE} 个直接 .bt-block（页数=${expPages}、末页实块=${lastReal} 补空到 ${BT_PER_PAGE}）`,
                    pg.facts.length === expPages && pg.pagesAttr === expPages &&
                    pg.perPageAttr === BT_PER_PAGE && badA.length === 0 && distOk && headOk,
                    { pages: pg.facts.length, pagesAttr: pg.pagesAttr, perPageAttr: pg.perPageAttr,
                      facts: pg.facts.map(f => ({ i: f.i, n: f.directBlocks, real: f.realBlocks, head: f.hasHead, compact: f.compact })),
                      badA, realChars: pg.realChars },
                    `每页 ${BT_PER_PAGE} 块、页数 ${expPages}、实块加总 ${PAGES_TEXT.length}、页头仅首页`);

                // 14b 每页最后一块 bottom ≤ 页内容底 − 1mm
                const badB = pg.facts.map(f => ({ i: f.i, lastGapMM: f.lastGapMM === null ? null : Math.round(f.lastGapMM * 100) / 100 }))
                    .filter(x => x.lastGapMM === null || x.lastGapMM < 1);
                check('14b 每页最后一块底边 ≤ 页内容底 − 1mm（实测余量 gap ≥ 1mm）',
                    badB.length === 0, badB, '[]');

                // 14c 空块无内容：无 data-char/data-pinyin/data-zuci-multi、无拼音文字、
                // 无词字、主表格内容层无 text、pill 留空（骨架断言）
                const emptyFacts = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('#grid-container .bt-block'))
                        .filter(b => !b.hasAttribute('data-char'))
                        .map(b => ({
                            pinyinText: b.querySelectorAll('[data-ge-role="pinyin"]').length,
                            wordText: b.querySelectorAll('[data-ge-role="bt-zuci-word"]').length,
                            cellText: b.querySelectorAll('.ge-content-layer text').length,
                            pillText: (b.querySelector('.bt-info .bt-pill') || { textContent: '?' }).textContent,
                            multi: b.getAttribute('data-zuci-multi'),
                            py: b.getAttribute('data-pinyin')
                        }));
                });
                const badC = emptyFacts.filter(f =>
                    f.pinyinText > 0 || f.wordText > 0 || f.cellText > 0 ||
                    f.pillText !== '' || f.multi !== null || f.py !== null);
                check(`14c 空块（${emptyFacts.length} 个）无 data-char/data-pinyin/data-zuci-multi、无拼音/词字/格内文本、pill 留空`,
                    emptyFacts.length > 0 && badC.length === 0,
                    { emptyCount: emptyFacts.length, bad: badC }, '{emptyCount>0, bad:[]}');

                // 14d page.pdf 页数 = ceil(总块数/6)（Chrome/Skia PDF 页对象头为明文，
                // 正则数 /Type /Page（\b 排除 /Pages）；验完删除）
                await page.emulateMediaType('print');
                const pdfPath14 = path.join(__dirname, '_bt_verify_pages.pdf');
                try { if (fs.existsSync(pdfPath14)) fs.unlinkSync(pdfPath14); } catch { /* 忽略 */ }
                let pdfPages = 0;
                let pdfErr14 = null;
                try {
                    await page.pdf({ path: pdfPath14, format: 'A4', printBackground: true });
                    if (fs.existsSync(pdfPath14)) {
                        pdfPages = (fs.readFileSync(pdfPath14).toString('latin1')
                            .match(/\/Type\s*\/Page\b/g) || []).length;
                    }
                } catch (e) {
                    pdfErr14 = String(e && e.message ? e.message : e);
                }
                try { if (fs.existsSync(pdfPath14)) fs.unlinkSync(pdfPath14); } catch { /* 忽略 */ }
                await page.emulateMediaType('screen');
                check(`14d page.pdf 页数 = ceil(真块数 ${pg.realChars} / ${BT_PER_PAGE}) = ${expPages}`,
                    pdfPages === expPages && pdfPages > 0,
                    { pdfPages, pdfErr: pdfErr14 }, expPages);

                // 14e 分页守卫复算（§12.A.2）：实测 页头footprint + 6×块footprint ≤ 277−2mm
                // （数据源：引擎渲染时实测并留在 .bt-sheet 的 data-bt-head-mm/-block-mm）
                const needMM = (pg.headMM !== null && pg.blockMM !== null)
                    ? Math.round((pg.headMM + BT_PER_PAGE * pg.blockMM) * 100) / 100 : null;
                check(`14e 实测分页守卫：页头 ${pg.headMM}mm + ${BT_PER_PAGE}×块 ${pg.blockMM}mm = ${needMM}mm ≤ 275mm`,
                    needMM !== null && needMM <= 277 - 2 && pg.guardOk === '1',
                    { headMM: pg.headMM, blockMM: pg.blockMM, needMM, budget: 275, guardOk: pg.guardOk },
                    '{needMM<=275, guardOk:"1"}');
            }
        } catch (e14) {
            record('HARNESS[断言 14] 自身异常', 'FAIL',
                (e14 && e14.stack ? e14.stack.split('\n').slice(0, 4).join(' | ') : String(e14)), 'no throw');
        }

        // ════════════ 断言 15e：多笔画拆解条不裁切（v3.1.1，块帖态取证） ════════════
        // PAGES_TEXT 含"爨"（30 画级）。loadStrokes 为异步队列：先等拆解条出现 svg
        //（8s 超时——离线数据缺失时条留空，按 WARN 语义处理，不硬 FAIL 结构断言）。
        try {
            await page.waitForFunction(() => {
                const strips = document.querySelectorAll('#grid-container .bt-stroke-strip');
                return strips.length > 0 && [...strips].some(s => s.querySelector('svg'));
            }, { timeout: 8000 }).catch(() => {});
            const stripSnap = await page.evaluate(() => {
                const strips = [...document.querySelectorAll('#grid-container .bt-stroke-strip')];
                return strips.map(s => {
                    const svgs = [...s.querySelectorAll('svg')];
                    const hidden = svgs.filter(v => getComputedStyle(v).display === 'none').length;
                    const badge = s.querySelector('.bt-strip-more');
                    return {
                        ch: s.getAttribute('data-bt-strip') || '',
                        svgCount: svgs.length,
                        sw: s.scrollWidth, cw: s.clientWidth,
                        hidden, hasBadge: !!badge,
                        badgeText: badge ? badge.textContent : '',
                        title: s.getAttribute('title') || ''
                    };
                });
            });
            const overflow15e = stripSnap.filter(x => x.svgCount > 0 && x.sw > x.cw + 1);
            // 静默裁切零容忍：被 display:none 截断的条必须带 "+N" 徽标且数字一致
            const silentCut = stripSnap.filter(x => x.hidden > 0 && !x.hasBadge);
            const badgeMismatch = stripSnap.filter(x => x.hidden > 0 && x.hasBadge &&
                x.badgeText !== '+' + x.hidden);
            const chuan = stripSnap.find(x => x.ch === '爨');
            const chuanOk = !chuan || chuan.svgCount === 0 ||
                (chuan.hidden === 0 || chuan.hasBadge);
            check('15e-1 拆解条零溢出：所有 .bt-stroke-strip scrollWidth ≤ clientWidth+1',
                overflow15e.length === 0,
                { overflow: overflow15e.slice(0, 3), strips: stripSnap.length }, '0 条溢出');
            check('15e-2 截断必有徽标：被截断的拆解条必须带 "+N" 徽标且数字一致',
                silentCut.length === 0 && badgeMismatch.length === 0,
                { silentCut: silentCut.slice(0, 3), badgeMismatch: badgeMismatch.slice(0, 3) }, '0 条静默裁切');
            check('15e-3 多笔画样本（爨）：拆解条自适应缩小或 "+N" 徽标（离线数据缺失记 WARN 不 FAIL）',
                chuanOk,
                { chuan: chuan || '(离线数据未收录，条留空)', hintTitle: stripSnap[0] ? stripSnap[0].title : '' },
                '自适应缩小或 +N 徽标');
        } catch (e15e) {
            record('HARNESS[断言 15e] 自身异常', 'FAIL',
                (e15e && e15e.stack ? e15e.stack.split('\n').slice(0, 4).join(' | ') : String(e15e)), 'no throw');
        }

        // ════════════ 断言 15：拼音四线格 v3.1.1（§12.B 线字分离 + 贴左缘） ════════════
        // 取证对象：14 组重新生成后的多页块帖（真块拼音盒结构与 4 字版完全一致）
        try {
            const pySnap = await page.evaluate(() => {
                const MM = 96 / 25.4;
                const sheet = document.querySelector('#grid-container .bt-sheet');
                let cellMM = 13.5;
                if (sheet) {
                    const m = (getComputedStyle(sheet).getPropertyValue('--bt-cell') || '').match(/([\d.]+)\s*mm/);
                    if (m) cellMM = parseFloat(m[1]);
                }
                const block = document.querySelector('#grid-container .bt-block[data-char]');
                const box = block ? block.querySelector('.bt-info .bt-pinyin-box') : null;
                const textSvg = box ? box.querySelector('svg.bt-pinyin-text') : null;
                const text = textSvg ? textSvg.querySelector('text') : null;
                const linesSvg = box ? box.querySelector('svg.bt-pinyin-lines') : null;
                // 全部拼音盒（真块+空块）：四线格只许有横线，右缘不得画竖线
                let vertLines = 0;
                let boxCount = 0;
                document.querySelectorAll('#grid-container .bt-pinyin-box').forEach(bx => {
                    boxCount++;
                    bx.querySelectorAll('line').forEach(l => {
                        if (l.getAttribute('x1') === l.getAttribute('x2')) vertLines++;
                    });
                });
                let leftDiffMM = null;
                let widthMM = null;
                if (block && box) {
                    leftDiffMM = Math.abs(box.getBoundingClientRect().left
                        - block.getBoundingClientRect().left) / MM;
                    widthMM = box.getBoundingClientRect().width / MM;
                }
                return {
                    cellMM,
                    parText: textSvg ? textSvg.getAttribute('preserveAspectRatio') : null,
                    parLines: linesSvg ? linesSvg.getAttribute('preserveAspectRatio') : null,
                    role: text ? text.getAttribute('data-ge-role') : null,
                    font: text ? text.getAttribute('font-family') : null,
                    fill: text ? text.getAttribute('fill') : null,
                    leftDiffMM: leftDiffMM === null ? null : Math.round(leftDiffMM * 1000) / 1000,
                    widthMM: widthMM === null ? null : Math.round(widthMM * 1000) / 1000,
                    vertLines, boxCount
                };
            });
            check('15a 拼音文字层 SVG preserveAspectRatio 含 meet（≠none）且线条层仍为 none（线字分离）',
                !!pySnap.parText && pySnap.parText.indexOf('meet') >= 0 && pySnap.parLines === 'none',
                { parText: pySnap.parText, parLines: pySnap.parLines },
                '{parText含"meet", parLines:"none"}');
            check(`15b .bt-pinyin-box 贴块左缘（差 ${pySnap.leftDiffMM}mm ≤ 0.5mm）且宽 = ${pySnap.cellMM}mm ± 0.5mm（实测 ${pySnap.widthMM}mm）`,
                pySnap.leftDiffMM !== null && pySnap.leftDiffMM <= 0.5 &&
                pySnap.widthMM !== null && Math.abs(pySnap.widthMM - pySnap.cellMM) <= 0.5,
                { leftDiffMM: pySnap.leftDiffMM, widthMM: pySnap.widthMM, cellMM: pySnap.cellMM },
                '{leftDiffMM<=0.5, |widthMM-cellMM|<=0.5}');
            check('15c 全部拼音盒无竖线 line 元素（四线格只保留横线，右缘不画竖线）',
                pySnap.boxCount > 0 && pySnap.vertLines === 0,
                { boxCount: pySnap.boxCount, vertLines: pySnap.vertLines }, '{vertLines:0}');
            // 15d 在断言 9 经典态取证（见上文），此处不重复切换版式
        } catch (e15) {
            record('HARNESS[断言 15] 自身异常', 'FAIL',
                (e15 && e15.stack ? e15.stack.split('\n').slice(0, 4).join(' | ') : String(e15)), 'no throw');
        }

        // 全程页面异常（与 verify-incremental-refresh 同款收尾断言）
        check('Z1 全程无未捕获页面异常', pageErrors.length === 0,
            pageErrors.slice(0, 3).join(' | '), '无异常');
    } catch (e) {
        record('HARNESS 自身异常', 'FAIL',
            (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)), 'no throw');
    } finally {
        await browser.close();
        if (server) await server.close();
    }

    // ════════════ 汇总与报告 ════════════
    const nPass = rows.filter(r => r.status === 'PASS').length;
    const nFail = rows.filter(r => r.status === 'FAIL').length;
    const nWarn = rows.filter(r => r.status === 'WARN').length;
    console.log('\n' + '='.repeat(78));
    console.log(`SUMMARY: ${nPass} passed, ${nFail} failed, ${nWarn} warned, ${rows.length} total`);
    console.log('='.repeat(78));
    if (nFail) {
        console.log('FAILED ASSERTIONS:');
        rows.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`  - ${r.name}\n      observed: ${r.observed}\n      expected: ${r.expected}`);
        });
    }
    if (nWarn) {
        console.log('WARNINGS:');
        rows.filter(r => r.status === 'WARN').forEach(r => {
            console.log(`  - ${r.name}\n      observed: ${r.observed}`);
        });
    }
    try {
        fs.writeFileSync(path.join(__dirname, 'block-table-report.json'),
            JSON.stringify({ target: `http://127.0.0.1:${PORT}`, text: TEXT, rows }, null, 2));
        console.log('report: scripts/block-table-report.json');
    } catch { /* 报告写不进不影响判据 */ }
    process.exitCode = nFail ? 1 : 0;
})();
