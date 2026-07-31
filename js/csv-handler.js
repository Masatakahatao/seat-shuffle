import { appState, setLastSchedule, parseMalePlayers, saveState } from './state.js';

export function exportToCSV(lastSchedule, dayCount) {
    if (!lastSchedule) return;
    let csvContent = "\uFEFFグループ,メンバー\n";
    lastSchedule.forEach((group, i) => {
        csvContent += `${i + 1}班,"${[...group].sort((a, b) => a - b).join(', ')}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `seat_assignment_day${dayCount - 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

export function processCSVImport(file, onComplete) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        if (lines.length === 0) return alert("CSVファイルが空です。");

        const P = Number(document.getElementById('playerCount').value || 40);
        const G = Number(document.getElementById('groupCount').value || 7);
        if (!Number.isInteger(P) || P < 1 || P > 50 || !Number.isInteger(G) || G < 1 || G > P) {
            return alert('人数または班数の設定が不正です。');
        }

        const currentSchedule = [];
        lines.forEach((rawLine) => {
            const line = rawLine.replace(/^\uFEFF/, '').trim();
            if (/^グループ\s*,/.test(line)) return;

            const csvMatch = line.match(/^\s*\d+班\s*,\s*"?([^"\r\n]*)"?\s*$/);
            const legacyMatch = line.match(/^\s*(?:\d+班\s*)?[:：]\s*(.*)$/);
            const dataPart = csvMatch?.[1] ?? legacyMatch?.[1];
            if (dataPart == null) return;
            const members = dataPart.split(/[,、 \t]+/).map(Number)
                .filter(n => Number.isInteger(n));
            if (members.length > 0) {
                currentSchedule.push(members);
            }
        });

        const flat = currentSchedule.flat();
        const invalid = flat.filter(p => p < 1 || p > P);
        if (currentSchedule.length === 0) return alert('有効な座席データが見つかりませんでした。');
        if (currentSchedule.length !== G) return alert(`CSVの班数が設定（${G}班）と一致しません。`);
        if (invalid.length > 0) return alert(`範囲外の番号があります: ${[...new Set(invalid)].join(', ')}`);
        if (new Set(flat).size !== flat.length) return alert('同じ番号が複数回含まれています。');

        appState.numPlayers = P;
        appState.numGroups = G;
        appState.malePlayers = parseMalePlayers(P, document.getElementById('malePlayerInput').value);
        appState.dayCount = 2;
        appState.historyMatrix = Array.from({ length: P + 1 }, () => Array(P + 1).fill(0));
        currentSchedule.forEach(members => {
            for (let i = 0; i < members.length; i++) {
                for (let j = i + 1; j < members.length; j++) {
                    appState.historyMatrix[members[i]][members[j]]++;
                    appState.historyMatrix[members[j]][members[i]]++;
                }
            }
        });
        setLastSchedule(currentSchedule);
        saveState();
        onComplete();
        alert("過去の履歴を正常に読み込みました！");
    };
    reader.readAsText(file);
}
