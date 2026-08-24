export function VerticalCard() {
  const fields = [
    ["Father's Name", "Mr. Ramesh Sharma"],
    ["Mother's Name", "Mrs. Sunita Sharma"],
    ["Admi. No.", "2025-0042"],
    ["Class", "10th"],
    ["Date of Birth", "02-02-2010"],
    ["Address", "House No. 5, Civil Lines"],
    ["Contact No.", "+91-98765-43210"],
  ];

  return (
    <div className="min-h-screen bg-slate-400 flex items-center justify-center p-8 font-['Inter']">
      <div style={{
        width: 300,
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
        background: "#fff",
        position: "relative",
      }}>

        {/* ── HEADER ── */}
        <div style={{ background: "#165C49", position: "relative", height: 215, overflow: "hidden" }}>

          {/* SVG geometric shapes layered over teal */}
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            viewBox="0 0 300 215"
            preserveAspectRatio="none"
          >
            {/* Left yellow-lime diamond/chevron — left edge only */}
            <polygon points="0,0 75,0 45,215 0,215" fill="#C9E840" />
            <polygon points="0,0 52,0 24,215 0,215" fill="#B0D020" opacity="0.7" />

            {/* Right-side white angular highlight — top right corner only */}
            <polygon points="195,0 300,0 300,100 240,215 180,215 235,80" fill="white" opacity="0.12" />
            <polygon points="230,0 300,0 300,80" fill="white" opacity="0.1" />
          </svg>

          {/* School crest — left, vertically centered in top half */}
          <div style={{
            position: "absolute", top: 26, left: 8, zIndex: 20,
            width: 62, height: 62, borderRadius: "50%",
            background: "white",
            border: "2.5px solid #C9E840",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
          }}>
            <svg width="46" height="46" viewBox="0 0 46 46">
              <circle cx="23" cy="23" r="22" fill="none" stroke="#165C49" strokeWidth="1.5" strokeDasharray="3 2" />
              <circle cx="23" cy="23" r="18" fill="#165C49" />
              {/* Open book */}
              <rect x="13" y="17" width="8" height="10" rx="1.5" fill="white" opacity="0.9" />
              <rect x="25" y="17" width="8" height="10" rx="1.5" fill="white" opacity="0.9" />
              <rect x="22" y="16" width="2" height="12" fill="#C9E840" />
              {/* Star top */}
              <polygon
                points="23,9 24.4,13.2 28.9,13.2 25.2,15.7 26.6,19.9 23,17.4 19.4,19.9 20.8,15.7 17.1,13.2 21.6,13.2"
                fill="#C9E840"
              />
            </svg>
          </div>

          {/* School name + contact — right of crest */}
          <div style={{ position: "absolute", top: 18, left: 78, right: 76, zIndex: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 900, color: "#F5E233", lineHeight: 1.25, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
              DR. APJ ABDUL KALAM
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 900, color: "#F5E233", lineHeight: 1.25, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
              JATIYA VIDYALAYA
            </div>
            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.9)", marginTop: 5, lineHeight: 1.6 }}>
              Bundura Ati, Assam
            </div>
            <div style={{ fontSize: 6.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
              MOB: 6003797174
            </div>
            <div style={{ fontSize: 6.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
              Email: momroojali35@gmail.com
            </div>
          </div>

          {/* Session badge — top right */}
          <div style={{ position: "absolute", top: 18, right: 8, zIndex: 20, textAlign: "center" }}>
            <div style={{ background: "#F5E233", borderRadius: 7, padding: "2px 8px", fontSize: 7, fontWeight: 800, color: "#165C49" }}>
              Session:-
            </div>
            <div style={{ background: "#F5E233", borderRadius: 7, padding: "3px 8px", fontSize: 10, fontWeight: 900, color: "#165C49", marginTop: 2 }}>
              2025-26
            </div>
          </div>

          {/* Circular photo — centered, overlapping header/body */}
          <div style={{
            position: "absolute", bottom: -50, left: "50%", transform: "translateX(-50%)", zIndex: 30,
          }}>
            {/* Gradient ring */}
            <div style={{
              width: 106, height: 106, borderRadius: "50%",
              background: "linear-gradient(135deg,#165C49 0%,#C9E840 100%)",
              padding: 4, boxShadow: "0 6px 24px rgba(0,0,0,0.3)",
            }}>
              <div style={{
                width: "100%", height: "100%", borderRadius: "50%",
                border: "3px solid white",
                overflow: "hidden",
                background: "#b8ccb8",
              }}>
                <svg width="98" height="98" viewBox="0 0 98 98">
                  <rect width="98" height="98" fill="#b8ccb8" />
                  <circle cx="49" cy="36" r="22" fill="#6e9e6e" />
                  <ellipse cx="49" cy="92" rx="38" ry="26" fill="#6e9e6e" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Space for overlapping photo */}
        <div style={{ height: 58, background: "#fff" }} />

        {/* ── NAME BANNER ── */}
        <div style={{ background: "#165C49", padding: "9px 16px", textAlign: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>
            Priya Sharma
          </span>
        </div>

        {/* ── DETAILS ── */}
        <div style={{ padding: "12px 14px 10px", background: "#fff" }}>
          {fields.map(([label, value]) => (
            <div key={label} style={{ display: "flex", marginBottom: 5.5, alignItems: "flex-start" }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: "#111", width: 86, flexShrink: 0, lineHeight: 1.45 }}>
                {label}
              </span>
              <span style={{ fontSize: 8.5, color: "#111", marginRight: 5, flexShrink: 0, lineHeight: 1.45 }}>:</span>
              <span style={{ fontSize: 8.5, color: "#111", lineHeight: 1.45 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* ── BOTTOM GEOMETRIC CORNERS ── */}
        <div style={{ position: "relative", height: 42, background: "#fff", overflow: "hidden" }}>
          {/* Bottom-left teal triangle */}
          <svg style={{ position: "absolute", bottom: 0, left: 0 }} width="80" height="42" viewBox="0 0 80 42">
            <polygon points="0,42 80,42 0,0" fill="#165C49" />
          </svg>
          {/* Lime accent on top of teal bottom-left */}
          <svg style={{ position: "absolute", bottom: 0, left: 0 }} width="55" height="30" viewBox="0 0 55 30">
            <polygon points="0,30 55,30 0,0" fill="#C9E840" opacity="0.8" />
          </svg>

          {/* Bottom-right teal triangle */}
          <svg style={{ position: "absolute", bottom: 0, right: 0 }} width="80" height="42" viewBox="0 0 80 42">
            <polygon points="80,42 0,42 80,0" fill="#165C49" />
          </svg>
          {/* Lime accent on top of teal bottom-right */}
          <svg style={{ position: "absolute", bottom: 0, right: 0 }} width="55" height="30" viewBox="0 0 55 30">
            <polygon points="55,30 0,30 55,0" fill="#C9E840" opacity="0.8" />
          </svg>
        </div>

      </div>
    </div>
  );
}
