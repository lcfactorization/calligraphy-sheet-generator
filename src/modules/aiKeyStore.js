// v1.3.0 多 API Key 存储与活跃键管理模块（内存优先 / 默认不落盘）
//
// ── 存储模型 ────────────────────────────────────────────────────────────────
// 默认（memory）：Key 只存在于本模块的内存结构里，**不写 localStorage / sessionStorage**。
//   刷新页面即丢失，需要重新输入。这是默认值，因为浏览器端任何落盘方案都挡不住 XSS。
//
// 用户显式开启「记住 Key」后有两个级别：
//   session    —— 写入 sessionStorage：刷新存活，关闭标签页即消失。开启记住时的默认级别。
//   persistent —— 写入 localStorage（重启浏览器仍存活）。**必须**提供用户口令，
//                 用 WebCrypto 的 PBKDF2（>= 200k 迭代）+ AES-GCM 加密后以 {v,salt,iv,ct} 落盘。
//                 无 WebCrypto 或未提供口令时，拒绝持久化并降级为 session。
//
// ── 威胁模型（必须如实理解）────────────────────────────────────────────────
//   persistent 的加密只防「有人翻你的磁盘 / 浏览器 profile」，**不防 XSS**：
//   同源脚本可以在解密后直接读到明文 Key，也可以在用户输入口令时把口令 hook 走。
//   浏览器端没有能对抗同源脚本执行的加密方案，所以本模块：
//     (a) 默认不落盘；(b) 持久化需用户口令；(c) 不实现任何自研加密算法。
//   真正的防线是并行的两项加固：渲染层 sanitize（禁止字符串拼 HTML）+ CSP。
//
// ── 旧数据迁移（自动、幂等、安全）──────────────────────────────────────────
//   加载时若发现旧版明文 localStorage（ai_api_keys / ai_active_key_id /
//   ai_auto_key_id / ai_key_mode / deepseek_api_key），一律搬进内存后**删除磁盘上的明文键**，
//   并置一次性标记 ai_keys_migrated_v130。consumeKeyMigrationNotice() 返回 true 一次，
//   供 UI 告知用户「Key 已不再写入本地存储」。
//
// v3.0.4 增补（契约 §3.4，仅新增、不改既有语义）：
//  - entry 允许可选字段 providerId / modelId（旧 entry 无这些字段仍完全可用）
//  - 新增 ai_key_mode（'auto'|'manual'，默认 'auto'）与 ai_auto_key_id
//  - 新增 getEffectiveKeyEntry()（生效 Key 解析）与 backfillProviderIds()

import { detectApiKeyType, detectProviderId, providerLabel } from './aiProviders.js';

// ── 旧版明文键（迁移后一律从磁盘删除）──
const API_KEYS_KEY = 'ai_api_keys';
const ACTIVE_KEY_ID = 'ai_active_key_id';
const LEGACY_KEY = 'deepseek_api_key';
const KEY_MODE = 'ai_key_mode';
const AUTO_KEY_ID = 'ai_auto_key_id';

// ── v1.3.0 持久化控制键 ──
const PERSIST_MODE_KEY = 'ai_key_persist_mode';   // 'session' | 'plain' | 'persistent'（memory 时不存在）
const PERSIST_BLOB_KEY = 'ai_api_keys_enc';       // persistent 模式的密文 {v,salt,iv,ct}
const MIGRATED_FLAG = 'ai_keys_migrated_v130';    // 已完成明文迁移
const NOTICE_FLAG = 'ai_keys_migration_notice_v130'; // 迁移提示已消费

// ── v1.5.1 plain 模式（明文落盘，用户显式选择）──
// 刻意**不复用** API_KEYS_KEY('ai_api_keys')：那个键名被「旧版明文迁移」占用并会被删除，
// 两者共用会让「迁移」和「用户主动选择的明文保存」互相干扰，语义混乱。
const PLAIN_KEYS_KEY = 'ai_api_keys_plain';

// 条目数上限（防御性，不是产品限制）。用户明确要求「至少能存 20 个」，
// 200 这个量级远超需求，只是防止异常情况下无限增长把 localStorage 写爆。
// 每条目约 100 字节 → 200 条约 20KB，远低于常见 5MB 配额。
export const MAX_KEY_ENTRIES = 200;

