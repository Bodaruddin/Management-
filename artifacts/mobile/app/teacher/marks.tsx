import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal,
  ScrollView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import {
  useApp,
  Exam,
  getExamSubjectsForClass,
  getSubjectMaxMarksForClass,
  isGraduatedStudent,
  compareStudentRollNumbers,
} from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';

// ─── Status helpers ────────────────────────────────────────────────────────────
type SubjectStatus = 'draft' | 'submitted' | 'locked';

const STATUS_LABEL: Record<SubjectStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  locked: 'Locked',
};

const STATUS_ICON: Record<SubjectStatus, 'edit-2' | 'check-circle' | 'lock'> = {
  draft: 'edit-2',
  submitted: 'check-circle',
  locked: 'lock',
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function TeacherMarks() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    exams, students, examResults, teachers,
    saveExamResults, markSubmissions,
    submitSubjectMarks, lockSubject, unlockSubject, refreshTeachers,
  } = useApp();

  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [marksData, setMarksData] = useState<Record<string, Record<string, string>>>({});
  const [showExamPicker, setShowExamPicker] = useState(false);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [savedBanner, setSavedBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStudentIndex, setCurrentStudentIndex] = useState(0);
  // Tracks which subjects the current teacher has actually typed into this session.
  // Only dirty subjects are submitted — prevents one teacher's save from locking
  // subjects they never touched.
  const [dirtySubjects, setDirtySubjects] = useState<Set<string>>(new Set());
  // Submitted subjects require an explicit Edit tap by their original submitter.
  const [editingSubjects, setEditingSubjects] = useState<Set<string>>(new Set());

  // Permissions can be changed by an administrator on another device while a
  // teacher app remains open. Refresh teacher data when the screen opens so ownership data stays current.
  useFocusEffect(useCallback(() => {
    refreshTeachers().catch(() => {
      // Keep the existing cached permissions if the refresh is temporarily unavailable.
    });
  }, [refreshTeachers]));

  // ── Subject status helpers ───────────────────────────────────────────────────
  const getSubjectStatus = useCallback((subject: string): SubjectStatus => {
    if (!selectedExam || !selectedClass) return 'draft';
    const sub = markSubmissions.find(ms =>
      ms.examId === selectedExam.id && ms.class === selectedClass && ms.subject === subject,
    );
    if (sub?.status === 'submitted' || sub?.status === 'locked' || sub?.status === 'draft') {
      return sub.status;
    }

    // Older results may exist without a mark-submission row. Treat those marks
    // as submitted so the missing permission record cannot make them editable.
    const hasRecordedMarks = examResults.some(result => {
      if (result.examId !== selectedExam.id || result.class !== selectedClass) return false;
      const mark = result.marks?.[subject];
      return mark !== undefined && mark !== null && String(mark).trim() !== '';
    });
    return hasRecordedMarks ? 'submitted' : 'draft';
  }, [selectedExam, selectedClass, markSubmissions, examResults]);

  const getSubjectSubmission = useCallback((subject: string) => {
    if (!selectedExam || !selectedClass) return null;
    return markSubmissions.find(ms =>
      ms.examId === selectedExam.id && ms.class === selectedClass && ms.subject === subject,
    ) ?? null;
  }, [selectedExam, selectedClass, markSubmissions]);

  const currentTeacher = useMemo(
    () => teachers.find(teacher => String(teacher.id) === String(user?.id)),
    [teachers, user?.id],
  );
  const effectivePermissions = currentTeacher?.permissions ?? user?.permissions;

  const canStartTeacherEdit = useCallback((subject: string): boolean => {
    if (user?.role !== 'teacher' || effectivePermissions?.allowMarkEdit !== true) return false;
    const submission = getSubjectSubmission(subject);
    return submission?.status === 'submitted' && String(submission.teacherId) === String(user.id);
  }, [user, currentTeacher, getSubjectSubmission]);

  // Draft subjects remain editable as before. Submitted subjects are editable
  // only after the original teacher taps Edit and only while the admin toggle
  // is enabled. Locked subjects remain read-only.
  const canEditSubject = useCallback((subject: string): boolean => {
    if (user?.role === 'admin') return true;
    if (getSubjectStatus(subject) === 'draft') return true;
    return canStartTeacherEdit(subject) && editingSubjects.has(subject);
  }, [user, getSubjectStatus, canStartTeacherEdit, editingSubjects]);

  /** Classes available for the selected exam */
  const examClasses = useMemo(() => {
    if (!selectedExam) return [];
    if (selectedExam.classSubjects && selectedExam.classSubjects.length > 0) {
      return selectedExam.classSubjects.map(cs => cs.class);
    }
    return [selectedExam.class];
  }, [selectedExam]);

  /** Subjects for the currently selected class */
  const examSubjects = useMemo(() => {
    if (!selectedExam || !selectedClass) return [];
    return getExamSubjectsForClass(selectedExam, selectedClass);
  }, [selectedExam, selectedClass]);

  /** Maximum marks for one subject, with an exam-level fallback for older exams. */
  const getSubjectMaxMarks = useCallback((subject: string): number => {
    return selectedExam
      ? getSubjectMaxMarksForClass(selectedExam, subject, selectedClass)
      : 100;
  }, [selectedExam, selectedClass]);

  /** Students in the selected class */
  const examStudents = useMemo(
    () => students
      .filter(s => s.class === selectedClass && !isGraduatedStudent(s))
      .sort((a, b) => {
        const activeOrder = (a.status === 'inactive' ? 1 : 0) - (b.status === 'inactive' ? 1 : 0);
        return activeOrder || compareStudentRollNumbers(a, b);
      }),
    [students, selectedClass],
  );

  // ── Show Edit button if at least one subject in this exam is still draft ──
  const teacherCanEdit = useMemo(() => {
    if (user?.role === 'admin') return true;
    return examSubjects.some(sub => getSubjectStatus(sub) === 'draft');
  }, [user, examSubjects, getSubjectStatus]);

  const selectExam = (exam: Exam) => {
    setSelectedExam(exam);
    setShowExamPicker(false);
    setSelectedClass(null);
    setMarksData({});
    setCurrentStudentIndex(0);
    setDirtySubjects(new Set());
    setEditingSubjects(new Set());
    setMode('view');

    const cls =
      exam.classSubjects && exam.classSubjects.length === 1
        ? exam.classSubjects[0].class
        : !exam.classSubjects || exam.classSubjects.length === 0
        ? exam.class
        : null;
    if (cls) loadClass(exam, cls);
  };

  const loadClass = (exam: Exam, cls: string) => {
    setSelectedClass(cls);
    setShowClassPicker(false);
    setDirtySubjects(new Set()); // reset per-session dirty tracking when switching class
    setEditingSubjects(new Set());
    setCurrentStudentIndex(0);
    const classStudents = students
      .filter(s => s.class === cls && !isGraduatedStudent(s))
      .sort((a, b) => {
        const activeOrder = (a.status === 'inactive' ? 1 : 0) - (b.status === 'inactive' ? 1 : 0);
        return activeOrder || compareStudentRollNumbers(a, b);
      });
    const subs = getExamSubjectsForClass(exam, cls);

    const hasResults = classStudents.some(s =>
      examResults.some(r => r.examId === exam.id && r.studentId === s.id),
    );
    // Teachers always land in edit mode so they can immediately enter marks for
    // any draft subject without pressing Edit. Submitted subjects are read-only
    // via canEditSubject regardless of mode. Admins keep view/edit toggling.
    setMode(user?.role === 'teacher' ? 'edit' : hasResults ? 'view' : 'edit');

    const data: Record<string, Record<string, string>> = {};
    classStudents.forEach(s => {
      const existing = examResults.find(r => r.examId === exam.id && r.studentId === s.id);
      data[s.id] = {};
      subs.forEach(sub => {
        data[s.id][sub] = existing?.marks[sub] !== undefined ? String(existing.marks[sub]) : '';
      });
    });
    setMarksData(data);
  };

  const handleSave = async () => {
    if (!selectedExam || !selectedClass || saving) return;
    setSaving(true);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (user?.role === 'teacher') {
        // Submit only subjects the teacher actually typed into this session AND are
        // still editable. This prevents one teacher's save from touching subjects
        // they never selected.
        const toSubmit = examSubjects.filter(
          sub => dirtySubjects.has(sub) && (
            getSubjectStatus(sub) === 'draft' ||
            canStartTeacherEdit(sub)
          ),
        );
        if (toSubmit.length === 0) {
          Alert.alert(
            'Nothing to Submit',
            dirtySubjects.size === 0
              ? 'Enter marks for at least one subject before submitting.'
              : 'The subjects you edited are locked or unavailable for editing.',
          );
          return;
        }
        for (const sub of toSubmit) {
          await submitSubjectMarks({
            examId: selectedExam.id,
            class: selectedClass,
            subject: sub,
            teacherId: user.id,
            teacherName: user.name,
            marks: examStudents.map(s => ({
              studentId: s.id,
              studentName: s.name,
              rollNumber: s.rollNumber,
              mark: (marksData[s.id]?.[sub] ?? '').trim() === ''
                ? null
                : Number(marksData[s.id]?.[sub]),
            })),
          });
        }
      } else {
        // Admin: save all subjects using existing behavior
        const results = examStudents.map(s => ({
          examId: selectedExam.id,
          studentId: s.id,
          studentName: s.name,
          class: s.class,
          rollNumber: s.rollNumber,
            marks: Object.fromEntries(examSubjects.flatMap(sub => {
              const raw = marksData[s.id]?.[sub] ?? '';
              return raw.trim() === '' ? [] : [[sub, Number(raw)]];
            })),
        }));
        saveExamResults(results);
      }

      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);
      // A completed edit is still eligible for future edits while the admin
      // setting remains enabled, so make the subject's Edit action available
      // again after returning to the summary view.
      setDirtySubjects(new Set());
      setEditingSubjects(new Set());
      // Keep teachers in the subject-by-subject entry view after submitting.
      // Submitted subjects remain read-only through canEditSubject, while
      // every other draft subject stays available to other teachers.
      setMode(user?.role === 'teacher' ? 'edit' : 'view');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to save marks');
    } finally {
      setSaving(false);
    }
  };

  const handleAdminLock = async (subject: string) => {
    if (!selectedExam || !selectedClass || user?.role !== 'admin') return;
    try {
      await lockSubject(selectedExam.id, selectedClass, subject, user.id, user.name);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to lock subject');
    }
  };

  const handleAdminUnlock = async (subject: string) => {
    if (!selectedExam || !selectedClass || user?.role !== 'admin') return;
    try {
      await unlockSubject(selectedExam.id, selectedClass, subject, user.id, user.name);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to unlock subject');
    }
  };

  const getGrade = (percentage: number) => {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 30) return 'D';
    return 'F';
  };

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 12 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;

  // ── Save button label ────────────────────────────────────────────────────────
  const saveLabel = user?.role === 'teacher' ? 'Submit Marks' : 'Save Marks';
  const currentStudent = examStudents[currentStudentIndex] ?? examStudents[0];
  const serialEntryMode = user?.role === 'teacher' && mode === 'edit';

  // ── Permission gate ────────────────────────────────────────────────────────
  if (user?.role !== 'admin' && effectivePermissions?.manageResults !== true) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.headerTop, { paddingTop: topPad }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
            <Feather name="arrow-left" size={24} color={colors.cardForeground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.cardForeground }]}>Enter Marks</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ width: 88, height: 88, borderRadius: 24, backgroundColor: colors.destructive + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <Feather name="lock" size={40} color={colors.destructive} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 12, textAlign: 'center' }}>Access Restricted</Text>
          <Text style={{ fontSize: 14, lineHeight: 22, color: colors.mutedForeground, textAlign: 'center' }}>
            You don't have permission to view or manage student results.{'\n'}Contact your admin to grant the{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>"Manage Results"</Text> permission.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.headerTop, { paddingTop: topPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
          <Feather name="arrow-left" size={24} color={colors.cardForeground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.cardForeground }]}>Enter Marks</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Selectors (Exam → Class) ── */}
      <View style={[s.selector, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {/* Exam picker */}
        <Text style={[s.selectorLabel, { color: colors.text }]}>Select Exam</Text>
        <TouchableOpacity
          style={[s.selectorBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          onPress={() => setShowExamPicker(true)}
          activeOpacity={0.8}
        >
          <Feather name="book-open" size={16} color={colors.mutedForeground} />
          <Text style={[s.selectorBtnText, { color: selectedExam ? colors.text : colors.mutedForeground }]}>
            {selectedExam ? selectedExam.name : 'Choose an exam...'}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Class picker — shown only when exam has multiple classes */}
        {selectedExam && examClasses.length > 1 && (
          <>
            <Text style={[s.selectorLabel, { color: colors.text, marginTop: 12 }]}>Select Class</Text>
            <TouchableOpacity
              style={[s.selectorBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => setShowClassPicker(true)}
              activeOpacity={0.8}
            >
              <Feather name="users" size={16} color={colors.mutedForeground} />
              <Text style={[s.selectorBtnText, { color: selectedClass ? colors.text : colors.mutedForeground }]}>
                {selectedClass ?? 'Choose a class...'}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </>
        )}

        {/* Info row when class & exam are both selected */}
        {selectedExam && selectedClass && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text style={[s.selectedInfo, { color: colors.mutedForeground, flex: 1 }]}>
              {selectedClass} • {examSubjects.length} subjects • Individual subject maximums
            </Text>
            {/* Single Edit button for admin (view→edit toggle) */}
            {user?.role === 'admin' && mode === 'view' && (
              <TouchableOpacity style={s.editBtn} onPress={() => setMode('edit')}>
                <Feather name="edit-2" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Edit</Text>
              </TouchableOpacity>
            )}
            {/* Edit submitted subjects only when the current teacher is the original submitter */}
            {user?.role === 'teacher' && examSubjects.some(sub => canStartTeacherEdit(sub) && !editingSubjects.has(sub)) && (
              <TouchableOpacity
                style={s.editBtn}
                onPress={() => {
                  const toUnlock = examSubjects.filter(sub => canStartTeacherEdit(sub));
                  setEditingSubjects(prev => {
                    const next = new Set(prev);
                    toUnlock.forEach(sub => next.add(sub));
                    return next;
                  });
                }}
              >
                <Feather name="edit-2" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ── Exam picker overlay ── */}
      {showExamPicker && (
        <View style={s.pickerOverlay}>
          <View style={[s.pickerSheet, { backgroundColor: colors.card }]}>
            <View style={[s.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.pickerTitle, { color: colors.text }]}>Select Exam</Text>
              <TouchableOpacity onPress={() => setShowExamPicker(false)}>
                <Feather name="x" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {exams.length === 0 && (
                <Text style={{ color: colors.mutedForeground, textAlign: 'center', padding: 20 }}>
                  No exams available
                </Text>
              )}
              {exams.map(exam => {
                const classLabel =
                  exam.classSubjects && exam.classSubjects.length > 1
                    ? exam.classSubjects.map(cs => cs.class).join(', ')
                    : exam.class;
                return (
                  <TouchableOpacity
                    key={exam.id}
                    style={[s.examOption, { borderBottomColor: colors.border }]}
                    onPress={() => selectExam(exam)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.examOptionName, { color: colors.text }]}>{exam.name}</Text>
                      <Text style={[s.examOptionMeta, { color: colors.mutedForeground }]}>
                        {classLabel} • {exam.date}
                      </Text>
                    </View>
                    {selectedExam?.id === exam.id && (
                      <Feather name="check" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Class picker overlay ── */}
      {showClassPicker && selectedExam && (
        <View style={s.pickerOverlay}>
          <View style={[s.pickerSheet, { backgroundColor: colors.card }]}>
            <View style={[s.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.pickerTitle, { color: colors.text }]}>Select Class</Text>
              <TouchableOpacity onPress={() => setShowClassPicker(false)}>
                <Feather name="x" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {examClasses.map(cls => (
                <TouchableOpacity
                  key={cls}
                  style={[s.examOption, { borderBottomColor: colors.border }]}
                  onPress={() => loadClass(selectedExam, cls)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.examOptionName, { color: colors.text }]}>{cls}</Text>
                    <Text style={[s.examOptionMeta, { color: colors.mutedForeground }]}>
                      {getExamSubjectsForClass(selectedExam, cls).length} subjects
                    </Text>
                  </View>
                  {selectedClass === cls && (
                    <Feather name="check" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Main content ── */}
      {!selectedExam ? (
        <EmptyState icon="edit-2" title="Select an Exam" subtitle="Choose an exam above to enter marks" />
      ) : !selectedClass ? (
        <EmptyState icon="users" title="Select a Class" subtitle="Choose a class to enter marks for" />
      ) : examStudents.length === 0 ? (
        <EmptyState icon="users" title="No Students" subtitle={`No students found in ${selectedClass}`} />
      ) : (
        <>
          {/* ── Subject status strip ── */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.mutedForeground, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Subject Status
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row' }}>
              {examSubjects.map(sub => {
                const status = getSubjectStatus(sub);
                const submission = getSubjectSubmission(sub);
                const statusColor =
                  status === 'locked' ? colors.destructive
                  : status === 'submitted' ? colors.success
                  : colors.mutedForeground;
                return (
                  <View
                    key={sub}
                    style={[
                      subStrip.pill,
                      { borderColor: colors.border, backgroundColor: colors.muted },
                    ]}
                  >
                    <Feather name={STATUS_ICON[status]} size={12} color={statusColor} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text, marginLeft: 4 }}>{sub}</Text>
                    <Text style={{ fontSize: 11, color: statusColor, marginLeft: 4, fontWeight: '500' }}>
                      · {STATUS_LABEL[status]}
                    </Text>
                    {/* Admin unlock: available on submitted or locked subjects */}
                    {user?.role === 'admin' && (status === 'submitted' || status === 'locked') && (
                      <TouchableOpacity
                        style={[subStrip.actionBtn, { backgroundColor: colors.warning + '20', marginLeft: 6 }]}
                        onPress={() => handleAdminUnlock(sub)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="unlock" size={11} color={colors.warning} />
                        <Text style={{ fontSize: 10, color: colors.warning, fontWeight: '600', marginLeft: 2 }}>Unlock</Text>
                      </TouchableOpacity>
                    )}
                    {/* Admin lock: only for draft subjects */}
                    {user?.role === 'admin' && status === 'draft' && (
                      <TouchableOpacity
                        style={[subStrip.actionBtn, { backgroundColor: colors.primary + '20', marginLeft: 6 }]}
                        onPress={() => handleAdminLock(sub)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="lock" size={11} color={colors.primary} />
                        <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '600', marginLeft: 2 }}>Lock</Text>
                      </TouchableOpacity>
                    )}
                    {/* Show submitter info */}
                    {submission?.teacherName && status !== 'draft' && (
                      <Text style={{ fontSize: 10, color: colors.mutedForeground, marginLeft: 4 }}>
                        by {submission.teacherName}
                      </Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: botPad + (mode === 'edit' ? 80 : 20) }}
            keyboardShouldPersistTaps="handled"
          >
            {serialEntryMode && currentStudent && (
              <View style={[s.studentPager, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[s.pagerButton, { borderColor: colors.border, opacity: currentStudentIndex > 0 ? 1 : 0.45 }]}
                  onPress={() => setCurrentStudentIndex(index => Math.max(0, index - 1))}
                  disabled={currentStudentIndex === 0}
                  accessibilityLabel="Previous student"
                >
                  <Feather name="chevron-left" size={18} color={colors.primary} />
                  <Text style={[s.pagerButtonText, { color: colors.primary }]}>Previous</Text>
                </TouchableOpacity>
                <View style={s.pagerCenter}>
                  <Text style={[s.pagerTitle, { color: colors.text }]}>
                    Student {currentStudentIndex + 1} of {examStudents.length}
                  </Text>
                  <Text style={[s.pagerSubtitle, { color: colors.mutedForeground }]}>
                    Enter marks for Roll {currentStudent.rollNumber}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.pagerButton, { borderColor: colors.border, opacity: currentStudentIndex < examStudents.length - 1 ? 1 : 0.45 }]}
                  onPress={() => setCurrentStudentIndex(index => Math.min(examStudents.length - 1, index + 1))}
                  disabled={currentStudentIndex === examStudents.length - 1}
                  accessibilityLabel="Next student"
                >
                  <Text style={[s.pagerButtonText, { color: colors.primary }]}>Next</Text>
                  <Feather name="chevron-right" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}
            {mode === 'edit' ? (
              (serialEntryMode ? (currentStudent ? [currentStudent] : []) : examStudents).map(student => (
                <View key={student.id} style={[mc.card, { backgroundColor: colors.card }]}>
                  <View style={mc.header2}>
                    <View style={[mc.avatar, { backgroundColor: colors.secondary }]}>
                      <Text style={[mc.avatarText, { color: colors.primary }]}>{student.name.charAt(0)}</Text>
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[mc.name, { color: colors.text }]}>{student.name}</Text>
                        {student.status === 'inactive' && (
                          <View style={{ backgroundColor: colors.destructive + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: colors.destructive, fontSize: 9, fontWeight: '700' }}>INACTIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[mc.roll, { color: colors.mutedForeground }]}>Roll {student.rollNumber}</Text>
                    </View>
                  </View>
                  {examSubjects.map(sub => {
                    const editable = canEditSubject(sub);
                    const status = getSubjectStatus(sub);
                    const subjectMaxMarks = getSubjectMaxMarks(sub);
                    const statusColor =
                      status === 'locked' ? colors.destructive
                      : status === 'submitted' ? colors.success
                      : colors.mutedForeground;
                    return (
                      <View key={sub} style={mc.subjectRow}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[mc.subLabel, { color: editable ? colors.text : colors.mutedForeground }]}>{sub}</Text>
                          {status !== 'draft' && (
                            <Feather name={STATUS_ICON[status]} size={12} color={statusColor} />
                          )}
                        </View>
                        <View style={mc.inputWrap}>
                          {editable ? (
                            <TextInput
                              style={[mc.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                              value={marksData[student.id]?.[sub] ?? ''}
                              onChangeText={v => {
                                const num = Number(v);
                                if (v !== '' && (isNaN(num) || num < 0 || num > subjectMaxMarks)) return;
                                setMarksData(prev => ({ ...prev, [student.id]: { ...(prev[student.id] ?? {}), [sub]: v } }));
                                // Mark this subject as touched so only it gets submitted
                                setDirtySubjects(prev => { const next = new Set(prev); next.add(sub); return next; });
                              }}
                              placeholder="0"
                              placeholderTextColor={colors.mutedForeground}
                              keyboardType="number-pad"
                              maxLength={3}
                            />
                          ) : (
                            <View style={[mc.readonlyBox, { backgroundColor: colors.muted + '80', borderColor: colors.border }]}>
                              <Text style={[mc.readonlyText, { color: colors.mutedForeground }]}>
                                {marksData[student.id]?.[sub] || '—'}
                              </Text>
                            </View>
                          )}
                          <Text style={[mc.maxText, { color: colors.mutedForeground }]}>/{subjectMaxMarks}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            ) : (
              // VIEW MODE
              examStudents.map(student => {
                const totalMarks = examSubjects.reduce(
                  (sum, sub) => sum + Number(marksData[student.id]?.[sub] ?? 0),
                  0,
                );
                const maxTotal = examSubjects.reduce(
                  (sum, sub) => sum + getSubjectMaxMarks(sub),
                  0,
                );
                const percentage = maxTotal > 0 ? (totalMarks / maxTotal) * 100 : 0;
                const grade = getGrade(percentage);
                let gradeColor = colors.success;
                if (grade === 'F') gradeColor = colors.destructive;
                else if (grade.startsWith('C') || grade.startsWith('D')) gradeColor = colors.warning;

                return (
                  <View key={student.id} style={[mc.card, { backgroundColor: colors.card, padding: 0, overflow: 'hidden' }]}>
                    <View style={[mc.header2, { padding: 14, marginBottom: 0, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[mc.name, { color: colors.text }]}>{student.name}</Text>
                        <Text style={[mc.roll, { color: colors.mutedForeground }]}>Roll {student.rollNumber}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: gradeColor }}>{grade}</Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontWeight: '600' }}>
                          {percentage.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                    <View style={{ padding: 14, backgroundColor: colors.muted + '40' }}>
                      {examSubjects.map(sub => {
                        const status = getSubjectStatus(sub);
                        const subjectMaxMarks = getSubjectMaxMarks(sub);
                        const statusColor =
                          status === 'locked' ? colors.destructive
                          : status === 'submitted' ? colors.success
                          : colors.mutedForeground;
                        return (
                          <View key={sub} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
                              <Text style={{ color: colors.text, fontSize: 13 }}>{sub}</Text>
                              <Feather name={STATUS_ICON[status]} size={11} color={statusColor} />
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                                {marksData[student.id]?.[sub] ?? '0'}{' '}
                                <Text style={{ color: colors.mutedForeground, fontWeight: '400' }}>
                                  / {subjectMaxMarks}
                                </Text>
                              </Text>
                              {user?.role === 'teacher' && canStartTeacherEdit(sub) && !editingSubjects.has(sub) && (
                                <TouchableOpacity
                                  style={[subStrip.actionBtn, { backgroundColor: colors.primary + '18' }]}
                                  onPress={() => {
                                    setEditingSubjects(prev => new Set(prev).add(sub));
                                    setMode('edit');
                                  }}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Feather name="edit-2" size={11} color={colors.primary} />
                                  <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '600' }}>Edit</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Total</Text>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                          {totalMarks} / {maxTotal}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <Modal visible={savedBanner} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSavedBanner(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(7, 20, 52, 0.42)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
              <View style={{ width: '100%', maxWidth: 360, borderRadius: 28, backgroundColor: colors.card, padding: 26, alignItems: 'center', shadowColor: '#071434', shadowOpacity: 0.24, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 14 }}>
                <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.success + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="check" size={32} color="#fff" />
                  </View>
                </View>
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Marks Submitted</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 }}>
                  Marks have been submitted successfully for {selectedClass}.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.success + '12' }}>
                  <Feather name="shield" size={14} color={colors.success} />
                  <Text style={{ color: colors.success, fontSize: 12, fontWeight: '700', marginLeft: 6 }}>Saved securely</Text>
                </View>
              </View>
            </View>
          </Modal>
          {mode === 'edit' && (
            <View
              style={[
                s.saveBar,
                {
                  backgroundColor: colors.card,
                  borderTopColor: colors.border,
                  paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 12,
                },
              ]}
            >
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
                onPress={handleSave}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Feather name={user?.role === 'teacher' ? 'check-circle' : 'save'} size={18} color="#fff" />
                <Text style={s.saveBtnText}>{saving ? 'Saving…' : saveLabel}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const subStrip = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10 },
});

const mc = StyleSheet.create({
  card: { borderRadius: 14, marginBottom: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  header2: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700' },
  roll: { fontSize: 12, marginTop: 2 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  subLabel: { fontSize: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: { width: 70, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, textAlign: 'center' },
  readonlyBox: { width: 70, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' },
  readonlyText: { fontSize: 15 },
  maxText: { fontSize: 13, fontWeight: '500' },
});

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  headerTop: { backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  selector: { padding: 16, borderBottomWidth: 1 },
  selectorLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  selectorBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  selectorBtnText: { flex: 1, fontSize: 15 },
  selectedInfo: { fontSize: 12, marginTop: 0 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.primary + '15', borderRadius: 8 },
  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  pickerTitle: { fontSize: 18, fontWeight: '700' },
  examOption: { padding: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  examOptionName: { fontSize: 15, fontWeight: '600' },
  examOptionMeta: { fontSize: 12, marginTop: 2 },
  saveBar: { padding: 16, borderTopWidth: 1, position: 'absolute', bottom: 0, left: 0, right: 0 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 16 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  studentPager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, padding: 8, marginBottom: 12 },
  pagerButton: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 9 },
  pagerButtonText: { fontSize: 12, fontWeight: '700' },
  pagerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  pagerTitle: { fontSize: 13, fontWeight: '700' },
  pagerSubtitle: { fontSize: 10, marginTop: 2 },
});
