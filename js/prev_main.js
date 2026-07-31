/**
 * main.js - 男女孤立防止（全員同性班も禁止） ＆ 前回メンバー重複排除 ＆ 座席色分け ＆ CSVインポート修正版
 */

// --- 状態管理 ---
let appState = {
    numPlayers: 0,
    numGroups: 0,
    dayCount: 1,
    historyMatrix: [],
    lastSchedule: null,
    malePlayers: [] // 男性プレイヤーのIDリスト
};

let lastSchedule = null;

// 起動時に保存データを確認
window.onload = () => {
    const saved = localStorage.getItem('seatShuffleData');
    if (saved) {
        appState = JSON.parse(saved);
        
        // 前回の結果（配列）も保存されている場合は復元
        if (appState.lastSchedule) {
            lastSchedule = appState.lastSchedule;
            displayResult(lastSchedule); // 画面に班を表示
            drawMatrixTable();          // ヒートマップを表示
        }
        
        showOperationMode();
    } else {
        document.getElementById('setup-section').style.display = 'block';
    }
};

// 男性の入力文字列を解析して配列にする共通ヘルパー関数
function parseMalePlayers(numP) {
    const maleInput = document.getElementById('malePlayerInput').value;
    let maleList = [];
    if (maleInput.trim() !== "") {
        const rangeMatch = maleInput.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            for (let i = start; i <= end; i++) {
                if (i <= numP) maleList.push(i);
            }
        } else {
            maleList = maleInput.split(/[\s,]+/).map(n => parseInt(n)).filter(n => !isNaN(n) && n <= numP);
        }
    }
    return maleList;
}

// 運用開始（初回設定）
function startOperation() {
    const pInput = document.getElementById('playerCount');
    const gInput = document.getElementById('groupCount');
    
    const numP = parseInt(pInput.value);
    const numG = parseInt(gInput.value);

    // --- 入力チェック ---
    if (numP > 50) {
        alert("システムの制限上、最大人数は50名です。");
        pInput.value = 50;
        return;
    }
    if (numP < 1 || numG < 1) {
        alert("人数と班の数は1以上で入力してください。");
        return;
    }
    if (numG > numP) {
        alert("班の数が人数を超えています。");
        return;
    }

    // 基本情報をセット
    appState.numPlayers = numP;
    appState.numGroups = numG;
    appState.malePlayers = parseMalePlayers(numP); 
    appState.dayCount = 1;

    // 履歴行列の初期化 
    const matrixSize = numP + 1;
    appState.historyMatrix = Array.from({ length: matrixSize }, () => Array(matrixSize).fill(0));
    
    lastSchedule = null;

    saveState();
    showOperationMode();
}

// 画面表示の切り替え
function showOperationMode() {
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('operation-section').style.display = 'block';
    document.getElementById('status-display').innerText = 
        `現在の設定: ${appState.numPlayers}人 / ${appState.numGroups}班 | 次回: 第${appState.dayCount}回目`;
}

// 席替え実行（メインロジック）
async function generateSchedule() {
    const absentInput = document.getElementById('absentPlayers').value;
    const absentList = absentInput.split(/[\s,]+/).map(n => parseInt(n)).filter(n => !isNaN(n));

    const invalidIds = absentList.filter(id => id > appState.numPlayers || id < 1);
    if (invalidIds.length > 0) {
        alert(`設定された人数（${appState.numPlayers}名）の範囲外の番号が含まれています: ${invalidIds.join(', ')}`);
        return;
    }
        
    const players = Array.from({ length: appState.numPlayers }, (_, i) => i + 1)
                         .filter(p => !absentList.includes(p));

    if (players.length === 0) {
        alert("出席者がいません。");
        return;
    }

    const schedule = await solveSA(players, appState.numGroups, appState.historyMatrix);

    updateHistory(schedule);
    appState.dayCount++;
    lastSchedule = schedule; 

    displayResult(schedule);
    drawMatrixTable();
    saveState();
    showOperationMode();
}

// 履歴行列を更新
function updateHistory(schedule) {
    schedule.forEach(group => {
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                appState.historyMatrix[group[i]][group[j]]++;
                appState.historyMatrix[group[j]][group[i]]++;
            }
        }
    });
}

