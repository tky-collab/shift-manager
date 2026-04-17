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
    var inT  = pick(d.inTime,  existing[1]);
    var outT = pick(d.outTime, existing[2]);
    var brk  = pickNum(d.breakMins,  existing[3]);
    var wage = pickNum(d.hourlyWage, existing[5]);

    var hours = calcHours(inT, outT, brk);
    var pay = (hours !== "" && wage > 0) ? Math.round(hours * wage) : "";

    var targetRow = rowIdx === -1 ? sh.getLastRow() + 1 : rowIdx;
    sh.getRange(targetRow, 1).setNumberFormat("@");
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
  var inMin  = Number(inParts[0])  * 60 + Number(inParts[1]);
  var outMin = Number(outParts[0]) * 60 + Number(outParts[1]);
  var workMin = outMin - inMin - (Number(brkMins) || 0);
  if (workMin <= 0) return "";
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
    var header = values[0];
    var byDate = {};
    var order = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var d = row[0];
      var key = d instanceof Date ? Utilities.formatDate(d, tz, "yyyy-MM-dd") : String(d).trim();
      if (!key) continue;
      if (!byDate[key]) {
        byDate[key] = { date: key, inT: "", outT: "", brk: 0, wage: 0 };
        order.push(key);
      }
      var rec = byDate[key];
      if (row[1]) rec.inT = String(row[1]);
      if (row[2]) rec.outT = String(row[2]);
      var b = Number(row[3]); if (!isNaN(b) && b > rec.brk) rec.brk = b;
      var w = Number(row[5]); if (!isNaN(w) && w > rec.wage) rec.wage = w;
    }
    var out = [header];
    order.sort().forEach(function (key) {
      var r = byDate[key];
      var h = calcHours(r.inT, r.outT, r.brk);
      var pay = (h !== "" && r.wage > 0) ? Math.round(h * r.wage) : "";
      out.push([r.date, r.inT, r.outT, r.brk || "", h, r.wage || "", pay]);
    });
    sh.clear();
    sh.getRange(1, 1, out.length, 7).setValues(out);
    sh.getRange(2, 1, out.length - 1, 1).setNumberFormat("@");
    ensureHeader(sh);
  });
  SpreadsheetApp.flush();
}
