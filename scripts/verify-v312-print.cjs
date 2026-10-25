#!/usr/bin/env node
// ============================================================================
// verify-v312-print.cjs — v3.1.2「网格颜色跟随预设 + 打印分页零溢出」独立验收关口
//
// 设计契约：docs/v3.1.2_修复方案_网格颜色与打印分页.md（本文件只实现其 §3 验收门槛）
// 定位：**独立关口**——不 import 应用源码、不 mock 应用逻辑，全部断言建立在
//       真实浏览器渲染出的 DOM 与真实生成的 PDF 字节上。
//
// 两种取证模式：
//   ① 默认（--root <dir>）：脚本内起一个极简静态 HTTP 服务（127.0.0.1 + 临时端口），
//      加载 <dir>/index.html 后在页面内完成生成 / 打印，并用 page.pdf() 产出 PDF。
//      PDF 选项逐字复刻 puppeteer-server.cjs:328 的那一份（a4 / printBackground /
//      preferCSSPageSize / 12-15.9-16-15.9mm 页边距 / 同款页眉页脚模板），
//      并复刻其打印前 DOM 准备（a4-page wrapper + @page margin !important 覆盖 +
//      清除 page-section-* 残留），保证「同源可比」。
//   ② --server：POST 真实 http://127.0.0.1:3210/api/generate-pdf（C1/C2/C3），
//      C4/C5 仍用该服务静态托管的同一份 dist 页面取证。
//      服务未启动时由本脚本 spawn node puppeteer-server.cjs 并负责收尾 kill；
//      若 3210 已被外部进程占用（例如开发者自己的服务），则**复用且不 kill**
//      —— 绝不误杀别人的进程，也绝不在结束时留下本脚本启动的监听。
//
// 检查项（PASS/FAIL 逐条打印；任一 FAIL → 退出码 1）：
//   C1 classic + gridColorPreset=red 的 PDF：绿色系算子计数 == 0，且主色 #9E2A2B > 0
//      （绿色系判据：g>60 且 g>r+25 且 g>b+25，0-255 取整后比较）
//   C2 block-table + red 的 PDF：同上（版式不同，颜色契约相同）
//   C3 green 预设回归：198 字 classic → 18 页，且 PDF 含 #2E7D32/#388E3C/#66BB6A
//   C4 打印分页（classic，25 字 → 3 段）：
//      a) .print-page-section 数 == ceil(25/11) == 3
//      b) 每段 scrollHeight ≤ 可打印区高（零容差，pre-fix 溢出 0.019mm 必须翻红）
//      c) 非末段恰 11 个 .print-row-pair，末段为余数
//      d) 非末段内容盒 190×276mm（±0.3）
//      e) page.pdf 页数 == 段数；displayHeaderFooter:true + 14mm 高页眉页脚模板后仍相等
//      f) CSSOM 里 @page 的 margin 为 0（0/0px/0mm 皆可）
//      g) 真实 printDirect 链路确实执行过（window.print 被 stub 调用，不是自造 DOM）
//   C5 块帖打印：.bt-page 自承担分页，点击 #printBtn 后**不得**产生 .print-page-section；
//      page.pdf() 页数 == .bt-page 数（若实现尚未守卫该路径，如实报 FAIL，不改断言）
//   C7 移动端打印路由（v3.1.3，iPhone 13 仿真）：
//      C7-pre 负控 classic+移动端 UA 必须命中 printViaIframe（iframe.print-frame ≥1 且
//      主窗口 __printCalled=false，桩只注入主窗口）；C7 主体 block-table+移动端 UA 必须
//      走块帖早退分支的原生 window.print（__printCalled=true、零 iframe、零
//      .print-page-section、零 DOM 改造、打印态 .bt-page 296×210mm、page.pdf 页数 ==
//      .bt-page 数、CSSOM 存在 margin 全 0 的 @page）
//   C8 拆解条不变量（v3.1.5）：「每笔恰好一张、逐笔累计、末笔即止、绝不循环重复排布；
//      尺寸自适应封顶 6mm 不逾矩」——
//      C8a 块帖：每个 .bt-block[data-char] → .bt-pill 文本 N画 解析 N；
//          .bt-stroke-strip 内 svg 数 == N（实测 DOM 计数，可伪）；无 .bt-strip-more
//          徽标（N≤5 不截断）；每张 svg 宽度 ≤ 6.01mm（封顶 6mm）。期望 三3/大3/人2/木4/永5
//      C8b 经典：每个 .grid-svg-stroke-box → span 文本 N画 解析 N；box 内 svg 数 == N
//
// PDF 取证细节（为什么不用现成库）：零依赖要求 → 自己走 stream…endstream 分块，
//   逐块 zlib.inflateSync，只解析「像内容流」的块（可打印字符占比 > 0.9，排除字体
//   二进制流的误命中），再用 /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(RG|rg)/ 收集颜色算子。
//   页数取所有 /Count 的最大值（页数多时 Chrome 会写多级页树，子树 Count 偏小），
//   回退数 /Type /Page 对象。
//   渲染落定判据（本关口首版踩到抖动）：笔画队列 pending=0 且每个 .grid-svg-stroke-box
//   恰有 1 个非空 span，再做节点数/文本总长两次采样 —— 否则同一字帖两次生成的算子
//   直方图会不同（实测 198 字曾出现 9900 vs 11992 个 #000000 算子）。
//
// 运行：
//   node scripts/verify-v312-print.cjs                    # 默认 --root dist
//   node scripts/verify-v312-print.cjs --root _prefix_dist_snapshot   # 红基线
//   node scripts/verify-v312-print.cjs --server
// 报告：scripts/v312-print-report.json
// ============================================================================
const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(__dirname, 'v312-print-report.json');

// ── CLI ──
function parseArgs(argv) {
    const out = { root: 'dist', server: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--root') out.root = argv[++i] || 'dist';
        else if (a.startsWith('--root=')) out.root = a.slice(7);
        else if (a === '--server') out.server = true;
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}
const ARGS = parseArgs(process.argv.slice(2));
const MODE = ARGS.server ? 'server' : 'root';
const ROOT_DIR = path.resolve(REPO_ROOT, ARGS.root);
const SERVER_PORT = 3210;
const API_BASE = `http://127.0.0.1:${SERVER_PORT}`;

// 契约常量（与 src/contracts/interfaces.js、docs/v3.1.2 方案一致；此处镜像用于期望值）
const ROWS_PER_PAGE = 11;          // SHEET_LAYOUT.rowsPerPage
const PAGE_H_MM = 297;
const SECTION_CONTENT_W_MM = 190;  // v3.1.2：内容盒 190×276
const SECTION_CONTENT_H_MM = 276;
const CONTENT_BOX_TOL_MM = 0.3;
const MM_TO_PX = 96 / 25.4;
// 绿色预设主色三阶 + 朱砂红主色（契约 §1 / interfaces.js:90）
const GREEN_HEX = ['#2E7D32', '#388E3C', '#66BB6A'];
const RED_PRIMARY_HEX = '#9E2A2B';
// 复刻 puppeteer-server.cjs 的页眉页脚模板（9pt / #9E2A2B 只是模板色，不影响 C1 判据：
// 页眉页脚模板颜色不进入页面内容流，且本关口按「预设主色」独立断言）
const PDF_HF_HEADER = '<div style="font-size:9pt;color:#9E2A2B;width:100%;padding:3mm 15.9mm 0">练习字帖</div>';
const PDF_HF_FOOTER = '<div style="font-size:9pt;color:#9E2A2B;width:100%;padding:0 15.9mm 8mm">第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</div>';
const PDF_MARGIN = { top: '12mm', right: '15.9mm', bottom: '16mm', left: '15.9mm' };
// C4 用的 25 字（20 字诗 + 5 字）→ ceil(25/11)=3 段
const TEXT_25 = '床前明月光疑是地上霜举头望明月低头思故乡窗前明月光';
const TEXT_10 = '床前明月光疑是地上霜';
const TEXT_BT_12 = '天地人和风云雨雪山水火木';
const POEM_20 = '床前明月光疑是地上霜举头望明月低头思故乡';

// ── 记录 / 汇总（沿用 verify-block-table.cjs 的输出风格） ──
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

// ════════════════════════════════════════════════════════════════════════
// 极简静态服务（模式 ①）：只读 <dir>，够 dist 用即可
// ════════════════════════════════════════════════════════════════════════
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
    '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8'
};
function startStaticServer(rootDir) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            let rel = decodeURIComponent((req.url || '/').split('?')[0]);
            if (rel === '/' || rel === '') rel = '/index.html';
            const file = path.join(rootDir, rel);
            // 防目录穿越：解析后必须仍在 rootDir 内
            if (!file.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
            fs.readFile(file, (err, buf) => {
                if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
                res.end(buf);
            });
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}
function httpGet(url, timeoutMs = 1500) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
        });
        req.on('error', () => resolve(null));
        req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    });
}
function httpPostJson(url, obj, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(obj), 'utf8');
        const u = new URL(url);
        const req = http.request({
            hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Connection': 'close' }
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('POST 超时')); });
        req.write(body);
        req.end();
    });
}

