import { pinyin } from './pinyin.js';
import { getZuCi } from './zuci.js';
import { loadStrokes } from './strokes.js';

function createTianziGrid(char, index) {
    const selectedFont = document.getElementById('font-select').value;
    const tianziCell = document.createElement('div');
    tianziCell.className = 'tianzi-cell';

    const zuciArray = getZuCi(char);

    if (index === 0 || index === 3) {
        // 显示组词（拼音和黑色汉字）
        const targetWord = index === 0 ? zuciArray[0] : zuciArray[1];
        if (targetWord && targetWord.length === 2) {
            const pinyinArray = [];
            for (let i = 0; i < targetWord.length; i++) {
                const py = pinyin(targetWord[i], {
                    toneType: 'symbol',
                    type: 'array',
                    multiple: false
                })[0];
                pinyinArray.push(py);
            }

            const charArray = targetWord.split('');

            const topLeft = document.createElement('div');
            topLeft.className = 'sub-cell top';
            topLeft.textContent = pinyinArray[0] || '';

            const topRight = document.createElement('div');
            topRight.className = 'sub-cell top';
            topRight.textContent = pinyinArray[1] || '';

            const bottomLeft = document.createElement('div');
            bottomLeft.className = 'black-char left';
            bottomLeft.style.fontFamily = selectedFont;
            bottomLeft.textContent = charArray[0] || '';

            const bottomRight = document.createElement('div');
            bottomRight.className = 'black-char right';
            bottomRight.style.fontFamily = selectedFont;
            bottomRight.textContent = charArray[1] || '';

            tianziCell.appendChild(topLeft);
            tianziCell.appendChild(topRight);
            tianziCell.appendChild(bottomLeft);
            tianziCell.appendChild(bottomRight);
        }
    } else if (index === 1 || index === 2) {
        // 第一个词组的红色汉字，倒数第五和倒数第四个田字格
        const targetWord = zuciArray[0];
        if (targetWord && targetWord.length === 2) {
            const charArray = targetWord.split('');
            const redChar = document.createElement('div');
            redChar.className = 'red-char';
            redChar.style.fontFamily = selectedFont;
            redChar.textContent = index === 1 ? charArray[0] || '' : charArray[1] || '';
            tianziCell.appendChild(redChar);
        }
    } else if (index === 4 || index === 5) {
        // 第二个词组的红色汉字，最后两个田字格
        const targetWord = zuciArray[1];
        if (targetWord && targetWord.length === 2) {
            const charArray = targetWord.split('');
            const redChar = document.createElement('div');
            redChar.className = 'red-char';
            redChar.style.fontFamily = selectedFont;
            redChar.textContent = index === 4 ? charArray[0] || '' : charArray[1] || '';
            tianziCell.appendChild(redChar);
        }
    }

    return tianziCell;
}

export function generateGrid() {
    const input = document.getElementById('inputText').value;
    const selectedFont = document.getElementById('font-select').value;
    const gridContainer = document.getElementById('grid-container');
    gridContainer.innerHTML = '';

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const contextStart = Math.max(0, i - 10);
        const contextEnd = Math.min(input.length, i + 10);
        const context = input.substring(contextStart, contextEnd);
        let pinyinStr = '';
        try {
            pinyinStr = pinyin(char, {
                toneType: 'symbol',
                segment: true,
                nonZh: 'consecutive'
            });
        } catch (error) {
            console.error(`获取 "${char}" 的拼音时出错:`, error);
            pinyinStr = '';
        }

        const pinyinRow = document.createElement('div');
        pinyinRow.className = 'row pinyin-row';
        if (i === 0 || i % 11 === 0) {
            pinyinRow.classList.add('page-first');
        } else {
            pinyinRow.style.marginTop = '-1px';
        }
        const line1 = document.createElement('div');
        line1.className = 'line1';
        const line2 = document.createElement('div');
        line2.className = 'line2';
        pinyinRow.appendChild(line1);
        pinyinRow.appendChild(line2);

        const pinyinCell = document.createElement('div');
        pinyinCell.className = 'pinyin-cell';
        const span = document.createElement('span');
        span.textContent = pinyinStr || '';
        span.classList.add('black');
        pinyinCell.appendChild(span);
        pinyinRow.appendChild(pinyinCell);

        const strokeContainer = document.createElement('div');
        strokeContainer.className = 'stroke-container';
        pinyinRow.appendChild(strokeContainer);

        gridContainer.appendChild(pinyinRow);

        const charRow = document.createElement('div');
        charRow.className = 'row char-row';

        for (let j = 0; j < 5; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.style.fontFamily = selectedFont;
            const diag1 = document.createElement('div');
            diag1.className = 'diagonal1';
            const diag2 = document.createElement('div');
            diag2.className = 'diagonal2';
            cell.appendChild(diag1);
            cell.appendChild(diag2);
            const span = document.createElement('span');
            if (j === 0) {
                span.textContent = char;
                cell.classList.add('black');
            } else if (j < 3) {
                span.textContent = char;
                cell.classList.add('gray');
            }
            cell.appendChild(span);
            charRow.appendChild(cell);
        }

        // 创建田字格
        for (let k = 0; k < 6; k++) {
            const tianzi = createTianziGrid(char, k);
            charRow.appendChild(tianzi);
        }

        if ((i + 1) % 11 === 0) {
            charRow.classList.add('page-break');
        }
        gridContainer.appendChild(charRow);

        // 加载笔画数据（异步，不阻塞渲染）
        loadStrokes(char, strokeContainer);
    }
}
