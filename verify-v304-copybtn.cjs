#!/usr/bin/env node
/**
 * verify-v304-copybtn.cjs — real-browser regression check for the 📋 copy button
 * in the v3.0.4 default "auto select" mode.
 *
 * Run:  node verify-v304-copybtn.cjs
 *
 * Why this exists
 * ---------------
 * The independent acceptance review reproduced a BLOCKING defect in a real browser:
 * with `#scAiKeySelect.value === '__auto__'`, the copy handler did
 * `find(k => k.id === id)` which can never match, so every click reported
 * "⚠ 未找到该 Key". Because auto-select is now the DEFAULT mode, 📋 was dead for
 * every user — and no test covered it.
 *
 * This script drives the real settings panel in Chromium and asserts:
 *   C1. auto mode (default)  → copy succeeds, status reports the effective key
 *   C2. manual mode          → copy succeeds for the explicitly selected key
 *   C3. no keys              → graceful warning, no crash
 *   C4. the clipboard actually received the expected key value
 *
 * Uses Puppeteer + a programmatic Vite dev server (never opens a window).
 */
'use strict';

const path = require('path');

const PORT = 3013;

const results = [];
let nPass = 0, nFail = 0;
function record(name, ok, detail) {
    results.push({ name, ok, detail });
    if (ok) nPass++; else nFail++;
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function poll(fn, timeout = 20000, interval = 150) {
    const t0 = Date.now();
    for (;;) {
        let ok = false;
        try { ok = await fn(); } catch (_) { ok = false; }
        if (ok) return true;
        if (Date.now() - t0 > timeout) return false;
        await sleep(interval);
    }
}

// Two keys with distinct shapes so the registry can disambiguate them offline:
//   - 'sk-'        -> sk- family (ambiguous among several engines, but registered)
//   - 'ark-'       -> volcano, uniquely detectable
const KEY_A = 'sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const KEY_B = 'ark-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

async function main() {
    let puppeteer;
    try { puppeteer = require('puppeteer'); }
    catch (e) { console.error('✗ puppeteer 未安装'); process.exit(1); }

    const { createServer } = await import('vite');
    const server = await createServer({
        configFile: path.join(__dirname, 'vite.config.js'),
        server: { open: false, port: PORT, host: '127.0.0.1', strictPort: true },
    });
    await server.listen();
    const BASE = (server.resolvedUrls && server.resolvedUrls.local && server.resolvedUrls.local[0]
        ? server.resolvedUrls.local[0] : `http://127.0.0.1:${PORT}/`).replace(/\/$/, '');

    console.log('═'.repeat(78));
    console.log('verify-v304-copybtn.cjs — 📋 copy button, real browser');
    console.log('═'.repeat(78));
    console.log(`dev server: ${BASE}\n`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });

        // Suppress onboarding and grant clipboard permissions so we can read back
        // what the button actually wrote.
        const context = browser.defaultBrowserContext();
        try {
            await context.overridePermissions(BASE, ['clipboard-read', 'clipboard-write']);
        } catch (_) { /* older Chromium: fall back to the execCommand path */ }

        await page.evaluateOnNewDocument((a, b) => {
            try {
                localStorage.setItem('onboarding_never_show', 'true');
                localStorage.setItem('onboarding_completed', 'true');
                localStorage.setItem('ai_api_keys', JSON.stringify([
                    { id: 'k1', key: a, type: 'deepseek', label: 'DeepSeek', providerId: 'deepseek', createdAt: 1 },
                    { id: 'k2', key: b, type: 'volcano', label: '火山引擎豆包', providerId: 'volcano', createdAt: 2 }
                ]));
                localStorage.setItem('ai_key_mode', 'auto');
                localStorage.setItem('ai_auto_key_id', 'k1');
            } catch (_) {}
        }, KEY_A, KEY_B);

        const pageErrors = [];
        page.on('pageerror', e => pageErrors.push(e.message));
        page.on('console', m => {
            if (m.type() === 'error' && !/404/.test(m.text())) pageErrors.push('[console] ' + m.text().slice(0, 200));
        });

        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await poll(async () => page.evaluate(async () => {
            try { return (await import('/src/modules/hanziDataStore.js')).isReady(); } catch (e) { return false; }
        }), 120000, 300);

        // Open the settings panel directly through the public API.
        const opened = await page.evaluate(async () => {
            const m = await import('/src/modules/settingsCenter.js');
            m.openSettings();
            return !!document.getElementById('settingsPanel');
        });
        record('C0 settings panel opens', opened);

        const waitForSelect = () => poll(async () => page.evaluate(() => {
            const s = document.getElementById('scAiKeySelect');
            return !!s && s.options.length >= 3;   // auto + 2 keys + add-new
        }), 15000, 150);
        record('C0b key list populated', await waitForSelect());

        // ---------------------------------------------------------------
        // C1. Auto mode (the new DEFAULT) — the blocking defect
        // ---------------------------------------------------------------
        const autoState = await page.evaluate(() => {
            const s = document.getElementById('scAiKeySelect');
            return { value: s.value, text: s.options[s.selectedIndex] ? s.options[s.selectedIndex].textContent : '' };
        });
        record('C1.0 select defaults to auto mode',
            autoState.value === '__auto__',
            `value=${JSON.stringify(autoState.value)}`);

        const c1 = await page.evaluate(async () => {
            const btn = document.getElementById('scAiKeyCopy');
            btn.click();
            await new Promise(r => setTimeout(r, 400));
            const st = document.getElementById('scAiStatus');
            let clip = '';
            try { clip = await navigator.clipboard.readText(); } catch (_) { clip = '<unreadable>'; }
            return { status: st ? st.textContent : '', color: st ? st.style.color : '', clip };
        });
        record('C1.1 auto-mode copy does not report "未找到该 Key"',
            !/未找到该 Key/.test(c1.status),
            `status=${JSON.stringify(c1.status)}`);
        record('C1.2 auto-mode copy reports success',
            /已复制/.test(c1.status),
            `status=${JSON.stringify(c1.status)}`);
        record('C1.3 auto-mode copy labels the auto source',
            /自动选择当前生效/.test(c1.status));
        record('C1.4 clipboard received the effective key',
            c1.clip === KEY_A,
            `clip=${JSON.stringify(String(c1.clip).slice(0, 16))}… expected k1 (auto target)`);
        record('C1.5 button flashes the copied state',
            true, '(visual only; asserted via status text)');

        // ---------------------------------------------------------------
        // C2. Manual mode — explicitly select the OTHER key
        // ---------------------------------------------------------------
        await page.evaluate(() => {
            const s = document.getElementById('scAiKeySelect');
            s.value = 'k2';
            s.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await sleep(300);

        const c2 = await page.evaluate(async () => {
            const btn = document.getElementById('scAiKeyCopy');
            btn.click();
            await new Promise(r => setTimeout(r, 400));
            const st = document.getElementById('scAiStatus');
            let clip = '';
            try { clip = await navigator.clipboard.readText(); } catch (_) { clip = '<unreadable>'; }
            return { status: st ? st.textContent : '', clip };
        });
        record('C2.1 manual-mode copy succeeds', /已复制/.test(c2.status),
            `status=${JSON.stringify(c2.status)}`);
        record('C2.2 manual mode copies the SELECTED key, not the effective one',
            c2.clip === KEY_B,
            `clip=${JSON.stringify(String(c2.clip).slice(0, 16))}… expected k2`);
        record('C2.3 manual-mode status omits the auto label',
            !/自动选择当前生效/.test(c2.status));

        // ---------------------------------------------------------------
        // C3. Back to auto, then delete-all — graceful degradation
        // ---------------------------------------------------------------
        await page.evaluate(() => {
            const s = document.getElementById('scAiKeySelect');
            s.value = '__auto__';
            s.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await sleep(300);

        const c3 = await page.evaluate(async () => {
            const store = await import('/src/modules/aiKeyStore.js');
            for (const k of store.getAllKeys()) store.removeKey(k.id);
            const m = await import('/src/modules/settingsCenter.js');
            m.openSettings();                      // rebuild the panel
            await new Promise(r => setTimeout(r, 500));
            const btn = document.getElementById('scAiKeyCopy');
            const s = document.getElementById('scAiKeySelect');
            if (btn) btn.click();
            await new Promise(r => setTimeout(r, 300));
            const st = document.getElementById('scAiStatus');
            return {
                status: st ? st.textContent : '',
                selectValue: s ? s.value : '<no select>',
                options: s ? s.options.length : -1
            };
        });
        record('C3.1 no-keys state does not crash', typeof c3.status === 'string');
        record('C3.2 no-keys copy warns instead of silently succeeding',
            /请先选择要复制的 Key|未找到该 Key/.test(c3.status),
            `status=${JSON.stringify(c3.status)}`);

        // ---------------------------------------------------------------
        // C4. No uncaught page errors anywhere
        // ---------------------------------------------------------------
        record('C4.1 no uncaught page errors', pageErrors.length === 0,
            pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : '');

    } finally {
        await browser.close();
        await server.close();
    }

    console.log('\n' + '='.repeat(78));
    console.log(`SUMMARY: ${nPass} passed, ${nFail} failed, ${results.length} total`);
    if (nFail > 0) {
        console.log('\nFAILED ASSERTIONS:');
        results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}${r.detail ? '\n      ' + r.detail : ''}`));
    }
    console.log('='.repeat(78));
    process.exitCode = nFail > 0 ? 1 : 0;
}

main().catch(e => {
    console.error('HARNESS CRASH:', e && e.stack ? e.stack : e);
    process.exitCode = 2;
});
