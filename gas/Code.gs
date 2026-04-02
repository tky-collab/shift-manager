var SPREADSHEET_ID="11XyuNAA5fJ50O7t2ECe0eu2j7PR0o2spkF5tgmYlsXc";

function doPost(e){
  try{
    var rows=JSON.parse(e.postData.contents);
    if(!Array.isArray(rows))rows=[rows];
    var ss=SpreadsheetApp.openById(SPREADSHEET_ID);
    rows.forEach(function(row){upsertRow(getSheet(ss,row.staffName),row);});
    SpreadsheetApp.flush();
    return ContentService.createTextOutput(JSON.stringify({status:"ok"})).setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({status:"error",message:String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(){
  return ContentService.createTextOutput(JSON.stringify({status:"ok"})).setMimeType(ContentService.MimeType.JSON);
}

function getSheet(ss,name){
  var s=ss.getSheetByName(name);
  if(!s){
    s=ss.insertSheet(name);
    s.getRange("A:C").setNumberFormat("@");
    s.getRange(1,1,1,5).setValues([["日付","出勤","退勤","休憩(分)","実働(h)"]]);
    s.setFrozenRows(1);
  }
  return s;
}

function upsertRow(sheet,row){
  var date=String(row.date||"");
  var inTime=String(row.inTime||"");
  var outTime=String(row.outTime||"");
  var breakMins=Number(row.breakMins||0);
  var worked=calcHours(inTime,outTime,breakMins);
  var tz=Session.getScriptTimeZone();
  var vals=sheet.getDataRange().getValues();
  var idx=-1;
  for(var i=1;i<vals.length;i++){
    var v=vals[i][0];
    var d=(v instanceof Date)?Utilities.formatDate(v,tz,"yyyy-MM-dd"):String(v);
    if(d===date){idx=i+1;break;}
  }
  var data=[[date,inTime,outTime,breakMins,worked!==null?worked:""]];
  if(idx===-1){sheet.getRange(sheet.getLastRow()+1,1,1,5).setValues(data);}
  else{sheet.getRange(idx,1,1,5).setValues(data);}
}

function calcHours(start,end,breakMins){
  if(!start||!end)return null;
  var sp=start.split(":"),ep=end.split(":");
  if(sp.length<2||ep.length<2)return null;
  var sh=parseInt(sp[0],10),sm=parseInt(sp[1],10);
  var eh=parseInt(ep[0],10),em=parseInt(ep[1],10);
  if(isNaN(sh)||isNaN(sm)||isNaN(eh)||isNaN(em))return null;
  var mins=(eh*60+em)-(sh*60+sm)-Number(breakMins||0);
  if(mins<=0)return null;
  return(mins/60).toFixed(2);
}
