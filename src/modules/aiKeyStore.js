// v1.2.0 多 API Key 存储与活跃键管理模块
// 存储结构：ai_api_keys (JSON数组) + ai_active_key_id (字符串)
// 兼容迁移旧键 deepseek_api_key

const API_KEYS_KEY = 'ai_api_keys';
const ACTIVE_KEY_ID = 'ai_active_key_id';
const LEGACY_KEY = 'deepseek_api_key';

// ---------------------------------------------------------------------------
// 内部工具函数
// ---------------------------------------------------------------------------

/** 前缀识别（与 aiZuci.detectApiKeyType 保持一致，避免循环依赖） */
export function detectKeyType(key) {
    if (!key || typeof key !== 'string') return 'unknown';
    const t = key.trim();
    if (t.startsWith('sk-')) return 'deepseek';
    if (t.startsWith('ark-')) return 'volcano';
    return 'unknown'; // 未来：mimo- → 'mimo'
}

function labelOf(type) {
    return type === 'deepseek' ? 'DeepSeek' : type === 'volcano' ? '火山引擎豆包' : '未知引擎';
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

/** 获取当前活跃 Key 字符串值（供调用方直接 .trim() 使用） */
export function getActiveKeyValue() {
    const k = getActiveKey();
    return k ? k.key : '';
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

/**
 * 新增或更新 Key。
 * - 以 key 字符串去重（同 key 更新 label/createdAt）
 * - 新增或重新选中均立即置为活跃（选中即生效）
 * @param {{ key: string, type?: string, label?: string }} opts
 * @returns {object|null} entry
 */
export function addKey({ key, type, label } = {}) {
    migrateLegacyKey();
    const k = (key || '').trim();
    if (!k) return null;

    const t = type || detectKeyType(k);
    const lab = label || labelOf(t);
    const list = readList();

    let entry;
    const exist = list.find(x => x.key === k);
    if (exist) {
        exist.type = t;
        exist.label = lab;
        exist.createdAt = Date.now();
        entry = exist;
    } else {
        entry = { id: genId(), type: t, key: k, label: lab, createdAt: Date.now() };
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
        return;
    }
    writeList(list);
    if (localStorage.getItem(ACTIVE_KEY_ID) === id) {
        setActiveKey(list[0].id); // 删活跃 → 切第一个
    }
}
