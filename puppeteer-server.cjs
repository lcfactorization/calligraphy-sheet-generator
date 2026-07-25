#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = 3210;
const SCRIPT_DIR = __dirname;
const DIST_DIR = path.join(SCRIPT_DIR, 'dist');

// MIME types
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.ico': 'image/x-icon', '.map': 'application/json'
};

function findChrome() {
    const candidates = [];
    const cacheDir = path.join(require('os').homedir(), '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(cacheDir)) {
        try { fs.readdirSync(cacheDir).forEach(v => {
            const exe = path.join(cacheDir, v, 'chrome-win64', 'chrome.exe');
            if (fs.existsSync(exe)) candidates.push(exe);
        }); } catch {}
    }
    const sys = [
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        '/usr/bin/google-chrome', '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];
    sys.forEach(p => { if (p && fs.existsSync(p)) candidates.push(p); });
    return candidates.length > 0 ? candidates[0] : null;
}

let browserInstance = null;

async function getBrowser() {
    if (browserInstance && browserInstance.connected) return browserInstance;
    const chromePath = findChrome();
    browserInstance = await puppeteer.launch({
        headless: 'new',
        executablePath: chromePath || undefined,
        // v2.4.19：添加 --disable-extensions 禁用 IDM 等浏览器扩展，提升效率
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--font-render-hinting=none',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
        ]
    });
    return browserInstance;
}

