import { appState } from './state.js';

// --- [拡張可能] 個別のペナルティ計算ルール ---
const rules = [
    // ルール1: 男女の孤立・全員同性班を禁止する
    function evaluateGenderBalance(group, minimumMale, minimumFemale) {
        let maleCount = 0;
        let femaleCount = 0;
        group.forEach(p => appState.malePlayers.includes(p) ? maleCount++ : femaleCount++);
        
        return (Math.max(0, minimumMale - maleCount) +
            Math.max(0, minimumFemale - femaleCount)) * 500000;
    },

    // ルール2: 個人が前回と全く同じ班番号に連続で入るのを防ぐ
    function evaluateConsecutiveGroup(group, currentGroupIndex, lastGroupMap) {
        let penalty = 0;
        group.forEach(p1 => {
            if (lastGroupMap[p1] === currentGroupIndex) penalty += 1000000;
        });
        return penalty;
    },

    // ルール3: 前回一緒だったペアの重複排除 ＆ 過去の遭遇履歴の考慮
    function evaluatePairHistory(group, lastGroupMap, matrix) {
        let penalty = 0;
        for (let i = 0; i < group.length; i++) {
            const p1 = group[i];
            for (let j = i + 1; j < group.length; j++) {
                const p2 = group[j];
                
                // 直前ペア重複
                if (lastGroupMap[p1] !== undefined && lastGroupMap[p1] === lastGroupMap[p2]) {
                    penalty += 200000;
                }
                // 累積履歴
                const count = matrix[p1][p2];
                penalty += (count === 0) ? -1000 : Math.pow(count + 1, 3) * 10;
            }
        }
        return penalty;
    }
];

// 総合評価（コスト計算）
function getTotalCost(schedule, matrix) {
    let cost = 0;
    const hasLastSchedule = appState.lastSchedule && appState.lastSchedule.length > 0;
    
    const lastGroupMap = {};
    if (hasLastSchedule) {
        appState.lastSchedule.forEach((lastGroup, groupIndex) => {
            lastGroup.forEach(p => lastGroupMap[p] = groupIndex);
        });
    }

    const nonEmptyGroups = schedule.filter(group => group.length > 0);
    const players = schedule.flat();
    const maleCount = players.filter(p => appState.malePlayers.includes(p)).length;
    const femaleCount = players.length - maleCount;
    const allGroupsHaveFour = nonEmptyGroups.every(group => group.length >= 4);
    const allGroupsHaveTwo = nonEmptyGroups.every(group => group.length >= 2);
    const minimumMale = allGroupsHaveFour && maleCount >= nonEmptyGroups.length * 2 ? 2
        : allGroupsHaveTwo && maleCount >= nonEmptyGroups.length ? 1 : 0;
    const minimumFemale = allGroupsHaveFour && femaleCount >= nonEmptyGroups.length * 2 ? 2
        : allGroupsHaveTwo && femaleCount >= nonEmptyGroups.length ? 1 : 0;

    schedule.forEach((group, currentGroupIndex) => {
        // 全ルールを適用してペナルティを合算
        cost += rules[0](group, minimumMale, minimumFemale);
        cost += rules[1](group, currentGroupIndex, lastGroupMap);
        cost += rules[2](group, lastGroupMap, matrix);
    });
    
    return cost;
}

// SA法（焼きなまし法）のメイン処理
export async function solveSA(players, numGroups, matrix) {
    let current = generateSimpleSchedule(players, numGroups);
    let currentCost = getTotalCost(current, matrix);
    let best = current.map(group => [...group]);
    let bestCost = currentCost;
    let temp = 1000000;
    
    for (let i = 0; i < 30000; i++) {
        let next = swapRandomPlayers(current);
        let nextCost = getTotalCost(next, matrix);
        let delta = nextCost - currentCost;
        
        if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
            current = next;
            currentCost = nextCost;
            if (currentCost < bestCost) {
                best = current.map(group => [...group]);
                bestCost = currentCost;
            }
        }
        temp *= 0.9996;
        if (i > 0 && i % 500 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    return best;
}

function generateSimpleSchedule(players, numGroups) {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const groups = Array.from({ length: numGroups }, () => []);
    shuffled.forEach((p, i) => groups[i % numGroups].push(p));
    return groups;
}

function swapRandomPlayers(schedule) {
    let newSchedule = schedule.map(g => [...g]);
    let g1 = Math.floor(Math.random() * newSchedule.length);
    let g2 = Math.floor(Math.random() * newSchedule.length);
    if (newSchedule.length > 1) while (g2 === g1) g2 = Math.floor(Math.random() * newSchedule.length);
    if (newSchedule[g1].length === 0 || newSchedule[g2].length === 0) return newSchedule;
    
    let i1 = Math.floor(Math.random() * newSchedule[g1].length);
    let i2 = Math.floor(Math.random() * newSchedule[g2].length);
    
    [newSchedule[g1][i1], newSchedule[g2][i2]] = [newSchedule[g2][i2], newSchedule[g1][i1]];
    return newSchedule;
}
