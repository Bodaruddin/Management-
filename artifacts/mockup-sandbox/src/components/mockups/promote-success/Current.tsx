import "./_group.css";

export function Current() {
  return (
    <main className="promote-preview">
      <div className="status-bar">
        <span>7:06</span>
        <span className="status-icons">◐ 5G　▰▰▰　◉ 85%</span>
      </div>
      <header className="app-header"><h1>Promote</h1></header>
      <nav className="sub-tabs">
        <div className="sub-tab active">↑ <span>Promote Students</span></div>
        <div className="sub-tab">◇ <span>Teacher Permissions</span></div>
      </nav>
      <section className="content">
        <div className="selector-card">
          <h2 className="selector-title">Select Classes</h2>
          <div className="field-row">
            <div className="field"><label>From Class</label><div className="select">▱ <span>Select...</span><span className="chevron">⌄</span></div></div>
            <div className="arrow">→</div>
            <div className="field"><label>To Class</label><div className="select">▱ <span>Select...</span><span className="chevron">⌄</span></div></div>
          </div>
        </div>
        <div className="ghost-card">Select a class to begin promoting</div>
        <div className="history-card">
          <h2 className="history-title">Recent Promotions</h2>
          {["Ananya Gupta", "Rahul Verma", "Sahil", "Momrooj"].map((name, index) => (
            <div className="history-row" key={name}>
              <div className="history-icon">↗</div>
              <div className="history-name"><div>{name}</div><div className="history-meta">Class 6 → Class 5 · by Admin</div></div>
              <div className="history-date">{index < 2 ? "2026-08-04" : "2026-07-29"}</div>
            </div>
          ))}
        </div>
      </section>
      <div className="bottom-nav">
        {["⌂ Dashboard", "♧ Students", "♙ Teachers", "₹ Finance", "▤ Exams", "♧ Alumni"].map((item) => <div className={`nav-item ${item.includes("Finance") ? "active" : ""}`} key={item}><span className="nav-icon">{item.split(" ")[0]}</span><span>{item.slice(item.indexOf(" ") + 1)}</span></div>)}
      </div>
      <div className="scrim">
        <div className="native-alert">
          <h2>Success</h2>
          <p>2 students promoted to Class 5</p>
          <button>OK</button>
        </div>
      </div>
    </main>
  );
}