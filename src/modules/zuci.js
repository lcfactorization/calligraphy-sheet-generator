import cnchar from 'cnchar';
import words from 'cnchar-words';
import customZuCi from '../data/customZuCi.js';
import { getAiZuci } from './aiZuci.js';  // v2.9.9：AI 组词缓存回退

cnchar.use(words);

export function getZuCi(char) {
    try {
        let zuciArray = customZuCi[char] || [];
        if (zuciArray.length >= 2) {
            return zuciArray.slice(0, 2);
        }
        // cnchar 组词
        const words = cnchar.words(char);
        const twoCharWords = words.filter(word => word.length === 2);
        if (twoCharWords.length >= 2) {
            return twoCharWords.slice(0, 2);
        }
        // v2.9.9：AI 缓存回退（用户已通过 AI 补齐的字优先用 AI 结果，消除 "组词" 占位）
        if (twoCharWords.length > 0) {
            const aiZuci = getAiZuci(char);
            if (aiZuci && aiZuci.length > 0) {
                return aiZuci;
            }
            // AI 没有缓存，用 cnchar 的结果 + 占位
            zuciArray = twoCharWords;
            while (zuciArray.length < 2) {
                zuciArray.push("组词");
            }
            return zuciArray;
        }
        // cnchar 完全没有二字词
        const aiZuci = getAiZuci(char);
        if (aiZuci && aiZuci.length > 0) {
            return aiZuci;
        }
        return ["组词", "组词"];
    } catch (error) {
        console.error(`获取 "${char}" 的组词时出错:`, error);
        return ["组词", "组词"];
    }
}
