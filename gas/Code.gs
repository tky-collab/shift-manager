function doPost(e){
  var data=JSON.parse(e.postData.contents),ss=SpreadsheetApp.openById("11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc");
  if(!Array.isArray(data))data=[data];
  data.forEach(function(d){
    var sh=ss.getSheetByName(d.staffName)||ss.insertSheet(d.staffName);
    if(sh.getLastRow()===0)sh.getRange(1,1,1,5).setValues([["日付","出勤","退勤","休憩(分)","実働(h)"]]);
    var tz=Session.getScriptTimeZone(),vals=sh.getDataRange().getValues(),idx=-1;
    for(var i=1;i<vals.length;i++){var c=vals[i][0]instanceof Date?Utilities.formatDate(vals[i][0],tz,"yyyy-MM-dd"):String(vals[i][0]);if(c===d.date){idx=i+1;break;}}
    var inT=d.inTime||"",outT=d.outTime||"",brk=Number(d.breakMins||0),m=0;
    if(inT&&outT)m=(parseInt(outT)*60+parseInt(outT.split(":")[1]))-(parseInt(inT)*60+parseInt(inT.split(":")[1]))-brk;
    var nr=idx===-1?sh.getLastRow()+1:idx;
    sh.getRange(nr,1).setNumberFormat("@").setValue(d.date);
    sh.getRange(nr,2,1,4).setValues([[inT,outT,brk,m>0?(m/60).toFixed(2):""]]);
  });
  SpreadsheetApp.flush();return ContentService.createTextOutput("ok");
}
