export function HorizontalCard() {
  const fields = [
    ["Name", "Arjun Das"],
    ["Class/Section", "8th (B)"],
    ["Father's Name", "Mr. Bikash Das"],
    ["Mother's Name", "Mrs. Anita Das"],
    ["Date of Birth", "05/07/2012"],
    ["Address", "Vill. Bundura, Dist. Kamrup"],
    ["Mobile No.", "+91-94351-22310"],
  ];

  return (
    <div className="min-h-screen bg-slate-400 flex items-center justify-center p-8 font-['Inter']">
      <div style={{
        width: 580,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        background: "#fff",
        position: "relative",
      }}>

        {/* ── HEADER BAND ── */}
        <div style={{
          background: "linear-gradient(90deg,#1e3a8a 0%,#2648c0 65%,#2d55d8 100%)",
          position: "relative",
          height: 82,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingLeft: 12,
          paddingRight: 12,
        }}>

          {/* Orange/amber diagonal swoosh — top right of header */}
          <svg
            style={{ position: "absolute", right: 0, top: 0, width: 180, height: "100%" }}
            viewBox="0 0 180 82"
            preserveAspectRatio="none"
          >
            <polygon points="50,0 180,0 180,82 10,82" fill="#ea580c" opacity="0.95" />
            <polygon points="80,0 180,0 180,82 40,82" fill="#f97316" opacity="0.7" />
            <polygon points="108,0 180,0 180,82 68,82" fill="#fb923c" opacity="0.55" />
          </svg>

          {/* Gold bottom accent line */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "#F5C518", zIndex: 10 }} />

          {/* School emblem */}
          <div style={{
            width: 60, height: 60, borderRadius: "50%", flexShrink: 0,
            background: "white",
            border: "2.5px solid #F5C518",
            outline: "2px solid rgba(255,255,255,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(0,0,0,0.3)", zIndex: 10,
          }}>
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="21" fill="none" stroke="#1e3a8a" strokeWidth="1.5" strokeDasharray="3 2" />
              <circle cx="22" cy="22" r="17" fill="#1e3a8a" />
              <rect x="13" y="16" width="7" height="10" rx="1" fill="white" opacity="0.9" />
              <rect x="24" y="16" width="7" height="10" rx="1" fill="white" opacity="0.9" />
              <rect x="21.5" y="15" width="2" height="12" fill="#F5C518" />
              <polygon
                points="22,8 23.3,12 27.7,12 24.2,14.4 25.5,18.5 22,16 18.5,18.5 19.8,14.4 16.3,12 20.7,12"
                fill="#F5C518"
              />
              <text x="22" y="31" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="white" fontFamily="Arial">ESTD: 2010</text>
            </svg>
          </div>

          {/* School name + session */}
          <div style={{ zIndex: 10, flex: 1 }}>
            <div style={{
              fontSize: 16.5, fontWeight: 900, color: "#fff", lineHeight: 1.2,
              textShadow: "0 1px 4px rgba(0,0,0,0.4)", letterSpacing: 0.2,
            }}>
              DR. APJ ABDUL KALAM
            </div>
            <div style={{
              fontSize: 16.5, fontWeight: 900, color: "#fff", lineHeight: 1.2,
              textShadow: "0 1px 4px rgba(0,0,0,0.4)", letterSpacing: 0.2,
            }}>
              JATIYA VIDYALAYA
            </div>
            <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.85)", marginTop: 3 }}>
              Session : 2025-26
            </div>
          </div>
        </div>

        {/* ── IDENTITY CARD TITLE ── */}
        <div style={{ textAlign: "center", padding: "9px 0 7px", letterSpacing: 5, fontSize: 11, fontWeight: 800, color: "#1e293b" }}>
          IDENTITY CARD
        </div>
        <div style={{ height: 1, background: "#e2e8f0", marginLeft: 16, marginRight: 16, marginBottom: 10 }} />

        {/* ── BODY ── */}
        <div style={{ display: "flex", padding: "0 16px 14px", gap: 14, alignItems: "flex-start" }}>

          {/* Left: Photo + Signature */}
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 105, height: 120,
              borderRadius: 8, border: "2px solid #1e3a8a",
              background: "#dbeafe",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              <svg width="105" height="120" viewBox="0 0 105 120">
                <rect width="105" height="120" fill="#dbeafe" />
                <circle cx="52" cy="44" r="26" fill="#93c5fd" />
                <ellipse cx="52" cy="108" rx="40" ry="28" fill="#93c5fd" />
              </svg>
            </div>
            <div style={{ borderTop: "1.5px solid #94a3b8", width: 100, paddingTop: 4, textAlign: "center" }}>
              <span style={{ fontSize: 10, fontStyle: "italic", color: "#1e3a8a", fontWeight: 700 }}>Signature</span>
            </div>
          </div>

          {/* Center: Details */}
          <div style={{ flex: 1, paddingTop: 2 }}>
            {fields.map(([label, value]) => (
              <div key={label} style={{ display: "flex", marginBottom: 6.5, alignItems: "flex-start" }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#b91c1c", width: 100, flexShrink: 0, lineHeight: 1.4 }}>
                  {label}
                </span>
                <span style={{ fontSize: 9, color: "#1e293b", marginRight: 5, flexShrink: 0, lineHeight: 1.4, fontWeight: 700 }}>:</span>
                <span style={{ fontSize: 9, color: "#1e293b", lineHeight: 1.4 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Right: Stacked diagonal coloured shapes — fan pattern */}
          <div style={{ width: 55, flexShrink: 0, position: "relative", height: 160, overflow: "visible" }}>
            {[
              { color: "#7f1d1d", offset: 0 },
              { color: "#c2410c", offset: 14 },
              { color: "#ec4899", offset: 28 },
              { color: "#fca5a5", offset: 42 },
              { color: "#cbd5e1", offset: 56 },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: s.offset,
                  left: 0,
                  width: 44,
                  height: 100,
                  background: s.color,
                  borderRadius: 5,
                  transform: "rotate(20deg)",
                  transformOrigin: "top left",
                }}
              />
            ))}
          </div>
        </div>

        {/* ── BOTTOM DOUBLE STRIPE ── */}
        <div>
          <div style={{ height: 7, background: "#db2777" }} />
          <div style={{ height: 7, background: "#0284c7" }} />
        </div>

      </div>
    </div>
  );
}