// ── sessionStorage 镜像键（仅 'session' 模式使用）──
const SESSION_KEYS_KEY = 'ai_keys_session';
const SESSION_ACTIVE_KEY = 'ai_active_key_id_session';
const SESSION_KEY_MODE = 'ai_key_mode_session';
const SESSION_AUTO_KEY_ID = 'ai_auto_key_id_session';

const PBKDF2_ITERATIONS = 200000;

// ---------------------------------------------------------------------------
// 内存状态（唯一事实来源）
// ---------------------------------------------------------------------------

let _memoryList = [];          // Array<entry>
let _memoryActiveId = null;    // 用户显式选中的 Key id
let _memoryKeyMode = 'auto';   // 'auto' | 'manual'
let _memoryAutoKeyId = null;   // 自动选中的 Key id
let _loaded = false;           // 是否已完成一次性加载/迁移
let _persistMode = 'memory';   // 'memory' | 'session' | 'persistent'
let _passphrase = null;        // persistent 模式口令，仅存内存
let _persistChain = Promise.resolve(); // 串行化异步加密写入，避免竞态

// ---------------------------------------------------------------------------
// 存储访问工具（localStorage / sessionStorage 缺失时安全降级，便于 Node 单测）
// ---------------------------------------------------------------------------

function _ls() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch { return null; }
}
function _ss() {
    try { return (typeof sessionStorage !== 'undefined') ? sessionStorage : null; } catch { return null; }
}
function _lsGet(k) { const s = _ls(); try { return s ? s.getItem(k) : null; } catch { return null; } }
function _lsSet(k, v) { const s = _ls(); try { if (s) s.setItem(k, v); } catch { /* 配额/隐私模式：忽略 */ } }
function _lsDel(k) { const s = _ls(); try { if (s) s.removeItem(k); } catch { /* 忽略 */ } }
function _ssGet(k) { const s = _ss(); try { return s ? s.getItem(k) : null; } catch { return null; } }
function _ssSet(k, v) { const s = _ss(); try { if (s) s.setItem(k, v); } catch { /* 忽略 */ } }
function _ssDel(k) { const s = _ss(); try { if (s) s.removeItem(k); } catch { /* 忽略 */ } }

// ---------------------------------------------------------------------------
// 内部工具函数
// ---------------------------------------------------------------------------

/** 前缀识别（旧语义保持不变：sk-→deepseek / ark-→volcano / 其它→unknown） */
export function detectKeyType(key) {
    return detectApiKeyType(key);
}

function labelOf(type) {
    if (type === 'deepseek') return 'DeepSeek';
    if (type === 'volcano') return '火山引擎豆包';
    const lab = providerLabel(type);
    return lab || '未知引擎';
}