async function generatePDF(text, fontDisplayName, fontValue, tempFontPath, gridType, gridColorPreset, traceOpacity) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        const distHtml = path.join(DIST_DIR, 'index.html');
        const fileUrl = 'file:///' + distHtml.replace(/\\/g, '/');
        // v2.4.19：networkidle2 + 减少固定等待
        // v2.5.1：进一步减少固定等待（networkidle2 已确保网络空闲）
        await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 500));

        // v2.6.0：在页面加载后、点击生成按钮前，设置 localStorage 中的网格设置
        // Puppeteer 加载的是全新页面，localStorage 为空，GridEngine 会使用默认值（米字格+绿色）
        // 必须在点击 generate-btn 之前写入 localStorage，这样 handleGenerate → getSidebarState → getSettings 才能读到正确的值
        if (gridType || gridColorPreset || traceOpacity != null) {
            await page.evaluate((gt, gcp, to) => {
                try {
                    const KEY = 'calligraphy_settings';
                    let settings = {};
                    const raw = localStorage.getItem(KEY);
                    if (raw) settings = JSON.parse(raw);
                    if (gt) settings.gridType = gt;
                    if (gcp) settings.gridColorPreset = gcp;
                    if (to != null) settings.traceOpacity = to;
                    localStorage.setItem(KEY, JSON.stringify(settings));
                    console.log('[Puppeteer] 已设置网格: type=' + gt + ', color=' + gcp + ', opacity=' + to);
                } catch(e) {
                    console.warn('[Puppeteer] 设置localStorage失败: ' + e.message);
                }
            }, gridType || null, gridColorPreset || null, traceOpacity != null ? traceOpacity : null);
        }

        // v2.5.2：注册自定义字体（如果有）
        if (tempFontPath && fontValue) {
            const fontUrl = 'http://localhost:' + PORT + '/temp-custom-font.ttf';
            await page.evaluate(async (fontName, url, displayFontName) => {
                try {
                    const ff = new FontFace(fontName, 'url(' + url + ')');
                    await ff.load();
                    document.fonts.add(ff);
                    // 添加到下拉框，使用客户端传来的显示名
                    const select = document.getElementById('font-select');
                    if (select) {
                        const opt = document.createElement('option');
                        opt.value = fontName;
                        opt.textContent = displayFontName;
                        opt.selected = true;
                        select.appendChild(opt);
                    }
                    console.log('自定义字体已注册: ' + fontName + ' (' + displayFontName + ')');
                } catch(e) {
                    console.warn('自定义字体注册失败: ' + e.message);
                }
            }, fontValue, fontUrl, fontDisplayName);
            // 等待字体加载完成
            await new Promise(r => setTimeout(r, 500));
        }
        await page.evaluate((text, fontName) => {
            const ta = document.getElementById('inputText');
            if (ta) { ta.value = text; ta.dispatchEvent(new Event('input')); }
            const fs = document.getElementById('font-select');
            if (fs) {
                for (let i = 0; i < fs.options.length; i++) {
                    if (fs.options[i].text.includes(fontName) || fs.options[i].value === fontName) {
                        fs.selectedIndex = i; fs.dispatchEvent(new Event('change')); break;
                    }
                }
            }
            const btn = document.getElementById('generate-btn');
            if (btn) btn.click();
        }, text, fontDisplayName);
        await page.waitForSelector('#grid-container .grid-svg-cell', { timeout: 15000 }).catch(() => {});

        // v2.5.0：等待字体加载完成（与 puppeteer-pdf.cjs 同步）
        // v2.5.1：减少固定等待时间（800ms → 400ms）
        await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(r => setTimeout(r, 400));
        });

        // v2.5.0：等待笔画 SVG 加载完成（确保拼音四线格行的笔画信息显示）
        await page.evaluate(async () => {
            if (typeof window.__waitForStrokes === 'function') {
                try { await window.__waitForStrokes(15000); } catch(e) {}
            }
        });

        // v2.4.10：创建 .a4-page 包装器 + 读取页眉页脚文本（与 puppeteer-pdf.cjs 同步）
        const hfInfo = await page.evaluate(() => {
            const grid = document.getElementById('grid-container');
            if (!grid) return null;
            if (!grid.parentNode.classList.contains('a4-page')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'a4-page pdf-print-wrapper';
                wrapper.style.cssText = 'position:relative;width:100%;';
                grid.parentNode.insertBefore(wrapper, grid);
                wrapper.appendChild(grid);
            }
            // v2.4.12：清除浏览器打印残留的 CSS 页眉页脚元素，避免与 Puppeteer headerTemplate 重叠
            // 注意：不清理 .pdf-print-wrapper（那是本路径刚创建的 .a4-page wrapper）
            document.querySelectorAll('.print-only-header, .print-only-footer, .page-section-header, .page-section-footer, .print-page-section').forEach(el => el.remove());
            // v2.9.1 修复：Puppeteer 路径专用 @page margin 覆盖
            // 背景：v2.8.7 将 print.css 的 @page margin 改为 10mm（window.print() 路径用，.print-page-section 190×277mm 依赖此），
            //   但 page.pdf({preferCSSPageSize:true}) 会让 CSS @page 优先，覆盖 page.pdf() 的 margin.top:29mm，
            //   导致 Puppeteer 实际顶部边距只有 10mm，headerTemplate 文字（padding-top:10mm → y=10mm）与第一行字格（从 y=10mm 开始）纵向坐标完全重合。
            // 修复：恢复 v2.8.3 历史架构，为 Puppeteer headless 页面注入 29mm 顶部边距（多页字帖每页都生效）。
            //   此 <style> 只存在于 Puppeteer 加载的页面，window.print() 路径不经过 puppeteer-server.cjs，零影响。
            //   回退 tag：backup/pre_v291_puppeteer_margin/20260726
            const puppeteerPageStyle = document.createElement('style');
            puppeteerPageStyle.id = 'puppeteer-page-margin-override';
            puppeteerPageStyle.textContent = '@media print{@page{size:A4 portrait;margin:29mm 15.9mm 16mm 15.9mm !important;}}';
            document.head.appendChild(puppeteerPageStyle);
            const fontSelect = document.getElementById('font-select');
            const fontDisplayName = fontSelect ? fontSelect.options[fontSelect.selectedIndex].text : '';
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const truncate = (text, max) => {
                const arr = Array.from(text || '');
                return arr.length > max ? arr.slice(0, max).join('') + '…' : (text || '');
            };
            // v2.5.2：页眉右侧 — 如果用户自定义了则用自定义值，否则用字体名+练习
            const headerRightInput = document.getElementById('headerRight')?.value || '';
            let hRight;
            if (headerRightInput && headerRightInput !== '字体练习') {
                hRight = headerRightInput;
            } else {
                // 默认：字体名缩短到≤6个汉字 + "练习"
                let fontName = fontDisplayName.replace(/^★\s*/, '').replace(/\.(ttf|otf|woff|woff2)$/i, '');
                const chineseChars = (fontName.match(/[\u4e00-\u9fff]/g) || []);
                if (chineseChars.length > 6 && fontName.includes('体')) {
                    fontName = fontName.replace(/体/, '');
                }
                const newChineseCount = (fontName.match(/[\u4e00-\u9fff]/g) || []).length;
                if (newChineseCount > 6) {
                    let count = 0, result = '';
                    for (const ch of fontName) {
                        if (/[\u4e00-\u9fff]/.test(ch)) count++;
                        if (count > 6) break;
                        result += ch;
                    }
                    fontName = result;
                }
                hRight = fontName ? fontName + '练习' : '';
            }
            return {
                hLeft: truncate(
                    document.getElementById('headerLeft')?.value ||
                    `${now.getFullYear()}年${pad(now.getMonth()+1)}月${pad(now.getDate())}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`,
                    22),
                hCenter: truncate(document.getElementById('headerCenter')?.value || '练习字帖', 16),
                hRight: truncate(hRight, 22),
                fText: truncate(document.getElementById('footerText')?.value || '评分：☆☆☆☆☆　______年___月___日', 32)
            };
        });

        // v2.5.1：移除重复的字体/笔画等待（已在第 87-98 行等待过，此处不再重复）
        // 原 v2.4.19 在此处重复等待 fonts.ready + 800ms + strokes，浪费 ~2-3 秒

        await page.emulateMediaType('print');
        // v2.5.1：减少等待（500ms → 200ms）
        await new Promise(r => setTimeout(r, 200));

        // v2.4.10：margin 与 CSS @page 一致，用 headerTemplate/footerTemplate 渲染页眉页脚
        const escapeHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const hL = escapeHtml(hfInfo?.hLeft || '');
        const hC = escapeHtml(hfInfo?.hCenter || '');
        const hR = escapeHtml(hfInfo?.hRight || '');
        const fT = escapeHtml(hfInfo?.fText || '');

        const headerTemplateHtml = `
            <style>body{margin:0!important;padding:0!important;}</style>
            <div style="font-size:9pt; color:#2E7D32; font-family:'Microsoft YaHei','PingFang SC','SimSun',sans-serif; width:100%; margin:0; padding:10mm 15.9mm 0 15.9mm; box-sizing:border-box; display:flex; justify-content:space-between; align-items:flex-start; -webkit-print-color-adjust:exact;">
                <span>${hL}</span>
                <span style="flex:1;text-align:center;">${hC}</span>
                <span>${hR}</span>
            </div>`;
        const footerTemplateHtml = `
            <style>body{margin:0!important;padding:0!important;}</style>
            <div style="font-size:9pt; color:#2E7D32; font-family:'Microsoft YaHei','PingFang SC','SimSun',sans-serif; width:100%; height:16mm; margin:0; padding:0 15.9mm 8mm 15.9mm; box-sizing:border-box; display:flex; justify-content:space-between; align-items:flex-end; -webkit-print-color-adjust:exact;">
                <span style="flex:1;text-align:center;">${fT}</span>
                <span>第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</span>
            </div>`;

        const pdfBuffer = await page.pdf({
            format: 'a4', printBackground: true,
            margin: { top: '29mm', right: '15.9mm', bottom: '16mm', left: '15.9mm' },
            displayHeaderFooter: true,
            headerTemplate: headerTemplateHtml,
            footerTemplate: footerTemplateHtml,
            preferCSSPageSize: true
        });
        return pdfBuffer;
    } finally {
        await page.close();
    }
}

