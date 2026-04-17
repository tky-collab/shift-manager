// シフト管理アプリ用 GAS
// 列構成: 日付 / 出勤 / 退勤 / 休憩(分) / 実働(h) / 時給 / 支払額
// 同じスタッフ・同じ日付は必ず1行にまとめる

var SPREADSHEET_ID = "11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc";
var HEADERS = ["日付", "出勤", "退勤", "休憩(分)", "実働(h)", "時給", "支払額"];

// シートで時給や時刻を手入力したら 実働・支払額 を自動再計算（シンプルトリガー）
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row < 2 || col > 7) return;

  // ヘッダーが「日付」で始まるシートだけ対象
  var header = sh.getRange(1, 1).getValue();
  if (header !== "日付") return;

  // 合計行を編集してしまった場合はスキップ
  if (sh.getRange(row, 1).getValue() === "合計") return;

  var tz = Session.getScriptTimeZone();
  var vals = sh.getRange(row, 1, 1, 7).getValues()[0];
  var inT = toTimeStr(vals[1], tz);
  var outT = toTimeStr(vals[2], tz);
  var brk = Number(vals[3]) || 0;
  var hours = calcHours(inT, outT, brk);
  var wage = Number(vals[5]) || 0;
  var pay = (hours !== "" && wage > 0) ? Math.round(hours * wage) : "";

  sh.getRange(row, 5).setValue(hours);
  sh.getRange(row, 7).setValue(pay);
  updateTotalRow(sh);
}

// シート最下行に「合計」行を設置／更新する
function updateTotalRow(sh) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  // 既存の合計行があれば削除してから作り直す
  if (sh.getRange(lastRow, 1).getValue() === "合計") {
    if (lastRow === 2) { sh.deleteRow(lastRow); return; }
    sh.deleteRow(lastRow);
    lastRow--;
  }
  if (lastRow < 2) return;

  var totalRow = lastRow + 1;
  sh.getRange(totalRow, 1).setValue("合計");
  sh.getRange(totalRow, 5).setFormula("=SUM(E2:E" + lastRow + ")");
  sh.getRange(totalRow, 7).setFormula("=SUM(G2:G" + lastRow + ")");
  sh.getRange(totalRow, 1, 1, 7)
    .setFontWeight("bold")
    .setBackground("#0f172a")
    .setFontColor("#fde68a");
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (!Array.isArray(data)) data = [data];
  var tz = Session.getScriptTimeZone();

  var touched = {};
  data.forEach(function (d) {
    var sh = ss.getSheetByName(d.staffName) || ss.insertSheet(d.staffName);
    ensureHeader(sh);
    if (!touched[d.staffName]) {
      // 合計行を一旦外す（findRowByDate が合計行を拾わないように）
      var lr = sh.getLastRow();
      if (lr >= 2 && sh.getRange(lr, 1).getValue() === "合計") sh.deleteRow(lr);
      touched[d.staffName] = sh;
    }

    var dateStr = String(d.date);
    var rowIdx = findRowByDate(sh, dateStr, tz);
    var existing = rowIdx === -1
      ? ["", "", "", "", "", "", ""]
      : sh.getRange(rowIdx, 1, 1, HEADERS.length).getValues()[0];

    // 既存データを土台に、新しい値で上書き（空は既存を維持）
    var inT  = pick(d.inTime,  toTimeStr(existing[1], tz));
    var outT = pick(d.outTime, toTimeStr(existing[2], tz));
    var brk  = pickNum(d.breakMins,  existing[3]);
    var wage = pickNum(d.hourlyWage, existing[5]);

    var hours = calcHours(inT, outT, brk);
    var pay = (hours !== "" && wage > 0) ? Math.round(hours * wage) : "";

    var targetRow = rowIdx === -1 ? sh.getLastRow() + 1 : rowIdx;
    sh.getRange(targetRow, 1, 1, HEADERS.length).setValues([[
      dateStr, inT, outT, brk || "", hours, wage || "", pay
    ]]);
  });

  // 書き込みが終わったシートごとに合計行を作り直す
  Object.keys(touched).forEach(function (name) { updateTotalRow(touched[name]); });

  SpreadsheetApp.flush();
  return ContentService.createTextOutput("ok");
}

function ensureHeader(sh) {
  // 列フォーマットを固定（Sheetsの時刻・日付自動変換を防ぐ）
  sh.getRange("A:C").setNumberFormat("@");
  sh.getRange("D:D").setNumberFormat("0");
  sh.getRange("E:E").setNumberFormat("0.00");
  sh.getRange("F:G").setNumberFormat("0");
  var firstRow = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var needsHeader = sh.getLastRow() === 0 || firstRow[0] !== HEADERS[0] || firstRow[6] !== HEADERS[6];
  if (needsHeader) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#e8e0ff");
  }
}