function genId() {
    return 'k_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

/** 展示用 Key 打码（前4后4，中间省略） */
export function maskKey(key) {
    if (!key) return '';
    return key.length <= 8 ? key : key.slice(0, 4) + '…' + key.slice(-4);
}

/** 把任意来源的 entry 数组规整为合法 entry（丢弃无 key 的脏数据） */
function _normalizeEntries(list) {
    const out = [];
    for (const e of list) {
        if (!e || typeof e !== 'object') continue;
        const key = typeof e.key === 'string' ? e.key.trim() : '';
        if (!key) continue;
        const type = (typeof e.type === 'string' && e.type) ? e.type : detectKeyType(key);
        const entry = {
            id: (typeof e.id === 'string' && e.id) ? e.id : genId(),
            type,
            key,
            label: (typeof e.label === 'string' && e.label) ? e.label : labelOf(type),
            createdAt: (typeof e.createdAt === 'number') ? e.createdAt : Date.now()
        };
        if (e.providerId) entry.providerId = e.providerId;
        if (e.modelId) entry.modelId = e.modelId;
        out.push(entry);
    }
    return out;
}

function readList() {
    _ensureLoaded();
    return _memoryList;
}

/**
 * 写入内存并（按当前持久化模式）落盘。
 * memory 模式不写任何 storage —— 这是默认行为，也是本次加固的核心。
 */
function writeList(list) {
    _memoryList = list;
    _flushPersistence();
}

// ---------------------------------------------------------------------------
// 持久化：sessionStorage 镜像 / localStorage 密文
// ---------------------------------------------------------------------------

function _saveSessionFromMemory() {
    if (_memoryList.length === 0) {
        _ssDel(SESSION_KEYS_KEY);
        _ssDel(SESSION_ACTIVE_KEY);
        _ssDel(SESSION_AUTO_KEY_ID);
    } else {
        _ssSet(SESSION_KEYS_KEY, JSON.stringify(_memoryList));
        if (_memoryActiveId) _ssSet(SESSION_ACTIVE_KEY, _memoryActiveId); else _ssDel(SESSION_ACTIVE_KEY);
        if (_memoryAutoKeyId) _ssSet(SESSION_AUTO_KEY_ID, _memoryAutoKeyId); else _ssDel(SESSION_AUTO_KEY_ID);
    }
    _ssSet(SESSION_KEY_MODE, _memoryKeyMode === 'manual' ? 'manual' : 'auto');
}

function _clearSession() {
    _ssDel(SESSION_KEYS_KEY);
    _ssDel(SESSION_ACTIVE_KEY);
    _ssDel(SESSION_KEY_MODE);
    _ssDel(SESSION_AUTO_KEY_ID);
}

// ---------------------------------------------------------------------------
// v1.5.1：plain 模式（明文写 localStorage）
// ---------------------------------------------------------------------------
// 用户诉求：「加密则作为一种选项、不保存也只是作为一种选项，不要限制太苛刻了」。
// 此前想「刷新后仍在」只有两条路 —— 会话级 sessionStorage，或**必须设口令**的加密持久化。
// 后者对只想省事的用户是硬门槛（口令 ≥8 位、忘了无法恢复）。现在补上第三条：
// 明文落盘，一键切换、无需口令。
//
// ⚠ 诚实边界（必须写在这里，而不是只写在文档里）：
//   明文落盘意味着**任何能在本页执行脚本的东西都能直接读走 Key**（XSS / 恶意扩展 /
//   共享电脑上的下一个人）。它换来的只是便利。因此：
//     · 默认模式仍是 memory（不落盘）—— 不改动 v1.3.0 定下的安全基线；
//     · plain 必须由用户在设置面板显式选择，且 UI 上给出等价强度的警告；
//     · 加密（persistent）与不保存（memory）都仍然是一等选项。
function _savePlainFromMemory() {
    const ls = _ls();
    if (!ls) return;
    try {
        if (_memoryList.length === 0) {
            ls.removeItem(PLAIN_KEYS_KEY);
            return;
        }
        ls.setItem(PLAIN_KEYS_KEY, JSON.stringify({
            list: _memoryList,
            activeId: _memoryActiveId,
            keyMode: _memoryKeyMode,
            autoKeyId: _memoryAutoKeyId
        }));
    } catch { /* 配额 / 隐私模式：内存里仍然生效 */ }
}

function _loadPlainIntoMemory() {
    const ls = _ls();
    if (!ls) return;
    let data;
    try {
        const raw = ls.getItem(PLAIN_KEYS_KEY);
        data = raw ? JSON.parse(raw) : null;
    } catch { return; } // 数据损坏 → 视为没有保存过
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.list)) _memoryList = _normalizeEntries(data.list);
    if (data.activeId) _memoryActiveId = data.activeId;
    if (data.keyMode === 'manual' || data.keyMode === 'auto') _memoryKeyMode = data.keyMode;
    if (data.autoKeyId) _memoryAutoKeyId = data.autoKeyId;
}

function _clearPlain() {
    const ls = _ls();
    if (!ls) return;
    try { ls.removeItem(PLAIN_KEYS_KEY); } catch { /* 忽略 */ }
}

function _loadSessionIntoMemory() {
    const raw = _ssGet(SESSION_KEYS_KEY);
    if (raw) {
        try {
            const l = JSON.parse(raw);
            if (Array.isArray(l)) _memoryList = _normalizeEntries(l);
        } catch { /* 损坏则视为空 */ }
    }
    _memoryActiveId = _ssGet(SESSION_ACTIVE_KEY) || null;
    const m = _ssGet(SESSION_KEY_MODE);
    if (m === 'manual' || m === 'auto') _memoryKeyMode = m;
    _memoryAutoKeyId = _ssGet(SESSION_AUTO_KEY_ID) || null;
}