// ════════════════════════════════════════════════════════════════════════
// PDF 取证：流解压 + 颜色算子 + 页数
// ════════════════════════════════════════════════════════════════════════
/** 切出所有 stream…endstream 块并逐块解压（失败则原样返回） */
function pdfStreams(buf) {
    const s = buf.toString('latin1');
    const out = [];
    let i = 0;
    for (;;) {
        const a = s.indexOf('stream', i);
        if (a < 0) break;
        let b = a + 'stream'.length;
        if (s[b] === '\r') b++;
        if (s[b] === '\n') b++;
        const e = s.indexOf('endstream', b);
        if (e < 0) break;
        let chunk = buf.subarray(b, e);
        // 去掉 endstream 前的 EOL
        while (chunk.length && (chunk[chunk.length - 1] === 0x0a || chunk[chunk.length - 1] === 0x0d)) {
            chunk = chunk.subarray(0, chunk.length - 1);
        }
        let data = null;
        try { data = zlib.inflateSync(chunk); } catch { data = chunk; }
        out.push(data);
        i = e + 'endstream'.length;
    }
    return out;
}
/** 可打印字符占比（用于排除字体/图像二进制流的误命中） */
function printableRatio(data) {
    const n = Math.min(data.length, 4096);
    if (!n) return 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
        const c = data[i];
        if ((c >= 0x20 && c < 0x7f) || c === 0x0a || c === 0x0d || c === 0x09) ok++;
    }
    return ok / n;
}
/**
 * 收集 PDF 内容流里的颜色算子。
 * 返回 { ops: [{hex,r,g,b,count}], greenish, streams, scanned }
 */
function parsePdfColors(buf) {
    const counts = new Map();
    let streams = 0, scanned = 0;
    for (const data of pdfStreams(buf)) {
        streams++;
        if (printableRatio(data) < 0.9) continue;      // 字体/图像流跳过
        const txt = data.toString('latin1');
        if (!/ (rg|RG)[\s\n]/.test(txt)) continue;     // 没有描边/填充色算子
        scanned++;
        const re = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(rg|RG)(?![A-Za-z])/g;
        let m;
        while ((m = re.exec(txt))) {
            const r = Math.round(parseFloat(m[1]) * 255);
            const g = Math.round(parseFloat(m[2]) * 255);
            const b = Math.round(parseFloat(m[3]) * 255);
            if (![r, g, b].every(v => Number.isFinite(v) && v >= 0 && v <= 255)) continue;
            const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
            counts.set(hex, (counts.get(hex) || 0) + 1);
        }
    }
    const ops = [...counts.entries()]
        .map(([hex, count]) => {
            const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
            return { hex, r, g, b, count, greenish: (g > 60 && g > r + 25 && g > b + 25) };
        })
        .sort((x, y) => y.count - x.count);
    const greenish = ops.filter(o => o.greenish).reduce((a, o) => a + o.count, 0);
    return { ops, greenish, streams, scanned };
}
/**
 * 页数：取所有 /Count 的最大值（Chrome 在页数较多时会写多级页树，
 * 子树 /Count 会比根小 —— 取 max 才是根页数），回退数 /Type /Page 对象。
 */
function countPdfPages(buf) {
    const s = buf.toString('latin1');
    const counts = [...s.matchAll(/\/Count\s+(\d+)/g)].map(m => Number(m[1])).filter(n => n > 0);
    if (counts.length) return { pages: Math.max(...counts), via: `/Count (max of ${counts.length})` };
    const objs = s.match(/\/Type\s*\/Page(?![s])/g);
    return { pages: objs ? objs.length : 0, via: '/Type /Page' };
}

// ════════════════════════════════════════════════════════════════════════
// 页面内函数（全部自包含：只靠参数，绝不闭包捕获 Node 作用域变量）
// ════════════════════════════════════════════════════════════════════════
/** 只写 localStorage（读旧值 merge，保留其他键），刷新前播种 */
function seedSettingsInPage(patch) {
    const KEY = 'calligraphy_settings';
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { cur = {}; }
    const merged = Object.assign({}, cur, patch);
    localStorage.setItem(KEY, JSON.stringify(merged));
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('onboarding_never_show', 'true');
    return merged;
}
/** 填字 + 点「刷新字帖」 */
function generateInPage(text) {
    const ta = document.getElementById('inputText');
    const btn = document.getElementById('generate-btn');
    if (!ta || !btn) return { ok: false, why: 'inputText/generate-btn 缺失' };
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    btn.click();
    return { ok: true, len: text.length };
}
/**
 * 复刻 puppeteer-server.cjs:195-232 的打印前 DOM 准备：
 *   · grid 包进 .a4-page.pdf-print-wrapper
 *   · 注入 @page margin !important 覆盖（经典 12/15.9/16/15.9；块帖 12/10/16/10）
 *   · 清掉 page-section-* / print-page-section 残留（服务端同款清理）
 * 目的：让 page.pdf() 的几何前提与真实本地服务完全同源。
 */
function prepServerPdfDomInPage(isBT) {
    const grid = document.getElementById('grid-container');
    if (!grid) return { ok: false, why: '#grid-container 缺失' };
    if (!grid.parentNode.classList.contains('a4-page')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'a4-page pdf-print-wrapper';
        wrapper.style.cssText = 'position:relative;width:100%;';
        grid.parentNode.insertBefore(wrapper, grid);
        wrapper.appendChild(grid);
    }
    document.querySelectorAll('.print-only-header, .print-only-footer, .page-section-header, .page-section-footer, .print-page-section')
        .forEach(el => el.remove());
    const style = document.createElement('style');
    style.id = 'puppeteer-page-margin-override';
    style.textContent = isBT
        ? '@media print{@page{size:A4 portrait;margin:12mm 10mm 16mm 10mm !important;}} :root{--bt-page-h:269mm;--bt-print-page-h:269mm;--bt-print-pad:0;}'
        : '@media print{@page{size:A4 portrait;margin:12mm 15.9mm 16mm 15.9mm !important;}}';
    document.head.appendChild(style);
    return { ok: true };
}
/**
 * 打印段几何取证（C4 的 a/b/c/d/f 全部数据一次抓回）：
 *   · rect / scroll / client / padding → 内容盒与溢出
 *   · 递归遍历 document.styleSheets（@page 规则在 @media print 内，必须下钻）
 */
function measurePrintInPage() {
    const px2mm = (px) => px / (96 / 25.4);
    const pageRules = [];
    const walk = (rules, depth) => {
        for (const r of rules) {
            if (r.type === 6) {                       // CSSPageRule
                pageRules.push({
                    margin: r.style.margin || '',
                    marginTop: r.style.marginTop || '', marginRight: r.style.marginRight || '',
                    marginBottom: r.style.marginBottom || '', marginLeft: r.style.marginLeft || '',
                    size: r.style.size || '', text: (r.cssText || '').slice(0, 200)
                });
            } else if (r.cssRules && depth < 3) {
                walk(r.cssRules, depth + 1);
            }
        }
    };
    for (const ss of document.styleSheets) {
        let rules = null;
        try { rules = ss.cssRules; } catch (e) { rules = null; }   // 跨域样式表跳过
        if (rules) walk(rules, 0);
    }
    const secs = Array.from(document.querySelectorAll('.print-page-section'));
    const sections = secs.map((s, i) => {
        const r = s.getBoundingClientRect();
        const cs = getComputedStyle(s);
        const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
        const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
        return {
            idx: i,
            isLast: s.classList.contains('last-page-section'),
            rectWmm: px2mm(r.width), rectHmm: px2mm(r.height),
            contentWmm: px2mm(r.width - padL - padR),
            contentHmm: px2mm(r.height - padT - padB),
            scrollHmm: px2mm(s.scrollHeight),
            clientHmm: px2mm(s.clientHeight),
            overflowPx: s.scrollHeight - s.clientHeight,
            pairs: s.querySelectorAll('.print-row-pair').length,
            declaredH: cs.height
        };
    });
    return {
        sections, pageRules,
        printCalled: !!window.__printCalled,
        bodyClasses: document.body.className
    };
}
/** 块帖打印取证（C5/C7）：.bt-page 数 / .print-page-section 数 / 是否被 printDirect 接管 */
function measureBtPrintInPage() {
    const px2mm = (px) => px / (96 / 25.4);
    const bts = Array.from(document.querySelectorAll('.bt-page'));
    return {
        btPages: bts.length,
        btBlocks: document.querySelectorAll('.bt-block[data-char]').length,
        printSections: document.querySelectorAll('.print-page-section').length,
        // v3.1.3：移动端 UA 路由走 printViaIframe 时会在主文档常驻 iframe.print-frame
        //（仅 pagehide/下次打印清理）——C7 用「打印后 iframe 数 == 0」证明块帖没进该路由
        printFrames: document.querySelectorAll('iframe.print-frame').length,
        btHeights: bts.map(p => px2mm(p.getBoundingClientRect().height)),
        printCalled: !!window.__printCalled
    };
}

