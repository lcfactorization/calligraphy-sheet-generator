// 文件导入模块
// 支持 txt/md/csv/xlsx/docx 文件导入到输入框
// 纯原生 JS 实现，xlsx 和 docx 通过动态 import 第三方库解析

// 文本文件大小上限：1MB（1048576 字节）— 用于 txt/md/csv
const MAX_FILE_SIZE = 1048576;
// 二进制文件大小上限：5MB（5242880 字节）— 用于 xlsx/docx
const MAX_BINARY_FILE_SIZE = 5242880;

// 允许的文件扩展名
const ALLOWED_EXTS = ['txt', 'md', 'csv', 'markdown', 'xlsx', 'docx'];
// 需要二进制解析的扩展名（走动态 import 第三方库路径）
const BINARY_EXTS = ['xlsx', 'docx'];

/**
 * 从文本中过滤出纯汉字字符
 * 字帖主要支持汉字的米字格、笔画笔顺拆分、组词、描摹等，
 * 非汉字字符（标点、字母、数字、空格、换行等）统统忽略
 * @param {string} text - 原始文本
 * @returns {string} 纯汉字字符串（可能为空字符串）
 */
function filterChineseChars(text) {
    if (!text || typeof text !== 'string') return '';
    const beforeLen = text.length;
    // 仅匹配 CJK 基本汉字（U+4E00 ~ U+9FA5），其余字符一律忽略
    const matches = text.match(/[\u4e00-\u9fa5]/g);
    const filtered = matches ? matches.join('') : '';
    console.log('[FileImporter] 汉字过滤：' + beforeLen + ' -> ' + filtered.length + ' 字符');
    return filtered;
}

/**
 * 去除 Markdown 标记，保留纯文本
 * 处理：标题、粗体/斜体、删除线、列表、代码、引用、链接、图片、水平线、HTML 标签
 * @param {string} text - 原始 markdown 文本
 * @returns {string} 纯文本
 */