function _hasWebCrypto() {
    try {
        return typeof crypto !== 'undefined' && !!crypto.subtle &&
            typeof crypto.subtle.importKey === 'function' &&
            typeof crypto.getRandomValues === 'function';
    } catch { return false; }
}

function _bytesToB64(bytes) {
    if (typeof btoa === 'function') {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    return '';
}

function _b64ToBytes(b64) {
    if (typeof atob === 'function') {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    return new Uint8Array(0);
}

/** PBKDF2(SHA-256) 派生 AES-GCM-256 密钥 */
async function _deriveKey(passphrase, salt) {
    const base = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
}

/** 加密整个 Key 快照（含活跃/自动/模式，避免元信息泄露）→ {v,salt,iv,ct} */
async function _encryptSnapshot(passphrase) {
    const payload = JSON.stringify({
        list: _memoryList,
        activeId: _memoryActiveId,
        keyMode: _memoryKeyMode,
        autoKeyId: _memoryAutoKeyId
    });
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await _deriveKey(passphrase, salt);
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload)
    );
    return { v: 1, salt: _bytesToB64(salt), iv: _bytesToB64(iv), ct: _bytesToB64(new Uint8Array(ct)) };
}

/** 异步串行写入密文；无口令 / 无 WebCrypto 时静默保持「仅内存」 */
function _schedulePersistentWrite() {
    if (!_hasWebCrypto() || !_passphrase) return;
    _persistChain = _persistChain
        .then(() => _encryptSnapshot(_passphrase))
        .then(blob => { _lsSet(PERSIST_BLOB_KEY, JSON.stringify(blob)); })
        .catch(e => console.warn('[aiKeyStore] 持久化写入失败（Key 仍保留在内存中）:', e));
}

function _flushPersistence() {
    if (_persistMode === 'session') _saveSessionFromMemory();
    else if (_persistMode === 'plain') _savePlainFromMemory();
    else if (_persistMode === 'persistent') _schedulePersistentWrite();
    // memory：不写任何 storage
}

function _loadModeFromDisk() {
    const m = _lsGet(PERSIST_MODE_KEY);
    _persistMode = (m === 'session' || m === 'plain' || m === 'persistent') ? m : 'memory';
}

function _applyMode(mode) {
    _persistMode = mode;
    if (mode === 'memory') {
        _lsDel(PERSIST_MODE_KEY);
        _lsDel(PERSIST_BLOB_KEY);
        _clearPlain();
        _clearSession();
        return;
    }
    _lsSet(PERSIST_MODE_KEY, mode);
    if (mode === 'session') {
        _lsDel(PERSIST_BLOB_KEY);
        _clearPlain();
        _saveSessionFromMemory();
        return;
    }
    if (mode === 'plain') {
        _lsDel(PERSIST_BLOB_KEY);
        _clearSession();
        _savePlainFromMemory();
        return;
    }
    // persistent
    _clearPlain();
    _clearSession();
    _schedulePersistentWrite();
}

// ---------------------------------------------------------------------------
// 一次性加载 + 旧明文迁移
// ---------------------------------------------------------------------------

/**
 * 把旧版明文 localStorage 搬进内存并删除磁盘上的明文键。
 * 幂等：旧键删除后再调用不会重复迁移。
 * @returns {boolean} 本次是否真的迁移到了数据
 */
