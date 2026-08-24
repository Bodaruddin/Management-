import React, { useState, useMemo, useRef, useEffect } from 'react';
import ViewShot from 'react-native-view-shot';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, ScrollView, Alert, Platform, KeyboardAvoidingView,
  Animated, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useApp, Student, FeeType, SalaryRecord, getStudentFeeInfo, isActiveStudent, compareSalaryRecordsNewestFirst } from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';
import { printFeeReceipt, shareReceiptWhatsApp } from '@/utils/receipt';
import { buildReminderMessage, sendReminderSMS, shareReminderImage } from '@/utils/reminder';
import ReminderCard from '@/components/ReminderCard';

type Tab = 'overview' | 'salary' | 'fees' | 'feeTypes' | 'expenses';
type Period = 'today' | 'week' | 'month' | 'year' | 'all';

const EXPENSE_CATEGORIES = ['Supplies', 'Utilities', 'Salaries', 'Maintenance', 'Events', 'Other'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PAYMENT_METHODS = [
  { value: 'Cash', icon: 'dollar-sign' as const },
  { value: 'Online', icon: 'wifi' as const },
  { value: 'Card', icon: 'credit-card' as const },
  { value: 'Check', icon: 'file-text' as const },
];
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
];
const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'overview', icon: 'bar-chart-2', label: 'Overview' },
  { key: 'salary', icon: 'briefcase', label: 'Salary' },
  { key: 'fees', icon: 'users', label: 'Collect' },
  { key: 'feeTypes', icon: 'tag', label: 'Types' },
  { key: 'expenses', icon: 'trending-down', label: 'Expenses' },
];

// ── Number formatter ─────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toLocaleString('en-IN')}`;
}

