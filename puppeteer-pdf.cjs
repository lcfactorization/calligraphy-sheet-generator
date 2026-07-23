#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * 字帖生成器 — Puppeteer PDF 矢量生成脚本
 * ═══════════════════════════════════════════════════════════════
 *
 * 功能：
 *   - 从「字帖生成器.html」生成矢量PDF文件
 *   - PDF中所有文字可选择、可复制（非光栅化图片）
 *   - 拼音字体(TeXGyreAdventor) + 汉字字体完整嵌入PDF
 *   - 支持命令行参数自定义文本、字体、页面格式
 *   - 支持页眉页脚、页码、横向/纵向
 *
 * 使用前提：
 *   1. 已安装 Node.js (v18+)
 *   2. 已安装 Puppeteer: npm install
 *   3. 字帖生成器.html 和 fonts/ 文件夹与本脚本在同一目录
 *
 * 使用示例：
 *   node puppeteer-pdf.js --text "床前明月光，疑是地上霜"
 *   node puppeteer-pdf.js --input poem.txt --output 我的字帖.pdf --font 华文楷体
 *   node puppeteer-pdf.js -t "静夜思" --format a3 --landscape --header "李白诗集"
 * ═══════════════════════════════════════════════════════════════
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// ════════ 字体名称映射表 ════════
const FONT_MAP = {
    '姜浩硬笔楷书':       'JiangHaoYingBiKaiShu',
    '华文楷体':           'STKaiti',
    '方正仿宋GBK':        'FZFSGBK',
    '方正宋简大漆':       'FZSJ-DQYBKSJW',
    '方正宋简海豚':       'FZSJ-HAITWY',
    '文鼎楷体':           'TW-Kai',
    '田英章楷书30Light':  'TianYingZhangKaiShuLight',
};

// ════════ 命令行参数解析 ════════
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        text: '',
        input: '',
        output: '字帖.pdf',
        font: '姜浩硬笔楷书',
        format: 'a4',
        header: '',
        footer: '第 {page} 页 / 共 {total} 页',
        margin: '10mm',
        landscape: false,
        timeout: 30000,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-t':
            case '--text':
                options.text = args[++i] || '';
                break;
            case '-i':
            case '--input':
                options.input = args[++i] || '';
                break;
            case '-o':
            case '--output':
                options.output = args[++i] || '字帖.pdf';
                break;
            case '-f':
            case '--font':
                options.font = args[++i] || '姜浩硬笔楷书';
                break;
            case '--format':
                options.format = args[++i] || 'a4';
                break;
            case '--header':
                options.header = args[++i] || '';
                break;
            case '--footer':
                options.footer = args[++i] || '';
                break;
            case '--margin':
                options.margin = args[++i] || '10mm';
                break;
            case '--landscape':
                options.landscape = true;
                break;
            case '--timeout':
                options.timeout = parseInt(args[++i]) || 30000;
                break;
            case '-h':
            case '--help':
                console.log(`
╔══════════════════════════════════════════════════════════════╗
║          字帖生成器 — Puppeteer PDF 矢量生成脚本              ║
╚══════════════════════════════════════════════════════════════╝

使用方法:
  node puppeteer-pdf.js [选项]

选项:
  -t, --text <文本>       直接指定要生成字帖的文本内容
  -i, --input <文件>      从文本文件读取内容（UTF-8编码）
  -o, --output <文件>     输出PDF文件路径 (默认: 字帖.pdf)
  -f, --font <字体名>     汉字字体 (默认: 姜浩硬笔楷书)
      可选字体:
        姜浩硬笔楷书        华文楷体            方正仿宋GBK
        方正宋简大漆        方正宋简海豚        文鼎楷体
        田英章楷书30Light
  --format <格式>         页面格式: a4, a3, a5, letter, legal (默认: a4)
  --header <文本>         页眉文本（留空则无页眉）
  --footer <文本>         页脚文本 (支持 {page} 和 {total} 变量)
                          默认: "第 {page} 页 / 共 {total} 页"
  --margin <边距>         页面边距 (默认: 10mm)
  --landscape             横向打印（默认为纵向）
  --timeout <毫秒>        超时时间 (默认: 30000)
  -h, --help              显示此帮助信息

示例:
  node puppeteer-pdf.js --text "床前明月光，疑是地上霜"
  node puppeteer-pdf.js --input poem.txt --output 我的字帖.pdf --font 华文楷体
  node puppeteer-pdf.js -t "静夜思" --format a3 --landscape --header "李白诗集"
  node puppeteer-pdf.js --text "春眠不觉晓" --footer "" --margin 15mm

输出特点:
  ✅ 矢量PDF — 放大不失真
  ✅ 文字可选择、可复制、可搜索
  ✅ 拼音字体 + 汉字字体完整嵌入
  ✅ 支持页眉页脚和页码
`);
                process.exit(0);
            default:
                console.warn(`未知选项: ${args[i]}`);
        }
    }

    // 从文件读取文本
    if (options.input && !options.text) {
        if (!fs.existsSync(options.input)) {
            console.error(`错误: 找不到输入文件: ${options.input}`);
            process.exit(1);
        }
        options.text = fs.readFileSync(options.input, 'utf-8').trim();
    }

    // 验证文本内容
    if (!options.text) {
        console.error('错误: 请通过 --text 或 --input 指定文本内容');
        console.error('运行 node puppeteer-pdf.js --help 查看帮助');
        process.exit(1);
    }

    // 验证字体名称
    if (!FONT_MAP[options.font]) {
        console.error(`错误: 未知字体 "${options.font}"`);
        console.error(`可选字体: ${Object.keys(FONT_MAP).join(', ')}`);
        process.exit(1);
    }

    return options;
}