// v2.4.11：请求去重 — 浏览器自动重发时跳过重复请求
let lastRequestBody = '';
let lastRequestTime = 0;
const DEDUP_WINDOW_MS = 30000; // 30 秒内的相同请求视为重复

const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // v2.5.0：允许 X-Response-Type 自定义头部（用于 base64 JSON 响应模式）
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Response-Type');
    // v2.4.11：关闭 keep-alive，防止浏览器在等待 PDF 响应时复用连接发送后续请求导致数据混乱
    res.setHeader('Connection', 'close');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // Health check
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    // PDF generation API
    if (req.url === '/api/generate-pdf' && req.method === 'POST') {
        // v2.4.11：用 Buffer.concat 收集分片，避免多字节UTF-8字符跨chunk被截断
        const chunks = [];
        let totalLen = 0;
        req.on('data', chunk => { chunks.push(chunk); totalLen += chunk.length; if (totalLen > 50e6) req.destroy(); });
        req.on('end', async () => {
            try {
                const body = Buffer.concat(chunks).toString('utf8');
                // v2.4.11：调试日志 — 记录 chunk 数、字节长度、字符串长度
                console.log(`[Server] 收到请求: chunks=${chunks.length}, bytes=${totalLen}, bodyLen=${body.length}`);
                // v2.4.11：去重检查 — 30 秒内的相同请求体视为浏览器自动重发，返回 204 跳过
                const now = Date.now();
                if (body === lastRequestBody && (now - lastRequestTime) < DEDUP_WINDOW_MS) {
                    console.log(`[Server] 跳过重复请求 (${now - lastRequestTime}ms 内)`);
                    res.writeHead(204, { 'Connection': 'close' });
                    res.end();
                    return;
                }
                lastRequestBody = body;
                lastRequestTime = now;
                // v2.4.11：提取 JSON 子串（从第一个 { 到最后一个 }），防止代理/浏览器在 body 末尾追加额外字符
                const jsonStart = body.indexOf('{');
                const jsonEnd = body.lastIndexOf('}');
                let parsed;
                if (jsonStart >= 0 && jsonEnd > jsonStart) {
                    const jsonStr = body.substring(jsonStart, jsonEnd + 1);
                    try {
                        parsed = JSON.parse(jsonStr);
                    } catch (parseErr) {
                        const pos = parseInt(parseErr.message.match(/position (\d+)/)?.[1] || '-1');
                        const charCodes = [];
                        for (let i = Math.max(0, pos - 5); i < Math.min(jsonStr.length, pos + 5); i++) {
                            charCodes.push(`${jsonStr[i]}(0x${jsonStr.charCodeAt(i).toString(16)})`);
                        }
                        console.error(`[Server] JSON解析失败: ${parseErr.message}`);
                        console.error(`[Server] jsonStrLen=${jsonStr.length}, pos=${pos}, charCodes: ${charCodes.join(' ')}`);
                        throw parseErr;
                    }
                } else {
                    throw new Error('请求体中未找到有效 JSON');
                }
                const { text, font, fontValue, fontDataUrl, gridType, gridColorPreset, traceOpacity } = parsed;
                if (!text || !text.trim()) {
                    res.writeHead(400, { 'Content-Type': 'application/json', 'Connection': 'close' });
                    res.end(JSON.stringify({ error: '文本不能为空' }));
                    return;
                }
                console.log(`[Server] 生成PDF: ${text.length}字, 字体=${font}, 网格=${gridType || '默认'}, 颜色=${gridColorPreset || '默认'}, 自定义字体=${fontDataUrl ? '是' : '否'}`);

                // v2.5.2：如果有自定义字体数据，保存到临时文件供页面加载
                let tempFontPath = null;
                if (fontDataUrl && fontValue) {
                    try {
                        const base64Data = fontDataUrl.split(',')[1];
                        if (base64Data) {
                            tempFontPath = path.join(DIST_DIR, 'temp-custom-font.ttf');
                            fs.writeFileSync(tempFontPath, Buffer.from(base64Data, 'base64'));
                            console.log(`[Server] 自定义字体已保存: ${fontValue} (${(base64Data.length * 0.75 / 1024 / 1024).toFixed(1)}MB)`);
                        }
                    } catch(e) {
                        console.warn(`[Server] 自定义字体保存失败: ${e.message}`);
                        tempFontPath = null;
                    }
                }

                const pdfBuffer = await generatePDF(text, font || '文鼎楷体', fontValue || '', tempFontPath, gridType, gridColorPreset, traceOpacity);

                // 清理临时字体文件
                if (tempFontPath) {
                    try { fs.unlinkSync(tempFontPath); } catch(e) {}
                }
                const encodedName = encodeURIComponent('字帖.pdf');

                // v2.4.19：支持 base64 JSON 响应模式，避免 IDM 等下载插件拦截
                // 当客户端发送 X-Response-Type: json 头部时，返回 JSON 格式的 base64 PDF
                const wantsJson = req.headers['x-response-type'] === 'json';
                if (wantsJson) {
                    const base64Data = pdfBuffer.toString('base64');
                    const jsonResponse = JSON.stringify({ success: true, data: base64Data });
                    res.writeHead(200, {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Content-Length': Buffer.byteLength(jsonResponse),
                        'Connection': 'close'
                    });
                    res.end(jsonResponse);
                    console.log(`[Server] PDF生成成功 (JSON模式, ${(base64Data.length / 1024).toFixed(1)}KB base64)`);
                } else {
                    // 直接返回 PDF（兼容旧版客户端）
                    res.writeHead(200, {
                        'Content-Type': 'application/pdf',
                        'Content-Length': pdfBuffer.length,
                        'Content-Disposition': `attachment; filename="calligraphy.pdf"; filename*=UTF-8''${encodedName}`,
                        'Connection': 'close'
                    });
                    res.end(pdfBuffer);
                    console.log('[Server] PDF生成成功 (直接模式)');
                }
            } catch (err) {
                console.error('[Server] PDF生成失败:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json', 'Connection': 'close' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // Static file serving from dist/
    if (req.method === 'GET') {
        let urlPath = req.url === '/' ? '/index.html' : req.url;
        urlPath = decodeURIComponent(urlPath.split('?')[0]);
        const filePath = path.join(DIST_DIR, urlPath);
        if (filePath.startsWith(DIST_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
            return;
        }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

// v2.4.11：端口占用错误处理 — 显示清晰提示而非闪退
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error('');
        console.error('═══════════════════════════════════════════════════');
        console.error(`  [错误] 端口 ${PORT} 已被占用！`);
        console.error('  可能原因：另一个 Puppeteer 服务已在运行。');
        console.error('  解决方法：');
        console.error('    1. 关闭其他正在运行的 Puppeteer 服务窗口');
        console.error(`    2. 或在任务管理器中结束占用端口 ${PORT} 的进程`);
        console.error('═══════════════════════════════════════════════════');
        console.error('');
    } else {
        console.error('[Server 启动错误]', err.message);
    }
    process.exit(1);
});

server.listen(PORT, async () => {
    console.log('═══════════════════════════════════════════════════');
    console.log('  字帖生成器 Puppeteer 服务已启动');
    console.log(`  地址: http://localhost:${PORT}`);
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log('  使用方法:');
    console.log('    1. 在浏览器中打开上方地址');
    console.log('    2. 输入汉字 → 点击"生成字帖"');
    console.log('    3. 点击页面上的 Puppeteer 按钮生成矢量PDF');
    console.log('');
    console.log('  按 Ctrl+C 退出服务');
    console.log('');

    // Auto-open browser
    const openCmd = process.platform === 'win32' ? 'start' :
                    process.platform === 'darwin' ? 'open' : 'xdg-open';
    require('child_process').exec(`${openCmd} http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
    if (browserInstance) await browserInstance.close();
    process.exit(0);
});
