// 新手引导模块（C-2）
// localStorage key: calligraphy_onboarded
// 3 步引导：高亮输入框 → 高亮生成按钮 → 高亮打印按钮

const ONBOARDED_KEY = 'calligraphy_onboarded';

const STEPS = [
    {
        selector: '#inputText',
        title: '第 1 步：输入汉字',
        text: '在输入框中输入或粘贴要练习的汉字（最多 200 字）。',
        nextText: '下一步'
    },
    {
        selector: '#generate-btn',
        title: '第 2 步：生成字帖',
        text: '点击「生成字帖」按钮，立即生成带拼音、笔画、组词的字帖。',
        nextText: '下一步'
    },
    {
        selector: '#printBtn',
        title: '第 3 步：打印 / 导出 PDF',
        text: '点击右上角打印按钮，可将字帖打印或导出为 PDF 文件。',
        nextText: '开始使用'
    }
];

let currentStep = 0;
let overlay = null;

/** 是否已完成引导 */
export function isOnboarded() {
    try {
        return localStorage.getItem(ONBOARDED_KEY) === 'true';
    } catch (e) {
        return false;
    }
}

/** 标记完成 */
function markOnboarded() {
    try {
        localStorage.setItem(ONBOARDED_KEY, 'true');
    } catch (e) {
        // 忽略 storage 不可用
    }
}

/** 创建遮罩与高亮层 */
function createOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'ob-overlay';
    overlay.id = 'onboardingOverlay';
    overlay.innerHTML = `
        <div class="ob-spotlight" id="obSpotlight"></div>
        <div class="ob-tooltip" id="obTooltip" role="dialog" aria-labelledby="obTitle">
            <div class="ob-progress" id="obProgress"></div>
            <div class="ob-title" id="obTitle"></div>
            <div class="ob-text" id="obText"></div>
            <div class="ob-actions">
                <button class="ob-skip" id="obSkip">跳过</button>
                <button class="btn btn-primary ob-next" id="obNext">下一步</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#obSkip').addEventListener('click', finish);
    overlay.querySelector('#obNext').addEventListener('click', nextStep);

    window.addEventListener('resize', positionSpotlight);
    window.addEventListener('scroll', positionSpotlight, true);
    return overlay;
}

function showStep(idx) {
    if (idx >= STEPS.length) {
        finish();
        return;
    }
    currentStep = idx;
    const step = STEPS[idx];
    const target = document.querySelector(step.selector);
    if (!target) {
        // 元素不存在，跳过此步
        showStep(idx + 1);
        return;
    }

    createOverlay();
    overlay.classList.add('active');

    // 进度指示器
    const progressEl = overlay.querySelector('#obProgress');
    progressEl.innerHTML = STEPS.map((_, i) =>
        `<span class="ob-dot ${i === idx ? 'active' : ''} ${i < idx ? 'done' : ''}"></span>`
    ).join('');

    overlay.querySelector('#obTitle').textContent = step.title;
    overlay.querySelector('#obText').textContent = step.text;
    overlay.querySelector('#obNext').textContent = step.nextText;

    // 滚动到目标元素
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 等待滚动完成后定位
    setTimeout(() => positionSpotlight(target), 350);

    // 高亮目标元素
    document.querySelectorAll('.ob-highlight').forEach(el => el.classList.remove('ob-highlight'));
    target.classList.add('ob-highlight');
}

function positionSpotlight(targetArg) {
    const target = targetArg || (STEPS[currentStep] && document.querySelector(STEPS[currentStep].selector));
    if (!target || !overlay) return;
    const rect = target.getBoundingClientRect();
    const pad = 6;

    const spotlight = overlay.querySelector('#obSpotlight');
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';

    // 定位提示框
    const tooltip = overlay.querySelector('#obTooltip');
    const tipRect = tooltip.getBoundingClientRect();
    let top = rect.bottom + 12;
    let left = rect.left + (rect.width / 2) - (tipRect.width / 2);

    // 边界检查
    if (left < 12) left = 12;
    if (left + tipRect.width > window.innerWidth - 12) {
        left = window.innerWidth - tipRect.width - 12;
    }
    if (top + tipRect.height > window.innerHeight - 12) {
        // 放在上方
        top = rect.top - tipRect.height - 12;
        if (top < 12) top = 12;
    }
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function nextStep() {
    showStep(currentStep + 1);
}

function finish() {
    markOnboarded();
    document.querySelectorAll('.ob-highlight').forEach(el => el.classList.remove('ob-highlight'));
    if (overlay) {
        overlay.classList.remove('active');
        const el = overlay;
        overlay = null;
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
    }
    window.removeEventListener('resize', positionSpotlight);
    window.removeEventListener('scroll', positionSpotlight, true);
}

/** 开始引导 */
export function startOnboarding() {
    currentStep = 0;
    showStep(0);
}

/** 重新开始引导（供设置中心调用） */
export function restartOnboarding() {
    // 清除已完成标记
    try { localStorage.removeItem(ONBOARDED_KEY); } catch (e) {}
    // 若已有引导在进行，先清理
    if (overlay) {
        finish();
    }
    startOnboarding();
}

/** 初始化：首次使用自动启动 */
export function initOnboarding() {
    if (!isOnboarded()) {
        // 延迟启动，等待字体加载和首屏渲染
        setTimeout(startOnboarding, 800);
    }
}
