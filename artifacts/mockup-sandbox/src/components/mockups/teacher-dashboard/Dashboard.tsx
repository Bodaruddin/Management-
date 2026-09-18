import React, { useState } from "react";

const PRIMARY = "#3B5BDB";
const PRIMARY_LIGHT = "#748FFC";

// ── tiny icon helpers (inline SVGs so no external deps needed) ──────────────
const Icon = ({ d, color = "currentColor", size = 20, stroke = 2 }: { d: string; color?: string; size?: number; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const CheckCircle = ({ size = 20, color = "#12B886" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <circle cx="12" cy="12" r="12" fill={color} />
    <path d="M7 12.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const Bell = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const MenuIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

// ── School building SVG illustration ────────────────────────────────────────
const SchoolIllustration = () => (
  <svg width="160" height="130" viewBox="0 0 160 130" fill="none">
    {/* Sky clouds */}
    <ellipse cx="30" cy="25" rx="18" ry="10" fill="rgba(255,255,255,0.35)" />
    <ellipse cx="45" cy="20" rx="14" ry="8" fill="rgba(255,255,255,0.25)" />
    <ellipse cx="130" cy="30" rx="16" ry="9" fill="rgba(255,255,255,0.25)" />
    <ellipse cx="143" cy="25" rx="12" ry="7" fill="rgba(255,255,255,0.2)" />
    {/* Trees left */}
    <rect x="8" y="90" width="8" height="25" rx="2" fill="#2F9E44" />
    <ellipse cx="12" cy="85" rx="14" ry="18" fill="#40C057" />
    {/* Trees right */}
    <rect x="142" y="90" width="8" height="25" rx="2" fill="#2F9E44" />
    <ellipse cx="146" cy="85" rx="14" ry="18" fill="#40C057" />
    {/* Building body */}
    <rect x="30" y="60" width="100" height="60" rx="3" fill="white" />
    <rect x="30" y="60" width="100" height="60" rx="3" fill="rgba(255,255,255,0.9)" />
    {/* Roof */}
    <polygon points="25,62 80,30 135,62" fill="white" opacity="0.95" />
    {/* Flag pole */}
    <rect x="78" y="18" width="3" height="15" fill="#868E96" />
    <polygon points="81,18 92,22 81,26" fill="#E03131" />
    {/* Clock */}
    <circle cx="80" cy="50" r="10" fill="white" stroke="#CED4DA" strokeWidth="1.5" />
    <line x1="80" y1="45" x2="80" y2="50" stroke="#495057" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="80" y1="50" x2="84" y2="50" stroke="#495057" strokeWidth="1.5" strokeLinecap="round" />
    {/* Windows top row */}
    <rect x="42" y="70" width="18" height="14" rx="2" fill="#74C0FC" opacity="0.7" />
    <rect x="70" y="70" width="18" height="14" rx="2" fill="#74C0FC" opacity="0.7" />
    <rect x="98" y="70" width="18" height="14" rx="2" fill="#74C0FC" opacity="0.7" />
    {/* Door */}
    <rect x="68" y="90" width="22" height="30" rx="3" fill="#4DABF7" opacity="0.8" />
    <circle cx="85" cy="107" r="2" fill="white" />
    {/* Ground */}
    <rect x="0" y="118" width="160" height="12" rx="0" fill="rgba(255,255,255,0.15)" />
    {/* Door arrow circle */}
    <circle cx="136" cy="95" r="18" fill="white" opacity="0.9" />
    <svg x="122" y="81" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  </svg>
);

// ── Action items ─────────────────────────────────────────────────────────────
const ACTIONS = [
  { label: "Attendance", sub: "Mark & View",   bg: "#EDE9FE", icon: "#7C3AED", d: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
  { label: "Enter Marks", sub: "Add & Manage", bg: "#FEF3C7", icon: "#D97706", d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" },
  { label: "View Salary", sub: "Check Details", bg: "#D1FAE5", icon: "#059669", d: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z" },
  { label: "Collect Fee",  sub: "Add & View",   bg: "#FFE4E6", icon: "#E11D48", d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6m0 4h.01" },
  { label: "Add Student",  sub: "New Admission", bg: "#DBEAFE", icon: "#2563EB", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" },
  { label: "Classes",      sub: "Manage Classes", bg: "#EDE9FE", icon: "#7C3AED", d: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { label: "Exams",        sub: "Create & Manage", bg: "#DBEAFE", icon: "#2563EB", d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" },
  { label: "Reports",      sub: "View Reports",   bg: "#FEF3C7", icon: "#D97706", d: "M18 20V10M12 20V4M6 20v-6" },
];

// ── Bottom nav items ─────────────────────────────────────────────────────────
const NAV = [
  { label: "Home",     active: true,  d: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10" },
  { label: "Students", active: false, d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 4a4 4 0 0 1 0 8" },
  { label: "Classes",  active: false, d: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { label: "Exams",    active: false, d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" },
  { label: "More",     active: false, d: "M5 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M19 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0" },
];

export default function Dashboard() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div style={{ width: 390, minHeight: 844, backgroundColor: "#F8F9FA", fontFamily: "'Inter', -apple-system, sans-serif", overflowY: "auto", position: "relative" }}>
      {/* ── Top bar ── */}
      <div style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%)`, padding: "48px 20px 0 20px", position: "relative", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <MenuIcon />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Bell with badge */}
            <div style={{ position: "relative" }}>
              <Bell />
              <div style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", backgroundColor: "#FA5252", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white", border: "2px solid white" }}>
                12
              </div>
            </div>
            {/* Avatar */}
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#74C0FC,#4DABF7)", border: "2.5px solid white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "white", position: "relative" }}>
              RK
              <div style={{ position: "absolute", bottom: 1, right: 1, width: 9, height: 9, borderRadius: "50%", backgroundColor: "#40C057", border: "1.5px solid white" }} />
            </div>
          </div>
        </div>

        {/* ── Hero card ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, paddingBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
                {now.getHours() < 12 ? "Good Morning," : now.getHours() < 17 ? "Good Afternoon," : "Good Evening,"}
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "white", lineHeight: 1.25 }}>
              Rajesh Kumar <span style={{ fontSize: 22 }}>👋</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{dateStr}</span>
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <SchoolIllustration />
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ padding: "16px 16px 100px 16px" }}>

        {/* Attendance card */}
        <div style={{
          background: "linear-gradient(135deg, #F0FFF4 0%, #E6FCF5 100%)",
          borderRadius: 16, padding: "16px 18px",
          display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 2px 12px rgba(18,184,134,0.1)",
          border: "1px solid rgba(18,184,134,0.15)",
          marginBottom: 20, position: "relative", overflow: "hidden"
        }}>
          <CheckCircle size={44} color="#12B886" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>Attendance Taken Today</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>You have already submitted attendance for today.</div>
          </div>
          {/* Decorative clipboard icon */}
          <div style={{ position: "absolute", right: 16, opacity: 0.12 }}>
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#12B886" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
            </svg>
          </div>
        </div>

        {/* Quick Actions header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E" }}>Quick Actions</span>
          <button style={{
            display: "flex", alignItems: "center", gap: 6,
            backgroundColor: "#EEF2FF", border: "none",
            borderRadius: 20, padding: "6px 14px",
            fontSize: 12, fontWeight: 600, color: PRIMARY, cursor: "pointer"
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={PRIMARY}>
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            All Actions
          </button>
        </div>

        {/* 4+4 Actions grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
          {ACTIONS.map((a) => (
            <div key={a.label} style={{
              backgroundColor: "white", borderRadius: 14, padding: "14px 8px 12px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              boxShadow: "0 2px 10px rgba(0,0,0,0.06)", cursor: "pointer",
              transition: "transform 0.1s"
            }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: a.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a.icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={a.d} />
                </svg>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1A1A2E", lineHeight: 1.3 }}>{a.label}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2, lineHeight: 1.2 }}>{a.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Today's Birthdays */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E" }}>🎂 Today's Birthdays</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: PRIMARY, cursor: "pointer" }}>View All</span>
        </div>

        <div style={{
          backgroundColor: "#FFF8F0", borderRadius: 14, padding: "14px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12" />
                <rect x="2" y="7" width="20" height="5" />
                <line x1="12" y1="22" x2="12" y2="7" />
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E" }}>Arjun Singh</div>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>Class 5 • Roll 01</div>
            </div>
          </div>
          <button style={{
            backgroundColor: "white", border: "none",
            borderRadius: 22, padding: "8px 16px",
            fontSize: 13, fontWeight: 600, color: "#1A1A2E",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Wish
          </button>
        </div>
      </div>

      {/* ── Bottom navigation ── */}
      <div style={{
        position: "sticky", bottom: 0,
        backgroundColor: "white",
        borderTop: "1px solid #F3F4F6",
        display: "flex", justifyContent: "space-around", alignItems: "center",
        padding: "10px 0 18px",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.08)"
      }}>
        {NAV.map((n) => (
          <div key={n.label} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            cursor: "pointer", minWidth: 60
          }}>
            <div style={{
              width: 32, height: 32,
              borderRadius: n.active ? 10 : 0,
              backgroundColor: n.active ? "#EEF2FF" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={n.active ? PRIMARY : "#9CA3AF"}
                strokeWidth={n.active ? "2.5" : "1.8"}
                strokeLinecap="round" strokeLinejoin="round">
                <path d={n.d} />
              </svg>
            </div>
            <span style={{ fontSize: 10, fontWeight: n.active ? 700 : 400, color: n.active ? PRIMARY : "#9CA3AF" }}>{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
