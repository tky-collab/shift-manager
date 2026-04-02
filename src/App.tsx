import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Staff = { id: string; name: string };

type RecordType = '出勤' | '退勤' | '休憩';

type AttendanceRecord = {
  id: string;
  staffId: string;
  staffName: string;
  type: RecordType;
  time: string; // ISO string
  breakMinutes?: number;
};

type View = 'punch' | 'records' | 'staff';

// ─── Constants ────────────────────────────────────────────────────────────────

const BREAK_OPTIONS = [15, 30, 45, 60, 90, 120];

const DEFAULT_STAFF: Staff[] = [
  { id: '1', name: '田中 一郎' },
  { id: '2', name: '佐藤 花子' },
  { id: '3', name: '鈴木 次郎' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

const toLocalDatetimeValue = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const nowLocalValue = () => toLocalDatetimeValue(new Date().toISOString());

const exportCSV = (records: AttendanceRecord[]) => {
  const header = 'スタッフ名,種別,日時,休憩時間(分)';
  const rows = records.map(r =>
    [r.staffName, r.type, formatTime(r.time), r.breakMinutes ?? ''].join(',')
  );
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shift_records_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavBar({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <nav className="navbar">
      {(['punch', 'records', 'staff'] as View[]).map(v => (
        <button
          key={v}
          className={`nav-btn${view === v ? ' active' : ''}`}
          onClick={() => setView(v)}
        >
          {v === 'punch' ? '打刻' : v === 'records' ? '記録' : 'スタッフ'}
        </button>
      ))}
    </nav>
  );
}

// ─── Punch View ───────────────────────────────────────────────────────────────

function PunchView({
  staff, records, onPunch,
}: {
  staff: Staff[];
  records: AttendanceRecord[];
  onPunch: (ids: string[], type: RecordType, time: string, breakMinutes?: number) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timeMode, setTimeMode] = useState<'now' | 'manual'>('now');
  const [manualTime, setManualTime] = useState(nowLocalValue());
  const [breakMin, setBreakMin] = useState(30);
  const [punchType, setPunchType] = useState<RecordType>('出勤');
  const [flash, setFlash] = useState<string | null>(null);

  const toggleStaff = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(staff.map(s => s.id)));
  const clearAll = () => setSelected(new Set());

  const handlePunch = () => {
    if (selected.size === 0) { setFlash('スタッフを選択してください'); return; }
    const time = timeMode === 'now'
      ? new Date().toISOString()
      : new Date(manualTime).toISOString();
    onPunch(
      Array.from(selected),
      punchType,
      time,
      punchType === '休憩' ? breakMin : undefined,
    );
    setFlash(`${selected.size}名を${punchType}で打刻しました`);
    setSelected(new Set());
    setTimeout(() => setFlash(null), 2500);
  };

  const lastRecord = (staffId: string) => {
    const rs = records.filter(r => r.staffId === staffId);
    return rs[rs.length - 1];
  };

  return (
    <div className="view punch-view">
      {flash && <div className="flash">{flash}</div>}

      <section className="card">
        <h2 className="section-title">スタッフ選択</h2>
        <div className="select-actions">
          <button className="link-btn" onClick={selectAll}>全選択</button>
          <button className="link-btn" onClick={clearAll}>解除</button>
        </div>
        <ul className="staff-list">
          {staff.map(s => {
            const last = lastRecord(s.id);
            return (
              <li
                key={s.id}
                className={`staff-item${selected.has(s.id) ? ' selected' : ''}`}
                onClick={() => toggleStaff(s.id)}
              >
                <span className="staff-check">{selected.has(s.id) ? '✓' : ''}</span>
                <span className="staff-name">{s.name}</span>
                {last && (
                  <span className={`badge badge-${last.type === '出勤' ? 'in' : last.type === '退勤' ? 'out' : 'break'}`}>
                    {last.type}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2 className="section-title">打刻種別</h2>
        <div className="type-btns">
          {(['出勤', '退勤', '休憩'] as RecordType[]).map(t => (
            <button
              key={t}
              className={`type-btn type-${t === '出勤' ? 'in' : t === '退勤' ? 'out' : 'break'}${punchType === t ? ' active' : ''}`}
              onClick={() => setPunchType(t)}
            >{t}</button>
          ))}
        </div>

        {punchType === '休憩' && (
          <div className="break-options">
            <span className="label">休憩時間</span>
            <div className="break-grid">
              {BREAK_OPTIONS.map(m => (
                <button
                  key={m}
                  className={`break-btn${breakMin === m ? ' active' : ''}`}
                  onClick={() => setBreakMin(m)}
                >{m}分</button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">打刻時刻</h2>
        <div className="time-toggle">
          <button
            className={`toggle-btn${timeMode === 'now' ? ' active' : ''}`}
            onClick={() => setTimeMode('now')}
          >現在時刻</button>
          <button
            className={`toggle-btn${timeMode === 'manual' ? ' active' : ''}`}
            onClick={() => { setTimeMode('manual'); setManualTime(nowLocalValue()); }}
          >手入力</button>
        </div>
        {timeMode === 'manual' && (
          <input
            className="time-input"
            type="datetime-local"
            value={manualTime}
            onChange={e => setManualTime(e.target.value)}
          />
        )}
      </section>

      <button className="punch-btn" onClick={handlePunch}>
        {selected.size > 0 ? `${selected.size}名を` : ''}{punchType}打刻
      </button>
    </div>
  );
}

// ─── Records View ─────────────────────────────────────────────────────────────

function RecordsView({
  records, staff, onDelete,
}: {
  records: AttendanceRecord[];
  staff: Staff[];
  onDelete: (id: string) => void;
}) {
  const [filterStaff, setFilterStaff] = useState('');
  const [filterType, setFilterType] = useState('');

  const filtered = records
    .filter(r => !filterStaff || r.staffId === filterStaff)
    .filter(r => !filterType || r.type === filterType)
    .slice()
    .reverse();

  return (
    <div className="view records-view">
      <section className="card">
        <div className="records-header">
          <h2 className="section-title">記録一覧 ({filtered.length}件)</h2>
          <button className="csv-btn" onClick={() => exportCSV(filtered)}>CSV出力</button>
        </div>
        <div className="filters">
          <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
            <option value="">全スタッフ</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">全種別</option>
            <option value="出勤">出勤</option>
            <option value="退勤">退勤</option>
            <option value="休憩">休憩</option>
          </select>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="empty-state">記録がありません</div>
      ) : (
        <ul className="record-list">
          {filtered.map(r => (
            <li key={r.id} className="record-item">
              <div className={`record-type badge-${r.type === '出勤' ? 'in' : r.type === '退勤' ? 'out' : 'break'}`}>
                {r.type}
              </div>
              <div className="record-body">
                <div className="record-name">{r.staffName}</div>
                <div className="record-time">{formatTime(r.time)}</div>
                {r.breakMinutes && <div className="record-break">休憩 {r.breakMinutes}分</div>}
              </div>
              <button className="delete-btn" onClick={() => onDelete(r.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Staff View ───────────────────────────────────────────────────────────────

function StaffView({
  staff, onAdd, onEdit, onDelete,
}: {
  staff: Staff[];
  onAdd: (name: string) => void;
  onEdit: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd(newName.trim());
    setNewName('');
  };

  const startEdit = (s: Staff) => { setEditingId(s.id); setEditName(s.name); };

  const handleEdit = (id: string) => {
    if (!editName.trim()) return;
    onEdit(id, editName.trim());
    setEditingId(null);
  };

  return (
    <div className="view staff-view">
      <section className="card">
        <h2 className="section-title">スタッフ追加</h2>
        <div className="add-row">
          <input
            className="text-input"
            placeholder="名前を入力"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="add-btn" onClick={handleAdd}>追加</button>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">スタッフ一覧 ({staff.length}名)</h2>
        <ul className="staff-manage-list">
          {staff.map(s => (
            <li key={s.id} className="staff-manage-item">
              {editingId === s.id ? (
                <div className="edit-row">
                  <input
                    className="text-input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEdit(s.id)}
                    autoFocus
                  />
                  <button className="save-btn" onClick={() => handleEdit(s.id)}>保存</button>
                  <button className="cancel-btn" onClick={() => setEditingId(null)}>取消</button>
                </div>
              ) : (
                <>
                  <span className="staff-name">{s.name}</span>
                  <div className="staff-actions">
                    <button className="edit-btn" onClick={() => startEdit(s)}>編集</button>
                    <button className="delete-btn" onClick={() => onDelete(s.id)}>削除</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('punch');
  const [staff, setStaff] = useState<Staff[]>(() => {
    try { return JSON.parse(localStorage.getItem('sm_staff') || '') as Staff[]; }
    catch { return DEFAULT_STAFF; }
  });
  const [records, setRecords] = useState<AttendanceRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem('sm_records') || '') as AttendanceRecord[]; }
    catch { return []; }
  });

  useEffect(() => { localStorage.setItem('sm_staff', JSON.stringify(staff)); }, [staff]);
  useEffect(() => { localStorage.setItem('sm_records', JSON.stringify(records)); }, [records]);

  const handlePunch = useCallback((ids: string[], type: RecordType, time: string, breakMinutes?: number) => {
    const newRecords: AttendanceRecord[] = ids.map(id => ({
      id: uid(),
      staffId: id,
      staffName: staff.find(s => s.id === id)?.name ?? id,
      type,
      time,
      breakMinutes,
    }));
    setRecords(prev => [...prev, ...newRecords]);
  }, [staff]);

  const deleteRecord = useCallback((id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
  }, []);

  const addStaff = useCallback((name: string) => {
    setStaff(prev => [...prev, { id: uid(), name }]);
  }, []);

  const editStaff = useCallback((id: string, name: string) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, name } : s));
    setRecords(prev => prev.map(r => r.staffId === id ? { ...r, staffName: name } : r));
  }, []);

  const deleteStaff = useCallback((id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
  }, []);

  return (
    <div className="container">
      <header className="app-header">
        <h1 className="app-title">シフト打刻</h1>
      </header>
      <NavBar view={view} setView={setView} />
      <main className="main">
        {view === 'punch' && (
          <PunchView staff={staff} records={records} onPunch={handlePunch} />
        )}
        {view === 'records' && (
          <RecordsView records={records} staff={staff} onDelete={deleteRecord} />
        )}
        {view === 'staff' && (
          <StaffView staff={staff} onAdd={addStaff} onEdit={editStaff} onDelete={deleteStaff} />
        )}
      </main>
    </div>
  );
}
