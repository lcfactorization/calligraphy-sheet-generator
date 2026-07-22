import cnchar from 'cnchar';
import words from 'cnchar-words';
import customZuCi from '../data/customZuCi.js';

cnchar.use(words);

export function getZuCi(char) {
    try {
        let zuciArray = customZuCi[char] || [];
        if (zuciArray.length >= 2) {
            return zuciArray.slice(0, 2);
        } else {
            const words = cnchar.words(char);
            const twoCharWords = words.filter(word => word.length === 2);
            if (twoCharWords.length >= 2) {
                zuciArray = twoCharWords.slice(0, 2);
            } else {
                zuciArray = twoCharWords;
                while (zuciArray.length < 2) {
                    zuciArray.push("组词");
                }
            }
            return zuciArray;
        }
    } catch (error) {
        console.error(`获取 "${char}" 的组词时出错:`, error);
        return ["组词", "组词"];
    }
}