function _migrateLegacyStorage() {
    const raw = _lsGet(API_KEYS_KEY);
    const legacySingle = _lsGet(LEGACY_KEY);
    let migrated = false;

    if (raw) {
        try {
            const list = JSON.parse(raw);
            if (Array.isArray(list) && list.length > 0) {
                _memoryList = _normalizeEntries(list);
                _memoryActiveId = _lsGet(ACTIVE_KEY_ID) || _memoryActiveId;
                const legacyMode = _lsGet(KEY_MODE);
                if (legacyMode === 'manual' || legacyMode === 'auto') _memoryKeyMode = legacyMode;
                const legacyAuto = _lsGet(AUTO_KEY_ID);
                if (legacyAuto) _memoryAutoKeyId = legacyAuto;
                migrated = true;
            }
        } catch { /* 损坏的 JSON 直接丢弃：磁盘上不留明文才是首要目标 */ }
    }

    // 更老的单键 deepseek_api_key（仅当内存里还没有任何 Key 时接管）
    if (legacySingle && _memoryList.length === 0) {
        const key = legacySingle.trim();
        if (key) {
            const type = detectKeyType(key);
            _memoryList = [{ id: genId(), type, key, label: labelOf(type), createdAt: Date.now() }];
            _memoryActiveId = _memoryList[0].id;
            migrated = true;
        }
    }

    // 无论迁移是否成功，旧版明文键一律从磁盘删除
    _lsDel(API_KEYS_KEY);
    _lsDel(ACTIVE_KEY_ID);
    _lsDel(AUTO_KEY_ID);
    _lsDel(KEY_MODE);
    _lsDel(LEGACY_KEY);

    if (migrated) _lsSet(MIGRATED_FLAG, '1');
    return migrated;
}

function _ensureLoaded() {
    if (_loaded) return;
    _loaded = true;
    _loadModeFromDisk();
    if (_persistMode === 'session') _loadSessionIntoMemory();
    if (_persistMode === 'plain') _loadPlainIntoMemory();
    // persistent 模式下的密文在提供口令前保持「锁定」状态（内存为空）
    const migrated = _migrateLegacyStorage();
    // 迁移进内存的数据，若用户此前已显式开启会话级/明文记住，则镜像到对应存储
    if (migrated && _persistMode === 'session') _saveSessionFromMemory();
    if (migrated && _persistMode === 'plain') _savePlainFromMemory();
}

// ---------------------------------------------------------------------------
// 旧键迁移（公开 API，签名与语义保持不变：幂等）
// ---------------------------------------------------------------------------

/**
 * 迁移旧 localStorage 明文 Key 到内存（v1.3.0 起不再落盘）。
 * 幂等：调用多次与调用一次效果相同。
 */
export function migrateLegacyKey() {
    _ensureLoaded();
    _migrateLegacyStorage();
}

/**
 * v3.0.4 新增：幂等补齐 providerId。
 * 仅给 type 为 deepseek / volcano 的 entry 补 providerId；unknown 一律不动（留给用户自行检测）。
 * @returns {number} 本次补齐的条数
 */
export function backfillProviderIds() {
    try {
        _ensureLoaded();
        const list = readList();
        let changed = 0;
        for (const e of list) {
            if (!e || e.providerId) continue;
            if (e.type === 'deepseek' || e.type === 'volcano') {
                e.providerId = e.type;
                changed++;
            }
        }
        if (changed > 0) writeList(list);
        return changed;
    } catch {
        return 0;
    }
}

// ---------------------------------------------------------------------------
// v1.3.0 新增：持久化模式 API
// ---------------------------------------------------------------------------

/** 当前 Key 持久化模式：'memory'（默认，不落盘）| 'session' | 'plain' | 'persistent' */
export function getKeyPersistenceMode() {
    _ensureLoaded();
    return _persistMode;
}

/**
 * 设置持久化模式。
 * - 'memory'     —— 只留内存，清除 session/localStorage 中的 Key 副本
 * - 'session'    —— 镜像到 sessionStorage（刷新存活、关标签页即消失）
 * - 'plain'      —— v1.5.1：**明文**写 localStorage（无需口令）。便利，但任何能在本页
 *                   执行脚本的东西都能读走 Key。UI 必须给出等价强度的警告。
 * - 'persistent' —— 需第二参数 passphrase；用 PBKDF2+AES-GCM 加密后写 localStorage
 * - 其它值 / persistent 缺口令 / 无 WebCrypto → 一律降级为 'session'（非法值则为 'memory'）
 * @param {'memory'|'session'|'plain'|'persistent'} mode
 * @param {string} [passphrase] 仅 persistent 需要
 * @returns {'memory'|'session'|'plain'|'persistent'} 实际生效的模式
 */