// ════════════════════════════════════════════════════════════════════════
// 浏览器侧编排
// ════════════════════════════════════════════════════════════════════════
let browser = null;
let pageUrlBase = '';        // 模式 ①：静态服务地址；模式 ②：http://127.0.0.1:3210
let startedServerChild = null;
let staticServer = null;

async function newPage({ stubPrint = false, mobile = false } = {}) {
    const page = await browser.newPage();
    if (mobile) {
        // v3.1.3：移动端仿真（iPhone 13：390×844 / dsf3 / iOS Safari UA / touch）。
        // 必须在导航前 emulate，printDirect 首帧的移动端 UA 路由判定才会命中；
        // 本机 puppeteer 23.11.1 实测 KnownDevices 可用。
        await page.emulate(puppeteer.KnownDevices['iPhone 13']);
    } else {
        await page.setViewport({ width: 1400, height: 1000 });
    }
    if (stubPrint) {
        // 必须在导航前注入：真实 printDirect 代码路径照跑，只是不弹对话框
        await page.evaluateOnNewDocument(() => {
            window.print = () => { window.__printCalled = true; };
        });
    }
    return page;
}
/** 打开页面 → 播种设置 → 刷新（确保设置被应用初始化读取） */
async function openWithSettings(page, patch) {
    await page.goto(pageUrlBase + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!document.getElementById('generate-btn'), { timeout: 30000 });
    const seeded = await page.evaluate(seedSettingsInPage, patch);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!document.getElementById('generate-btn'), { timeout: 30000 });
    return seeded;
}
/** 生成字帖并等到渲染落定（笔画队列空闲 + 目标节点出现） */
async function generateAndSettle(page, text, waitSel, timeout = 30000) {
    const g = await page.evaluate(generateInPage, text);
    if (!g.ok) return g;
    const ok = await page.waitForFunction(
        (sel) => document.querySelectorAll(sel).length > 0, { timeout, polling: 200 }, waitSel
    ).then(() => true).catch(() => false);
    if (!ok) return { ok: false, why: `${waitSel} ${timeout}ms 内未出现` };
    // 字体 + 笔画异步队列：「N画」文字是 C1 绿色像素的唯一来源，PDF 必须在队列排空后才产出，
    // 否则同一份字帖两次生成的算子直方图会不同（本关口首版踩到：198 字实测 9900 vs 11992 个
    // #000000 算子）。判据 = 队列 pending=0 且每个 .grid-svg-stroke-box 恰有 1 个非空 span。
    await page.evaluate(async () => {
        try { await document.fonts.ready; } catch (e) { /* 忽略 */ }
    });
    const queueOk = await page.waitForFunction(() => {
        const q = (typeof window.__getStrokeQueueStatus === 'function')
            ? window.__getStrokeQueueStatus() : { pending: 0, loading: false };
        if (q && (q.loading || q.pending > 0)) return false;
        const boxes = document.querySelectorAll('.grid-svg-stroke-box');
        if (!boxes.length) return true;
        const spans = Array.from(document.querySelectorAll('.grid-svg-stroke-box span'));
        return spans.length >= boxes.length && spans.every(s => (s.textContent || '').trim().length > 0);
    }, { timeout: 60000, polling: 300 }).then(() => true).catch(() => false);
    if (!queueOk) return { ok: false, why: '笔画队列 60s 未排空（.grid-svg-stroke-box 未全部填字）' };
    // 落定复核：节点数与文本总长两次采样（间隔 700ms）一致 —— 排除在途增量挂载
    const snap = () => page.evaluate(() => {
        let textLen = 0;
        document.querySelectorAll('.grid-svg-cell text, .bt-block text').forEach(t => { textLen += (t.textContent || '').length; });
        return { nodes: document.querySelectorAll('*').length, textLen };
    });
    const s1 = await snap();
    await sleep(700);
    const s2 = await snap();
    await sleep(300);
    return { ok: true, stable: s1.nodes === s2.nodes && s1.textLen === s2.textLen, nodes: s2.nodes };
}

// ── C1/C2/C3 的 PDF 取得（两种模式分流） ──
async function pdfFromPage(page, isBT) {
    const prep = await page.evaluate(prepServerPdfDomInPage, !!isBT);
    if (!prep || !prep.ok) throw new Error('打印前 DOM 准备失败: ' + (prep && prep.why));
    await page.emulateMediaType('print');
    await sleep(300);
    // 逐字复刻 puppeteer-server.cjs:328 的 PDF 选项
    const buf = Buffer.from(await page.pdf({
        format: 'a4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
        headerTemplate: PDF_HF_HEADER, footerTemplate: PDF_HF_FOOTER, margin: PDF_MARGIN
    }));
    return buf;
}
async function pdfFromApi(text, preset, settingsPatch) {
    const payload = {
        text, font: '文鼎楷体', fontValue: '',
        gridType: (settingsPatch && settingsPatch.gridType) || 'mizi',
        gridColorPreset: preset, traceOpacity: 0.1,
        settings: Object.assign({}, settingsPatch),
        // 绕过 puppeteer-server.cjs:382 的 30s 请求去重（同 body 会回 204）
        _verifyNonce: `${process.pid}-${Date.now()}-${Math.random()}`
    };
    const res = await httpPostJson(API_BASE + '/api/generate-pdf', payload);
    if (res.status !== 200) {
        throw new Error(`API 返回 ${res.status}: ${res.body.toString('utf8').slice(0, 200)}`);
    }
    const ct = String(res.headers['content-type'] || '');
    if (!/application\/pdf/.test(ct) || res.body.slice(0, 4).toString('latin1') !== '%PDF') {
        throw new Error(`API 未返回 PDF（content-type=${ct}, head=${res.body.slice(0, 8).toString('latin1')}）`);
    }
    return res.body;
}
/** 颜色报告的一行摘要（top N） */
function colorSummary(c) {
    return c.ops.slice(0, 6).map(o => `${o.hex}×${o.count}`).join(' ');
}

// ════════════════════════════════════════════════════════════════════════
// 检查项
// ════════════════════════════════════════════════════════════════════════
const summary = { colors: {}, pages: {} };

/** C1 / C2 共用：指定版式 + 红色预设，断言 PDF 里零绿色算子 */
async function checkColorRed(tag, layoutType, waitSel, apiPreset = 'red') {
    let pdf = null;
    if (MODE === 'server') {
        pdf = await pdfFromApi(TEXT_10, apiPreset, { layoutType, gridType: 'mizi', traceOpacity: 0.1 });
    } else {
        const page = await newPage();
        try {
            await openWithSettings(page, { layoutType, gridColorPreset: apiPreset, gridType: 'mizi', traceOpacity: 0.1 });
            const g = await generateAndSettle(page, TEXT_10, waitSel);
            if (!g.ok) { check(`${tag} 生成成功（${waitSel} 出现）`, false, g.why || g, '渲染完成'); return; }
            if (!g.stable) warn(`${tag} 渲染落定复核（节点/文本两次采样）`, '两次采样不一致', '算子计数可能抖动');
            pdf = await pdfFromPage(page, layoutType === 'block-table');
        } finally {
            await page.close().catch(() => {});
        }
    }
    const c = parsePdfColors(pdf);
    summary.colors[tag] = { greenish: c.greenish, top: c.ops.slice(0, 8), bytes: pdf.length, streams: c.streams, scanned: c.scanned };
    const primary = c.ops.find(o => o.hex === RED_PRIMARY_HEX);
    const greenishOps = c.ops.filter(o => o.greenish).map(o => `${o.hex}×${o.count}`).join(' ');
    check(`${tag}a 绿色系颜色算子 == 0（g>60 且 g>r+25 且 g>b+25）`,
        c.greenish === 0,
        `greenish=${c.greenish}${greenishOps ? `（${greenishOps}）` : ''}；top: ${colorSummary(c)}`,
        'greenish=0',
        `PDF ${pdf.length}B，解析 ${c.scanned}/${c.streams} 个内容流`);
    check(`${tag}b 预设主色 ${RED_PRIMARY_HEX} 出现（>0）`,
        !!primary && primary.count > 0, primary ? `${primary.hex}×${primary.count}` : '未出现', '>0');
}

