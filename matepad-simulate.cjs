#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════
 * MatePad 模拟测试脚本 v2.8.2
 * ════════════════════════════════════════════════════════════════
 *
 * 用 Puppeteer 模拟华为 MatePad（HarmonyOS）环境测试 PDF 导出
 * 验证：
 *   1. 默认米字格 + 传统绿 #2E7D32
 *   2. 田字格   + 朱砂红 #9E2A2B
 *   3. 九宫格   + 靛青蓝
 *
 * 背景：
 *   字帖生成器在 MatePad 上打印 PDF 出现空白问题，移动端无法直接
 *   查看 console.log，排查困难。本脚本本地模拟 MatePad 环境生成
 *   PDF，并收集 [pdfExport] 前缀日志便于排查。
 *
 * 用法：
 *   node matepad-simulate.cjs                       # 默认 http://localhost:3000
 *   node matepad-simulate.cjs --url http://localhost:3000
 *   node matepad-simulate.cjs --url file:///C:/poem2pdf/distribution/dist/index.html
 *
 * 依赖：
 *   - 项目已安装 puppeteer（package.json 已声明）
 *   - 本地需启动 npm run dev 或 npm run preview，或先 npm run build 后用 file:// URL
 *   - 复用 puppeteer-server.cjs / puppeteer-pdf.cjs 的 Chromium 缓存
 * ════════════════════════════════════════════════════════════════
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ════════ MatePad 环境配置 ════════
const MATEPAD_UA = 'Mozilla/5.0 (Linux; Android 10; HARMONYOS; MatePad Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';

// ════════ 测试用例 ════════
const TEST_CASES = [
    { name: 'matepad_test_green',        gridType: 'mizi',   gridColorPreset: 'green', desc: '默认米字格 + 传统绿 #2E7D32' },
    { name: 'matepad_test_red',          gridType: 'tian',   gridColorPreset: 'red',   desc: '田字格     + 朱砂红 #9E2A2B' },
    { name: 'matepad_test_jiugong_blue', gridType: 'jiugong', gridColorPreset: 'blue', desc: '九宫格     + 靛青蓝' },
];

// 测试文本：与任务模板一致（覆盖常见笔画结构，1 页内）
const TEST_TEXT = '融燕鸳鸯惠崇芦芽短';

// ════════ findChrome：复用 puppeteer-server.cjs / puppeteer-pdf.cjs 的 Chromium ════════
function findChrome() {
    const candidates = [];

    // 1. Puppeteer 缓存中的 Chrome（任意版本，跨平台）
    const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(cacheDir)) {
        try {
            const versions = fs.readdirSync(cacheDir);
            for (const v of versions) {
                const exeWin = path.join(cacheDir, v, 'chrome-win64', 'chrome.exe');
                if (fs.existsSync(exeWin)) candidates.push(exeWin);
                const exeMac = path.join(cacheDir, v, 'chrome-darwin', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
                if (fs.existsSync(exeMac)) candidates.push(exeMac);
                const exeLinux = path.join(cacheDir, v, 'chrome-linux64', 'chrome');
                if (fs.existsSync(exeLinux)) candidates.push(exeLinux);
            }
        } catch (e) { /* ignore */ }
    }

    // 2. 系统 Chrome / Edge
    const sys = [
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];
    for (const p of sys) {
        if (p && fs.existsSync(p)) candidates.push(p);
    }

    return candidates.length > 0 ? candidates[0] : null;
}

