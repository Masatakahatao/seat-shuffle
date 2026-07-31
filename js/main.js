import { appState, lastSchedule, setLastSchedule, loadState, saveState, parseMalePlayers, updateHistory, downgradeHistory, incrementDayCount } from './state.js';
import { solveSA } from './sa-solver.js';
import { exportToCSV, processCSVImport } from './csv-handler.js';

let isEditMode = false;

function validatePlayerInput(value, maxPlayer) {
    const trimmed = value.trim();
    if (trimmed === '') return true;
    const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        return start >= 1 && start <= end && end <= maxPlayer;
    }
    return trimmed.split(/[\s,]+/).every(token => {
        const player = Number(token);
        return Number.isInteger(player) && player >= 1 && player <= maxPlayer;
    });
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-btn').addEventListener('click', window.startOperation);
    document.getElementById('generate-btn').addEventListener('click', window.generateSchedule);
    document.getElementById('reset-btn').addEventListener('click', window.resetAllData);
    document.getElementById('edit-btn').addEventListener('click', window.toggleEditMode);
    document.getElementById('save-edit-btn').addEventListener('click', window.saveManualEdit);
    document.getElementById('copy-btn').addEventListener('click', window.copyToClipboard);
    document.getElementById('export-btn').addEventListener('click', window.exportCSV);
    document.getElementById('csv-file-input').addEventListener('change', event => window.importCSV(event.target));

    if (loadState()) {
        refreshUI();
    } else {
        document.getElementById('setup-section').style.display = 'block';
    }
});

function refreshUI() {
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('operation-section').style.display = 'block';
    document.getElementById('status-display').innerText = 
        `現在の設定: ${appState.numPlayers}人 / ${appState.numGroups}班 | 次回: 第${appState.dayCount}回目`;
    if (lastSchedule) {
        displayResult(lastSchedule);
    }
}

// --- 画面から呼ばれる関数群をwindowに公開 ---
window.startOperation = () => {
    const pInput = document.getElementById('playerCount');
    const gInput = document.getElementById('groupCount');
    const numP = Number(pInput.value);
    const numG = Number(gInput.value);

    if (!Number.isInteger(numP) || !Number.isInteger(numG) || numP > 50 || numP < 1 || numG < 1 || numG > numP) return alert("入力値が不正です。");
    const maleInput = document.getElementById('malePlayerInput').value;
    if (!validatePlayerInput(maleInput, numP)) return alert('男性プレイヤー番号の形式または範囲が不正です。');

    appState.numPlayers = numP;
    appState.numGroups = numG;
    appState.malePlayers = parseMalePlayers(numP, maleInput);
    appState.dayCount = 1;
    appState.historyMatrix = Array.from({ length: numP + 1 }, () => Array(numP + 1).fill(0));
    setLastSchedule(null);

    saveState();
    refreshUI();
};

window.generateSchedule = async () => {
    const absentInput = document.getElementById('absentPlayers').value;
    const absentList = absentInput.trim() === '' ? [] : absentInput.split(/[\s,]+/).map(Number);
    const invalidIds = absentList.filter(id => !Number.isInteger(id) || id < 1 || id > appState.numPlayers);
    if (invalidIds.length > 0) return alert(`範囲外または不正な欠席者番号があります: ${invalidIds.join(', ')}`);
    const players = Array.from({ length: appState.numPlayers }, (_, i) => i + 1).filter(p => !absentList.includes(p));

    if (players.length === 0) return alert("出席者がいません。");
    if (players.length < appState.numGroups) return alert('出席者数が班数より少ないため、席替えできません。');

    const button = document.getElementById('generate-btn');
    button.disabled = true;
    button.innerText = '計算中…';
    let schedule;
    try {
        schedule = await solveSA(players, appState.numGroups, appState.historyMatrix);
    } finally {
        button.disabled = false;
        button.innerText = '🎲 席替えを実行する';
    }
    updateHistory(schedule);
    incrementDayCount();
    setLastSchedule(schedule);

    saveState();
    refreshUI();
};

window.exportCSV = () => exportToCSV(lastSchedule, appState.dayCount);
window.importCSV = (input) => processCSVImport(input.files[0], refreshUI);

window.resetAllData = () => {
    if (confirm("完全に消去して初期化しますか？")) {
        localStorage.removeItem('seatShuffleData');
        location.reload();
    }
};

