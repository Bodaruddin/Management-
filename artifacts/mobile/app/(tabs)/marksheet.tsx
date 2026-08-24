import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PDFSavedModal from '@/components/PDFSavedModal';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Haptics from 'expo-haptics';
import {
  useApp, Student, Exam, ExamResult, getSubjectMaxMarksForClass, isActiveStudent,
} from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { SCHOOL_INFO } from '@/constants/schoolInfo';
import {
  downloadHtmlAsPdf,
  downloadMultipleHtmlsAsPdf,
  printHtml as sharedPrintHtml,
  printMultipleHtmlsAsPdf,
} from '@/utils/pdfExport';
import {
  documentLogoHtml,
  principalSignatureHtml,
  teacherSignatureHtml,
  examInChargeSignatureHtml,
} from '@/utils/documentBranding';
import type { DocumentBranding } from '@/context/AppContext';

const EMPTY_BRANDING: DocumentBranding = {
  logoDataUrl: null,
  signatureDataUrl: null,
  principalSignatureDataUrl: null,
  teacherSignatureDataUrl: null,
  examInChargeSignatureDataUrl: null,
};

function marksheetSignatureHtml(
  kind: 'teacher' | 'exam' | 'principal',
  branding: DocumentBranding,
): string {
  const html = kind === 'teacher'
    ? teacherSignatureHtml(branding, 132, 42)
    : kind === 'exam'
      ? examInChargeSignatureHtml(branding, 132, 42)
      : principalSignatureHtml(branding, 132, 42);
  return html || '<span class="cursive">&#160;</span>';
}

// ─── Exam type constants ───────────────────────────────────────────────────────
type ExamTypeKey = '1ut' | '2ut' | 'half' | 'annual';
const EXAM_TYPE_LABELS: Record<ExamTypeKey, string> = {
  '1ut':    '1st Unit Test',
  '2ut':    '2nd Unit Test',
  'half':   'Half Yearly',
  'annual': 'Annual',
};
const EXAM_TYPE_ORDER: ExamTypeKey[] = ['1ut', '2ut', 'half', 'annual'];
const ACADEMIC_SESSION_KEY = '@school_marksheet_academic_session';

function classifyExam(name: string): ExamTypeKey | null {
  const n = name.toLowerCase();
  if (n.includes('1st') || n.includes('first') || /unit.?test.?1\b/.test(n) || /ut.?1\b/.test(n) || /unit.?1\b/.test(n)) return '1ut';
  if (n.includes('2nd') || n.includes('second') || /unit.?test.?2\b/.test(n) || /ut.?2\b/.test(n) || /unit.?2\b/.test(n)) return '2ut';
  if (n.includes('half') || n.includes('mid')) return 'half';
  if (n.includes('annual') || n.includes('final') || n.includes('yearly')) return 'annual';
  return null;
}

// ─── Top-level modes ──────────────────────────────────────────────────────────
type MarksheetType = 'single' | 'combined';
type GenMode = 'individual' | 'bulk';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAcademicYear(): string {
  const y = new Date().getFullYear();
  return new Date().getMonth() >= 3 ? `${y}–${y + 1}` : `${y - 1}–${y}`;
}

