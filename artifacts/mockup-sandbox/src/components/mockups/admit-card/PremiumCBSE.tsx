import './_group.css';

const schedule = [
  ['English Language & Literature', '04 APR 2026', '09:00 AM', '12:00 PM', '80'],
  ['Mathematics Standard', '07 APR 2026', '09:00 AM', '12:00 PM', '80'],
  ['Science', '10 APR 2026', '09:00 AM', '12:00 PM', '80'],
  ['Social Science', '13 APR 2026', '09:00 AM', '12:00 PM', '80'],
];

function PremiumCBSE() {
  return (
    <div className="admit-preview" style={{ padding: 24, background: '#dfe7f1' }}>
      <main className="admit-sheet" style={{ boxShadow: '0 24px 70px rgba(15, 34, 64, .2)', border: '1px solid #ccd7e5' }}>
        <div style={{ position: 'absolute', inset: 15, border: '1px solid #d8c28b', pointerEvents: 'none' }} />
        <header style={{ background: '#102c55', color: '#fff', padding: '28px 40px 24px', position: 'relative' }}>
          <div style={{ position: 'absolute', right: 36, top: 26, width: 90, height: 90, border: '1px solid rgba(221,195,119,.4)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', right: 50, top: 40, width: 62, height: 62, border: '1px solid rgba(221,195,119,.25)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
            <div style={{ width: 68, height: 68, border: '1px solid #d9bd70', borderRadius: 12, background: '#f8f1df', display: 'grid', placeItems: 'center', color: '#102c55', fontWeight: 800, fontSize: 18, letterSpacing: -1 }}>DAK</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#d9bd70', fontWeight: 700, marginBottom: 6 }}>CBSE-STYLE EXAMINATION DOCUMENT</div>
              <div className="admit-display" style={{ fontSize: 18, fontWeight: 800, letterSpacing: .25 }}>DR. APJ ABDUL KALAM JATIYA VIDYALAYA</div>
              <div style={{ fontSize: 10.5, color: '#c8d4e4', marginTop: 6 }}>Bundura Ati · 6003797174 · momroojali35@gmail.com</div>
            </div>
          </div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'end', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 11, color: '#c8d4e4', letterSpacing: 1.4 }}>ANNUAL EXAMINATION · 2025–26</div>
              <div className="admit-display" style={{ fontSize: 29, fontWeight: 800, marginTop: 7 }}>ADMIT CARD</div>
            </div>
            <div style={{ color: '#d9bd70', fontSize: 10, letterSpacing: 1.8, fontWeight: 700 }}>SECONDARY SCHOOL</div>
          </div>
        </header>
        <div style={{ height: 6, background: '#d9bd70' }} />

        <section style={{ margin: '24px 40px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[['CANDIDATE', 'Aarav Sharma'], ['CLASS / SECTION', 'X - A'], ['ADMIT NUMBER', 'AC004218']].map(([label, value]) => (
            <div key={label} style={{ padding: '12px 14px', border: '1px solid #d8e1ed', background: '#f6f9fc', borderRadius: 3 }}>
              <div style={{ fontSize: 9, color: '#728198', letterSpacing: 1.2, fontWeight: 700 }}>{label}</div>
              <div className="admit-display" style={{ marginTop: 6, fontSize: 14, color: '#102c55', fontWeight: 800 }}>{value}</div>
            </div>
          ))}
        </section>

        <section style={{ margin: '0 40px 20px', border: '1px solid #cbd7e5', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ padding: '11px 15px', background: '#edf3f9', borderBottom: '1px solid #cbd7e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="admit-display" style={{ color: '#102c55', fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>CANDIDATE DETAILS</div>
            <div style={{ fontSize: 9, color: '#728198', letterSpacing: 1.1 }}>IDENTITY VERIFIED BY SCHOOL</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '14px 16px', columnGap: 32 }}>
            {[['Father’s Name', 'Rakesh Sharma'], ['Mother’s Name', 'Neha Sharma'], ['Date of Birth', '18 May 2010'], ['Roll Number', '1042'], ['Age', '15 Years'], ['Contact', '6003797174']].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #eef2f7', fontSize: 11 }}>
                <span style={{ color: '#728198', width: 92 }}>{label}</span><strong style={{ color: '#1d3557' }}>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section style={{ margin: '0 40px 20px', border: '1px solid #cbd7e5', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ padding: '11px 15px', background: '#102c55', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="admit-display" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>EXAMINATION SCHEDULE</div>
            <div style={{ color: '#d9bd70', fontSize: 9, letterSpacing: 1.1 }}>REPORT 15 MINUTES EARLY</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
            <thead><tr style={{ background: '#f5f8fb' }}>{['Subject', 'Date', 'Start', 'End', 'Marks'].map(x => <th key={x} style={{ textAlign: 'left', padding: '10px 12px', color: '#5e6f87', fontSize: 9, letterSpacing: .7, textTransform: 'uppercase' }}>{x}</th>)}</tr></thead>
            <tbody>{schedule.map((row, i) => <tr key={row[0]} style={{ background: i % 2 ? '#fff' : '#f9fbfd' }}>{row.map((cell, j) => <td key={j} style={{ padding: '10px 12px', borderTop: '1px solid #e5ebf2', color: j === 0 ? '#1d3557' : '#50627a', fontWeight: j === 0 ? 700 : 500 }}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </section>

        <section style={{ margin: '0 40px 20px', padding: '14px 16px', borderLeft: '4px solid #d9bd70', background: '#f8f5ed' }}>
          <div className="admit-display" style={{ color: '#102c55', fontSize: 11, fontWeight: 800, letterSpacing: .8, marginBottom: 8 }}>CANDIDATE INSTRUCTIONS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24 }}>
            {['Carry this admit card to every examination.', 'Electronic devices are prohibited.', 'Use only blue or black ballpoint pen.', 'Candidates using unfair means will be disqualified.'].map((x, i) => <div key={x} style={{ display: 'flex', gap: 7, color: '#50627a', fontSize: 10.5, lineHeight: 1.55, marginBottom: 4 }}><span style={{ color: '#b18b35', fontWeight: 800 }}>{String(i + 1).padStart(2, '0')}</span>{x}</div>)}
          </div>
        </section>

        <footer style={{ padding: '5px 40px 0', display: 'flex', alignItems: 'end', gap: 24 }}>
          <div style={{ width: 82, height: 82, border: '1px solid #bfcddd', borderRadius: 3, display: 'grid', placeItems: 'center', color: '#102c55', fontSize: 9, fontWeight: 800, letterSpacing: .5, background: '#f6f9fc' }}>QR<br />VERIFY</div>
          <div style={{ flex: 1, display: 'flex', gap: 36 }}>
            {['Principal / Head', "Student's Signature"].map(x => <div key={x} style={{ flex: 1, textAlign: 'center', color: '#102c55', fontSize: 10, fontWeight: 700 }}><div style={{ height: 38, borderBottom: '1px solid #102c55', marginBottom: 6 }} />{x}</div>)}
          </div>
        </footer>
        <div style={{ margin: '22px 40px 0', padding: '9px 0 18px', borderTop: '1px solid #d9bd70', display: 'flex', justifyContent: 'space-between', color: '#8290a3', fontSize: 9 }}>
          <span>Issued by the Examination Office · AC004218</span><span>School seal & signature required</span>
        </div>
      </main>
    </div>
  );
}

export { PremiumCBSE };