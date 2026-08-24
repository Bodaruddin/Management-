import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, ScrollView, Alert, Platform, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import {
  useApp, Student, getStudentFeeInfo, isActiveStudent, compareStudentRollNumbers,
  STUDENT_CASTE_OPTIONS, STUDENT_GENDER_OPTIONS,
} from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';
import PremiumAlert from '@/components/PremiumAlert';

// ── Helpers ──────────────────────────────────────────────────────────────────
function calcFinalPayable(annualFee: string, discountType: 'fixed' | 'percent', discountValue: string) {
  const fee = Number(annualFee) || 0;
  const disc = Number(discountValue) || 0;
  if (fee === 0) return 0;
  const discAmt = discountType === 'percent' ? Math.round((fee * disc) / 100) : disc;
  return Math.max(0, fee - discAmt);
}

function genAdmissionNo(count: number): string {
  const year = new Date().getFullYear();
  return `ADM${year}${String(count).padStart(4, '0')}`;
}

const STATUS_COLORS: Record<string, string> = {
  paid: '#10B981', partial: '#F59E0B', pending: '#EF4444', 'no-fee': '#94A3B8',
};
const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid', partial: 'Partial', pending: 'Pending', 'no-fee': 'No Fee',
};

// ── Blank form ────────────────────────────────────────────────────────────────
const BLANK_FORM = {
  name: '', fatherName: '', motherName: '', mobileNumber: '', class: '',
  section: '', admissionNo: '',
  rollNumber: '', dateOfBirth: '', address: '', photo: '' as string,
  gender: '', caste: '',
  annualFee: '', discountType: 'fixed' as 'fixed' | 'percent', discountValue: '',
};

// ── StyleSheets ───────────────────────────────────────────────────────────────
const cardStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  avatarImage: { width: '100%' as any, height: '100%' as any },
  name: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  sub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardBottom: { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
  detail: { fontSize: 13, color: '#475569' },
  detailLabel: { fontWeight: '600', color: '#1E293B' },
  feeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, gap: 8 },
  feeLabel: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
  feeVal: { fontSize: 13, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' as any, minHeight: '70%' as any },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { padding: 20 },
  photoUpload: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoUploadText: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  photoImage: { width: '100%' as any, height: '100%' as any },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  inputReadonly: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, opacity: 0.7 },
  picker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  classOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  classOptionText: { fontSize: 15 },
  feeSection: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16 },
  feeSectionTitle: { fontSize: 15, fontWeight: '700' },
  discBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  feeCalc: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginTop: 4 },
  feeCalcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
});

const feeDetailStyles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 12 },
  histIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

const attStyles = StyleSheet.create({
  statBox: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
});

const secMgrStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  name: { flex: 1, fontSize: 15 },
  addRow: { flexDirection: 'row', padding: 16, gap: 10, borderTopWidth: 1 },
  addInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  editInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 },
});

