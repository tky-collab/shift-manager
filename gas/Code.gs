// シフト管理アプリ用 GAS
// 列構成: 日付 / 出勤 / 退勤 / 休憩(分) / 実働(h) / 時給 / 支払額
// 同じスタッフ・同じ日付は必ず1行にまとめる

var SPREADSHEET_ID = "11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc";
var HEADERS = ["日付", "出勤", "退勤", "休憩(分)", "実働(h)", "時給", "支払額"];

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (!Array.isArray(data)) data = [data];
  var tz = Session.getScriptTimeZone();

  data.forEach(function (d) {
    var sh = ss.getSheetByName(d.staffName) || ss.insertSheet(d.staffName);
    ensureHeader(sh);

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
    // 日付・出勤・退勤は文字列として扱う（Sheetsの自動時刻変換を防ぐ）
    sh.getRange(targetRow, 1, 1, 3).setNumberFormat("@");
    sh.getRange(targetRow, 1, 1, HEADERS.length).setValues([[
      dateStr, inT, outT, brk || "", hours, wage || "", pay
    ]]);
  });

  SpreadsheetApp.flush();
  return ContentService.createTextOutput("ok");
}

function ensureHeader(sh) {
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

// セル値をHH:mm文字列に変換（Google Sheetsが時刻型にした値でも復元できる）
function toTimeStr(v, tz) {
  if (v === "" || v === null || v === undefined) return "";
  if (v instanceof Date) return Utilities.formatDate(v, tz, "HH:mm");
  return String(v).trim();
}

function toDateStr(v, tz) {
  if (v === "" || v === null || v === undefined) return "";
  if (v instanceof Date) return Utilities.formatDate(v, tz, "yyyy-MM-dd");
  return String(v).trim();
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
function consolidateDuplicates() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tz = Session.getScriptTimeZone();
  ss.getSheets().forEach(function (sh) {
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    var values = sh.getRange(1, 1, lastRow, 7).getValues();
    var byDate = {};
    var order = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var key = toDateStr(row[0], tz);
      if (!key) continue;
      if (!byDate[key]) {
        byDate[key] = { date: key, inT: "", outT: "", brk: 0, wage: 0 };
        order.push(key);
      }
      var rec = byDate[key];
      var inStr = toTimeStr(row[1], tz);   if (inStr) rec.inT = inStr;
      var outStr = toTimeStr(row[2], tz);  if (outStr) rec.outT = outStr;
      var b = Number(row[3]); if (!isNaN(b) && b > rec.brk) rec.brk = b;
      var w = Number(row[5]); if (!isNaN(w) && w > rec.wage) rec.wage = w;
    }
    var out = [HEADERS];
    order.sort().forEach(function (key) {
      var r = byDate[key];
      var h = calcHours(r.inT, r.outT, r.brk);
      var pay = (h !== "" && r.wage > 0) ? Math.round(h * r.wage) : "";
      out.push([r.date, r.inT, r.outT, r.brk || "", h, r.wage || "", pay]);
    });
    sh.clear();
    // 日付・出勤・退勤列は文字列扱いにしてからwrite（Sheetsの自動時刻変換を防ぐ）
    if (out.length > 1) {
      sh.getRange(2, 1, out.length - 1, 3).setNumberFormat("@");
    }
    sh.getRange(1, 1, out.length, 7).setValues(out);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#e8e0ff");
  });
  SpreadsheetApp.flush();
}
