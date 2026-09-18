#!/usr/bin/env node
/**
 * verify-v304-file-protocol.cjs — regression suite for double-click (file://) launching.
 *
 * Background
 * ----------
 * Double-clicking 字帖生成器.html showed "⚠️ 无法加载字帖生成器" even though
 * dist/index.html existed and worked. Three causes, all measured:
 *   1. the launcher registered its iframe `load` listener AFTER the iframe tag, so an
 *      already-loaded iframe left the flag false (race);
 *   2. it waited only 1500 ms, but dist/index.html needs ~6000 ms under file://
 *      (hanzi-data-embedded.js alone is 16.4 MB) — so it fired on essentially every machine;
 *   3. once shown, the error tip was permanent (the iframe was hidden and never restored),
 *      so a slow-but-successful load stayed masked forever.
 * Additionally, a `load` event CANNOT detect a missing file: Chrome fires `load` for its
 * own error page. The fix therefore waits for an explicit readiness beacon posted by the
 * app (see src/main.js) and uses a timeout only as a backstop.
 *
 * Run: node verify-v304-file-protocol.cjs
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('node:url');

const ROOT = __dirname;
const LAUNCHER = path.join(ROOT, '字帖生成器.html');
const LAUNCHER_URL = pathToFileURL(LAUNCHER).href;
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = 3033;

const rows = [];
let nPass = 0, nFail = 0;
function record(name, ok, detail) {
    rows.push({ name, ok, detail: detail || '' });
    if (ok) nPass++; else nFail++;
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json'
};
function staticServer() {
    return new Promise(res => {
        const s = http.createServer((req, r) => {
            const url = decodeURIComponent(req.url.split('?')[0]);
            const p = path.join(DIST_DIR, url === '/' ? 'index.html' : url);
            if (!p.startsWith(DIST_DIR)) { r.writeHead(403); return r.end(); }
            fs.readFile(p, (e, buf) => {
                if (e) { r.writeHead(404); return r.end('404'); }
                r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
                r.end(buf);
            });
        });
        s.listen(PORT, '127.0.0.1', () => res(s));
    });
}

async function main() {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
        headless: 'new', protocolTimeout: 600000,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const server = await staticServer();
    let tempLauncher = null;

    const newPage = async () => {
        const page = await browser.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push('pageerror: ' + e.message));
        page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 180)); });
        return { page, errs };
    };
    const state = (page) => page.evaluate(() => {
        const f = document.getElementById('app-frame');
        const l = document.getElementById('loading-tip');
        const t = document.getElementById('fallback-tip');
        return {
            frame: f ? getComputedStyle(f).display : 'n/a',
            loading: l ? getComputedStyle(l).display : 'n/a',
            tip: t ? getComputedStyle(t).display : 'n/a',
            elapsed: (document.getElementById('loading-elapsed') || {}).textContent
        };
    });

    console.log('═'.repeat(78));
    console.log('verify-v304-file-protocol.cjs — double-click (file://) launch regression');
    console.log('═'.repeat(78));

    // ─────────────────────────────────────────────────────────────
    // A. The real launcher under file:// must show the APP, not the error
    // ─────────────────────────────────────────────────────────────
    console.log('\n### A. launcher under file:// (the reported bug)');
    {
        const { page, errs } = await newPage();
        // Use domcontentloaded, not load: the launcher's own `load` waits for the 3.5 MB
        // iframe, by which time the app has already beaconed. We need to sample the
        // launcher's initial state BEFORE that.
        await page.goto(LAUNCHER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Immediately after DOM ready: the user must never see a blank page.
        // Either the loading indicator is up, or the app has already beaconed and is shown.
        // (The app beacons at ~0.5 s — right after its synchronous init — so the loading
        //  indicator is intentionally short-lived; asserting it is *still* up would be wrong.)
        const early = await state(page);
        const notBlank = early.loading !== 'none' || early.frame !== 'none';
        record('A1 never a blank page (loading tip or app visible)',
            notBlank, `loading=${early.loading} frame=${early.frame} tip=${early.tip}`);
        record('A2 error tip NOT shown prematurely', early.tip === 'none', `tip=${early.tip}`);

        // Wait for the readiness beacon to switch to the app
        let switched = false;
        for (let i = 0; i < 90; i++) {
            const s = await state(page);
            if (s.frame === 'block') { switched = true; break; }
            await sleep(1000);
        }
        const after = await state(page);
        record('A3 app becomes visible (readiness beacon received)', switched,
            `frame=${after.frame} loading=${after.loading} tip=${after.tip} waited≈${after.elapsed}s`);
        record('A4 error tip stays hidden on success', after.tip === 'none', `tip=${after.tip}`);
        record('A5 loading indicator hidden on success', after.loading === 'none', `loading=${after.loading}`);

        // The app inside the iframe must actually work
        const inner = await page.frames().find(f => /dist\/index\.html/.test(f.url()));
        record('A6 iframe navigated to dist/index.html', !!inner, inner ? inner.url().slice(-40) : 'not found');
        if (inner) {
            await inner.evaluate(() => {
                const ta = document.getElementById('inputText');
                ta.value = '融燕';
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                document.getElementById('generate-btn').click();
            });
            await sleep(6000);
            const g = await inner.evaluate(() => ({
                cells: document.querySelectorAll('.grid-svg-cell[data-char]').length,
                fonts: document.fonts ? document.fonts.size : -1
            }));
            record('A7 app functional inside the launcher iframe (grid rendered)',
                g.cells > 0, `cells=${g.cells} fonts=${g.fonts}`);

            const stroke = await inner.evaluate(async () => {
                const c = document.querySelector('.grid-svg-cell[data-char]');
                if (!c) return 'no cell';
                c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                await new Promise(r => setTimeout(r, 3000));
                return { overlay: !!document.querySelector('.sd-overlay'), windows: document.querySelectorAll('.sd-window').length };
            });
            record('A8 stroke demo opens inside the launcher iframe',
                stroke && stroke.windows > 0, JSON.stringify(stroke));
        }
        record('A9 no page errors under file://', errs.length === 0,
            errs.length ? [...new Set(errs)].slice(0, 3).join(' | ') : '');
        await page.close();
    }

    // ─────────────────────────────────────────────────────────────
    // B. A genuinely missing dist/index.html MUST still be reported
    // ─────────────────────────────────────────────────────────────
    console.log('\n### B. missing dist/index.html must still be detected');
    {
        // Variant launcher: bogus src + short timeout so the test does not wait 30 s.
        let html = fs.readFileSync(LAUNCHER, 'utf8');
        html = html.replace('src="dist/index.html"', 'src="dist/__MISSING__.html"');
        html = html.replace('READY_TIMEOUT_MS = 30000', 'READY_TIMEOUT_MS = 3000');
        tempLauncher = path.join(ROOT, '_tmp_launcher_missing.html');
        fs.writeFileSync(tempLauncher, html, 'utf8');

        const { page } = await newPage();
        await page.goto(pathToFileURL(tempLauncher).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // Before the timeout fires, the loading indicator must be visible (proves the
        // "no blank screen" behaviour holds in the failure path too).
        const early = await state(page);
        record('B0 loading indicator visible while waiting (failure path)',
            early.loading !== 'none', `loading=${early.loading} tip=${early.tip}`);
        let shown = false;
        for (let i = 0; i < 15; i++) {
            const s = await state(page);
            if (s.tip === 'block') { shown = true; break; }
            await sleep(1000);
        }
        const s = await state(page);
        record('B1 missing file IS reported (no false negative)', shown,
            `tip=${s.tip} frame=${s.frame}`);
        record('B2 retry button present', await page.evaluate(() => !!document.getElementById('retry-btn')));
        await page.close();
    }

    // ─────────────────────────────────────────────────────────────
    // C. Guide links must be relative (break under file:// AND GH Pages subpath)
    // ─────────────────────────────────────────────────────────────
    console.log('\n### C. guide links are relative');
    {
        const srcHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        const distHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
        const abs = (h) => (h.match(/href="\/[^"]*"/g) || []);
        record('C1 source has no absolute href', abs(srcHtml).length === 0, JSON.stringify(abs(srcHtml)));
        record('C2 built output has no absolute href', abs(distHtml).length === 0, JSON.stringify(abs(distHtml)));
        const rel = (distHtml.match(/href="\.\/[^"]*guide[^"]*"/g) || []);
        record('C3 all three guide links are relative', rel.length === 3, JSON.stringify(rel));

        // They must actually resolve under file:// from dist/
        const { page } = await newPage();
        const r = await page.evaluate(async (base) => {
            const names = ['api-key-guide.html', 'import-guide.html', 'stroke-demo-guide.html'];
            return names.map(n => ({ n, exists: true }));   // resolved on disk below
        }, '');
        const onDisk = ['api-key-guide.html', 'import-guide.html', 'stroke-demo-guide.html']
            .map(n => ({ n, exists: fs.existsSync(path.join(DIST_DIR, n)) }));
        record('C4 all guide files exist in dist/', onDisk.every(x => x.exists), JSON.stringify(onDisk));
        await page.close();
    }

    // ─────────────────────────────────────────────────────────────
    // D. Non-regression: same app over http:// still works
    // ─────────────────────────────────────────────────────────────
    console.log('\n### D. non-regression over http://');
    {
        const { page, errs } = await newPage();
        await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 180000 });
        await page.evaluate(() => {
            const ta = document.getElementById('inputText');
            ta.value = '融燕';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('generate-btn').click();
        });
        await sleep(7000);
        const g = await page.evaluate(() => ({
            cells: document.querySelectorAll('.grid-svg-cell[data-char]').length,
            fonts: document.fonts ? document.fonts.size : -1,
            ready: !!document.querySelector('.grid-svg-cell[data-char]')
        }));
        record('D1 app works over http:// (grid rendered)', g.cells > 0, `cells=${g.cells} fonts=${g.fonts}`);
        record('D2 no page errors over http://', errs.length === 0,
            errs.length ? [...new Set(errs)].slice(0, 3).join(' | ') : '');

        // Prove the PWA was NOT broken by switching to manual registration.
        let sw = null;
        for (let i = 0; i < 20; i++) {
            sw = await page.evaluate(async () => {
                try {
                    const r = await navigator.serviceWorker.getRegistration();
                    return r ? { scope: r.scope, active: !!(r.active || r.installing || r.waiting) } : null;
                } catch (e) { return { error: String(e.message) }; }
            });
            if (sw && sw.active) break;
            await sleep(1000);
        }
        record('D3 Service Worker still registers over http:// (PWA intact)',
            !!(sw && sw.active), JSON.stringify(sw));

        await page.close();
    }

    await browser.close();
    server.close();
    if (tempLauncher && fs.existsSync(tempLauncher)) fs.unlinkSync(tempLauncher);

    console.log('\n' + '='.repeat(78));
    console.log(`SUMMARY: ${nPass} passed, ${nFail} failed, ${rows.length} total`);
    if (nFail > 0) {
        console.log('\nFAILED ASSERTIONS:');
        rows.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}\n      ${r.detail}`));
    }
    console.log('='.repeat(78));
    process.exitCode = nFail > 0 ? 1 : 0;
}

main().catch(e => { console.error('HARNESS CRASH:', e && e.stack || e); process.exitCode = 2; });
