import HanziWriter from 'hanzi-writer';

export function createStrokeSVG(strokes, currentIndex) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "18.72");
    svg.setAttribute("height", "18.72");
    svg.setAttribute("viewBox", "0 0 1024 1024");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const fullCharGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    fullCharGroup.setAttribute("transform", "scale(1, -1) translate(0, -1024)");
    strokes.forEach(stroke => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", stroke.path);
        path.setAttribute("fill", "#ccc");
        fullCharGroup.appendChild(path);
    });
    svg.appendChild(fullCharGroup);

    const completedGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    completedGroup.setAttribute("transform", "scale(1, -1) translate(0, -1024)");
    for (let i = 0; i < currentIndex; i++) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", strokes[i].path);
        path.setAttribute("fill", "black");
        completedGroup.appendChild(path);
    }
    svg.appendChild(completedGroup);

    if (currentIndex < strokes.length) {
        const currentPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        currentPath.setAttribute("d", strokes[currentIndex].path);
        currentPath.setAttribute("fill", "#ff4444");
        currentPath.setAttribute("transform", "scale(1, -1) translate(0, -1024)");
        svg.appendChild(currentPath);
    }

    return svg;
}

export function loadStrokes(char, strokeContainer) {
    const tempDiv = document.createElement('div');
    document.body.appendChild(tempDiv);
    const writer = new HanziWriter(tempDiv, {
        width: 60,
        height: 60,
        showOutline: false,
    });
    return writer.setCharacter(char).then(() => {
        const strokes = writer._character.strokes;
        const strokeCount = strokes.length;
        const strokeCountSpan = document.createElement('span');
        strokeCountSpan.textContent = `${strokeCount}画`;
        strokeCountSpan.style.marginRight = '6px';
        strokeContainer.appendChild(strokeCountSpan);
        for (let k = 0; k < strokeCount; k++) {
            const svg = createStrokeSVG(strokes, k);
            svg.classList.add('stroke-svg');
            strokeContainer.appendChild(svg);
        }
        document.body.removeChild(tempDiv);
    }).catch(error => {
        console.error(`无法加载汉字"${char}"的笔画数据：`, error);
        document.body.removeChild(tempDiv);
    });
}
