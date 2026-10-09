#!/usr/bin/env node
/**
 * shot-touch.cjs — 触屏视口快照（诊断用，非关口）
 *   node scripts/shot-touch.cjs --url file:///.../dist/index.html --out _shots [--w 390 --h 844]
 *     [--dismiss-onboarding]  走完/跳过引导后再拍，看常态界面
 *   两种状态都拍：initial / no-onboarding
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const puppeteer = require('puppeteer');
const ROOT = path.resolve(__dirname, '..');

function findChrome() {
    const c = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(c)) for (const v of fs.readdirSync(c)) {
        const p = path.join(c, v, 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(p)) return p;
    }
    return puppeteer.executablePath();
}
const A = process.argv.slice(2);
const val = (f, d) => { const i = A.indexOf(f); return i >= 0 && A[i + 1] ? A[i + 1] : d; };
const url = val('--url', 'file://' + path.join(ROOT, 'dist', 'index.html').replace(/\\/g, '/'));
const out = val('--out', path.join(ROOT, '_shots'));
const w = +val('--w', 390), h = +val('--h', 844);
const full = A.includes('--full');

(async () => {
    if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });
    const b = await puppeteer.launch({ executablePath: findChrome(), headless: 'shell',
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const p = await b.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1,
        isMobile: !A.includes('--desktop'), hasTouch: !A.includes('--desktop') });
    await p.goto(url, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => { const g = document.getElementById('grid-container'); return g && g.children.length > 0; }, { timeout: 40000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 900));
    const tag = `${w}x${h}`;
    await p.screenshot({ path: path.join(out, `init-${tag}.png`), fullPage: false });
    // 关掉引导
    const r = await p.evaluate(() => {
        const skip = document.querySelector('.ob-btn-skip');
        if (skip) skip.click();
        const closers = document.querySelectorAll('.ob-close, .ob-skip, [aria-label=关闭]');
        closers.forEach(c => c.click());
        document.querySelectorAll('.ob-overlay, .ob-bubble, .ob-spotlight, #onboarding-root *').forEach(e => e.remove());
        return { hadSkip: !!skip, left: document.querySelectorAll('.ob-bubble').length };
    });
    await new Promise(r2 => setTimeout(r2, 500));
    // 等 toast 自然消失（引导跳过 toast 时长 3s），否则挡住头部看不清
    await p.waitForFunction(() => !document.querySelector('.puppeteer-toast'), { timeout: 6000 }).catch(() => {});
    await p.screenshot({ path: path.join(out, `clean-${tag}.png`), fullPage: full });
    console.log('引导已移除:', JSON.stringify(r));
    console.log('输出:', out);
    await b.close();
})().catch(e => { console.error(e); process.exit(1); });