// ════════ 单个测试用例执行 ════════
async function runTest(browser, url, testCase) {
    const page = await browser.newPage();

    // 收集 console 日志（提前注册，避免漏掉早期日志）
    const logs = [];
    page.on('console', msg => {
        logs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        logs.push(`[pageerror] ${err.message}`);
    });

    // 设置 MatePad 环境
    await page.setUserAgent(MATEPAD_UA);
    await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 2 });

    console.log(`\n───────────────────────────────────────────`);
    console.log(`[测试] ${testCase.desc}`);
    console.log(`[测试] UA: ${MATEPAD_UA}`);
    console.log(`[测试] 视口: 768x1024 DPR=2`);
    console.log(`[测试] 网格: type=${testCase.gridType}, colorPreset=${testCase.gridColorPreset}`);
    console.log(`[测试] 文本: ${TEST_TEXT} (${Array.from(TEST_TEXT).length} 字)`);
    console.log(`───────────────────────────────────────────`);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // 设置 localStorage（网格类型 + 颜色预设）
    await page.evaluate((tt, gc) => {
        try {
            const KEY = 'calligraphy_settings';
            const cur = JSON.parse(localStorage.getItem(KEY) || '{}');
            cur.gridType = tt;
            cur.gridColorPreset = gc;
            localStorage.setItem(KEY, JSON.stringify(cur));
        } catch (e) {
            console.warn('[matepad-simulate] 设置 localStorage 失败:', e);
        }
    }, testCase.gridType, testCase.gridColorPreset);

    // 刷新让设置生效（GridEngine 在页面初始化时读取 localStorage）
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });

    // 输入文本（v2.8.3：用 evaluate 直接设置 value，避免移动端视口下 click 失败）
    await page.evaluate((txt) => {
        const el = document.getElementById('inputText');
        if (el) {
            el.value = txt;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, TEST_TEXT);

    // 点击生成（v2.8.3：用 evaluate 触发 click，避免移动端视口下按钮不可见导致 click 失败）
    await page.evaluate(() => {
        const btn = document.getElementById('generate-btn');
        if (btn) btn.click();
    });

    // 等待字格渲染
    await page.waitForSelector('.grid-svg-row', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));  // 等笔画加载

    // 生成 PDF（A4 + printBackground，与 puppeteer-pdf.cjs 边距一致）
    const pdfPath = path.resolve(testCase.name + '.pdf');
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '29mm', right: '15.9mm', bottom: '16mm', left: '15.9mm' },
    });

    // 输出 pdfExport 日志（关键排查信息）
    console.log(`\n[测试] pdfExport 日志（共 ${logs.filter(l => l.includes('pdfExport')).length} 条）:`);
    logs.filter(l => l.includes('pdfExport')).forEach(l => console.log('  ' + l));

    // 输出 pageerror（如有）
    const errors = logs.filter(l => l.startsWith('[pageerror]'));
    if (errors.length > 0) {
        console.log(`\n[测试] ⚠ 页面错误（共 ${errors.length} 条）:`);
        errors.forEach(l => console.log('  ' + l));
    }

    // 验证 SVG 渲染
    const svgCount = await page.evaluate(() => document.querySelectorAll('.grid-svg-cell').length);
    const svgRowCount = await page.evaluate(() => document.querySelectorAll('.grid-svg-row').length);
    console.log(`\n[测试] 渲染结果: SVG 字格数=${svgCount}, SVG 行数=${svgRowCount}`);
    console.log(`[测试] PDF 已保存: ${pdfPath}`);

    await page.close();
    return { name: testCase.name, svgCount, svgRowCount, pdfPath, logCount: logs.length };
}

// ════════ 主入口 ════════
async function main() {
    // 解析 --url 参数
    const urlArgIdx = process.argv.indexOf('--url');
    const url = (urlArgIdx >= 0 && process.argv[urlArgIdx + 1])
        ? process.argv[urlArgIdx + 1]
        : 'http://localhost:3000';

    console.log('═══════════════════════════════════════════════════');
    console.log('  MatePad 模拟测试 v2.8.2');
    console.log('  目标 URL: ' + url);
    console.log('  测试用例: ' + TEST_CASES.length + ' 个');
    console.log('  MatePad UA: ' + MATEPAD_UA);
    console.log('═══════════════════════════════════════════════════');

    // 复用本地 Chromium（与 puppeteer-server.cjs 同源）
    const chromePath = findChrome();
    if (chromePath) {
        console.log(`[启动] 使用 Chromium: ${chromePath}`);
    } else {
        console.log('[启动] 未找到本地 Chromium，使用 Puppeteer 默认浏览器');
        console.log('       （如失败请运行: npx puppeteer browsers install chrome）');
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: chromePath || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-extensions',
            '--font-render-hinting=none',
        ],
    });

    const results = [];
    try {
        for (const tc of TEST_CASES) {
            const result = await runTest(browser, url, tc);
            results.push(result);
        }
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  测试汇总');
        console.log('═══════════════════════════════════════════════════');
        for (const r of results) {
            console.log(`  ✅ ${r.name}: 字格=${r.svgCount}, 行数=${r.svgRowCount}, 日志=${r.logCount}`);
            console.log(`     PDF: ${r.pdfPath}`);
        }
        console.log('\n✅ 所有测试完成');
    } catch (err) {
        console.error('\n❌ 测试失败:', err.message);
        console.error(err.stack);
        await browser.close().catch(() => {});
        process.exit(1);
    } finally {
        await browser.close().catch(() => {});
    }
}

main().catch(err => {
    console.error('未捕获错误:', err);
    process.exit(1);
});
