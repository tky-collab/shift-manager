// ============================================================
//  Shift Manager – Google Apps Script
// ============================================================

var SPREADSHEET_ID = "11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc";

// ------------------------------------------------------------
//  POST：打刻データを受け取り、スタッフ別シートにupsert
// ------------------------------------------------------------
function doPost(e) {
  try {
    var body = e.postData.contents;
    var rows = JSON.parse(body);
    if (!Array.isArray(rows)) rows = [rows];

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    rows.forEach(function(row) {
      var sheet = getOrCreateStaffSheet(ss, row.staffName);
      upsertRow(sheet, row);
    });

    SpreadsheetApp.flush();

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", count: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------
//  GET：疎通確認用
// ------------------------------------------------------------
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "Shift Manager GAS is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------
//  スタッフ名のシートを取得 or 新規作成
// ------------------------------------------------------------
function getOrCreateStaffSheet(ss, staffName) {
  var sheet = ss.getSheetByName(staffName);
  if (!sheet) {
    sheet = ss.insertSheet(staffName);
    sheet.appendRow(["日付", "出勤", "退勤", "休憩(分)", "実働(h)"]);
    sheet.setFrozenRows(1);

    // 日付・時刻列をテキスト形式に固定（Sheetsの自動型変換を防ぐ）
    sheet.getRange("A:C").setNumberFormat("@");

    var header = sheet.getRange(1, 1, 1, 5);
    header.setBackground("#1a1a2e")
          .setFontColor("#a78bfa")
          .setFontWeight("bold")
          .setHorizontalAlignment("center");

    sheet.setColumnWidth(1, 110);
    sheet.setColumnWidth(2, 80);
    sheet.setColumnWidth(3, 80);
    sheet.setColumnWidth(4, 80);
    sheet.setColumnWidth(5, 80);
  }
  return sheet;
}

// ------------------------------------------------------------
//  日付をキーにして行をupsert
// ------------------------------------------------------------
function upsertRow(sheet, row) {
  var date      = String(row.date      || "");
  var inTime    = String(row.inTime    || "");
  var outTime   = String(row.outTime   || "");
  var breakMins = Number(row.breakMins || 0);
  var workedH   = calcHours(inTime, outTime, breakMins);

  var allValues = sheet.getDataRange().getValues();

  // Google Sheets が日付セルを Date 型に変換することがあるため
  // toDateStr() で "YYYY-MM-DD" に正規化してから比較する
  var targetRowIndex = -1;
  for (var i = 1; i < allValues.length; i++) {
    if (toDateStr(allValues[i][0]) === date) {
      targetRowIndex = i + 1; // スプレッドシートは1始まり
      break;
    }
  }

  var writeRow = [date, inTime, outTime, breakMins, workedH !== null ? workedH : ""];

  if (targetRowIndex === -1) {
    sheet.appendRow(writeRow);
    styleDataRow(sheet, sheet.getLastRow());
  } else {
    sheet.getRange(targetRowIndex, 1, 1, 5).setValues([writeRow]);
  }
}

// ------------------------------------------------------------
//  セル値を "YYYY-MM-DD" 文字列に変換する
//  （Sheets が Date 型で返してきた場合も正しく処理する）
// ------------------------------------------------------------
function toDateStr(val) {
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart(2, "0");
    var d = String(val.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  return String(val);
}

// ------------------------------------------------------------
//  データ行のスタイル（交互色・中央寄せ）
// ------------------------------------------------------------
function styleDataRow(sheet, rowIndex) {
  var range = sheet.getRange(rowIndex, 1, 1, 5);
  var bg    = (rowIndex % 2 === 0) ? "#1a1a2e" : "#12121e";
  range.setBackground(bg)
       .setFontColor("#f0ede8")
       .setHorizontalAlignment("center");
}

// ------------------------------------------------------------
//  実働時間計算
//  "HH:MM" 2つと休憩分を受け取り、実働時間(h)の文字列を返す
// ------------------------------------------------------------
function calcHours(start, end, breakMins) {
  if (!start || !end || start === "" || end === "") return null;

  var sp = start.split(":");
  var ep = end.split(":");
  if (sp.length < 2 || ep.length < 2) return null;

  var sh = parseInt(sp[0], 10);
  var sm = parseInt(sp[1], 10);
  var eh = parseInt(ep[0], 10);
  var em = parseInt(ep[1], 10);

  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;

  var mins = (eh * 60 + em) - (sh * 60 + sm) - Number(breakMins || 0);
  if (mins <= 0) return null;

  return (mins / 60).toFixed(2);
}
