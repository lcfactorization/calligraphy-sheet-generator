// v1.2.0 多 API Key 存储与活跃键管理模块
// 存储结构：ai_api_keys (JSON数组) + ai_active_key_id (字符串)
// 兼容迁移旧键 deepseek_api_key
//
// v3.0.4 增补（契约 §3.4，仅新增、不改既有语义）：
//  - entry 允许可选字段 providerId / modelId（旧 entry 无这些字段仍完全可用）
//  - 新增 ai_key_mode（'auto'|'manual'，默认 'auto'）与 ai_auto_key_id
//  - 新增 getEffectiveKeyEntry()（生效 Key 解析）与 backfillProviderIds()

import { detectApiKeyType, detectProviderId, providerLabel } from './aiProviders.js';

const API_KEYS_KEY = 'ai_api_keys';
const ACTIVE_KEY_ID = 'ai_active_key_id';
const LEGACY_KEY = 'deepseek_api_key';
// v3.0.4 新增键（只新增，不改旧键语义）
const KEY_MODE = 'ai_key_mode';
const AUTO_KEY_ID = 'ai_auto_key_id';

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

function readList() {
    try {
        const l = JSON.parse(localStorage.getItem(API_KEYS_KEY) || '[]');
        return Array.isArray(l) ? l : [];
    } catch (e) {
        return [];
    }
}

function writeList(list) {
    localStorage.setItem(API_KEYS_KEY, JSON.stringify(list));
}

// ---------------------------------------------------------------------------
// 旧键迁移（幂等：仅当新结构为空时才迁移，迁移成功才删旧键）
// ---------------------------------------------------------------------------

/**
 * 迁移旧 localStorage['deepseek_api_key'] 到新结构。
 * 幂等：调用多次与调用一次效果相同。
 * - 仅当 ai_api_keys 为空时才执行迁移
 * - 仅当迁移写入成功后（即新结构有数据）才删除旧键
 */
export function migrateLegacyKey() {
    try {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (!legacy) return; // 无旧键，无需迁移

        const list = readList();
        if (list.length > 0) return; // 新结构已有数据，不动旧键

        const key = legacy.trim();
        if (!key) {
            // 空字符串视为无效，直接删
            localStorage.removeItem(LEGACY_KEY);
            return;
        }

        const type = detectKeyType(key);
        const entry = {
            id: genId(),
            type,
            key,
            label: labelOf(type),
            createdAt: Date.now()
        };

        writeList([entry]);
        localStorage.setItem(ACTIVE_KEY_ID, entry.id);
        localStorage.removeItem(LEGACY_KEY); // 迁移成功才删旧键
    } catch (e) {
        console.warn('[aiKeyStore] 迁移旧 Key 失败:', e);
    }
}

/**
 * v3.0.4 新增：幂等补齐 providerId。
 * 仅给 type 为 deepseek / volcano 的 entry 补 providerId；unknown 一律不动（留给用户自行检测）。
 * @returns {number} 本次补齐的条数
 */
