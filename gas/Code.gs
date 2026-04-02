// ============================================================
//  Shift Manager – Google Apps Script
//  スプレッドシートIDをここに貼り付けてから Deploy してください
// ============================================================

const SPREADSHEET_ID = "ここにスプレッドシートIDを貼り付け";
const SHEET_NAME     = "打刻記録";

// ------------------------------------------------------------
//  POST リクエストを受け取って行を追記する
// ------------------------------------------------------------
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const rows = Array.isArray(data) ? data : [data];

    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(SHEET_NAME);

    // シートがなければ新規作成してヘッダーを挿入
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(["記録日時", "日付", "スタッフ名", "種別", "出勤", "退勤", "休憩(分)", "実働(h)"]);
      sheet.setFrozenRows(1);
      // ヘッダー行のスタイル
      const header = sheet.getRange(1, 1, 1, 8);
      header.setBackground("#1a1a2e").setFontColor("#a78bfa").setFontWeight("bold");
    }

    rows.forEach(row => {
      const workedH = calcHours(row.inTime, row.outTime, row.breakMins || 0);
      sheet.appendRow([
        new Date().toLocaleString("ja-JP"),  // 記録日時
        row.date        || "",               // 日付
        row.staffName   || "",               // スタッフ名
        row.direction   || "",               // 出勤 / 退勤 / 休憩
        row.inTime      || "",               // 出勤時刻
        row.outTime     || "",               // 退勤時刻
        row.breakMins   || 0,                // 休憩分
        workedH         || "",               // 実働時間
      ]);
    });

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", count: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------
//  GET リクエスト：疎通確認用
// ------------------------------------------------------------
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "Shift Manager GAS is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------
//  実働時間計算（App.js と同じロジック）
// ------------------------------------------------------------
function calcHours(start, end, breakMins) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm) - (breakMins || 0);
  if (mins <= 0) return null;
  return (mins / 60).toFixed(2);
}
