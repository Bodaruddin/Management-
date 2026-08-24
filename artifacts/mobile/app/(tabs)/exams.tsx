import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, ScrollView, Alert, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useColors } from '@/hooks/useColors';
import {
  useApp, Exam, ExamResult, SubjectSchedule, ClassSubjectAssignment,
  getExamSubjectsForClass, getSubjectMaxMarksForClass, isActiveStudent,
  isGraduatedStudent,
} from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';
import PremiumAlert from '@/components/PremiumAlert';
import { SCHOOL_INFO } from '@/constants/schoolInfo';

type Screen = 'list' | 'results' | 'classSelect' | 'marks' | 'marksheet' | 'subjects' | 'finalResults';

interface ClassAssignment {
  class: string;
  selectedSubjects: string[];
  subjectSchedules: SubjectSchedule[];
}

const getGrade = (pct: number) => {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 30) return 'D';
  return 'F';
};

const formatPercentage = (pct: number) => (
  Number.isInteger(pct) ? String(pct) : pct.toFixed(1)
);

export default function ExamsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { exams, students, classes, subjects, addExam, updateExam, deleteExam, examResults, saveExamResults, addSubject, deleteSubject, documentBranding } = useApp();

  const [screen, setScreen] = useState<Screen>('list');
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<ExamResult | null>(null);

  // Create exam modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const todayISO = new Date().toISOString().split('T')[0];
  const [createForm, setCreateForm] = useState({
    name: '',
    selectedClasses: [] as string[],
    classAssignments: [] as ClassAssignment[],
    defaultDate: todayISO,
    defaultMaxMarks: '100',
  });

  // Custom subject input
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [showSubjectInput, setShowSubjectInput] = useState(false);

  // Marks entry
  const [marksData, setMarksData] = useState<Record<string, Record<string, string>>>({});

  // Delete confirmations
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
  const [subjectToDelete, setSubjectToDelete] = useState<string | null>(null);
  const [showExamUpdatedAlert, setShowExamUpdatedAlert] = useState(false);

  // Final / Combined Results
  const [frExamIds, setFrExamIds] = useState<string[]>([]);
  const [frClass, setFrClass] = useState<string | null>(null);
  const [frGenerating, setFrGenerating] = useState(false);

  const frSelectedExams = useMemo(
    () => exams.filter(e => frExamIds.includes(e.id)),
    [exams, frExamIds],
  );

  // All classes that appear across all selected exams
  const frClasses = useMemo(() => {
    const set = new Set<string>();
    frSelectedExams.forEach(ex => {
      if (ex.classSubjects && ex.classSubjects.length > 0) {
        ex.classSubjects.forEach(cs => set.add(cs.class));
      } else {
        set.add(ex.class);
      }
    });
    return [...set].sort();
  }, [frSelectedExams]);

  // Combined per-student result rows, sorted by roll number
  const frRows = useMemo(() => {
    if (frSelectedExams.length === 0 || !frClass) return [];
    const cls_students = students.filter(s => s.class === frClass && isActiveStudent(s));

    return cls_students
      .map(st => {
        const examTotals = frSelectedExams.map(ex => {
          const subs = getExamSubjectsForClass(ex, frClass);
          const res = examResults.find(r => r.examId === ex.id && r.studentId === st.id);
          const maxTotal = subs.reduce((sm, sub) => {
            const cs = ex.classSubjects?.find(c => c.class === frClass);
            const sched = cs?.subjectSchedule?.find(sc => sc.subject === sub)
              ?? ex.subjectSchedule?.find(sc => sc.subject === sub);
            return sm + (sched?.maxMarks ?? ex.maxMarks);
          }, 0);
          if (!res) return { examId: ex.id, total: 0, maxTotal, hasResult: false };
          const total = subs.reduce((s, sub) => s + (res.marks[sub] ?? 0), 0);
          return { examId: ex.id, total, maxTotal, hasResult: true };
        });

        const grandTotal = examTotals.reduce((s, e) => s + e.total, 0);
        const grandMax = examTotals.reduce((s, e) => s + e.maxTotal, 0);
        const rawPct = grandMax > 0 ? (grandTotal / grandMax) * 100 : 0;
        const grade = getGrade(rawPct);   // use raw so 29.5% → F, not D
        // Combined result pass/fail is based on the overall percentage.
        // Keep the raw value so a displayed 30% can still correctly be F
        // when the unrounded percentage is below 30 (for example, 29.5%).
        const pass = rawPct >= 30;
        const hasAny = examTotals.some(e => e.hasResult);
        return { student: st, examTotals, grandTotal, grandMax, pct: rawPct, grade, pass, hasAny };
      })
      .sort((a, b) => {
        // Students with no results go to the bottom
        if (a.hasAny !== b.hasAny) return a.hasAny ? -1 : 1;
        // Sort by percentage descending (highest % = rank 1)
        return b.pct - a.pct;
      });
  }, [frSelectedExams, frClass, examResults, students]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const examClasses = useMemo(() => {
    if (!selectedExam) return [];
    if (selectedExam.classSubjects && selectedExam.classSubjects.length > 0) {
      return selectedExam.classSubjects.map(cs => cs.class);
    }
    return [selectedExam.class];
  }, [selectedExam]);

  const activeSubjects = useMemo(() => {
    if (!selectedExam || !selectedClass) return selectedExam?.subjects ?? [];
    return getExamSubjectsForClass(selectedExam, selectedClass);
  }, [selectedExam, selectedClass]);

  const examStudents = useMemo(
    () => students.filter(s => s.class === (selectedClass ?? selectedExam?.class) && !isGraduatedStudent(s)),
    [students, selectedClass, selectedExam],
  );

  const examResultsList = useMemo(
    () => examResults.filter(r => r.examId === selectedExam?.id && r.class === (selectedClass ?? selectedExam?.class)),
    [examResults, selectedExam, selectedClass],
  );

  const getResultForStudent = (studentId: string) =>
    examResultsList.find(r => r.studentId === studentId);

  const getSubjectMax = (exam: Exam, sub: string, forClass?: string | null) => {
    return getSubjectMaxMarksForClass(exam, sub, forClass ?? selectedClass);
  };

  const computeResult = (marks: Record<string, number>, exam: Exam) => {
    const subs = activeSubjects;
    const total = subs.reduce((s, sub) => s + (marks[sub] ?? 0), 0);
    const maxTotal = subs.reduce((s, sub) => s + getSubjectMax(exam, sub), 0);
    const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
    const pass = pct >= 30 && subs.every(sub => (marks[sub] ?? 0) >= getSubjectMax(exam, sub) * 0.30);
    return { total, maxTotal, pct, grade: getGrade(pct), pass };
  };

  const initMarks = (exam: Exam, cls: string) => {
    const subs = getExamSubjectsForClass(exam, cls);
    const data: Record<string, Record<string, string>> = {};
    students.filter(s => s.class === cls && !isGraduatedStudent(s)).forEach(s => {
      const existing = examResults.find(r => r.examId === exam.id && r.studentId === s.id);
      data[s.id] = {};
      subs.forEach(sub => { data[s.id][sub] = existing?.marks[sub] !== undefined ? String(existing.marks[sub]) : ''; });
    });
    return data;
  };

  const getExamClassLabel = (exam: Exam) => {
    if (exam.classSubjects && exam.classSubjects.length > 1) {
      return exam.classSubjects.map(cs => cs.class).join(', ');
    }
    return exam.class;
  };

  // ── Navigation ──────────────────────────────────────────────────────────────
  const openExam = (exam: Exam) => {
    setSelectedExam(exam);
    setSelectedResult(null);
    // Auto-select class if only one
    const cls =
      exam.classSubjects && exam.classSubjects.length === 1
        ? exam.classSubjects[0].class
        : !exam.classSubjects || exam.classSubjects.length === 0
        ? exam.class
        : null;
    setSelectedClass(cls);
    setScreen('results');
  };

  const openMarksEntry = (cls: string) => {
    if (!selectedExam) return;
    setSelectedClass(cls);
    setMarksData(initMarks(selectedExam, cls));
    setScreen('marks');
  };

  // ── Save marks ──────────────────────────────────────────────────────────────
  const handleSaveMarks = async () => {
    if (!selectedExam || !selectedClass) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const subs = getExamSubjectsForClass(selectedExam, selectedClass);
    const classStudents = students.filter(s => s.class === selectedClass && !isGraduatedStudent(s));
    const results: Omit<ExamResult, 'id'>[] = classStudents.map(s => ({
      examId: selectedExam.id, studentId: s.id, studentName: s.name,
      class: s.class, rollNumber: s.rollNumber,
      marks: Object.fromEntries(subs.map(sub => [sub, Number(marksData[s.id]?.[sub] ?? 0)])),
    }));
    saveExamResults(results);
    setScreen('results');
  };

  // ── Create exam ─────────────────────────────────────────────────────────────
  const resetCreateForm = () =>
    setCreateForm({ name: '', selectedClasses: [], classAssignments: [], defaultDate: todayISO, defaultMaxMarks: '100' });

  const toggleClass = (cls: string) => {
    setCreateForm(p => {
      const alreadySelected = p.selectedClasses.includes(cls);
      if (alreadySelected) {
        return {
          ...p,
          selectedClasses: p.selectedClasses.filter(c => c !== cls),
          classAssignments: p.classAssignments.filter(ca => ca.class !== cls),
        };
      }
      return {
        ...p,
        selectedClasses: [...p.selectedClasses, cls],
        classAssignments: [...p.classAssignments, { class: cls, selectedSubjects: [], subjectSchedules: [] }],
      };
    });
  };

  const toggleSubjectForClass = (cls: string, sub: string) => {
    setCreateForm(p => ({
      ...p,
      classAssignments: p.classAssignments.map(ca => {
        if (ca.class !== cls) return ca;
        const alreadySelected = ca.selectedSubjects.includes(sub);
        return {
          ...ca,
          selectedSubjects: alreadySelected ? ca.selectedSubjects.filter(s => s !== sub) : [...ca.selectedSubjects, sub],
          subjectSchedules: alreadySelected
            ? ca.subjectSchedules.filter(s => s.subject !== sub)
            : [...ca.subjectSchedules, { subject: sub, date: p.defaultDate, maxMarks: Number(p.defaultMaxMarks) || 100, startTime: '', endTime: '' }],
        };
      }),
    }));
  };

  const updateSubjectScheduleForClass = (cls: string, subject: string, field: 'date' | 'maxMarks' | 'startTime' | 'endTime', value: string) => {
    setCreateForm(p => ({
      ...p,
      classAssignments: p.classAssignments.map(ca => {
        if (ca.class !== cls) return ca;
        return {
          ...ca,
          subjectSchedules: ca.subjectSchedules.map(s =>
            s.subject === subject
              ? { ...s, [field]: field === 'maxMarks' ? (Number(value) || 0) : value }
              : s
          ),
        };
      }),
    }));
  };

  const handleAddCustomSubject = async (cls: string) => {
    const name = newSubjectInput.trim();
    if (!name) return;
    addSubject(name);
    setCreateForm(p => ({
      ...p,
      classAssignments: p.classAssignments.map(ca => {
        if (ca.class !== cls) return ca;
        const alreadySelected = ca.selectedSubjects.includes(name);
        return {
          ...ca,
          selectedSubjects: alreadySelected ? ca.selectedSubjects : [...ca.selectedSubjects, name],
          subjectSchedules: alreadySelected
            ? ca.subjectSchedules
            : [...ca.subjectSchedules, { subject: name, date: p.defaultDate, maxMarks: Number(p.defaultMaxMarks) || 100, startTime: '', endTime: '' }],
        };
      }),
    }));
    setNewSubjectInput('');
    setShowSubjectInput(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openCreateExam = () => {
    setEditingExam(null);
    resetCreateForm();
    setShowCreateModal(true);
  };

  const openEditExam = (exam: Exam) => {
    const assignments = exam.classSubjects && exam.classSubjects.length > 0
      ? exam.classSubjects
      : [{
          class: exam.class,
          subjects: exam.subjects,
          subjectSchedule: exam.subjectSchedule,
        }];

    setEditingExam(exam);
    setCreateForm({
      name: exam.name,
      selectedClasses: assignments.map(assignment => assignment.class),
      classAssignments: assignments.map(assignment => ({
        class: assignment.class,
        selectedSubjects: [...assignment.subjects],
        subjectSchedules: (assignment.subjectSchedule ?? []).map(schedule => ({ ...schedule })),
      })),
      defaultDate: exam.date || todayISO,
      defaultMaxMarks: String(exam.maxMarks || 100),
    });
    setShowCreateModal(true);
  };

  const closeExamForm = () => {
    setShowCreateModal(false);
    setEditingExam(null);
    resetCreateForm();
  };

  const handleSaveExam = async () => {
    if (!createForm.name.trim()) { Alert.alert('Validation', 'Enter exam name'); return; }
    if (createForm.selectedClasses.length === 0) { Alert.alert('Validation', 'Select at least one class'); return; }
    const emptyClass = createForm.classAssignments.find(ca => ca.selectedSubjects.length === 0);
    if (emptyClass) { Alert.alert('Validation', `Select at least one subject for ${emptyClass.class}`); return; }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const classSubjects: ClassSubjectAssignment[] = createForm.classAssignments.map(ca => ({
      class: ca.class,
      subjects: ca.selectedSubjects,
      subjectSchedule: ca.subjectSchedules.length > 0 ? ca.subjectSchedules : undefined,
    }));

    const primaryAssignment = createForm.classAssignments[0];
    const allSubjects = [...new Set(createForm.classAssignments.flatMap(ca => ca.selectedSubjects))];
    const primarySchedules = primaryAssignment?.subjectSchedules ?? [];

    const examData = {
      name: createForm.name.trim(),
      class: createForm.selectedClasses[0] || '',
      subjects: allSubjects,
      subjectSchedule: primarySchedules.length > 0 ? primarySchedules : undefined,
      classSubjects,
      date: primarySchedules[0]?.date || createForm.defaultDate,
      maxMarks: primarySchedules[0]?.maxMarks || Number(createForm.defaultMaxMarks) || 100,
    };

    if (editingExam) {
      updateExam(editingExam.id, examData);
      setShowExamUpdatedAlert(true);
    } else {
      addExam(examData);
    }
    closeExamForm();
  };

  const confirmDeleteSubject = (name: string) => setSubjectToDelete(name);

  const doDeleteSubject = async () => {
    if (!subjectToDelete) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteSubject(subjectToDelete);
    setSubjectToDelete(null);
  };

  const confirmDeleteExam = (exam: Exam) => setExamToDelete(exam);

  const doDeleteExam = async () => {
    if (!examToDelete) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteExam(examToDelete.id);
    setExamToDelete(null);
  };

  const s = styles(colors);
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;
  const webTopPad = Platform.OS === 'web' ? 12 : 8;

  // ── Final / Combined Results Screen ─────────────────────────────────────
  if (screen === 'finalResults') {
    const passed = frRows.filter(r => r.pass && r.hasAny).length;
    const totalStudents = frRows.length;

    const toggleExam = (id: string) => {
      setFrClass(null);
      setFrExamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const buildPdfHtml = () => {
      const examLabels = frSelectedExams.map(e => e.name);
      const title = frSelectedExams.length > 1
        ? `Combined Result — ${examLabels.join(' + ')}`
        : examLabels[0] ?? 'Result Sheet';

      const examHeaderCols = frSelectedExams.map(ex =>
        `<th colspan="2" style="background:#1E3A8A;color:#fff;padding:6px 4px;font-size:11px;border:1px solid #ccc;">${ex.name}</th>`
      ).join('');
      const subHeaderCols = frSelectedExams.map(() =>
        `<th style="padding:5px 4px;font-size:10px;border:1px solid #ccc;background:#f0f4ff;">Score</th><th style="padding:5px 4px;font-size:10px;border:1px solid #ccc;background:#f0f4ff;">Max</th>`
      ).join('');

      const dataRows = frRows.map((row, i) => {
        const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
        const examCells = frSelectedExams.map(ex => {
          const et = row.examTotals.find(t => t.examId === ex.id);
          return `<td style="padding:5px 4px;border:1px solid #e2e8f0;text-align:center;">${et?.hasResult ? et.total : '—'}</td><td style="padding:5px 4px;border:1px solid #e2e8f0;text-align:center;color:#888;">${et?.hasResult ? et.maxTotal : '—'}</td>`;
        }).join('');
        const resultColor = row.hasAny ? (row.pass ? '#10B981' : '#EF4444') : '#888';
        return `<tr style="background:${bg};">
          <td style="padding:5px 4px;border:1px solid #e2e8f0;text-align:center;font-weight:700;">${i + 1}</td>
          <td style="padding:5px 8px;border:1px solid #e2e8f0;">${row.student.name}</td>
          ${examCells}
          <td style="padding:5px 4px;border:1px solid #e2e8f0;text-align:center;font-weight:700;">${row.hasAny ? `${row.grandTotal}/${row.grandMax}` : '—'}</td>
           <td style="padding:5px 4px;border:1px solid #e2e8f0;text-align:center;">${row.hasAny ? `${formatPercentage(row.pct)}%` : '—'}</td>
          <td style="padding:5px 4px;border:1px solid #e2e8f0;text-align:center;font-weight:800;color:${resultColor};">${row.hasAny ? row.grade : '—'}</td>
          <td style="padding:5px 4px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:${resultColor};">${row.hasAny ? (row.pass ? 'PASS' : 'FAIL') : '—'}</td>
        </tr>`;
      }).join('');

      return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${title}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:16px 16px 4px;color:#0C1F4A;}
        h2{text-align:center;color:#1E3A8A;margin:0 0 2px;}
        .sub{text-align:center;color:#64748B;font-size:12px;margin-bottom:10px;}
        .stats{display:flex;gap:10px;justify-content:center;margin-bottom:12px;}
        .stat{background:#f0f4ff;border-radius:8px;padding:6px 14px;text-align:center;}
        .stat-v{font-size:18px;font-weight:800;color:#1E3A8A;}
        .stat-k{font-size:10px;color:#64748B;margin-top:1px;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        th{background:#1E3A8A;color:#fff;padding:5px 4px;border:1px solid #ccc;}
        @media print{@page{size:landscape;margin:8mm;}}
      </style></head><body>
      <h2>${SCHOOL_INFO.name}</h2>
      <div class="sub">${title} &nbsp;•&nbsp; Class: ${frClass ?? ''}</div>
      <div class="stats">
        <div class="stat"><div class="stat-v">${totalStudents}</div><div class="stat-k">Total</div></div>
        <div class="stat"><div class="stat-v" style="color:#10B981">${passed}</div><div class="stat-k">Passed</div></div>
        <div class="stat"><div class="stat-v" style="color:#EF4444">${totalStudents - passed}</div><div class="stat-k">Failed</div></div>
        <div class="stat"><div class="stat-v">${totalStudents > 0 ? Math.round((passed / totalStudents) * 100) : 0}%</div><div class="stat-k">Pass Rate</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="padding:6px 4px;border:1px solid #ccc;">Roll</th>
            <th rowspan="2" style="padding:6px 8px;border:1px solid #ccc;">Student Name</th>
            ${examHeaderCols}
            <th rowspan="2" style="padding:6px 4px;border:1px solid #ccc;">Grand Total</th>
            <th rowspan="2" style="padding:6px 4px;border:1px solid #ccc;">%</th>
            <th rowspan="2" style="padding:6px 4px;border:1px solid #ccc;">Grade</th>
            <th rowspan="2" style="padding:6px 4px;border:1px solid #ccc;">Result</th>
          </tr>
          <tr>${subHeaderCols}</tr>
        </thead>
        <tbody>${dataRows}</tbody>
      </table>
      <p style="text-align:center;font-size:11px;color:#888;margin-top:20px;">
        Sorted by Roll Number &nbsp;•&nbsp; ${SCHOOL_INFO.name} &nbsp;•&nbsp; ${SCHOOL_INFO.contact}
      </p>
      </body></html>`;
    };

    const handleDownloadPdf = async () => {
      if (frRows.length === 0) return;
      setFrGenerating(true);
      try {
        const html = buildPdfHtml();
        if (Platform.OS === 'web') {
          // ── Direct PDF download via html2canvas + jspdf (no print dialog) ──
          const [h2cMod, jspdfMod] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
          ]);
          const html2canvas = (h2cMod.default ?? h2cMod) as any;
          const JsPDF = (jspdfMod.jsPDF ?? jspdfMod.default) as any;

          // Load full HTML into a hidden iframe so styles render correctly
          const iframe = document.createElement('iframe');
          iframe.style.cssText =
             'position:fixed;left:0;top:0;width:1122px;height:1px;' +
            'opacity:0;pointer-events:none;z-index:-9999;border:none;';
          document.body.appendChild(iframe);

          try {
            await new Promise<void>((resolve, reject) => {
              const tid = setTimeout(() => reject(new Error('iframe timeout')), 15_000);
              iframe.onload = () => { clearTimeout(tid); resolve(); };
              iframe.srcdoc = html;
            });

            const iDoc = iframe.contentDocument!;
            // Brief settle for fonts/layout
            await new Promise(r => setTimeout(r, 600));

            const body = iDoc.body;
             // The iframe must be measured from its content, not from a large
             // fixed viewport. A large viewport makes html2canvas capture
             // thousands of blank pixels after the table.
             const measuredHeight = () => Math.ceil(Math.max(
               body.scrollHeight,
               body.offsetHeight,
               iDoc.documentElement.scrollHeight,
               iDoc.documentElement.offsetHeight,
             ));
             const contentHeight = Math.max(1, measuredHeight());
             iframe.style.height = `${contentHeight}px`;
             await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
             const settledHeight = Math.max(contentHeight, measuredHeight());

            const canvas = await html2canvas(body, {
              scale: 2,
              useCORS: true,
              allowTaint: false,
              backgroundColor: '#ffffff',
              width: 1122,
               height: settledHeight,
              windowWidth: 1122,
               windowHeight: settledHeight,
              logging: false,
            });

             // Remove only blank rows below the rendered report. This guards
             // against browser viewport rounding adding a mostly-empty final
             // page while preserving the existing report design and spacing.
             const pixels = canvas.getContext('2d')?.getImageData(
               0,
               0,
               canvas.width,
               canvas.height,
             );
             if (pixels) {
               let lastContentRow = -1;
               for (let y = canvas.height - 1; y >= 0 && lastContentRow === -1; y -= 1) {
                 for (let x = 0; x < canvas.width; x += 1) {
                   const offset = (y * canvas.width + x) * 4;
                   if (
                     pixels.data[offset] < 248 ||
                     pixels.data[offset + 1] < 248 ||
                     pixels.data[offset + 2] < 248
                   ) {
                     lastContentRow = y;
                     break;
                   }
                 }
               }
               if (lastContentRow >= 0 && lastContentRow + 1 < canvas.height) {
                 const trimmed = document.createElement('canvas');
                 trimmed.width = canvas.width;
                 trimmed.height = lastContentRow + 1;
                 trimmed.getContext('2d')?.drawImage(
                   canvas,
                   0,
                   0,
                   canvas.width,
                   trimmed.height,
                   0,
                   0,
                   trimmed.width,
                   trimmed.height,
                 );
                 canvas.width = trimmed.width;
                 canvas.height = trimmed.height;
                 canvas.getContext('2d')?.drawImage(trimmed, 0, 0);
               }
             }

            // Landscape A4: 297 × 210 mm
            const pdf = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const imgW = pageW;
            const imgH = (canvas.height / canvas.width) * imgW;
             const pageCapacityPx = (pageH / imgW) * canvas.width;
             const bodyRect = body.getBoundingClientRect();
             const captureScale = canvas.width / 1122;
             let contentBottomPx = canvas.height;
             const canvasPixels = canvas.getContext('2d')?.getImageData(
               0,
               0,
               canvas.width,
               canvas.height,
             );
             if (canvasPixels) {
               for (let y = canvas.height - 1; y >= 0; y -= 1) {
                 let rowHasContent = false;
                 for (let x = 0; x < canvas.width; x += 2) {
                   const offset = (y * canvas.width + x) * 4;
                   if (
                     canvasPixels.data[offset] < 248 ||
                     canvasPixels.data[offset + 1] < 248 ||
                     canvasPixels.data[offset + 2] < 248
                   ) {
                     rowHasContent = true;
                     break;
                   }
                 }
                 if (rowHasContent) {
                   contentBottomPx = y + 1;
                   break;
                 }
               }
             }
             const rowBounds = Array.from(iDoc.querySelectorAll('tbody tr')).map(row => {
               const rect = row.getBoundingClientRect();
               return {
                 top: Math.max(0, (rect.top - bodyRect.top) * captureScale),
                 bottom: Math.min(
                   contentBottomPx,
                   Math.max(0, (rect.bottom - bodyRect.top) * captureScale),
                 ),
               };
             });

             // Build page starts from rendered row positions. This keeps a row
             // together instead of cutting it at an A4 boundary. If there are
             // no rows, the measured canvas height still determines the count.
             const pageStarts = [0];
             let pageStart = 0;
             for (const row of rowBounds) {
               if (
                 row.bottom - pageStart > pageCapacityPx &&
                 row.top > pageStart &&
                 row.top < contentBottomPx
               ) {
                 pageStart = row.top;
                 pageStarts.push(pageStart);
               }
             }

             const hasVisibleContent = (source: HTMLCanvasElement): boolean => {
               const context = source.getContext('2d');
               if (!context) return true;
               const pixels = context.getImageData(0, 0, source.width, source.height).data;
               for (let y = 0; y < source.height; y += 4) {
                 for (let x = 0; x < source.width; x += 4) {
                   const offset = (y * source.width + x) * 4;
                   if (
                     pixels[offset] < 248 ||
                     pixels[offset + 1] < 248 ||
                     pixels[offset + 2] < 248
                   ) {
                     return true;
                   }
                 }
               }
               return false;
             };

             // Add one image segment per calculated page. Cropping each
             // segment avoids relying on negative image offsets, which can
             // leave a blank trailing page in some mobile PDF viewers.
             let pagesAdded = 0;
             for (let page = 0; page < pageStarts.length; page += 1) {
               const startPx = pageStarts[page];
               const endPx = page + 1 < pageStarts.length
                 ? pageStarts[page + 1]
                 : contentBottomPx;
               if (endPx <= startPx) continue;
               const segment = document.createElement('canvas');
               segment.width = canvas.width;
               segment.height = Math.max(1, Math.ceil(endPx - startPx));
               segment.getContext('2d')?.drawImage(
                 canvas,
                 0,
                 startPx,
                 canvas.width,
                 segment.height,
                 0,
                 0,
                 segment.width,
                 segment.height,
               );
               if (!hasVisibleContent(segment)) continue;
               if (pagesAdded > 0) pdf.addPage();
               const segmentH = (segment.height / segment.width) * imgW;
               pdf.addImage(segment.toDataURL('image/png'), 'PNG', 0, 0, imgW, segmentH);
               pagesAdded += 1;
             }

             // Always leave a usable PDF when the canvas contains content but
             // the sampled slices were too small for the visibility check.
             if (pagesAdded === 0 && contentBottomPx > 0) {
               pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, imgH);
            }

            const label = frSelectedExams.length > 1
              ? `Combined_Results_${frClass}`
              : `${(frSelectedExams[0]?.name ?? 'Results').replace(/\s+/g, '_')}_${frClass}`;
            pdf.save(`${label}.pdf`);
          } finally {
            document.body.removeChild(iframe);
          }
        } else {
          const { uri } = await Print.printToFileAsync({ html, base64: false });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
          } else {
            await Print.printAsync({ uri });
          }
        }
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Failed to generate PDF');
      } finally {
        setFrGenerating(false);
      }
    };

    const ready = frSelectedExams.length > 0 && !!frClass && frRows.length > 0;

    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.backBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => { setScreen('list'); setFrExamIds([]); setFrClass(null); }}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.backTitle, { color: colors.text }]}>Combined Results</Text>
            {frSelectedExams.length > 0 && (
              <Text style={{ fontSize: 11, color: colors.mutedForeground }} numberOfLines={1}>
                {frSelectedExams.map(e => e.name).join(' + ')}
              </Text>
            )}
          </View>
          {ready && (
            <TouchableOpacity
              style={[fr.dlBtn, { backgroundColor: frGenerating ? colors.muted : colors.primary }]}
              onPress={handleDownloadPdf}
              activeOpacity={0.8}
              disabled={frGenerating}
            >
              <Feather name={frGenerating ? 'loader' : 'download'} size={15} color={frGenerating ? colors.mutedForeground : '#fff'} />
              <Text
                numberOfLines={1}
                style={{ flexShrink: 1, fontSize: 12, fontWeight: '700', color: frGenerating ? colors.mutedForeground : '#fff' }}
              >
                {frGenerating ? 'Generating…' : 'Download'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: botPad }} keyboardShouldPersistTaps="handled">

          {/* ── Exam multi-select ── */}
          <Text style={[fr.sectionLabel, { color: colors.mutedForeground }]}>
            SELECT EXAMS &nbsp;<Text style={{ color: colors.primary }}>({frExamIds.length} selected)</Text>
          </Text>
          {exams.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, marginBottom: 16 }}>No exams yet.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {exams.map(ex => {
                const active = frExamIds.includes(ex.id);
                return (
                  <TouchableOpacity
                    key={ex.id}
                    onPress={() => toggleExam(ex.id)}
                    style={[fr.chip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                    activeOpacity={0.8}
                  >
                    {active && <Feather name="check" size={12} color="#fff" style={{ marginRight: 4 }} />}
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.text }}>{ex.name}</Text>
                      <Text style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.7)' : colors.mutedForeground }}>{ex.date}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Class picker ── */}
          {frSelectedExams.length > 0 && (
            <>
              <Text style={[fr.sectionLabel, { color: colors.mutedForeground }]}>SELECT CLASS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {frClasses.map(cls => {
                  const active = frClass === cls;
                  return (
                    <TouchableOpacity
                      key={cls}
                      onPress={() => setFrClass(cls)}
                      style={[fr.chip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.text }}>{cls}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Result table ── */}
          {frSelectedExams.length > 0 && frClass && (
            <>
              {/* Summary */}
              <View style={[fr.summaryBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { val: totalStudents, label: 'Total', color: colors.primary },
                  { val: passed, label: 'Passed', color: colors.success },
                  { val: totalStudents - passed, label: 'Failed', color: colors.destructive },
                  { val: `${totalStudents > 0 ? Math.round((passed / totalStudents) * 100) : 0}%`, label: 'Pass Rate', color: colors.text },
                ].map((item, i, arr) => (
                  <React.Fragment key={item.label}>
                    <View style={fr.summaryItem}>
                      <Text style={[fr.summaryVal, { color: item.color }]}>{item.val}</Text>
                      <Text style={[fr.summaryKey, { color: colors.mutedForeground }]}>{item.label}</Text>
                    </View>
                    {i < arr.length - 1 && <View style={[fr.summaryDivider, { backgroundColor: colors.border }]} />}
                  </React.Fragment>
                ))}
              </View>

              {/* Result header */}
              <View style={[fr.resultHeader, { backgroundColor: colors.primary }]}>
                <Text style={fr.resultHeaderTitle}>{SCHOOL_INFO.name}</Text>
                <Text style={fr.resultHeaderExam} numberOfLines={2}>
                  {frSelectedExams.length > 1
                    ? `Combined: ${frSelectedExams.map(e => e.name).join(' + ')}`
                    : frSelectedExams[0]?.name}
                </Text>
                <Text style={fr.resultHeaderSub}>Class: {frClass}</Text>
              </View>

              {/* Scrollable table */}
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  {/* Table header — row 1: exam names spanning 2 cols each */}
                  <View style={[fr.tableHead, { backgroundColor: colors.primary }]}>
                    <Text style={[fr.th, { width: 44, color: '#fff' }]}>Roll</Text>
                    <Text style={[fr.th, { width: 130, color: '#fff', textAlign: 'left' }]}>Name</Text>
                    {frSelectedExams.map(ex => (
                      <Text key={ex.id} style={[fr.th, { width: 100, color: '#fff' }]} numberOfLines={1}>{ex.name}</Text>
                    ))}
                    <Text style={[fr.th, { width: 80, color: '#fff' }]}>Grand{'\n'}Total</Text>
                    <Text style={[fr.th, { width: 48, color: '#fff' }]}>%</Text>
                    <Text style={[fr.th, { width: 40, color: '#fff' }]}>Grd</Text>
                    <Text style={[fr.th, { width: 48, color: '#fff' }]}>Result</Text>
                  </View>

                  {frRows.length === 0 ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <Feather name="inbox" size={32} color={colors.mutedForeground} />
                      <Text style={{ color: colors.mutedForeground, marginTop: 10 }}>No students in {frClass}</Text>
                    </View>
                  ) : (
                    frRows.map((row, idx) => {
                      const rowBg = idx % 2 === 0 ? colors.card : colors.muted + '50';
                      const resultColor = row.hasAny ? (row.pass ? colors.success : colors.destructive) : colors.mutedForeground;
                      return (
                        <View key={row.student.id} style={[fr.tableRow, { backgroundColor: rowBg, borderColor: colors.border }]}>
                          <Text style={[fr.td, { width: 44, fontWeight: '700', color: colors.text }]}>{idx + 1}</Text>
                          <Text style={[fr.td, { width: 130, textAlign: 'left', color: colors.text }]} numberOfLines={1}>{row.student.name}</Text>
                          {frSelectedExams.map(ex => {
                            const et = row.examTotals.find(t => t.examId === ex.id);
                            return (
                              <Text key={ex.id} style={[fr.td, { width: 100, color: et?.hasResult ? colors.text : colors.mutedForeground }]}>
                                {et?.hasResult ? `${et.total}/${et.maxTotal}` : '—'}
                              </Text>
                            );
                          })}
                          <Text style={[fr.td, { width: 80, fontWeight: '700', color: colors.text }]}>
                            {row.hasAny ? `${row.grandTotal}/${row.grandMax}` : '—'}
                          </Text>
                           <Text style={[fr.td, { width: 48, color: colors.text }]}>{row.hasAny ? `${formatPercentage(row.pct)}%` : '—'}</Text>
                          <Text style={[fr.td, { width: 40, fontWeight: '800', color: resultColor }]}>{row.hasAny ? row.grade : '—'}</Text>
                          <View style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}>
                            {row.hasAny ? (
                              <View style={[fr.resultBadge, { backgroundColor: row.pass ? colors.success + '25' : colors.destructive + '25' }]}>
                                <Text style={{ fontSize: 9, fontWeight: '800', color: resultColor }}>{row.pass ? 'PASS' : 'FAIL'}</Text>
                              </View>
                            ) : <Text style={{ fontSize: 10, color: colors.mutedForeground }}>—</Text>}
                          </View>
                        </View>
                      );
                    })
                  )}

                  {frRows.length > 0 && (
                    <View style={[fr.tableFooter, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: 'center' }}>
                        Roll No. assigned by Percentage Rank • {SCHOOL_INFO.name}
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </>
          )}

          {frSelectedExams.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Feather name="layers" size={44} color={colors.mutedForeground} style={{ marginBottom: 14 }} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Select One or More Exams</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }}>
                Tap exams above to combine them into a single result sheet, then pick a class.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Subjects Management Screen ────────────────────────────────────────────
  if (screen === 'subjects') {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.backBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => setScreen('list')}><Feather name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
          <Text style={[s.backTitle, { color: colors.text }]}>Manage Subjects</Text>
        </View>
        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <TextInput
              style={[{ flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
              value={newSubjectInput}
              onChangeText={setNewSubjectInput}
              placeholder="Add new subject..."
              placeholderTextColor={colors.mutedForeground}
              onSubmitEditing={() => { if (newSubjectInput.trim()) { addSubject(newSubjectInput.trim()); setNewSubjectInput(''); } }}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[{ width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: colors.primary }]}
              onPress={() => { if (newSubjectInput.trim()) { addSubject(newSubjectInput.trim()); setNewSubjectInput(''); } }}
            >
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <FlatList
          data={subjects}
          keyExtractor={i => i}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: botPad, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon="book" title="No Subjects" subtitle="Add subjects to use in exams" />}
          renderItem={({ item }) => (
            <View style={[subj.row, { backgroundColor: colors.card }]}>
              <View style={[subj.icon, { backgroundColor: colors.primary + '15' }]}>
                <Feather name="book" size={18} color={colors.primary} />
              </View>
              <Text style={[subj.name, { color: colors.text }]}>{item}</Text>
              <TouchableOpacity onPress={() => confirmDeleteSubject(item)} style={{ padding: 8 }}>
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          )}
        />
        <Modal visible={!!subjectToDelete} animationType="fade" transparent>
          <View style={cmo.overlay}>
            <View style={[cmo.sheet, { backgroundColor: colors.card, borderRadius: 20, margin: 24 }]}>
              <View style={[cmo.header, { borderBottomColor: colors.border }]}>
                <Text style={[cmo.title, { color: colors.text }]}>Delete Subject</Text>
              </View>
              <View style={{ padding: 20 }}>
                <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
                  Remove <Text style={{ fontWeight: '700' }}>"{subjectToDelete}"</Text> from the subject list?
                </Text>
              </View>
              <View style={[cmo.footer, { borderTopColor: colors.border }]}>
                <TouchableOpacity style={[cmo.btn, { borderColor: colors.border }]} onPress={() => setSubjectToDelete(null)} activeOpacity={0.8}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[cmo.btn, { flex: 2, backgroundColor: colors.destructive }]} onPress={doDeleteSubject} activeOpacity={0.8}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Marksheet View ────────────────────────────────────────────────────────
  if (screen === 'marksheet' && selectedResult && selectedExam) {
    const resultSubs = selectedClass ? getExamSubjectsForClass(selectedExam, selectedClass) : selectedExam.subjects;
    const { total, maxTotal, pct, grade, pass } = (() => {
      const tot = resultSubs.reduce((s, sub) => s + (selectedResult.marks[sub] ?? 0), 0);
      const mx  = resultSubs.reduce((s, sub) => s + getSubjectMax(selectedExam, sub, selectedClass), 0);
      const pc  = mx > 0 ? Math.round((tot / mx) * 100) : 0;
      const pass = pc >= 30 && resultSubs.every(sub => {
        const maxMarks = getSubjectMax(selectedExam, sub, selectedClass);
        return (selectedResult.marks[sub] ?? 0) >= maxMarks * 0.30;
      });
      return { total: tot, maxTotal: mx, pct: pc, grade: getGrade(pc), pass };
    })();

    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.backBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => setScreen('results')}><Feather name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
          <Text style={[s.backTitle, { color: colors.text }]}>Marksheet</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: botPad }}>
          <View style={[mk.sheet, { backgroundColor: colors.card }]}>
            <View style={[mk.sheetHeader, { backgroundColor: colors.primary }]}>
              <Text style={mk.schoolName}>{SCHOOL_INFO.name}</Text>
              <Text style={mk.examName}>{selectedExam.name}</Text>
              <Text style={mk.examDate}>{selectedExam.date}</Text>
            </View>
            <View style={mk.studentInfo}>
              {[['Student Name', selectedResult.studentName], ['Class', selectedResult.class], ['Roll Number', selectedResult.rollNumber]].map(([label, val]) => (
                <View key={label} style={[mk.infoRow, { borderBottomColor: colors.border }]}>
                  <Text style={[mk.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <Text style={[mk.infoVal, { color: colors.text }]}>{val}</Text>
                </View>
              ))}
            </View>
            <View style={[mk.tableHeader, { backgroundColor: colors.muted }]}>
              <Text style={[mk.thCell, { flex: 2, color: colors.text }]}>Subject</Text>
              <Text style={[mk.thCell, { color: colors.text }]}>Marks</Text>
              <Text style={[mk.thCell, { color: colors.text }]}>Max</Text>
              <Text style={[mk.thCell, { color: colors.text }]}>Grade</Text>
            </View>
            {resultSubs.map(sub => {
              const m = selectedResult.marks[sub] ?? 0;
              const subMax = getSubjectMax(selectedExam, sub, selectedClass);
              const spct = subMax > 0 ? Math.round((m / subMax) * 100) : 0;
              const subDate = selectedExam.subjectSchedule?.find(sc => sc.subject === sub)?.date;
              return (
                <View key={sub} style={[mk.tableRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 2 }}>
                    <Text style={[mk.tdCell, { color: colors.text }]}>{sub}</Text>
                    {subDate && <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{subDate}</Text>}
                  </View>
                  <Text style={[mk.tdCell, { color: colors.text }]}>{m}</Text>
                  <Text style={[mk.tdCell, { color: colors.mutedForeground }]}>{subMax}</Text>
                  <Text style={[mk.tdCell, { color: spct >= 50 ? colors.success : colors.destructive, fontWeight: '700' }]}>{getGrade(spct)}</Text>
                </View>
              );
            })}
            <View style={[mk.totalRow, { borderTopColor: colors.border }]}>
              <Text style={[mk.totalLabel, { color: colors.text }]}>Total: {total}/{maxTotal}</Text>
              <Text style={[mk.totalLabel, { color: colors.text }]}>Percentage: {pct}%</Text>
              <Text style={[mk.totalLabel, { color: colors.text }]}>Grade: {grade}</Text>
            </View>
            <View style={[mk.resultBanner, { backgroundColor: pass ? colors.success + '20' : colors.destructive + '20' }]}>
              <Feather name={pass ? 'award' : 'x-circle'} size={24} color={pass ? colors.success : colors.destructive} />
              <Text style={[mk.resultText, { color: pass ? colors.success : colors.destructive }]}>{pass ? 'PASS' : 'FAIL'}</Text>
            </View>

            {/* ── Signature Section ── */}
            <View style={[mk.sigSection, { borderTopColor: colors.border }]}>
              <Text style={[mk.sigSectionTitle, { color: colors.mutedForeground }]}>AUTHORISED SIGNATURES</Text>
              <View style={mk.sigRow}>
                {([
                  { label: 'Class Teacher', icon: 'user' as const, imgUrl: documentBranding.teacherSignatureDataUrl },
                  { label: 'Principal',     icon: 'award' as const, imgUrl: documentBranding.principalSignatureDataUrl || documentBranding.signatureDataUrl },
                ] as { label: string; icon: React.ComponentProps<typeof Feather>['name']; imgUrl: string | null | undefined }[]).map(({ label, icon, imgUrl }) => (
                  <View key={label} style={mk.sigBox}>
                    {imgUrl ? (
                      <Image source={{ uri: imgUrl }} style={mk.sigImg} resizeMode="contain" />
                    ) : (
                      <View style={[mk.sigIconWrap, { backgroundColor: colors.primary + '12' }]}>
                        <Feather name={icon} size={18} color={colors.primary} />
                      </View>
                    )}
                    <View style={[mk.sigLine, { borderBottomColor: colors.border }]} />
                    <Text style={[mk.sigLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Footer ── */}
            <View style={[mk.footer, { borderTopColor: colors.border, backgroundColor: colors.primary + '08' }]}>
              <Text style={[mk.footerSchool, { color: colors.primary }]}>{SCHOOL_INFO.name}</Text>
              <View style={mk.footerDivider} />
              <Text style={[mk.footerContact, { color: colors.mutedForeground }]}>{SCHOOL_INFO.address}</Text>
              <Text style={[mk.footerContact, { color: colors.mutedForeground }]}>📞 {SCHOOL_INFO.contact}</Text>
              <Text style={[mk.footerNote, { color: colors.mutedForeground }]}>This is a computer-generated marksheet. No signature required if digitally stamped.</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Enter Marks View ──────────────────────────────────────────────────────
  if (screen === 'marks' && selectedExam && selectedClass) {
    const markSubs = getExamSubjectsForClass(selectedExam, selectedClass);
    const markStudents = students.filter(s => s.class === selectedClass && !isGraduatedStudent(s));
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.backBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => setScreen('results')}><Feather name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
          <Text style={[s.backTitle, { color: colors.text }]}>Enter Marks — {selectedClass}</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {markStudents.map(student => (
            <View key={student.id} style={[mrk.card, { backgroundColor: colors.card }]}>
              <Text style={[mrk.studentName, { color: colors.text }]}>{student.name} <Text style={{ color: colors.mutedForeground, fontWeight: '400' }}>Roll {student.rollNumber}</Text></Text>
              {markSubs.map(sub => {
                const subMax = getSubjectMax(selectedExam, sub, selectedClass);
                return (
                  <View key={sub} style={mrk.subjectRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[mrk.subLabel, { color: colors.text }]}>{sub}</Text>
                      {selectedExam.subjectSchedule && (
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                          {selectedExam.subjectSchedule.find(sc => sc.subject === sub)?.date ?? selectedExam.date}
                        </Text>
                      )}
                    </View>
                    <TextInput
                      style={[mrk.marksInput, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                      value={marksData[student.id]?.[sub] ?? ''}
                      onChangeText={v => {
                        const num = Number(v);
                        if (v !== '' && (isNaN(num) || num < 0 || num > subMax)) return;
                        setMarksData(prev => ({ ...prev, [student.id]: { ...(prev[student.id] ?? {}), [sub]: v } }));
                      }}
                      placeholder={`/${subMax}`}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="number-pad"
                    />
                  </View>
                );
              })}
            </View>
          ))}
          {markStudents.length === 0 && (
            <Text style={{ textAlign: 'center', color: colors.mutedForeground, padding: 20 }}>
              No students in {selectedClass}
            </Text>
          )}
        </ScrollView>
        <View style={[s.saveBar, {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 12,
          marginBottom: Platform.OS === 'web' ? 84 : insets.bottom + 60,
        }]}>
          <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMarks} activeOpacity={0.85}>
            <Feather name="save" size={18} color="#fff" />
            <Text style={s.saveBtnText}>Save All Marks</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Results View ──────────────────────────────────────────────────────────
  if (screen === 'results' && selectedExam) {
    const multiClass = examClasses.length > 1;

    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.backBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => setScreen('list')}><Feather name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[s.backTitle, { color: colors.text }]}>{selectedExam.name}</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
              {selectedClass ?? getExamClassLabel(selectedExam)} • {selectedExam.date}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.enterMarksBtn, { backgroundColor: selectedClass ? colors.primary : colors.muted }]}
            onPress={() => selectedClass ? openMarksEntry(selectedClass) : null}
            activeOpacity={0.8}
          >
            <Feather name="edit" size={15} color={selectedClass ? '#fff' : colors.mutedForeground} />
            <Text style={[s.enterMarksBtnText, { color: selectedClass ? '#fff' : colors.mutedForeground }]}>Enter Marks</Text>
          </TouchableOpacity>
        </View>

        {/* Class picker tabs — shown when multiple classes */}
        {multiClass && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={[res.subjectsBar, { backgroundColor: colors.secondary }]}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' }}
          >
            {examClasses.map(cls => {
              const active = selectedClass === cls;
              return (
                <TouchableOpacity
                  key={cls}
                  onPress={() => setSelectedClass(cls)}
                  style={[res.subChip, { backgroundColor: active ? colors.primary : colors.primary + '20' }]}
                  activeOpacity={0.8}
                >
                  <Text style={[res.subChipText, { color: active ? '#fff' : colors.primary }]}>{cls}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Subjects bar */}
        {selectedClass && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={[res.subjectsBar, { backgroundColor: colors.muted + '60' }]}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' }}
          >
            {activeSubjects.map(sub => (
              <View key={sub} style={[res.subChip, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[res.subChipText, { color: colors.primary }]}>{sub}</Text>
              </View>
            ))}
            <View style={[res.subChip, { backgroundColor: colors.muted }]}>
              <Text style={[res.subChipText, { color: colors.mutedForeground }]}>Max: {selectedExam.maxMarks}</Text>
            </View>
          </ScrollView>
        )}

        {/* Prompt to select class if multi-class and none selected */}
        {multiClass && !selectedClass ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Feather name="users" size={40} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Select a Class</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: 'center' }}>
              Tap a class above to view results and enter marks
            </Text>
          </View>
        ) : (
          <FlatList
            data={examStudents}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
            ListEmptyComponent={
              <EmptyState icon="users" title="No Students" subtitle={`No students in ${selectedClass ?? selectedExam.class}`} />
            }
            renderItem={({ item: student }) => {
              const result = getResultForStudent(student.id);
              if (!result) return (
                <View style={[res.card, { backgroundColor: colors.card }]}>
                  <View style={[res.avatar, { backgroundColor: colors.secondary }]}>
                    <Text style={[res.avatarText, { color: colors.primary }]}>{student.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[res.name, { color: colors.text }]}>{student.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Roll {student.rollNumber} • Marks not entered</Text>
                  </View>
                </View>
              );
              const { total, maxTotal, pct, grade, pass } = computeResult(result.marks, selectedExam);
              return (
                <TouchableOpacity
                  style={[res.card, { backgroundColor: colors.card }]}
                  onPress={() => { setSelectedResult(result); setScreen('marksheet'); }}
                  activeOpacity={0.85}
                >
                  <View style={[res.avatar, { backgroundColor: colors.secondary }]}>
                    <Text style={[res.avatarText, { color: colors.primary }]}>{student.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[res.name, { color: colors.text }]}>
                      {student.name} <Text style={{ fontWeight: '400', color: colors.mutedForeground }}>Roll {student.rollNumber}</Text>
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{total}/{maxTotal} • {pct}%</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[res.grade, { color: pass ? colors.success : colors.destructive }]}>{grade}</Text>
                    <View style={[res.passBadge, { backgroundColor: pass ? colors.success + '20' : colors.destructive + '20' }]}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: pass ? colors.success : colors.destructive }}>
                        {pass ? 'PASS' : 'FAIL'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  // ── Exam List View ────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.topBar, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: webTopPad }]}>
        <Text style={[s.count, { color: colors.mutedForeground }]}>{exams.length} exam{exams.length !== 1 ? 's' : ''}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[s.subjectMgrBtn, { backgroundColor: colors.secondary }]} onPress={() => setScreen('subjects')} activeOpacity={0.8}>
            <Feather name="book" size={16} color={colors.primary} />
            <Text style={[s.subjectMgrText, { color: colors.primary }]}>Subjects</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.createBtn, { backgroundColor: colors.primary }]} onPress={openCreateExam} activeOpacity={0.8}>
            <Feather name="plus" size={18} color="#fff" />
            <Text style={s.createBtnText}>Create Exam</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Quick Actions ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
        <Text style={[qa.sectionLabel, { color: colors.mutedForeground }]}>QUICK ACTIONS</Text>
        <TouchableOpacity
          style={[qa.card, { backgroundColor: colors.success + '12', borderColor: colors.success + '30' }]}
          onPress={() => { setFrExamIds([]); setFrClass(null); setScreen('finalResults'); }}
          activeOpacity={0.82}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[qa.iconWrap, { backgroundColor: colors.success }]}>
              <Feather name="award" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[qa.cardTitle, { color: colors.text }]}>Generate Combined Results</Text>
              <Text style={[qa.cardSub, { color: colors.mutedForeground }]}>
                Select one or more exams → combine marks → download PDF, sorted by roll no.
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <Text style={[qa.sectionLabel, { color: colors.mutedForeground }]}>ALL EXAMS</Text>
      </View>

      <FlatList
        data={[...exams].sort((a, b) => b.date.localeCompare(a.date))}
        keyExtractor={i => i.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: botPad, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="book-open" title="No Exams" subtitle="Create your first exam" onAction={openCreateExam} actionLabel="Create Exam" />}
        renderItem={({ item: exam }) => {
          const activeStudentIds = new Set(students.filter(isActiveStudent).map(student => student.id));
          const resultsCount = examResults.filter(r => r.examId === exam.id && activeStudentIds.has(r.studentId)).length;
          const classLabel = getExamClassLabel(exam);
          const totalStudents = exam.classSubjects && exam.classSubjects.length > 0
            ? exam.classSubjects.reduce((n, ca) => n + students.filter(st => st.class === ca.class && isActiveStudent(st)).length, 0)
            : students.filter(st => st.class === exam.class && isActiveStudent(st)).length;
          return (
            <TouchableOpacity style={[el.card, { backgroundColor: colors.card }]} onPress={() => openExam(exam)} activeOpacity={0.85}>
              <View style={el.top}>
                <View style={[el.icon, { backgroundColor: colors.secondary }]}>
                  <Feather name="book-open" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[el.name, { color: colors.text }]}>{exam.name}</Text>
                  <Text style={[el.sub, { color: colors.mutedForeground }]}>{classLabel} • {exam.date}</Text>
                </View>
                <View style={el.actions}>
                  <TouchableOpacity onPress={() => openEditExam(exam)} style={el.actionBtn} accessibilityLabel={`Edit ${exam.name}`}>
                    <Feather name="edit-2" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDeleteExam(exam)} style={el.actionBtn} accessibilityLabel={`Delete ${exam.name}`}>
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[el.bottom, { borderTopColor: colors.border }]}>
                {exam.subjects.slice(0, 3).map(sub => (
                  <View key={sub} style={[el.subBadge, { backgroundColor: colors.secondary }]}>
                    <Text style={[el.subBadgeText, { color: colors.primary }]}>{sub}</Text>
                  </View>
                ))}
                {exam.subjects.length > 3 && (
                  <View style={[el.subBadge, { backgroundColor: colors.muted }]}>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>+{exam.subjects.length - 3}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{resultsCount}/{totalStudents} results</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ════ Create / Edit Exam Modal ════ */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={cmo.overlay}>
          <View style={[cmo.sheet, { backgroundColor: colors.card }]}>
            <View style={[cmo.header, { borderBottomColor: colors.border }]}>
              <Text style={[cmo.title, { color: colors.text }]}>{editingExam ? 'Edit Exam' : 'Create Exam'}</Text>
              <TouchableOpacity onPress={closeExamForm}>
                <Feather name="x" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">

              {/* Exam Name */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[cmo.label, { color: colors.text }]}>Exam Name *</Text>
                <TextInput
                  style={[cmo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                  value={createForm.name}
                  onChangeText={v => setCreateForm(p => ({ ...p, name: v }))}
                  placeholder="e.g. 1st Unit Test 2026"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              {/* Default Date and Max Marks */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[cmo.label, { color: colors.text }]}>Default Date</Text>
                  <TextInput
                    style={[cmo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                    value={createForm.defaultDate}
                    onChangeText={v => setCreateForm(p => ({ ...p, defaultDate: v }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[cmo.label, { color: colors.text }]}>Default Max Marks</Text>
                  <TextInput
                    style={[cmo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                    value={createForm.defaultMaxMarks}
                    onChangeText={v => setCreateForm(p => ({ ...p, defaultMaxMarks: v }))}
                    placeholder="100"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              {/* Classes — multi-select chips */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[cmo.label, { color: colors.text }]}>
                  Classes * ({createForm.selectedClasses.length} selected)
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {classes.map(cls => {
                    const selected = createForm.selectedClasses.includes(cls);
                    return (
                      <TouchableOpacity
                        key={cls}
                        onPress={() => toggleClass(cls)}
                        style={[cmo.subChip, { backgroundColor: selected ? colors.primary : colors.muted, borderColor: selected ? colors.primary : colors.border }]}
                        activeOpacity={0.8}
                      >
                        {selected && <Feather name="check" size={13} color="#fff" />}
                        <Text style={{ fontSize: 13, color: selected ? '#fff' : colors.text, fontWeight: selected ? '700' : '400' }}>{cls}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Per-class subject selection */}
              {createForm.classAssignments.map(ca => (
                <View key={ca.class} style={{ marginBottom: 16 }}>
                  {/* Class section header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
                    <Text style={[cmo.label, { color: colors.text, marginBottom: 0, flex: 1 }]}>
                      {ca.class} — Subjects *{' '}
                      <Text style={{ color: colors.mutedForeground, fontWeight: '400' }}>
                        ({ca.selectedSubjects.length} selected)
                      </Text>
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowSubjectInput(p => !p)}
                      style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }, { backgroundColor: colors.secondary }]}
                    >
                      <Feather name="plus" size={14} color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>New</Text>
                    </TouchableOpacity>
                  </View>

                  {showSubjectInput && (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                      <TextInput
                        style={[{ flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.primary }]}
                        value={newSubjectInput}
                        onChangeText={setNewSubjectInput}
                        placeholder="New subject name..."
                        placeholderTextColor={colors.mutedForeground}
                        autoFocus
                      />
                      <TouchableOpacity
                        style={[{ paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: colors.primary }]}
                        onPress={() => handleAddCustomSubject(ca.class)}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Subject chips for this class */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {subjects.map(sub => {
                      const selected = ca.selectedSubjects.includes(sub);
                      return (
                        <TouchableOpacity
                          key={sub}
                          onPress={() => toggleSubjectForClass(ca.class, sub)}
                          style={[cmo.subChip, { backgroundColor: selected ? colors.primary : colors.muted, borderColor: selected ? colors.primary : colors.border }]}
                          activeOpacity={0.8}
                        >
                          {selected && <Feather name="check" size={13} color="#fff" />}
                          <Text style={{ fontSize: 13, color: selected ? '#fff' : colors.text, fontWeight: selected ? '700' : '400' }}>{sub}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Per-subject schedule for this class */}
                  {ca.subjectSchedules.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={[cmo.label, { color: colors.text, marginBottom: 8, fontSize: 12 }]}>
                        Exam Schedule — {ca.class}
                      </Text>
                      {ca.subjectSchedules.map(sched => (
                        <View key={sched.subject} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: colors.background }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 }}>{sched.subject}</Text>
                          </View>
                          {/* Row 1: Date + Max Marks */}
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <View style={{ flex: 3 }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.mutedForeground, marginBottom: 4 }}>DATE</Text>
                              <TextInput
                                style={[cmo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border, paddingVertical: 8, fontSize: 13 }]}
                                value={sched.date}
                                onChangeText={v => updateSubjectScheduleForClass(ca.class, sched.subject, 'date', v)}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={colors.mutedForeground}
                              />
                            </View>
                            <View style={{ flex: 2 }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.mutedForeground, marginBottom: 4 }}>MAX MARKS</Text>
                              <TextInput
                                style={[cmo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border, paddingVertical: 8, fontSize: 13, textAlign: 'center' }]}
                                value={String(sched.maxMarks)}
                                onChangeText={v => updateSubjectScheduleForClass(ca.class, sched.subject, 'maxMarks', v)}
                                placeholder="100"
                                placeholderTextColor={colors.mutedForeground}
                                keyboardType="number-pad"
                              />
                            </View>
                          </View>
                          {/* Row 2: Start Time + End Time */}
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.mutedForeground, marginBottom: 4 }}>START TIME</Text>
                              <TextInput
                                style={[cmo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border, paddingVertical: 8, fontSize: 13, textAlign: 'center' }]}
                                value={sched.startTime ?? ''}
                                onChangeText={v => updateSubjectScheduleForClass(ca.class, sched.subject, 'startTime', v)}
                                placeholder="09:00 AM"
                                placeholderTextColor={colors.mutedForeground}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.mutedForeground, marginBottom: 4 }}>END TIME</Text>
                              <TextInput
                                style={[cmo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border, paddingVertical: 8, fontSize: 13, textAlign: 'center' }]}
                                value={sched.endTime ?? ''}
                                onChangeText={v => updateSubjectScheduleForClass(ca.class, sched.subject, 'endTime', v)}
                                placeholder="12:00 PM"
                                placeholderTextColor={colors.mutedForeground}
                              />
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Divider between class sections */}
                  <View style={{ height: 1, backgroundColor: colors.border, marginTop: 4 }} />
                </View>
              ))}

            </ScrollView>
            <View style={[cmo.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[cmo.btn, { borderColor: colors.border }]} onPress={closeExamForm}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[cmo.btn, { flex: 2, backgroundColor: colors.primary }]} onPress={handleSaveExam}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{editingExam ? 'Save Changes' : 'Create Exam'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Exam Modal */}
      <Modal visible={!!examToDelete} animationType="fade" transparent>
        <View style={cmo.overlay}>
          <View style={[cmo.sheet, { backgroundColor: colors.card, borderRadius: 20, margin: 24, minHeight: 0, maxHeight: 300 }]}>
            <View style={[cmo.header, { borderBottomColor: colors.border }]}>
              <Text style={[cmo.title, { color: colors.text }]}>Delete Exam</Text>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
                Delete <Text style={{ fontWeight: '700' }}>"{examToDelete?.name}"</Text>? This will also remove all results.
              </Text>
            </View>
            <View style={[cmo.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[cmo.btn, { borderColor: colors.border }]} onPress={() => setExamToDelete(null)} activeOpacity={0.8}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[cmo.btn, { flex: 2, backgroundColor: colors.destructive }]} onPress={doDeleteExam} activeOpacity={0.8}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <PremiumAlert
        visible={showExamUpdatedAlert}
        variant="success"
        title="Exam updated"
        message="The exam details were saved."
        onDismiss={() => setShowExamUpdatedAlert(false)}
      />
    </View>
  );
}

const el = StyleSheet.create({
  card: { borderRadius: 14, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  top: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionBtn: { padding: 8 },
  bottom: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, gap: 6 },
  subBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  subBadgeText: { fontSize: 11, fontWeight: '600' },
});
const res = StyleSheet.create({
  subjectsBar: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', maxHeight: 50 },
  subChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, justifyContent: 'center' },
  subChipText: { fontSize: 12, fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 10, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600' },
  grade: { fontSize: 20, fontWeight: '800' },
  passBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
});
const mrk = StyleSheet.create({
  card: { padding: 16, borderRadius: 14, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  studentName: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  subLabel: { fontSize: 14, fontWeight: '500', flex: 1 },
  marksInput: { width: 100, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, textAlign: 'center' },
});
const mk = StyleSheet.create({
  sheet: { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  sheetHeader: { padding: 24, alignItems: 'center' },
  schoolName: { color: '#fff', fontSize: 14, fontWeight: '600', opacity: 0.9, marginBottom: 4 },
  examName: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  examDate: { color: '#fff', fontSize: 13, opacity: 0.8, marginTop: 4 },
  studentInfo: { padding: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  infoLabel: { fontSize: 14, fontWeight: '500' },
  infoVal: { fontSize: 14, fontWeight: '700' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12 },
  thCell: { flex: 1, fontSize: 13, fontWeight: '700' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  tdCell: { flex: 1, fontSize: 14, fontWeight: '500' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderTopWidth: 2 },
  totalLabel: { fontSize: 14, fontWeight: '700' },
  resultBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, marginHorizontal: 20, marginBottom: 20, borderRadius: 12 },
  resultText: { fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  // signature section
  sigSection: { borderTopWidth: 1, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 8 },
  sigSectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textAlign: 'center', marginBottom: 20 },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  sigBox: { flex: 1, alignItems: 'center', gap: 8 },
  sigIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sigImg: { width: 110, height: 38, marginBottom: 2 },
  sigLine: { width: '100%', borderBottomWidth: 1.5, marginTop: 4, marginBottom: 4 },
  sigLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  // footer
  footer: { padding: 20, borderTopWidth: 1, alignItems: 'center', gap: 4 },
  footerSchool: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  footerDivider: { width: 40, height: 2, backgroundColor: '#C8A040', borderRadius: 1, marginVertical: 4 },
  footerContact: { fontSize: 11, textAlign: 'center' },
  footerNote: { fontSize: 9, textAlign: 'center', marginTop: 6, opacity: 0.7, lineHeight: 13 },
});
const cmo = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', minHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  subChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  footer: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1 },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 14 },
});
const subj = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  name: { fontSize: 15, fontWeight: '600', flex: 1 },
});
const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  count: { fontSize: 14 },
  subjectMgrBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20 },
  subjectMgrText: { fontWeight: '600', fontSize: 13 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  backBar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 12, paddingVertical: 12, borderBottomWidth: 1, gap: 6 },
  backBtn: { padding: 4 },
  backTitle: { fontSize: 18, fontWeight: '700' },
  enterMarksBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  enterMarksBtnText: { fontWeight: '600', fontSize: 12 },
  saveBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
const qa = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  iconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },
});
const fr = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minWidth: 80 },
  summaryBanner: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16, alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryVal: { fontSize: 22, fontWeight: '800' },
  summaryKey: { fontSize: 11, fontWeight: '600' },
  summaryDivider: { width: 1, height: 36 },
  resultHeader: { borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 8 },
  resultHeaderTitle: { color: '#fff', fontSize: 13, fontWeight: '600', opacity: 0.85, marginBottom: 2 },
  resultHeaderExam: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  resultHeaderSub: { color: '#fff', fontSize: 12, opacity: 0.75, marginTop: 4 },
  tableHead: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 10, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginTop: 8 },
  th: { fontSize: 11, fontWeight: '700', textAlign: 'center', color: '#fff' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, alignItems: 'center' },
  td: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
  resultBadge: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6 },
  tableFooter: { borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 4 },
  dlBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 16, minWidth: 104, flexShrink: 1 },
});
