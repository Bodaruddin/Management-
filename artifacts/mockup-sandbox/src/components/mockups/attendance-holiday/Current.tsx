import { Calendar } from "lucide-react";
import "./_group.css";

export function Current() {
  return (
    <main className="attendance-holiday-preview">
      <section className="current-holiday-notice" role="status">
        <Calendar size={18} strokeWidth={2} aria-hidden="true" />
        <p>Sunday holiday attendance was submitted automatically.</p>
      </section>
    </main>
  );
}