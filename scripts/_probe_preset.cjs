// 临时诊断：块帖 + 预设场景文本，笔画信息是否缺失（用后即删）
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const logs = [];
    page.on('console', m => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
    page.on('pageerror', e => logs.push(`[PAGEERROR] ${String(e && e.message).slice(0, 300)}`));
    const target = 'http://localhost:4189/';
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    // 切到块帖
    await page.click('#layout-toggle-btn');
    await new Promise(r => setTimeout(r, 3000));

    // 模拟预设场景切换：填入一首诗（20 字）→ 触发 sidebar-updated 同款重生成
    const poem = '床前明月光疑是地上霜举头望明月低头思故乡';
    await page.evaluate((t) => {
        const el = document.getElementById('inputText');
        el.value = t;
        document.dispatchEvent(new CustomEvent('calligraphy:sidebar-updated'));
    }, poem);
    await new Promise(r => setTimeout(r, 4000));

    const snap1 = await page.evaluate(() => {
        const blocks = [...document.querySelectorAll('.bt-block')];
        const pillsOk = blocks.filter(b => /^\d+画$/.test((b.querySelector('.bt-info .bt-pill') || {}).textContent || '')).length;
        const stripsWithSvg = [...document.querySelectorAll('.bt-stroke-strip')].filter(s => s.querySelector('svg')).length;
        const realBlocks = blocks.filter(b => b.getAttribute('data-char')).length;
        return {
            blocks: blocks.length, realBlocks, pillsOk, stripsWithSvg,
            stripTotal: document.querySelectorAll('.bt-stroke-strip').length,
            queue: window.__getStrokeQueueStatus ? window.__getStrokeQueueStatus() : '(n/a)',
            stored: (localStorage.getItem('calligraphy_settings') || '').includes('block-table') ? 'block-table' : '?',
        };
    });
    console.log('T+4s AFTER PRESET:', JSON.stringify(snap1));

    // 再等 8s（串行队列需要时间）
    await new Promise(r => setTimeout(r, 8000));
    const snap2 = await page.evaluate(() => ({
        pillsOk: [...document.querySelectorAll('.bt-block')].filter(b => /^\d+画$/.test((b.querySelector('.bt-info .bt-pill') || {}).textContent || '')).length,
        stripsWithSvg: [...document.querySelectorAll('.bt-stroke-strip')].filter(s => s.querySelector('svg')).length,
        queue: window.__getStrokeQueueStatus ? window.__getStrokeQueueStatus() : '(n/a)',
    }));
    console.log('T+12s:', JSON.stringify(snap2));

    // 再切另一个"预设"（模拟来回切换）
    await page.evaluate(() => {
        const el = document.getElementById('inputText');
        el.value = '人之初性本善性相近习相远苟不教性乃迁教之道贵以专';
        document.dispatchEvent(new CustomEvent('calligraphy:sidebar-updated'));
    });
    await new Promise(r => setTimeout(r, 12000));
    const snap3 = await page.evaluate(() => ({
        pillsOk: [...document.querySelectorAll('.bt-block')].filter(b => /^\d+画$/.test((b.querySelector('.bt-info .bt-pill') || {}).textContent || '')).length,
        stripsWithSvg: [...document.querySelectorAll('.bt-stroke-strip')].filter(s => s.querySelector('svg')).length,
        queue: window.__getStrokeQueueStatus ? window.__getStrokeQueueStatus() : '(n/a)',
    }));
    console.log('AFTER 2ND PRESET +12s:', JSON.stringify(snap3));

    console.log('--- CONSOLE (last 25) ---');
    logs.slice(-25).forEach(l => console.log(l));
    await browser.close();
})().catch(e => { console.error('PROBE-FATAL', e && e.message); process.exit(1); });