/** C3：绿色预设回归（198 字 → 18 页 + 三阶绿俱在） */
async function checkGreenBaseline() {
    const text = (POEM_20.repeat(10)).slice(0, 198);   // 恰 198 个 CJK 字
    let pdf = null;
    if (MODE === 'server') {
        pdf = await pdfFromApi(text, 'green', { layoutType: 'classic', gridType: 'mizi', traceOpacity: 0.1 });
    } else {
        const page = await newPage();
        try {
            await openWithSettings(page, { layoutType: 'classic', gridColorPreset: 'green', gridType: 'mizi', traceOpacity: 0.1 });
            const g = await generateAndSettle(page, text, '.grid-svg-cell');
            if (!g.ok) { check('C3 生成成功（198 字）', false, g.why || g, '渲染完成'); return; }
            if (!g.stable) warn('C3 渲染落定复核（节点/文本两次采样）', '两次采样不一致', '算子计数可能抖动');
            pdf = await pdfFromPage(page, false);
        } finally {
            await page.close().catch(() => {});
        }
    }
    const c = parsePdfColors(pdf);
    const pg = countPdfPages(pdf);
    summary.colors.C3 = { top: c.ops.slice(0, 8), greenish: c.greenish, bytes: pdf.length };
    summary.pages.C3 = pg;
    check('C3a 198 字 classic 页数 == 18（v3.1.1 基线）', pg.pages === 18,
        `${pg.pages} 页（via ${pg.via}）`, '18 页');
    const present = GREEN_HEX.filter(h => c.ops.some(o => o.hex === h));
    check('C3b 绿色预设三阶主色俱在（#2E7D32/#388E3C/#66BB6A）',
        present.length === GREEN_HEX.length, `命中 ${present.join(',') || '无'}；top: ${colorSummary(c)}`,
        GREEN_HEX.join(','));
}

/** C4：打印分页（classic 25 字 → 3 段） */
async function checkPrintPagination() {
    const page = await newPage({ stubPrint: true });
    try {
        await openWithSettings(page, { layoutType: 'classic', gridColorPreset: 'red', gridType: 'mizi', traceOpacity: 0.1 });
        // ① 屏幕媒体下先生成
        const g = await generateAndSettle(page, TEXT_25, '.grid-svg-cell');
        if (!g.ok) { check('C4 生成成功（25 字，屏幕媒体）', false, g.why || g, '渲染完成'); return; }
        const expectedPages = Math.ceil(TEXT_25.length / ROWS_PER_PAGE);

        // ② print 媒体 + 真实 printDirect 链路（window.print 已 stub）
        await page.emulateMediaType('print');
        await page.evaluate(() => document.getElementById('printBtn').click());
        const appeared = await page.waitForFunction(
            () => document.querySelectorAll('.print-page-section').length > 0, { timeout: 10000, polling: 200 }
        ).then(() => true).catch(() => false);
        if (!appeared) {
            check('C4 点击 #printBtn 后 10s 内出现 .print-page-section', false, '超时未出现', '出现 ≥1 段');
            return;
        }
        await sleep(3000);      // 等字体 / 笔画等待链走完（waitForFonts + waitForStrokes(2000) + 300ms）
        const m = await page.evaluate(measurePrintInPage);

        // a) 段数
        check('C4a .print-page-section 数 == ceil(25/11) == 3',
            m.sections.length === expectedPages, `${m.sections.length} 段`, `${expectedPages} 段`);

        // f) @page margin 归零（先算，b 要用可打印区高度）
        const pageRules = m.pageRules || [];
        const zeroMargins = pageRules.filter(r => {
            const vals = [r.margin, r.marginTop, r.marginBottom, r.marginLeft, r.marginRight]
                .filter(Boolean).map(v => String(v).trim().toLowerCase());
            if (!vals.length) return false;
            return vals.every(v => /^0(px|mm|cm|in|pt)?$/.test(v.replace(/\s+/g, '')));
        });
        // 可打印区高：@page 规则里取最严的一条（A4 297 − 上下边距）
        const pxToMm = (v) => {
            const n = parseFloat(v);
            if (!Number.isFinite(n)) return null;
            if (/cm$/.test(v)) return n * 10;
            if (/in$/.test(v)) return n * 25.4;
            if (/pt$/.test(v)) return n * 25.4 / 72;
            if (/px$/.test(v)) return n / MM_TO_PX;
            return n;                                  // 无单位按 mm（CSS 打印里 0 无单位）
        };
        let printableH = null, printableNote = '';
        for (const r of pageRules) {
            const mt = pxToMm(r.marginTop || r.margin || '');
            const mb = pxToMm(r.marginBottom || r.margin || '');
            if (mt == null || mb == null) continue;
            const h = PAGE_H_MM - mt - mb;
            if (printableH == null || h < printableH) { printableH = h; printableNote = `@page margin=${r.margin || `${r.marginTop}/${r.marginBottom}`}`; }
        }
        if (printableH == null) { printableH = PAGE_H_MM; printableNote = '未取到 @page 规则，按 A4 全高兜底'; }

        // b) 零溢出：scrollHeight 必须 ≤ 可打印区高（零容差 —— pre-fix 溢出 0.019mm 必须翻红）
        const overflows = m.sections.map(s => ({
            idx: s.idx, isLast: s.isLast,
            overMm: s.scrollHmm - printableH,
            overPx: s.overflowPx,
            scrollHmm: s.scrollHmm, clientHmm: s.clientHmm, rectHmm: s.rectHmm
        }));
        const worst = overflows.reduce((a, b) => (b.overMm > a.overMm ? b : a), overflows[0]);
        const noOverflow = overflows.every(o => o.overMm <= 0.0005 && o.overPx <= 0.5);
        check('C4b 每段零溢出（scrollHeight ≤ 可打印区高，零容差）', noOverflow,
            `段${worst.idx}: scrollHeight ${worst.scrollHmm.toFixed(3)}mm vs 可打印区 ${printableH.toFixed(3)}mm ` +
            `(余量 ${worst.overMm >= 0 ? '+' : ''}${worst.overMm.toFixed(3)}mm)；clientH ${worst.clientHmm.toFixed(3)}mm；scroll−client ${worst.overPx.toFixed(3)}px`,
            '每段 ≤ 可打印区高', `可打印区来源：${printableNote}；全段：` +
            overflows.map(o => `#${o.idx}${o.isLast ? '(末)' : ''} ${o.overMm >= 0 ? '+' : ''}${o.overMm.toFixed(3)}mm`).join(' '));

        // c) 行对分布
        const nonLast = m.sections.filter(s => !s.isLast);
        const last = m.sections.find(s => s.isLast);
        const pairOk = nonLast.every(s => s.pairs === ROWS_PER_PAGE)
            && (!last || last.pairs === TEXT_25.length - ROWS_PER_PAGE * nonLast.length);
        check('C4c 非末段恰 11 个 .print-row-pair，末段为余数', pairOk,
            m.sections.map(s => `${s.isLast ? '末' : '#' + s.idx}=${s.pairs}`).join(' '),
            `非末段=11，末段=${TEXT_25.length - ROWS_PER_PAGE * (m.sections.length - 1)}`);

        // d) 内容盒 190×276mm（末段高度 auto，不参与高度断言）
        const boxSamples = nonLast.length ? nonLast : m.sections.slice(0, 1);
        const boxOk = boxSamples.every(s =>
            Math.abs(s.contentWmm - SECTION_CONTENT_W_MM) <= CONTENT_BOX_TOL_MM &&
            Math.abs(s.contentHmm - SECTION_CONTENT_H_MM) <= CONTENT_BOX_TOL_MM);
        const box0 = boxSamples[0] || { contentWmm: NaN, contentHmm: NaN };
        check('C4d 非末段内容盒 == 190×276mm（±0.3）', boxOk,
            `${box0.contentWmm.toFixed(3)}×${box0.contentHmm.toFixed(3)}mm`,
            `190×276mm（±${CONTENT_BOX_TOL_MM}）`);

        // e) page.pdf 页数 == 段数（含高页眉页脚模板）
        const pdfNoHf = Buffer.from(await page.pdf({ displayHeaderFooter: false, preferCSSPageSize: true, format: 'a4' }));
        const pgNoHf = countPdfPages(pdfNoHf);
        summary.pages.C4_noHF = pgNoHf;
        const tallHF = '<div style="height:14mm;font-size:9pt;color:#000">页眉</div>';
        const pdfTall = Buffer.from(await page.pdf({
            displayHeaderFooter: true, headerTemplate: tallHF, footerTemplate: tallHF,
            preferCSSPageSize: true, format: 'a4'
        }));
        const pgTall = countPdfPages(pdfTall);
        summary.pages.C4_tallHF = pgTall;
        check('C4e page.pdf 页数 == 段数（displayHeaderFooter:false）',
            pgNoHf.pages === m.sections.length, `${pgNoHf.pages} 页（via ${pgNoHf.via}）`, `${m.sections.length} 页`);
        check('C4e2 page.pdf 页数 == 段数（displayHeaderFooter:true + 14mm 高页眉页脚）',
            pgTall.pages === m.sections.length, `${pgTall.pages} 页（via ${pgTall.via}）`, `${m.sections.length} 页`,
            '证明分页对浏览器自带页眉页脚免疫');

        // h) 浏览器自带页眉页脚：负控 + 正控成对取证（用户硬性要求：打印时间 / 文件路径 / URL 一律不许出现）
        //    · 负控（C4h）：显式给浏览器 10mm 页边距 + 洋红标记模板 → 洋红算子必须 > 0。
        //      这一步证明「检测方法本身有效」——浏览器一旦有落笔空间，确实会把页眉页脚画上去。
        //    · 正控（C4i）：走应用真实打印路径（CSS @page margin:0，不传 margin）→ 洋红算子必须 == 0。
        //      即：同样一份含「打印时间 + file:// 文件路径」的页眉页脚，在应用打印模式下一条都进不了纸面。
        //    注意：不能靠「PDF 里搜文本」取证 —— Chrome 把页眉文字转成字体子集字形，原文不可检索。
        const magentaHF = '<div style="font-size:9pt;color:#FF00FF;height:14mm">'
            + 'BROWSER-HF-MARKER 2026/10/25 10:00 file:///C:/poem2pdf/distribution/dist/index.html</div>';
        // 注意：Chrome 会对页眉页脚文字做色彩管理，纯洋红 #FF00FF 落纸后是 #AB00AB（实测），
        // 所以按「品红系」判据匹配（r/b 都高、g 显著低），不做精确 hex 比对。
        const isMagenta = (o) => o.r > 100 && o.b > 100 && o.g < Math.min(o.r, o.b) - 60;
        const countMagenta = (buf) => {
            const c = parsePdfColors(buf);
            return c.ops.filter(isMagenta).reduce((a, o) => a + o.count, 0);
        };
        const pdfMagentaForced = Buffer.from(await page.pdf({
            displayHeaderFooter: true, headerTemplate: magentaHF, footerTemplate: magentaHF,
            // 负控刻意关掉 preferCSSPageSize：让 margin 选项真正生效，页眉页脚才有落笔空间。
            // （preferCSSPageSize:true 时 Puppeteer 以 CSS @page 为准，margin 选项被忽略 →
            //   @page margin:0 之下负控也画不出东西，那样负控就失去意义）
            preferCSSPageSize: false, format: 'a4',
            margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
        }));
        const magentaForced = countMagenta(pdfMagentaForced);
        summary.colors.C4h = { forcedMargin: magentaForced };
        check('C4h 负控自证：给定 10mm 页边距时浏览器页眉页脚确实会被画出（品红算子 > 0）',
            magentaForced > 0, `品红算子=${magentaForced}`, '> 0',
            '证明检测方法有效：一旦浏览器有落笔空间，日期/文件路径会真的被渲染。'
            + ' 应用打印路径的禁止机制是 @page margin:0（C4f/C5c 断言其 CSSOM 值）——'
            + ' Chrome/Edge/Safari/Firefox 在 0 边距下不渲染自带页眉页脚；'
            + ' Puppeteer 的 displayHeaderFooter 是显式 API（不属于用户 window.print 路径），故只作负控，不作正控。');

        // f) @page margin 归零
        check('C4f CSSOM 中 @page margin == 0', zeroMargins.length > 0,
            pageRules.length ? pageRules.map(r => `margin=${r.margin || `${r.marginTop}/${r.marginBottom}`} size=${r.size}`).join(' | ') : '未找到 CSSPageRule',
            '存在 margin 全 0 的 @page', `共 ${pageRules.length} 条 CSSPageRule`);

        // 附带证据：真实 print 路径确实被执行（不是我们自己造 DOM）
        check('C4g 真实 printDirect 链路已执行（window.print 被调用）', m.printCalled,
            m.printCalled ? 'window.print 已调用' : '未调用', '已调用');
    } finally {
        await page.close().catch(() => {});
    }
}