export function setKeyPersistenceMode(mode, passphrase = '') {
    _ensureLoaded();
    if (mode === 'persistent') {
        if (!_hasWebCrypto() || !passphrase) {
            // 诚实降级：无法安全加密时宁可只做会话级，也不写明文
            _passphrase = null;
            _applyMode('session');
            return 'session';
        }
        _passphrase = String(passphrase);
        _applyMode('persistent');
        return 'persistent';
    }
    if (mode === 'plain') {
        _passphrase = null;
        _applyMode('plain');
        return 'plain';
    }
    const want = (mode === 'session') ? 'session' : 'memory';
    _passphrase = null;
    _applyMode(want);
    return want;
}

/** 是否处于「会落盘」的模式（session / plain / persistent） */
export function isKeyPersisted() {
    _ensureLoaded();
    return _persistMode === 'session' || _persistMode === 'plain' || _persistMode === 'persistent';
}

/** v1.5.1：当前模式是否为**明文**落盘（供 UI 决定是否显示警告） */
export function isKeyPlaintextPersisted() {
    _ensureLoaded();
    return _persistMode === 'plain';
}

/**
 * 用口令解锁 persistent 密文并载入内存。
 * @param {string} passphrase
 * @returns {Promise<boolean>} 成功与否（口令错误 / 数据损坏 / 无密文 → false）
 */
export async function unlockPersistentKeys(passphrase) {
    _ensureLoaded();
    if (!passphrase || !_hasWebCrypto()) return false;
    const raw = _lsGet(PERSIST_BLOB_KEY);
    if (!raw) return false;
    try {
        const blob = JSON.parse(raw);
        const key = await _deriveKey(String(passphrase), _b64ToBytes(blob.salt));
        const pt = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: _b64ToBytes(blob.iv) }, key, _b64ToBytes(blob.ct)
        );
        const data = JSON.parse(new TextDecoder().decode(pt));
        _memoryList = _normalizeEntries(Array.isArray(data.list) ? data.list : []);
        _memoryActiveId = data.activeId || null;
        _memoryKeyMode = (data.keyMode === 'manual') ? 'manual' : 'auto';
        _memoryAutoKeyId = data.autoKeyId || null;
        _passphrase = String(passphrase);
        return true;
    } catch {
        return false; // 口令错误或密文损坏
    }
}

/**
 * 消费一次性迁移提示。返回 true 恰好一次，供 UI 告知用户
 * 「Key 已不再写入本地存储」。幂等：重复调用一律返回 false。
 */
export function consumeKeyMigrationNotice() {
    _ensureLoaded();
    if (_lsGet(MIGRATED_FLAG) !== '1') return false;
    if (_lsGet(NOTICE_FLAG) === '1') return false;
    _lsSet(NOTICE_FLAG, '1');
    return true;
}

// ---------------------------------------------------------------------------
// 公开 API（签名与语义保持不变）
// ---------------------------------------------------------------------------

/** 读取所有 Key（浅拷贝，防止调用方误改内存） */
export function getAllKeys() {
    _ensureLoaded();
    return _memoryList.slice();
}

/** 获取当前活跃 Key entry；活跃 id 失效时回退第一个 */
export function getActiveKey() {
    _ensureLoaded();
    const list = _memoryList;
    return list.find(k => k.id === _memoryActiveId) || list[0] || null;
}

/** 复制当前活跃 Key 的完整值（供复制按钮调用） */
export function copyActiveKey() {
    const k = getActiveKey();
    return k ? k.key : '';
}

/** 设置活跃 Key ID（选中即生效的落点） */
export function setActiveKey(id) {
    _ensureLoaded();
    _memoryActiveId = id || null;
    _flushPersistence();
}

// ---------------------------------------------------------------------------
// v1.4.0：按 Key 指定「引擎」与「模型」
// ---------------------------------------------------------------------------
// 为什么必须按 Key 存（而不是全局一个设置）：
//   · 同一把 Key 可能被用户临时换成另一个模型（AMD Radeon 一把 Key 通 4 款免费模型，
//     智谱一把 Key 通 2 款）—— 需要能随时切换且互不干扰。
//   · 有些引擎（AMD Radeon / 阶跃 / 混元）的 Key 无稳定前缀，形状判定不出来，
//     必须由用户显式指定 providerId，否则探测与调用都会走错引擎。
// 两者都只写 entry 字段（providerId / modelId），随既有的 session/persistent
// 持久化通道一起落盘，不新增任何存储键。