// ── Animated horizontal progress bar ─────────────────────────────────────────
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);
  const w = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={{ height: 6, backgroundColor: color + '22', borderRadius: 3, overflow: 'hidden', marginTop: 7 }}>
      <Animated.View style={{ height: 6, width: w, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

// ── Weekly bar chart ──────────────────────────────────────────────────────────
function WeeklyChart({ data, feeColor, expColor }: {
  data: { label: string; fees: number; expenses: number }[];
  feeColor: string; expColor: string;
}) {
  const maxVal = Math.max(...data.flatMap(d => [d.fees, d.expenses]), 1);
  const MAX_H = 84;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8 }}>
      {data.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: MAX_H, gap: 4 }}>
            <View style={{
              width: 13,
              height: Math.max(d.fees > 0 ? 8 : 2, (d.fees / maxVal) * MAX_H),
              backgroundColor: feeColor,
              borderRadius: 4,
            }} />
            <View style={{
              width: 13,
              height: Math.max(d.expenses > 0 ? 6 : 2, (d.expenses / maxVal) * MAX_H),
              backgroundColor: expColor,
              borderRadius: 4,
              opacity: d.expenses > 0 ? 1 : 0.25,
            }} />
          </View>
          <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700' }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function FinanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    students, feeRecords, addFeeRecord, deleteFeeRecord, documentBranding,
    feeTypes, addFeeType, updateFeeType, deleteFeeType,
    expenses, addExpense, deleteExpense,
    salaryRecords,
  } = useApp();

  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('month');
  const [activeMetric, setActiveMetric] = useState<'fees' | 'expenses' | 'net'>('fees');

  // ── Fee collection state ──
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [collectStudent, setCollectStudent] = useState<Student | null>(null);
  const [collectFeeTypeId, setCollectFeeTypeId] = useState('');
  const [collectAmount, setCollectAmount] = useState('');
  const [collectDesc, setCollectDesc] = useState('');
  const [collectDate, setCollectDate] = useState(new Date().toISOString().split('T')[0]);
  const [showFeeHistory, setShowFeeHistory] = useState<Student | null>(null);
  const [showFeeTypePicker, setShowFeeTypePicker] = useState(false);
  const [collectPaymentMethod, setCollectPaymentMethod] = useState('Cash');
  const [feeSearch, setFeeSearch] = useState('');
  const [feeClassFilter, setFeeClassFilter] = useState('All');

  // ── Fee Reminder state ──
  const viewShotRef = useRef<any>(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderStudent, setReminderStudent] = useState<Student | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');

  // ── Fee Type state ──
  const [showFeeTypeModal, setShowFeeTypeModal] = useState(false);
  const [editingFeeType, setEditingFeeType] = useState<FeeType | null>(null);
  const [ftForm, setFtForm] = useState({ name: '', amount: '', description: '' });

  // ── Expense state ──
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expForm, setExpForm] = useState({ description: '', amount: '', category: 'Supplies', date: new Date().toISOString().split('T')[0] });
  const [showCatPicker, setShowCatPicker] = useState(false);

  // ── Generic confirm modal ──
  const [confirmModal, setConfirmModal] = useState<{
    title: string; message: string; onConfirm: () => void;
  } | null>(null);

  // ── Post-collect receipt modal ──
  const [receiptModal, setReceiptModal] = useState<{ record: any; student: Student } | null>(null);

  // ── Date helpers ─────────────────────────────────────────────────────────
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const yearStr = `${now.getFullYear()}`;
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6);
  const weekStartStr = weekStart.toISOString().split('T')[0];

  // ── Period-filtered records ───────────────────────────────────────────────
  const periodFees = useMemo(() => {
    switch (period) {
      case 'today': return feeRecords.filter(f => f.date === todayStr);
      case 'week':  return feeRecords.filter(f => f.date >= weekStartStr && f.date <= todayStr);
      case 'month': return feeRecords.filter(f => f.date.startsWith(monthStr));
      case 'year':  return feeRecords.filter(f => f.date.startsWith(yearStr));
      default:      return feeRecords;
    }
  }, [feeRecords, period, todayStr, weekStartStr, monthStr, yearStr]);

  const periodExpenses = useMemo(() => {
    switch (period) {
      case 'today': return expenses.filter(e => e.date === todayStr);
      case 'week':  return expenses.filter(e => e.date >= weekStartStr && e.date <= todayStr);
      case 'month': return expenses.filter(e => e.date.startsWith(monthStr));
      case 'year':  return expenses.filter(e => e.date.startsWith(yearStr));
      default:      return expenses;
    }
  }, [expenses, period, todayStr, weekStartStr, monthStr, yearStr]);

  const totalFees     = useMemo(() => periodFees.reduce((s, f) => s + f.amount, 0), [periodFees]);
  const totalExpenses = useMemo(() => periodExpenses.reduce((s, e) => s + e.amount, 0), [periodExpenses]);
  const netBalance    = totalFees - totalExpenses;

  // Salary periods use the salary month for month/year/all-time views. The
  // shorter date filters use the actual paid date so they remain useful.
  const salaryPeriodMatches = (record: SalaryRecord) => {
    if (period === 'all') return true;
    if (period === 'today') return record.paidDate === todayStr;
    if (period === 'week') return !!record.paidDate && record.paidDate >= weekStartStr && record.paidDate <= todayStr;
    if (period === 'year') return record.year === now.getFullYear();
    const salaryMonthIndex = MONTHS.indexOf(record.month);
    return record.year === now.getFullYear() && salaryMonthIndex === now.getMonth();
  };

  const periodSalaryRecords = useMemo(
    () => salaryRecords.filter(salaryPeriodMatches).sort(compareSalaryRecordsNewestFirst),
    [salaryRecords, period, todayStr, weekStartStr, now.getFullYear(), now.getMonth()],
  );
  const totalSalaryPaid = useMemo(
    () => periodSalaryRecords.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.amount, 0),
    [periodSalaryRecords],
  );
  const totalSalaryPending = useMemo(
    () => periodSalaryRecords.filter(r => r.status === 'pending').reduce((sum, r) => sum + r.amount, 0),
    [periodSalaryRecords],
  );
  const paidSalaryCount = periodSalaryRecords.filter(r => r.status === 'paid').length;

  // ── Weekly chart data (always current month) ─────────────────────────────
  const weeklyChartData = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const weeks = Array.from({ length: 4 }, (_, w) => ({
      label: `W${w + 1}`,
      start: `${monthStr}-${pad(w * 7 + 1)}`,
      end:   `${monthStr}-${pad(Math.min((w + 1) * 7, 31))}`,
    }));
    return weeks.map(({ label, start, end }) => ({
      label,
      fees:     feeRecords.filter(f => f.date >= start && f.date <= end).reduce((s, f) => s + f.amount, 0),
      expenses: expenses.filter(e => e.date >= start && e.date <= end).reduce((s, e) => s + e.amount, 0),
    }));
  }, [feeRecords, expenses, monthStr]);

  // ── Fee type breakdown for period ────────────────────────────────────────
  const feesByType = useMemo(() => {
    const map: Record<string, number> = {};
    periodFees.forEach(f => {
      const key = f.feeTypeName ?? f.description ?? 'Other';
      map[key] = (map[key] ?? 0) + f.amount;
    });
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount, pct: totalFees > 0 ? amount / totalFees : 0 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [periodFees, totalFees]);

  // ── Recent combined transactions ─────────────────────────────────────────
  const recentTxns = useMemo(() => {
    const fees = periodFees.map(f => ({
      id: f.id, name: f.studentName ?? 'Student',
      sub: f.feeTypeName ?? f.description, amount: f.amount, date: f.date, type: 'fee' as const,
    }));
    const exps = periodExpenses.map(e => ({
      id: e.id, name: e.description,
      sub: e.category, amount: -e.amount, date: e.date, type: 'expense' as const,
    }));
    return [...fees, ...exps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }, [periodFees, periodExpenses]);

  // ── Legacy month-based values (used in student fee cards) ────────────────
  const monthFees     = useMemo(() => feeRecords.filter(f => f.date.startsWith(monthStr)).reduce((s, f) => s + f.amount, 0), [feeRecords, monthStr]);
  const monthExpenses = useMemo(() => expenses.filter(e => e.date.startsWith(monthStr)).reduce((s, e) => s + e.amount, 0), [expenses, monthStr]);

  const getStudentLastFee  = (id: string) => feeRecords.filter(f => f.studentId === id).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const getStudentTotal    = (id: string) => feeRecords.filter(f => f.studentId === id).reduce((s, f) => s + f.amount, 0);
  const activeStudents     = useMemo(() => students.filter(isActiveStudent), [students]);
  const uniqueClasses      = useMemo(() => ['All', ...Array.from(new Set(activeStudents.map(s => s.class))).sort()], [activeStudents]);
  const filteredStudents   = useMemo(() => activeStudents.filter(s => {
    const matchSearch = feeSearch === '' || s.name.toLowerCase().includes(feeSearch.toLowerCase());
    const matchClass  = feeClassFilter === 'All' || s.class === feeClassFilter;
    return matchSearch && matchClass;
  }), [activeStudents, feeSearch, feeClassFilter]);

  // ── Collect fee handlers ──────────────────────────────────────────────────
  const openCollect = (student: Student) => {
    setCollectStudent(student);
    setCollectFeeTypeId('');
    const fi = getStudentFeeInfo(student, feeRecords);
    setCollectAmount(fi.remaining > 0 ? String(fi.remaining) : '');
    setCollectDesc(`Monthly Fee - ${MONTHS[now.getMonth()]} ${now.getFullYear()}`);
    setCollectDate(now.toISOString().split('T')[0]);
    setCollectPaymentMethod('Cash');
    setShowCollectModal(true);
  };
  const selectFeeType = (ft: FeeType) => {
    setCollectFeeTypeId(ft.id);
    setCollectAmount(ft.amount > 0 ? String(ft.amount) : '');
    setCollectDesc(ft.name);
    setShowFeeTypePicker(false);
  };
  const handleCollect = async () => {
    if (!collectFeeTypeId) { Alert.alert('Validation', 'Please select a fee type'); return; }
    if (!collectAmount || Number(collectAmount) <= 0) { Alert.alert('Validation', 'Enter a valid amount'); return; }
    if (!collectDesc.trim()) { Alert.alert('Validation', 'Enter a description'); return; }
    if (!collectStudent) return;
    const finalAmt = Number(collectAmount);
    const selectedFt = feeTypes.find(f => f.id === collectFeeTypeId);
    const isAnnualFee = selectedFt?.category === 'annual' || (selectedFt?.name.toLowerCase().includes('annual fee') ?? false);
    if (isAnnualFee) {
      const fi = getStudentFeeInfo(collectStudent, feeRecords);
      if (fi.annualFee > 0 && finalAmt > fi.remaining) {
        Alert.alert('Overpayment', `Remaining balance is ₹${fi.remaining.toLocaleString('en-IN')}. You cannot collect more than the outstanding balance.`);
        return;
      }
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const feeTypeName = selectedFt?.name;
    const record = addFeeRecord({
      studentId: collectStudent.id, studentName: collectStudent.name, class: collectStudent.class,
      amount: finalAmt, date: collectDate || now.toISOString().split('T')[0],
      description: collectDesc.trim(), feeTypeId: collectFeeTypeId, feeTypeName,
      collectedBy: 'Admin', paymentMethod: collectPaymentMethod,
      feeCategory: isAnnualFee ? 'annual' : 'additional',
    });
    setShowCollectModal(false);
    setReceiptModal({ record, student: collectStudent });
  };
  const confirmDeleteFee = (id: string, desc: string) => {
    setConfirmModal({ title: 'Delete Fee Record', message: `Delete "${desc}"?`, onConfirm: async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); deleteFeeRecord(id); } });
  };

  // ── Fee type handlers ────────────────────────────────────────────────────
  const openAddFeeType  = () => { setEditingFeeType(null); setFtForm({ name: '', amount: '', description: '' }); setShowFeeTypeModal(true); };
  const openEditFeeType = (ft: FeeType) => { setEditingFeeType(ft); setFtForm({ name: ft.name, amount: String(ft.amount), description: ft.description }); setShowFeeTypeModal(true); };
  const handleSaveFeeType = async () => {
    if (!ftForm.name.trim()) { Alert.alert('Validation', 'Enter a fee name'); return; }
    if (ftForm.amount && Number(ftForm.amount) < 0) { Alert.alert('Validation', 'Amount cannot be negative'); return; }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const data = { name: ftForm.name.trim(), amount: ftForm.amount ? Number(ftForm.amount) : 0, description: ftForm.description.trim() };
    if (editingFeeType) updateFeeType(editingFeeType.id, data); else addFeeType(data);
    setShowFeeTypeModal(false);
  };
  const confirmDeleteFeeType = (ft: FeeType) => {
    setConfirmModal({ title: 'Delete Fee Type', message: `Delete "${ft.name}"?`, onConfirm: async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); deleteFeeType(ft.id); } });
  };

  // ── Expense handlers ─────────────────────────────────────────────────────
  const handleAddExpense = async () => {
    if (!expForm.description.trim() || !expForm.amount || Number(expForm.amount) <= 0) { Alert.alert('Validation', 'Fill all fields'); return; }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addExpense({ description: expForm.description.trim(), amount: Number(expForm.amount), date: expForm.date || now.toISOString().split('T')[0], category: expForm.category });
    setExpForm({ description: '', amount: '', category: 'Supplies', date: now.toISOString().split('T')[0] });
    setShowExpenseModal(false);
  };
  const confirmDeleteExpense = (id: string, desc: string) => {
    setConfirmModal({ title: 'Delete Expense', message: `Delete "${desc}"?`, onConfirm: async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); deleteExpense(id); } });
  };

  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;
  const METRIC_COLORS = { fees: colors.success, expenses: colors.destructive, net: colors.primary };

  // ── Stat card config ──────────────────────────────────────────────────────
  const METRICS = [
    { key: 'fees' as const,     label: 'Fees Collected', value: totalFees,     icon: 'arrow-down-circle', color: colors.success },
    { key: 'expenses' as const, label: 'Total Expenses',  value: totalExpenses, icon: 'trending-down',     color: colors.destructive },
    { key: 'net' as const,      label: 'Net Balance',     value: netBalance,    icon: 'briefcase',         color: colors.primary },
  ];

  return (
    <View style={[s.root, { backgroundColor: '#F1F5F9' }]}>

      {/* ── Premium Gradient Header ─────────────────────────────────────── */}
      <LinearGradient
        colors={['#0F2460', '#1E3A8A', '#2952B3']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={s.headerTop}>
          <View>
            <Text style={s.headerEyebrow}>School Finance</Text>
            <Text style={s.headerTitle}>Financial Overview</Text>
          </View>
          <View style={[s.headerBadge, { backgroundColor: 'rgba(200,160,64,0.22)', borderColor: 'rgba(200,160,64,0.45)' }]}>
            <Feather name="shield" size={12} color="#C8A040" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#C8A040', marginLeft: 4 }}>Admin</Text>
          </View>
        </View>

        {/* Period pills */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={{ marginTop: 16 }}
          contentContainerStyle={{ paddingHorizontal: 2, gap: 8, paddingBottom: 4 }}
        >
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPeriod(p.key)}
              style={[s.periodPill, period === p.key && s.periodPillActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.periodPillText, period === p.key && s.periodPillTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {/* ── Tab Bar ────────────────────────────────────────────────────────── */}
      <View style={[s.tabBar, { backgroundColor: '#fff', borderBottomColor: '#E2E8F0' }]}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={s.tabBtn} onPress={() => setTab(t.key)} activeOpacity={0.8}>
              <Feather name={t.icon as any} size={17} color={active ? colors.primary : '#94A3B8'} />
              <Text style={[s.tabLabel, { color: active ? colors.primary : '#94A3B8' }]}>{t.label}</Text>
              {active && <View style={[s.tabIndicator, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ══════════════════════════════════════════════════════════════════════
          OVERVIEW TAB
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: botPad }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Stat Cards ────────────────────────────────────────────────── */}
          <View style={s.statRow}>
            {METRICS.map(m => {
              const active = activeMetric === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[s.statCard, active && { borderColor: m.color, borderWidth: 1.5 }]}
                  onPress={() => setActiveMetric(m.key)}
                  activeOpacity={0.85}
                >
                  <View style={[s.statIconWrap, { backgroundColor: m.color + '18' }]}>
                    <Feather name={m.icon as any} size={18} color={m.color} />
                  </View>
                  <Text style={[s.statValue, { color: m.color }]}>{fmt(m.value)}</Text>
                  <Text style={s.statLabel}>{m.label}</Text>
                  {active && <View style={[s.statActiveDot, { backgroundColor: m.color }]} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Bar Chart ────────────────────────────────────────────────── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Monthly Breakdown</Text>
              <View style={s.legend}>
                <View style={[s.legendDot, { backgroundColor: colors.success }]} />
                <Text style={s.legendText}>Fees</Text>
                <View style={[s.legendDot, { backgroundColor: colors.destructive, marginLeft: 10 }]} />
                <Text style={s.legendText}>Expenses</Text>
              </View>
            </View>
            <WeeklyChart data={weeklyChartData} feeColor={colors.success} expColor={colors.destructive} />
          </View>

          {/* ── Collected by Fee Type ─────────────────────────────────────── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Collected by Fee Type</Text>
              <Text style={s.sectionSub}>{fmt(totalFees)} total</Text>
            </View>
            {feesByType.length === 0 ? (
              <Text style={s.emptyMsg}>No fee collections for this period</Text>
            ) : (
              feesByType.map((ft, i) => {
                const DOT_COLORS = [colors.primary, colors.success, colors.warning, '#8B5CF6', '#06B6D4', '#C8A040'];
                const dotColor = DOT_COLORS[i % DOT_COLORS.length];
                return (
                  <View key={ft.name} style={s.feeTypeRow}>
                    <View style={s.feeTypeLeft}>
                      <View style={[s.feeTypeDot, { backgroundColor: dotColor }]} />
                      <Text style={s.feeTypeName} numberOfLines={1}>{ft.name}</Text>
                    </View>
                    <View style={s.feeTypeRight}>
                      <Text style={[s.feeTypeAmount, { color: colors.text }]}>₹{ft.amount.toLocaleString('en-IN')}</Text>
                      <Text style={s.feeTypePct}>{(ft.pct * 100).toFixed(1)}%</Text>
                    </View>
                    <ProgressBar pct={ft.pct} color={dotColor} />
                  </View>
                );
              })
            )}
          </View>

          {/* ── Recent Transactions ───────────────────────────────────────── */}
          <View style={[s.section, { marginBottom: 8 }]}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Transactions ({recentTxns.length})</Text>
              {recentTxns.length > 0 && (
                <TouchableOpacity onPress={() => setTab('fees')} activeOpacity={0.8}>
                  <Text style={[s.sectionSub, { color: colors.primary, fontWeight: '700' }]}>Manage →</Text>
                </TouchableOpacity>
              )}
            </View>
            {recentTxns.length === 0 ? (
              <Text style={s.emptyMsg}>No transactions for this period</Text>
            ) : (
              recentTxns.map(txn => (
                <View key={txn.id} style={s.txnRow}>
                  <View style={[s.txnAvatar, {
                    backgroundColor: txn.type === 'fee' ? colors.success + '18' : colors.destructive + '18',
                  }]}>
                    <Text style={[s.txnAvatarText, { color: txn.type === 'fee' ? colors.success : colors.destructive }]}>
                      {txn.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.txnName} numberOfLines={1}>{txn.name}</Text>
                    <Text style={s.txnSub} numberOfLines={1}>{txn.sub} • {txn.date}</Text>
                  </View>
                  <Text style={[s.txnAmount, { color: txn.amount > 0 ? colors.success : colors.destructive }]}>
                    {txn.amount > 0 ? '+' : ''}₹{Math.abs(txn.amount).toLocaleString('en-IN')}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SALARY TAB
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'salary' && (
        <FlatList
          data={periodSalaryRecords}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={(
            <View>
              <View style={salary.summaryCard}>
                <View style={salary.summaryTop}>
                  <View style={[salary.summaryIcon, { backgroundColor: colors.success + '18' }]}>
                    <Feather name="check-circle" size={19} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={salary.summaryEyebrow}>SALARY PAID</Text>
                    <Text style={[salary.summaryValue, { color: colors.text }]}>{fmt(totalSalaryPaid)}</Text>
                    <Text style={[salary.summaryPeriod, { color: colors.mutedForeground }]}>
                      {paidSalaryCount} payment{paidSalaryCount === 1 ? '' : 's'} · {PERIODS.find(item => item.key === period)?.label}
                    </Text>
                  </View>
                  <View style={salary.summaryStatus}>
                    <Text style={[salary.summaryStatusValue, { color: colors.success }]}>{paidSalaryCount}</Text>
                    <Text style={salary.summaryStatusLabel}>PAID</Text>
                  </View>
                </View>
                <View style={[salary.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={salary.summaryBottom}>
                  <View>
                    <Text style={[salary.summaryMetricLabel, { color: colors.mutedForeground }]}>Pending</Text>
                    <Text style={[salary.summaryMetricValue, { color: totalSalaryPending > 0 ? colors.warning : colors.mutedForeground }]}>
                      {fmt(totalSalaryPending)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[salary.summaryMetricLabel, { color: colors.mutedForeground }]}>Total records</Text>
                    <Text style={[salary.summaryMetricValue, { color: colors.text }]}>{periodSalaryRecords.length}</Text>
                  </View>
                </View>
              </View>

              <View style={salary.historyHeader}>
                <View>
                  <Text style={[s.sectionTitle, { color: colors.text }]}>Payment History</Text>
                  <Text style={[s.sectionSub, { marginTop: 3 }]}>
                    {periodSalaryRecords.length ? 'Latest salary payments' : 'No salary payments for this period'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[salary.manageBtn, { borderColor: colors.primary + '50', backgroundColor: colors.primary + '0D' }]}
                  onPress={() => Alert.alert('Manage salary', 'Add or remove salary payments from the Teachers section.')}
                  activeOpacity={0.8}
                >
                  <Feather name="arrow-up-right" size={14} color={colors.primary} />
                  <Text style={[salary.manageText, { color: colors.primary }]}>Manage</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="briefcase" title="No Salary Payments" subtitle="Salary payments will appear here after they are recorded for teachers." />}
          renderItem={({ item }) => {
            const isPaid = item.status === 'paid';
            return (
              <View style={salary.recordCard}>
                <View style={[salary.recordIcon, { backgroundColor: isPaid ? colors.success + '15' : colors.warning + '18' }]}>
                  <Feather name={isPaid ? 'check' : 'clock'} size={17} color={isPaid ? colors.success : colors.warning} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[salary.teacherName, { color: colors.text }]} numberOfLines={1}>{item.teacherName || 'Teacher'}</Text>
                  <Text style={[salary.recordMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {item.month} {item.year} · {isPaid ? `Paid ${item.paidDate ?? '—'}` : 'Payment pending'}
                  </Text>
                  {item.receiptNumber ? (
                    <Text style={[salary.receipt, { color: colors.mutedForeground }]} numberOfLines={1}>
                      Receipt {item.receiptNumber}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                  <Text style={[salary.amount, { color: isPaid ? colors.success : colors.warning }]}>
                    ₹{item.amount.toLocaleString('en-IN')}
                  </Text>
                  <View style={[salary.statusBadge, { backgroundColor: isPaid ? colors.success + '16' : colors.warning + '18' }]}>
                    <Text style={{ color: isPaid ? colors.success : colors.warning, fontSize: 10, fontWeight: '800' }}>
                      {isPaid ? 'PAID' : 'PENDING'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          FEE COLLECTION TAB
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'fees' && (
        <FlatList
          data={filteredStudents}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
          ListHeaderComponent={() => (
            <View style={{ marginBottom: 12 }}>
              <View style={[fc.searchBar, { backgroundColor: '#fff', borderColor: '#E2E8F0' }]}>
                <Feather name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={{ flex: 1, color: colors.text, fontSize: 15, marginLeft: 8 }}
                  placeholder="Search students..."
                  placeholderTextColor={colors.mutedForeground}
                  value={feeSearch}
                  onChangeText={setFeeSearch}
                />
                {feeSearch !== '' && (
                  <TouchableOpacity onPress={() => setFeeSearch('')}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {uniqueClasses.map(cls => (
                  <TouchableOpacity
                    key={cls}
                    style={[fc.classPill, feeClassFilter === cls && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setFeeClassFilter(cls)}
                  >
                    <Text style={[fc.classPillText, feeClassFilter === cls && { color: '#fff' }]}>{cls}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="dollar-sign" title="No Students" subtitle={feeSearch || feeClassFilter !== 'All' ? 'No students match your filter' : 'Add students to manage fees'} />}
          renderItem={({ item: st }) => {
            const last = getStudentLastFee(st.id);
            const fi = getStudentFeeInfo(st, feeRecords);
            const STATUS_COLORS: Record<string, string> = { paid: colors.success, partial: colors.warning, pending: colors.destructive, 'no-fee': colors.mutedForeground };
            const STATUS_LABELS: Record<string, string> = { paid: 'Paid', partial: 'Partial', pending: 'Pending', 'no-fee': 'No Fee Set' };
            const statusColor = STATUS_COLORS[fi.status];
            return (
              <View style={fc.card}>
                <View style={fc.row}>
                  <View style={[fc.avatar, { backgroundColor: colors.primary + '18' }]}>
                    <Text style={[fc.avatarText, { color: colors.primary }]}>{st.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[fc.name, { color: colors.text }]}>{st.name}</Text>
                    <Text style={[fc.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      Father: {st.fatherName || '—'}
                    </Text>
                    <Text style={[fc.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {st.class} • Roll No: {st.rollNumber || '—'}
                    </Text>
                    {last && <Text style={[fc.sub, { color: colors.mutedForeground }]}>Last: {last.date}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[fc.statusBadge, { backgroundColor: statusColor + '20' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{STATUS_LABELS[fi.status]}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={[fc.remindBtn, { backgroundColor: '#FF980015', borderWidth: 1, borderColor: '#FF9800' }]}
                        onPress={() => { setReminderStudent(st); setReminderMessage(buildReminderMessage(st)); setShowReminderModal(true); }}
                        activeOpacity={0.8}
                      >
                        <Feather name="bell" size={12} color="#FF9800" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[fc.collectBtn, { backgroundColor: colors.primary }]}
                        onPress={() => openCollect(st)}
                        activeOpacity={0.8}
                      >
                        <Text style={fc.collectText}>{fi.status === 'paid' ? '+ More' : '+ Collect'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                {fi.annualFee > 0 && (
                  <View style={[fc.feeStrip, { borderTopColor: '#F1F5F9', backgroundColor: '#F8FAFC' }]}>
                    {[
                      { label: 'Annual', value: `₹${fi.annualFee.toLocaleString('en-IN')}`, color: colors.text },
                      { label: 'Payable', value: `₹${fi.finalPayable.toLocaleString('en-IN')}`, color: colors.text },
                      { label: 'Paid', value: `₹${fi.totalPaid.toLocaleString('en-IN')}`, color: colors.success },
                      { label: 'Balance', value: `₹${fi.remaining.toLocaleString('en-IN')}`, color: fi.remaining > 0 ? colors.destructive : colors.success },
                    ].map(item => (
                      <View key={item.label} style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 9, color: colors.mutedForeground, fontWeight: '600', marginBottom: 2 }}>{item.label}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: item.color }}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={[fc.histBtn, { borderTopColor: '#F1F5F9' }]} onPress={() => setShowFeeHistory(st)} activeOpacity={0.8}>
                  <Feather name="clock" size={13} color={colors.mutedForeground} />
                  <Text style={[fc.histText, { color: colors.mutedForeground }]}>View payment history</Text>
                  <Feather name="chevron-right" size={13} color={colors.mutedForeground} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          FEE TYPES TAB
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'feeTypes' && (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <TouchableOpacity style={[s.addBtn, { borderColor: colors.primary }]} onPress={openAddFeeType} activeOpacity={0.8}>
              <Feather name="plus" size={18} color={colors.primary} />
              <Text style={[s.addBtnText, { color: colors.primary }]}>Create Fee Type</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={feeTypes}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
            ListEmptyComponent={<EmptyState icon="tag" title="No Fee Types" subtitle="Create fee types like Monthly Fee, Exam Fee, etc." />}
            renderItem={({ item: ft }) => (
              <View style={ftc.card}>
                <View style={[ftc.icon, { backgroundColor: colors.primary + '15' }]}>
                  <Feather name="tag" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ftc.name, { color: colors.text }]}>{ft.name}</Text>
                  {ft.description ? <Text style={[ftc.desc, { color: colors.mutedForeground }]}>{ft.description}</Text> : null}
                </View>
                <Text style={[ftc.amount, { color: ft.amount > 0 ? colors.success : colors.mutedForeground }]}>{ft.amount > 0 ? `₹${ft.amount.toLocaleString('en-IN')}` : 'Variable'}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 8 }}>
                  <TouchableOpacity onPress={() => openEditFeeType(ft)} style={ftc.iconBtn}><Feather name="edit-2" size={16} color={colors.primary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDeleteFeeType(ft)} style={ftc.iconBtn}><Feather name="trash-2" size={16} color={colors.destructive} /></TouchableOpacity>
                </View>
              </View>
            )}
          />
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          EXPENSES TAB
         ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'expenses' && (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <TouchableOpacity style={[s.addBtn, { borderColor: colors.destructive }]} onPress={() => setShowExpenseModal(true)} activeOpacity={0.8}>
              <Feather name="plus" size={18} color={colors.destructive} />
              <Text style={[s.addBtnText, { color: colors.destructive }]}>Add Expense</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={[...expenses].sort((a, b) => b.date.localeCompare(a.date))}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
            ListEmptyComponent={<EmptyState icon="trending-down" title="No Expenses" subtitle="Track school expenses here" />}
            renderItem={({ item: exp }) => (
              <View style={ec.card}>
                <View style={[ec.icon, { backgroundColor: colors.destructive + '15' }]}>
                  <Feather name="tag" size={18} color={colors.destructive} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ec.desc, { color: colors.text }]}>{exp.description}</Text>
                  <Text style={[ec.meta, { color: colors.mutedForeground }]}>{exp.category} • {exp.date}</Text>
                </View>
                <Text style={[ec.amount, { color: colors.destructive }]}>₹{exp.amount.toLocaleString('en-IN')}</Text>
                <TouchableOpacity onPress={() => confirmDeleteExpense(exp.id, exp.description)} style={{ padding: 6, marginLeft: 4 }}>
                  <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ALL MODALS (unchanged)
         ════════════════════════════════════════════════════════════════════ */}

      {/* Collect Fee Modal */}
      <Modal visible={showCollectModal} animationType="slide" transparent={false}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flex: 1 }}>
            <View style={{ backgroundColor: colors.primary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <View>
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>Fee Collection</Text>
                  <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2 }}>{collectStudent?.name ?? ''}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 }}>{collectStudent?.class} • Roll {collectStudent?.rollNumber}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCollectModal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="x" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              {collectStudent && (() => {
                const fi = getStudentFeeInfo(collectStudent, feeRecords);
                if (fi.annualFee <= 0) return null;
                return (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      { label: 'Payable', value: `₹${fi.finalPayable.toLocaleString('en-IN')}`, bg: 'rgba(255,255,255,0.15)' },
                      { label: 'Paid', value: `₹${fi.totalPaid.toLocaleString('en-IN')}`, bg: 'rgba(255,255,255,0.15)' },
                      { label: 'Balance Due', value: `₹${fi.remaining.toLocaleString('en-IN')}`, bg: fi.remaining > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)' },
                    ].map(item => (
                      <View key={item.label} style={{ flex: 1, backgroundColor: item.bg, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>{item.label}</Text>
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 3 }}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </View>
            <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[mo.label, { color: colors.text }]}>Fee Type *</Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1.5, borderColor: collectFeeTypeId ? colors.primary + '60' : colors.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}
                onPress={() => setShowFeeTypePicker(true)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="tag" size={14} color={colors.primary} />
                  </View>
                  <Text style={{ color: collectFeeTypeId ? colors.text : colors.mutedForeground, fontSize: 15, fontWeight: collectFeeTypeId ? '600' : '400' }}>
                    {collectFeeTypeId ? feeTypes.find(f => f.id === collectFeeTypeId)?.name : 'Select a fee type...'}
                  </Text>
                </View>
                <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[mo.label, { color: colors.text }]}>Amount (₹) *</Text>
              <View style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.primary, marginRight: 8 }}>₹</Text>
                <TextInput
                  style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '700', paddingVertical: 14 }}
                  value={collectAmount} onChangeText={setCollectAmount}
                  placeholder="0" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad"
                />
              </View>
              <Text style={[mo.label, { color: colors.text }]}>Description *</Text>
              <TextInput
                style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.text, marginBottom: 16 }}
                value={collectDesc} onChangeText={setCollectDesc}
                placeholder="e.g. Monthly Fee July 2026" placeholderTextColor={colors.mutedForeground}
              />
              <Text style={[mo.label, { color: colors.text }]}>Date</Text>
              <TextInput
                style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.text, marginBottom: 16 }}
                value={collectDate} onChangeText={setCollectDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
              />
              <Text style={[mo.label, { color: colors.text }]}>Payment Method</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {PAYMENT_METHODS.map(pm => (
                  <TouchableOpacity
                    key={pm.value}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: collectPaymentMethod === pm.value ? colors.primary : colors.border, backgroundColor: collectPaymentMethod === pm.value ? colors.primary + '12' : colors.card, shadowColor: collectPaymentMethod === pm.value ? colors.primary : 'transparent', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: collectPaymentMethod === pm.value ? 2 : 0 }}
                    onPress={() => setCollectPaymentMethod(pm.value)}
                  >
                    <Feather name={pm.icon} size={14} color={collectPaymentMethod === pm.value ? colors.primary : colors.mutedForeground} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: collectPaymentMethod === pm.value ? colors.primary : colors.text }}>{pm.value}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={{ padding: 16, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.border, gap: 10, backgroundColor: colors.card }}>
              {(() => {
                const amt = Number(collectAmount) || 0;
                return (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: collectFeeTypeId && amt > 0 ? colors.success : colors.muted, borderRadius: 16, paddingVertical: 16 }}
                    onPress={handleCollect} disabled={!collectFeeTypeId || amt <= 0} activeOpacity={0.85}
                  >
                    <Feather name="check-circle" size={18} color={collectFeeTypeId && amt > 0 ? '#fff' : colors.mutedForeground} />
                    <Text style={{ color: collectFeeTypeId && amt > 0 ? '#fff' : colors.mutedForeground, fontSize: 16, fontWeight: '800' }}>
                      Collect ₹{amt > 0 ? amt.toLocaleString('en-IN') : '0'}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
              <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 8 }} onPress={() => setShowCollectModal(false)}>
                <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Fee Type Picker */}
      <Modal visible={showFeeTypePicker} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: colors.card, maxHeight: 420 }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <Text style={[mo.title, { color: colors.text }]}>Select Fee Type</Text>
              <TouchableOpacity onPress={() => setShowFeeTypePicker(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView>
              {feeTypes.map(ft => (
                <TouchableOpacity key={ft.id} style={[picker.row, { borderBottomColor: colors.border }]} onPress={() => selectFeeType(ft)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[picker.name, { color: colors.text }]}>{ft.name}</Text>
                    {ft.description ? <Text style={[picker.desc, { color: colors.mutedForeground }]}>{ft.description}</Text> : null}
                  </View>
                  <Text style={[picker.amount, { color: ft.amount > 0 ? colors.success : colors.mutedForeground }]}>{ft.amount > 0 ? `₹${ft.amount.toLocaleString('en-IN')}` : 'Variable'}</Text>
                  {collectFeeTypeId === ft.id && <Feather name="check" size={18} color={colors.primary} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              ))}
              {feeTypes.length === 0 && <Text style={{ color: colors.mutedForeground, textAlign: 'center', padding: 20 }}>No fee types created yet</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Fee History Modal */}
      <Modal visible={!!showFeeHistory} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: colors.card }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[mo.title, { color: colors.text }]}>{showFeeHistory?.name}</Text>
                <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Fee Payment History</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFeeHistory(null)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            {showFeeHistory && (() => {
              const records = feeRecords.filter(f => f.studentId === showFeeHistory.id).sort((a, b) => b.date.localeCompare(a.date));
              const fi = getStudentFeeInfo(showFeeHistory, feeRecords);
              const STATUS_COLORS: Record<string, string> = { paid: colors.success, partial: colors.warning, pending: colors.destructive, 'no-fee': colors.mutedForeground };
              const STATUS_LABELS: Record<string, string> = { paid: 'Fully Paid', partial: 'Partial', pending: 'Pending', 'no-fee': 'No Fee Set' };
              return (
                <>
                  {fi.annualFee > 0 ? (
                    <View style={{ backgroundColor: colors.muted, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      {[
                        { label: 'Annual Fee', value: `₹${fi.annualFee.toLocaleString('en-IN')}`, color: colors.text },
                        { label: 'Discount', value: `− ₹${fi.discountAmount.toLocaleString('en-IN')}`, color: colors.warning },
                        { label: 'Final Payable', value: `₹${fi.finalPayable.toLocaleString('en-IN')}`, color: colors.text, bold: true },
                        { label: 'Total Paid', value: `₹${fi.totalPaid.toLocaleString('en-IN')}`, color: colors.success, bold: true },
                        { label: 'Balance', value: `₹${fi.remaining.toLocaleString('en-IN')}`, color: fi.remaining > 0 ? colors.destructive : colors.success, bold: true },
                      ].map(row => (
                        <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border + '60' }}>
                          <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{row.label}</Text>
                          <Text style={{ fontSize: 14, fontWeight: row.bold ? '700' : '500', color: row.color }}>{row.value}</Text>
                        </View>
                      ))}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 9 }}>
                        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Status</Text>
                        <View style={{ backgroundColor: STATUS_COLORS[fi.status] + '20', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: STATUS_COLORS[fi.status] }}>{STATUS_LABELS[fi.status]}</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={[hist.totalRow, { backgroundColor: colors.success + '15', borderBottomColor: colors.border }]}>
                      <Text style={[hist.totalLabel, { color: colors.mutedForeground }]}>Total Collected</Text>
                      <Text style={[hist.totalVal, { color: colors.success }]}>₹{fi.totalPaid.toLocaleString('en-IN')}</Text>
                    </View>
                  )}
                  <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: 20 }}>
                    {records.length === 0 && <Text style={{ color: colors.mutedForeground, textAlign: 'center', padding: 20 }}>No fee records found</Text>}
                    {records.map(f => (
                      <View key={f.id} style={[hist.row, { borderBottomColor: colors.border }]}>
                        <View style={[hist.icon, { backgroundColor: colors.success + '15' }]}>
                          <Feather name="check-circle" size={16} color={colors.success} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[hist.desc, { color: colors.text }]}>{f.description}</Text>
                          <Text style={[hist.meta, { color: colors.mutedForeground }]}>{f.date} • By {f.collectedBy}{f.paymentMethod ? ` • ${f.paymentMethod}` : ''}</Text>
                          {f.receiptNumber && <Text style={{ fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>Receipt: {f.receiptNumber}</Text>}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[hist.amount, { color: colors.success }]}>₹{f.amount.toLocaleString('en-IN')}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <TouchableOpacity onPress={() => shareReceiptWhatsApp(f, showFeeHistory, documentBranding)}>
                              <FontAwesome5 name="whatsapp" size={20} color="#25D366" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => printFeeReceipt(f, showFeeHistory, documentBranding)}>
                              <Feather name="printer" size={15} color={colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => confirmDeleteFee(f.id, f.description)}>
                              <Feather name="trash-2" size={15} color={colors.destructive} />
                            </TouchableOpacity>
                          </View>
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

      {/* Fee Type Add/Edit Modal */}
      <Modal visible={showFeeTypeModal} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: colors.card }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <Text style={[mo.title, { color: colors.text }]}>{editingFeeType ? 'Edit Fee Type' : 'Create Fee Type'}</Text>
              <TouchableOpacity onPress={() => setShowFeeTypeModal(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              {([
                { key: 'name', label: 'Fee Name *', placeholder: 'e.g. Monthly Fee, Exam Fee' },
                { key: 'amount', label: 'Default Amount (₹)', placeholder: 'Optional – enter when collecting', keyboard: 'number-pad' as const },
                { key: 'description', label: 'Description', placeholder: 'Brief description (optional)' },
              ] as { key: keyof typeof ftForm; label: string; placeholder: string; keyboard?: any }[]).map(f => (
                <View key={f.key} style={{ marginBottom: 16 }}>
                  <Text style={[mo.label, { color: colors.text }]}>{f.label}</Text>
                  <TextInput style={[mo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]} value={ftForm[f.key]} onChangeText={v => setFtForm(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} placeholderTextColor={colors.mutedForeground} keyboardType={f.keyboard} />
                </View>
              ))}
            </ScrollView>
            <View style={[mo.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[mo.btn, { borderColor: colors.border }]} onPress={() => setShowFeeTypeModal(false)}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mo.btn, { flex: 2, backgroundColor: colors.primary }]} onPress={handleSaveFeeType}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{editingFeeType ? 'Save Changes' : 'Create Fee Type'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Expense Modal */}
      <Modal visible={showExpenseModal} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: colors.card }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <Text style={[mo.title, { color: colors.text }]}>Add Expense</Text>
              <TouchableOpacity onPress={() => setShowExpenseModal(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              {([
                { key: 'description', label: 'Description *', placeholder: 'e.g. Electricity Bill' },
                { key: 'amount', label: 'Amount (₹) *', placeholder: 'Enter amount', keyboard: 'number-pad' as const },
                { key: 'date', label: 'Date', placeholder: 'YYYY-MM-DD' },
              ] as { key: keyof typeof expForm; label: string; placeholder: string; keyboard?: any }[]).map(f => (
                <View key={f.key} style={{ marginBottom: 16 }}>
                  <Text style={[mo.label, { color: colors.text }]}>{f.label}</Text>
                  <TextInput style={[mo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]} value={expForm[f.key]} onChangeText={v => setExpForm(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} placeholderTextColor={colors.mutedForeground} keyboardType={f.keyboard} />
                </View>
              ))}
              <View style={{ marginBottom: 16 }}>
                <Text style={[mo.label, { color: colors.text }]}>Category</Text>
                <TouchableOpacity style={[mo.input, { backgroundColor: colors.muted, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setShowCatPicker(true)}>
                  <Text style={{ color: colors.text }}>{expForm.category}</Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </ScrollView>
            <View style={[mo.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[mo.btn, { borderColor: colors.border }]} onPress={() => setShowExpenseModal(false)}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mo.btn, { flex: 2, backgroundColor: colors.destructive }]} onPress={handleAddExpense}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add Expense</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Category Picker */}
      <Modal visible={showCatPicker} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: colors.card, maxHeight: 400 }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <Text style={[mo.title, { color: colors.text }]}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCatPicker(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            {EXPENSE_CATEGORIES.map(cat => (
              <TouchableOpacity key={cat} style={[picker.row, { borderBottomColor: colors.border }]} onPress={() => { setExpForm(p => ({ ...p, category: cat })); setShowCatPicker(false); }}>
                <Text style={[picker.name, { color: expForm.category === cat ? colors.primary : colors.text }]}>{cat}</Text>
                {expForm.category === cat && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal visible={!!confirmModal} animationType="fade" transparent>
        <View style={cd.overlay}>
          <View style={[cd.box, { backgroundColor: colors.card }]}>
            <View style={cd.iconWrap}>
              <Feather name="trash-2" size={28} color={colors.destructive} />
            </View>
            <Text style={[cd.title, { color: colors.text }]}>{confirmModal?.title}</Text>
            <Text style={[cd.message, { color: colors.mutedForeground }]}>{confirmModal?.message}</Text>
            <View style={cd.btnRow}>
              <TouchableOpacity style={[cd.btn, { borderColor: colors.border, borderWidth: 1 }]} onPress={() => setConfirmModal(null)} activeOpacity={0.8}>
                <Text style={[cd.btnTxt, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[cd.btn, { backgroundColor: colors.destructive }]} onPress={() => { confirmModal?.onConfirm(); setConfirmModal(null); }} activeOpacity={0.8}>
                <Feather name="trash-2" size={15} color="#fff" />
                <Text style={[cd.btnTxt, { color: '#fff' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fee Reminder Modal */}
      <Modal visible={showReminderModal} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: colors.card }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FF980020', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="bell" size={18} color="#FF9800" />
                </View>
                <View>
                  <Text style={[mo.title, { color: colors.text }]}>Send Fee Reminder</Text>
                  {reminderStudent && <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{reminderStudent.name} • {reminderStudent.class}</Text>}
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowReminderModal(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {reminderStudent && (
                <>
                  {!reminderStudent.mobileNumber && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.destructive + '12', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: colors.destructive + '40' }}>
                      <Feather name="alert-circle" size={14} color={colors.destructive} />
                      <Text style={{ fontSize: 12, color: colors.destructive, flex: 1 }}>No mobile number on record for this student.</Text>
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
                      logoDataUrl={documentBranding.logoDataUrl}
                    />
                  </ViewShot>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>This card will be shared as an image on WhatsApp</Text>
                </>
              )}
            </ScrollView>
            <View style={[mo.footer, { borderTopColor: colors.border, flexDirection: 'column', gap: 10, alignItems: 'stretch' }]}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 14 }}
                  onPress={async () => {
                    if (!reminderStudent || !viewShotRef.current) return;
                    try {
                      const uri: string = await viewShotRef.current.capture();
                      await shareReminderImage(uri, reminderStudent);
                    } catch { Alert.alert('Error', 'Could not generate reminder card. Please try SMS.'); }
                  }}
                  activeOpacity={0.8}
                >
                  <FontAwesome5 name="whatsapp" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Share Image</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14 }}
                  onPress={async () => { if (reminderStudent) await sendReminderSMS(reminderStudent, reminderMessage); }}
                  activeOpacity={0.8}
                >
                  <Feather name="message-square" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>SMS</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowReminderModal(false)} activeOpacity={0.8}>
                <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt Prompt Modal */}
      <Modal visible={!!receiptModal} animationType="fade" transparent>
        <View style={cd.overlay}>
          <View style={[cd.box, { backgroundColor: colors.card }]}>
            <View style={[cd.iconWrap, { backgroundColor: colors.success + '18' }]}>
              <Feather name="check-circle" size={28} color={colors.success} />
            </View>
            <Text style={[cd.title, { color: colors.text }]}>Fee Collected!</Text>
            <Text style={[cd.message, { color: colors.mutedForeground }]}>
              ₹{receiptModal?.record?.amount?.toLocaleString('en-IN')} collected.{'\n'}Send receipt to parent?
            </Text>
            <View style={[cd.btnRow, { flexDirection: 'column', gap: 10 }]}>
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <TouchableOpacity style={[cd.btn, { flex: 1, backgroundColor: '#25D366' }]} onPress={() => { if (receiptModal) shareReceiptWhatsApp(receiptModal.record, receiptModal.student, documentBranding); setReceiptModal(null); }} activeOpacity={0.8}>
                  <FontAwesome5 name="whatsapp" size={20} color="#fff" />
                  <Text style={[cd.btnTxt, { color: '#fff' }]}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[cd.btn, { flex: 1, backgroundColor: colors.primary }]} onPress={() => { if (receiptModal) printFeeReceipt(receiptModal.record, receiptModal.student, documentBranding); setReceiptModal(null); }} activeOpacity={0.8}>
                  <Feather name="printer" size={15} color="#fff" />
                  <Text style={[cd.btnTxt, { color: '#fff' }]}>Print PDF</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[cd.btn, { width: '100%', borderColor: colors.border, borderWidth: 1 }]} onPress={() => setReceiptModal(null)} activeOpacity={0.8}>
                <Text style={[cd.btnTxt, { color: colors.mutedForeground }]}>Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StyleSheets
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerEyebrow: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },

  // Period pills
  periodPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', marginRight: 8 },
  periodPillActive: { backgroundColor: '#C8A040', borderColor: '#C8A040' },
  periodPillText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  periodPillTextActive: { color: '#fff' },

  // Tab bar
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, gap: 3, position: 'relative' },
  tabLabel: { fontSize: 11, fontWeight: '700' },
  tabIndicator: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2.5, borderRadius: 2 },

  // Overview sections
  statRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 8 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'flex-start', shadowColor: '#0C1F4A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: 'transparent' },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 16, fontWeight: '800', marginBottom: 3 },
  statLabel: { fontSize: 10, color: '#64748B', fontWeight: '600', lineHeight: 14 },
  statActiveDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },

  section: { backgroundColor: '#fff', borderRadius: 18, marginHorizontal: 16, marginTop: 12, padding: 18, shadowColor: '#0C1F4A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0C1F4A' },
  sectionSub: { fontSize: 12, color: '#64748B', fontWeight: '600' },

  legend: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#64748B', fontWeight: '600', marginLeft: 4 },

  feeTypeRow: { marginBottom: 14 },
  feeTypeLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  feeTypeDot: { width: 9, height: 9, borderRadius: 5 },
  feeTypeName: { fontSize: 13, fontWeight: '600', color: '#0C1F4A', flex: 1 },
  feeTypeRight: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingLeft: 17 },
  feeTypeAmount: { fontSize: 14, fontWeight: '700' },
  feeTypePct: { fontSize: 12, color: '#64748B', fontWeight: '600' },

  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  txnAvatar: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  txnAvatarText: { fontSize: 15, fontWeight: '800' },
  txnName: { fontSize: 14, fontWeight: '700', color: '#0C1F4A' },
  txnSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  txnAmount: { fontSize: 14, fontWeight: '800', minWidth: 72, textAlign: 'right' },

  emptyMsg: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 16 },

  // Fee types & expenses tabs
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, borderStyle: 'dashed' },
  addBtnText: { fontWeight: '600', fontSize: 14 },
});

const fc = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, marginBottom: 10 },
  classPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  classPillText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  collectBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  collectText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  remindBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  feeStrip: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1 },
  histBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1 },
  histText: { fontSize: 13, fontWeight: '500' },
});

const ftc = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  name: { fontSize: 15, fontWeight: '600' },
  desc: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '700' },
  iconBtn: { padding: 6 },
});

const ec = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  desc: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '700' },
});

const salary = StyleSheet.create({
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#0C1F4A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center' },
  summaryIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  summaryEyebrow: { fontSize: 10, color: '#64748B', fontWeight: '800', letterSpacing: 0.8 },
  summaryValue: { fontSize: 25, fontWeight: '800', marginTop: 2 },
  summaryPeriod: { fontSize: 11, marginTop: 2 },
  summaryStatus: { alignItems: 'center', justifyContent: 'center', minWidth: 48, paddingLeft: 8 },
  summaryStatusValue: { fontSize: 20, fontWeight: '800' },
  summaryStatusLabel: { fontSize: 9, color: '#64748B', fontWeight: '800', letterSpacing: 0.6, marginTop: 1 },
  summaryDivider: { height: 1, marginVertical: 16 },
  summaryBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryMetricLabel: { fontSize: 11, fontWeight: '600' },
  summaryMetricValue: { fontSize: 15, fontWeight: '800', marginTop: 3 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  manageBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 },
  manageText: { fontSize: 11, fontWeight: '800' },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  recordIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  teacherName: { fontSize: 14, fontWeight: '800' },
  recordMeta: { fontSize: 11, marginTop: 3 },
  receipt: { fontSize: 10, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '800', marginBottom: 5 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3 },
});

const mo = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', minHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  stuBadge: { flexDirection: 'row', alignItems: 'center', padding: 14, marginHorizontal: 20, marginTop: 20, borderRadius: 14, gap: 12 },
  stuAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  footer: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 14 },
});

const picker = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  name: { fontSize: 15, fontWeight: '500' },
  desc: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700' },
});

const hist = StyleSheet.create({
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  totalLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  totalVal: { fontSize: 20, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  desc: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700' },
});

const cd = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  box: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  iconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 13 },
  btnTxt: { fontSize: 14, fontWeight: '700' },
});
