import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Alert, Platform, Modal, TextInput, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useApp, InactivationRequest, isGraduatedStudent, compareStudentRollNumbers } from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';
import AttendanceDetailModal from '@/components/AttendanceDetailModal';

type Status = 'present' | 'absent' | 'holiday';
type ReportRange = 'all' | 'monthly' | 'yearly' | 'custom';

// ─── Reactivation Request Modal ────────────────────────────────────────────────
function ReactivationModal({
  visible,
  student,
  teacherId,
  teacherName,
  existingRequest,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  student: { id: string; name: string; class: string; rollNumber: string };
  teacherId: string;
  teacherName: string;
  existingRequest?: InactivationRequest;
  onClose: () => void;
  onSubmit: (data: {
    reason: string;
    documentBase64?: string;
    documentName?: string;
    documentMimeType?: string;
  }) => Promise<void>;
}) {
  const colors = useColors();
  const [reason, setReason] = useState('');
  const [docBase64, setDocBase64] = useState<string | undefined>();
  const [docName, setDocName] = useState<string | undefined>();
  const [docMime, setDocMime] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setReason('');
    setDocBase64(undefined);
    setDocName(undefined);
    setDocMime(undefined);
    setError('');
    setSubmitting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.3,
      base64: true,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setDocBase64(asset.base64 ?? undefined);
      setDocName(asset.fileName ?? 'application.jpg');
      setDocMime(asset.mimeType ?? 'image/jpeg');
    }
  };

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Please enter a reason for absence.'); return; }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({
        reason: reason.trim(),
        documentBase64: docBase64,
        documentName: docName,
        documentMimeType: docMime,
      });
      reset();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to submit request. Please try again.');
      setSubmitting(false);
    }
  };

  const m = mStyles(colors);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={handleClose} activeOpacity={1} />
        <View style={m.sheet}>
          <View style={m.handle} />

          {/* Header */}
          <View style={m.header}>
            <View style={[m.lockIcon, { backgroundColor: colors.destructive + '15' }]}>
              <Feather name="lock" size={18} color={colors.destructive} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[m.title, { color: colors.text }]}>Request Reactivation</Text>
              <Text style={[m.subtitle, { color: colors.mutedForeground }]}>{student.name} · Roll {student.rollNumber}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={m.closeBtn}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Existing pending request notice */}
          {existingRequest?.status === 'pending' && (
            <View style={[m.notice, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}>
              <Feather name="clock" size={14} color={colors.warning} />
              <Text style={[m.noticeText, { color: colors.warning }]}>
                A reactivation request is already pending admin review.
              </Text>
            </View>
          )}

          {/* Rejected notice */}
          {existingRequest?.status === 'rejected' && (
            <View style={[m.notice, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive }]}>
              <Feather name="x-circle" size={14} color={colors.destructive} />
              <Text style={[m.noticeText, { color: colors.destructive }]}>
                Previous request was rejected: {existingRequest.adminNote || 'No reason given'}
              </Text>
            </View>
          )}

          {existingRequest?.status !== 'pending' && (
            <ScrollView style={m.body} showsVerticalScrollIndicator={false}>
              {/* Info */}
              <View style={[m.infoBox, { backgroundColor: colors.muted }]}>
                <Feather name="info" size={14} color={colors.mutedForeground} />
                <Text style={[m.infoText, { color: colors.mutedForeground }]}>
                  This student has been automatically marked inactive due to excessive consecutive absences.
                  Submit a reason and supporting document for admin review.
                </Text>
              </View>

              {/* Reason */}
              <Text style={[m.label, { color: colors.text }]}>Reason for Absence *</Text>
              <TextInput
                style={[m.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                value={reason}
                onChangeText={setReason}
                placeholder="Explain the reason for extended absence..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* Document */}
              <Text style={[m.label, { color: colors.text }]}>Supporting Document (Optional)</Text>
              {docBase64 ? (
                <View style={[m.docPreview, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Feather name="image" size={18} color={colors.primary} />
                  <Text style={[m.docName, { color: colors.text }]} numberOfLines={1}>{docName}</Text>
                  <TouchableOpacity onPress={() => { setDocBase64(undefined); setDocName(undefined); setDocMime(undefined); }}>
                    <Feather name="x" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[m.pickBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                  onPress={pickPhoto}
                  activeOpacity={0.7}
                >
                  <Feather name="upload" size={18} color={colors.primary} />
                  <Text style={[m.pickBtnText, { color: colors.primary }]}>Upload Photo of Application</Text>
                </TouchableOpacity>
              )}

              {error ? (
                <View style={[m.errorBox, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive }]}>
                  <Feather name="alert-circle" size={14} color={colors.destructive} />
                  <Text style={[m.errorText, { color: colors.destructive }]}>{error}</Text>
                </View>
              ) : null}
            </ScrollView>
          )}

          {existingRequest?.status !== 'pending' && (
            <TouchableOpacity
              style={[m.submitBtn, {
                backgroundColor: submitting ? colors.muted : colors.primary,
                opacity: submitting ? 0.7 : 1,
              }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Feather name="send" size={16} color="#fff" />
              <Text style={m.submitBtnText}>{submitting ? 'Submitting...' : 'Send to Admin for Approval'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const mStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', minHeight: '70%', paddingBottom: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  lockIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 1 },
  closeBtn: { padding: 4 },
  notice: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'flex-start' },
  noticeText: { fontSize: 13, flex: 1, lineHeight: 18 },
  body: { paddingHorizontal: 16, maxHeight: 350 },
  infoBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, marginBottom: 16, alignItems: 'flex-start' },
  infoText: { fontSize: 13, flex: 1, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 90, marginBottom: 16 },
  docPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  docName: { flex: 1, fontSize: 13 },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center', marginBottom: 16 },
  pickBtnText: { fontSize: 14, fontWeight: '600' },
  errorBox: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 8, alignItems: 'flex-start' },
  errorText: { fontSize: 13, flex: 1 },
  submitBtn: { marginHorizontal: 16, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 16 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TeacherAttendance() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { students, classes, attendanceRecords, addAttendance, inactivationRequests, submitInactivationRequest } = useApp();

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, Status | undefined>>({});
  const [view, setView] = useState<'take' | 'report'>('take');
  const [filterReportClass, setFilterReportClass] = useState('All');
  const [reportRange, setReportRange] = useState<ReportRange>('all');
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [detailStudent, setDetailStudent] = useState<{ id: string; name: string; cls: string } | null>(null);

  // Inactivation request modal
  const [inactiveModalStudent, setInactiveModalStudent] = useState<typeof classStudents[0] | null>(null);
  const [inactiveModalVisible, setInactiveModalVisible] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  // Split active vs inactive students in the selected class
  const classStudents = useMemo(
    () => students
      .filter(s => s.class === selectedClass && !isGraduatedStudent(s))
      .sort(compareStudentRollNumbers),
    [students, selectedClass],
  );
  const activeStudents = useMemo(() => classStudents.filter(s => (s.status ?? 'active') === 'active'), [classStudents]);
  const inactiveStudents = useMemo(() => classStudents.filter(s => s.status === 'inactive'), [classStudents]);

  const existingAttendance = useMemo(() => {
    if (!selectedClass || !selectedDate) return [];
    return attendanceRecords.filter(a => a.class === selectedClass && a.date === selectedDate);
  }, [attendanceRecords, selectedClass, selectedDate]);

  const alreadySubmitted = existingAttendance.length > 0;
  const takenByTeacher = existingAttendance[0]?.takenBy ?? '';

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    setSubmitSuccess(false);
    setSubmitError('');
    setRequestSuccess(null);
    const studs = students
      .filter(s => s.class === cls && (s.status ?? 'active') === 'active')
      .sort(compareStudentRollNumbers);
    const existing = attendanceRecords.filter(a => a.class === cls && a.date === selectedDate);
    const init: Record<string, Status | undefined> = {};
    if (existing.length > 0) {
      studs.forEach(s => {
        const status = existing.find(e => e.studentId === s.id)?.status;
        init[s.id] = status === 'inactive' ? undefined : status;
      });
    } else {
      studs.forEach(s => { init[s.id] = undefined; });
    }
    setAttendance(init);
  };

  const setStatus = async (studentId: string, status: Status) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  };

  const markAll = async (status: Status) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const all: Record<string, Status> = {};
    activeStudents.forEach(s => { all[s.id] = status; });
    setAttendance(all);
  };

  const handleSubmit = async () => {
    if (!selectedClass) { setSubmitError('Please select a class first.'); return; }
    if (activeStudents.length === 0 && inactiveStudents.length === 0) {
      setSubmitError('No students found in this class.');
      return;
    }
    if (activeStudents.length === 0) {
      setSubmitError('All students in this class are inactive. No attendance to submit.');
      return;
    }

    const pending = activeStudents.filter(s => !attendance[s.id]);
    if (pending.length > 0) {
      setSubmitError(`${pending.length} student${pending.length > 1 ? 's' : ''} still need${pending.length === 1 ? 's' : ''} to be marked: ${pending.map(p => p.name).join(', ')}`);
      return;
    }

    if (alreadySubmitted) {
      setSubmitError(`Attendance for ${selectedClass} on ${selectedDate} was already submitted by ${takenByTeacher}. It cannot be edited or resubmitted.`);
      return;
    }

    setSubmitError('');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const records = activeStudents.map(s => ({
      studentId: s.id,
      studentName: s.name,
      class: s.class,
      date: selectedDate,
      status: attendance[s.id] as Status,
      takenBy: user?.name ?? 'Teacher',
    }));
    addAttendance(records);
    setSubmitSuccess(true);
    setSelectedClass('');
    setAttendance({});
  };

  const handleTapInactiveStudent = async (student: typeof classStudents[0]) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setInactiveModalStudent(student);
    setInactiveModalVisible(true);
  };

  const handleSubmitReactivationRequest = async (data: {
    reason: string;
    documentBase64?: string;
    documentName?: string;
    documentMimeType?: string;
  }) => {
    if (!inactiveModalStudent || !user) throw new Error('No student selected');
    await submitInactivationRequest({
      studentId: inactiveModalStudent.id,
      studentName: inactiveModalStudent.name,
      studentClass: inactiveModalStudent.class,
      teacherId: user.id,
      teacherName: user.name,
      ...data,
    });
    setInactiveModalVisible(false);
    setInactiveModalStudent(null);
    setRequestSuccess(`Reactivation request for ${inactiveModalStudent.name} sent to admin.`);
  };

  const reportRecords = useMemo(() => {
    let records = attendanceRecords;
    if (filterReportClass !== 'All') records = records.filter(a => a.class === filterReportClass);
    if (reportRange === 'monthly') {
      records = records.filter(a => a.date.startsWith(reportMonth));
    } else if (reportRange === 'yearly') {
      records = records.filter(a => a.date.startsWith(reportYear));
    } else if (reportRange === 'custom') {
      const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!validDate(customStartDate) || !validDate(customEndDate) || customStartDate > customEndDate) return [];
      records = records.filter(a => a.date >= customStartDate && a.date <= customEndDate);
    }
    return [...records].sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, filterReportClass, reportRange, reportMonth, reportYear, customStartDate, customEndDate]);

  const customRangeValid = /^\d{4}-\d{2}-\d{2}$/.test(customStartDate)
    && /^\d{4}-\d{2}-\d{2}$/.test(customEndDate)
    && customStartDate <= customEndDate;

  const pendingCount = activeStudents.filter(s => !attendance[s.id]).length;

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 12 : insets.top;
  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 12;

  // Find existing pending request for the inactive modal student
  const existingRequestForModal = inactiveModalStudent
    ? inactivationRequests
        .filter(r => r.studentId === inactiveModalStudent.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    : undefined;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Reactivation Request Modal */}
      {inactiveModalStudent && (
        <ReactivationModal
          visible={inactiveModalVisible}
          student={inactiveModalStudent}
          teacherId={user?.id ?? ''}
          teacherName={user?.name ?? ''}
          existingRequest={existingRequestForModal}
          onClose={() => { setInactiveModalVisible(false); setInactiveModalStudent(null); }}
          onSubmit={handleSubmitReactivationRequest}
        />
      )}

      <View style={[s.headerTop, { paddingTop: topPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
          <Feather name="arrow-left" size={24} color={colors.cardForeground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.cardForeground }]}>Attendance</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Switcher */}
      <View style={[s.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(['take', 'report'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, view === t && { borderBottomColor: colors.primary }]} onPress={() => setView(t)}>
            <Text style={[s.tabText, { color: view === t ? colors.primary : colors.mutedForeground }]}>
              {t === 'take' ? 'Take Attendance' : 'View Reports'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === 'take' ? (
        <>
          <View style={[s.controls, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[s.controlLabel, { color: colors.text }]}>Class</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {classes.map(cls => (
                <TouchableOpacity key={cls} style={[s.classChip, selectedClass === cls && { backgroundColor: colors.primary }]} onPress={() => handleSelectClass(cls)} activeOpacity={0.8}>
                  <Text style={[s.classChipText, selectedClass === cls && { color: '#fff' }]}>{cls}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[s.controlLabel, { color: colors.text, marginBottom: 0 }]}>Date: {selectedDate}</Text>
              {selectedClass && activeStudents.length > 0 && (
                <Text style={{ fontSize: 13, fontWeight: '600', color: pendingCount === 0 ? colors.success : colors.warning }}>
                  {pendingCount === 0 ? 'All marked' : `${pendingCount} pending`}
                </Text>
              )}
            </View>

            {/* Inactive students count badge */}
            {selectedClass && inactiveStudents.length > 0 && (
              <View style={[s.inactiveBanner, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '40' }]}>
                <Feather name="lock" size={13} color={colors.destructive} />
                <Text style={[s.inactiveBannerText, { color: colors.destructive }]}>
                  {inactiveStudents.length} inactive student{inactiveStudents.length > 1 ? 's' : ''} — tap to request reactivation
                </Text>
              </View>
            )}

            {submitSuccess && (
              <View style={[s.alreadyBanner, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                <Feather name="check-circle" size={14} color={colors.success} />
                <Text style={[s.alreadyText, { color: colors.success }]}>Attendance submitted successfully!</Text>
              </View>
            )}
            {requestSuccess && (
              <View style={[s.alreadyBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
                <Feather name="send" size={14} color={colors.primary} />
                <Text style={[s.alreadyText, { color: colors.primary }]}>{requestSuccess}</Text>
              </View>
            )}
            {submitError ? (
              <View style={[s.alreadyBanner, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive }]}>
                <Feather name="alert-circle" size={14} color={colors.destructive} />
                <Text style={[s.alreadyText, { color: colors.destructive }]}>{submitError}</Text>
              </View>
            ) : null}
            {alreadySubmitted && !submitSuccess && (
              <View style={[s.alreadyBanner, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive }]}>
                <Feather name="lock" size={14} color={colors.destructive} />
                <Text style={[s.alreadyText, { color: colors.destructive }]}>
                  Attendance already submitted by {takenByTeacher}. Cannot be edited or resubmitted.
                </Text>
              </View>
            )}

            {selectedClass && activeStudents.length > 0 && !alreadySubmitted && (
              <View style={s.markAllBtns}>
                <TouchableOpacity style={[s.markBtn, { backgroundColor: colors.success + '20' }]} onPress={() => markAll('present')} activeOpacity={0.8}>
                  <Text style={[s.markBtnText, { color: colors.success }]}>All P</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.markBtn, { backgroundColor: colors.destructive + '20' }]} onPress={() => markAll('absent')} activeOpacity={0.8}>
                  <Text style={[s.markBtnText, { color: colors.destructive }]}>All A</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.markBtn, { backgroundColor: colors.warning + '20' }]} onPress={() => markAll('holiday')} activeOpacity={0.8}>
                  <Text style={[s.markBtnText, { color: colors.warning }]}>Holiday</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {!selectedClass ? (
            <EmptyState icon="calendar" title="Select a Class" subtitle="Choose a class above to take attendance" />
          ) : classStudents.length === 0 ? (
            <EmptyState icon="users" title="No Students" subtitle={`No students found in ${selectedClass}`} />
          ) : (
            <>
              <FlatList
                data={[...activeStudents, ...inactiveStudents]}
                keyExtractor={i => i.id}
                contentContainerStyle={{ padding: 16, paddingBottom: botPad + 80 }}
                renderItem={({ item: student }) => {
                  const isInactive = student.status === 'inactive';

                  if (isInactive) {
                    // Check for existing pending request
                    const hasPending = inactivationRequests.some(
                      r => r.studentId === student.id && r.status === 'pending'
                    );
                    return (
                      <TouchableOpacity
                        style={[sc.card, { backgroundColor: colors.card, opacity: 0.75 }]}
                        onPress={() => handleTapInactiveStudent(student)}
                        activeOpacity={0.75}
                      >
                        <View style={[sc.avatar, { backgroundColor: colors.destructive + '15' }]}>
                          <Text style={[sc.avatarText, { color: colors.destructive }]}>{student.rollNumber}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[sc.name, { color: colors.mutedForeground }]}>{student.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Feather name="lock" size={11} color={colors.destructive} />
                            <Text style={{ fontSize: 11, color: colors.destructive, fontWeight: '600' }}>
                              {hasPending ? 'Request Pending' : 'Inactive — Tap to Request Reactivation'}
                            </Text>
                          </View>
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    );
                  }

                  const status = attendance[student.id];
                  return (
                    <View style={[sc.card, { backgroundColor: colors.card }]}>
                      <View style={[sc.avatar, { backgroundColor: colors.muted }]}>
                        <Text style={[sc.avatarText, { color: colors.mutedForeground }]}>{student.rollNumber}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[sc.name, { color: colors.text }]}>{student.name}</Text>
                      </View>
                      <View style={[sc.btnGroup, alreadySubmitted && { opacity: 0.45 }]}>
                        <TouchableOpacity
                          style={[sc.statusBtn, { backgroundColor: status === 'present' ? colors.success : colors.muted }]}
                          onPress={() => !alreadySubmitted && setStatus(student.id, 'present')}
                          disabled={alreadySubmitted}
                        >
                          <Text style={[sc.statusText, { color: status === 'present' ? '#fff' : colors.mutedForeground }]}>P</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[sc.statusBtn, { backgroundColor: status === 'absent' ? colors.destructive : colors.muted }]}
                          onPress={() => !alreadySubmitted && setStatus(student.id, 'absent')}
                          disabled={alreadySubmitted}
                        >
                          <Text style={[sc.statusText, { color: status === 'absent' ? '#fff' : colors.mutedForeground }]}>A</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[sc.statusBtn, { backgroundColor: status === 'holiday' ? colors.warning : colors.muted }]}
                          onPress={() => !alreadySubmitted && setStatus(student.id, 'holiday')}
                          disabled={alreadySubmitted}
                        >
                          <Text style={[sc.statusText, { color: status === 'holiday' ? '#fff' : colors.mutedForeground }]}>H</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
              />
              {activeStudents.length > 0 && (
                <View style={[s.submitBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: botPad }]}>
                  {alreadySubmitted ? (
                    <View style={[s.submitBtn, { backgroundColor: colors.muted, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
                      <Feather name="lock" size={18} color={colors.mutedForeground} />
                      <Text style={[s.submitBtnText, { color: colors.mutedForeground }]}>Attendance Locked</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[s.submitBtn, { backgroundColor: pendingCount === 0 ? colors.primary : colors.warning }]}
                      onPress={handleSubmit}
                      activeOpacity={0.85}
                    >
                      <Feather name="send" size={18} color="#fff" />
                      <Text style={[s.submitBtnText, { color: '#fff' }]}>
                        {pendingCount === 0 ? 'Submit Attendance' : `Submit (${pendingCount} pending)`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <View style={[s.controls, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[s.reportLabel, { color: colors.mutedForeground }]}>Attendance Period</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {([
                ['all', 'All Time'],
                ['monthly', 'Monthly'],
                ['yearly', 'Yearly'],
                ['custom', 'Custom Dates'],
              ] as const).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[s.classChip, reportRange === value && { backgroundColor: colors.primary }]}
                  onPress={() => setReportRange(value)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.classChipText, reportRange === value && { color: '#fff' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {reportRange === 'monthly' && (
              <View style={s.reportDateField}>
                <Text style={[s.reportDateLabel, { color: colors.mutedForeground }]}>Month (YYYY-MM)</Text>
                <TextInput
                  value={reportMonth}
                  onChangeText={setReportMonth}
                  placeholder="2026-08"
                  placeholderTextColor={colors.mutedForeground}
                  style={[s.reportDateInput, { backgroundColor: colors.muted, color: colors.text }]}
                  autoCapitalize="none"
                />
              </View>
            )}

            {reportRange === 'yearly' && (
              <View style={s.reportDateField}>
                <Text style={[s.reportDateLabel, { color: colors.mutedForeground }]}>Year (YYYY)</Text>
                <TextInput
                  value={reportYear}
                  onChangeText={setReportYear}
                  placeholder="2026"
                  placeholderTextColor={colors.mutedForeground}
                  style={[s.reportDateInput, { backgroundColor: colors.muted, color: colors.text }]}
                  keyboardType="number-pad"
                />
              </View>
            )}

            {reportRange === 'custom' && (
              <View style={s.customDateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.reportDateLabel, { color: colors.mutedForeground }]}>From (YYYY-MM-DD)</Text>
                  <TextInput
                    value={customStartDate}
                    onChangeText={setCustomStartDate}
                    placeholder="2026-08-01"
                    placeholderTextColor={colors.mutedForeground}
                    style={[s.reportDateInput, { backgroundColor: colors.muted, color: colors.text }]}
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.reportDateLabel, { color: colors.mutedForeground }]}>To (YYYY-MM-DD)</Text>
                  <TextInput
                    value={customEndDate}
                    onChangeText={setCustomEndDate}
                    placeholder="2026-08-31"
                    placeholderTextColor={colors.mutedForeground}
                    style={[s.reportDateInput, { backgroundColor: colors.muted, color: colors.text }]}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            )}

            {reportRange === 'custom' && !customRangeValid && (
              <Text style={[s.rangeError, { color: colors.destructive }]}>
                Enter dates as YYYY-MM-DD with the start date before the end date.
              </Text>
            )}

            <Text style={[s.reportLabel, { color: colors.mutedForeground, marginTop: 4 }]}>Class</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {['All', ...classes].map(cls => (
                <TouchableOpacity key={cls} style={[s.classChip, filterReportClass === cls && { backgroundColor: colors.primary }]} onPress={() => setFilterReportClass(cls)} activeOpacity={0.8}>
                  <Text style={[s.classChipText, filterReportClass === cls && { color: '#fff' }]}>{cls}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <FlatList
            data={reportRecords}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
            ListEmptyComponent={<EmptyState icon="calendar" title="No Records" subtitle="No attendance records found" />}
            renderItem={({ item }) => {
              let color = colors.success;
              if (item.status === 'absent') color = colors.destructive;
              else if (item.status === 'holiday') color = colors.warning;
              return (
                <TouchableOpacity
                  style={[rp.row, { backgroundColor: colors.card }]}
                  onPress={() => setDetailStudent({ id: item.studentId, name: item.studentName, cls: item.class })}
                  activeOpacity={0.75}
                >
                  <View style={[rp.dateBadge, { backgroundColor: colors.secondary }]}>
                    <Text style={[rp.dateText, { color: colors.primary }]}>{item.date.split('-').slice(1).join('/')}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[rp.stuName, { color: colors.text }]}>{item.studentName}</Text>
                    <Text style={[rp.meta, { color: colors.mutedForeground }]}>{item.class} · By {item.takenBy}</Text>
                  </View>
                  <View style={[rp.statusBadge, { backgroundColor: color + '20' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: color }}>
                      {item.status.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}

      {detailStudent && (
        <AttendanceDetailModal
          visible={!!detailStudent}
          studentId={detailStudent.id}
          studentName={detailStudent.name}
          studentClass={detailStudent.cls}
          allRecords={reportRecords}
          onClose={() => setDetailStudent(null)}
          colors={colors}
        />
      )}
    </View>
  );
}

const sc = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 8, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600' },
  btnGroup: { flexDirection: 'row', gap: 6 },
  statusBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: 14, fontWeight: '700' },
});
const rp = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 8, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  dateBadge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 12, fontWeight: '700' },
  stuName: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  statusBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  headerTop: { backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '700' },
  controls: { padding: 16, borderBottomWidth: 1 },
  reportLabel: { fontSize: 11, fontWeight: '700', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 },
  reportDateField: { marginBottom: 12 },
  reportDateLabel: { fontSize: 11, fontWeight: '600', marginBottom: 5 },
  reportDateInput: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 14 },
  customDateRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  rangeError: { fontSize: 12, marginTop: -4, marginBottom: 10 },
  controlLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  classChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.muted, marginRight: 8 },
  classChipText: { fontSize: 13, fontWeight: '600', color: c.mutedForeground },
  inactiveBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, borderWidth: 1, marginTop: 8 },
  inactiveBannerText: { fontSize: 12, fontWeight: '600', flex: 1 },
  alreadyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  alreadyText: { fontSize: 12, flex: 1 },
  markAllBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  markBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  markBtnText: { fontSize: 13, fontWeight: '700' },
  submitBar: { padding: 16, borderTopWidth: 1, position: 'absolute', bottom: 0, left: 0, right: 0 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 16 },
  submitBtnText: { fontSize: 16, fontWeight: '700' },
});