/** C5：块帖打印（.bt-page 自承担分页，不得被 printDirect 再包一层） */
async function checkBtPrint() {
    const page = await newPage({ stubPrint: true });
    try {
        await openWithSettings(page, { layoutType: 'block-table', gridColorPreset: 'red', gridType: 'mizi', traceOpacity: 0.1 });
        const g = await generateAndSettle(page, TEXT_BT_12, '.bt-block');
        if (!g.ok) { check('C5 生成成功（block-table 12 字）', false, g.why || g, '渲染完成'); return; }
        const before = await page.evaluate(measureBtPrintInPage);

        await page.emulateMediaType('print');
        await page.evaluate(() => document.getElementById('printBtn').click());
        await sleep(3500);
        const after = await page.evaluate(measureBtPrintInPage);
        const pdf = Buffer.from(await page.pdf({ displayHeaderFooter: false, preferCSSPageSize: true, format: 'a4' }));
        const pg = countPdfPages(pdf);
        summary.pages.C5 = { ...pg, btPages: after.btPages, printSections: after.printSections };

        check('C5a 打印后未产生 .print-page-section（块帖自带显式分页）',
            after.printSections === 0, `print-page-section=${after.printSections}`, '0');
        check('C5b page.pdf 页数 == .bt-page 数', pg.pages === after.btPages,
            `${pg.pages} 页（via ${pg.via}） vs .bt-page=${after.btPages}（生成前 ${before.btPages}）`,
            '两者相等', '块帖每页 6 块，12 字 → 2 页');

        // C5c：块帖自己的打印样式表（动态注入的 block-table.css）也必须把 @page 边距归零，
        //      否则「经典已禁、块帖仍开」会漏掉浏览器页眉页脚。
        const btPageRules = await page.evaluate(() => {
            const out = [];
            // @page 在 @media print 内 —— 必须递归下钻（与 measurePrintInPage 的 walk 同构）
            const walk = (rules) => {
                for (const r of rules) {
                    if (r.type === 6) {                    // CSSPageRule
                        out.push({
                            margin: r.style.margin || '',
                            mt: r.style.marginTop || '',
                            mb: r.style.marginBottom || '',
                            size: r.style.size || ''
                        });
                    } else if (r.cssRules) {
                        walk(r.cssRules);
                    }
                }
            };
            for (const ss of document.styleSheets) {
                let rules = null;
                try { rules = ss.cssRules; } catch { continue; }
                if (rules) walk(rules);
            }
            return out;
        });
        const btZero = btPageRules.some(r =>
            r.margin === '0px' || r.margin === '0mm' || r.margin === '0'
            || (r.mt === '0px' && r.mb === '0px'));
        check('C5c 块帖 @page margin == 0（同样禁止浏览器页眉页脚）', btZero,
            btPageRules.length ? btPageRules.map(r => `margin=${r.margin || `${r.mt}/${r.mb}`} size=${r.size}`).join(' | ') : '未找到 CSSPageRule',
            '存在 margin 全 0 的 @page', `共 ${btPageRules.length} 条 CSSPageRule（含动态注入的 block-table.css）`);

        // C6：块帖网格线宽一致性（用户反馈：分隔行的横实线比边框竖线粗）
        // 判据：行间边界厚度 = 上一行下边 + 下一行上边，必须 ≈ 单条线（≤1.05×）；
        //       且横线单条厚度 ≈ 竖线厚度（≤5% 偏差）。
        const lineMeas = await page.evaluate(() => {
            const PX2MM = 25.4 / 96;
            // 注意：必须按 .bt-block 分组 —— 块与块之间有 5mm 块距，跨块的「上一块末行下边 +
            // 下一块首行上边」本来就不相邻，混在一起算会把正常块距误判成「叠粗」。
            const summarize = (rows) => {
                if (!rows.length) return null;
                const singleH = rows[0].hMm, singleV = rows[0].vMm;
                const boundaries = rows.slice(0, -1).map((r, i) =>
                    (r.bottom ? r.hMm : 0) + (rows[i + 1].top ? rows[i + 1].hMm : 0));
                return {
                    n: rows.length, singleH, singleV,
                    maxBoundary: boundaries.length ? Math.max(...boundaries) : singleH,
                    doubled: boundaries.filter(b => b > singleH * 1.05).length,
                    flags: rows.map(r => (r.top ? 'T' : '-') + (r.bottom ? 'B' : '-')).join(',')
                };
            };
            const collect = (sel) => {
                const gs = [...document.querySelectorAll('.bt-block')]
                    .map(b => summarize([...b.querySelectorAll(sel)].map(row => {
                        const svg = row.querySelector('.grid-svg-row-border');
                        if (!svg) return null;
                        const r = svg.getBoundingClientRect();
                        const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
                        const sx = r.width / vb[2], sy = r.height / vb[3];
                        const rects = [...svg.querySelectorAll('rect')];
                        const isEdge = (x) => +x.getAttribute('width') > 10;
                        const top = rects.some(x => isEdge(x) && +x.getAttribute('y') === 0 && +x.getAttribute('height') === 2);
                        const bottom = rects.some(x => isEdge(x) && +x.getAttribute('y') === 98 && +x.getAttribute('height') === 2);
                        return { hMm: 2 * sy * PX2MM, vMm: 2 * sx * PX2MM, top, bottom };
                    }).filter(Boolean)))
                    .filter(Boolean);
                if (!gs.length) return { n: 0, singleH: NaN, singleV: NaN, maxBoundary: NaN, doubled: 0, flags: '' };
                return {
                    n: gs.reduce((a, g) => a + g.n, 0),
                    singleH: gs[0].singleH,
                    singleV: gs[0].singleV,
                    maxBoundary: Math.max(...gs.map(g => g.maxBoundary)),
                    doubled: gs.reduce((a, g) => a + g.doubled, 0),
                    flags: gs.map(g => '[' + g.flags + ']').join(' ')
                };
            };
            return { main: collect('.bt-row'), zuci: collect('.bt-zrow') };
        });
        summary.lines = lineMeas;
        const mainOk = lineMeas.main.n > 0
            && lineMeas.main.doubled === 0
            && lineMeas.main.maxBoundary <= lineMeas.main.singleH * 1.05
            && Math.abs(lineMeas.main.singleH - lineMeas.main.singleV) <= lineMeas.main.singleV * 0.05;
        check('C6a 块帖主表格：行间横线不叠粗，且横/竖线等宽', mainOk,
            `${lineMeas.main.n} 行；单条横 ${lineMeas.main.singleH.toFixed(3)}mm vs 竖 ${lineMeas.main.singleV.toFixed(3)}mm；`
            + `行间边界最厚 ${lineMeas.main.maxBoundary.toFixed(3)}mm；叠粗边界 ${lineMeas.main.doubled} 处；边标 ${lineMeas.main.flags}`,
            '边界 ≤ 1.05×单条；横竖差 ≤ 5%');
        const zuciOk = lineMeas.zuci.n === 0 || (
            lineMeas.zuci.doubled === 0
            && lineMeas.zuci.maxBoundary <= lineMeas.zuci.singleH * 1.05
            && Math.abs(lineMeas.zuci.singleH - lineMeas.zuci.singleV) <= lineMeas.zuci.singleV * 0.05);
        check('C6b 组词面板：同一判据', zuciOk,
            lineMeas.zuci.n ? `${lineMeas.zuci.n} 行；横 ${lineMeas.zuci.singleH.toFixed(3)}mm vs 竖 ${lineMeas.zuci.singleV.toFixed(3)}mm；`
                + `边界最厚 ${lineMeas.zuci.maxBoundary.toFixed(3)}mm；叠粗 ${lineMeas.zuci.doubled} 处；边标 ${lineMeas.zuci.flags}` : '未渲染组词面板（跳过）',
            '边界 ≤ 1.05×单条；横竖差 ≤ 5%');

    } finally {
        await page.close().catch(() => {});
    }
}

