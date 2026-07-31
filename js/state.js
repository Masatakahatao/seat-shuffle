// アプリ全体のデータ状態
export let appState = {
    numPlayers: 0,
    numGroups: 0,
    dayCount: 1,
    historyMatrix: [],
    lastSchedule: null,
    malePlayers: []
};

export let lastSchedule = null;

export function setLastSchedule(schedule) {
    lastSchedule = schedule;
    appState.lastSchedule = schedule;
}

export function incrementDayCount() {
    appState.dayCount++;
}

export function saveState() {
    localStorage.setItem('seatShuffleData', JSON.stringify(appState));
}

export function loadState() {
    const saved = localStorage.getItem('seatShuffleData');
    if (!saved) return false;

    try {
        const parsed = JSON.parse(saved);
        const numPlayers = Number(parsed.numPlayers);
        const numGroups = Number(parsed.numGroups);
        if (!Number.isInteger(numPlayers) || numPlayers < 1 || numPlayers > 50 ||
            !Number.isInteger(numGroups) || numGroups < 1 || numGroups > numPlayers) {
            throw new Error('保存された設定値が不正です。');
        }

        const validPlayer = p => Number.isInteger(p) && p >= 1 && p <= numPlayers;
        const matrixIsValid = Array.isArray(parsed.historyMatrix) &&
            parsed.historyMatrix.length === numPlayers + 1 &&
            parsed.historyMatrix.every(row => Array.isArray(row) && row.length === numPlayers + 1);
        const savedPlayers = Array.isArray(parsed.lastSchedule) ? parsed.lastSchedule.flat() : [];
        const scheduleIsValid = parsed.lastSchedule == null ||
            (Array.isArray(parsed.lastSchedule) && parsed.lastSchedule.length === numGroups &&
                parsed.lastSchedule.every(group => Array.isArray(group) && group.length > 0 && group.every(validPlayer)) &&
                new Set(savedPlayers).size === savedPlayers.length);
        if (!matrixIsValid || !scheduleIsValid) throw new Error('保存された履歴が不正です。');

        appState = {
            numPlayers,
            numGroups,
            dayCount: Number.isInteger(parsed.dayCount) && parsed.dayCount >= 1 ? parsed.dayCount : 1,
            historyMatrix: parsed.historyMatrix.map(row => row.map(value =>
                Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0)),
            lastSchedule: parsed.lastSchedule,
            malePlayers: Array.isArray(parsed.malePlayers)
                ? [...new Set(parsed.malePlayers.filter(validPlayer))]
                : []
        };
        lastSchedule = appState.lastSchedule;
        return true;
    } catch (error) {
        console.error('保存データを読み込めませんでした。', error);
        localStorage.removeItem('seatShuffleData');
        alert('保存データが壊れていたため、初期設定に戻しました。');
        return false;
    }
}

// 男性の入力文字列を解析
export function parseMalePlayers(numP, value) {
    let maleList = [];
    if (!value || value.trim() === "") return maleList;
    
    const rangeMatch = value.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        if (start > end) return [];
        for (let i = start; i <= end; i++) if (i >= 1 && i <= numP) maleList.push(i);
    } else {
        maleList = value.split(/[\s,]+/).map(Number)
            .filter(n => Number.isInteger(n) && n >= 1 && n <= numP);
    }
    return [...new Set(maleList)];
}

// 遭遇履歴の更新
export function updateHistory(schedule) {
    schedule.forEach(group => {
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                appState.historyMatrix[group[i]][group[j]]++;
                appState.historyMatrix[group[j]][group[i]]++;
            }
        }
    });
}

// 遭遇履歴の減算
export function downgradeHistory(schedule) {
    if (!schedule) return;
    schedule.forEach(group => {
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                if (appState.historyMatrix[group[i]][group[j]] > 0) appState.historyMatrix[group[i]][group[j]]--;
                if (appState.historyMatrix[group[j]][group[i]] > 0) appState.historyMatrix[group[j]][group[i]]--;
            }
        }
    });
}
