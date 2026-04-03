function doPost(e){
  var data=JSON.parse(e.postData.contents),tz=Session.getScriptTimeZone(),ss=SpreadsheetApp.openById("11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc");
  if(!Array.isArray(data))data=[data];
  data.forEach(function(d){
    var sh=ss.getSheetByName(d.staffName)||ss.insertSheet(d.staffName);
    if(sh.getLastRow()===0)sh.appendRow(["日付","出勤","退勤","休憩(分)","実働(h)"]);
    var rows=sh.getDataRange().getValues(),idx=-1;
    for(var i=1;i<rows.length;i++){var c=rows[i][0]instanceof Date?Utilities.formatDate(rows[i][0],tz,"yyyy-MM-dd"):String(rows[i][0]);if(c===d.date){idx=i+1;break;}}
    var inT=d.inTime||"",outT=d.outTime||"",brk=Number(d.breakMins||0),m=0;
    if(inT&&outT)m=(parseInt(outT)*60+parseInt(outT.split(":")[1]))-(parseInt(inT)*60+parseInt(inT.split(":")[1]))-brk;
    var row=[[d.date,inT,outT,brk,m>0?(m/60).toFixed(2):""]];
    if(idx===-1)sh.getRange(sh.getLastRow()+1,1,1,5).setValues(row);else sh.getRange(idx,1,1,5).setValues(row);
  });
  SpreadsheetApp.flush();return ContentService.createTextOutput("ok");
}