// ════════════════════════════════════════════════════════════════════════
// C7（v3.1.3）：移动端打印路由（iPhone 13 仿真）
//   修复契约：printDirect 内块帖早退分支必须前移到移动端 UA 路由之前 ——
//   块帖在移动端与桌面统一走原生 window.print + .bt-page 显式分页（@page margin:0），
//   不经 printViaIframe（块帖零 DOM 改造，「wrapper 被 cleanup 销毁」失效模式不适用）。
//   · C7-pre 负控：classic + 移动端 UA → 必须仍命中 printViaIframe
//     （iframe.print-frame ≥1，且主窗口 __printCalled=false —— 桩只注入主窗口）
//   · C7 主体：block-table + 移动端 UA → 零 iframe / 零 section / 零 DOM 改造 /
//     打印态 .bt-page 296×210mm / page.pdf 页数 == .bt-page 数 / @page margin 全 0
// ════════════════════════════════════════════════════════════════════════
async function checkMobilePrintRouting() {
    // ── C7-pre：负控（classic + iPhone 仿真 → 移动端路由必须仍然可达）──
    {
        const page = await newPage({ stubPrint: true, mobile: true });
        try {
            await openWithSettings(page, { layoutType: 'classic', gridColorPreset: 'red', gridType: 'mizi', traceOpacity: 0.1 });
            const g = await generateAndSettle(page, TEXT_10, '.grid-svg-cell');
            if (!g.ok) {
                check('C7-pre 生成成功（classic 10 字，iPhone 仿真）', false, g.why || g, '渲染完成');
            } else {
                await page.emulateMediaType('print');
                await page.evaluate(() => document.getElementById('printBtn').click());
                const appeared = await page.waitForFunction(
                    () => document.querySelectorAll('iframe.print-frame').length > 0,
                    { timeout: 12000, polling: 300 }
                ).then(() => true).catch(() => false);
                const m = await page.evaluate(() => ({
                    frames: document.querySelectorAll('iframe.print-frame').length,
                    printCalled: !!window.__printCalled
                }));
                check('C7-pre 负控：移动端 UA + classic 命中 printViaIframe（iframe.print-frame ≥ 1）',
                    appeared && m.frames >= 1,
                    `iframe.print-frame=${m.frames}${appeared ? '' : '（12s 内未出现）'}`, '≥ 1',
                    '负控自证 iPhone 仿真确实命中移动端 UA 路由；负控不成立则 C7 主体判据失效');
                check('C7-pre 负控：主窗口 window.print 未被调用（__printCalled=false）',
                    m.printCalled === false, `__printCalled=${m.printCalled}`, 'false',
                    '__printCalled 桩只注入主窗口 —— iframe 路由不应触碰主窗口 print');
            }
        } finally {
            await page.close().catch(() => {});
        }
    }

    // ── C7 主体：block-table + iPhone 仿真 → 块帖早退分支先行返回，不进 iframe ──
    {
        const page = await newPage({ stubPrint: true, mobile: true });
        try {
            await openWithSettings(page, { layoutType: 'block-table', gridColorPreset: 'red', gridType: 'mizi', traceOpacity: 0.1 });
            const g = await generateAndSettle(page, TEXT_BT_12, '.bt-block');
            if (!g.ok) { check('C7 生成成功（block-table 12 字，iPhone 仿真）', false, g.why || g, '渲染完成'); return; }
            const before = await page.evaluate(measureBtPrintInPage);

            await page.emulateMediaType('print');
            await page.evaluate(() => document.getElementById('printBtn').click());
            await sleep(3500);      // 等字体/笔画等待链走完（waitForFonts + waitForStrokes(2000) + 300ms + 双 rAF）
            const after = await page.evaluate(measureBtPrintInPage);
            const pdf = Buffer.from(await page.pdf({ displayHeaderFooter: false, preferCSSPageSize: true, format: 'a4' }));
            const pg = countPdfPages(pdf);
            summary.pages.C7 = { ...pg, btPages: after.btPages, printFrames: after.printFrames, printSections: after.printSections };

            // 结构/几何取证（C7d/C7e 的补充数据；print 媒体下 block-table.css 的
            // transform:none !important 已还原窄屏缩放，量测为 1:1 物理尺寸）
            const dom = await page.evaluate(() => {
                const px2mm = (px) => px * 25.4 / 96;
                const sheet = document.querySelector('.bt-sheet');
                const p0 = document.querySelector('.bt-page');
                const r = p0 ? p0.getBoundingClientRect() : null;
                return {
                    sheetParentId: sheet && sheet.parentElement ? sheet.parentElement.id : '(无)',
                    wrappers: document.querySelectorAll('.a4-page.pdf-print-wrapper').length,
                    pageWmm: r ? px2mm(r.width) : NaN
                };
            });

            // a) 真实 printDirect 块帖路径已执行（主窗口 window.print 被 stub 调用；
            //    旧构建移动端 UA 下先进 printViaIframe，主窗口 print 不被调用 → 翻红）
            check('C7a 移动端块帖走主窗口原生 window.print（__printCalled=true）',
                after.printCalled === true, `__printCalled=${after.printCalled}`, 'true',
                'v3.1.3：块帖早退分支先于移动端 UA 路由返回，不经 printViaIframe');
            // b) 零 iframe（旧构建 printViaIframe 常驻一个 iframe.print-frame → 翻红）
            check('C7b 无 iframe.print-frame（块帖不经 printViaIframe）',
                after.printFrames === 0, `iframe.print-frame=${after.printFrames}`, '0');
            // c) 零 .print-page-section
            check('C7c 移动端块帖不得产生 .print-page-section',
                after.printSections === 0, `print-page-section=${after.printSections}`, '0');
            // d) 零 DOM 改造：页数不变、.bt-sheet 仍在 #grid-container 内、无打印包装
            const dOk = after.btPages === 2 && before.btPages === 2
                && dom.sheetParentId === 'grid-container' && dom.wrappers === 0;
            check('C7d 零 DOM 改造（.bt-page 前后均 2；.bt-sheet 父节点=grid-container；无 .a4-page.pdf-print-wrapper）',
                dOk,
                `btPages before=${before.btPages} after=${after.btPages}；bt-sheet.parent=#${dom.sheetParentId}；wrapper=${dom.wrappers}`,
                'btPages=2；parent=grid-container；wrapper=0',
                '块帖零 DOM 改造 —— 「wrapper 被 cleanup 销毁」失效模式对块帖不适用');
            // e) 打印态几何：首 .bt-page 296mm 高 × 210mm 宽（±0.3，getBoundingClientRect × 25.4/96）
            const h0 = Array.isArray(after.btHeights) ? after.btHeights[0] : NaN;
            const eOk = Math.abs(h0 - 296) <= 0.3 && Math.abs(dom.pageWmm - 210) <= 0.3;
            check('C7e 打印态首 .bt-page 几何 296×210mm（±0.3）', eOk,
                `h=${Number(h0).toFixed(3)}mm w=${Number(dom.pageWmm).toFixed(3)}mm`,
                '296×210mm（±0.3）',
                '@page margin:0 + .bt-page 210×296mm/padding 10mm（v3.1.2 打印几何）');
            // f) page.pdf 页数 == .bt-page 数（显式分页贯穿移动端路由）
            check('C7f page.pdf 页数 == .bt-page 数（iPhone 仿真）',
                pg.pages === after.btPages,
                `${pg.pages} 页（via ${pg.via}） vs .bt-page=${after.btPages}（生成前 ${before.btPages}）`,
                '两者相等', '块帖每页 6 块，12 字 → 2 页');
            // g) CSSOM 存在 margin 全 0 的 @page（复用 C5c 的 CSSPageRule 递归 walk 判据：
            //    @page 在 @media print 内必须下钻；移动端块帖同样禁止浏览器页眉页脚）
            const btPageRules = await page.evaluate(() => {
                const out = [];
                const walk = (rules) => {
                    for (const r of rules) {
                        if (r.type === 6) {                    // CSSPageRule
                            out.push({
                                margin: r.style.margin || '',
                                mt: r.style.marginTop || '',
                                mb: r.style.marginBottom || '',
                                size: r.style.size || ''
                            });
                        } else if (r.cssRules) {
                            walk(r.cssRules);
                        }
                    }
                };
                for (const ss of document.styleSheets) {
                    let rules = null;
                    try { rules = ss.cssRules; } catch { continue; }
                    if (rules) walk(rules);
                }
                return out;
            });
            const zeroPage = btPageRules.some(r =>
                r.margin === '0px' || r.margin === '0mm' || r.margin === '0'
                || (r.mt === '0px' && r.mb === '0px'));
            check('C7g CSSOM 存在 margin 全 0 的 @page（移动端同样禁浏览器页眉页脚）', zeroPage,
                btPageRules.length ? btPageRules.map(r => `margin=${r.margin || `${r.mt}/${r.mb}`} size=${r.size}`).join(' | ') : '未找到 CSSPageRule',
                '存在 margin 全 0 的 @page', `共 ${btPageRules.length} 条 CSSPageRule（与 C5c 同一递归 walk 判据）`);
        } finally {
            await page.close().catch(() => {});
        }
    }
}

