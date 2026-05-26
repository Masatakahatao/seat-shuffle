/**
 * main.js - 運用・保存機能付き
 */

// --- 状態管理 ---
let appState = {
    numPlayers: 0,
    numGroups: 0,
    dayCount: 1,
    historyMatrix: [],
    lastSchedule: null,
    // ★ 履歴を積み上げるための配列（スタック）
    historyStack: [] 
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

    // 1. 基本情報をセット
    appState.numPlayers = numP;
    appState.numGroups = numG;
    appState.dayCount = 1;

    // 2. 履歴行列の初期化 
    const matrixSize = numP + 1;
    appState.historyMatrix = Array.from({ length: matrixSize }, () => Array(matrixSize).fill(0));
    
    // 3. 履歴スタックを空にする（新しい運用を始めるため）
    appState.dayCount = 1;
    lastSchedule = null; // まだ席替えしてないのでnull
    appState.historyStack = [];

    // ★「0日目（真っさらな状態）」を最初の履歴として保存しておく
    const initialSnapshot = JSON.parse(JSON.stringify({
        dayCount: appState.dayCount,
        historyMatrix: appState.historyMatrix,
        lastSchedule: lastSchedule
    }));
    appState.historyStack.push(initialSnapshot);
    
    // 4. まとめて保存して、画面を切り替える
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

    // 50人設定時に51番以降を入力できないようにするチェック
    const invalidIds = absentList.filter(id => id > appState.numPlayers || id < 1);
    if (invalidIds.length > 0) {
        alert(`設定された人数（${appState.numPlayers}名）の範囲外の番号が含まれています: ${invalidIds.join(', ')}`);
        return;
    }
        
    // 出席者だけのリスト
    const players = Array.from({ length: appState.numPlayers }, (_, i) => i + 1)
                         .filter(p => !absentList.includes(p));

    if (players.length === 0) {
        alert("出席者がいません。");
        return;
    }

   const schedule = await solveSA(players, appState.numGroups, appState.historyMatrix);

   updateHistory(schedule);
    appState.dayCount++;
    lastSchedule = schedule; // ここで最新の結果を lastSchedule に入れる

    // 2. ★【ここが重要】更新が終わった「最新の状態」をコピーしてスタックに積む
    const snapshot = JSON.parse(JSON.stringify({
        dayCount: appState.dayCount,
        historyMatrix: appState.historyMatrix,
        lastSchedule: lastSchedule // 確定した席順を保存！
    }));
    appState.historyStack.push(snapshot);
    
    // 3. 画面表示と保存
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

// データの保存
function saveState() {
    // 保存する直前に、最新の結果をappStateに組み込む
    appState.lastSchedule = lastSchedule;
    localStorage.setItem('seatShuffleData', JSON.stringify(appState));
}
// データのリセット（統合版）
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

    // Excelで文字化けしないようにBOM（Byte Order Mark）を付与
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

// --- 以下、以前作成したSA法アルゴリズム ---

async function solveSA(players, numGroups, matrix) {
    let current = generateSimpleSchedule(players, numGroups);
    
    const getCost = (s) => {
        let cost = 0;
        
        // ★ 直近（前回）のスケジュールがあるか確認
        const hasLastSchedule = appState.lastSchedule && appState.lastSchedule.length > 0;

        // --- 【新機能】前回と同じ班番号に連続で入るのを防ぐための前処理 ---
        // 各プレイヤーが前回「何番の班（インデックス）」だったかを記録するマップを作る
        // 例: playerLastGroup[5] = 2 (プレイヤー5は前回2番目の班だった)
        const playerLastGroup = {};
        if (hasLastSchedule) {
            appState.lastSchedule.forEach((lastGroup, groupIndex) => {
                lastGroup.forEach(player => {
                    playerLastGroup[player] = groupIndex;
                });
            });
        }
        // -----------------------------------------------------------------

        s.forEach((g, currentGroupIndex) => {
            for (let i = 0; i < g.length; i++) {
                
                // --- 【新機能】個人の連続班番号ペナルティ ---
                if (hasLastSchedule) {
                    const currentPlayer = g[i];
                    // このプレイヤーが、前回所属していた班の番号を取得
                    const lastGroupIndex = playerLastGroup[currentPlayer];
                    
                    // もし前回の班番号と、今回の班番号（currentGroupIndex）が同じなら
                    if (lastGroupIndex === currentGroupIndex) {
                        // 絶対にその班にならないよう、超巨大なペナルティを加算
                        cost += 1000000; 
                    }
                }
                // ------------------------------------------

                for (let j = i + 1; j < g.length; j++) {
                    const p1 = g[i];
                    const p2 = g[j];
                    const count = matrix[p1][p2];

                    if (count === 0) {
                        // 未遭遇ペアには強力なボーナス
                        cost -= 1000; 
                    } else {
                        // 既遭遇ペアにはペナルティ
                        cost += Math.pow(count + 1, 3) * 10;
                    }
                }
            }
        });
        return cost;
    };

    let currentCost = getCost(current);
    // 初期の「熱量」を少し上げ、より広範囲に探索できるように調整
    let temp = 100.0; 
    
    // 試行回数は30000回を維持（十分な回数です）
    for (let i = 0; i < 30000; i++) {
        let next = swapRandomPlayers(current);
        let nextCost = getCost(next);
        let delta = nextCost - currentCost;
        
        // 改善されるか、確率的に改悪を受け入れる（焼きなまし法のキモ）
        if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
            current = next;
            currentCost = nextCost;
        }
        // 温度の下げ方を少し緩やかにして、じっくり最適解を探すように調整
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

// 8段階の色を取得する関数
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

// 行列テーブルを描画する関数
function drawMatrixTable() {
    const table = document.getElementById('matrix-table');
    table.innerHTML = "";
    const n = appState.numPlayers;
    const matrix = appState.historyMatrix;

    for (let i = 0; i <= n; i++) {
        const tr = document.createElement('tr');
        for (let j = 0; j <= n; j++) {
            const td = document.createElement(i === 0 || j === 0 ? 'th' : 'td');
            
            // スタイル設定
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
                // 自分自身との遭遇（斜めの線）
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

function displayResult(schedule) {
    const area = document.getElementById('result-area');
    const output = document.getElementById('schedule-output');
    area.style.display = 'block';
    output.innerHTML = "";
    
    schedule.forEach((group, i) => {
        const div = document.createElement('div');
        div.className = 'result-group';
        div.innerHTML = `<strong>${i + 1}班</strong><br>${group.sort((a,b)=>a-b).join(', ')}`;
        output.appendChild(div);
    });
    drawMatrixTable();
}

/**
 * 他のタブでデータが更新されたことを検知して画面を同期する
 */
window.addEventListener('storage', (event) => {
    // このアプリのデータキー 'seatShuffleData' が変更された時だけ反応する
    if (event.key === 'seatShuffleData' && event.newValue) {
        console.log("他のタブでデータが更新されました。画面を同期します。");
        
        // 最新のデータを読み込む
        appState = JSON.parse(event.newValue);
        
        // 画面の各パーツを最新状態に書き換える
        if (appState.lastSchedule) {
            lastSchedule = appState.lastSchedule;
            displayResult(lastSchedule); // 班の表示を更新
            drawMatrixTable();          // ヒートマップを更新
        }
        showOperationMode();             // ステータス表示（回数など）を更新
    }
    
    // データが削除（リセット）された場合
    if (event.key === 'seatShuffleData' && !event.newValue) {
        location.reload(); // 全てのタブを初期画面に戻す
    }
});

function undoLastAction() {
    // 1. 履歴が空、または1つしかない場合は戻れない（初期状態のみのため）
    if (!appState.historyStack || appState.historyStack.length <= 1) {
        alert("これ以上戻ることはできません。");
        return;
    }

    if (!confirm("最後に行った席替えを取り消して、1日前に戻しますか？")) {
        return;
    }

    // 2. 「今表示されている最新の状態」をスタックから捨てる
    appState.historyStack.pop();

    // 3. 「その一つ前（＝昨日）」のデータを参照する（コピーして取得）
    const lastIdx = appState.historyStack.length - 1;
    const prevSnapshot = JSON.parse(JSON.stringify(appState.historyStack[lastIdx]));

    // 4. 取り出した「昨日」のデータで今の状態を上書きする
    appState.dayCount = prevSnapshot.dayCount;
    appState.historyMatrix = prevSnapshot.historyMatrix;
    lastSchedule = prevSnapshot.lastSchedule;

    // 5. 画面と保存を更新
    saveState();
    
    // 席替え結果がある場合は表示、なければ消す（0日目対策）
    if (lastSchedule) {
        displayResult(lastSchedule);
    } else {
        document.getElementById('schedule-output').innerHTML = '';
        document.getElementById('result-area').style.display = 'none';
    }
    
    drawMatrixTable();
    showOperationMode();
    
    alert(`1日戻しました。`);
}

let isEditMode = false;

// 【機能1】編集モードの切り替え
function toggleEditMode() {
    isEditMode = !isEditMode;
    const output = document.getElementById('schedule-output');
    const editBtn = document.getElementById('edit-btn');
    const saveBtn = document.getElementById('save-edit-btn');

    if (isEditMode) {
        // 編集モード：テキスト入力欄に書き換える
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
        // キャンセル：元の表示に戻す
        editBtn.innerText = "✏️ 座席を編集";
        saveBtn.style.display = "none";
        displayResult(lastSchedule);
    }
}

// 【機能2】編集した内容をデータに反映する
function saveManualEdit() {
    if (!confirm("手動で編集した内容で履歴を更新しますか？")) return;

    // 1. 【重要】現在の「間違った（加算済みの）最新履歴」をスタックから完全に削除する
    // これにより、一つ前の日（または0日目）の状態が末尾になります
    appState.historyStack.pop();

    // 2. 削除した後の「新しい末尾（＝実行前の状態）」を取得する
    const lastSnapshot = appState.historyStack[appState.historyStack.length - 1];
    
    // 3. 行列を「実行前」のクリーンな状態に差し戻す
    appState.historyMatrix = JSON.parse(JSON.stringify(lastSnapshot.historyMatrix));

    // 4. 入力欄から新しい座席情報を取得
    const inputs = document.querySelectorAll('.edit-group-input');
    let newSchedule = [];
    inputs.forEach(input => {
        const members = input.value.split(/[\s,]+/)
                             .map(n => parseInt(n))
                             .filter(n => !isNaN(n));
        newSchedule.push(members);
    });

    // 5. クリーンになった行列に対して、新しい座席で「+1」する
    updateHistory(newSchedule);
    lastSchedule = newSchedule;

    // 6. 「編集後の最新状態」として、新しくスタックに積み直す
    const newSnapshot = JSON.parse(JSON.stringify({
        dayCount: appState.dayCount,
        historyMatrix: appState.historyMatrix,
        lastSchedule: lastSchedule
    }));
    appState.historyStack.push(newSnapshot);

    // 7. モード終了と再描画
    isEditMode = false;
    document.getElementById('edit-btn').innerText = "✏️ 座席を編集";
    document.getElementById('save-edit-btn').style.display = "none";
    
    displayResult(lastSchedule);
    drawMatrixTable();
    saveState();
    // tesutodanyo---n
    
    alert("座席と履歴を更新しました。");
};

// スマホ移行用：テキスト形式の履歴（班名付き）でも柔軟に読み込めるCSVインポート機能
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

        // 現在の設定人数と班の数を取得
        const P = parseInt(document.getElementById('playerCount').value || 40);
        const G = parseInt(document.getElementById('groupCount').value || 7);

        // 現在のアプリの状態に合わせて、履歴行列とスタックを完全に初期化
        appState.numPlayers = P;
        appState.numGroups = G;
        appState.dayCount = 2; // 昨日分を取り込むので、次回は「2回目」になる
        appState.historyMatrix = Array.from({ length: P + 1 }, () => Array(P + 1).fill(0));
        appState.lastSchedule = null;
        appState.historyStack = [];

        // 0日目（空っぽの状態）をスタックの底に仕込む
        const initialSnapshot = JSON.parse(JSON.stringify({
            dayCount: 1,
            historyMatrix: Array.from({ length: P + 1 }, () => Array(P + 1).fill(0)),
            lastSchedule: null
        }));
        appState.historyStack.push(initialSnapshot);

        let currentSchedule = [];

        lines.forEach((line) => {
            // コロン（:）や全角コロン（：）の右側のテキストだけを対象にする（コロンがなければ行全体）
            const parts = line.split(/[:：]/);
            const dataPart = parts.length > 1 ? parts[1] : parts[0];

            // カンマ、スペース、読点などで数字を区切って配列にする
            const members = dataPart.split(/[,,、 \t]+/)
                                    .map(n => parseInt(n.trim()))
                                    .filter(n => !isNaN(n)); // 数字じゃないものは除外

            // メンバーが1人以上検出された行だけを「班」として追加
            if (members.length > 0) {
                currentSchedule.push(members);
                
                // 遭遇マトリクス（ヒートマップ）の更新
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
            // 直近のスケジュール（昨日分）として記憶
            lastSchedule = currentSchedule;
            appState.lastSchedule = currentSchedule;
            
            // 最新の「昨日分を取り込み終わった状態」をスタックの2番目に積む
            const yesterdaySnapshot = JSON.parse(JSON.stringify({
                dayCount: appState.dayCount,
                historyMatrix: appState.historyMatrix,
                lastSchedule: lastSchedule
            }));
            appState.historyStack.push(yesterdaySnapshot);
            
            // データをブラウザに正しく保存して画面を更新（関数名を今のJSに統一）
            saveState();
            showOperationMode();
            drawMatrixTable();
            displayResult(lastSchedule);
            
            alert("過去の履歴を正常に読み込みました！これで明日から「同じ班番号を避ける」運用ができます。");
        } else {
            alert("有効なメンバーデータが見つかりませんでした。ファイルの中身を確認してください。");
        }
    };
    reader.readAsText(file);
}