window.copyToClipboard = () => {
    if (!lastSchedule) return;
    let text = `【第${appState.dayCount - 1}回 席替え結果】\n\n`;
    lastSchedule.forEach((g, i) => text += `${i + 1}班: ${[...g].sort((a, b) => a - b).join(', ')}\n`);
    navigator.clipboard.writeText(text)
        .then(() => alert("コピーしました!"))
        .catch(() => alert('コピーできませんでした。ブラウザの権限を確認してください。'));
};

// 手動編集関連
window.toggleEditMode = () => {
    isEditMode = !isEditMode;
    const output = document.getElementById('schedule-output');
    if (isEditMode) {
        document.getElementById('edit-btn').innerText = "❌ キャンセル";
        document.getElementById('save-edit-btn').style.display = "inline-block";
        let html = "";
        lastSchedule.forEach((g, idx) => {
            html += `<div class="result-group"><strong>第 ${idx + 1} 班</strong><br><input type="text" class="edit-group-input" value="${g.join(', ')}"></div>`;
        });
        output.innerHTML = html;
    } else {
        document.getElementById('edit-btn').innerText = "✏️ 座席を編集";
        document.getElementById('save-edit-btn').style.display = "none";
        displayResult(lastSchedule);
    }
};

window.saveManualEdit = () => {
    if (!confirm("手動編集を確定しますか？")) return;
    const newSchedule = [];
    document.querySelectorAll('.edit-group-input').forEach(input => {
        const values = input.value.trim() === '' ? [] : input.value.split(/[\s,]+/).map(Number);
        newSchedule.push(values);
    });
    const flat = newSchedule.flat();
    const invalid = flat.filter(p => !Number.isInteger(p) || p < 1 || p > appState.numPlayers);
    if (invalid.length > 0) return alert(`範囲外または不正な番号があります: ${invalid.join(', ')}`);
    if (newSchedule.some(group => group.length === 0)) return alert('空の班は保存できません。');
    if (new Set(flat).size !== flat.length) return alert('同じ番号を複数の場所に登録できません。');
    const previousPlayers = lastSchedule.flat().sort((a, b) => a - b);
    const editedPlayers = [...flat].sort((a, b) => a - b);
    if (previousPlayers.length !== editedPlayers.length ||
        previousPlayers.some((player, index) => player !== editedPlayers[index])) {
        return alert('手動編集では参加者を追加・削除できません。班の移動だけを行ってください。');
    }

    downgradeHistory(lastSchedule);
    updateHistory(newSchedule);
    setLastSchedule(newSchedule);
    isEditMode = false;
    document.getElementById('edit-btn').innerText = "✏️ 座席を編集";
    document.getElementById('save-edit-btn').style.display = "none";
    saveState();
    refreshUI();
};

// --- 表示系ヘルパー ---
function displayResult(schedule) {
    const output = document.getElementById('schedule-output');
    document.getElementById('result-area').style.display = 'block';
    output.innerHTML = "";
    schedule.forEach((group, i) => {
        const div = document.createElement('div');
        div.className = 'result-group';
        const spans = [...group].sort((a,b)=>a-b).map(p => {
            const color = appState.malePlayers.includes(p) ? "#2196F3" : "#E91E63";
            return `<span style="color: ${color}; font-weight: bold;">${p}</span>`;
        }).join(', ');
        div.innerHTML = `<strong>${i + 1}班</strong><br>${spans}`;
        output.appendChild(div);
    });
    drawMatrixTable();
}

function drawMatrixTable() {
    const table = document.getElementById('matrix-table');
    if (!table) return;
    table.innerHTML = "";
    const n = appState.numPlayers;
    const colors = ["#ffffff", "#e3f2fd", "#bbdefb", "#90caf9", "#fff59d", "#ffcc80", "#ffab91", "#ef9a9a"];

    for (let i = 0; i <= n; i++) {
        const tr = document.createElement('tr');
        for (let j = 0; j <= n; j++) {
            const td = document.createElement(i === 0 || j === 0 ? 'th' : 'td');
            td.style.border = "1px solid #ddd"; td.style.width = "22px"; td.style.height = "22px";
            if (i === 0 && j === 0) td.innerText = "ID";
            else if (i === 0) { td.innerText = j; td.style.background = "#f0f0f0"; }
            else if (j === 0) { td.innerText = i; td.style.background = "#f0f0f0"; }
            else if (i === j) td.style.background = "#333";
            else {
                const count = appState.historyMatrix[i][j];
                td.innerText = count > 0 ? count : "";
                td.style.background = colors[Math.min(count, colors.length - 1)];
            }
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
}