function fmtDate(d: string): string {
  const raw = String(d ?? '').trim();
  if (!raw) return '—';
  const isoParts = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (isoParts) return `${isoParts[3]}/${isoParts[2]}/${isoParts[1]}`;
  const localParts = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (localParts) {
    return `${localParts[1].padStart(2, '0')}/${localParts[2].padStart(2, '0')}/${localParts[3]}`;
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase();
}

const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#059669', '#DC2626', '#D97706', '#0891B2', '#BE185D'];
function studentColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function rankSuffix(n: number): string {
  return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
}

function combinedMarksheetDownloadName(label: string): string {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('') + '_' + [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const uniqueId = Math.random().toString(36).slice(2, 8);
  return `${label}_${timestamp}_${uniqueId}`;
}

// ─── Per-subject max marks lookup ─────────────────────────────────────────────
function getSubjectMaxMarks(exam: Exam, sub: string, className?: string): number {
  return getSubjectMaxMarksForClass(exam, sub, className);
}

// ─── Grade calculation ────────────────────────────────────────────────────────
function getGrade(pct: number): { grade: string; color: string; points: string } {
  if (pct >= 90) return { grade: 'A+', color: '#059669', points: '10.0' };
  if (pct >= 80) return { grade: 'A',  color: '#10B981', points: '9.0'  };
  if (pct >= 70) return { grade: 'B+', color: '#2563EB', points: '8.0'  };
  if (pct >= 60) return { grade: 'B',  color: '#3B82F6', points: '7.0'  };
  if (pct >= 50) return { grade: 'C',  color: '#F59E0B', points: '6.0'  };
  if (pct >= 30) return { grade: 'D',  color: '#F97316', points: '5.0'  };
  return              { grade: 'F',  color: '#EF4444', points: '0.0'  };
}

// ─── Single Exam Types ────────────────────────────────────────────────────────
interface MarksheetData {
  student: Student;
  exam: Exam;
  result: ExamResult;
  total: number;
  maxTotal: number;
  percentage: number;
  grade: string;
  gradeColor: string;
  gradePoints: string;
  rank: number;
  totalStudents: number;
  passed: boolean;
  passMarks: number;
  subjectMaxMarks: Record<string, number>;
}

function calcMarksheet(
  student: Student,
  exam: Exam,
  result: ExamResult,
  allResults: ExamResult[],
): MarksheetData {
  const subjects = exam.subjects;

  // Build per-subject max marks from subjectSchedule, falling back to exam.maxMarks
  const subjectMaxMarks: Record<string, number> = {};
  subjects.forEach(sub => { subjectMaxMarks[sub] = getSubjectMaxMarks(exam, sub, student.class); });

  const passMarks = Math.ceil(exam.maxMarks * 0.30); // kept for banner display

  const total    = subjects.reduce((sum, sub) => sum + (result.marks[sub] ?? 0), 0);
  const maxTotal = subjects.reduce((sum, sub) => sum + subjectMaxMarks[sub], 0);
  const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const { grade, color: gradeColor, points: gradePoints } = getGrade(percentage);
  const passed =
    percentage >= 30 &&
    subjects.every(sub => (result.marks[sub] ?? 0) >= Math.ceil(subjectMaxMarks[sub] * 0.30));

  const classResults = allResults
    .filter(r => r.examId === exam.id && r.class === exam.class)
    .map(r => ({ id: r.studentId, total: subjects.reduce((s, sub) => s + (r.marks[sub] ?? 0), 0) }))
    .sort((a, b) => b.total - a.total);

  const rank = classResults.findIndex(r => r.id === student.id) + 1;

  return { student, exam, result, total, maxTotal, percentage, grade, gradeColor, gradePoints,
    rank: rank || classResults.length, totalStudents: classResults.length, passed, passMarks,
    subjectMaxMarks };
}

// ─── Combined Annual Types ────────────────────────────────────────────────────
interface CombinedSubjectRow {
  subject: string;
  marks: Record<ExamTypeKey, number | null>;  // marks per exam type
  total: number;
  max: number;
  pct: number;
  grade: string;
  passed: boolean;
}

interface CombinedMarksheetData {
  student: Student;
  examMap: Partial<Record<ExamTypeKey, Exam>>;
  subjectRows: CombinedSubjectRow[];
  examTotals: Partial<Record<ExamTypeKey, { obtained: number; max: number }>>;
  grandTotal: number;
  grandMax: number;
  percentage: number;
  grade: string;
  gradeColor: string;
  gradePoints: string;
  rank: number;
  totalStudents: number;
  passed: boolean;
  className: string;
}

function calcCombinedMarksheet(
  student: Student,
  examMap: Partial<Record<ExamTypeKey, Exam>>,
  resultMap: Partial<Record<ExamTypeKey, ExamResult>>,
  allResults: ExamResult[],
  className: string,
): CombinedMarksheetData {
  // Union of all subjects across all exams, preserving order
  const subjectSet: string[] = [];
  EXAM_TYPE_ORDER.forEach(key => {
    const exam = examMap[key];
    if (exam) exam.subjects.forEach(s => { if (!subjectSet.includes(s)) subjectSet.push(s); });
  });

  const subjectRows: CombinedSubjectRow[] = subjectSet.map(sub => {
    const marks: Record<ExamTypeKey, number | null> = { '1ut': null, '2ut': null, 'half': null, 'annual': null };
    let total = 0;
    let max = 0;
    EXAM_TYPE_ORDER.forEach(key => {
      const exam = examMap[key];
      if (!exam || !exam.subjects.includes(sub)) return;
      const result = resultMap[key];
      const val = result ? (result.marks[sub] ?? 0) : null;
      marks[key] = val;
      if (val !== null) total += val;
      max += getSubjectMaxMarks(exam, sub, className);
    });
    const pct = max > 0 ? (total / max) * 100 : 0;
    const grade = getGrade(pct).grade;
    const passed = pct >= 30;
    return { subject: sub, marks, total, max, pct, grade, passed };
  });

  const examTotals: Partial<Record<ExamTypeKey, { obtained: number; max: number }>> = {};
  EXAM_TYPE_ORDER.forEach(key => {
    const exam = examMap[key];
    if (!exam) return;
    const result = resultMap[key];
    const obtained = result ? exam.subjects.reduce((s, sub) => s + (result.marks[sub] ?? 0), 0) : 0;
    const max = exam.subjects.reduce((s, sub) => s + getSubjectMaxMarks(exam, sub, className), 0);
    examTotals[key] = { obtained, max };
  });

  const grandTotal = Object.values(examTotals).reduce((s, t) => s + (t?.obtained ?? 0), 0);
  const grandMax   = Object.values(examTotals).reduce((s, t) => s + (t?.max ?? 0), 0);
  const percentage = grandMax > 0 ? (grandTotal / grandMax) * 100 : 0;
  const { grade, color: gradeColor, points: gradePoints } = getGrade(percentage);
  const passed = percentage >= 30 && subjectRows.every(row => row.passed);

  // Rank among classmates
  const examIds = Object.values(examMap).filter(Boolean).map(e => e!.id);
  const studentTotals: Record<string, number> = {};
  allResults.filter(r => examIds.includes(r.examId) && r.class === className).forEach(r => {
    const exam = Object.values(examMap).find(e => e?.id === r.examId);
    if (!exam) return;
    const tot = exam.subjects.reduce((s, sub) => s + (r.marks[sub] ?? 0), 0);
    studentTotals[r.studentId] = (studentTotals[r.studentId] ?? 0) + tot;
  });
  const ranked = Object.entries(studentTotals).sort((a, b) => b[1] - a[1]);
  const rankIdx = ranked.findIndex(([id]) => id === student.id);

  return { student, examMap, subjectRows, examTotals, grandTotal, grandMax, percentage,
    grade, gradeColor, gradePoints, rank: rankIdx + 1 || 1, totalStudents: ranked.length,
    passed, className };
}

// ─── HTML Templates ───────────────────────────────────────────────────────────
function subjectIcon(sub: string): string {
  const s = sub.toLowerCase();
  if (s.includes('english')) return '📖';
  if (s.includes('assamese') || s.includes('hindi') || s.includes('bengali') || s.includes('sanskrit') || s.includes('urdu')) return '🎖';
  if (s.includes('math')) return '🧮';
  if (s.includes('general science') || s.includes('natural science') || s.includes('evs')) return '⚛';
  if (s.includes('social') || s.includes('history') || s.includes('geography') || s.includes('civics') || s.includes('sst')) return '🌐';
  if (s.includes('computer') || s.includes('information') || s.includes(' it ') || s === 'it') return '🖥';
  if (s.includes('science')) return '🔬';
  if (s.includes('art') || s.includes('drawing') || s.includes('craft')) return '🎨';
  if (s.includes('music')) return '🎵';
  if (s.includes('physical') || s.includes('sport') || s.includes('pe')) return '⚽';
  return '📚';
}

function buildSingleMarksheetHtml(
  data: MarksheetData,
  branding: DocumentBranding = EMPTY_BRANDING,
  academicSession: string = getAcademicYear(),
): string {
  const { student, exam, result, total, maxTotal, percentage, grade, rank, totalStudents, passed } = data;
  const acYear  = academicSession;
  const pctFmt  = percentage.toFixed(2);
  const issueDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const verifyData = encodeURIComponent(
    `${student.name}|Roll:${student.rollNumber}|Class:${exam.class}|Exam:${exam.name}|Marks:${total}/${maxTotal}|Grade:${grade}|${passed ? 'PASS' : 'FAIL'}`
  );

  const subjectRows = exam.subjects.map(sub => {
    const obtained = result.marks[sub] ?? 0;
    const subMax   = data.subjectMaxMarks[sub] ?? exam.maxMarks;
    const subPct   = ((obtained / subMax) * 100).toFixed(2);
    const sg       = getGrade((obtained / subMax) * 100);
    const icon     = subjectIcon(sub);
    return `<tr>
      <td>${icon}&nbsp; ${sub.toUpperCase()}</td>
      <td>${subMax}</td>
      <td class="obt">${obtained}</td>
      <td>${subMax}</td>
      <td>${subPct}</td>
      <td style="font-weight:800;color:#0c1f4a">${sg.grade}</td>
    </tr>`;
  }).join('');

  const remark = percentage >= 90 ? 'Excellent performance! Keep up the hard work and continue to shine.' :
    percentage >= 80 ? 'Very good performance. Continue striving for excellence.' :
    percentage >= 70 ? 'Good performance. Continue to work hard to improve further.' :
    percentage >= 60 ? 'Satisfactory performance. More effort is needed in some subjects.' :
    percentage >= 50 ? 'Average performance. Significant improvement is required.' :
    percentage >= 30 ? 'Below average. Needs to put in considerably more effort.' :
    'Failed. Student must repeat the academic year.';

  // corner SVG helper — all four ornaments share the same geometry; rotation is
  // handled entirely by CSS on the wrapper div.
  const cornerSvg = () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><polyline points="2,32 2,6 6,2 32,2" fill="none" stroke="#c8a040" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polygon points="6,2 10,6 6,10 2,6" fill="#c8a040"/><line x1="8" y1="2" x2="22" y2="2" stroke="#c8a040" stroke-width="1.2" opacity="0.6"/><line x1="2" y1="8" x2="2" y2="22" stroke="#c8a040" stroke-width="1.2" opacity="0.6"/></svg>`;

  // Always zoom .inner so footer + signatures are guaranteed to fit within
  // .page { height:297mm; overflow:hidden }. A hard max of 0.93 ensures at least
  // 7 % reduction even with very few subjects (estimation errors can't cause clipping).
  // Base 910 = header~260 + info~140 + table-header~50 + summary~145 + remarks~45 + sigs~80 + footer~45 + gaps~95
  const _innerContentH = 910 + exam.subjects.length * 27;
  const _innerZoomVal = Math.min(0.93, 920 / _innerContentH);
  const _innerZoomCss = `zoom:${_innerZoomVal.toFixed(3)};`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Marksheet – ${student.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Archivo+Black&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Poppins', Arial, sans-serif;
    background: #fff;
    padding: 0;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: A4 portrait; margin: 0; }
  @media print { html, body { background: #fff; padding: 0; margin: 0; height: 297mm; overflow: hidden; } .page { page-break-after: avoid; break-after: avoid; } }
  /* ---------- page shell ---------- */
  /* 794 px = A4 width at 96 dpi; height:auto so PDF captures only actual content, no blank gap */
  .page { width:794px; height:auto; margin:0 auto; background:#fdfefb; border:5px solid #0c1f4a; border-radius:10px; padding:9px; position:relative; box-sizing:border-box; display:flex; flex-direction:column; }
  .corner { position:absolute; width:48px; height:48px; pointer-events:none; z-index:10; }
  .corner.tl { top:5px; left:5px; transform:rotate(0deg); transform-origin:50% 50%; }
  .corner.tr { top:5px; right:5px; transform:rotate(90deg); transform-origin:50% 50%; }
  .corner.bl { bottom:5px; left:5px; transform:rotate(-90deg); transform-origin:50% 50%; }
  .corner.br { bottom:5px; right:5px; transform:rotate(180deg); transform-origin:50% 50%; }
  .inner { border:1.5px solid #c8a040; border-radius:6px; padding:12px; overflow:hidden; display:flex; flex-direction:column; ${_innerZoomCss} }

  /* ---------- header ---------- */
  .hdr { display:flex; align-items:flex-start; gap:18px; padding-bottom:10px; border-bottom:3px solid #0c1f4a; }
  .badge-wrap { flex-shrink:0; }
  .hdr-center { flex:1; text-align:center; }
  .school-h1 { font-family:'Archivo Black',sans-serif; font-size:28px; color:#0c1f4a; line-height:1.2; letter-spacing:0.4px; }
  .tagline-row { display:flex; align-items:center; gap:8px; margin:5px 0 4px; }
  .tline { flex:1; height:1.5px; background:#c8a040; }
  .tagline-txt { font-size:10.5px; font-weight:700; color:#0c1f4a; letter-spacing:3.5px; white-space:nowrap; }
  .addr { font-size:12px; font-weight:600; color:#0c1f4a; display:flex; align-items:center; justify-content:center; gap:5px; }
  .hdr-right { flex-shrink:0; text-align:center; }
  .session-box { background:#0c1f4a; color:#fff; border-radius:6px; padding:7px 20px; display:inline-block; }
  .session-lbl { font-size:9px; letter-spacing:1.5px; font-weight:600; }
  .session-val { font-size:22px; font-weight:800; line-height:1.2; }
  .ms-title { font-family:'Archivo Black',sans-serif; font-size:31px; color:#0c1f4a; margin-top:6px; letter-spacing:1px; }

  /* ---------- info box ---------- */
  .info-box { border:1.5px solid #c8a040; border-radius:8px; display:flex; gap:0; margin-top:8px; overflow:hidden; background:#fdfcf5; }
  .info-col { flex:1; padding:5px 10px; }
  .info-col + .info-col { border-left:1px solid #e8d9a8; }
  .irow { display:flex; align-items:center; gap:6px; height:17px; margin-bottom:1px; font-size:11px; line-height:1; }
  .irow:last-child { margin-bottom:0; }
  .irow .ic { width:18px; height:17px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:11px; }
  .irow .lbl { font-weight:600; color:#0c1f4a; min-width:88px; flex-shrink:0; }
  .irow .colon { font-weight:700; color:#c8a040; margin:0 4px; flex-shrink:0; }
  .irow .val { font-weight:700; color:#1a1a2e; white-space:nowrap; flex-shrink:1; overflow:hidden; text-overflow:ellipsis; }
  /* ---------- QR card ---------- */
  .qr-card { margin-top:6px; border:2px solid #c8a040; border-radius:10px; padding:8px 10px; display:inline-flex; flex-direction:column; align-items:center; gap:4px; background:#f5f7fc; box-shadow:0 3px 10px rgba(200,160,64,0.2); }
  .qr-card span { font-size:9px; font-weight:700; color:#0c1f4a; letter-spacing:1.5px; text-transform:uppercase; }

  /* ---------- marks table ---------- */
  .perf-title { background:#0c1f4a; display:flex; align-items:center; gap:10px; padding:7px 14px; border-radius:6px 6px 0 0; margin-top:10px; }
  .pt-line { flex:1; height:1px; background:rgba(200,160,64,0.5); }
  .pt-txt { font-size:12.5px; font-weight:700; color:#fff; letter-spacing:2.5px; }
  table.mt { width:100%; border-collapse:collapse; font-size:13px; border:1.5px solid #0c1f4a; border-top:none; border-radius:0 0 6px 6px; overflow:hidden; }
  table.mt th { background:#0c1f4a; color:#fff; padding:6px 8px; font-size:11px; font-weight:700; letter-spacing:0.4px; text-align:center; border-right:1px solid rgba(255,255,255,0.15); }
  table.mt th.subj-hdr { text-align:left; padding-left:14px; }
  table.mt th.exam-group { color:#e8c96a; font-size:10px; letter-spacing:1px; border-right:1px solid rgba(255,255,255,0.25); }
  table.mt th.sub-hdr { background:#122d60; font-size:10px; color:rgba(255,255,255,0.85); font-weight:600; }
  table.mt td { padding:5px 8px; text-align:center; border-bottom:1px solid #dde4f0; border-right:1px solid #dde4f0; font-weight:500; }
  table.mt td:first-child { text-align:left; padding-left:14px; font-weight:600; color:#0c1f4a; }
  table.mt td.obt { font-weight:800; color:#0c1f4a; }
  table.mt tr:nth-child(even) td { background:#f5f7fc; }
  table.mt tr.tr { background:#e8edf8 !important; }
  table.mt tr.tr td { font-weight:800; font-size:14px; border-top:2px solid #0c1f4a; border-bottom:none; }

  /* ---------- summary cards ---------- */
  .summary { display:grid; grid-template-columns:repeat(6,1fr); gap:7px; margin-top:10px; page-break-inside:avoid; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .sc { border:1.5px solid #e2e8f0; border-radius:14px; padding:10px 6px 8px; text-align:center; background:#fff; box-shadow:0 6px 22px rgba(12,31,74,0.10), 0 1px 5px rgba(12,31,74,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .sc .si { display:flex; justify-content:center; align-items:center; margin:0 auto 8px; width:50px; height:50px; border-radius:50%; flex-shrink:0; }
  .sc .si svg { width:34px; height:34px; }
  .sc .sl { font-size:8.5px; font-weight:700; color:#0c1f4a; letter-spacing:0.4px; line-height:1.5; text-transform:uppercase; }
  .sc .sv { font-family:'Archivo Black',sans-serif; font-size:20px; color:#0c1f4a; margin-top:4px; line-height:1.1; }
  .sc .ss { font-size:8px; color:#64748b; margin-top:2px; line-height:1.4; }
  .sc .result { display:inline-block; margin-top:3px; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700; }
  .sc .pass { background:#d4edda; color:#1a7a40; }
  .sc .fail { background:#f8d7da; color:#b02020; }
  .gs-mini { width:100%; margin-top:4px; border-collapse:collapse; }
  .gs-mini td { font-size:8.5px; padding:2px 3px; border-bottom:1px solid #f0f4f8; text-align:left; color:#475569; }
  .gs-mini td:last-child { text-align:right; font-weight:800; color:#0c1f4a; font-size:10px; padding-right:4px; }
  @media print { .summary { display:grid !important; grid-template-columns:repeat(6,1fr) !important; } }

  /* ---------- remarks ---------- */
  .rem { display:flex; align-items:stretch; margin-top:8px; border-radius:6px; overflow:hidden; border:1.5px solid #d0d8ea; }
  .rem-tag { background:#0c1f4a; color:#fff; padding:9px 20px 9px 14px; font-size:12.5px; font-weight:700; letter-spacing:0.5px; display:flex; align-items:center; clip-path:polygon(0 0,100% 0,90% 100%,0 100%); padding-right:36px; }
  .rem-txt { padding:9px 16px; font-size:13px; color:#222; display:flex; align-items:center; font-weight:500; flex:1; }

  /* ---------- signatures — flex-shrink:0 keeps them out of the scrolling inner area --- */
  .sigs { display:flex; justify-content:space-around; margin-top:6px; text-align:center; flex-shrink:0; }
  .sig-block .cursive { font-family:'Brush Script MT','Segoe Script',cursive; font-size:30px; color:#0c1f4a; display:block; border-bottom:1.5px solid #333; padding-bottom:4px; margin-bottom:6px; min-width:160px; line-height:1.4; }
  .sig-block .role { font-size:12px; font-weight:700; color:#0c1f4a; letter-spacing:0.3px; }

  /* ---------- footer — flex-shrink:0 always pins it at page bottom ------------------- */
  .footer { position:relative; z-index:11; background:#0c1f4a; border-radius:0 0 6px 6px; margin-top:6px; padding:8px 22px; text-align:center; flex-shrink:0; }
  .footer-quote { font-size:10px; color:#c8a040; letter-spacing:2.5px; font-weight:700; font-family:'Poppins',Arial,sans-serif; text-transform:uppercase; }
</style>
</head>
<body>
<div class="page">

  <!-- Gold corner ornaments (rotated via CSS, no inline transforms) -->
  <div class="corner tl">${cornerSvg()}</div>
  <div class="corner tr">${cornerSvg()}</div>
  <div class="corner bl">${cornerSvg()}</div>
  <div class="corner br">${cornerSvg()}</div>

  <div class="inner">

    <!-- ══ HEADER ══ -->
    <div class="hdr">

      <!-- Circular crest badge via SVG -->
      <div class="badge-wrap">
        ${branding.logoDataUrl ? documentLogoHtml(branding, 130, 130) : `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="130" viewBox="0 0 115 115">
          <defs>
            <path id="ta" d="M 12,57.5 A 45.5,45.5 0 1,0 103,57.5"/>
            <path id="ba" d="M 18,57.5 A 39.5,39.5 0 0,0 97,57.5"/>
          </defs>
          <!-- Outer dark circle -->
          <circle cx="57.5" cy="57.5" r="55" fill="#0c1f4a" stroke="#c8a040" stroke-width="3"/>
          <!-- Inner decorative ring -->
          <circle cx="57.5" cy="57.5" r="46" fill="none" stroke="#c8a040" stroke-width="1" stroke-dasharray="3,2"/>
          <!-- Top curved text -->
          <text font-size="8" fill="#c8a040" font-family="Poppins,Arial" font-weight="bold" letter-spacing="0.8">
            <textPath href="#ta" startOffset="50%" text-anchor="middle">DR. APJ KALAM JATIYA VIDYALAYA</textPath>
          </text>
          <!-- ESTD label -->
          <text x="57.5" y="38" text-anchor="middle" font-size="7.5" fill="#c8a040" font-family="Poppins,Arial" font-weight="bold" letter-spacing="1.5">ESTD  2016</text>
          <line x1="38" y1="43" x2="77" y2="43" stroke="#c8a040" stroke-width="0.8"/>
          <!-- Center icon (graduation figure) -->
          <text x="57.5" y="64" text-anchor="middle" font-size="24" fill="white">📖</text>
          <line x1="38" y1="70" x2="77" y2="70" stroke="#c8a040" stroke-width="0.8"/>
          <!-- Bottom curved text -->
          <text font-size="9" fill="#c8a040" font-family="Poppins,Arial" font-weight="bold" letter-spacing="3">
            <textPath href="#ba" startOffset="50%" text-anchor="middle">BUNDURA</textPath>
          </text>
        </svg>`}
      </div>

      <!-- School name & tagline -->
      <div class="hdr-center">
        <div class="school-h1">${SCHOOL_INFO.name}</div>
        <div class="tagline-row">
          <div class="tline"></div>
          <span class="tagline-txt">DISCIPLINE &nbsp;•&nbsp; KNOWLEDGE &nbsp;•&nbsp; VALUES</span>
          <div class="tline"></div>
        </div>
        <div class="addr">📍 ${SCHOOL_INFO.address}</div>
      </div>

      <!-- Session + title + QR -->
      <div class="hdr-right">
        <div class="session-box">
          <div class="session-lbl">ACADEMIC SESSION</div>
          <div class="session-val">${acYear}</div>
        </div>
        <div class="ms-title">MARKSHEET</div>
        <div class="qr-card">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=88x88&color=0c1f4a&bgcolor=FFFFFF&data=${verifyData}" width="88" height="88" style="border-radius:4px;display:block" onerror="this.style.display='none'" alt="QR Code"/>
          <span>Scan to Verify</span>
        </div>
      </div>
    </div>

    <!-- ══ STUDENT INFO ══ -->
    <div class="info-box">
      <div class="info-col">
        <div class="irow"><span class="ic">👤</span><span class="lbl">Student Name</span><span class="colon">:</span><span class="val">${student.name.toUpperCase()}</span></div>
        <div class="irow"><span class="ic">👨</span><span class="lbl">Father's Name</span><span class="colon">:</span><span class="val">${(student.fatherName||'—').toUpperCase()}</span></div>
        <div class="irow"><span class="ic">👩</span><span class="lbl">Mother's Name</span><span class="colon">:</span><span class="val">${(student.motherName||'—').toUpperCase()}</span></div>
        <div class="irow"><span class="ic">🎓</span><span class="lbl">Class</span><span class="colon">:</span><span class="val">${exam.class}</span></div>
        <div class="irow"><span class="ic">📘</span><span class="lbl">Section</span><span class="colon">:</span><span class="val">${student.section?.trim() || '—'}</span></div>
      </div>
      <div class="info-col">
        <div class="irow"><span class="ic">🪪</span><span class="lbl">Adm. No.</span><span class="colon">:</span><span class="val">${student.admissionNo||'—'}</span></div>
        <div class="irow"><span class="ic">📋</span><span class="lbl">Roll No.</span><span class="colon">:</span><span class="val">${student.rollNumber}</span></div>
        <div class="irow"><span class="ic">📅</span><span class="lbl">D.O.B.</span><span class="colon">:</span><span class="val">${fmtDate(student.dateOfBirth)}</span></div>
        <div class="irow"><span class="ic">📝</span><span class="lbl">Exam Type</span><span class="colon">:</span><span class="val">Regular</span></div>
        <div class="irow"><span class="ic">📅</span><span class="lbl">Issue Date</span><span class="colon">:</span><span class="val">${issueDate}</span></div>
      </div>
    </div>

    <!-- ══ ACADEMIC PERFORMANCE ══ -->
    <div class="perf-title">
      <div class="pt-line"></div>
      <div class="pt-txt">ACADEMIC PERFORMANCE</div>
      <div class="pt-line"></div>
    </div>
    <table class="mt">
      <thead>
        <tr>
          <th class="subj-hdr" rowspan="2" style="width:22%">SUBJECTS</th>
          <th class="exam-group" colspan="2" style="border-right:1px solid rgba(255,255,255,0.3)">${exam.name.toUpperCase()}</th>
          <th rowspan="2" style="width:10%">MAX<br>MARKS</th>
          <th rowspan="2" style="width:9%">%</th>
          <th rowspan="2" style="width:9%">GRADE</th>
        </tr>
        <tr>
          <th class="sub-hdr" style="width:12%">TOTAL</th>
          <th class="sub-hdr" style="width:12%;border-right:1px solid rgba(255,255,255,0.3)">OBTAINED</th>
        </tr>
      </thead>
      <tbody>
        ${subjectRows}
        <tr class="tr">
          <td>TOTAL (ALL SUBJECTS)</td>
          <td>${maxTotal}</td>
          <td class="obt">${total}</td>
          <td>${maxTotal}</td>
          <td>${pctFmt}</td>
          <td style="font-size:16px;font-weight:900;color:#0c1f4a">${grade}</td>
        </tr>
      </tbody>
    </table>

    <!-- ══ SUMMARY CARDS ══ -->
    <div class="summary">

      <!-- Card 1: Total Marks -->
      <div class="sc" style="border-color:#bfdbfe;border-top:3px solid #1e40af">
        <div class="si" style="background:#dbeafe">
           <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1e40af" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="2" width="8" height="4" rx="1"/>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>
          </svg>
        </div>
        <div class="sl">TOTAL MARKS<br>(ALL SUBJECTS)</div>
        <div class="sv" style="color:#1e40af">${maxTotal}</div>
      </div>

      <!-- Card 2: Total Obtained Marks -->
      <div class="sc" style="border-color:#a7f3d0;border-top:3px solid #059669">
        <div class="si" style="background:#dcfce7">
           <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <div class="sl">TOTAL OBTAINED<br>MARKS</div>
        <div class="sv" style="color:#059669">${total}</div>
      </div>

      <!-- Card 3: Percentage -->
      <div class="sc" style="border-color:#bfdbfe;border-top:3px solid #2563eb">
        <div class="si" style="background:#eff6ff">
           <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="5" x2="5" y2="19"/>
            <circle cx="6.5" cy="6.5" r="2.5"/>
            <circle cx="17.5" cy="17.5" r="2.5"/>
          </svg>
        </div>
        <div class="sl">PERCENTAGE</div>
        <div class="sv" style="color:#2563eb;font-size:17px">${pctFmt}%</div>
      </div>

      <!-- Card 4: Overall Grade -->
      <div class="sc" style="border-color:#fcd34d;border-top:3px solid #d97706">
        <div class="si" style="background:#fef3c7">
           <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="6"/>
            <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
          </svg>
        </div>
        <div class="sl">OVERALL GRADE</div>
        <div class="sv" style="color:#d97706;font-size:26px">${grade}</div>
        <span class="result ${passed?'pass':'fail'}">${passed?'PASS':'FAIL'}</span>
      </div>

      <!-- Card 5: Position / Rank -->
      <div class="sc" style="border-color:#fed7aa;border-top:3px solid #ea580c">
        <div class="si" style="background:#ffedd5">
           <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
            <path d="M4 22h16"/>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
          </svg>
        </div>
        <div class="sl">POSITION / RANK</div>
        <div class="sv" style="color:#ea580c;font-size:22px">${rank}<sup style="font-size:11px">${rankSuffix(rank)}</sup></div>
        <div class="ss">Out of ${totalStudents} Students</div>
      </div>

      <!-- Card 6: Grade Scale -->
      <div class="sc" style="border-color:#ddd6fe;border-top:3px solid #7c3aed">
        <div class="si" style="background:#f3e8ff">
           <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/>
            <path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
          </svg>
        </div>
        <div class="sl">GRADE SCALE</div>
        <table class="gs-mini">
          <tr><td>&#x2265;90%</td><td>A+</td></tr>
          <tr><td>80–89%</td><td>A</td></tr>
          <tr><td>70–79%</td><td>B+</td></tr>
          <tr><td>60–69%</td><td>B</td></tr>
          <tr><td>50–59%</td><td>C</td></tr>
          <tr><td>30–49%</td><td>D</td></tr>
          <tr><td>&lt;30%</td><td>F</td></tr>
        </table>
      </div>

    </div>

    <!-- ══ REMARKS ══ -->
    <div class="rem">
      <div class="rem-tag">REMARKS</div>
      <div class="rem-txt">${remark}</div>
    </div>


  <!-- ══ SIGNATURES ══ -->
  <div class="sigs">
    <div class="sig-block">
       ${marksheetSignatureHtml('teacher', branding)}
      <div class="role">Class Teacher</div>
    </div>
    <div class="sig-block">
       ${marksheetSignatureHtml('principal', branding)}
      <div class="role">Principal</div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-quote">Education is the most powerful weapon which you can use to change the world.</div>
  </div>

  </div><!-- /inner -->

</div><!-- /page -->
</body>
</html>`;
}

// ─── Combined Annual HTML ─────────────────────────────────────────────────────
// Columns: Subject | 1st Unit Test (OBT./max) | 2nd Unit Test | Half Yearly | Annual Exam | TOTAL | % | GRADE
function buildCombinedMarksheetHtml(
  data: CombinedMarksheetData,
  branding: DocumentBranding = EMPTY_BRANDING,
  academicSession: string = getAcademicYear(),
): string {
  const { student, examMap, subjectRows, examTotals, grandTotal, grandMax, percentage, grade,
    rank, totalStudents, passed } = data;
  const acYear  = academicSession;
  const pctFmt  = percentage.toFixed(2);
  const issueDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const verifyData = encodeURIComponent(
    `${student.name}|Roll:${student.rollNumber}|Class:${data.className}|Combined Annual|Total:${grandTotal}/${grandMax}|Grade:${grade}|${passed ? 'PASS' : 'FAIL'}`
  );

  // corner SVG helper — all four ornaments share the same geometry; rotation is
  // handled entirely by CSS on the wrapper div.
  const cornerSvg = () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><polyline points="2,32 2,6 6,2 32,2" fill="none" stroke="#c8a040" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polygon points="6,2 10,6 6,10 2,6" fill="#c8a040"/><line x1="8" y1="2" x2="22" y2="2" stroke="#c8a040" stroke-width="1.2" opacity="0.6"/><line x1="2" y1="8" x2="2" y2="22" stroke="#c8a040" stroke-width="1.2" opacity="0.6"/></svg>`;

  // Table header rows
  const examTopHeaders = EXAM_TYPE_ORDER.map(key => {
    const exam = examMap[key];
    const label = key === '1ut' ? '1ST UNIT TEST' : key === '2ut' ? '2ND UNIT TEST' : key === 'half' ? 'HALF YEARLY' : 'ANNUAL EXAM';
    const col = exam ? '#e8c96a' : 'rgba(255,255,255,0.28)';
    return `<th colspan="2" style="padding:8px 4px;font-size:10px;font-weight:700;color:${col};text-align:center;border-left:1px solid rgba(255,255,255,0.18);letter-spacing:0.5px">${label}</th>`;
  }).join('');

  const examSubHeaders = EXAM_TYPE_ORDER.map(key => {
    const exam = examMap[key];
    const ca = exam ? '#e8c96a' : 'rgba(255,255,255,0.2)';
    const cb = exam ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.18)';
    return `<th style="padding:5px 4px;font-size:10px;font-weight:700;color:${ca};text-align:center;border-left:1px solid rgba(255,255,255,0.12)">OBT.</th>`
         + `<th style="padding:5px 4px;font-size:9px;font-weight:600;color:${cb};text-align:center;border-left:1px solid rgba(255,255,255,0.06)">/MAX</th>`;
  }).join('');

  // Subject rows
  const subjectRowsHtml = subjectRows.map((row, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f5f7fc';
    const sg = getGrade(row.pct);
    const icon = subjectIcon(row.subject);
    const examCells = EXAM_TYPE_ORDER.map(key => {
      const v = row.marks[key];
      const ex = examMap[key];
      if (v === null || !ex)
        return `<td style="padding:6px 4px;text-align:center;border-left:1px solid #dde4f0;border-bottom:1px solid #dde4f0;color:#c0c9d8">—</td>`
             + `<td style="padding:6px 4px;text-align:center;border-left:1px solid #eef1f8;border-bottom:1px solid #dde4f0;color:#c0c9d8">—</td>`;
      return `<td style="padding:6px 4px;font-size:13px;font-weight:800;color:#0c1f4a;text-align:center;border-left:1px solid #dde4f0;border-bottom:1px solid #dde4f0">${v}</td>`
           + `<td style="padding:6px 4px;font-size:11px;color:#0c1f4a;text-align:center;border-left:1px solid #eef1f8;border-bottom:1px solid #dde4f0">${getSubjectMaxMarks(ex, row.subject, student.class)}</td>`;
    }).join('');
    return `<tr style="background:${bg}">
      <td style="padding:6px 12px;font-size:12px;font-weight:700;color:#0c1f4a;text-transform:uppercase;border-bottom:1px solid #dde4f0;border-right:1px solid #dde4f0;white-space:nowrap">${icon}&nbsp;${row.subject}</td>
      ${examCells}
      <td style="padding:6px 6px;font-size:13px;font-weight:800;color:#0c1f4a;text-align:center;border-left:2px solid #b0bcd4;border-bottom:1px solid #dde4f0">${row.total}</td>
       <td style="padding:6px 4px;font-size:11px;color:#0c1f4a;text-align:center;border-left:1px solid #dde4f0;border-bottom:1px solid #dde4f0">${row.max}</td>
      <td style="padding:6px 6px;font-size:12px;font-weight:600;color:#1a1a2e;text-align:center;border-left:1px solid #dde4f0;border-bottom:1px solid #dde4f0">${row.pct.toFixed(2)}</td>
      <td style="padding:6px 6px;font-size:14px;font-weight:900;color:${sg.color};text-align:center;border-left:1px solid #dde4f0;border-bottom:1px solid #dde4f0">${row.grade}</td>
    </tr>`;
  }).join('');

  // Grand total row cells per exam
  const examTotalCells = EXAM_TYPE_ORDER.map(key => {
    const t = examTotals[key];
    if (!t)
      return `<td style="padding:6px 4px;text-align:center;border-left:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.3)">—</td>`
           + `<td style="padding:6px 4px;text-align:center;border-left:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.2)">—</td>`;
    return `<td style="padding:6px 4px;font-size:14px;font-weight:900;color:#e8c96a;text-align:center;border-left:1px solid rgba(255,255,255,0.18)">${t.obtained}</td>`
         + `<td style="padding:6px 4px;font-size:11px;color:rgba(255,255,255,0.65);text-align:center;border-left:1px solid rgba(255,255,255,0.08)">/${t.max}</td>`;
  }).join('');

  const remark = percentage >= 90 ? 'Excellent performance! Keep up the hard work and continue to shine.' :
    percentage >= 80 ? 'Very good performance. Continue striving for excellence.' :
    percentage >= 70 ? 'Good performance. Continue to work hard to improve further.' :
    percentage >= 60 ? 'Satisfactory performance. More effort is needed in some subjects.' :
    percentage >= 50 ? 'Average performance. Significant improvement is required.' :
    percentage >= 30 ? 'Below average. Needs to put in considerably more effort.' :
    'Failed. Student must repeat the academic year.';

  const gradeRows = [['90% and above','A+'],['80% to 89%','A'],['70% to 79%','B+'],['60% to 69%','B'],['50% to 59%','C'],['30% to 49%','D'],['Below 30%','F']]
    .map(([r,g], i) => `<tr style="background:${i%2===0?'#fff':'#f5f7fd'}"><td style="padding:5px 10px;font-size:12px;color:#475569;border-bottom:1px solid #eef1f8">${r}</td><td style="padding:5px 10px;font-size:14px;font-weight:900;color:#0c1f4a;text-align:center;border-bottom:1px solid #eef1f8">${g}</td></tr>`).join('');

  // Always zoom .inner so footer + signatures are guaranteed to fit within
  // .page { height:297mm; overflow:hidden }. A hard max of 0.93 ensures at least
  // 7 % reduction even with very few subjects (estimation errors can't cause clipping).
  // Base 840 = header~275 + info~135 + table-header~60 + summary~140 + remarks~45 + sigs~80 + footer~45 + gaps~60
  const _innerContentH = 840 + subjectRows.length * 30;
  const _innerZoomVal = Math.min(0.93, 920 / _innerContentH);
  const _innerZoomCss = `zoom:${_innerZoomVal.toFixed(3)};`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Combined Marksheet – ${student.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Archivo+Black&display=swap" rel="stylesheet">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Poppins',Arial,sans-serif; background:#fff; padding:0; margin:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  @page { size:A4 portrait; margin:0; }
  @media print { html, body { background:#fff; padding:0; margin:0; height:297mm; overflow:hidden; } .page { page-break-after:avoid; break-after:avoid; } }
  /* 794 px = A4 width at 96 dpi; height:auto so PDF captures only actual content, no blank gap */
  .page { width:794px; height:auto; margin:0 auto; background:#fdfefb; border:5px solid #0c1f4a; border-radius:10px; padding:9px; position:relative; box-sizing:border-box; display:flex; flex-direction:column; }
  .corner { position:absolute; width:48px; height:48px; pointer-events:none; z-index:10; }
  .corner.tl { top:5px; left:5px; transform:rotate(0deg); transform-origin:50% 50%; }
  .corner.tr { top:5px; right:5px; transform:rotate(90deg); transform-origin:50% 50%; }
  .corner.bl { bottom:5px; left:5px; transform:rotate(-90deg); transform-origin:50% 50%; }
  .corner.br { bottom:5px; right:5px; transform:rotate(180deg); transform-origin:50% 50%; }
  .inner { border:1.5px solid #c8a040; border-radius:6px; padding:12px; overflow:hidden; display:flex; flex-direction:column; ${_innerZoomCss} }
  /* header */
  .hdr { display:flex; align-items:flex-start; gap:18px; padding-bottom:8px; border-bottom:3px solid #0c1f4a; }
  .hdr-center { flex:1; text-align:center; }
  .school-h1 { font-family:'Archivo Black',sans-serif; font-size:26px; color:#0c1f4a; line-height:1.2; letter-spacing:0.3px; }
  .tagline-row { display:flex; align-items:center; gap:8px; margin:4px 0 3px; }
  .tline { flex:1; height:1.5px; background:#c8a040; }
  .tagline-txt { font-size:10px; font-weight:700; color:#0c1f4a; letter-spacing:3px; white-space:nowrap; }
  .addr { font-size:11.5px; font-weight:600; color:#0c1f4a; display:flex; align-items:center; justify-content:center; gap:5px; }
  .hdr-right { flex-shrink:0; text-align:center; }
  .session-box { background:#0c1f4a; color:#fff; border-radius:6px; padding:6px 18px; display:inline-block; }
  .session-lbl { font-size:9px; letter-spacing:1.5px; font-weight:600; }
  .session-val { font-size:21px; font-weight:800; line-height:1.2; }
  .comb-title { margin-top:5px; }
  .comb-title .t1 { font-family:'Archivo Black',sans-serif; font-size:13px; color:#c8a040; font-style:italic; letter-spacing:1px; }
  .comb-title .t2 { font-family:'Archivo Black',sans-serif; font-size:26px; color:#c8a040; font-style:italic; letter-spacing:1px; line-height:1; }
  .comb-title .stars { font-size:11px; color:#c8a040; letter-spacing:5px; margin-top:2px; }
  /* info box */
  .info-box { border:1.5px solid #c8a040; border-radius:8px; display:flex; margin-top:7px; overflow:hidden; background:#fdfcf5; }
  .info-col { flex:1; padding:5px 10px; }
  .info-col + .info-col { border-left:1px solid #e8d9a8; }
  .irow { display:flex; align-items:center; gap:6px; height:17px; margin-bottom:1px; font-size:11px; line-height:1; }
  .irow:last-child { margin-bottom:0; }
  .irow .ic { width:18px; height:17px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:11px; }
  .irow .lbl { font-weight:600; color:#0c1f4a; min-width:78px; flex-shrink:0; }
  .irow .colon { font-weight:700; color:#c8a040; margin:0 4px; flex-shrink:0; }
  .irow .val { font-weight:700; color:#1a1a2e; white-space:nowrap; flex-shrink:1; overflow:hidden; text-overflow:ellipsis; }
  /* ---------- QR card ---------- */
  .qr-card { margin-top:5px; border:2px solid #c8a040; border-radius:10px; padding:7px 10px; display:inline-flex; flex-direction:column; align-items:center; gap:4px; background:#f5f7fc; box-shadow:0 3px 10px rgba(200,160,64,0.2); }
  .qr-card span { font-size:9px; font-weight:700; color:#0c1f4a; letter-spacing:1.5px; text-transform:uppercase; }
  /* perf table */
  .perf-title { background:#0c1f4a; display:flex; align-items:center; gap:10px; padding:6px 14px; border-radius:6px 6px 0 0; margin-top:9px; }
  .pt-line { flex:1; height:1px; background:rgba(200,160,64,0.45); }
  .pt-txt { font-size:12px; font-weight:700; color:#fff; letter-spacing:2.5px; }
  table.mt { width:100%; border-collapse:collapse; font-size:12px; border:1.5px solid #0c1f4a; border-top:none; }
  table.mt th { background:#0c1f4a; color:#fff; padding:5px 4px; font-size:10px; font-weight:700; letter-spacing:0.4px; text-align:center; border-right:1px solid rgba(255,255,255,0.12); }
  table.mt th.sh { text-align:left; padding-left:12px; }
  table.mt th.sub { background:#122d60; font-size:9.5px; color:rgba(255,255,255,0.85); font-weight:600; }
  table.mt th.total-h { color:#e8c96a; border-left:2px solid rgba(255,255,255,0.28); }
  table.mt tr.tr td { background:#0c1f4a; font-weight:800; font-size:13px; border-top:2px solid #0c1f4a; border-bottom:none; }
  table.mt tr.tr td:first-child { font-size:12px; }
  /* summary cards */
  .summary { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin-top:8px; margin-bottom:0; page-break-inside:avoid; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .sc { border:1.5px solid #e2e8f0; border-radius:14px; padding:6px 5px 5px; text-align:center; background:#fff; box-shadow:0 6px 20px rgba(12,31,74,0.10), 0 1px 5px rgba(12,31,74,0.06); display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .sc .si { display:flex; justify-content:center; align-items:center; margin:0 auto 6px; width:42px; height:42px; border-radius:50%; flex-shrink:0; }
  .sc .si svg { width:29px; height:29px; }
  .sc .sl { font-size:8.5px; font-weight:700; color:#0c1f4a; letter-spacing:0.4px; line-height:1.5; text-transform:uppercase; }
  .sc .sv { font-family:'Archivo Black',sans-serif; font-size:17px; color:#0c1f4a; margin-top:2px; line-height:1.1; }
  .sc .ss { font-size:8px; color:#64748b; margin-top:1px; line-height:1.3; }
  .sc .result { display:inline-block; margin-top:3px; padding:2px 8px; border-radius:20px; font-size:9.5px; font-weight:700; }
  .sc .pass { background:#d4edda; color:#1a7a40; }
  .sc .fail { background:#f8d7da; color:#b02020; }
  .gs-mini { width:100%; margin-top:3px; border-collapse:collapse; }
  .gs-mini td { font-size:8.5px; padding:2px 3px; border-bottom:1px solid #f0f4f8; text-align:left; color:#475569; }
  .gs-mini td:last-child { text-align:right; font-weight:800; color:#0c1f4a; font-size:10px; padding-right:4px; }
  @media print { .summary { display:grid !important; grid-template-columns:repeat(6,1fr) !important; } }
  /* remarks */
  .rem { display:flex; align-items:stretch; margin-top:7px; border-radius:6px; overflow:hidden; border:1.5px solid #d0d8ea; }
  .rem-tag { background:#0c1f4a; color:#fff; padding:8px 18px 8px 12px; font-size:12px; font-weight:700; letter-spacing:0.5px; display:flex; align-items:center; clip-path:polygon(0 0,100% 0,90% 100%,0 100%); padding-right:32px; }
  .rem-txt { padding:8px 14px; font-size:12.5px; color:#222; display:flex; align-items:center; font-weight:500; flex:1; }
  /* signatures — flex-shrink:0 keeps them out of the scrolling inner area */
  .sigs { display:flex; justify-content:space-around; margin-top:6px; text-align:center; flex-shrink:0; }
  .sig-block .cursive { font-family:'Brush Script MT','Segoe Script',cursive; font-size:28px; color:#0c1f4a; display:block; border-bottom:1.5px solid #333; padding-bottom:4px; margin-bottom:6px; min-width:160px; line-height:1.4; }
  .sig-block .role { font-size:11.5px; font-weight:700; color:#0c1f4a; letter-spacing:0.3px; }
  /* footer — flex-shrink:0 always pins it at page bottom */
  .footer { position:relative; z-index:11; background:#0c1f4a; border-radius:0 0 6px 6px; margin-top:6px; padding:8px 22px; text-align:center; flex-shrink:0; }
  .footer-quote { font-size:10px; color:#c8a040; letter-spacing:2.5px; font-weight:700; font-family:'Poppins',Arial,sans-serif; text-transform:uppercase; }
</style>
</head>
<body>
<div class="page">

  <!-- Gold corners (rotated via CSS, no inline transforms) -->
  <div class="corner tl">${cornerSvg()}</div>
  <div class="corner tr">${cornerSvg()}</div>
  <div class="corner bl">${cornerSvg()}</div>
  <div class="corner br">${cornerSvg()}</div>

  <div class="inner">

    <!-- ══ HEADER ══ -->
    <div class="hdr">
      <!-- Badge -->
      <div style="flex-shrink:0">
           ${branding.logoDataUrl ? documentLogoHtml(branding, 130, 130) : `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="130" viewBox="0 0 110 110">
          <defs>
            <path id="cta" d="M 11,55 A 44,44 0 1,0 99,55"/>
            <path id="cba" d="M 18,55 A 37,37 0 0,1 92,55"/>
          </defs>
          <circle cx="55" cy="55" r="53" fill="#0c1f4a" stroke="#c8a040" stroke-width="3"/>
          <circle cx="55" cy="55" r="43" fill="none" stroke="#c8a040" stroke-width="1" stroke-dasharray="3,2"/>
          <text font-size="8" fill="#c8a040" font-family="Poppins,Arial" font-weight="bold" letter-spacing="0.8"><textPath href="#cta" startOffset="50%" text-anchor="middle">DR. APJ KALAM JATIYA VIDYALAYA</textPath></text>
          <text x="55" y="38" text-anchor="middle" font-size="7.5" fill="#c8a040" font-family="Poppins,Arial" font-weight="bold" letter-spacing="1.5">ESTD  2016</text>
          <line x1="38" y1="43" x2="72" y2="43" stroke="#c8a040" stroke-width="0.8"/>
          <text x="55" y="63" text-anchor="middle" font-size="22" fill="white">📖</text>
          <line x1="38" y1="69" x2="72" y2="69" stroke="#c8a040" stroke-width="0.8"/>
          <text font-size="9" fill="#c8a040" font-family="Poppins,Arial" font-weight="bold" letter-spacing="3"><textPath href="#cba" startOffset="50%" text-anchor="middle">BUNDURA</textPath></text>
         </svg>`}
      </div>
      <!-- School name -->
      <div class="hdr-center">
        <div class="school-h1">${SCHOOL_INFO.name}</div>
        <div class="tagline-row"><div class="tline"></div><span class="tagline-txt">DISCIPLINE &nbsp;•&nbsp; KNOWLEDGE &nbsp;•&nbsp; VALUES</span><div class="tline"></div></div>
        <div class="addr">📍 ${SCHOOL_INFO.address}</div>
      </div>
      <!-- Session + title + QR -->
      <div class="hdr-right">
        <div class="session-box">
          <div class="session-lbl">ACADEMIC SESSION</div>
          <div class="session-val">${acYear}</div>
        </div>
        <div class="comb-title">
          <div class="t1">COMBINED ANNUAL</div>
          <div class="t2">MARKSHEET</div>
          <div class="stars">★ ★ ★</div>
        </div>
        <div class="qr-card">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=84x84&color=0c1f4a&bgcolor=FFFFFF&data=${verifyData}" width="84" height="84" style="border-radius:4px;display:block" onerror="this.style.display='none'" alt="QR Code"/>
          <span>Scan to Verify</span>
        </div>
      </div>
    </div>

    <!-- ══ STUDENT INFO ══ -->
    <div class="info-box">
      <div class="info-col">
        <div class="irow"><span class="ic">👤</span><span class="lbl">Student Name</span><span class="colon">:</span><span class="val">${student.name.toUpperCase()}</span></div>
        <div class="irow"><span class="ic">👨</span><span class="lbl">Father's Name</span><span class="colon">:</span><span class="val">${(student.fatherName||'—').toUpperCase()}</span></div>
        <div class="irow"><span class="ic">👩</span><span class="lbl">Mother's Name</span><span class="colon">:</span><span class="val">${(student.motherName||'—').toUpperCase()}</span></div>
        <div class="irow"><span class="ic">🎓</span><span class="lbl">Class</span><span class="colon">:</span><span class="val">${data.className}</span></div>
        <div class="irow"><span class="ic">📘</span><span class="lbl">Section</span><span class="colon">:</span><span class="val">${student.section?.trim() || '—'}</span></div>
      </div>
      <div class="info-col">
        <div class="irow"><span class="ic">🪪</span><span class="lbl">Adm. No.</span><span class="colon">:</span><span class="val">${student.admissionNo||'—'}</span></div>
        <div class="irow"><span class="ic">📋</span><span class="lbl">Roll No.</span><span class="colon">:</span><span class="val">${student.rollNumber}</span></div>
        <div class="irow"><span class="ic">📅</span><span class="lbl">D.O.B.</span><span class="colon">:</span><span class="val">${fmtDate(student.dateOfBirth)}</span></div>
        <div class="irow"><span class="ic">📝</span><span class="lbl">Exam Type</span><span class="colon">:</span><span class="val">Regular</span></div>
        <div class="irow"><span class="ic">📅</span><span class="lbl">Issue Date</span><span class="colon">:</span><span class="val">${issueDate}</span></div>
      </div>
    </div>

    <!-- ══ ACADEMIC PERFORMANCE TABLE ══ -->
    <div class="perf-title">
      <div class="pt-line"></div>
      <div class="pt-txt">ACADEMIC PERFORMANCE</div>
      <div class="pt-line"></div>
    </div>
    <table class="mt">
      <thead>
        <tr>
          <th class="sh" rowspan="2" style="width:16%">SUBJECTS</th>
          ${examTopHeaders}
          <th class="total-h" colspan="2" rowspan="1" style="width:10%">TOTAL</th>
          <th rowspan="2" style="width:7%">%</th>
          <th rowspan="2" style="width:7%">GRADE</th>
        </tr>
        <tr>
          ${examSubHeaders}
          <th class="sub total-h" style="width:6%;border-left:2px solid rgba(255,255,255,0.28)">OBT.</th>
          <th class="sub" style="width:5%">/MAX</th>
        </tr>
      </thead>
      <tbody>
        ${subjectRowsHtml}
        <tr class="tr">
          <td style="padding:9px 12px;border-right:1px solid rgba(255,255,255,0.15);color:#fff;font-size:11px">TOTAL (ALL SUBJECTS)</td>
          ${examTotalCells}
          <td style="text-align:center;border-left:2px solid rgba(255,255,255,0.28);color:#e8c96a;font-size:15px">${grandTotal}</td>
          <td style="text-align:center;border-left:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.65);font-size:11px">/${grandMax}</td>
          <td style="text-align:center;border-left:1px solid rgba(255,255,255,0.15);color:#e8c96a">${pctFmt}</td>
          <td style="text-align:center;border-left:1px solid rgba(255,255,255,0.15);color:#e8c96a;font-size:16px;font-weight:900">${grade}</td>
        </tr>
      </tbody>
    </table>

    <!-- ══ SUMMARY CARDS ══ -->
    <div class="summary">

      <!-- Card 1: Total Marks -->
      <div class="sc" style="border-color:#bfdbfe;border-top:3px solid #1e40af">
        <div class="si" style="background:#dbeafe">
           <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="#1e40af" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="2" width="8" height="4" rx="1"/>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>
          </svg>
        </div>
        <div class="sl">TOTAL MARKS<br>(ALL SUBJECTS)</div>
        <div class="sv" style="color:#1e40af">${grandMax}</div>
      </div>

      <!-- Card 2: Total Obtained Marks -->
      <div class="sc" style="border-color:#a7f3d0;border-top:3px solid #059669">
        <div class="si" style="background:#dcfce7">
           <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <div class="sl">TOTAL OBTAINED<br>MARKS</div>
        <div class="sv" style="color:#059669">${grandTotal}</div>
      </div>

      <!-- Card 3: Percentage -->
      <div class="sc" style="border-color:#bfdbfe;border-top:3px solid #2563eb">
        <div class="si" style="background:#eff6ff">
           <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="5" x2="5" y2="19"/>
            <circle cx="6.5" cy="6.5" r="2.5"/>
            <circle cx="17.5" cy="17.5" r="2.5"/>
          </svg>
        </div>
        <div class="sl">PERCENTAGE</div>
        <div class="sv" style="color:#2563eb;font-size:15px">${pctFmt}%</div>
      </div>

      <!-- Card 4: Overall Grade -->
      <div class="sc" style="border-color:#fcd34d;border-top:3px solid #d97706">
        <div class="si" style="background:#fef3c7">
           <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="6"/>
            <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
          </svg>
        </div>
        <div class="sl">OVERALL GRADE</div>
        <div class="sv" style="color:#d97706;font-size:20px">${grade}</div>
        <span class="result ${passed?'pass':'fail'}">${passed?'PASS':'FAIL'}</span>
      </div>

      <!-- Card 5: Position / Rank -->
      <div class="sc" style="border-color:#fed7aa;border-top:3px solid #ea580c">
        <div class="si" style="background:#ffedd5">
           <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
            <path d="M4 22h16"/>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
          </svg>
        </div>
        <div class="sl">POSITION / RANK</div>
        <div class="sv" style="color:#ea580c;font-size:18px">${rank}<sup style="font-size:10px">${rankSuffix(rank)}</sup></div>
        <div class="ss">Out of ${totalStudents} Students</div>
      </div>

      <!-- Card 6: Grade Scale -->
      <div class="sc" style="border-color:#ddd6fe;border-top:3px solid #7c3aed">
        <div class="si" style="background:#f3e8ff">
           <svg xmlns="http://www.w3.org/2000/svg" width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/>
            <path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
          </svg>
        </div>
        <div class="sl">GRADE SCALE</div>
        <table class="gs-mini">
          <tr><td>&#x2265;90%</td><td>A+</td></tr>
          <tr><td>80–89%</td><td>A</td></tr>
          <tr><td>70–79%</td><td>B+</td></tr>
          <tr><td>60–69%</td><td>B</td></tr>
          <tr><td>50–59%</td><td>C</td></tr>
          <tr><td>30–49%</td><td>D</td></tr>
          <tr><td>&lt;30%</td><td>F</td></tr>
        </table>
      </div>

    </div>

    <!-- ══ REMARKS ══ -->
    <div class="rem">
      <div class="rem-tag">REMARKS</div>
      <div class="rem-txt">${remark}</div>
    </div>


  <!-- ══ SIGNATURES ══ -->
  <div class="sigs">
    <div class="sig-block">
      ${marksheetSignatureHtml('teacher', branding)}
      <div class="role">Class Teacher</div>
    </div>
    <div class="sig-block">
      ${marksheetSignatureHtml('principal', branding)}
      <div class="role">Principal</div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-quote">Education is the most powerful weapon which you can use to change the world.</div>
  </div>

  </div><!-- /inner -->

</div><!-- /page -->
</body>
</html>`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MarksheetScreen() {
  const insets = useSafeAreaInsets();
  const { students, exams, examResults, documentBranding } = useApp();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [marksheetType, setMarksheetType] = useState<MarksheetType>('single');
  const [genMode, setGenMode]             = useState<GenMode>('individual');
  const [academicSession, setAcademicSession] = useState(getAcademicYear);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showCustomSessionInput, setShowCustomSessionInput] = useState(false);
  const [customSessionText, setCustomSessionText] = useState('');

  // Single exam state
  const [selectedClass, setSelectedClass]   = useState('');
  const [selectedExam, setSelectedExam]     = useState<Exam | null>(null);
  const [search, setSearch]                 = useState('');
  const [bulkSelected, setBulkSelected]     = useState<Set<string>>(new Set());
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showExamPicker, setShowExamPicker]   = useState(false);

  // Combined state
  const [combinedClass, setCombinedClass]   = useState('');
  const [showCombinedClassPicker, setShowCombinedClassPicker] = useState(false);

  // Preview / loading
  const [loading, setLoading]               = useState(false);
  const downloadInFlight = useRef(false);
  const [downloadReady, setDownloadReady] = useState<{ url: string; filename: string } | null>(null);
  const [previewData, setPreviewData]       = useState<MarksheetData | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [combinedPreviewData, setCombinedPreviewData]     = useState<CombinedMarksheetData | null>(null);
  const [combinedPreviewVisible, setCombinedPreviewVisible] = useState(false);
  const [pdfSaved, setPdfSaved] = useState<{ filename: string; fileUri: string } | null>(null);

  const botPad = insets.bottom + 86;

  useEffect(() => {
    return () => {
      if (downloadReady?.url) URL.revokeObjectURL(downloadReady.url);
    };
  }, [downloadReady]);

  useEffect(() => {
    AsyncStorage.getItem(ACADEMIC_SESSION_KEY).then(savedSession => {
      if (savedSession?.trim()) setAcademicSession(savedSession);
    });
  }, []);

  const academicSessionOptions = useMemo(() => {
    const currentStartYear = Number(getAcademicYear().slice(0, 4));
    return Array.from({ length: 11 }, (_, index) => {
      const startYear = currentStartYear - 5 + index;
      return `${startYear}–${startYear + 1}`;
    });
  }, []);

  const selectAcademicSession = useCallback((session: string) => {
    setAcademicSession(session);
    setShowSessionPicker(false);
    void AsyncStorage.setItem(ACADEMIC_SESSION_KEY, session);
  }, []);

  // ── Class options ─────────────────────────────────────────────────────────────
  const classOptions = useMemo(() => {
    return Array.from(new Set(students.filter(isActiveStudent).map(s => s.class).filter(Boolean))).sort();
  }, [students]);

  // ── Single: filtered exams for chosen class ───────────────────────────────────
  const filteredExams = useMemo(() => {
    if (!selectedClass) return exams;
    return exams.filter(e => e.class === selectedClass);
  }, [exams, selectedClass]);

  // ── Single: student lists ─────────────────────────────────────────────────────
  const singleStudents = useMemo(() => {
    if (!selectedExam) return [];
    let list = students.filter(s => s.class === selectedExam.class && isActiveStudent(s));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.rollNumber.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));
  }, [students, selectedExam, search]);

  const singleStudentsWithResults = useMemo(() => {
    if (!selectedExam) return [];
    const ids = new Set(examResults.filter(r => r.examId === selectedExam.id).map(r => r.studentId));
    return singleStudents.filter(s => ids.has(s.id));
  }, [singleStudents, examResults, selectedExam]);

  const bulkStudents = useMemo(() => {
    if (!selectedExam || !selectedClass) return [];
    const ids = new Set(examResults.filter(r => r.examId === selectedExam.id).map(r => r.studentId));
    return students
      .filter(s => s.class === selectedClass && ids.has(s.id))
      .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));
  }, [students, selectedExam, selectedClass, examResults]);

  // ── Combined: match exams by type for selected class ──────────────────────────
  const combinedExamMap = useMemo((): Partial<Record<ExamTypeKey, Exam>> => {
    if (!combinedClass) return {};
    const classExams = exams.filter(e => e.class === combinedClass);
    const map: Partial<Record<ExamTypeKey, Exam>> = {};
    classExams.forEach(e => {
      const key = classifyExam(e.name);
      if (key && !map[key]) map[key] = e;
    });
    return map;
  }, [exams, combinedClass]);

  const combinedStudents = useMemo(() => {
    if (!combinedClass || Object.keys(combinedExamMap).length === 0) return [];
    const examIds = Object.values(combinedExamMap).map(e => e!.id);
    const withAnyResult = new Set(examResults.filter(r => examIds.includes(r.examId)).map(r => r.studentId));
    return students
      .filter(s => s.class === combinedClass && withAnyResult.has(s.id))
      .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));
  }, [students, combinedClass, combinedExamMap, examResults]);

  // ── Build helpers ─────────────────────────────────────────────────────────────
  const buildSingleData = useCallback((student: Student): MarksheetData | null => {
    if (!selectedExam) return null;
    const result = examResults.find(r => r.examId === selectedExam.id && r.studentId === student.id);
    if (!result) return null;
    return calcMarksheet(student, selectedExam, result, examResults);
  }, [selectedExam, examResults]);

  const buildCombinedData = useCallback((student: Student): CombinedMarksheetData | null => {
    if (Object.keys(combinedExamMap).length === 0) return null;
    const resultMap: Partial<Record<ExamTypeKey, ExamResult>> = {};
    EXAM_TYPE_ORDER.forEach(key => {
      const exam = combinedExamMap[key];
      if (!exam) return;
      const r = examResults.find(r => r.examId === exam.id && r.studentId === student.id);
      if (r) resultMap[key] = r;
    });
    if (Object.keys(resultMap).length === 0) return null;
    return calcCombinedMarksheet(student, combinedExamMap, resultMap, examResults, combinedClass);
  }, [combinedExamMap, examResults, combinedClass]);

  // ── Print / download helpers ──────────────────────────────────────────────────
  // Delegates to the shared pdfExport utility which:
  //   • generates QR codes client-side (no CORS blanks)
  //   • scales content to fit exactly one A4 page
  //   • renders at 3× scale (~288 dpi)
  async function printHtml(html: string) {
    await sharedPrintHtml(html);
  }

  async function downloadHtml(html: string, filename: string) {
    const onSaved = Platform.OS !== 'web'
      ? (fn: string, uri: string) => setPdfSaved({ filename: fn, fileUri: uri })
      : undefined;
    const url = await downloadHtmlAsPdf(html, filename, '.page', 'img[alt="QR Code"]', Platform.OS === 'web' ? false : true, onSaved, 8);
    if (url && Platform.OS === 'web') {
      setDownloadReady({ url, filename: `${filename}.pdf` });
    }
  }

  function dismissReadyFile(): void {
    if (!downloadReady) return;
    const url = downloadReady.url;
    setDownloadReady(null);
    URL.revokeObjectURL(url);
  }

  function renderDownloadLink() {
    if (!downloadReady || Platform.OS !== 'web') return null;
    const { url, filename } = downloadReady;
    return React.createElement(
      'a',
      {
        href: url,
        download: filename,
        rel: 'noopener',
        'aria-label': `Download ${filename}`,
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: '#1E3A8A',
          borderRadius: 10,
          padding: '9px 11px',
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        } as React.CSSProperties,
        onClick: () => {
          // Give Chrome time to start the download before releasing the Blob.
          window.setTimeout(() => {
            setDownloadReady(current => {
              if (current?.url !== url) return current;
              URL.revokeObjectURL(url);
              return null;
            });
          }, 2500);
        },
      },
      'Download PDF',
    );
  }

  function beginDownload(): boolean {
    if (downloadInFlight.current) return false;
    downloadInFlight.current = true;
    setLoading(true);
    return true;
  }

  function endDownload(): void {
    downloadInFlight.current = false;
    setLoading(false);
  }

  // ── Individual actions ────────────────────────────────────────────────────────
  const openPreview = useCallback((student: Student) => {
    const data = buildSingleData(student);
    if (!data) { Alert.alert('No Results', 'No results found for this student.'); return; }
    setPreviewData(data); setPreviewVisible(true);
  }, [buildSingleData]);

  const printSingle = useCallback(async (student: Student) => {
    const data = buildSingleData(student);
    if (!data) { Alert.alert('No Results', 'No results found.'); return; }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try { await printHtml(buildSingleMarksheetHtml(data, documentBranding, academicSession)); }
    catch (e: any) { if (!e?.message?.includes('cancel')) Alert.alert('Error', e?.message ?? 'Print failed'); }
    finally { setLoading(false); }
  }, [buildSingleData, documentBranding, academicSession]);

  const downloadSingle = useCallback(async (student: Student) => {
    const data = buildSingleData(student);
    if (!data) { Alert.alert('No Results', 'No results found.'); return; }
    if (!beginDownload()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { await downloadHtml(buildSingleMarksheetHtml(data, documentBranding, academicSession), `Marksheet – ${student.name}`); }
    catch (e: any) { if (!e?.message?.includes('cancel')) Alert.alert('Error', e?.message ?? 'Download failed'); }
    finally { endDownload(); }
  }, [buildSingleData, documentBranding, academicSession]);

  const bulkPrint = useCallback(async () => {
    const list = bulkSelected.size > 0 ? bulkStudents.filter(s => bulkSelected.has(s.id)) : bulkStudents;
    if (list.length === 0) { Alert.alert('No Students', 'No students with results.'); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);
    try {
      const dataList = list
        .map(s => buildSingleData(s))
        .filter(Boolean) as MarksheetData[];
      await printMultipleHtmlsAsPdf(
        {
          count: dataList.length,
          getPage: index =>
            buildSingleMarksheetHtml(
              dataList[index],
              documentBranding,
              academicSession,
            ),
        },
        `Marksheets – ${selectedClass}`,
        8,
      );
    } catch (e: any) { if (!e?.message?.includes('cancel')) Alert.alert('Error', e?.message ?? 'Print failed'); }
    finally { setLoading(false); }
  }, [bulkStudents, bulkSelected, buildSingleData, documentBranding, academicSession]);

  const bulkDownload = useCallback(async () => {
    const list = bulkSelected.size > 0 ? bulkStudents.filter(s => bulkSelected.has(s.id)) : bulkStudents;
    if (list.length === 0) { Alert.alert('No Students', 'No students with results.'); return; }
    if (!beginDownload()) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const dataList = list.map(s => buildSingleData(s)).filter(Boolean) as MarksheetData[];
      if (dataList.length === 0) { Alert.alert('No Data', 'No marksheet data available.'); return; }
      const filename = `Marksheets – ${selectedClass}`;
      const onSaved = Platform.OS !== 'web'
        ? (fn: string, uri: string) => setPdfSaved({ filename: fn, fileUri: uri })
        : undefined;
      const url = await downloadMultipleHtmlsAsPdf(
        {
          count: dataList.length,
          getPage: index =>
            buildSingleMarksheetHtml(
              dataList[index],
              documentBranding,
              academicSession,
            ),
        },
        filename,
        '.page',
        Platform.OS === 'web' ? false : true,
        onSaved,
        8,
      );
      if (url && Platform.OS === 'web') {
        setDownloadReady({ url, filename: `${filename}.pdf` });
      }
    } catch (e: any) { if (!e?.message?.includes('cancel')) Alert.alert('Error', e?.message ?? 'Download failed'); }
    finally { endDownload(); }
  }, [bulkStudents, bulkSelected, buildSingleData, selectedClass, documentBranding, academicSession]);

  // ── Combined actions ──────────────────────────────────────────────────────────
  const openCombinedPreview = useCallback((student: Student) => {
    const data = buildCombinedData(student);
    if (!data) { Alert.alert('No Results', 'No results found.'); return; }
    setCombinedPreviewData(data); setCombinedPreviewVisible(true);
  }, [buildCombinedData]);

  const printCombined = useCallback(async (student: Student) => {
    const data = buildCombinedData(student);
    if (!data) { Alert.alert('No Results', 'No results found.'); return; }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try { await printHtml(buildCombinedMarksheetHtml(data, documentBranding, academicSession)); }
    catch (e: any) { if (!e?.message?.includes('cancel')) Alert.alert('Error', e?.message ?? 'Print failed'); }
    finally { setLoading(false); }
  }, [buildCombinedData, documentBranding, academicSession]);

  const downloadCombined = useCallback(async (student: Student) => {
    const data = buildCombinedData(student);
    if (!data) { Alert.alert('No Results', 'No results found.'); return; }
    if (!beginDownload()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await downloadHtml(
        buildCombinedMarksheetHtml(data, documentBranding, academicSession),
        combinedMarksheetDownloadName(`Combined Marksheet – ${student.name}`),
      );
    }
    catch (e: any) { if (!e?.message?.includes('cancel')) Alert.alert('Error', e?.message ?? 'Download failed'); }
    finally { endDownload(); }
  }, [buildCombinedData, documentBranding, academicSession]);

  const bulkCombinedPrint = useCallback(async () => {
    if (combinedStudents.length === 0) { Alert.alert('No Students', 'No students with results.'); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);
    try {
      const studentsToPrint = bulkSelected.size > 0
        ? combinedStudents.filter(s => bulkSelected.has(s.id))
        : combinedStudents;
      const dataList = studentsToPrint
        .map(s => buildCombinedData(s))
        .filter(Boolean) as CombinedMarksheetData[];
      if (dataList.length === 0) { Alert.alert('No Data', 'No marksheet data available.'); return; }
      await printMultipleHtmlsAsPdf(
        {
          count: dataList.length,
          getPage: index =>
            buildCombinedMarksheetHtml(
              dataList[index],
              documentBranding,
              academicSession,
            ),
        },
        `Combined Marksheets – ${combinedClass}`,
        8,
      );
    } catch (e: any) { if (!e?.message?.includes('cancel')) Alert.alert('Error', e?.message ?? 'Print failed'); }
    finally { setLoading(false); }
  }, [combinedStudents, bulkSelected, buildCombinedData, documentBranding, academicSession]);

  const bulkCombinedDownload = useCallback(async () => {
    if (combinedStudents.length === 0) { Alert.alert('No Students', 'No students with results.'); return; }
    if (!beginDownload()) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const studentsToDownload = bulkSelected.size > 0
        ? combinedStudents.filter(s => bulkSelected.has(s.id))
        : combinedStudents;
      const dataList = studentsToDownload.map(s => buildCombinedData(s)).filter(Boolean) as CombinedMarksheetData[];
      if (dataList.length === 0) { Alert.alert('No Data', 'No marksheet data available.'); return; }
      const filename = combinedMarksheetDownloadName(`Combined Marksheets – ${combinedClass}`);
      const onSaved = Platform.OS !== 'web'
        ? (fn: string, uri: string) => setPdfSaved({ filename: fn, fileUri: uri })
        : undefined;
      const url = await downloadMultipleHtmlsAsPdf(
        {
          count: dataList.length,
          getPage: index =>
            buildCombinedMarksheetHtml(
              dataList[index],
              documentBranding,
              academicSession,
            ),
        },
        filename,
        '.page',
        Platform.OS === 'web' ? false : true,
        onSaved,
        8,
      );
      if (url && Platform.OS === 'web') {
        setDownloadReady({ url, filename: `${filename}.pdf` });
      }
    } catch (e: any) { if (!e?.message?.includes('cancel')) Alert.alert('Error', e?.message ?? 'Download failed'); }
    finally { endDownload(); }
  }, [combinedStudents, bulkSelected, buildCombinedData, combinedClass, documentBranding, academicSession]);

  const toggleBulk = useCallback((id: string) => {
    setBulkSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const toggleAll = useCallback((students: Student[]) => {
    setBulkSelected(prev => (
      prev.size === students.length
        ? new Set()
        : new Set(students.map(s => s.id))
    ));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────
  const isCombined = marksheetType === 'combined';
  const isBulk     = genMode === 'bulk';

  const displayStudentList = isCombined ? combinedStudents : (isBulk ? bulkStudents : singleStudentsWithResults.concat(
    singleStudents.filter(s => !singleStudentsWithResults.some(sw => sw.id === s.id))
  ));

  const presentExamTypes = EXAM_TYPE_ORDER.filter(k => !!combinedExamMap[k]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <PDFSavedModal
        visible={!!pdfSaved}
        filename={pdfSaved?.filename ?? ''}
        fileUri={pdfSaved?.fileUri}
        onDismiss={() => setPdfSaved(null)}
      />

      {/* Header */}
      <LinearGradient
        colors={['#0F2456', '#1e3a8a', '#2563EB']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={s.headerInner}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Marksheet Generator</Text>
            <Text style={s.headerSub}>Generate & print A4 marksheets with grades, ranks & QR</Text>
          </View>
          <View style={s.headerIcon}><Feather name="award" size={22} color="#fff" /></View>
        </View>

        {/* Marksheet Type: Single / Combined Annual */}
        <View style={s.typeToggle}>
          <TouchableOpacity
            style={[s.typeBtn, !isCombined && s.typeBtnActive]}
            onPress={() => { setMarksheetType('single'); setBulkSelected(new Set()); }}
            activeOpacity={0.8}
          >
            <Feather name="file-text" size={13} color={!isCombined ? '#059669' : 'rgba(255,255,255,0.85)'} />
            <Text style={[s.typeTxt, !isCombined && s.typeTxtActive]}>Single Exam</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.typeBtn, isCombined && s.typeBtnActive]}
            onPress={() => { setMarksheetType('combined'); setBulkSelected(new Set()); }}
            activeOpacity={0.8}
          >
            <Feather name="layers" size={13} color={isCombined ? '#059669' : 'rgba(255,255,255,0.85)'} />
            <Text style={[s.typeTxt, isCombined && s.typeTxtActive]}>Combined Annual</Text>
          </TouchableOpacity>
        </View>

        {/* Generation mode */}
        <View style={[s.typeToggle, { marginTop: 6 }]}>
          <TouchableOpacity
            style={[s.typeBtn, !isBulk && s.typeBtnActive]}
            onPress={() => { setGenMode('individual'); setBulkSelected(new Set()); }}
            activeOpacity={0.8}
          >
            <Feather name="user" size={13} color={!isBulk ? '#059669' : 'rgba(255,255,255,0.85)'} />
            <Text style={[s.typeTxt, !isBulk && s.typeTxtActive]}>Individual Student</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.typeBtn, isBulk && s.typeBtnActive]}
            onPress={() => { setGenMode('bulk'); setBulkSelected(new Set()); }}
            activeOpacity={0.8}
          >
            <Feather name="users" size={13} color={isBulk ? '#059669' : 'rgba(255,255,255,0.85)'} />
            <Text style={[s.typeTxt, isBulk && s.typeTxtActive]}>Bulk Class</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: botPad }}>
        {isAdmin && (
          <View style={s.filterCard}>
            <Text style={s.filterLabel}>Academic Session</Text>
            <TouchableOpacity style={s.picker} onPress={() => setShowSessionPicker(true)} activeOpacity={0.7}>
              <Feather name="calendar" size={16} color="#059669" />
              <Text style={s.pickerTxt}>{academicSession}</Text>
              <Feather name="chevron-down" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── COMBINED ANNUAL MODE ── */}
        {isCombined ? (
          <>
            {/* Class picker */}
            <View style={s.filterCard}>
              <Text style={s.filterLabel}>Select Class</Text>
              <TouchableOpacity style={s.picker} onPress={() => setShowCombinedClassPicker(true)} activeOpacity={0.7}>
                <Feather name="layers" size={16} color="#059669" />
                <Text style={[s.pickerTxt, !combinedClass && { color: '#94A3B8' }]} numberOfLines={1}>
                  {combinedClass || 'Select Class'}
                </Text>
                <Feather name="chevron-down" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Exam mapping display */}
            {combinedClass ? (
              <View style={s.examMapCard}>
                <Text style={s.examMapTitle}>Auto-Detected Exams for {combinedClass}</Text>
                {EXAM_TYPE_ORDER.map(key => {
                  const exam = combinedExamMap[key];
                  return (
                    <View key={key} style={s.examMapRow}>
                      <View style={[s.examMapDot, { backgroundColor: exam ? '#059669' : '#E2E8F0' }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.examMapLabel}>{EXAM_TYPE_LABELS[key]}</Text>
                        {exam
                          ? <Text style={s.examMapValue}>{exam.name} · {exam.subjects.length} subjects · Max {exam.maxMarks}</Text>
                          : <Text style={[s.examMapValue, { color: '#CBD5E1' }]}>Not found in database</Text>
                        }
                      </View>
                      <Feather name={exam ? 'check-circle' : 'circle'} size={16} color={exam ? '#059669' : '#CBD5E1'} />
                    </View>
                  );
                })}
                {presentExamTypes.length === 0 && (
                  <Text style={s.noExamHint}>
                    No exams matched. Make sure exams are named with "1st Unit Test", "2nd Unit Test", "Half Yearly", or "Annual".
                  </Text>
                )}
              </View>
            ) : null}

            {/* Bulk controls for combined */}
            {isBulk && combinedStudents.length > 0 && (
              <View style={s.bulkControls}>
                <TouchableOpacity
                  style={s.bulkToggle}
                  onPress={() => toggleAll(combinedStudents)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    s.checkbox,
                    bulkSelected.size === combinedStudents.length && {
                      backgroundColor: '#1e3a8a',
                      borderColor: '#1e3a8a',
                    },
                  ]}>
                    {bulkSelected.size === combinedStudents.length && (
                      <Feather name="check" size={12} color="#fff" />
                    )}
                  </View>
                  <Text style={s.bulkToggleTxt}>
                    {bulkSelected.size === 0
                      ? `Select all (${combinedStudents.length})`
                      : `${bulkSelected.size} selected`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.bulkAction, { backgroundColor: '#EFF6FF' }]}
                  onPress={bulkCombinedDownload}
                  activeOpacity={0.7}
                >
                  <Feather name="download" size={15} color="#2563EB" />
                  <Text style={[s.bulkActionTxt, { color: '#2563EB' }]}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.bulkAction, { backgroundColor: '#FFF7ED' }]}
                  onPress={bulkCombinedPrint}
                  activeOpacity={0.7}
                >
                  <Feather name="printer" size={15} color="#C2410C" />
                  <Text style={[s.bulkActionTxt, { color: '#C2410C' }]}>Print</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Combined student list */}
            {!combinedClass ? (
              <View style={s.emptyWrap}>
                <View style={s.emptyIcon}><Feather name="layers" size={36} color="#10B981" /></View>
                <Text style={s.emptyTitle}>Select a Class</Text>
                <Text style={s.emptyBody}>Choose a class to auto-detect all four exams and generate combined annual marksheets.</Text>
              </View>
            ) : presentExamTypes.length === 0 ? (
              <View style={s.emptyWrap}>
                <View style={s.emptyIcon}><Feather name="alert-circle" size={36} color="#F59E0B" /></View>
                <Text style={s.emptyTitle}>No Matching Exams</Text>
                <Text style={s.emptyBody}>Exams must include "1st Unit Test", "2nd Unit Test", "Half Yearly", or "Annual" in their name.</Text>
              </View>
            ) : combinedStudents.length === 0 ? (
              <View style={s.emptyWrap}>
                <View style={s.emptyIcon}><Feather name="users" size={36} color="#10B981" /></View>
                <Text style={s.emptyTitle}>No Results Found</Text>
                <Text style={s.emptyBody}>No students have results entered for any of the detected exams.</Text>
              </View>
            ) : (
              <View style={s.listCard}>
                {combinedStudents.map((item, idx) => {
                  const data = buildCombinedData(item);
                  const clr  = studentColor(item.name);
                  const isSelected = bulkSelected.has(item.id);
                  return (
                    <View key={item.id} style={{ borderBottomWidth: idx < combinedStudents.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9' }}>
                      <View style={[s.studentRow, isBulk && isSelected && { backgroundColor: '#EFF6FF' }]}>
                        {isBulk && (
                          <TouchableOpacity
                            onPress={() => toggleBulk(item.id)}
                            activeOpacity={0.7}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isSelected }}
                            accessibilityLabel={`Select ${item.name}`}
                          >
                            <View style={[
                              s.checkbox,
                              isSelected && { backgroundColor: '#2563EB', borderColor: '#2563EB' },
                            ]}>
                              {isSelected && <Feather name="check" size={12} color="#fff" />}
                            </View>
                          </TouchableOpacity>
                        )}
                        <View style={[s.avatar, { backgroundColor: clr }]}>
                          <Text style={s.avatarTxt}>{getInitials(item.name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.studentName}>{item.name}</Text>
                          <Text style={s.studentSub}>Roll: {item.rollNumber} · {item.class}</Text>
                          {data && (
                            <View style={s.badgeRow}>
                              <View style={[s.badge, { backgroundColor: '#EFF6FF' }]}>
                                <Text style={[s.badgeTxt, { color: '#1e3a8a' }]}>{data.grandTotal}/{data.grandMax}</Text>
                              </View>
                              <View style={[s.badge, { backgroundColor: '#F0FDF4' }]}>
                                <Text style={[s.badgeTxt, { color: '#15803D' }]}>{data.percentage.toFixed(1)}%</Text>
                              </View>
                              <View style={[s.badge, { backgroundColor: '#FEF9C3' }]}>
                                <Text style={[s.badgeTxt, { color: '#92400E' }]}>{data.grade}</Text>
                              </View>
                              <View style={[s.badge, { backgroundColor: data.passed ? '#DCFCE7' : '#FEE2E2' }]}>
                                <Text style={[s.badgeTxt, { color: data.passed ? '#15803D' : '#B91C1C' }]}>
                                  {data.passed ? 'Pass' : 'Fail'}
                                </Text>
                              </View>
                              <View style={[s.badge, { backgroundColor: '#FFF7ED' }]}>
                                <Text style={[s.badgeTxt, { color: '#C2410C' }]}>Rank #{data.rank}</Text>
                              </View>
                            </View>
                          )}
                        </View>
                        <View style={s.actionCol}>
                          <TouchableOpacity style={s.actionBtn} onPress={() => openCombinedPreview(item)} activeOpacity={0.7}>
                            <Feather name="eye" size={14} color="#2563EB" />
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#F0FDF4' }]} onPress={() => downloadCombined(item)} activeOpacity={0.7}>
                            <Feather name="download" size={14} color="#15803D" />
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#FFF7ED' }]} onPress={() => printCombined(item)} activeOpacity={0.7}>
                            <Feather name="printer" size={14} color="#C2410C" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          /* ── SINGLE EXAM MODE ── */
          <>
            <View style={s.filterCard}>
              <Text style={s.filterLabel}>Filter & Select Exam</Text>
              <TouchableOpacity style={s.picker} onPress={() => setShowClassPicker(true)} activeOpacity={0.7}>
                <Feather name="layers" size={16} color="#059669" />
                <Text style={[s.pickerTxt, !selectedClass && { color: '#94A3B8' }]} numberOfLines={1}>
                  {selectedClass || 'Filter by Class (optional)'}
                </Text>
                <Feather name="chevron-down" size={16} color="#94A3B8" />
              </TouchableOpacity>
              <TouchableOpacity style={s.picker} onPress={() => setShowExamPicker(true)} activeOpacity={0.7}>
                <Feather name="book-open" size={16} color="#059669" />
                <Text style={[s.pickerTxt, !selectedExam && { color: '#94A3B8' }]} numberOfLines={1}>
                  {selectedExam ? `${selectedExam.name} (${selectedExam.class})` : 'Select Exam'}
                </Text>
                <Feather name="chevron-down" size={16} color="#94A3B8" />
              </TouchableOpacity>
              {!isBulk && (
                <View style={s.searchBox}>
                  <Feather name="search" size={16} color="#94A3B8" />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search by name or roll number…"
                    placeholderTextColor="#94A3B8"
                    value={search}
                    onChangeText={setSearch}
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
                      <Feather name="x" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* Exam info banner */}
            {selectedExam && (
              <View style={s.examBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={s.examBannerTitle}>{selectedExam.name}</Text>
                  <Text style={s.examBannerSub}>{selectedExam.class} · {selectedExam.subjects.length} subjects · Max {selectedExam.subjects.reduce((s, sub) => s + getSubjectMaxMarks(selectedExam, sub, selectedClass), 0)} total marks</Text>
                  <Text style={s.examBannerSub}>Pass mark: 30% of each subject's maximum marks</Text>
                </View>
                <View style={s.examBannerBadge}>
                  <Text style={s.examBannerBadgeTxt}>{selectedExam.subjects.length}</Text>
                  <Text style={s.examBannerBadgeLbl}>Subjects</Text>
                </View>
              </View>
            )}

            {/* Bulk controls */}
            {isBulk && selectedExam && bulkStudents.length > 0 && (
              <View style={s.bulkControls}>
                <TouchableOpacity style={s.bulkToggle} onPress={() => toggleAll(bulkStudents)} activeOpacity={0.7}>
                  <View style={[s.checkbox, bulkSelected.size === bulkStudents.length && { backgroundColor: '#1e3a8a', borderColor: '#1e3a8a' }]}>
                    {bulkSelected.size === bulkStudents.length && <Feather name="check" size={12} color="#fff" />}
                  </View>
                  <Text style={s.bulkToggleTxt}>
                    {bulkSelected.size === 0 ? `Select all (${bulkStudents.length})` : `${bulkSelected.size} selected`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.bulkAction, { backgroundColor: '#EFF6FF' }]} onPress={bulkDownload} activeOpacity={0.7}>
                  <Feather name="download" size={15} color="#2563EB" />
                  <Text style={[s.bulkActionTxt, { color: '#2563EB' }]}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.bulkAction, { backgroundColor: '#FFF7ED' }]} onPress={bulkPrint} activeOpacity={0.7}>
                  <Feather name="printer" size={15} color="#C2410C" />
                  <Text style={[s.bulkActionTxt, { color: '#C2410C' }]}>Print</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Student list */}
            {!selectedExam ? (
              <View style={s.emptyWrap}>
                <View style={s.emptyIcon}><Feather name="book-open" size={36} color="#10B981" /></View>
                <Text style={s.emptyTitle}>Select an Exam</Text>
                <Text style={s.emptyBody}>Choose an exam above to view students and generate marksheets.</Text>
              </View>
            ) : displayStudentList.length === 0 ? (
              <View style={s.emptyWrap}>
                <View style={s.emptyIcon}><Feather name="users" size={36} color="#10B981" /></View>
                <Text style={s.emptyTitle}>No Students Found</Text>
                <Text style={s.emptyBody}>
                  {isBulk && !selectedClass ? 'Select a class to view students.' : 'No students match your search.'}
                </Text>
              </View>
            ) : (
              <View style={s.listCard}>
                {displayStudentList.map((item, idx) => {
                  const hasResult = !!examResults.find(r => r.examId === selectedExam.id && r.studentId === item.id);
                  const data = hasResult ? buildSingleData(item) : null;
                  const isSelected = bulkSelected.has(item.id);
                  const clr = studentColor(item.name);
                  return (
                    <View key={item.id} style={{ borderBottomWidth: idx < displayStudentList.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9' }}>
                      {isBulk ? (
                        <TouchableOpacity
                          style={[s.studentRow, isSelected && { backgroundColor: '#EFF6FF' }]}
                          onPress={() => hasResult && toggleBulk(item.id)}
                          activeOpacity={hasResult ? 0.7 : 1}
                        >
                          <View style={[s.checkbox, isSelected && { backgroundColor: '#2563EB', borderColor: '#2563EB' }]}>
                            {isSelected && <Feather name="check" size={12} color="#fff" />}
                          </View>
                          <View style={[s.avatar, { backgroundColor: clr }]}>
                            <Text style={s.avatarTxt}>{getInitials(item.name)}</Text>
                          </View>
                          <View style={{ flex: 1, opacity: hasResult ? 1 : 0.45 }}>
                            <Text style={s.studentName}>{item.name}</Text>
                            <Text style={s.studentSub}>Roll: {item.rollNumber} · {item.class}</Text>
                            {data ? (
                              <View style={s.badgeRow}>
                                <View style={[s.badge, { backgroundColor: '#EFF6FF' }]}>
                                  <Text style={[s.badgeTxt, { color: '#1e3a8a' }]}>{data.total}/{data.maxTotal}</Text>
                                </View>
                                <View style={[s.badge, { backgroundColor: data.passed ? '#DCFCE7' : '#FEE2E2' }]}>
                                  <Text style={[s.badgeTxt, { color: data.passed ? '#15803D' : '#B91C1C' }]}>
                                    {data.grade} · {data.passed ? 'Pass' : 'Fail'}
                                  </Text>
                                </View>
                                <View style={[s.badge, { backgroundColor: '#FFF7ED' }]}>
                                  <Text style={[s.badgeTxt, { color: '#C2410C' }]}>Rank #{data.rank}</Text>
                                </View>
                              </View>
                            ) : <Text style={s.noResult}>No results entered</Text>}
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View style={[s.studentRow, { opacity: hasResult ? 1 : 0.45 }]}>
                          <View style={[s.avatar, { backgroundColor: clr }]}>
                            <Text style={s.avatarTxt}>{getInitials(item.name)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.studentName}>{item.name}</Text>
                            <Text style={s.studentSub}>Roll: {item.rollNumber} · {item.class}</Text>
                            {data ? (
                              <View style={s.badgeRow}>
                                <View style={[s.badge, { backgroundColor: '#EFF6FF' }]}>
                                  <Text style={[s.badgeTxt, { color: '#1e3a8a' }]}>{data.total}/{data.maxTotal}</Text>
                                </View>
                                <View style={[s.badge, { backgroundColor: '#F0FDF4' }]}>
                                  <Text style={[s.badgeTxt, { color: '#15803D' }]}>{data.percentage.toFixed(1)}%</Text>
                                </View>
                                <View style={[s.badge, { backgroundColor: '#FEF9C3' }]}>
                                  <Text style={[s.badgeTxt, { color: '#92400E' }]}>{data.grade}</Text>
                                </View>
                                <View style={[s.badge, { backgroundColor: data.passed ? '#DCFCE7' : '#FEE2E2' }]}>
                                  <Text style={[s.badgeTxt, { color: data.passed ? '#15803D' : '#B91C1C' }]}>
                                    {data.passed ? 'Pass' : 'Fail'}
                                  </Text>
                                </View>
                              </View>
                            ) : <Text style={s.noResult}>No results entered</Text>}
                          </View>
                          {hasResult && (
                            <View style={s.actionCol}>
                              <TouchableOpacity style={s.actionBtn} onPress={() => openPreview(item)} activeOpacity={0.7}>
                                <Feather name="eye" size={14} color="#2563EB" />
                              </TouchableOpacity>
                              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#F0FDF4' }]} onPress={() => downloadSingle(item)} activeOpacity={0.7}>
                                <Feather name="download" size={14} color="#15803D" />
                              </TouchableOpacity>
                              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#FFF7ED' }]} onPress={() => printSingle(item)} activeOpacity={0.7}>
                                <Feather name="printer" size={14} color="#C2410C" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Loading overlay */}
      {loading && (
        <View style={s.loadingOverlay}>
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color="#1e3a8a" />
            <Text style={s.loadingTxt}>Generating marksheet…</Text>
          </View>
        </View>
      )}

      {downloadReady && Platform.OS === 'web' && (
        <View style={s.downloadReadyCard}>
          <View style={s.downloadReadyIcon}>
            <Feather name="check" size={18} color="#15803D" />
          </View>
          <View style={s.downloadReadyCopy}>
            <Text style={s.downloadReadyTitle}>PDF is ready</Text>
            <Text style={s.downloadReadySub} numberOfLines={1}>
              Click Download PDF to save it to your device.
            </Text>
          </View>
          {renderDownloadLink()}
          <TouchableOpacity style={s.downloadReadyClose} onPress={dismissReadyFile} activeOpacity={0.7}>
            <Feather name="x" size={16} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Single Preview Modal ── */}
      <Modal visible={previewVisible} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={s.previewModal}>
            <View style={s.previewHeader}>
              <Text style={s.previewTitle} numberOfLines={1}>
                {previewData?.student.name} — {previewData?.exam.name}
              </Text>
              <TouchableOpacity onPress={() => setPreviewVisible(false)} style={s.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            {previewData && (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                <LinearGradient colors={['#0F2456', '#1e3a8a']} style={s.previewScoreCard}>
                  <Text style={s.previewScoreName}>{previewData.student.name}</Text>
                  <Text style={s.previewScoreRoll}>Roll: {previewData.student.rollNumber} · {previewData.exam.class}</Text>
                  <View style={s.previewScoreRow}>
                    {[
                      { label: 'Total', value: `${previewData.total}/${previewData.maxTotal}` },
                      { label: 'Percentage', value: `${previewData.percentage.toFixed(1)}%` },
                      { label: 'Grade', value: previewData.grade },
                      { label: 'Rank', value: `#${previewData.rank}` },
                    ].map((item, i, arr) => (
                      <React.Fragment key={item.label}>
                        <View style={s.previewScoreItem}>
                          <Text style={s.previewScoreNum}>{item.value}</Text>
                          <Text style={s.previewScoreLbl}>{item.label}</Text>
                        </View>
                        {i < arr.length - 1 && <View style={s.previewScoreDivider} />}
                      </React.Fragment>
                    ))}
                  </View>
                  <View style={[s.previewPassBadge, { backgroundColor: previewData.passed ? '#DCFCE7' : '#FEE2E2' }]}>
                    <Text style={[s.previewPassTxt, { color: previewData.passed ? '#15803D' : '#B91C1C' }]}>
                      {previewData.passed ? '✓ PASS' : '✗ FAIL'}
                    </Text>
                  </View>
                </LinearGradient>

                <View style={s.previewSubCard}>
                  <Text style={s.previewSubTitle}>Subject-wise Marks</Text>
                  {previewData.exam.subjects.map((sub, i) => {
                    const obtained = previewData.result.marks[sub] ?? 0;
                    const subMax = previewData.subjectMaxMarks[sub] ?? previewData.exam.maxMarks;
                    const pct = (obtained / subMax) * 100;
                    const subPassed = obtained >= subMax * 0.30;
                    const g = getGrade(pct).grade;
                    return (
                      <View key={sub} style={[s.previewSubRow, i < previewData.exam.subjects.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
                        <Text style={s.previewSubName}>{sub}</Text>
                        <View style={s.previewSubRight}>
                          <Text style={s.previewSubMarks}>{obtained}/{subMax}</Text>
                          <View style={{ width: 70, height: 5, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ width: `${Math.min(pct, 100)}%` as any, height: '100%', backgroundColor: subPassed ? '#10B981' : '#EF4444', borderRadius: 3 }} />
                          </View>
                          <Text style={[s.previewSubGrade, { color: subPassed ? '#15803D' : '#B91C1C', backgroundColor: subPassed ? '#DCFCE7' : '#FEE2E2' }]}>{g}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={s.previewActions}>
                  <TouchableOpacity style={[s.previewActionBtn, { backgroundColor: '#EFF6FF' }]}
                    onPress={() => { setPreviewVisible(false); downloadSingle(previewData.student); }} activeOpacity={0.8}>
                    <Feather name="download" size={18} color="#2563EB" />
                    <Text style={[s.previewActionTxt, { color: '#2563EB' }]}>Download PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.previewActionBtn, { backgroundColor: '#FFF7ED' }]}
                    onPress={() => { setPreviewVisible(false); printSingle(previewData.student); }} activeOpacity={0.8}>
                    <Feather name="printer" size={18} color="#C2410C" />
                    <Text style={[s.previewActionTxt, { color: '#C2410C' }]}>Print</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Combined Preview Modal ── */}
      <Modal visible={combinedPreviewVisible} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={s.previewModal}>
            <View style={s.previewHeader}>
              <Text style={s.previewTitle} numberOfLines={1}>
                {combinedPreviewData?.student.name} — Combined Annual
              </Text>
              <TouchableOpacity onPress={() => setCombinedPreviewVisible(false)} style={s.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            {combinedPreviewData && (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                <LinearGradient colors={['#1e3a8a', '#2563EB']} style={s.previewScoreCard}>
                  <Text style={s.previewScoreName}>{combinedPreviewData.student.name}</Text>
                  <Text style={s.previewScoreRoll}>Roll: {combinedPreviewData.student.rollNumber} · {combinedPreviewData.className}</Text>
                  <View style={s.previewScoreRow}>
                    {[
                      { label: 'Grand Total', value: `${combinedPreviewData.grandTotal}/${combinedPreviewData.grandMax}` },
                      { label: 'Percentage', value: `${combinedPreviewData.percentage.toFixed(1)}%` },
                      { label: 'Grade', value: combinedPreviewData.grade },
                      { label: 'Rank', value: `#${combinedPreviewData.rank}` },
                    ].map((item, i, arr) => (
                      <React.Fragment key={item.label}>
                        <View style={s.previewScoreItem}>
                          <Text style={s.previewScoreNum}>{item.value}</Text>
                          <Text style={s.previewScoreLbl}>{item.label}</Text>
                        </View>
                        {i < arr.length - 1 && <View style={s.previewScoreDivider} />}
                      </React.Fragment>
                    ))}
                  </View>
                  <View style={[s.previewPassBadge, { backgroundColor: combinedPreviewData.passed ? '#DCFCE7' : '#FEE2E2' }]}>
                    <Text style={[s.previewPassTxt, { color: combinedPreviewData.passed ? '#15803D' : '#B91C1C' }]}>
                      {combinedPreviewData.passed ? '✓ PASS' : '✗ FAIL'}
                    </Text>
                  </View>
                </LinearGradient>

                {/* Subject table preview */}
                <View style={s.previewSubCard}>
                  <Text style={s.previewSubTitle}>Subject-wise Combined Marks</Text>
                  {/* Column headers */}
                  <View style={[s.previewSubRow, { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 6, marginBottom: 2 }]}>
                    <Text style={[s.previewSubName, { color: '#64748B', fontSize: 10 }]}>Subject</Text>
                    <View style={s.previewSubRight}>
                      {EXAM_TYPE_ORDER.map(k => combinedPreviewData.examMap[k] ? (
                        <Text key={k} style={{ fontSize: 9, color: '#64748B', fontWeight: '700', width: 36, textAlign: 'center' }}>
                          {k === '1ut' ? '1UT' : k === '2ut' ? '2UT' : k === 'half' ? 'HY' : 'Ann'}
                        </Text>
                      ) : null)}
                      <Text style={{ fontSize: 9, color: '#64748B', fontWeight: '700', width: 48, textAlign: 'right' }}>Total</Text>
                      <Text style={{ fontSize: 9, color: '#64748B', fontWeight: '700', width: 30, textAlign: 'center' }}>Grd</Text>
                    </View>
                  </View>
                  {combinedPreviewData.subjectRows.map((row, i) => (
                    <View key={row.subject} style={[s.previewSubRow, i < combinedPreviewData.subjectRows.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
                      <Text style={s.previewSubName} numberOfLines={1}>{row.subject}</Text>
                      <View style={s.previewSubRight}>
                        {EXAM_TYPE_ORDER.map(k => combinedPreviewData.examMap[k] ? (
                          <Text key={k} style={{ fontSize: 11, fontWeight: '700', color: '#1e3a8a', width: 36, textAlign: 'center' }}>
                            {row.marks[k] !== null ? row.marks[k] : '—'}
                          </Text>
                        ) : null)}
                        <Text style={s.previewSubMarks}>{row.total}/{row.max}</Text>
                        <Text style={[s.previewSubGrade, { color: row.passed ? '#15803D' : '#B91C1C', backgroundColor: row.passed ? '#DCFCE7' : '#FEE2E2' }]}>
                          {row.grade}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={s.previewActions}>
                  <TouchableOpacity style={[s.previewActionBtn, { backgroundColor: '#EFF6FF' }]}
                    onPress={() => { setCombinedPreviewVisible(false); downloadCombined(combinedPreviewData.student); }} activeOpacity={0.8}>
                    <Feather name="download" size={18} color="#2563EB" />
                    <Text style={[s.previewActionTxt, { color: '#2563EB' }]}>Download PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.previewActionBtn, { backgroundColor: '#FFF7ED' }]}
                    onPress={() => { setCombinedPreviewVisible(false); printCombined(combinedPreviewData.student); }} activeOpacity={0.8}>
                    <Feather name="printer" size={18} color="#C2410C" />
                    <Text style={[s.previewActionTxt, { color: '#C2410C' }]}>Print</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Class Picker Modal (Single) ── */}
      <Modal visible={showClassPicker} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={s.pickerModal}>
            <View style={s.pickerModalHeader}>
              <Text style={s.pickerModalTitle}>Select Class</Text>
              <TouchableOpacity onPress={() => setShowClassPicker(false)} activeOpacity={0.7}>
                <Feather name="x" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {selectedClass ? (
                <TouchableOpacity style={s.pickerItem} onPress={() => { setSelectedClass(''); setSelectedExam(null); setShowClassPicker(false); }} activeOpacity={0.7}>
                  <Text style={[s.pickerItemTxt, { color: '#94A3B8' }]}>All Classes</Text>
                </TouchableOpacity>
              ) : null}
              {classOptions.map(cls => (
                <TouchableOpacity key={cls}
                  style={[s.pickerItem, selectedClass === cls && s.pickerItemActive]}
                  onPress={() => { setSelectedClass(cls); setSelectedExam(null); setShowClassPicker(false); setBulkSelected(new Set()); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pickerItemTxt, selectedClass === cls && { color: '#059669' }]}>{cls}</Text>
                  {selectedClass === cls && <Feather name="check-circle" size={18} color="#059669" />}
                </TouchableOpacity>
              ))}
              {classOptions.length === 0 && <Text style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>No classes found</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Exam Picker Modal ── */}
      <Modal visible={showExamPicker} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={s.pickerModal}>
            <View style={s.pickerModalHeader}>
              <Text style={s.pickerModalTitle}>Select Exam</Text>
              <TouchableOpacity onPress={() => setShowExamPicker(false)} activeOpacity={0.7}>
                <Feather name="x" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {filteredExams.map(e => (
                <TouchableOpacity key={e.id}
                  style={[s.pickerItem, selectedExam?.id === e.id && s.pickerItemActive]}
                  onPress={() => { setSelectedExam(e); setShowExamPicker(false); setBulkSelected(new Set()); }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.pickerItemTxt, selectedExam?.id === e.id && { color: '#059669' }]}>{e.name}</Text>
                    <Text style={s.pickerItemSub}>{e.class} · {e.subjects.length} subjects · Max {e.maxMarks} marks</Text>
                    {classifyExam(e.name) && (
                      <Text style={[s.pickerItemSub, { color: '#2563EB', marginTop: 1 }]}>
                        Type: {EXAM_TYPE_LABELS[classifyExam(e.name)!]}
                      </Text>
                    )}
                  </View>
                  {selectedExam?.id === e.id && <Feather name="check-circle" size={18} color="#059669" />}
                </TouchableOpacity>
              ))}
              {filteredExams.length === 0 && <Text style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>No exams found</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Combined Class Picker Modal ── */}
      <Modal visible={showCombinedClassPicker} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={s.pickerModal}>
            <View style={s.pickerModalHeader}>
              <Text style={s.pickerModalTitle}>Select Class</Text>
              <TouchableOpacity onPress={() => setShowCombinedClassPicker(false)} activeOpacity={0.7}>
                <Feather name="x" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {classOptions.map(cls => (
                <TouchableOpacity key={cls}
                  style={[s.pickerItem, combinedClass === cls && s.pickerItemActive]}
                  onPress={() => { setCombinedClass(cls); setShowCombinedClassPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pickerItemTxt, combinedClass === cls && { color: '#059669' }]}>{cls}</Text>
                  {combinedClass === cls && <Feather name="check-circle" size={18} color="#059669" />}
                </TouchableOpacity>
              ))}
              {classOptions.length === 0 && <Text style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>No classes found</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Academic Session Picker (Admin) ── */}
      <Modal visible={showSessionPicker} animationType="slide" transparent>
        <View style={s.modalBg}>
          <View style={s.pickerModal}>
            <View style={s.pickerModalHeader}>
              <Text style={s.pickerModalTitle}>Select Academic Session</Text>
              <TouchableOpacity onPress={() => setShowSessionPicker(false)} activeOpacity={0.7}>
                <Feather name="x" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {/* ── Add Custom Session ── */}
              {showCustomSessionInput ? (
                <View style={s.customSessionRow}>
                  <TextInput
                    style={s.customSessionInput}
                    value={customSessionText}
                    onChangeText={setCustomSessionText}
                    placeholder="e.g. 2035–2036"
                    placeholderTextColor="#94A3B8"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      const trimmed = customSessionText.trim();
                      if (trimmed) { selectAcademicSession(trimmed); }
                      setShowCustomSessionInput(false);
                      setCustomSessionText('');
                    }}
                  />
                  <TouchableOpacity
                    style={s.customSessionConfirm}
                    activeOpacity={0.7}
                    onPress={() => {
                      const trimmed = customSessionText.trim();
                      if (trimmed) { selectAcademicSession(trimmed); }
                      setShowCustomSessionInput(false);
                      setCustomSessionText('');
                    }}
                  >
                    <Feather name="check" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.customSessionCancel}
                    activeOpacity={0.7}
                    onPress={() => { setShowCustomSessionInput(false); setCustomSessionText(''); }}
                  >
                    <Feather name="x" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={s.addCustomSessionBtn}
                  activeOpacity={0.7}
                  onPress={() => setShowCustomSessionInput(true)}
                >
                  <Feather name="plus-circle" size={16} color="#059669" />
                  <Text style={s.addCustomSessionTxt}>Add Custom Session</Text>
                </TouchableOpacity>
              )}
              {academicSessionOptions.map(session => (
                <TouchableOpacity
                  key={session}
                  style={[s.pickerItem, academicSession === session && s.pickerItemActive]}
                  onPress={() => selectAcademicSession(session)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pickerItemTxt, academicSession === session && { color: '#059669' }]}>
                    {session}
                  </Text>
                  {academicSession === session && <Feather name="check-circle" size={18} color="#059669" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    paddingHorizontal: 16, paddingBottom: 16,
    shadowColor: '#059669', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  headerInner: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  typeToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 3 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  typeBtnActive: { backgroundColor: '#fff' },
  typeTxt: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  typeTxtActive: { color: '#C9A227' },

  filterCard: {
    margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 10,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  filterLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
  picker: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  pickerTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1E293B' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1E293B', padding: 0 },

  examMapCard: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  examMapTitle: { fontSize: 13, fontWeight: '800', color: '#1E293B', marginBottom: 12 },
  examMapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  examMapDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  examMapLabel: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  examMapValue: { fontSize: 11, color: '#64748B', marginTop: 1 },
  noExamHint: { fontSize: 12, color: '#F59E0B', marginTop: 8, lineHeight: 18 },

  examBanner: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#BFDBFE',
  },
  examBannerTitle: { fontSize: 14, fontWeight: '800', color: '#0F2456', marginBottom: 3 },
  examBannerSub: { fontSize: 11, color: '#1e3a8a', fontWeight: '500', marginTop: 1 },
  examBannerBadge: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#1e3a8a', alignItems: 'center', justifyContent: 'center' },
  examBannerBadgeTxt: { fontSize: 20, fontWeight: '900', color: '#fff' },
  examBannerBadgeLbl: { fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: '700', marginTop: 1 },

  bulkControls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, flexWrap: 'wrap' },
  bulkCount: { flex: 1, fontSize: 13, fontWeight: '700', color: '#334155' },
  bulkToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  bulkToggleTxt: { fontSize: 13, fontWeight: '700', color: '#334155' },
  bulkAction: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  bulkActionTxt: { fontSize: 13, fontWeight: '700' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },

  listCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt: { fontSize: 15, fontWeight: '900', color: '#fff' },
  studentName: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  studentSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  badgeRow: { flexDirection: 'row', gap: 5, marginTop: 5, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  badgeTxt: { fontSize: 10, fontWeight: '800' },
  noResult: { fontSize: 11, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' },
  actionCol: { flexDirection: 'row', gap: 5 },
  actionBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },

  emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  loadingBox: { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 12 },
  loadingTxt: { fontSize: 14, fontWeight: '700', color: '#334155' },
  downloadReadyCard: { position: 'absolute', left: 16, right: 16, bottom: 92, zIndex: 120, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#BBF7D0', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 14, elevation: 10 },
  downloadReadyIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  downloadReadyCopy: { flex: 1, minWidth: 0 },
  downloadReadyTitle: { fontSize: 13, fontWeight: '800', color: '#166534' },
  downloadReadySub: { fontSize: 10, color: '#64748B', marginTop: 2 },
  downloadReadyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1E3A8A', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  downloadReadyBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  downloadReadyClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  previewModal: { backgroundColor: '#F8FAFC', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', minHeight: '70%' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  previewTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', flex: 1, marginRight: 8 },
  closeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

  previewScoreCard: { borderRadius: 16, padding: 18, marginBottom: 14, shadowColor: '#0F2456', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 },
  previewScoreName: { fontSize: 17, fontWeight: '900', color: '#fff', marginBottom: 2 },
  previewScoreRoll: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 14 },
  previewScoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  previewScoreItem: { flex: 1, alignItems: 'center' },
  previewScoreNum: { fontSize: 18, fontWeight: '900', color: '#fff' },
  previewScoreLbl: { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '600' },
  previewScoreDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.25)' },
  previewPassBadge: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  previewPassTxt: { fontSize: 12, fontWeight: '900' },

  previewSubCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  previewSubTitle: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginBottom: 10 },
  previewSubRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  previewSubName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
  previewSubRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewSubMarks: { fontSize: 13, fontWeight: '700', color: '#1E293B', minWidth: 44, textAlign: 'right' },
  previewSubGrade: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, minWidth: 30, textAlign: 'center' },

  previewActions: { flexDirection: 'row', gap: 12 },
  previewActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  previewActionTxt: { fontSize: 14, fontWeight: '800' },

  pickerModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  pickerModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pickerModalTitle: { fontSize: 17, fontWeight: '800', color: '#1E293B' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  pickerItemActive: { backgroundColor: '#EFF6FF' },
  pickerItemTxt: { fontSize: 14, fontWeight: '700', color: '#1E293B', flex: 1 },
  pickerItemSub: { fontSize: 11, color: '#64748B', marginTop: 2 },

  addCustomSessionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#F0FDF4' },
  addCustomSessionTxt: { fontSize: 14, fontWeight: '700', color: '#059669' },

  customSessionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#F0FDF4', gap: 8 },
  customSessionInput: { flex: 1, borderWidth: 1.5, borderColor: '#059669', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontWeight: '600', color: '#1E293B', backgroundColor: '#fff' },
  customSessionConfirm: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  customSessionCancel: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
});