export function backfillProviderIds() {
    try {
        migrateLegacyKey();
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
    } catch (e) {
        return 0;
    }
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/** 读取所有 Key（含自动迁移旧键） */
export function getAllKeys() {
    migrateLegacyKey();
    return readList();
}

/** 获取当前活跃 Key entry；活跃 id 失效时回退第一个 */
export function getActiveKey() {
    migrateLegacyKey();
    const list = readList();
    const id = localStorage.getItem(ACTIVE_KEY_ID);
    return list.find(k => k.id === id) || list[0] || null;
}

/** 复制当前活跃 Key 的完整值（供复制按钮调用） */
export function copyActiveKey() {
    const k = getActiveKey();
    return k ? k.key : '';
}

/** 设置活跃 Key ID（选中即生效的落点） */
export function setActiveKey(id) {
    localStorage.setItem(ACTIVE_KEY_ID, id);
}

// ---------------------------------------------------------------------------
// v3.0.4：自动/手动模式与生效 Key 解析
// ---------------------------------------------------------------------------

/** 当前 Key 选择模式；默认 'auto'。 */
export function getKeyMode() {
    try {
        return localStorage.getItem(KEY_MODE) === 'manual' ? 'manual' : 'auto';
    } catch (e) {
        return 'auto';
    }
}

/** 设置 Key 选择模式（非 'manual' 一律视为 'auto'）。 */
export function setKeyMode(mode) {
    try {
        localStorage.setItem(KEY_MODE, mode === 'manual' ? 'manual' : 'auto');
    } catch (e) {
        /* 忽略 */
    }
}

/** 自动选中的 Key id；未设置返回 null。 */
export function getAutoKeyId() {
    try {
        return localStorage.getItem(AUTO_KEY_ID) || null;
    } catch (e) {
        return null;
    }
}

/** 记录自动选中的 Key id（不覆盖 ai_active_key_id）。传空则清除。 */
export function setAutoKeyId(id) {
    try {
        if (id) localStorage.setItem(AUTO_KEY_ID, id);
        else localStorage.removeItem(AUTO_KEY_ID);
    } catch (e) {
        /* 忽略 */
    }
}

/**
 * 生效 Key 解析：manual → 用户选择；auto → ai_auto_key_id → 用户显式选择 → 首个；无 Key → null。
 * 说明（与契约 §3.4 的偏差，见交付报告）：auto 分支在 ai_auto_key_id 未写入时，
 * 额外回退到 ai_active_key_id，避免老用户（只有 ai_active_key_id）被静默切到“第一个 Key”。
 * @returns {object|null}
 */
export function getEffectiveKeyEntry() {
    migrateLegacyKey();
    const list = readList();
    if (list.length === 0) return null;

    if (getKeyMode() === 'manual') {
        const id = localStorage.getItem(ACTIVE_KEY_ID);
        return list.find(k => k.id === id) || list[0] || null;
    }

    const autoId = getAutoKeyId();
    if (autoId) {
        const hit = list.find(k => k.id === autoId);
        if (hit) return hit;
    }
    const activeId = localStorage.getItem(ACTIVE_KEY_ID);
    const active = list.find(k => k.id === activeId);
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
 * - 以 key 字符串去重（同 key 更新 label/createdAt）
 * - 新增或重新选中均立即置为活跃（选中即生效）
 * @param {{ key: string, type?: string, label?: string, providerId?: string, modelId?: string }} opts
 * @returns {object|null} entry
 */
export function addKey({ key, type, label, providerId, modelId } = {}) {
    migrateLegacyKey();
    const k = (key || '').trim();
    if (!k) return null;

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

    let entry;
    const exist = list.find(x => x.key === k);
    if (exist) {
        exist.type = t;
        exist.label = lab;
        exist.createdAt = Date.now();
        if (pid) exist.providerId = pid;
        if (modelId) exist.modelId = modelId;
        entry = exist;
    } else {
        entry = { id: genId(), type: t, key: k, label: lab, createdAt: Date.now() };
        if (pid) entry.providerId = pid;
        if (modelId) entry.modelId = modelId;
        list.push(entry);
    }

    writeList(list);
    setActiveKey(entry.id); // 新增/重新选中 → 立即生效
    return entry;
}

/**
 * 删除指定 ID 的 Key。
 * - 删活跃键时自动切到第一个剩余
 * - 删空时清两把键（ai_api_keys + ai_active_key_id）
 * @param {string} id
 */
export function removeKey(id) {
    let list = readList();
    list = list.filter(x => x.id !== id);
    if (list.length === 0) {
        localStorage.removeItem(API_KEYS_KEY);
        localStorage.removeItem(ACTIVE_KEY_ID);
        localStorage.removeItem(AUTO_KEY_ID);
        return;
    }
    writeList(list);
    if (localStorage.getItem(ACTIVE_KEY_ID) === id) {
        setActiveKey(list[0].id); // 删活跃 → 切第一个
    }
    if (getAutoKeyId() === id) {
        localStorage.removeItem(AUTO_KEY_ID); // 删掉自动选中的 Key → 清除自动 id
    }
}