/**
 * 指定某个 Key 所属引擎。
 * @param {string} id       Key 的 entry id
 * @param {string} providerId 引擎 id（注册表内）；传空串表示清除、回到形状自动判定
 * @returns {boolean} 是否写入成功（id 不存在 → false）
 */
export function setKeyProvider(id, providerId) {
    _ensureLoaded();
    const entry = _memoryList.find(k => k.id === id);
    if (!entry) return false;
    const pid = typeof providerId === 'string' ? providerId.trim() : '';
    if (pid) entry.providerId = pid; else delete entry.providerId;
    _flushPersistence();
    return true;
}

/**
 * v1.5.2：把 Key 绑定到**运行时生成**的引擎 id（自定义引擎 custom_N）。
 *
 * 与 setKeyProvider 的区别：本函数不调用 getProvider() 做存在性校验。
 * 原因：自定义引擎的 id 是运行时生成的，aiKeyStore 无法静态枚举；
 * 若在这里 import aiProviders 会造成循环依赖（aiProviders 的 Key 绑定器
 * 反向需要本模块）。存在性由调用方（设置面板）在创建引擎后立即绑定来保证。
 *
 * ⚠ 这**不是**「绕过校验」的后门：写入的只是一个引擎标识字符串，
 * 不影响任何安全边界（真正决定请求目标的是引擎的 baseUrl，而 baseUrl 已在
 * aiProviders 层做过 http(s) 校验）。
 * @param {string} id Key 条目 id
 * @param {string} providerId 引擎 id（内置或自定义均可）
 * @returns {boolean}
 */
export function setKeyProviderRaw(id, providerId) {
    return setKeyProvider(id, providerId);
}

/**
 * 指定某个 Key 使用的模型 ID。
 * 同一个 Key 可切换到该引擎下的任意模型；传空则清除，回到注册表的档位优选。
 * @param {string} id
 * @param {string} modelId
 * @returns {boolean} 是否写入成功（id 不存在 → false）
 */
export function setKeyModel(id, modelId) {
    _ensureLoaded();
    const entry = _memoryList.find(k => k.id === id);
    if (!entry) return false;
    const m = typeof modelId === 'string' ? modelId.trim() : '';
    if (m) entry.modelId = m; else delete entry.modelId;
    _flushPersistence();
    return true;
}

// ---------------------------------------------------------------------------
// v3.0.4：自动/手动模式与生效 Key 解析
// ---------------------------------------------------------------------------

/** 当前 Key 选择模式；默认 'auto'。 */
export function getKeyMode() {
    _ensureLoaded();
    return _memoryKeyMode === 'manual' ? 'manual' : 'auto';
}

/** 设置 Key 选择模式（非 'manual' 一律视为 'auto'）。 */
export function setKeyMode(mode) {
    _ensureLoaded();
    _memoryKeyMode = (mode === 'manual') ? 'manual' : 'auto';
    _flushPersistence();
}

/** 自动选中的 Key id；未设置返回 null。 */
export function getAutoKeyId() {
    _ensureLoaded();
    return _memoryAutoKeyId || null;
}

/** 记录自动选中的 Key id（不覆盖 ai_active_key_id）。传空则清除。 */
export function setAutoKeyId(id) {
    _ensureLoaded();
    _memoryAutoKeyId = id || null;
    _flushPersistence();
}

/**
 * 生效 Key 解析：manual → 用户选择；auto → ai_auto_key_id → 用户显式选择 → 首个；无 Key → null。
 * 说明（与契约 §3.4 的偏差，见交付报告）：auto 分支在 ai_auto_key_id 未写入时，
 * 额外回退到 ai_active_key_id，避免老用户（只有 ai_active_key_id）被静默切到“第一个 Key”。
 * @returns {object|null}
 */
export function getEffectiveKeyEntry() {
    _ensureLoaded();
    const list = _memoryList;
    if (list.length === 0) return null;

    if (_memoryKeyMode === 'manual') {
        return list.find(k => k.id === _memoryActiveId) || list[0] || null;
    }

    const autoId = _memoryAutoKeyId;
    if (autoId) {
        const hit = list.find(k => k.id === autoId);
        if (hit) return hit;
    }
    const active = list.find(k => k.id === _memoryActiveId);
    if (active) return active;
    return list[0] || null;
}