// ════════ 浏览器路径自动检测 ════════
function findChrome() {
    const candidates = [];

    // 1. Puppeteer 缓存中的 Chrome（任意版本）
    const cacheDir = path.join(require('os').homedir(), '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(cacheDir)) {
        try {
            const versions = fs.readdirSync(cacheDir);
            for (const v of versions) {
                const exe = path.join(cacheDir, v, 'chrome-win64', 'chrome.exe');
                if (fs.existsSync(exe)) candidates.push(exe);
                const exeMac = path.join(cacheDir, v, 'chrome-darwin', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
                if (fs.existsSync(exeMac)) candidates.push(exeMac);
                const exeLinux = path.join(cacheDir, v, 'chrome-linux64', 'chrome');
                if (fs.existsSync(exeLinux)) candidates.push(exeLinux);
            }
        } catch (e) { /* ignore */ }
    }

    // 2. 系统 Chrome
    const sysChrome = [
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];
    for (const p of sysChrome) {
        if (p && fs.existsSync(p)) candidates.push(p);
    }

    // 3. 系统 Edge（Chromium内核，Windows自带）
    const sysEdge = [
        path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
    for (const p of sysEdge) {
        if (p && fs.existsSync(p)) candidates.push(p);
    }

    return candidates.length > 0 ? candidates[0] : null;
}

// ════════ 主函数 ════════
async function generatePDF() {
    const options = parseArgs();
    const scriptDir = __dirname;
    const htmlPath = path.join(scriptDir, '字帖生成器.html');
    const fontsDir = path.join(scriptDir, 'fonts');

    // 检查HTML文件
    if (!fs.existsSync(htmlPath)) {
        console.error(`错误: 找不到HTML文件: ${htmlPath}`);
        process.exit(1);
    }

    // 检查字体文件夹
    if (!fs.existsSync(fontsDir)) {
        console.error(`错误: 找不到字体文件夹: ${fontsDir}`);
        process.exit(1);
    }

    const cssFontFamily = FONT_MAP[options.font];

    console.log('┌─────────────────────────────────────────────┐');
    console.log('│  字帖生成器 — Puppeteer PDF 矢量生成工具     │');
    console.log('└─────────────────────────────────────────────┘');
    console.log('');

    // 启动浏览器
    const chromePath = findChrome();
    console.log('▶ 正在启动 Chromium 浏览器...');
    if (chromePath) {
        console.log(`  使用浏览器: ${chromePath}`);
    } else {
        console.log('  使用Puppeteer默认浏览器（如失败请运行 npx puppeteer browsers install chrome）');
    }
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: chromePath || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--font-render-hinting=none',
            '--disable-font-subpixel-positioning',
        ],
    });

    try {
        const page = await browser.newPage();

        // 加载HTML文件
        const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
        console.log('▶ 正在加载字帖生成器页面...');
        await page.goto(fileUrl, {
            waitUntil: 'networkidle0',
            timeout: options.timeout,
        });

        // 设置文本内容和字体
        console.log(`▶ 正在设置文本内容 (${options.text.length} 字)...`);
        console.log(`▶ 汉字字体: ${options.font} → ${cssFontFamily}`);

        await page.evaluate((text, fontDisplayName) => {
            const textarea = document.getElementById('inputText');
            const fontSelect = document.getElementById('font-select');

            if (textarea) {
                textarea.value = text;
            }

            // 设置字体选择
            if (fontSelect) {
                for (let i = 0; i < fontSelect.options.length; i++) {
                    const opt = fontSelect.options[i];
                    if (opt.text.includes(fontDisplayName) ||
                        opt.value === fontDisplayName) {
                        fontSelect.selectedIndex = i;
                        fontSelect.dispatchEvent(new Event('change'));
                        break;
                    }
                }
            }

            // 调用生成函数
            if (typeof generateGrid === 'function') {
                generateGrid();
            }
        }, options.text, options.font);

        // 等待内容渲染
        await page.waitForSelector('#grid-container .page', {
            timeout: 10000,
        }).catch(() => {
            console.warn('⚠ 网格容器未检测到页面，继续处理...');
        });

        // 等待字体加载
        console.log('▶ 正在加载字体（确保拼音和汉字字体就绪）...');
        await page.evaluate(async () => {
            // 等待所有 FontFace 加载完成
            await document.fonts.ready;

            // 额外等待，确保异步 FontFace API 加载完毕
            await new Promise(r => setTimeout(r, 2000));

            // 再次等待
            await document.fonts.ready;

            // 验证关键字体
            const pinyinOk = document.fonts.check('16px TeXGyreAdventor');
            const cnOk = document.fonts.check('16px ' +
                (document.getElementById('font-select')?.value || 'JiangHaoYingBiKaiShu'));

            if (!pinyinOk || !cnOk) {
                console.warn('部分字体未就绪，额外等待3秒...');
                await new Promise(r => setTimeout(r, 3000));
                await document.fonts.ready;
            }
        });

        // 切换到打印媒体类型（隐藏UI元素，应用打印CSS）
        console.log('▶ 正在切换到打印模式...');
        await page.emulateMediaType('print');
        await new Promise(r => setTimeout(r, 500));

        // 构建PDF选项
        const margin = options.margin;
        const hasHeaderFooter = !!(options.header || options.footer);

        const headerTemplate = options.header
            ? `<div style="font-size:9px;width:100%;text-align:center;color:#666;padding:0 ${margin};font-family:sans-serif;">${options.header}</div>`
            : '<div></div>';

        const footerTemplate = options.footer
            ? `<div style="font-size:9px;width:100%;text-align:center;color:#666;padding:0 ${margin};font-family:sans-serif;">${options.footer.replace('{page}', '<span class="pageNumber"></span>').replace('{total}', '<span class="totalPages"></span>')}</div>`
            : '<div></div>';

        const pdfOptions = {
            path: options.output,
            format: options.format,
            printBackground: true,
            landscape: options.landscape,
            margin: {
                top: margin,
                bottom: margin,
                left: margin,
                right: margin,
            },
            displayHeaderFooter: hasHeaderFooter,
            headerTemplate: headerTemplate,
            footerTemplate: footerTemplate,
            preferCSSPageSize: false,
        };

        // 生成PDF
        console.log(`▶ 正在生成 PDF (${options.format}${options.landscape ? ' 横向' : ' 纵向'})...`);
        await page.pdf(pdfOptions);

        // 输出结果
        const stats = fs.statSync(options.output);
        const sizeKB = (stats.size / 1024).toFixed(1);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║                    ✅ PDF 生成成功!                           ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log(`║  文件路径: ${path.resolve(options.output).padEnd(44).substring(0, 44)} ║`);
        console.log(`║  文件大小: ${(sizeKB + ' KB').padEnd(44).substring(0, 44)} ║`);
        console.log(`║  页面格式: ${(options.format + (options.landscape ? ' 横向' : ' 纵向')).padEnd(44).substring(0, 44)} ║`);
        console.log(`║  汉字字体: ${options.font.padEnd(44).substring(0, 44)} ║`);
        console.log(`║  拼音字体: ${'TeXGyreAdventor (base64内嵌)'.padEnd(44).substring(0, 44)} ║`);
        const preview = options.text.substring(0, 20) + (options.text.length > 20 ? '...' : '');
        console.log(`║  文本预览: ${preview.padEnd(44).substring(0, 44)} ║`);
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log('║  PDF特点: 矢量图形 | 文字可选择复制 | 字体完整嵌入          ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');

    } finally {
        await browser.close();
    }
}

// 运行
generatePDF().catch(err => {
    console.error('');
    console.error('❌ 生成PDF时出错:', err.message);
    console.error('');
    console.error('常见问题:');
    console.error('  1. Chromium下载失败 → 运行 npx puppeteer browsers install chrome');
    console.error('  2. 字体文件缺失 → 检查 fonts/ 文件夹');
    console.error('  3. 权限问题 → 尝试添加 --no-sandbox 参数');
    process.exit(1);
});