// 履歴行列から減算（手動編集用）
function downgradeHistory(schedule) {
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

// データの保存
function saveState() {
    appState.lastSchedule = lastSchedule;
    localStorage.setItem('seatShuffleData', JSON.stringify(appState));
}

// データのリセット
function resetAllData() {
    if (confirm("全ての履歴と設定（何回目か等）を完全に消去して初期化しますか？")) {
        localStorage.removeItem('seatShuffleData');
        location.reload();
    }
}

/**
 * クリップボードにテキスト形式でコピー
 */
function copyToClipboard() {
    if (!lastSchedule) return;

    let text = `【第${appState.dayCount - 1}回 席替え結果】\n\n`;
    lastSchedule.forEach((group, i) => {
        text += `${i + 1}班: ${group.sort((a, b) => a - b).join(', ')}\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        alert("クリップボードにコピーしました!");
    });
}

/**
 * CSVとしてダウンロード
 */
function exportCSV() {
    if (!lastSchedule) return;

    let csvContent = "\uFEFF"; 
    csvContent += "グループ,メンバー\n";

    lastSchedule.forEach((group, i) => {
        csvContent += `${i + 1}班,"${group.sort((a, b) => a - b).join(', ')}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `seat_assignment_day${appState.dayCount - 1}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- SA法アルゴリズム ---
async function solveSA(players, numGroups, matrix) {
    let current = generateSimpleSchedule(players, numGroups);
    
    const getCost = (s) => {
        let cost = 0;
        
        const hasLastSchedule = appState.lastSchedule && appState.lastSchedule.length > 0;

        const lastGroupMap = {}; 
        if (hasLastSchedule) {
            appState.lastSchedule.forEach((lastGroup, groupIndex) => {
                lastGroup.forEach(player => {
                    lastGroupMap[player] = groupIndex;
                });
            });
        }

        s.forEach((g, currentGroupIndex) => {
            // 男女の人数カウント
            let maleCount = 0;
            let femaleCount = 0;

            g.forEach(player => {
                if (appState.malePlayers.includes(player)) {
                    maleCount++;
                } else {
                    femaleCount++;
                }
            });

            // ★【条件強化】男1人、女1人の「孤立」に加えて、「男だけ(女0)」「女だけ(男0)」の班にも巨大ペナルティ
            if (maleCount === 1 || femaleCount === 1 || maleCount === 0 || femaleCount === 0) {
                cost += 500000; 
            }

            for (let i = 0; i < g.length; i++) {
                const p1 = g[i];
                
                // 個人が前回と「全く同じ班番号」に連続で入るのを防ぐ
                if (hasLastSchedule && lastGroupMap[p1] === currentGroupIndex) {
                    cost += 1000000; 
                }

                for (let j = i + 1; j < g.length; j++) {
                    const p2 = g[j];

                    // 前回同じ班だった二人が、今回も同じ班(g)にいたら超大ペナルティ
                    if (hasLastSchedule && lastGroupMap[p1] !== undefined && lastGroupMap[p1] === lastGroupMap[p2]) {
                        cost += 200000; 
                    }

                    // 累積の遭遇履歴ペナルティ
                    const count = matrix[p1][p2];
                    if (count === 0) {
                        cost -= 1000; 
                    } else {
                        cost += Math.pow(count + 1, 3) * 10;
                    }
                }
            }
        });
        return cost;
    };

    let currentCost = getCost(current);
    let temp = 100.0; 
    
    for (let i = 0; i < 30000; i++) {
        let next = swapRandomPlayers(current);
        let nextCost = getCost(next);
        let delta = nextCost - currentCost;
        
        if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
            current = next;
            currentCost = nextCost;
        }
        temp *= 0.9997; 
    }
    return current;
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
    if (newSchedule[g1].length === 0 || newSchedule[g2].length === 0) return newSchedule;
    
    let i1 = Math.floor(Math.random() * newSchedule[g1].length);
    let i2 = Math.floor(Math.random() * newSchedule[g2].length);
    
    [newSchedule[g1][i1], newSchedule[g2][i2]] = [newSchedule[g2][i2], newSchedule[g1][i1]];
    return newSchedule;
}

function getHeatmapColor(count) {
    const colors = [
        "#ffffff", // 0回: 白
        "#e3f2fd", // 1回: 極薄青
        "#bbdefb", // 2回: 薄青
        "#90caf9", // 3回: 青
        "#fff59d", // 4回: 黄
        "#ffcc80", // 5回: オレンジ
        "#ffab91", // 6回: 濃いオレンジ
        "#ef9a9a"  // 7回以上: 赤
    ];
    return colors[Math.min(count, colors.length - 1)];
}

function drawMatrixTable() {
    const table = document.getElementById('matrix-table');
    if (!table) return;
    table.innerHTML = "";
    const n = appState.numPlayers;
    const matrix = appState.historyMatrix;

    for (let i = 0; i <= n; i++) {
        const tr = document.createElement('tr');
        for (let j = 0; j <= n; j++) {
            const td = document.createElement(i === 0 || j === 0 ? 'th' : 'td');
            
            td.style.border = "1px solid #ddd";
            td.style.width = "22px";
            td.style.height = "22px";

            if (i === 0 && j === 0) {
                td.innerText = "ID";
            } else if (i === 0) {
                td.innerText = j;
                td.style.background = "#f0f0f0";
            } else if (j === 0) {
                td.innerText = i;
                td.style.background = "#f0f0f0";
            } else if (i === j) {
                td.style.background = "#333"; 
            } else {
                const count = matrix[i][j];
                td.innerText = count > 0 ? count : "";
                td.style.background = getHeatmapColor(count);
            }
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
}

function generateStyledPlayerSpan(player) {
    const isMale = appState.malePlayers.includes(player);
    const color = isMale ? "#2196F3" : "#E91E63"; 
    return `<span style="color: ${color}; font-weight: bold;">${player}</span>`;
}

function displayResult(schedule) {
    const area = document.getElementById('result-area');
    const output = document.getElementById('schedule-output');
    area.style.display = 'block';
    output.innerHTML = "";
    
    schedule.forEach((group, i) => {
        const div = document.createElement('div');
        div.className = 'result-group';
        
        const sortedGroup = [...group].sort((a, b) => a - b);
        const styledMembers = sortedGroup.map(player => generateStyledPlayerSpan(player)).join(', ');

        div.innerHTML = `<strong>${i + 1}班</strong><br>${styledMembers}`;
        output.appendChild(div);
    });
    drawMatrixTable();
}

window.addEventListener('storage', (event) => {
    if (event.key === 'seatShuffleData' && event.newValue) {
        appState = JSON.parse(event.newValue);
        if (appState.lastSchedule) {
            lastSchedule = appState.lastSchedule;
            displayResult(lastSchedule);
            drawMatrixTable();
        }
        showOperationMode();
    }
    if (event.key === 'seatShuffleData' && !event.newValue) {
        location.reload();
    }
});

let isEditMode = false;

function toggleEditMode() {
    isEditMode = !isEditMode;
    const output = document.getElementById('schedule-output');
    const editBtn = document.getElementById('edit-btn');
    const saveBtn = document.getElementById('save-edit-btn');

    if (isEditMode) {
        editBtn.innerText = "❌ 編集をキャンセル";
        saveBtn.style.display = "inline-block";
        
        let html = "";
        lastSchedule.forEach((group, gIdx) => {
            html += `<div class="result-group">
                <strong>第 ${gIdx + 1} 班</strong><br>
                <input type="text" class="edit-group-input" data-idx="${gIdx}" 
                       value="${group.join(', ')}" style="width:100px; margin-top:5px;">
            </div>`;
        });
        output.innerHTML = html;
    } else {
        editBtn.innerText = "✏️ 座席を編集";
        saveBtn.style.display = "none";
        displayResult(lastSchedule);
    }
}

function saveManualEdit() {
    if (!confirm("手動で編集した内容で履歴を更新しますか？")) return;

    downgradeHistory(lastSchedule);

    const inputs = document.querySelectorAll('.edit-group-input');
    let newSchedule = [];
    inputs.forEach(input => {
        const members = input.value.split(/[\s,]+/)
                             .map(n => parseInt(n))
                             .filter(n => !isNaN(n));
        newSchedule.push(members);
    });

    updateHistory(newSchedule);
    lastSchedule = newSchedule;

    isEditMode = false;
    document.getElementById('edit-btn').innerText = "✏️ 座席を編集";
    document.getElementById('save-edit-btn').style.display = "none";
    
    displayResult(lastSchedule);
    drawMatrixTable();
    saveState();
    
    alert("座席と履歴を更新しました。");
}

function importCSV(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        
        if (lines.length === 0) {
            alert("CSVファイルが空、または正しく読み込めませんでした。");
            return;
        }

        const P = parseInt(document.getElementById('playerCount').value || 40);
        const G = parseInt(document.getElementById('groupCount').value || 7);

        appState.numPlayers = P;
        appState.numGroups = G;
        appState.malePlayers = parseMalePlayers(P); 
        appState.dayCount = 2; 
        appState.historyMatrix = Array.from({ length: P + 1 }, () => Array(P + 1).fill(0));
        appState.lastSchedule = null;

        let currentSchedule = [];

        lines.forEach((line) => {
            const parts = line.split(/[:：]/);
            const dataPart = parts.length > 1 ? parts[1] : parts[0];
            const members = dataPart.split(/[,,、 \t]+/)
                                    .map(n => parseInt(n.trim()))
                                    .filter(n => !isNaN(n));

            if (members.length > 0) {
                currentSchedule.push(members);
                
                for (let i = 0; i < members.length; i++) {
                    for (let j = i + 1; j < members.length; j++) {
                        const p1 = members[i];
                        const p2 = members[j];
                        if (p1 <= P && p2 <= P) {
                            appState.historyMatrix[p1][p2]++;
                            appState.historyMatrix[p2][p1]++;
                        }
                    }
                }
            }
        });

        if (currentSchedule.length > 0) {
            lastSchedule = currentSchedule;
            appState.lastSchedule = currentSchedule;
            
            saveState();
            showOperationMode();
            drawMatrixTable();
            displayResult(lastSchedule);
            
            alert("過去の履歴を正常に読み込みました！");
        } else {
            alert("有効なメンバーデータが見つかりませんでした。ファイルの中身を確認してください。");
        }
    };
    reader.readAsText(file);
}