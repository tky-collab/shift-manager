// ============================================================
//  Shift Manager – Google Apps Script
// ============================================================

var SPREADSHEET_ID = "11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc";

// ------------------------------------------------------------
//  POST：打刻データを受け取り、スタッフ別シートにupsert
// ------------------------------------------------------------
function doPost(e) {
  try {
    var rows = JSON.parse(e.postData.contents);
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

    // 日付・時刻列をテキスト形式に設定（Sheetsの自動型変換を防ぐ）
    sheet.getRange("A:C").setNumberFormat("@");

    // ヘッダー行をsetValuesで書き込む
    var headerRange = sheet.getRange(1, 1, 1, 5);
    headerRange.setValues([["日付", "出勤", "退勤", "休憩(分)", "実働(h)"]]);
    sheet.setFrozenRows(1);

    headerRange.setBackground("#1a1a2e")
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
//  - 同じスタッフ・同じ日付は必ず1行にまとめる
//  - 出勤・退勤・休憩が揃ったら実働時間を自動計算
// ------------------------------------------------------------
function upsertRow(sheet, row) {
  var date      = String(row.date      || "");
  var inTime    = String(row.inTime    || "");
  var outTime   = String(row.outTime   || "");
  var breakMins = Number(row.breakMins || 0);
  var workedH   = calcHours(inTime, outTime, breakMins);

  var tz        = Session.getScriptTimeZone();
  var allValues = sheet.getDataRange().getValues();

  // ── 既存行の検索 ──────────────────────────────────────────
  // Google Sheets は "2026-04-03" 形式の文字列を Date 型に自動変換する。
  // getValues() で Date オブジェクトが返ってくるため、
  // Utilities.formatDate() でスクリプトのタイムゾーン基準に正規化して比較する。
  var targetRowIndex = -1;
  for (var i = 1; i < allValues.length; i++) {
    var cellVal = allValues[i][0];
    var cellDate = (cellVal instanceof Date)
      ? Utilities.formatDate(cellVal, tz, "yyyy-MM-dd")
      : String(cellVal);
    if (cellDate === date) {
      targetRowIndex = i + 1; // スプレッドシートは1始まり
      break;
    }
  }

  var writeData = [[date, inTime, outTime, breakMins, workedH !== null ? workedH : ""]];

  if (targetRowIndex === -1) {
    // 該当日の行がない → 新規追加
    var newRowIndex = sheet.getLastRow() + 1;
    sheet.getRange(newRowIndex, 1, 1, 5).setValues(writeData);
    styleDataRow(sheet, newRowIndex);
  } else {
    // 既存行を上書き（出勤・退勤・休憩を同じ行に集約）
    sheet.getRange(targetRowIndex, 1, 1, 5).setValues(writeData);
  }
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
//  "HH:MM" × 2 と休憩分を受け取り、実働時間(h) を文字列で返す
//  出勤・退勤どちらかが空の場合は null を返す
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
