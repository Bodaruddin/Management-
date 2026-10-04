import { Check, Sun } from "lucide-react";
import "./_group.css";

export function Premium() {
  return (
    <main className="attendance-holiday-preview">
      <section className="premium-holiday-notice" role="status">
        <div className="premium-holiday-icon" aria-hidden="true">
          <Sun size={22} strokeWidth={1.9} />
        </div>
        <div className="premium-holiday-copy">
          <div className="premium-holiday-meta">
            <span className="premium-holiday-kicker">SUNDAY HOLIDAY</span>
            <span className="premium-holiday-badge">
              <Check size={10} strokeWidth={2.5} />
              AUTO-MARKED
            </span>
          </div>
          <h2 className="premium-holiday-title">Attendance was submitted automatically</h2>
          <p className="premium-holiday-detail">No check-in is needed today.</p>
        </div>
      </section>
    </main>
  );
}