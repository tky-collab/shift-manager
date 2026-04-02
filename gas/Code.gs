function doPost(e){
  var r=JSON.parse(e.postData.contents);if(!Array.isArray(r))r=[r];
  var ss=SpreadsheetApp.openById("11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc");
  r.forEach(function(d){
    var s=ss.getSheetByName(d.staffName)||ss.insertSheet(d.staffName);
    if(s.getLastRow()<1)s.appendRow(["日付","出勤","退勤","休憩(分)","実働(h)"]);
    var sp=d.inTime&&d.outTime?((parseInt(d.outTime)*60+parseInt(d.outTime.split(":")[1]))-(parseInt(d.inTime)*60+parseInt(d.inTime.split(":")[1]))-Number(d.breakMins||0)):0;
    var vals=s.getDataRange().getValues(),tz=Session.getScriptTimeZone(),idx=-1;
    for(var i=1;i<vals.length;i++){var cd=vals[i][0]instanceof Date?Utilities.formatDate(vals[i][0],tz,"yyyy-MM-dd"):String(vals[i][0]);if(cd===d.date){idx=i+1;break;}}
    var row=[[d.date,d.inTime||"",d.outTime||"",d.breakMins||0,sp>0?(sp/60).toFixed(2):""]];
    if(idx===-1)s.getRange(s.getLastRow()+1,1,1,5).setValues(row);else s.getRange(idx,1,1,5).setValues(row);
  });
  return ContentService.createTextOutput("ok");
}
