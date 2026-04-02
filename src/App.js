import { useState, useEffect } from "react";

const STAFF_LIST = ["スタッフ1", "スタッフ2", "スタッフ3", "スタッフ4", "スタッフ5", "スタッフ6", "スタッフ7"];
const initialStaff = STAFF_LIST.map((name, i) => ({ id: i + 1, name }));

function formatTime(date) { return date.toTimeString().slice(0, 5); }
function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function calcHours(start, end, breakMins=0) {
  if (!start||!end) return null;
  const [sh,sm]=start.split(":").map(Number);
  const [eh,em]=end.split(":").map(Number);
  const mins=(eh*60+em)-(sh*60+sm)-(breakMins||0);
  if (mins<=0) return null;
  return (mins/60).toFixed(2);
}
function loadFromStorage(key,fallback) {
  try { const v=localStorage.getItem(key); return v?JSON.parse(v):fallback; } catch { return fallback; }
}

export default function ShiftManager() {
  const [staff,setStaff]=useState(()=>loadFromStorage("shift_staff",initialStaff));
  const [records,setRecords]=useState(()=>loadFromStorage("shift_records",[]));
  const [tab,setTab]=useState("punch");
  const [selectedIds,setSelectedIds]=useState([]);
  const [punchType,setPunchType]=useState("clock");
  const [manualTime,setManualTime]=useState("09:00");
  const [direction,setDirection]=useState("in");
  const [breakMins,setBreakMins]=useState(60);
  const [now,setNow]=useState(new Date());
  const [editingName,setEditingName]=useState(null);
  const [editNameVal,setEditNameVal]=useState("");
  const [newName,setNewName]=useState("");
  const [toast,setToast]=useState(null);
  const [exportModal,setExportModal]=useState(false);
  const [exportMonth,setExportMonth]=useState("all");
  const [gasUrl,setGasUrl]=useState(()=>localStorage.getItem("shift_gas_url")||"");
  const [gasUrlInput,setGasUrlInput]=useState(()=>localStorage.getItem("shift_gas_url")||"");
  const [syncStatus,setSyncStatus]=useState(null); // "syncing" | "ok" | "error"

  useEffect(()=>{ const t=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(t); },[]);
  useEffect(()=>{ localStorage.setItem("shift_staff",JSON.stringify(staff)); },[staff]);
  useEffect(()=>{ localStorage.setItem("shift_records",JSON.stringify(records)); },[records]);

  async function syncToSheet(rows) {
    if (!gasUrl) return;
    setSyncStatus("syncing");
    try {
      await fetch(gasUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      setSyncStatus("ok");
    } catch {
      setSyncStatus("error");
    } finally {
      setTimeout(() => setSyncStatus(null), 3000);
    }
  }

  function saveGasUrl() {
    localStorage.setItem("shift_gas_url", gasUrlInput.trim());
    setGasUrl(gasUrlInput.trim());
    showToast(gasUrlInput.trim() ? "スプレッドシート連携を設定したで！" : "連携を解除したで");
  }

  function showToast(msg,type="success") { setToast({msg,type}); setTimeout(()=>setToast(null),2500); }
  function toggleSelect(id) { setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]); }
  function selectAll() { if(selectedIds.length===staff.length)setSelectedIds([]); else setSelectedIds(staff.map(s=>s.id)); }

  function handlePunch() {
    if(selectedIds.length===0){showToast("スタッフを選んでや！","warn");return;}
    const time=punchType==="clock"?formatTime(now):manualTime;
    const date=formatDate(now);
    const newRecords=[...records];
    selectedIds.forEach(id=>{
      const member=staff.find(s=>s.id===id);
      const existing=newRecords.findIndex(r=>r.staffId===id&&r.date===date);
      if(existing>=0){
        if(direction==="in")newRecords[existing]={...newRecords[existing],inTime:time};
        else if(direction==="out")newRecords[existing]={...newRecords[existing],outTime:time};
        else if(direction==="break")newRecords[existing]={...newRecords[existing],breakMins};
      } else {
        newRecords.push({id:Date.now()+id,staffId:id,staffName:member.name,date,inTime:direction==="in"?time:"",outTime:direction==="out"?time:"",breakMins:direction==="break"?breakMins:0});
      }
    });
    setRecords(newRecords);setSelectedIds([]);
    const label=direction==="in"?"出勤":direction==="out"?"退勤":`休憩(${breakMins}分)`;
    showToast(`${selectedIds.length}人の${label}を記録したで！`);

    // スプレッドシートに同期
    const syncRows = selectedIds.map(id => {
      const rec = newRecords.find(r => r.staffId===id && r.date===date);
      return { staffName: rec?.staffName||"", date, direction, inTime: rec?.inTime||"", outTime: rec?.outTime||"", breakMins: direction==="break"?breakMins:rec?.breakMins||0 };
    });
    syncToSheet(syncRows);
  }

  function deleteRecord(id){setRecords(prev=>prev.filter(r=>r.id!==id));}
  function getAvailableMonths(){return[...new Set(records.map(r=>r.date.slice(0,7)))].sort().reverse();}

  function exportCSV(monthFilter="all"){
    const filtered=monthFilter==="all"?records:records.filter(r=>r.date.startsWith(monthFilter));
    if(filtered.length===0){showToast("記録がないで","warn");return;}
    const header="日付,名前,出勤時間,退勤時間,休憩(分),実働時間(h)";
    const rows=filtered.sort((a,b)=>a.date.localeCompare(b.date)).map(r=>{
      const h=calcHours(r.inTime,r.outTime,r.breakMins||0)||"-";
      return `${r.date},${r.staffName},${r.inTime||"-"},${r.outTime||"-"},${r.breakMins||0},${h}`;
    });
    const csv=[header,...rows].join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`シフト記録_${monthFilter==="all"?"全期間":monthFilter}.csv`;a.click();
    URL.revokeObjectURL(url);setExportModal(false);showToast("📥 ダウンロード完了！");
  }

  function startEdit(s){setEditingName(s.id);setEditNameVal(s.name);}
  function saveEdit(id){
    if(!editNameVal.trim())return;
    setStaff(prev=>prev.map(s=>s.id===id?{...s,name:editNameVal.trim()}:s));
    setRecords(prev=>prev.map(r=>r.staffId===id?{...r,staffName:editNameVal.trim()}:r));
    setEditingName(null);
  }
  function addStaff(){
    if(!newName.trim())return;
    setStaff(prev=>[...prev,{id:Date.now(),name:newName.trim()}]);
    setNewName("");showToast(`${newName.trim()}を追加したで！`);
  }
  function removeStaff(id){setStaff(prev=>prev.filter(s=>s.id!==id));setSelectedIds(prev=>prev.filter(x=>x!==id));}

  const todayRecords=records.filter(r=>r.date===formatDate(now));
  const groupedRecords=records.reduce((acc,r)=>{if(!acc[r.date])acc[r.date]=[];acc[r.date].push(r);return acc;},{});
  const S={
    wrap:{minHeight:"100vh",background:"#0f0f14",color:"#f0ede8",fontFamily:"'Noto Sans JP',sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:80},
    header:{background:"linear-gradient(135deg,#1a1a2e,#16213e)",padding:"20px 20px 16px",borderBottom:"1px solid #2a2a3e",position:"sticky",top:0,zIndex:100},
    card:{background:"#1a1a2e",borderRadius:16,padding:"14px 16px",border:"1px solid #2a2a3e",marginBottom:16},
  };

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"#6c7a9c",letterSpacing:3,textTransform:"uppercase",marginBottom:2}}>Shift Manager</div>
            <div style={{fontSize:22,fontWeight:700,color:"#e8e0ff"}}>{now.toLocaleDateString("ja-JP",{month:"long",day:"numeric",weekday:"short"})}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:32,fontWeight:300,color:"#a78bfa",letterSpacing:-1}}>{now.toTimeString().slice(0,8)}</div>
            {syncStatus==="syncing"&&<div style={{fontSize:10,color:"#6c7a9c",marginTop:2}}>📡 同期中...</div>}
            {syncStatus==="ok"&&<div style={{fontSize:10,color:"#34d399",marginTop:2}}>✓ シート同期済み</div>}
            {syncStatus==="error"&&<div style={{fontSize:10,color:"#f87171",marginTop:2}}>⚠ 同期失敗</div>}
            {!syncStatus&&gasUrl&&<div style={{fontSize:10,color:"#4c4c6e",marginTop:2}}>🔗 シート連携中</div>}
          </div>
        </div>
      </div>

      {toast&&<div style={{position:"fixed",top:80,left:"50%",transform:"translateX(-50%)",background:toast.type==="warn"?"#7c3aed":"#059669",color:"#fff",padding:"10px 20px",borderRadius:12,zIndex:999,fontSize:14,fontWeight:600,whiteSpace:"nowrap"}}>{toast.msg}</div>}

      <div style={{padding:"0 16px"}}>
        {tab==="punch"&&(
          <div>
            <div style={{display:"flex",gap:8,marginTop:20,marginBottom:16}}>
              {[["in","🟢 出勤"],["out","🔴 退勤"],["break","☕ 休憩"]].map(([d,label])=>(
                <button key={d} onClick={()=>setDirection(d)} style={{flex:1,padding:"14px 0",border:"none",borderRadius:14,fontWeight:700,fontSize:d==="break"?13:16,cursor:"pointer",background:direction===d?(d==="in"?"#7c3aed":d==="out"?"#0f766e":"#92400e"):"#1e1e2e",color:direction===d?"#fff":"#6c7a9c"}}>
                  {label}
                </button>
              ))}
            </div>
            {direction==="break"&&(
              <div style={{...S.card,border:"1.5px solid #92400e"}}>
                <div style={{fontSize:12,color:"#d97706",marginBottom:10,fontWeight:600}}>☕ 休憩時間</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {[15,30,45,60,90,120].map(m=>(
                    <button key={m} onClick={()=>setBreakMins(m)} style={{padding:"8px 14px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:13,background:breakMins===m?"#92400e":"#0f0f14",color:breakMins===m?"#fde68a":"#6c7a9c",border:breakMins===m?"1.5px solid #d97706":"1.5px solid #2a2a3e"}}>{m}分</button>
                  ))}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
                  <span style={{fontSize:12,color:"#6c7a9c"}}>その他:</span>
                  <input type="number" min="1" max="480" value={breakMins} onChange={e=>setBreakMins(Number(e.target.value))} style={{width:70,background:"#0f0f14",border:"1.5px solid #92400e",borderRadius:8,color:"#fde68a",fontSize:14,padding:"6px 10px",outline:"none",textAlign:"center"}}/>
                  <span style={{fontSize:12,color:"#6c7a9c"}}>分</span>
                </div>
              </div>
            )}
            <div style={S.card}>
              <div style={{fontSize:12,color:"#6c7a9c",marginBottom:10,fontWeight:600}}>打刻方式</div>
              <div style={{display:"flex",gap:8,marginBottom:punchType==="manual"?12:0}}>
                {[["clock","🕐 今の時刻"],["manual","✏️ 手入力"]].map(([val,label])=>(
                  <button key={val} onClick={()=>setPunchType(val)} style={{flex:1,padding:"10px 0",borderRadius:10,fontWeight:600,fontSize:13,cursor:"pointer",background:punchType===val?"#2d1b69":"#0f0f14",color:punchType===val?"#a78bfa":"#6c7a9c",border:punchType===val?"1.5px solid #7c3aed":"1.5px solid #2a2a3e"}}>{label}</button>
                ))}
              </div>
              {punchType==="manual"&&<input type="time" value={manualTime} onChange={e=>setManualTime(e.target.value)} style={{width:"100%",background:"#0f0f14",border:"1.5px solid #7c3aed",borderRadius:10,color:"#e8e0ff",fontSize:28,textAlign:"center",padding:"8px 0",outline:"none",boxSizing:"border-box"}}/>}
              {punchType==="clock"&&<div style={{fontSize:28,color:"#a78bfa",textAlign:"center",fontWeight:300}}>{formatTime(now)}</div>}
            </div>
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:12,color:"#6c7a9c",fontWeight:600}}>スタッフ選択</div>
                <button onClick={selectAll} style={{background:"none",border:"1px solid #4c4c6e",borderRadius:8,color:"#a78bfa",fontSize:12,padding:"4px 10px",cursor:"pointer"}}>{selectedIds.length===staff.length?"全解除":"全選択"}</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {staff.map(s=>{
                  const selected=selectedIds.includes(s.id);
                  const todayRec=todayRecords.find(r=>r.staffId===s.id);
                  return(
                    <button key={s.id} onClick={()=>toggleSelect(s.id)} style={{padding:"12px 10px",borderRadius:12,cursor:"pointer",background:selected?"#2d1b69":"#0f0f14",border:selected?"2px solid #7c3aed":"2px solid #2a2a3e",color:selected?"#e8e0ff":"#8888aa",textAlign:"left",position:"relative"}}>
                      <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{s.name}</div>
                      <div style={{fontSize:10,color:selected?"#a78bfa":"#4c4c6e"}}>
                        {todayRec?(
                          <span>{todayRec.inTime&&`🟢${todayRec.inTime}`}{todayRec.outTime&&` 🔴${todayRec.outTime}`}{!todayRec.inTime&&!todayRec.outTime&&"未打刻"}</span>
                        ):"未打刻"}
                      </div>
                      {selected&&<div style={{position:"absolute",top:6,right:8,fontSize:14}}>✓</div>}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={handlePunch} style={{width:"100%",marginTop:16,padding:"18px 0",border:"none",borderRadius:16,background:direction==="in"?"linear-gradient(135deg,#7c3aed,#5b21b6)":direction==="out"?"linear-gradient(135deg,#0f766e,#065f46)":"linear-gradient(135deg,#92400e,#78350f)",color:"#fff",fontSize:18,fontWeight:800,cursor:"pointer",letterSpacing:1}}>
              {direction==="in"?"🟢 出勤を打刻":direction==="out"?"🔴 退勤を打刻":`☕ 休憩(${breakMins}分)を記録`}
              {selectedIds.length>0&&<span style={{fontSize:13,opacity:0.8}}> ({selectedIds.length}人)</span>}
            </button>
          </div>
        )}

        {tab==="records"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:20,marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:700}}>記録一覧</div>
              <button onClick={()=>{if(records.length===0){showToast("記録がないで","warn");return;}setExportMonth("all");setExportModal(true);}} style={{background:"#1e3a5f",border:"none",borderRadius:10,color:"#60a5fa",fontSize:12,padding:"8px 14px",cursor:"pointer",fontWeight:600}}>📊 Numbers出力</button>
            </div>
            {Object.keys(groupedRecords).length===0&&<div style={{textAlign:"center",color:"#4c4c6e",marginTop:60,fontSize:15}}>まだ記録がないで</div>}
            {Object.entries(groupedRecords).sort(([a],[b])=>b.localeCompare(a)).map(([date,recs])=>(
              <div key={date} style={{marginBottom:20}}>
                <div style={{fontSize:12,color:"#6c7a9c",fontWeight:700,letterSpacing:2,marginBottom:8}}>📅 {date}</div>
                <div style={{background:"#1a1a2e",borderRadius:16,overflow:"hidden",border:"1px solid #2a2a3e"}}>
                  {recs.map((r,i)=>{
                    const h=calcHours(r.inTime,r.outTime,r.breakMins||0);
                    return(
                      <div key={r.id} style={{display:"flex",alignItems:"center",padding:"12px 14px",borderBottom:i<recs.length-1?"1px solid #2a2a3e":"none"}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{r.staffName}</div>
                          <div style={{fontSize:12,color:"#6c7a9c"}}>
                            <span style={{color:"#34d399"}}>{r.inTime||"--:--"}</span>
                            <span style={{margin:"0 6px"}}>→</span>
                            <span style={{color:"#f87171"}}>{r.outTime||"--:--"}</span>
                            {r.breakMins>0&&<span style={{marginLeft:6,color:"#d97706"}}>☕{r.breakMins}分</span>}
                            {h&&<span style={{marginLeft:6,color:"#a78bfa"}}>{h}h</span>}
                          </div>
                        </div>
                        <button onClick={()=>deleteRecord(r.id)} style={{background:"none",border:"none",color:"#4c4c6e",fontSize:18,cursor:"pointer",padding:"0 4px"}}>🗑</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {records.length>0&&(
              <div style={{...S.card,marginTop:8}}>
                <div style={{fontSize:12,color:"#6c7a9c",fontWeight:600,marginBottom:10}}>スタッフ別合計</div>
                {staff.map(s=>{
                  const recs=records.filter(r=>r.staffId===s.id);
                  const total=recs.reduce((sum,r)=>{const h=calcHours(r.inTime,r.outTime,r.breakMins||0);return sum+(h?parseFloat(h):0);},0);
                  if(recs.length===0)return null;
                  return(<div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #2a2a3e"}}><span style={{fontSize:14}}>{s.name}</span><span style={{color:"#a78bfa",fontWeight:700,fontSize:14}}>{total.toFixed(1)}h ({recs.length}日)</span></div>);
                })}
              </div>
            )}
          </div>
        )}

        {tab==="settings"&&(
          <div>
            <div style={{fontSize:16,fontWeight:700,marginTop:20,marginBottom:16}}>スタッフ管理</div>
            <div style={{background:"#1a1a2e",borderRadius:16,overflow:"hidden",border:"1px solid #2a2a3e",marginBottom:16}}>
              {staff.map((s,i)=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",padding:"12px 14px",borderBottom:i<staff.length-1?"1px solid #2a2a3e":"none"}}>
                  {editingName===s.id?(
                    <>
                      <input value={editNameVal} onChange={e=>setEditNameVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEdit(s.id)} style={{flex:1,background:"#0f0f14",border:"1.5px solid #7c3aed",borderRadius:8,color:"#e8e0ff",fontSize:14,padding:"6px 10px",outline:"none"}} autoFocus/>
                      <button onClick={()=>saveEdit(s.id)} style={{marginLeft:8,background:"#7c3aed",border:"none",borderRadius:8,color:"#fff",fontSize:12,padding:"6px 12px",cursor:"pointer"}}>保存</button>
                    </>
                  ):(
                    <>
                      <div style={{flex:1,fontWeight:600,fontSize:14}}>{s.name}</div>
                      <button onClick={()=>startEdit(s)} style={{background:"none",border:"none",color:"#6c7a9c",fontSize:16,cursor:"pointer",marginRight:4}}>✏️</button>
                      <button onClick={()=>removeStaff(s.id)} style={{background:"none",border:"none",color:"#4c4c6e",fontSize:16,cursor:"pointer"}}>🗑</button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={{fontSize:12,color:"#6c7a9c",fontWeight:600,marginBottom:10}}>スタッフ追加</div>
              <div style={{display:"flex",gap:8}}>
                <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addStaff()} placeholder="名前を入力" style={{flex:1,background:"#0f0f14",border:"1.5px solid #2a2a3e",borderRadius:10,color:"#e8e0ff",fontSize:14,padding:"10px 12px",outline:"none"}}/>
                <button onClick={addStaff} style={{background:"#7c3aed",border:"none",borderRadius:10,color:"#fff",fontSize:14,padding:"10px 16px",cursor:"pointer",fontWeight:700}}>追加</button>
              </div>
            </div>
            <div style={{marginTop:20}}>
              <button onClick={()=>{if(records.length===0){showToast("記録がないで","warn");return;}setExportMonth("all");setExportModal(true);}} style={{width:"100%",padding:"16px 0",border:"none",borderRadius:16,background:"linear-gradient(135deg,#1e3a5f,#1e40af)",color:"#60a5fa",fontSize:16,fontWeight:700,cursor:"pointer"}}>📊 Numbersに出力</button>
            </div>
            <div style={{marginTop:12}}>
              <button onClick={()=>{if(window.confirm("全記録を削除してええ？")){setRecords([]);showToast("全記録を削除したで");}}} style={{width:"100%",padding:"14px 0",border:"1.5px solid #4c1d95",borderRadius:16,background:"none",color:"#7c3aed",fontSize:14,fontWeight:600,cursor:"pointer"}}>🗑 全記録を削除</button>
            </div>
            <div style={{marginTop:24}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:"#e8e0ff"}}>🔗 Googleスプレッドシート連携</div>
              <div style={{...S.card,marginBottom:0}}>
                <div style={{fontSize:12,color:"#6c7a9c",fontWeight:600,marginBottom:6}}>GAS WebアプリのURL</div>
                <input
                  value={gasUrlInput}
                  onChange={e=>setGasUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/..."
                  style={{width:"100%",background:"#0f0f14",border:"1.5px solid #2a2a3e",borderRadius:10,color:"#e8e0ff",fontSize:12,padding:"10px 12px",outline:"none",boxSizing:"border-box",marginBottom:10,wordBreak:"break-all"}}
                />
                <button onClick={saveGasUrl} style={{width:"100%",padding:"12px 0",border:"none",borderRadius:10,background:"linear-gradient(135deg,#065f46,#047857)",color:"#34d399",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                  {gasUrl?"🔄 URLを更新":"✅ 連携を有効にする"}
                </button>
                {gasUrl&&(
                  <button onClick={()=>{setGasUrlInput("");setGasUrl("");localStorage.removeItem("shift_gas_url");showToast("連携を解除したで");}} style={{width:"100%",marginTop:8,padding:"10px 0",border:"1.5px solid #4c1d95",borderRadius:10,background:"none",color:"#7c3aed",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                    🔌 連携を解除
                  </button>
                )}
                <div style={{fontSize:11,color:"#4c4c6e",marginTop:10,lineHeight:1.7}}>
                  ① gas/Code.gs をGASにコピー<br/>
                  ② スプレッドシートIDを貼り付けて保存<br/>
                  ③「デプロイ」→「新しいデプロイ」→ 種類：ウェブアプリ<br/>
                  ④ アクセス権：「全員」に設定してデプロイ<br/>
                  ⑤ 表示されたURLをここに貼り付け
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {exportModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={()=>setExportModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#1a1a2e",borderRadius:"24px 24px 0 0",padding:"24px 20px 40px",width:"100%",maxWidth:430,margin:"0 auto",border:"1px solid #2a2a3e"}}>
            <div style={{width:40,height:4,background:"#3a3a5e",borderRadius:2,margin:"0 auto 20px"}}/>
            <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>📊 Numbers に出力</div>
            <div style={{fontSize:12,color:"#6c7a9c",marginBottom:20,lineHeight:1.6}}>ダウンロード後、iPhoneの「ファイル」アプリを開いて<br/>CSVをタップ → 「Numbers で開く」を選んでや</div>
            <div style={{fontSize:12,color:"#6c7a9c",fontWeight:600,marginBottom:10}}>期間を選ぶ</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
              <button onClick={()=>setExportMonth("all")} style={{padding:"8px 16px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:13,background:exportMonth==="all"?"#7c3aed":"#0f0f14",color:exportMonth==="all"?"#fff":"#6c7a9c",border:exportMonth==="all"?"1.5px solid #7c3aed":"1.5px solid #2a2a3e"}}>全期間</button>
              {getAvailableMonths().map(m=>(
                <button key={m} onClick={()=>setExportMonth(m)} style={{padding:"8px 16px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:13,background:exportMonth===m?"#7c3aed":"#0f0f14",color:exportMonth===m?"#fff":"#6c7a9c",border:exportMonth===m?"1.5px solid #7c3aed":"1.5px solid #2a2a3e"}}>{m.replace("-","年")+"月"}</button>
              ))}
            </div>
            <button onClick={()=>exportCSV(exportMonth)} style={{width:"100%",padding:"16px 0",border:"none",borderRadius:14,background:"linear-gradient(135deg,#1e40af,#1d4ed8)",color:"#fff",fontSize:16,fontWeight:800,cursor:"pointer"}}>📥 CSVをダウンロード</button>
          </div>
        </div>
      )}

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#1a1a2e",borderTop:"1px solid #2a2a3e",display:"flex",zIndex:100}}>
        {[["punch","⏱","打刻"],["records","📋","記録"],["settings","⚙️","設定"]].map(([key,icon,label])=>(
          <button key={key} onClick={()=>setTab(key)} style={{flex:1,padding:"12px 0 10px",border:"none",background:"none",cursor:"pointer",color:tab===key?"#a78bfa":"#4c4c6e",fontSize:10,fontWeight:tab===key?700:400,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <span style={{fontSize:22}}>{icon}</span>{label}
          </button>
        ))}
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;600;700;800&display=swap');*{-webkit-tap-highlight-color:transparent;box-sizing:border-box;}body{margin:0;background:#0f0f14;}button{font-family:'Noto Sans JP',sans-serif;}input[type="time"]::-webkit-calendar-picker-indicator{filter:invert(1) opacity(0.5);}`}</style>
    </div>
  );
}
