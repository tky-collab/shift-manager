var SS_ID = "11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc";

function doPost(e) {
  var rows = JSON.parse(e.postData.contents);
  if (!Array.isArray(rows)) rows = [rows];
  var ss = SpreadsheetApp.openById(SS_ID);
  rows.forEach(function(r) {
    var sheet = getSheet(ss, r.staffName);
    var date = r.date || "";
    var inTime = r.inTime || "";
    var outTime = r.outTime || "";
    var breakMins = Number(r.breakMins) || 0;
    var worked = calcHours(inTime, outTime, breakMins);
    var tz = Session.getScriptTimeZone();
    var data = sheet.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      var d = data[i][0] instanceof Date ? Utilities.formatDate(data[i][0], tz, "yyyy-MM-dd") : String(data[i][0]);
      if (d === date) { rowIdx = i + 1; break; }
    }
    var row = [[date, inTime, outTime, breakMins, worked || ""]];
    if (rowIdx === -1) sheet.getRange(sheet.getLastRow() + 1, 1, 1, 5).setValues(row);
    else sheet.getRange(rowIdx, 1, 1, 5).setValues(row);
  });
  SpreadsheetApp.flush();
  return ContentService.createTextOutput("ok");
}

function getSheet(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, 5).setValues([["日付", "出勤", "退勤", "休憩(分)", "実働(h)"]]);
    s.setFrozenRows(1);
  }
  return s;
}

function calcHours(start, end, breakMins) {
  if (!start || !end) return null;
  var s = start.split(":"), e = end.split(":");
  var mins = (parseInt(e[0]) * 60 + parseInt(e[1])) - (parseInt(s[0]) * 60 + parseInt(s[1])) - breakMins;
  return mins > 0 ? (mins / 60).toFixed(2) : null;
}