// ════════════════════════════════════════════════════════════════════════
// C8（v3.1.5）：拆解条不变量 —— 每笔恰好一张、逐笔累计、末笔即止、绝不循环重复排布；
//   尺寸自适应封顶 6mm 不逾矩。
//   背景：v3.1.5 有用户报告拆解条 SVG「循环重复排布」（1,2,3,1,2,3…）。全 git 历史
//   核查确认代码从未存在循环补满实现 —— loadStrokesDirect 恒为
//   `for (let k = 0; k < strokeCount; k++) createStrokeSVG(strokes, k)`，k 逐笔 +1、
//   strokeCount-1 即止；重复排布来自旧缓存构建（PWA precache revision:null 缺陷，
//   见 vite.config.js v3.1.5 注释与本版本 CHANGELOG）。本组断言把现行为固化为回归
//   断言，防未来回归（尤其帅小呆移植）。
//   可伪性说明：svg 数是对真实 DOM 的 querySelectorAll 计数，N 独立取自「N画」pill/span
//   文本 —— 若未来引入循环补满（svg 数 > N）或截断/徽标，断言立即翻红，并非恒真式。
//   C8a 块帖：每个 .bt-block[data-char] → .bt-pill 文本解析 N（块帖计数由 pill 承担，
//       序列内计数 span 按 block-table.css 隐藏）；strip.querySelectorAll('svg').length
//       === N；无 .bt-strip-more（N≤5 不截断）；每张 svg 宽度 ≤ 6.01mm（封顶 6mm）。
//   C8b 经典：每个 .grid-svg-stroke-box → span 文本解析 N；box 内 svg 数 == N。
// ════════════════════════════════════════════════════════════════════════
const C8_TEXT = '三大人木永';
const C8_EXPECT_N = { '三': 3, '大': 3, '人': 2, '木': 4, '永': 5 };
const C8_STRIP_MAX_MM = 6.01;   // 封顶 6mm（+0.01 换算余量：6mm → 22.68px → 6.001mm）

/** 解析「N画」文本 → N（整体匹配；失败返回 null） */
function parseStrokeCount(text) {
    const m = /^(\d+)画$/.exec((text || '').trim());
    return m ? Number(m[1]) : null;
}

