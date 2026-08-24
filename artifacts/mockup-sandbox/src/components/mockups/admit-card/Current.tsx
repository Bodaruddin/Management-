import './_group.css';

const schedule = [
  ['English Language & Literature', '04 Apr 2026', '09:00', '12:00', '80'],
  ['Mathematics Standard', '07 Apr 2026', '09:00', '12:00', '80'],
  ['Science', '10 Apr 2026', '09:00', '12:00', '80'],
  ['Social Science', '13 Apr 2026', '09:00', '12:00', '80'],
];

const student = {
  name: 'Aarav Sharma',
  father: 'Rakesh Sharma',
  mother: 'Neha Sharma',
  className: 'X - A',
  roll: '1042',
  dob: '18 May 2010',
  admit: 'AC004218',
};

function Current() {
  return (
    <div className="admit-preview" style={{ padding: 24 }}>
      <main className="admit-sheet" style={{ boxShadow: '0 18px 50px rgba(19, 44, 83, .16)' }}>
        <header style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', padding: '24px 28px', color: '#fff', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 66, height: 66, borderRadius: '50%', background: '#fff', border: '3px solid #f59e0b', display: 'grid', placeItems: 'center', color: '#1e3a8a', fontWeight: 900, fontSize: 20 }}>DAK</div>
          <div style={{ flex: 1 }}>
            <div className="admit-display" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '.4px' }}>DR. APJ ABDUL KALAM JATIYA VIDYALAYA</div>
            <div style={{ fontSize: 11, opacity: .8, marginTop: 5 }}>Bundura Ati · 6003797174 · momroojali35@gmail.com</div>
          </div>
          <div style={{ background: '#f59e0b', padding: '9px 14px', borderRadius: 8, fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>ADMIT CARD</div>
        </header>
        <div style={{ height: 5, background: 'linear-gradient(90deg,#f59e0b,#ef4444,#f59e0b)' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '13px 28px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', fontSize: 11 }}>
          <span><b style={{ color: '#64748b' }}>Examination:</b> Annual Examination 2026</span>
          <span><b style={{ color: '#64748b' }}>Class:</b> X</span>
          <span><b style={{ color: '#64748b' }}>Academic Year:</b> 2025–26</span>
          <span><b style={{ color: '#64748b' }}>Admit No.:</b> {student.admit}</span>
        </div>

        <section style={{ margin: '18px 28px', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, display: 'flex', gap: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#1e3a8a', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .8, borderBottom: '2px solid #bfdbfe', paddingBottom: 7, marginBottom: 10 }}>Student Information</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {[['Name', student.name], ["Father's Name", student.father], ["Mother's Name", student.mother], ['Class / Section', student.className], ['Roll Number', student.roll], ['Date of Birth', student.dob]].map(([label, value]) => (
                  <tr key={label}><td style={{ padding: '5px 0', color: '#64748b', width: 132 }}>{label}</td><td style={{ padding: '5px 0', fontWeight: 700, color: '#0f172a' }}>: {value}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ width: 132, textAlign: 'center' }}>
            <div style={{ width: 88, height: 88, borderRadius: '50%', margin: '2px auto 5px', background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 27 }}>AS</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10 }}>Photograph</div>
            <div style={{ width: 84, height: 84, margin: '0 auto', border: '2px solid #bfdbfe', borderRadius: 7, background: '#eff6ff', display: 'grid', placeItems: 'center', color: '#1e3a8a', fontSize: 10, fontWeight: 700 }}>QR CODE</div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>Verification QR</div>
          </div>
        </section>

        <section style={{ margin: '0 28px 18px', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <div className="admit-display" style={{ background: '#1e3a8a', color: '#fff', padding: '10px 14px', fontSize: 12, fontWeight: 800, letterSpacing: .7 }}>EXAMINATION SCHEDULE</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ background: '#eff6ff', color: '#1e3a8a' }}>{['Subject', 'Date', 'Start Time', 'End Time', 'Max Marks'].map(x => <th key={x} style={{ textAlign: 'left', padding: '9px 10px' }}>{x}</th>)}</tr></thead>
            <tbody>{schedule.map((row, i) => <tr key={row[0]} style={{ background: i % 2 ? '#fff' : '#f8fafc' }}>{row.map((cell, j) => <td key={j} style={{ padding: '9px 10px', borderTop: '1px solid #e2e8f0', color: j === 0 ? '#1e293b' : '#475569', fontWeight: j === 0 ? 700 : 500 }}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </section>

        <section style={{ margin: '0 28px 18px', padding: '14px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9 }}>
          <div style={{ color: '#92400e', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>IMPORTANT INSTRUCTIONS</div>
          {['Bring this Admit Card to the examination hall.', 'Report at least 15 minutes before the scheduled time.', 'Electronic devices and written material are prohibited.', 'Use only blue or black ballpoint pen.'].map((x, i) => <div key={x} style={{ color: '#78350f', fontSize: 11, lineHeight: 1.65 }}>{i + 1}. {x}</div>)}
        </section>

        <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 40, padding: '8px 28px 0' }}>
          {['Principal / Head', "Student's Signature"].map(x => <div key={x} style={{ flex: 1, textAlign: 'center', color: '#1e3a8a', fontSize: 11, fontWeight: 700 }}><div style={{ height: 38, borderBottom: '1.5px solid #1e3a8a', marginBottom: 6 }} />{x}</div>)}
        </footer>
        <div style={{ margin: '18px 28px 0', borderTop: '1px dashed #e2e8f0', paddingTop: 8, textAlign: 'center', color: '#94a3b8', fontSize: 9 }}>Computer-generated document · Any tampering renders this admit card invalid.</div>
      </main>
    </div>
  );
}

export { Current };