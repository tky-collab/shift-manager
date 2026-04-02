import React, { useState } from 'react';
import './App.css';

type Shift = {
  id: number;
  employee: string;
  day: string;
  startTime: string;
  endTime: string;
};

const DAYS = ['月', '火', '水', '木', '金', '土', '日'];

function App() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employee, setEmployee] = useState('');
  const [day, setDay] = useState('月');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [nextId, setNextId] = useState(1);

  const addShift = () => {
    if (!employee.trim()) return;
    setShifts([...shifts, { id: nextId, employee: employee.trim(), day, startTime, endTime }]);
    setNextId(nextId + 1);
    setEmployee('');
  };

  const deleteShift = (id: number) => {
    setShifts(shifts.filter(s => s.id !== id));
  };

  return (
    <div className="app">
      <h1>シフト管理</h1>

      <div className="form">
        <input
          type="text"
          placeholder="従業員名"
          value={employee}
          onChange={e => setEmployee(e.target.value)}
        />
        <select value={day} onChange={e => setDay(e.target.value)}>
          {DAYS.map(d => <option key={d} value={d}>{d}曜日</option>)}
        </select>
        <input
          type="time"
          value={startTime}
          onChange={e => setStartTime(e.target.value)}
        />
        <span>〜</span>
        <input
          type="time"
          value={endTime}
          onChange={e => setEndTime(e.target.value)}
        />
        <button onClick={addShift}>追加</button>
      </div>

      <div className="calendar">
        {DAYS.map(d => {
          const dayShifts = shifts.filter(s => s.day === d);
          return (
            <div key={d} className="day-column">
              <div className="day-header">{d}</div>
              {dayShifts.length === 0 ? (
                <div className="empty">シフトなし</div>
              ) : (
                dayShifts.map(s => (
                  <div key={s.id} className="shift-card">
                    <div className="shift-employee">{s.employee}</div>
                    <div className="shift-time">{s.startTime} 〜 {s.endTime}</div>
                    <button className="delete-btn" onClick={() => deleteShift(s.id)}>✕</button>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