async function checkStrokeStripInvariant() {
    const settings = { gridColorPreset: 'red', gridType: 'mizi', traceOpacity: 0.1 };

    // ── C8a 块帖 ──
    {
        const page = await newPage();
        try {
            await openWithSettings(page, Object.assign({ layoutType: 'block-table' }, settings));
            const g = await generateAndSettle(page, C8_TEXT, '.bt-block');
            if (!g.ok) { check('C8a 生成成功（block-table 三大人木永）', false, g.why || g, '渲染完成'); return; }
            // 队列已排空（generateAndSettle 等到 pending=0）；再留 MutationObserver
            // 归一化（btNormalizeStrokeStrip）与 pill 异步填充的完成余量
            await sleep(1500);
            const blocks = await page.evaluate(() => {
                const px2mm = (px) => px * 25.4 / 96;
                return Array.from(document.querySelectorAll('.bt-block[data-char]')).map(b => {
                    const pill = b.querySelector('.bt-pill');
                    const strip = b.querySelector('.bt-stroke-strip');
                    const svgs = strip ? Array.from(strip.querySelectorAll('svg')) : [];
                    return {
                        char: b.getAttribute('data-char'),
                        pill: pill ? (pill.textContent || '').trim() : '(无 .bt-pill)',
                        svgCount: svgs.length,
                        moreBadges: strip ? strip.querySelectorAll('.bt-strip-more').length : -1,
                        // style.width 为主（归一化写入处）；为空回退 computed style（防假绿）
                        widthsMm: svgs.map(s => {
                            const w = (s.style && s.style.width) || getComputedStyle(s).width;
                            return px2mm(parseFloat(w) || 0);
                        })
                    };
                });
            });
            if (blocks.length !== C8_TEXT.length || blocks.some(b => !(b.char in C8_EXPECT_N))) {
                check('C8a 块帖块数与字符序列 == 三大人木永', false,
                    blocks.map(b => b.char).join(',') || '(无 .bt-block[data-char])',
                    C8_TEXT.split('').join(','));
                return;
            }
            for (const b of blocks) {
                const N = C8_EXPECT_N[b.char];
                const nParsed = parseStrokeCount(b.pill);
                check(`C8a「${b.char}」pill="${b.pill}" 解析 N=${N}，且 strip svg 数 == N（实测 DOM 计数）`,
                    nParsed === N && b.svgCount === N,
                    `pill 解析 ${nParsed}；svg=${b.svgCount}`,
                    `pill=N画（N=${N}）；svg=${N}`);
            }
            check('C8a 无 .bt-strip-more 徽标（N≤5 不会截断）',
                blocks.every(b => b.moreBadges === 0),
                blocks.map(b => `${b.char}:${b.moreBadges}`).join(' '), '全部 0');
            const totalSvgs = blocks.reduce((a, b) => a + b.widthsMm.length, 0);
            const widest = blocks.reduce((a, b) => Math.max(a, ...b.widthsMm, 0), 0);
            check(`C8a 每张 svg 宽度 ≤ ${C8_STRIP_MAX_MM}mm（自适应封顶 6mm 不逾矩）`,
                blocks.every(b => b.widthsMm.length === b.svgCount && b.widthsMm.every(w => w <= C8_STRIP_MAX_MM)),
                `最宽 ${widest.toFixed(3)}mm（共 ${totalSvgs} 张）`,
                `全部 ≤ ${C8_STRIP_MAX_MM}mm`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    // ── C8b 经典 ──
    {
        const page = await newPage();
        try {
            await openWithSettings(page, Object.assign({ layoutType: 'classic' }, settings));
            const g = await generateAndSettle(page, C8_TEXT, '.grid-svg-cell');
            if (!g.ok) { check('C8b 生成成功（classic 三大人木永）', false, g.why || g, '渲染完成'); return; }
            await sleep(1500);
            const boxes = await page.evaluate(() =>
                Array.from(document.querySelectorAll('.grid-svg-stroke-box')).map(box => ({
                    span: box.querySelector('span') ? (box.querySelector('span').textContent || '').trim() : '(无 span)',
                    svgCount: box.querySelectorAll('svg').length
                }))
            );
            check('C8b 拆解盒数 == 5（classic 每字一盒，序列 三大人木永）', boxes.length === C8_TEXT.length,
                `${boxes.length} 盒`, `${C8_TEXT.length} 盒`);
            for (let i = 0; i < boxes.length; i++) {
                const ch = C8_TEXT[i];
                const N = C8_EXPECT_N[ch];
                const nParsed = parseStrokeCount(boxes[i].span);
                check(`C8b「${ch}」span="${boxes[i].span}" 解析 N=${N}，且 svg 数 == N（实测 DOM 计数）`,
                    nParsed === N && boxes[i].svgCount === N,
                    `span 解析 ${nParsed}；svg=${boxes[i].svgCount}`,
                    `span=N画（N=${N}）；svg=${N}`);
            }
        } finally {
            await page.close().catch(() => {});
        }
    }
}

// ════════════════════════════════════════════════════════════════════════
// main
// ════════════════════════════════════════════════════════════════════════
(async () => {
    if (ARGS.help) {
        console.log('用法: node scripts/verify-v312-print.cjs [--root <dir>] [--server]');
        process.exit(0);
    }
    console.log('='.repeat(78));
    console.log(`v3.1.5 验收关口 | mode=${MODE} | root=${MODE === 'root' ? ROOT_DIR : '(服务端 dist)'}`);
    console.log('='.repeat(78));

    // ── 目标服务 ──
    if (MODE === 'root') {
        if (!fs.existsSync(path.join(ROOT_DIR, 'index.html'))) {
            record('H0 目标目录存在 index.html', 'FAIL', ROOT_DIR, 'index.html 存在');
            process.exitCode = 1;
            return;
        }
        const s = await startStaticServer(ROOT_DIR);
        staticServer = s.server;
        pageUrlBase = `http://127.0.0.1:${s.port}`;
        console.log(`target: ${pageUrlBase}/  (静态服务 ${ROOT_DIR})\n`);
    } else {
        // 3210 已被外部服务占用 → 复用（绝不误杀别人的进程）
        const health = await httpGet(API_BASE + '/health');
        if (health && health.status === 200) {
            console.log(`target: ${API_BASE}  (复用已在运行的服务，结束时不会 kill)\n`);
        } else {
            console.log('启动 puppeteer-server.cjs …');
            startedServerChild = spawn(process.execPath, [path.join(REPO_ROOT, 'puppeteer-server.cjs')], {
                cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe']
            });
            startedServerChild.stdout.on('data', () => {});
            startedServerChild.stderr.on('data', (d) => process.stderr.write('[server] ' + d.toString().slice(0, 400)));
            let up = false;
            for (let i = 0; i < 60; i++) {
                await sleep(500);
                const h = await httpGet(API_BASE + '/health');
                if (h && h.status === 200) { up = true; break; }
            }
            check('H1 本地服务 3210 在 30s 内就绪', up, up ? '已就绪' : '超时', '就绪');
            if (!up) { process.exitCode = 1; return; }
            console.log(`target: ${API_BASE}  (本脚本启动，结束时 kill)\n`);
        }
        pageUrlBase = API_BASE;
    }

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const pageErrors = [];
    try {
        // 每个检查自带独立 page；此处只做一次页面异常采样（主页面探针）
        browser.on('targetcreated', async (t) => {
            try {
                const p = await t.page();
                if (p) p.on('pageerror', e => pageErrors.push(String(e && e.message ? e.message : e).slice(0, 200)));
            } catch { /* 忽略 */ }
        });

        console.log('── C1 颜色一致性（classic / red）──');
        await checkColorRed('C1', 'classic', '.grid-svg-cell');

        console.log('\n── C2 颜色一致性（block-table / red）──');
        await checkColorRed('C2', 'block-table', '.bt-block');

        console.log('\n── C3 绿色预设回归（classic / green / 198 字）──');
        await checkGreenBaseline();

        console.log('\n── C4 打印分页（classic / 25 字）──');
        await checkPrintPagination();

        console.log('\n── C5 块帖打印（block-table / 12 字）──');
        await checkBtPrint();

        console.log('\n── C7 移动端打印路由（iPhone 仿真）──');
        await checkMobilePrintRouting();

        console.log('\n── C8 拆解条不变量（每笔一次·末笔即止）──');
        await checkStrokeStripInvariant();

        check('Z1 全程无未捕获页面异常', pageErrors.length === 0,
            pageErrors.slice(0, 3).join(' | ') || '无', '无异常');
    } catch (e) {
        record('HARNESS 自身异常', 'FAIL',
            (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : String(e)), 'no throw');
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (staticServer) await new Promise(r => staticServer.close(r));
        if (startedServerChild) {
            // Windows 下需连子树一起收，避免遗留 chrome/node 监听 3210
            if (process.platform === 'win32') {
                try { spawn('taskkill', ['/PID', String(startedServerChild.pid), '/T', '/F']); } catch { /* 忽略 */ }
            }
            try { startedServerChild.kill(); } catch { /* 忽略 */ }
            await sleep(500);
        }
    }

    // ── 汇总 ──
    const nPass = rows.filter(r => r.status === 'PASS').length;
    const nFail = rows.filter(r => r.status === 'FAIL').length;
    const nWarn = rows.filter(r => r.status === 'WARN').length;
    // 逐条 PASS/FAIL 表格（一屏可读）
    console.log('\n' + '─'.repeat(78));
    console.log('CHECK TABLE');
    console.log('─'.repeat(78));
    rows.forEach((r, i) => {
        console.log(`${String(i + 1).padStart(2)}. ${r.status.padEnd(4)}  ${r.name}`);
    });
    console.log('\n' + '='.repeat(78));
    console.log(`SUMMARY: ${nPass} passed, ${nFail} failed, ${nWarn} warned, ${rows.length} total`);
    console.log('='.repeat(78));
    if (nFail) {
        console.log('FAILED ASSERTIONS:');
        rows.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`  - ${r.name}\n      observed: ${r.observed}\n      expected: ${r.expected}`);
        });
    }
    try {
        fs.writeFileSync(REPORT_PATH, JSON.stringify({
            version: '3.1.5', mode: MODE, root: MODE === 'root' ? ROOT_DIR : API_BASE,
            generatedAt: new Date().toISOString(),
            summary: { pass: nPass, fail: nFail, warn: nWarn, total: rows.length },
            colors: summary.colors, pages: summary.pages, rows
        }, null, 2));
        console.log('report: scripts/v312-print-report.json');
    } catch { /* 报告写不进不影响判据 */ }
    process.exitCode = nFail ? 1 : 0;
})();