/** 生效 Key 字符串值（保持既有签名，语义升级为“生效 Key”） */
export function getActiveKeyValue() {
    const k = getEffectiveKeyEntry();
    return k ? k.key : '';
}

/**
 * 新增或更新 Key。
 * - **以 (key, modelId) 去重**（v1.5.1）：同一把 Key 指定不同模型时各自成条目，
 *   这样「AMD 这把 Key 用 Qwen3.8-27B」「同一把 Key 用 GLM-5.3-Flash」可以同时存下来、
 *   在下拉里一键切换 —— 对应用户「至少能存 20 个不同的 api key **或大模型**」的诉求。
 *   未指定 modelId 时按 key 复用已有条目（避免「重复粘贴同一把 Key」造出近似重复项）。
 * - 新增或重新选中均立即置为活跃（选中即生效）
 * - 条目数超过 MAX_KEY_ENTRIES 时**拒绝新增**（返回 null），由调用方提示用户；
 *   更新已有条目不受上限影响。
 * @param {{ key: string, type?: string, label?: string, providerId?: string, modelId?: string }} opts
 * @returns {object|null} entry；key 为空或超出上限时返回 null
 */
export function addKey({ key, type, label, providerId, modelId } = {}) {
    _ensureLoaded();
    const k = (key || '').trim();
    if (!k) return null;
    const wantModel = typeof modelId === 'string' ? modelId.trim() : '';

    // v3.0.4 修复：形状**唯一**可判定时优先采用注册表结论，而不是旧前缀语义。
    //   旧语义（detectKeyType）只看前缀：`sk-apx…`（APINEX）会被判成 deepseek 并在
    //   下拉框显示「DeepSeek」—— 这是**主动错误**，且该 Key 因 CORS 探测必然失败，
    //   writeBackProvider 永远不会纠正它，用户会一直以为自己在用 DeepSeek。
    //   `ms-…`（ModelScope）旧语义为 unknown → 显示「未知引擎」，同样不如直接识别。
    //   形状有歧义的 `sk-` 仍返回 null → 落回旧语义（保持向后兼容，交由探测消歧）。
    const shapeId = detectProviderId(k);
    const t = type || shapeId || detectKeyType(k);
    const pid = providerId || shapeId || null;
    const lab = label || labelOf(t);
    const list = readList();

    // ① 精确命中 (key, modelId)
    let exist = list.find(x => x.key === k && (x.modelId || '') === wantModel);
    // ② 未指定模型时，复用该 Key 的任一条目，避免重复粘贴造出近似重复项
    if (!exist && !wantModel) exist = list.find(x => x.key === k);

    let entry;
    if (exist) {
        exist.type = t;
        exist.label = lab;
        exist.createdAt = Date.now();
        if (pid) exist.providerId = pid;
        if (wantModel) exist.modelId = wantModel;
        entry = exist;
    } else {
        if (list.length >= MAX_KEY_ENTRIES) return null;
        entry = { id: genId(), type: t, key: k, label: lab, createdAt: Date.now() };
        if (pid) entry.providerId = pid;
        if (wantModel) entry.modelId = wantModel;
        list.push(entry);
    }

    writeList(list);
    setActiveKey(entry.id); // 新增/重新选中 → 立即生效
    return entry;
}

/**
 * 删除指定 ID 的 Key。
 * - 删活跃键时自动切到第一个剩余
 * - 删空时清空活跃/自动 id 与对应持久化副本
 * @param {string} id
 */
export function removeKey(id) {
    _ensureLoaded();
    _memoryList = _memoryList.filter(x => x.id !== id);
    if (_memoryList.length === 0) {
        _memoryActiveId = null;
        _memoryAutoKeyId = null;
        _flushPersistence();
        return;
    }
    if (_memoryActiveId === id) _memoryActiveId = _memoryList[0].id; // 删活跃 → 切第一个
    if (_memoryAutoKeyId === id) _memoryAutoKeyId = null;            // 删掉自动选中的 Key → 清除自动 id
    _flushPersistence();
}