function stripMarkdown(text) {
    return text
        // 移除图片 ![alt](url) -> alt
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        // 移除链接 [text](url) -> text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        // 移除代码块 ```lang\n...``` -> 保留代码内容
        .replace(/```(\w*)\n?([\s\S]*?)```/g, '$2')
        // 移除行内代码 `code` -> code
        .replace(/`([^`]+)`/g, '$1')
        // 移除标题标记 # ## ### 等
        .replace(/^#{1,6}\s+/gm, '')
        // 移除引用标记 >
        .replace(/^>\s*/gm, '')
        // 移除粗斜体 ***text***
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
        // 移除粗体 **text** __text__
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        // 移除斜体 *text* _text_
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // 移除删除线 ~~text~~
        .replace(/~~([^~]+)~~/g, '$1')
        // 移除无序列表标记 - * +
        .replace(/^\s*[-*+]\s+/gm, '')
        // 移除有序列表标记 1. 2.
        .replace(/^\s*\d+\.\s+/gm, '')
        // 移除水平线 --- *** ___
        .replace(/^[-*_]{3,}\s*$/gm, '')
        // 移除 HTML 标签
        .replace(/<[^>]+>/g, '')
        // 合并多余空行（3个以上换行压缩为2个）
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * 解析 CSV 文件
 * 按行拼接，每行单元格内容用空格连接（逗号分隔转空格）
 * 支持带引号的字段（包含逗号或换行的字段）
 * @param {string} text - 原始 CSV 文本
 * @returns {string} 解析后的纯文本
 */
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            // 在引号内：处理转义引号 "" -> "
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++;
            } else if (char === '"') {
                // 引号结束
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                // 引号开始
                inQuotes = true;
            } else if (char === ',') {
                // 字段分隔
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                // 行结束
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else if (char === '\r') {
                // 跳过 \r（Windows 换行符处理）
            } else {
                currentField += char;
            }
        }
    }
    // 处理最后一行（文件末尾无换行的情况）
    if (currentField !== '' || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    // 每行单元格用空格拼接，过滤空行，行与行用换行拼接
    return rows
        .map(function (row) { return row.join(' ').trim(); })
        .filter(function (line) { return line.length > 0; })
        .join('\n');
}

/**
 * 解析 XLSX 文件
 * 使用 SheetJS（动态 import）读取第一个 sheet
 * 按行拼接单元格内容（每行单元格用空格分隔，行与行用换行分隔）
 * @param {ArrayBuffer} arrayBuffer - 文件二进制内容
 * @returns {Promise<string>} 解析后的纯文本
 */
async function parseXLSX(arrayBuffer) {
    // 动态加载 SheetJS，避免影响首屏体积
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('XLSX 文件无有效工作表');
    }
    // 读取第一个 sheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
        throw new Error('XLSX 工作表为空');
    }
    // 转为二维数组：header:1 表示按行输出数组，defval 给空单元格默认值
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rows || rows.length === 0) {
        throw new Error('XLSX 工作表无有效数据');
    }
    // 每行单元格用空格拼接，过滤空行，行与行用换行拼接
    return rows
        .map(function (row) {
            return row.map(function (cell) {
                return cell === null || cell === undefined ? '' : String(cell);
            }).join(' ').trim();
        })
        .filter(function (line) { return line.length > 0; })
        .join('\n');
}

/**
 * 解析 DOCX 文件
 * 使用 mammoth.js（动态 import）转换为纯文本
 * @param {ArrayBuffer} arrayBuffer - 文件二进制内容
 * @returns {Promise<string>} 解析后的纯文本
 */
async function parseDOCX(arrayBuffer) {
    // 动态加载 mammoth；主入口失败时回退到浏览器专用入口
    let mammoth;
    try {
        mammoth = await import('mammoth');
    } catch (e) {
        // 浏览器兼容性回退方案
        mammoth = await import('mammoth/mammoth.browser');
    }
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    if (!result || !result.value) {
        throw new Error('DOCX 文件无有效文本内容');
    }
    return result.value;
}

/**
 * 显示 Toast 提示（固定顶部居中，3 秒自动消失）
 * @param {string} message - 提示消息
 * @param {string} type - 提示类型：info / success / error
 */
function showToast(message, type) {
    // 移除已有 toast，避免堆叠
    const existing = document.querySelector('.file-importer-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'file-importer-toast file-importer-toast-' + (type || 'info');
    toast.textContent = message;
    document.body.appendChild(toast);

    // 触发进入动画
    requestAnimationFrame(function () {
        toast.classList.add('show');
    });

    // 3 秒后自动消失
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
}

/**
 * 根据文件扩展名处理内容
 * txt/md/csv 统一在此走文本解析路径，最后过滤为纯汉字
 * @param {string} name - 文件名
 * @param {string} content - 文件文本内容
 * @returns {string} 处理后的纯汉字文本
 */
function processFileContent(name, content) {
    const ext = name.toLowerCase().split('.').pop();

    let parsed;
    if (ext === 'md' || ext === 'markdown') {
        parsed = stripMarkdown(content);
    } else if (ext === 'csv') {
        parsed = parseCSV(content);
    } else {
        // txt 原样保留
        parsed = content;
    }

    // 过滤出纯汉字字符（标点、字母、数字、空白等统统忽略）
    return filterChineseChars(parsed);
}

/**
 * 文件导入器类
 * 负责创建按钮、绑定事件、读取文件并填充到输入框
 */
class FileImporter {
    constructor() {
        this.button = null;
        this.fileInput = null;
        this.textarea = null;
    }

    /**
     * 初始化：查找输入框、创建按钮和隐藏 file input、绑定事件
     */
    init() {
        // 查找输入框元素
        this.textarea = document.getElementById('inputText');
        if (!this.textarea) {
            console.warn('[FileImporter] 未找到输入框 #inputText，跳过初始化');
            return;
        }

        // 如已有导入按钮则复用，避免重复创建
        if (document.getElementById('fileImportBtn')) {
            this.button = document.getElementById('fileImportBtn');
            this.fileInput = document.getElementById('fileImportInput');
            return;
        }

        // 创建"📁 导入文件"按钮（复用现有 .btn .btn-secondary 样式）
        this.button = document.createElement('button');
        this.button.id = 'fileImportBtn';
        this.button.className = 'btn btn-secondary file-import-btn';
        this.button.type = 'button';
        this.button.title = '导入 txt/md/csv/xlsx/docx 文件到输入框';
        this.button.innerHTML = '📁 导入文件';

        // 创建隐藏的 file input
        this.fileInput = document.createElement('input');
        this.fileInput.id = 'fileImportInput';
        this.fileInput.type = 'file';
        this.fileInput.accept = '.txt,.md,.csv,.markdown,.xlsx,.docx';
        this.fileInput.style.display = 'none';

        // 插入按钮到 DOM：优先放入 clear-btn 所在的 btn-row 最前面
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn && clearBtn.parentElement) {
            clearBtn.parentElement.insertBefore(this.button, clearBtn);
        } else {
            // 后备方案：插入到 textarea 的父容器
            this.textarea.parentElement.insertBefore(this.button, this.textarea.nextSibling);
        }
        document.body.appendChild(this.fileInput);

        // 绑定按钮点击 → 触发 file input
        this.button.addEventListener('click', () => {
            this.fileInput.click();
        });

        // 绑定 file input change 事件
        this.fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });
    }

    /**
     * 处理文件选择事件
     * - txt/md/csv：走 FileReader 文本路径（同步处理）
     * - xlsx/docx：走 arrayBuffer 二进制路径（异步动态 import 第三方库）
     * @param {Event} e - change 事件
     */
    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.toLowerCase().split('.').pop();
        const isBinary = BINARY_EXTS.includes(ext);
        const sizeLimit = isBinary ? MAX_BINARY_FILE_SIZE : MAX_FILE_SIZE;

        // 校验文件大小
        if (file.size > sizeLimit) {
            const limitMb = Math.floor(sizeLimit / 1048576);
            showToast('文件过大（超过 ' + limitMb + 'MB），请选择更小的文件', 'error');
            e.target.value = '';
            return;
        }

        // 校验文件扩展名
        if (!ALLOWED_EXTS.includes(ext)) {
            showToast('仅支持 txt / md / csv / xlsx / docx 格式的文件', 'error');
            e.target.value = '';
            return;
        }

        // 二进制文件（xlsx/docx）：异步解析路径
        if (isBinary) {
            // 显示 loading 状态，禁用按钮避免重复触发
            const originalText = this.button.innerHTML;
            this.button.innerHTML = '⏳ 解析中...';
            this.button.disabled = true;

            try {
                const arrayBuffer = await file.arrayBuffer();
                let processed;

                if (ext === 'xlsx') {
                    processed = await parseXLSX(arrayBuffer);
                } else if (ext === 'docx') {
                    processed = await parseDOCX(arrayBuffer);
                }

                // 过滤出纯汉字字符（标点、字母、数字、空白等统统忽略）
                processed = filterChineseChars(processed);

                // 处理后内容有效性检测（无汉字时提示用户）
                if (!processed || processed.trim() === '') {
                    showToast('文件中未发现汉字字符', 'error');
                    e.target.value = '';
                    return;
                }

                // 填入输入框
                this.textarea.value = processed;
                this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
                this.textarea.focus();
                showToast('已导入 ' + processed.length + ' 个汉字', 'success');
            } catch (err) {
                console.error('[FileImporter] 解析二进制文件失败:', err);
                showToast('文件解析失败：' + (err.message || '未知错误'), 'error');
            } finally {
                // 恢复按钮状态，重置 file input
                this.button.innerHTML = originalText;
                this.button.disabled = false;
                e.target.value = '';
            }
            return;
        }

        // 文本文件（txt/md/csv）：FileReader 路径
        const reader = new FileReader();

        reader.onload = (event) => {
            const content = event.target.result;

            // 空文件检测
            if (!content || (typeof content === 'string' && content.trim() === '')) {
                showToast('文件内容为空', 'error');
                e.target.value = '';
                return;
            }

            try {
                // 根据文件类型处理内容（内部已过滤为纯汉字）
                const processed = processFileContent(file.name, content);

                // 处理后内容有效性检测（无汉字时提示用户）
                if (!processed || processed.trim() === '') {
                    showToast('文件中未发现汉字字符', 'error');
                    e.target.value = '';
                    return;
                }

                // 清空输入框原有内容，填入新内容
                this.textarea.value = processed;
                // 触发 input 事件（让字数计数器等模块更新）
                this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
                // 聚焦输入框
                this.textarea.focus();

                showToast('已导入 ' + processed.length + ' 个汉字', 'success');
            } catch (err) {
                console.error('[FileImporter] 处理文件失败:', err);
                showToast('文件处理失败：' + err.message, 'error');
            }

            // 重置 file input，允许重复选择同一文件
            e.target.value = '';
        };

        reader.onerror = () => {
            showToast('文件读取失败，请重试', 'error');
            e.target.value = '';
        };

        // 以文本方式读取（不指定编码，让浏览器自动检测 BOM）
        reader.readAsText(file);
    }
}

// 单例实例
const fileImporter = new FileImporter();

/**
 * 供 main.js 调用的注册函数
 * 调用后会自动查找输入框并注入导入按钮
 */
export function registerFileImporter() {
    fileImporter.init();
}

export { FileImporter };
export default fileImporter;
