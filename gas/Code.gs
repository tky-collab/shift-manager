// ============================================================
//  Shift Manager – Google Apps Script
//  スプレッドシートIDをここに貼り付けてから Deploy してください
// ============================================================

const SPREADSHEET_ID = "11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc";

// ------------------------------------------------------------
//  POST：打刻データを受け取り、スタッフ別シートにupsert
// ------------------------------------------------------------
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const rows = Array.isArray(data) ? data : [data];
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);

    rows.forEach(row => {
      const sheet = getOrCreateStaffSheet(ss, row.staffName);
      upsertRow(sheet, row);
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
//  GET：疎通確認用
// ------------------------------------------------------------
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "Shift Manager GAS is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------
//  スタッフ名のシートを取得 or 新規作成
// ------------------------------------------------------------
function getOrCreateStaffSheet(ss, staffName) {
  let sheet = ss.getSheetByName(staffName);
  if (!sheet) {
    sheet = ss.insertSheet(staffName);

    // ヘッダー行
    sheet.appendRow(["日付", "出勤", "退勤", "休憩(分)", "実働(h)"]);
    sheet.setFrozenRows(1);

    // ヘッダースタイル
    const header = sheet.getRange(1, 1, 1, 5);
    header.setBackground("#1a1a2e")
          .setFontColor("#a78bfa")
          .setFontWeight("bold")
          .setHorizontalAlignment("center");

    // 列幅
    sheet.setColumnWidth(1, 110); // 日付
    sheet.setColumnWidth(2, 80);  // 出勤
    sheet.setColumnWidth(3, 80);  // 退勤
    sheet.setColumnWidth(4, 80);  // 休憩
    sheet.setColumnWidth(5, 80);  // 実働
  }
  return sheet;
}

// ------------------------------------------------------------
//  日付をキーにして行をupsert（同日の打刻を上書き更新）
// ------------------------------------------------------------
function upsertRow(sheet, row) {
  const { date, direction, inTime, outTime, breakMins } = row;
  const allValues = sheet.getDataRange().getValues(); // [header, ...data]

  // 2行目以降から日付列(index 0)で検索
  let targetRowIndex = -1;
  for (let i = 1; i < allValues.length; i++) {
    if (String(allValues[i][0]) === String(date)) {
      targetRowIndex = i + 1; // スプレッドシートは1始まり
      break;
    }
  }

  if (targetRowIndex === -1) {
    // 該当日の行がない → 新規追加
    const newInTime    = direction === "in"    ? (inTime    || "") : "";
    const newOutTime   = direction === "out"   ? (outTime   || "") : "";
    const newBreakMins = direction === "break" ? (breakMins || 0)  : 0;
    const workedH      = calcHours(newInTime, newOutTime, newBreakMins) || "";
    sheet.appendRow([date, newInTime, newOutTime, newBreakMins, workedH]);

    // 新行のスタイル
    const lastRow = sheet.getLastRow();
    styleDataRow(sheet, lastRow);

  } else {
    // 既存行を部分更新（打刻種別に応じて該当列だけ上書き）
    const existing     = allValues[targetRowIndex - 1];
    const newInTime    = direction === "in"    ? (inTime    || "") : (existing[1] || "");
    const newOutTime   = direction === "out"   ? (outTime   || "") : (existing[2] || "");
    const newBreakMins = direction === "break" ? (breakMins || 0)  : (existing[3] || 0);
    const workedH      = calcHours(newInTime, newOutTime, newBreakMins) || "";

    sheet.getRange(targetRowIndex, 1, 1, 5)
         .setValues([[date, newInTime, newOutTime, newBreakMins, workedH]]);
  }
}

// ------------------------------------------------------------
//  データ行のスタイル（交互色・中央寄せ）
// ------------------------------------------------------------
function styleDataRow(sheet, rowIndex) {
  const range = sheet.getRange(rowIndex, 1, 1, 5);
  const bg    = rowIndex % 2 === 0 ? "#1a1a2e" : "#12121e";
  range.setBackground(bg)
       .setFontColor("#f0ede8")
       .setHorizontalAlignment("center");
}

// ------------------------------------------------------------
//  実働時間計算
// ------------------------------------------------------------
function calcHours(start, end, breakMins) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm) - (breakMins || 0);
  if (mins <= 0) return null;
  return (mins / 60).toFixed(2);
}