function findRowByDate(sh, dateStr, tz) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var col = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    var v = col[i][0];
    var s = v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v).trim();
    if (s === dateStr) return i + 2;
  }
  return -1;
}

// セル値をHH:mm文字列に変換（Date/日時文字列どちらでも正しく戻す）
function toTimeStr(v, tz) {
  if (v === "" || v === null || v === undefined) return "";
  if (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v.trim())) return v.trim();
  if (v && typeof v === "object" && typeof v.getTime === "function") {
    return Utilities.formatDate(v, tz, "HH:mm");
  }
  var s = String(v).trim();
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, "HH:mm");
  return s;
}

function toDateStr(v, tz) {
  if (v === "" || v === null || v === undefined) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  if (v && typeof v === "object" && typeof v.getTime === "function") {
    return Utilities.formatDate(v, tz, "yyyy-MM-dd");
  }
  var s = String(v).trim();
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  return s;
}

function pick(newVal, oldVal) {
  if (newVal !== undefined && newVal !== null && String(newVal) !== "") return String(newVal);
  return oldVal !== undefined && oldVal !== null ? String(oldVal) : "";
}

function pickNum(newVal, oldVal) {
  var n = Number(newVal);
  if (!isNaN(n) && n > 0) return n;
  var o = Number(oldVal);
  return !isNaN(o) && o > 0 ? o : 0;
}

function calcHours(inT, outT, brkMins) {
  if (!inT || !outT) return "";
  var inParts = String(inT).split(":");
  var outParts = String(outT).split(":");
  if (inParts.length < 2 || outParts.length < 2) return "";
  var inH = Number(inParts[0]), inM = Number(inParts[1]);
  var outH = Number(outParts[0]), outM = Number(outParts[1]);
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return "";
  var workMin = (outH * 60 + outM) - (inH * 60 + inM) - (Number(brkMins) || 0);
  if (!isFinite(workMin) || workMin <= 0) return "";
  return Math.round(workMin / 60 * 100) / 100;
}

// 既存シートの重複行を統合する（メニューから手動実行）
// シートを丸ごと作り直すことで、古いDate/Time型フォーマットの記憶を完全に消す
function consolidateDuplicates() {
  Logger.log("=== consolidateDuplicates v4 開始 ===");
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tz = Session.getScriptTimeZone();
  var sheets = ss.getSheets().slice(); // コピーしないとループ中に変わる

  sheets.forEach(function (oldSh) {
    var name = oldSh.getName();
    var lastRow = oldSh.getLastRow();
    if (lastRow < 2) { Logger.log(name + ": データなしスキップ"); return; }

    // 既存データを読む
    var values = oldSh.getRange(1, 1, lastRow, 7).getValues();
    var byDate = {};
    var order = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (row[0] === "合計") continue;
      var key = toDateStr(row[0], tz);
      if (!key) continue;
      if (!byDate[key]) {
        byDate[key] = { date: key, inT: "", outT: "", brk: 0, wage: 0 };
        order.push(key);
      }
      var rec = byDate[key];
      var inStr  = toTimeStr(row[1], tz); if (inStr)  rec.inT  = inStr;
      var outStr = toTimeStr(row[2], tz); if (outStr) rec.outT = outStr;
      var b = Number(row[3]); if (!isNaN(b) && b > rec.brk)  rec.brk  = b;
      var w = Number(row[5]); if (!isNaN(w) && w > rec.wage) rec.wage = w;
    }

    // 整形して出力配列を作る
    var rows = [];
    order.sort().forEach(function (key) {
      var r = byDate[key];
      var h = calcHours(r.inT, r.outT, r.brk);
      var pay = (h !== "" && r.wage > 0) ? Math.round(h * r.wage) : "";
      rows.push([r.date, r.inT, r.outT, r.brk || "", h, r.wage || "", pay]);
    });
    Logger.log(name + ": " + values.length + "行 → " + rows.length + "行, サンプル=" + JSON.stringify(rows[0]));

    // 新しい一時シートに書き出し → 元シートを削除 → リネーム
    var tmpName = name + "__tmp_" + new Date().getTime();
    var tmpSh = ss.insertSheet(tmpName);
    tmpSh.getRange("A:C").setNumberFormat("@");
    tmpSh.getRange("D:D").setNumberFormat("0");
    tmpSh.getRange("E:E").setNumberFormat("0.00");
    tmpSh.getRange("F:G").setNumberFormat("0");
    var all = [HEADERS].concat(rows);
    tmpSh.getRange(1, 1, all.length, 7).setValues(all);
    tmpSh.setFrozenRows(1);
    tmpSh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#e8e0ff");

    // 元シートを削除して一時シートをリネーム
    ss.deleteSheet(oldSh);
    tmpSh.setName(name);

    updateTotalRow(tmpSh);
  });

  SpreadsheetApp.flush();
  Logger.log("=== 完了 ===");
}