// ── Component ─────────────────────────────────────────────────────────────────
export default function StudentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    students, classes, sections, feeRecords, attendanceRecords,
    addStudent, updateStudent, deleteStudent,
    addSection, updateSection, deleteSection,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [classSearch, setClassSearch] = useState('');
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showCastePicker, setShowCastePicker] = useState(false);
  const [showSectionsMgr, setShowSectionsMgr] = useState(false);
  // When sections manager is opened from within the student form we
  // temporarily dismiss the form so the two modals don't stack (stacked
  // modals on mobile swallow touch events on the top layer).
  const [formPausedForSections, setFormPausedForSections] = useState(false);
  const [showAttendance, setShowAttendance] = useState<Student | null>(null);
  const [showFeeDetail, setShowFeeDetail] = useState<Student | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Student | null>(null);
  const [showValidationAlert, setShowValidationAlert] = useState(false);

  // Section manager state
  const [newSectionName, setNewSectionName] = useState('');
  const [editingSectionName, setEditingSectionName] = useState<string | null>(null);
  const [editingSectionValue, setEditingSectionValue] = useState('');
  const [sectionLoading, setSectionLoading] = useState(false);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);

  const filtered = useMemo(() =>
    students
      .filter(s =>
        isActiveStudent(s) &&
        (filterClass === 'All' || s.class === filterClass) &&
        (s.name.toLowerCase().includes(search.toLowerCase()) ||
         s.rollNumber.includes(search) ||
         s.fatherName.toLowerCase().includes(search.toLowerCase()) ||
         (s.admissionNo ?? '').toLowerCase().includes(search.toLowerCase()))
      )
      .sort((a, b) => {
        if (filterClass === 'All') {
          return a.class.localeCompare(b.class, undefined, { numeric: true, sensitivity: 'base' })
            || compareStudentRollNumbers(a, b);
        }
        return compareStudentRollNumbers(a, b);
      }), [students, filterClass, search]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...BLANK_FORM, admissionNo: genAdmissionNo(students.length + 1) });
    setShowModal(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      name: s.name, fatherName: s.fatherName, motherName: s.motherName || '',
      mobileNumber: s.mobileNumber, class: s.class, section: s.section || '',
      admissionNo: s.admissionNo || '', rollNumber: s.rollNumber,
      dateOfBirth: s.dateOfBirth || '', address: s.address || '', photo: s.photo || '',
      gender: s.gender || '', caste: s.caste || '',
      annualFee: s.annualFee ? String(s.annualFee) : '',
      discountType: s.discountType ?? 'fixed',
      discountValue: s.discountValue ? String(s.discountValue) : '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.fatherName.trim() || !form.class || !form.rollNumber.trim()) {
      setShowValidationAlert(true);
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const annualFeeNum = form.annualFee ? Number(form.annualFee) : undefined;
    const studentData: Omit<Student, 'id'> = {
      name: form.name.trim(), fatherName: form.fatherName.trim(),
      motherName: form.motherName.trim(), mobileNumber: form.mobileNumber.trim(),
      class: form.class, section: form.section || undefined,
      admissionNo: form.admissionNo || undefined,
      rollNumber: form.rollNumber.trim(),
      dateOfBirth: form.dateOfBirth, address: form.address || undefined,
      photo: form.photo || undefined,
      gender: form.gender || undefined,
      caste: form.caste || undefined,
      annualFee: annualFeeNum,
      discountType: annualFeeNum ? form.discountType : undefined,
      discountValue: (annualFeeNum && form.discountValue) ? Number(form.discountValue) : undefined,
    };
    if (editing) updateStudent(editing.id, studentData);
    else addStudent(studentData);
    setShowModal(false);
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setForm(prev => ({ ...prev, photo: 'data:image/jpeg;base64,' + result.assets[0].base64 }));
    }
  };

  const getStudentAttendance = (studentId: string) => {
    const records = attendanceRecords.filter(a => a.studentId === studentId);
    return {
      total: records.length,
      present: records.filter(a => a.status === 'present').length,
      absent: records.filter(a => a.status === 'absent').length,
      holiday: records.filter(a => a.status === 'holiday').length,
        inactive: records.filter(a => a.status === 'inactive').length,
    };
  };

  // Section manager actions
  const handleAddSection = async () => {
    if (!newSectionName.trim()) return;
    setSectionLoading(true);
    try {
      await addSection(newSectionName.trim());
      setNewSectionName('');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to add section');
    } finally {
      setSectionLoading(false);
    }
  };

  const handleUpdateSection = async (oldName: string) => {
    if (!editingSectionValue.trim()) return;
    setSectionLoading(true);
    try {
      await updateSection(oldName, editingSectionValue.trim());
      setForm(prev => prev.section === oldName ? { ...prev, section: editingSectionValue.trim() } : prev);
      setEditingSectionName(null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to update section');
    } finally {
      setSectionLoading(false);
    }
  };

  const handleDeleteSection = async () => {
    if (!confirmDeleteSection) return;
    const name = confirmDeleteSection;
    setSectionLoading(true);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await deleteSection(name);
      setForm(prev => prev.section === name ? { ...prev, section: '' } : prev);
      setConfirmDeleteSection(null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to delete section');
    } finally {
      setSectionLoading(false);
    }
  };

  const finalPayable = calcFinalPayable(form.annualFee, form.discountType, form.discountValue);
  const discountDisplay = form.discountType === 'percent'
    ? `${form.discountValue || 0}% = ₹${Math.round((Number(form.annualFee) || 0) * (Number(form.discountValue) || 0) / 100).toLocaleString('en-IN')}`
    : `₹${Number(form.discountValue || 0).toLocaleString('en-IN')}`;

  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Search + Filter */}
      <View style={[topBarSt.topBar, { backgroundColor: colors.card }]}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <View style={[topBarSt.searchWrap, { backgroundColor: colors.muted }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={{ flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text }}
              placeholder="Search students..."
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity>}
          </View>
          {/* Manage Sections button */}
          <TouchableOpacity
            style={[topBarSt.iconBtn, { backgroundColor: colors.secondary }]}
            onPress={() => setShowSectionsMgr(true)}
            activeOpacity={0.8}
          >
            <Feather name="layers" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[topBarSt.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd} activeOpacity={0.8}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          {['All', ...classes].map(cls => (
            <TouchableOpacity
              key={cls}
              style={[topBarSt.chip, filterClass === cls && { backgroundColor: colors.primary }]}
              onPress={() => setFilterClass(cls)} activeOpacity={0.8}
            >
              <Text style={[topBarSt.chipText, { color: filterClass === cls ? '#fff' : colors.mutedForeground }]}>{cls}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{filtered.length} student{filtered.length !== 1 ? 's' : ''}</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="users" title="No Students Found" subtitle={search ? 'Try a different search' : 'Tap + to add students'} onAction={openAdd} actionLabel="Add Student" />}
        renderItem={({ item: st }) => {
          const fi = getStudentFeeInfo(st, feeRecords);
          const statusColor = STATUS_COLORS[fi.status] ?? '#94A3B8';
          const classSection = [st.class, st.section].filter(Boolean).join(' · ');
          return (
            <View style={cardStyles.card}>
              <View style={cardStyles.cardTop}>
                <View style={[cardStyles.avatar, { backgroundColor: colors.secondary }]}>
                  {st.photo
                    ? <Image source={{ uri: st.photo }} style={cardStyles.avatarImage} />
                    : <Text style={[cardStyles.avatarText, { color: colors.primary }]}>{st.name.charAt(0).toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={cardStyles.name}>{st.name}</Text>
                  <Text style={cardStyles.sub}>{classSection} • Roll: {st.rollNumber}</Text>
                  {st.admissionNo ? <Text style={[cardStyles.sub, { color: colors.primary, fontWeight: '600' }]}>Adm: {st.admissionNo}</Text> : null}
                </View>
                <View style={cardStyles.actions}>
                  <TouchableOpacity onPress={() => setShowAttendance(st)} style={[cardStyles.actionBtn, { backgroundColor: colors.info + '15' }]}>
                    <Feather name="calendar" size={15} color={colors.info} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEdit(st)} style={[cardStyles.actionBtn, { backgroundColor: colors.primary + '15' }]}>
                    <Feather name="edit-2" size={15} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmDelete(st)} style={[cardStyles.actionBtn, { backgroundColor: colors.destructive + '15' }]}>
                    <Feather name="trash-2" size={15} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[cardStyles.cardBottom, { borderTopColor: colors.border }]}>
                <Text style={cardStyles.detail}><Text style={cardStyles.detailLabel}>Father: </Text>{st.fatherName}</Text>
                <Text style={cardStyles.detail}><Text style={cardStyles.detailLabel}>Mobile: </Text>{st.mobileNumber}</Text>
              </View>
              {fi.annualFee > 0 && (
                <TouchableOpacity
                  style={[cardStyles.feeRow, { borderTopColor: colors.border }]}
                  onPress={() => setShowFeeDetail(st)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1, flexDirection: 'row', gap: 16 }}>
                    <View>
                      <Text style={[cardStyles.feeLabel, { color: colors.mutedForeground }]}>PAYABLE</Text>
                      <Text style={[cardStyles.feeVal, { color: colors.text }]}>₹{fi.finalPayable.toLocaleString('en-IN')}</Text>
                    </View>
                    <View>
                      <Text style={[cardStyles.feeLabel, { color: colors.mutedForeground }]}>PAID</Text>
                      <Text style={[cardStyles.feeVal, { color: colors.success }]}>₹{fi.totalPaid.toLocaleString('en-IN')}</Text>
                    </View>
                    <View>
                      <Text style={[cardStyles.feeLabel, { color: colors.mutedForeground }]}>BALANCE</Text>
                      <Text style={[cardStyles.feeVal, { color: fi.remaining > 0 ? colors.destructive : colors.success }]}>₹{fi.remaining.toLocaleString('en-IN')}</Text>
                    </View>
                  </View>
                  <View style={[cardStyles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                    <Text style={[cardStyles.statusText, { color: statusColor }]}>{STATUS_LABEL[fi.status]}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* ══ Add/Edit Student Modal ══ */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card }]}>
            <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
              <Text style={[modalStyles.title, { color: colors.text }]}>{editing ? 'Edit Student' : 'Add Student'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Feather name="x" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={modalStyles.body} keyboardShouldPersistTaps="handled">
              {/* Photo */}
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <TouchableOpacity style={[modalStyles.photoUpload, { backgroundColor: colors.secondary }]} onPress={handlePickImage}>
                  {form.photo
                    ? <Image source={{ uri: form.photo }} style={modalStyles.photoImage} />
                    : <><Feather name="camera" size={24} color={colors.primary} /><Text style={[modalStyles.photoUploadText, { color: colors.primary }]}>Upload Photo</Text></>}
                </TouchableOpacity>
              </View>

              {/* Admission No — read-only */}
              <View style={modalStyles.fieldGroup}>
                <Text style={[modalStyles.label, { color: colors.text }]}>Admission No <Text style={{ fontWeight: '400', color: colors.mutedForeground }}>(auto-generated)</Text></Text>
                <View style={[modalStyles.inputReadonly, { backgroundColor: colors.muted, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <Feather name="hash" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 15, color: colors.primary, fontWeight: '700', letterSpacing: 0.5 }}>
                    {form.admissionNo || '—'}
                  </Text>
                </View>
              </View>

              {/* Standard fields */}
              {([
                { key: 'name', label: 'Student Name *', placeholder: 'Full name' },
                { key: 'fatherName', label: "Father's Name *", placeholder: "Father's full name" },
                { key: 'motherName', label: "Mother's Name", placeholder: "Mother's full name" },
                { key: 'mobileNumber', label: 'Mobile Number', placeholder: '10-digit number', keyboardType: 'phone-pad' as const },
                { key: 'rollNumber', label: 'Roll Number *', placeholder: 'Class roll number', keyboardType: 'number-pad' as const },
                { key: 'dateOfBirth', label: 'Date of Birth', placeholder: 'DD-MM-YYYY' },
                { key: 'address', label: 'Address', placeholder: 'Full residential address' },
              ] as { key: string; label: string; placeholder: string; keyboardType?: any }[]).map(field => (
                <View key={field.key} style={modalStyles.fieldGroup}>
                  <Text style={[modalStyles.label, { color: colors.text }]}>{field.label}</Text>
                  <TextInput
                    style={[modalStyles.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                    value={(form as any)[field.key]}
                    onChangeText={v => setForm(prev => ({ ...prev, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={field.keyboardType}
                  />
                </View>
              ))}

              {/* Gender Picker */}
              <View style={modalStyles.fieldGroup}>
                <Text style={[modalStyles.label, { color: colors.text }]}>Gender</Text>
                <TouchableOpacity
                  style={[modalStyles.input, modalStyles.picker, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  onPress={() => setShowGenderPicker(true)}
                >
                  <Text style={{ color: form.gender ? colors.text : colors.mutedForeground }}>{form.gender || 'Select gender...'}</Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Caste Picker */}
              <View style={modalStyles.fieldGroup}>
                <Text style={[modalStyles.label, { color: colors.text }]}>Caste</Text>
                <TouchableOpacity
                  style={[modalStyles.input, modalStyles.picker, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  onPress={() => setShowCastePicker(true)}
                >
                  <Text style={{ color: form.caste ? colors.text : colors.mutedForeground }}>{form.caste || 'Select caste...'}</Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Class Picker */}
              <View style={modalStyles.fieldGroup}>
                <Text style={[modalStyles.label, { color: colors.text }]}>Class *</Text>
                <TouchableOpacity
                  style={[modalStyles.input, modalStyles.picker, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  onPress={() => { setClassSearch(''); setShowClassPicker(true); }}
                >
                  <Text style={{ color: form.class ? colors.text : colors.mutedForeground }}>{form.class || 'Select class...'}</Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Section Picker */}
              <View style={modalStyles.fieldGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[modalStyles.label, { color: colors.text, marginBottom: 0 }]}>Section</Text>
                  <TouchableOpacity onPress={() => {
                    // Dismiss the student form first so modals don't stack
                    setShowModal(false);
                    setFormPausedForSections(true);
                    // Small delay lets the first modal animate out before the second opens
                    setTimeout(() => setShowSectionsMgr(true), 350);
                  }}>
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Manage Sections</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[modalStyles.input, modalStyles.picker, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  onPress={() => setShowSectionPicker(true)}
                >
                  <Text style={{ color: form.section ? colors.text : colors.mutedForeground }}>{form.section || 'Select section...'}</Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Fee Details */}
              <View style={[modalStyles.feeSection, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Feather name="dollar-sign" size={16} color={colors.primary} />
                  <Text style={[modalStyles.feeSectionTitle, { color: colors.text }]}>Fee Details</Text>
                </View>
                <View style={modalStyles.fieldGroup}>
                  <Text style={[modalStyles.label, { color: colors.text }]}>Annual Fee (₹)</Text>
                  <TextInput
                    style={[modalStyles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                    value={form.annualFee}
                    onChangeText={v => setForm(prev => ({ ...prev, annualFee: v }))}
                    placeholder="e.g. 10000"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                  />
                </View>
                {Number(form.annualFee) > 0 && (
                  <>
                    <Text style={[modalStyles.label, { color: colors.text }]}>Discount Type</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                      {(['fixed', 'percent'] as const).map(t => (
                        <TouchableOpacity
                          key={t}
                          style={[modalStyles.discBtn, { borderColor: form.discountType === t ? colors.primary : colors.border, backgroundColor: form.discountType === t ? colors.primary + '15' : colors.card }]}
                          onPress={() => setForm(prev => ({ ...prev, discountType: t }))}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: form.discountType === t ? colors.primary : colors.mutedForeground }}>
                            {t === 'fixed' ? '₹ Fixed Amount' : '% Percentage'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={modalStyles.fieldGroup}>
                      <Text style={[modalStyles.label, { color: colors.text }]}>Discount {form.discountType === 'percent' ? '(%)' : '(₹)'}</Text>
                      <TextInput
                        style={[modalStyles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                        value={form.discountValue}
                        onChangeText={v => setForm(prev => ({ ...prev, discountValue: v }))}
                        placeholder={form.discountType === 'percent' ? 'e.g. 10' : 'e.g. 1000'}
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={[modalStyles.feeCalc, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {[
                        { label: 'Annual Fee', value: `₹${Number(form.annualFee).toLocaleString('en-IN')}`, color: colors.text, bold: false },
                        { label: 'Discount', value: `− ${discountDisplay}`, color: colors.warning, bold: false },
                        { label: 'Final Payable', value: `₹${finalPayable.toLocaleString('en-IN')}`, color: colors.success, bold: true },
                      ].map(row => (
                        <View key={row.label} style={[modalStyles.feeCalcRow, { borderBottomColor: colors.border }]}>
                          <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{row.label}</Text>
                          <Text style={{ fontSize: 14, fontWeight: row.bold ? '700' : '600', color: row.color }}>{row.value}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </ScrollView>
            <View style={[modalStyles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[modalStyles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowModal(false)} activeOpacity={0.8}>
                <Text style={[modalStyles.cancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modalStyles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} activeOpacity={0.8}>
                <Text style={modalStyles.saveText}>Save Student</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Class Picker Modal */}
      <Modal visible={showClassPicker} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card, maxHeight: 400 }]}>
            <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
              <Text style={[modalStyles.title, { color: colors.text }]}>Select Class</Text>
              <TouchableOpacity onPress={() => { setClassSearch(''); setShowClassPicker(false); }}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <TextInput
              value={classSearch}
              onChangeText={setClassSearch}
              placeholder="Search class..."
              placeholderTextColor={colors.mutedForeground}
              style={[modalStyles.input, { borderColor: colors.border, color: colors.text, margin: 16, marginBottom: 8 }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView>
              {classes.filter(cls => cls.toLowerCase().includes(classSearch.trim().toLowerCase())).map(cls => (
                <TouchableOpacity
                  key={cls}
                  style={[modalStyles.classOption, { borderBottomColor: colors.border }]}
                  onPress={() => { setForm(prev => ({ ...prev, class: cls })); setClassSearch(''); setShowClassPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[modalStyles.classOptionText, { color: form.class === cls ? colors.primary : colors.text }]}>{cls}</Text>
                  {form.class === cls && <Feather name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Gender Picker Modal */}
      <Modal visible={showGenderPicker} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card, maxHeight: 400 }]}>
            <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
              <Text style={[modalStyles.title, { color: colors.text }]}>Select Gender</Text>
              <TouchableOpacity onPress={() => setShowGenderPicker(false)}>
                <Feather name="x" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={[modalStyles.classOption, { borderBottomColor: colors.border }]}
                onPress={() => { setForm(prev => ({ ...prev, gender: '' })); setShowGenderPicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={[modalStyles.classOptionText, { color: !form.gender ? colors.primary : colors.mutedForeground, fontStyle: 'italic' }]}>Not specified</Text>
                {!form.gender && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {STUDENT_GENDER_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option}
                  style={[modalStyles.classOption, { borderBottomColor: colors.border }]}
                  onPress={() => { setForm(prev => ({ ...prev, gender: option })); setShowGenderPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[modalStyles.classOptionText, { color: form.gender === option ? colors.primary : colors.text }]}>{option}</Text>
                  {form.gender === option && <Feather name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Caste Picker Modal */}
      <Modal visible={showCastePicker} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card, maxHeight: 400 }]}>
            <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
              <Text style={[modalStyles.title, { color: colors.text }]}>Select Caste</Text>
              <TouchableOpacity onPress={() => setShowCastePicker(false)}>
                <Feather name="x" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={[modalStyles.classOption, { borderBottomColor: colors.border }]}
                onPress={() => { setForm(prev => ({ ...prev, caste: '' })); setShowCastePicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={[modalStyles.classOptionText, { color: !form.caste ? colors.primary : colors.mutedForeground, fontStyle: 'italic' }]}>Not specified</Text>
                {!form.caste && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {STUDENT_CASTE_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option}
                  style={[modalStyles.classOption, { borderBottomColor: colors.border }]}
                  onPress={() => { setForm(prev => ({ ...prev, caste: option })); setShowCastePicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[modalStyles.classOptionText, { color: form.caste === option ? colors.primary : colors.text }]}>{option}</Text>
                  {form.caste === option && <Feather name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Section Picker Modal */}
      <Modal visible={showSectionPicker} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card, maxHeight: 400 }]}>
            <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
              <Text style={[modalStyles.title, { color: colors.text }]}>Select Section</Text>
              <TouchableOpacity onPress={() => setShowSectionPicker(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView>
              {/* None option */}
              <TouchableOpacity
                style={[modalStyles.classOption, { borderBottomColor: colors.border }]}
                onPress={() => { setForm(prev => ({ ...prev, section: '' })); setShowSectionPicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={[modalStyles.classOptionText, { color: !form.section ? colors.primary : colors.mutedForeground, fontStyle: 'italic' }]}>None</Text>
                {!form.section && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
              {sections.length === 0 && (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>No sections yet.{'\n'}Tap "Manage Sections" to add one.</Text>
                </View>
              )}
              {sections.map(sec => (
                <TouchableOpacity
                  key={sec}
                  style={[modalStyles.classOption, { borderBottomColor: colors.border }]}
                  onPress={() => { setForm(prev => ({ ...prev, section: sec })); setShowSectionPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[modalStyles.classOptionText, { color: form.section === sec ? colors.primary : colors.text }]}>{sec}</Text>
                  {form.section === sec && <Feather name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══ Sections Manager Modal ══ */}
      <Modal visible={showSectionsMgr} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card, height: '78%' as any, minHeight: 0 }]}>
            <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[modalStyles.title, { color: colors.text }]}>Manage Sections</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>Add, edit or delete sections</Text>
              </View>
              <TouchableOpacity onPress={() => {
                setShowSectionsMgr(false);
                if (formPausedForSections) {
                  setFormPausedForSections(false);
                  setTimeout(() => setShowModal(true), 350);
                }
              }}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }}>
              {sections.length === 0 && (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Feather name="layers" size={32} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>No sections yet. Add one below.</Text>
                </View>
              )}
              {sections.map(sec => (
                <View key={sec} style={[secMgrStyles.row, { borderBottomColor: colors.border }]}>
                  {editingSectionName === sec ? (
                    <>
                      <TextInput
                        style={[secMgrStyles.editInput, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                        value={editingSectionValue}
                        onChangeText={setEditingSectionValue}
                        autoFocus
                        placeholder="New name"
                        placeholderTextColor={colors.mutedForeground}
                      />
                      <TouchableOpacity
                        onPress={() => handleUpdateSection(sec)}
                        style={{ padding: 6 }}
                      >
                        <Feather name="check" size={18} color={colors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingSectionName(null)} style={{ padding: 6 }}>
                        <Feather name="x" size={18} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Feather name="tag" size={15} color={colors.primary} />
                      <Text style={[secMgrStyles.name, { color: colors.text }]}>{sec}</Text>
                      <TouchableOpacity
                        onPress={() => { setEditingSectionName(sec); setEditingSectionValue(sec); }}
                        style={{ padding: 6 }}
                      >
                        <Feather name="edit-2" size={16} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setConfirmDeleteSection(sec)} style={{ padding: 6 }}>
                        <Feather name="trash-2" size={16} color={colors.destructive} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ))}
            </ScrollView>
            {/* Add new section */}
            <View style={[secMgrStyles.addRow, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
              <TextInput
                style={[secMgrStyles.addInput, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                value={newSectionName}
                onChangeText={setNewSectionName}
                placeholder="New section name (e.g. A, B, C)"
                placeholderTextColor={colors.mutedForeground}
                onSubmitEditing={handleAddSection}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[secMgrStyles.addBtn, { backgroundColor: newSectionName.trim() ? colors.primary : colors.muted }]}
                onPress={handleAddSection}
                disabled={!newSectionName.trim() || sectionLoading}
                activeOpacity={0.8}
              >
                <Feather name="plus" size={20} color={newSectionName.trim() ? '#fff' : colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Premium section delete confirmation */}
      <Modal visible={!!confirmDeleteSection} animationType="fade" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card, borderRadius: 24, margin: 24, minHeight: 0 }]}>
            <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 18 }}>
              <View style={{ width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.destructive + '14', marginBottom: 16 }}>
                <Feather name="trash-2" size={26} color={colors.destructive} />
              </View>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Delete section?</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 }}>
                This will permanently remove <Text style={{ color: colors.text, fontWeight: '800' }}>{confirmDeleteSection}</Text> and clear it from any student records. This action cannot be undone.
              </Text>
            </View>
            <View style={[modalStyles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[modalStyles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setConfirmDeleteSection(null)}
                disabled={sectionLoading}
                activeOpacity={0.8}
              >
                <Text style={[modalStyles.cancelText, { color: colors.text }]}>Keep Section</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.saveBtn, { backgroundColor: colors.destructive }]}
                onPress={handleDeleteSection}
                disabled={sectionLoading}
                activeOpacity={0.8}
              >
                <Text style={modalStyles.saveText}>{sectionLoading ? 'Deleting…' : 'Delete Forever'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fee Detail Modal */}
      <Modal visible={!!showFeeDetail} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card }]}>
            {showFeeDetail && (() => {
              const fi = getStudentFeeInfo(showFeeDetail, feeRecords);
              const records = feeRecords.filter(f => f.studentId === showFeeDetail.id).sort((a, b) => b.date.localeCompare(a.date));
              const sc = STATUS_COLORS[fi.status] ?? '#94A3B8';
              return (
                <>
                  <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
                    <View>
                      <Text style={[modalStyles.title, { color: colors.text }]}>{showFeeDetail.name}</Text>
                      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{showFeeDetail.class}{showFeeDetail.section ? ` · ${showFeeDetail.section}` : ''} • Fee Details</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowFeeDetail(null)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
                  </View>
                  <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
                    <View style={[feeDetailStyles.card, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                      {[
                        { label: 'Annual Fee', value: `₹${fi.annualFee.toLocaleString('en-IN')}`, color: colors.text, bold: false },
                        { label: `Discount (${fi.discountType === 'percent' ? `${fi.discountValue}%` : 'Fixed'})`, value: `− ₹${fi.discountAmount.toLocaleString('en-IN')}`, color: colors.warning, bold: false },
                        { label: 'Final Payable', value: `₹${fi.finalPayable.toLocaleString('en-IN')}`, color: colors.text, bold: true },
                        { label: 'Total Paid', value: `₹${fi.totalPaid.toLocaleString('en-IN')}`, color: colors.success, bold: true },
                        { label: 'Remaining Balance', value: `₹${fi.remaining.toLocaleString('en-IN')}`, color: fi.remaining > 0 ? colors.destructive : colors.success, bold: true },
                      ].map(row => (
                        <View key={row.label} style={[feeDetailStyles.row, { borderBottomColor: colors.border }]}>
                          <Text style={{ fontSize: 14, color: colors.mutedForeground }}>{row.label}</Text>
                          <Text style={{ fontSize: 15, fontWeight: row.bold ? '700' : '500', color: row.color }}>{row.value}</Text>
                        </View>
                      ))}
                      <View style={[feeDetailStyles.row, { borderBottomColor: 'transparent' }]}>
                        <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Payment Status</Text>
                        <View style={[feeDetailStyles.badge, { backgroundColor: sc + '20' }]}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: sc }}>{STATUS_LABEL[fi.status]}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 20, marginBottom: 12 }}>Payment History</Text>
                    {records.length === 0
                      ? <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 20 }}>No payments yet</Text>
                      : records.map(r => (
                        <View key={r.id} style={[feeDetailStyles.histRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <View style={[feeDetailStyles.histIcon, { backgroundColor: colors.success + '15' }]}>
                            <Feather name="check-circle" size={16} color={colors.success} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{r.description}</Text>
                            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{r.date}{r.paymentMethod ? ` • ${r.paymentMethod}` : ''}</Text>
                          </View>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.success }}>₹{r.amount.toLocaleString('en-IN')}</Text>
                        </View>
                      ))
                    }
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal visible={!!confirmDelete} animationType="fade" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card, borderRadius: 20, margin: 24, minHeight: 0, maxHeight: 300 }]}>
            <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
              <Text style={[modalStyles.title, { color: colors.text }]}>Delete Student</Text>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
                Are you sure you want to permanently delete <Text style={{ fontWeight: '700' }}>{confirmDelete?.name}</Text>? This cannot be undone.
              </Text>
            </View>
            <View style={[modalStyles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[modalStyles.cancelBtn, { borderColor: colors.border }]} onPress={() => setConfirmDelete(null)} activeOpacity={0.8}>
                <Text style={[modalStyles.cancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.saveBtn, { backgroundColor: colors.destructive }]}
                onPress={async () => {
                  if (!confirmDelete) return;
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  deleteStudent(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={modalStyles.saveText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Attendance Report Modal */}
      <Modal visible={!!showAttendance} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.card }]}>
            {showAttendance && (() => {
              const att = getStudentAttendance(showAttendance.id);
              const countedDays = att.present + att.absent + att.inactive;
              const pct = countedDays > 0 ? Math.round((att.present / countedDays) * 100) : 0;
              const records = attendanceRecords.filter(a => a.studentId === showAttendance.id).sort((a, b) => b.date.localeCompare(a.date));
              return (
                <>
                  <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
                    <Text style={[modalStyles.title, { color: colors.text }]}>Attendance — {showAttendance.name}</Text>
                    <TouchableOpacity onPress={() => setShowAttendance(null)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', padding: 16, gap: 12 }}>
                    {[
                      { label: 'Present', value: att.present, color: colors.success },
                      { label: 'Absent', value: att.absent, color: colors.destructive },
                      { label: 'Holiday', value: att.holiday, color: colors.warning },
                      { label: 'Inactive', value: att.inactive, color: colors.mutedForeground },
                      { label: 'Percent', value: `${pct}%`, color: pct >= 75 ? colors.success : colors.destructive },
                    ].map(stat => (
                      <View key={stat.label} style={[attStyles.statBox, { borderColor: stat.color + '40', backgroundColor: stat.color + '10' }]}>
                        <Text style={[attStyles.statVal, { color: stat.color }]}>{stat.value}</Text>
                        <Text style={attStyles.statLabel}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>
                  <ScrollView style={{ maxHeight: 300, paddingHorizontal: 16 }}>
                    {records.length === 0 && <Text style={{ color: colors.mutedForeground, textAlign: 'center', padding: 16 }}>No attendance records found</Text>}
                    {records.map(r => (
                      <View key={r.id} style={[attStyles.row, { borderBottomColor: colors.border }]}>
                        <Text style={{ color: colors.text, fontSize: 14 }}>{r.date}</Text>
                        <View style={[attStyles.badge, { backgroundColor: r.status === 'present' ? colors.success + '20' : r.status === 'absent' ? colors.destructive + '20' : colors.warning + '20' }]}>
                          <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'capitalize', color: r.status === 'present' ? colors.success : r.status === 'absent' ? colors.destructive : colors.warning }}>
                            {r.status}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
      <PremiumAlert
        visible={showValidationAlert}
        variant="warning"
        title="Validation"
        message="Please fill all required fields (Name, Father Name, Class, Roll Number)"
        onDismiss={() => setShowValidationAlert(false)}
      />
    </View>
  );
}

// ── Top-bar styles ─────────────────────────────────────────────────────────────
const topBarSt = StyleSheet.create({
  topBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: '600' },
});
