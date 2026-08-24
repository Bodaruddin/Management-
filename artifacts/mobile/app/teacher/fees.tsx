import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Modal, Platform, FlatList, Alert,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useApp, FeeType, Student, getStudentFeeInfo, isActiveStudent, compareStudentRollNumbers } from '@/context/AppContext';
import { printFeeReceipt, shareReceiptWhatsApp } from '@/utils/receipt';
import { buildReminderMessage, sendReminderSMS, shareReminderImage } from '@/utils/reminder';
import EmptyState from '@/components/EmptyState';
import ReminderCard from '@/components/ReminderCard';

const PAYMENT_METHODS = [
  { value: 'Cash', icon: 'dollar-sign' as const },
  { value: 'Online', icon: 'wifi' as const },
  { value: 'Card', icon: 'credit-card' as const },
  { value: 'Check', icon: 'file-text' as const },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function TeacherFees() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { students, feeTypes, feeRecords, addFeeRecord, updateFeeRecord, deleteFeeRecord, documentBranding } = useApp();

  // ── Collect form state ──
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedFeeType, setSelectedFeeType] = useState<FeeType | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [validationError, setValidationError] = useState('');
  const [lastRecord, setLastRecord] = useState<{ record: any; student: Student } | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  // ── Search / filter state ──
  const [studentSearch, setStudentSearch] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [showFeeTypePicker, setShowFeeTypePicker] = useState(false);

  // ── Tabs ──
  const canCollect = !!user?.permissions?.feeCollection;
  const canRemind  = !!user?.permissions?.sendFeeReminder;
  const defaultTab = tab === 'reminder' && canRemind ? 'reminder' : 'collect';
  const [activeTab, setActiveTab] = useState<'collect' | 'reminder'>(defaultTab);

  // ── Reminder state ──
  const viewShotRef = useRef<any>(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderStudent, setReminderStudent] = useState<Student | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderSearch, setReminderSearch] = useState('');
  const [reminderClassFilter, setReminderClassFilter] = useState('All');

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // ── Derived ──
  const uniqueClasses = useMemo(() =>
    ['All', ...Array.from(new Set(students.filter(isActiveStudent).map(s => s.class))).sort()],
    [students]);

  const filteredStudents = useMemo(() => students
    .filter(s => {
      if (!isActiveStudent(s)) return false;
      const matchSearch = studentSearch === '' || s.name.toLowerCase().includes(studentSearch.toLowerCase());
      const matchClass  = classFilter === 'All' || s.class === classFilter;
      return matchSearch && matchClass;
    })
    .sort((a, b) => classFilter === 'All'
      ? a.class.localeCompare(b.class, undefined, { numeric: true, sensitivity: 'base' }) || compareStudentRollNumbers(a, b)
      : compareStudentRollNumbers(a, b)), [students, studentSearch, classFilter]);

  const filteredReminderStudents = useMemo(() => students
    .filter(s => {
      if (!isActiveStudent(s)) return false;
      const matchSearch = reminderSearch === '' || s.name.toLowerCase().includes(reminderSearch.toLowerCase());
      const matchClass  = reminderClassFilter === 'All' || s.class === reminderClassFilter;
      return matchSearch && matchClass;
    })
    .sort((a, b) => reminderClassFilter === 'All'
      ? a.class.localeCompare(b.class, undefined, { numeric: true, sensitivity: 'base' }) || compareStudentRollNumbers(a, b)
      : compareStudentRollNumbers(a, b)), [students, reminderSearch, reminderClassFilter]);

  const myCollectionsToday = useMemo(() =>
    feeRecords
      .filter(r => r.date === todayStr && r.collectedBy === user?.name)
      .sort((a, b) => b.id.localeCompare(a.id)),
    [feeRecords, todayStr, user]);

  const selectedStudent = students.find(s => s.id === selectedStudentId && isActiveStudent(s)) ?? null;
  const selectedFeeInfo = selectedStudent ? getStudentFeeInfo(selectedStudent, feeRecords) : null;
  const amt = Number(amount) || 0;
  const canSubmit = !!selectedStudentId && !!selectedFeeType && amt > 0;

  // ── Handlers ──
  const handleSelectStudent = (st: Student) => {
    setSelectedStudentId(st.id);
    setValidationError('');
    if (!description) setDescription(`Monthly Fee - ${MONTHS[now.getMonth()]} ${now.getFullYear()}`);
  };

  const handleSelectFeeType = (ft: FeeType) => {
    setSelectedFeeType(ft);
    setAmount(String(ft.amount));
    setDescription(ft.name);
    setShowFeeTypePicker(false);
  };

  const handleCollect = async () => {
    if (!selectedStudentId || !selectedFeeType || amt <= 0) {
      setValidationError('Please select a student, fee type, and enter a valid amount.');
      return;
    }
    if (!selectedStudent) return;

    const fi = getStudentFeeInfo(selectedStudent, feeRecords);
    const existingRecord = editingRecordId
      ? feeRecords.find((record) => record.id === editingRecordId)
      : undefined;
    const availableBalance = fi.remaining
      + (existingRecord?.studentId === selectedStudent.id ? existingRecord.amount : 0);
    if (fi.annualFee > 0 && amt > availableBalance) {
      setValidationError(`Remaining balance is ₹${availableBalance.toLocaleString('en-IN')}. Amount exceeds outstanding balance.`);
      return;
    }

    setValidationError('');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const recordData = {
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      class: selectedStudent.class,
      amount: amt,
      date,
      description: description.trim() || selectedFeeType.name,
      feeTypeId: selectedFeeType.id,
      feeTypeName: selectedFeeType.name,
      collectedBy: user?.name || 'Teacher',
      paymentMethod,
    };
    if (editingRecordId) {
      updateFeeRecord(editingRecordId, {
        amount: recordData.amount,
        date: recordData.date,
        description: recordData.description,
        paymentMethod: recordData.paymentMethod,
      });
    } else {
      const record = addFeeRecord(recordData);
      setLastRecord({ record, student: selectedStudent });
    }

    setEditingRecordId(null);
    setSelectedStudentId('');
    setSelectedFeeType(null);
    setAmount('');
    setDescription('');
  };

  const startEditing = (record: any) => {
    setEditingRecordId(record.id);
    setSelectedStudentId(record.studentId);
    setSelectedFeeType(
      feeTypes.find((feeType) => feeType.id === record.feeTypeId) ?? {
        id: record.feeTypeId ?? '',
        name: record.feeTypeName ?? 'Fee',
        amount: record.amount,
        description: '',
      },
    );
    setAmount(String(record.amount));
    setDescription(record.description ?? '');
    setDate(record.date);
    setPaymentMethod(record.paymentMethod ?? 'Cash');
    setValidationError('');
  };

  const confirmDelete = (record: any) => {
    Alert.alert(
      'Delete payment?',
      `Delete ₹${record.amount.toLocaleString('en-IN')} collected from ${record.studentName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteFeeRecord(record.id) },
      ],
    );
  };

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 12 : insets.top;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 24;

  if (!canCollect && !canRemind) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: topPad }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
            <Feather name="arrow-left" size={22} color={colors.cardForeground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.cardForeground }]}>Fees</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState icon="lock" title="Access Denied" subtitle="You do not have permission to access this section." />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
          <Feather name="arrow-left" size={22} color={colors.cardForeground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.cardForeground }]}>
          {activeTab === 'reminder' ? 'Fee Reminder' : 'Collect Fee'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Tab bar ── */}
      {canCollect && canRemind && (
        <View style={[s.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {(['collect', 'reminder'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.tabItem, activeTab === t && { borderBottomColor: colors.primary }]}
              onPress={() => setActiveTab(t)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, { color: activeTab === t ? colors.primary : colors.mutedForeground }]}>
                {t === 'collect' ? 'Collect Fee' : 'Fee Reminder'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: botPad }} keyboardShouldPersistTaps="handled">

        {/* ════ COLLECT TAB ════ */}
        {activeTab === 'collect' && canCollect && (
          <View>

            {/* Step 1 — Student */}
            <View style={[s.section, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <View style={s.stepRow}>
                <View style={[s.stepBadge, { backgroundColor: colors.primary }]}>
                  <Text style={s.stepNum}>1</Text>
                </View>
                <Text style={[s.stepTitle, { color: colors.text }]}>Select Student</Text>
              </View>

              {/* Search */}
              <View style={[s.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="search" size={15} color={colors.mutedForeground} />
                <TextInput
                  style={[s.searchInput, { color: colors.text }]}
                  placeholder="Search student..."
                  placeholderTextColor={colors.mutedForeground}
                  value={studentSearch}
                  onChangeText={setStudentSearch}
                />
                {studentSearch !== '' && (
                  <TouchableOpacity onPress={() => setStudentSearch('')}>
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Class chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {uniqueClasses.map(cls => (
                  <TouchableOpacity
                    key={cls}
                    style={[s.chip, { backgroundColor: classFilter === cls ? colors.primary : colors.muted, borderColor: classFilter === cls ? colors.primary : colors.border }]}
                    onPress={() => setClassFilter(cls)}
                  >
                    <Text style={[s.chipText, { color: classFilter === cls ? '#fff' : colors.mutedForeground }]}>{cls}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Student list */}
              <ScrollView
                style={[s.listBox, { borderColor: colors.border }]}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {filteredStudents.length === 0
                  ? <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No students found</Text>
                  : filteredStudents.map(st => {
                    const fi = getStudentFeeInfo(st, feeRecords);
                    const selected = selectedStudentId === st.id;
                    const statusColor = fi.status === 'paid' ? colors.success : fi.status === 'partial' ? colors.warning : colors.destructive;
                    return (
                      <TouchableOpacity
                        key={st.id}
                        style={[s.studentRow, { borderBottomColor: colors.border, backgroundColor: selected ? colors.primary + '10' : 'transparent' }]}
                        onPress={() => handleSelectStudent(st)}
                        activeOpacity={0.7}
                      >
                        <View style={[s.avatar, { backgroundColor: selected ? colors.primary + '20' : colors.muted }]}>
                          <Text style={[s.avatarText, { color: selected ? colors.primary : colors.mutedForeground }]}>
                            {st.name.charAt(0)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.studentName, { color: selected ? colors.primary : colors.text }]}>{st.name}</Text>
                          <Text style={[s.studentMeta, { color: colors.mutedForeground }]}>
                            Father: {st.fatherName || '—'}
                          </Text>
                          <Text style={[s.studentMeta, { color: colors.mutedForeground }]}>
                            {st.class} · Roll No: {st.rollNumber || '—'}{fi.annualFee > 0 ? ` · Bal ₹${fi.remaining.toLocaleString('en-IN')}` : ''}
                          </Text>
                        </View>
                        {fi.status !== 'no-fee' && (
                          <View style={[s.statusBadge, { backgroundColor: statusColor + '18' }]}>
                            <Text style={[s.statusText, { color: statusColor }]}>
                              {fi.status === 'paid' ? 'Paid' : fi.status === 'partial' ? 'Partial' : 'Due'}
                            </Text>
                          </View>
                        )}
                        {selected && <Feather name="check-circle" size={16} color={colors.primary} style={{ marginLeft: 6 }} />}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>

              {/* Selected student fee summary */}
              {selectedStudent && selectedFeeInfo && selectedFeeInfo.annualFee > 0 && (
                <View style={[s.feeSummaryBar, { backgroundColor: colors.primary }]}>
                  {[
                    { label: 'Payable', value: `₹${selectedFeeInfo.finalPayable.toLocaleString('en-IN')}` },
                    { label: 'Paid', value: `₹${selectedFeeInfo.totalPaid.toLocaleString('en-IN')}` },
                    { label: 'Balance', value: `₹${selectedFeeInfo.remaining.toLocaleString('en-IN')}`, highlight: selectedFeeInfo.remaining > 0 },
                  ].map((item, i) => (
                    <React.Fragment key={item.label}>
                      {i > 0 && <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />}
                      <View style={[s.feeSummaryCell, item.highlight && { backgroundColor: 'rgba(239,68,68,0.25)', borderRadius: 8 }]}>
                        <Text style={s.feeSummaryLabel}>{item.label}</Text>
                        <Text style={s.feeSummaryValue}>{item.value}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              )}
            </View>

            {/* Step 2 — Fee Details */}
            <View style={[s.section, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <View style={s.stepRow}>
                <View style={[s.stepBadge, { backgroundColor: colors.primary }]}>
                  <Text style={s.stepNum}>2</Text>
                </View>
                <Text style={[s.stepTitle, { color: colors.text }]}>Fee Details</Text>
              </View>

              {/* Fee Type picker */}
              <Text style={[s.label, { color: colors.mutedForeground }]}>FEE TYPE</Text>
              <TouchableOpacity
                style={[s.pickerBtn, { backgroundColor: colors.muted, borderColor: selectedFeeType ? colors.primary : colors.border }]}
                onPress={() => setShowFeeTypePicker(true)}
              >
                <View style={[s.pickerIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Feather name="tag" size={14} color={colors.primary} />
                </View>
                <Text style={[s.pickerText, { color: selectedFeeType ? colors.text : colors.mutedForeground, fontWeight: selectedFeeType ? '600' : '400' }]}>
                  {selectedFeeType ? selectedFeeType.name : 'Tap to select fee type...'}
                </Text>
                {selectedFeeType
                  ? <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>₹{selectedFeeType.amount.toLocaleString('en-IN')}</Text>
                  : <Feather name="chevron-down" size={16} color={colors.mutedForeground} />}
              </TouchableOpacity>

              {/* Amount */}
              <Text style={[s.label, { color: colors.mutedForeground, marginTop: 14 }]}>AMOUNT (₹)</Text>
              <View style={[s.amountBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[s.amountPrefix, { color: colors.primary }]}>₹</Text>
                <TextInput
                  style={[s.amountInput, { color: colors.text }]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                />
              </View>

              {/* Description */}
              <Text style={[s.label, { color: colors.mutedForeground, marginTop: 14 }]}>DESCRIPTION</Text>
              <TextInput
                style={[s.textInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Monthly Fee July 2026"
                placeholderTextColor={colors.mutedForeground}
              />

              {/* Date */}
              <Text style={[s.label, { color: colors.mutedForeground, marginTop: 14 }]}>DATE</Text>
              <TextInput
                style={[s.textInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Step 3 — Payment Method */}
            <View style={[s.section, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <View style={s.stepRow}>
                <View style={[s.stepBadge, { backgroundColor: colors.primary }]}>
                  <Text style={s.stepNum}>3</Text>
                </View>
                <Text style={[s.stepTitle, { color: colors.text }]}>Payment Method</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {PAYMENT_METHODS.map(pm => {
                  const active = paymentMethod === pm.value;
                  return (
                    <TouchableOpacity
                      key={pm.value}
                      style={[s.pmChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.muted }]}
                      onPress={() => setPaymentMethod(pm.value)}
                      activeOpacity={0.75}
                    >
                      <Feather name={pm.icon} size={14} color={active ? '#fff' : colors.mutedForeground} />
                      <Text style={[s.pmText, { color: active ? '#fff' : colors.text }]}>{pm.value}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Error */}
            {!!validationError && (
              <View style={[s.errorBox, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}>
                <Feather name="alert-circle" size={15} color={colors.destructive} />
                <Text style={[s.errorText, { color: colors.destructive }]}>{validationError}</Text>
              </View>
            )}

            {/* Collect button */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
              <TouchableOpacity
                style={[s.collectBtn, { backgroundColor: canSubmit ? colors.success : colors.muted, shadowOpacity: canSubmit ? 0.25 : 0 }]}
                onPress={handleCollect}
                disabled={!canSubmit}
                activeOpacity={0.85}
              >
                <Feather name="check-circle" size={20} color={canSubmit ? '#fff' : colors.mutedForeground} />
                <Text style={[s.collectBtnText, { color: canSubmit ? '#fff' : colors.mutedForeground }]}>
                  {editingRecordId ? `Save Changes  ₹${amt.toLocaleString('en-IN')}` : canSubmit ? `Collect  ₹${amt.toLocaleString('en-IN')}` : 'Collect Fee'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Today's collections */}
            {myCollectionsToday.length > 0 && (
              <View style={{ padding: 16 }}>
                <Text style={[s.sectionTitle, { color: colors.text }]}>My Collections Today</Text>
                {myCollectionsToday.map(record => (
                  <View key={record.id} style={[s.recordCard, { backgroundColor: colors.card }]}>
                    <View style={[s.recordIcon, { backgroundColor: colors.success + '18' }]}>
                      <Feather name="check" size={16} color={colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.recordName, { color: colors.text }]}>{record.studentName}</Text>
                      <Text style={[s.recordMeta, { color: colors.mutedForeground }]}>
                        {record.class} · {record.feeTypeName}{record.paymentMethod ? ` · ${record.paymentMethod}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.recordAmt, { color: colors.success }]}>+₹{record.amount.toLocaleString('en-IN')}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                        <TouchableOpacity onPress={() => shareReceiptWhatsApp(record, undefined, documentBranding)} style={[s.receiptBtn, { backgroundColor: '#25D36618' }]}>
                          <Text style={{ fontSize: 10, color: '#25D366', fontWeight: '700' }}>WA</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => printFeeReceipt(record, undefined, documentBranding)} style={[s.receiptBtn, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '700' }}>PDF</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => startEditing(record)} style={[s.receiptBtn, { backgroundColor: colors.warning + '20' }]}>
                          <Feather name="edit-2" size={11} color={colors.warning} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirmDelete(record)} style={[s.receiptBtn, { backgroundColor: colors.destructive + '15' }]}>
                          <Feather name="trash-2" size={11} color={colors.destructive} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ════ REMINDER TAB ════ */}
        {activeTab === 'reminder' && canRemind && (
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FF980020', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="bell" size={16} color="#FF9800" />
              </View>
              <Text style={[s.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Send Fee Reminders</Text>
            </View>
            <View style={[s.searchBox, { backgroundColor: colors.muted, borderColor: colors.border, marginBottom: 8 }]}>
              <Feather name="search" size={14} color={colors.mutedForeground} />
              <TextInput style={[s.searchInput, { color: colors.text }]} placeholder="Search student..." placeholderTextColor={colors.mutedForeground} value={reminderSearch} onChangeText={setReminderSearch} />
              {reminderSearch !== '' && <TouchableOpacity onPress={() => setReminderSearch('')}><Feather name="x" size={14} color={colors.mutedForeground} /></TouchableOpacity>}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {uniqueClasses.map(cls => (
                <TouchableOpacity key={cls} style={[s.chip, { backgroundColor: reminderClassFilter === cls ? '#FF9800' : colors.muted, borderColor: reminderClassFilter === cls ? '#FF9800' : colors.border }]} onPress={() => setReminderClassFilter(cls)}>
                  <Text style={[s.chipText, { color: reminderClassFilter === cls ? '#fff' : colors.mutedForeground }]}>{cls}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {filteredReminderStudents.length === 0
              ? <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 20 }}>No students found</Text>
              : filteredReminderStudents.map(st => (
                <View key={st.id} style={[s.recordCard, { backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center' }]}>
                  <View style={[s.recordIcon, { backgroundColor: '#FF980015' }]}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FF9800' }}>{st.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.recordName, { color: colors.text }]}>{st.name}</Text>
                    <Text style={[s.recordMeta, { color: colors.mutedForeground }]}>{st.class} · Roll {st.rollNumber}</Text>
                    {st.mobileNumber
                      ? <Text style={{ fontSize: 11, color: colors.success, marginTop: 2 }}>📞 {st.mobileNumber}</Text>
                      : <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>No number</Text>}
                  </View>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FF980015', borderWidth: 1, borderColor: '#FF9800' }}
                    onPress={() => { setReminderStudent(st); setReminderMessage(buildReminderMessage(st)); setShowReminderModal(true); }}
                    activeOpacity={0.8}
                  >
                    <Feather name="bell" size={13} color="#FF9800" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF9800' }}>Remind</Text>
                  </TouchableOpacity>
                </View>
              ))}
          </View>
        )}
      </ScrollView>

      {/* ════ Fee Type Picker ════ */}
      <Modal visible={showFeeTypePicker} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: colors.card }]}>
            <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Select Fee Type</Text>
              <TouchableOpacity onPress={() => setShowFeeTypePicker(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {feeTypes.length === 0
                ? <Text style={{ color: colors.mutedForeground, textAlign: 'center', padding: 24 }}>No fee types created yet</Text>
                : feeTypes.map(ft => (
                  <TouchableOpacity
                    key={ft.id}
                    style={[s.feeTypeRow, { borderBottomColor: colors.border, backgroundColor: selectedFeeType?.id === ft.id ? colors.primary + '08' : 'transparent' }]}
                    onPress={() => handleSelectFeeType(ft)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.feeTypeIcon, { backgroundColor: colors.primary + '15' }]}>
                      <Feather name="tag" size={15} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.feeTypeName, { color: colors.text }]}>{ft.name}</Text>
                      {ft.description ? <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>{ft.description}</Text> : null}
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.success, marginRight: 10 }}>
                      ₹{ft.amount.toLocaleString('en-IN')}
                    </Text>
                    {selectedFeeType?.id === ft.id && <Feather name="check-circle" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ════ Reminder Modal ════ */}
      <Modal visible={showReminderModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: colors.card, maxHeight: '92%', minHeight: '70%' }]}>
            {/* Header */}
            <View style={[s.sheetHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FF980020', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="bell" size={18} color="#FF9800" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Send Reminder</Text>
                  {reminderStudent && <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{reminderStudent.name} · {reminderStudent.class}</Text>}
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowReminderModal(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Card preview */}
            <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {reminderStudent && (
                <>
                  {!reminderStudent.mobileNumber && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FF525212', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FF5252' }}>
                      <Feather name="alert-circle" size={14} color="#FF5252" />
                      <Text style={{ fontSize: 12, color: '#FF5252', flex: 1 }}>No mobile number on record for this student.</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.mutedForeground, letterSpacing: 0.6, marginBottom: 10 }}>REMINDER CARD PREVIEW</Text>
                  <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.95 }}>
                    <ReminderCard
                      studentName={reminderStudent.name}
                      studentClass={reminderStudent.class}
                      rollNumber={reminderStudent.rollNumber}
                      fatherName={reminderStudent.fatherName}
                      dueAmount={getStudentFeeInfo(reminderStudent, feeRecords).remaining}
                    />
                  </ViewShot>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
                    This card will be shared as an image on WhatsApp
                  </Text>
                </>
              )}
            </ScrollView>

            {/* Action buttons */}
            <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[s.reminderBtn, { backgroundColor: '#25D366' }]}
                  onPress={async () => {
                    if (!reminderStudent || !viewShotRef.current) return;
                    try {
                      const uri: string = await viewShotRef.current.capture();
                      await shareReminderImage(uri, reminderStudent);
                    } catch {
                      Alert.alert('Error', 'Could not generate reminder card. Please try SMS.');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <FontAwesome5 name="whatsapp" size={17} color="#fff" />
                  <Text style={s.reminderBtnText}>Share Image</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.reminderBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => { if (reminderStudent) await sendReminderSMS(reminderStudent, reminderMessage); }}
                  activeOpacity={0.8}
                >
                  <Feather name="message-square" size={17} color="#fff" />
                  <Text style={s.reminderBtnText}>SMS</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowReminderModal(false)}>
                <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════ Receipt Modal ════ */}
      <Modal visible={!!lastRecord} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 24, overflow: 'hidden' }}>
            <View style={{ backgroundColor: colors.success, padding: 24, alignItems: 'center' }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Feather name="check" size={32} color="#fff" />
              </View>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Fee Collected!</Text>
              {lastRecord && (
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4 }}>
                  ₹{lastRecord.record.amount.toLocaleString('en-IN')} from {lastRecord.record.studentName}
                </Text>
              )}
            </View>
            <View style={{ padding: 20, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', borderRadius: 14, paddingVertical: 14 }}
                  onPress={() => { if (lastRecord) shareReceiptWhatsApp(lastRecord.record, lastRecord.student, documentBranding); setLastRecord(null); }}
                  activeOpacity={0.8}
                >
                  <FontAwesome5 name="whatsapp" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14 }}
                  onPress={() => { if (lastRecord) printFeeReceipt(lastRecord.record, lastRecord.student, documentBranding); setLastRecord(null); }}
                  activeOpacity={0.8}
                >
                  <Feather name="printer" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Print PDF</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setLastRecord(null)} activeOpacity={0.8}>
                <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: { backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  // Tab bar
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '600' },

  // Section / steps
  section: { borderBottomWidth: 1, padding: 16, paddingBottom: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepTitle: { fontSize: 15, fontWeight: '700' },

  // Search
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14 },

  // Chips
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },

  // Student list
  listBox: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', maxHeight: 116, marginBottom: 4 },
  emptyText: { padding: 16, textAlign: 'center', fontSize: 13 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700' },
  studentName: { fontSize: 14, fontWeight: '500' },
  studentMeta: { fontSize: 11, marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '700' },

  // Fee summary bar
  feeSummaryBar: { flexDirection: 'row', borderRadius: 12, marginTop: 12, overflow: 'hidden', paddingVertical: 12, paddingHorizontal: 8, gap: 6 },
  feeSummaryCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  feeSummaryLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  feeSummaryValue: { color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 3 },

  // Form inputs
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 },
  pickerIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pickerText: { flex: 1, fontSize: 15 },
  amountBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  amountPrefix: { fontSize: 20, fontWeight: '800', marginRight: 6 },
  amountInput: { flex: 1, fontSize: 20, fontWeight: '700', paddingVertical: 14 },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },

  // Payment method
  pmChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  pmText: { fontSize: 13, fontWeight: '600' },

  // Error
  errorBox: { marginHorizontal: 16, marginTop: 4, marginBottom: 4, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { flex: 1, fontSize: 13 },

  // Collect button
  collectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, paddingVertical: 17, shadowColor: '#22c55e', shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 4 },
  collectBtnText: { fontSize: 16, fontWeight: '800' },

  // Records
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  recordCard: { borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  recordIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  recordName: { fontSize: 14, fontWeight: '600' },
  recordMeta: { fontSize: 12, marginTop: 2 },
  recordAmt: { fontSize: 14, fontWeight: '700' },
  receiptBtn: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  feeTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1 },
  feeTypeIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  feeTypeName: { fontSize: 15, fontWeight: '600' },
  reminderBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, paddingVertical: 14 },
  reminderBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
