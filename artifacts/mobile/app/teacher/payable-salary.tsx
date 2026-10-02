import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Platform, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useApp, compareSalaryRecordsNewestFirst, type SalaryRecord } from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';
import { calculateTeacherMonthlySalary, getTeacherSalaryBreakdown } from '@/utils/teacherSalary';

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatJoiningMonth(joinDate?: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(joinDate ?? '');
  if (!match) return 'joining date not set';
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex >= monthNames.length) return 'joining date not set';
  return `${monthNames[monthIndex]} ${match[1]}`;
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface PayableSalaryItem extends SalaryRecord {
  calculatedFromAttendance: boolean;
}

export default function TeacherPayableSalary() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    salaryRecords,
    teachers,
    teacherAttendanceRecords,
    teacherHolidays,
    teacherLeaves,
    teacherAttendanceSettings,
  } = useApp();

  const myTeacher = teachers.find(teacher => teacher.id === user?.id);
  const payableRecords = useMemo(() => {
    if (!user || !myTeacher) return [];

    const periodKey = (year: number, month: string) => `${year}-${month}`;
    const paidPeriods = new Set(
      salaryRecords
        .filter(record => record.teacherId === user.id && record.status === 'paid')
        .map(record => periodKey(record.year, record.month)),
    );
    const pendingByPeriod = new Map<string, SalaryRecord>();
    salaryRecords
      .filter(record => record.teacherId === user.id && record.status === 'pending')
      .sort(compareSalaryRecordsNewestFirst)
      .forEach(record => {
        const key = periodKey(record.year, record.month);
        if (!pendingByPeriod.has(key)) pendingByPeriod.set(key, record);
      });

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const joinedMonth = /^(\d{4})-(\d{2})/.exec(myTeacher.joinDate ?? '');
    if (!joinedMonth) return [];
    const joinedMonthNumber = Number(joinedMonth[2]);
    if (joinedMonthNumber < 1 || joinedMonthNumber > 12) return [];
    const startMonth = new Date(Number(joinedMonth[1]), joinedMonthNumber - 1, 1);
    if (startMonth > currentMonth) return [];
    const todayKey = formatLocalDate(now);
    const startMonthIndex = startMonth.getFullYear() * 12 + startMonth.getMonth();
    const candidates = new Map<string, { month: string; year: number }>();

    for (
      const cursor = new Date(startMonth);
      cursor <= currentMonth;
      cursor.setMonth(cursor.getMonth() + 1)
    ) {
      const month = cursor.toLocaleString('en-US', { month: 'long' });
      const key = periodKey(cursor.getFullYear(), month);
      if (!paidPeriods.has(key)) candidates.set(key, { month, year: cursor.getFullYear() });
    }

    pendingByPeriod.forEach((record, key) => {
      const monthIndex = monthNames.indexOf(record.month);
      const recordMonthIndex = record.year * 12 + monthIndex;
      if (monthIndex >= 0 && recordMonthIndex >= startMonthIndex && !paidPeriods.has(key)) {
        candidates.set(key, { month: record.month, year: record.year });
      }
    });

    return Array.from(candidates.entries())
      .map(([key, period]): PayableSalaryItem => {
        const existing = pendingByPeriod.get(key);
        const calculation = calculateTeacherMonthlySalary(
          period.month,
          period.year,
          user.id,
          myTeacher.salary,
          teacherAttendanceRecords,
          teacherHolidays,
          teacherLeaves,
          teacherAttendanceSettings,
          period.year === now.getFullYear() && period.month === monthNames[now.getMonth()]
            ? todayKey
            : undefined,
        );
        return {
          id: existing?.id ?? `calculated-${user.id}-${period.year}-${period.month}`,
          teacherId: user.id,
          teacherName: myTeacher.name,
          month: period.month,
          year: period.year,
          amount: calculation.payable,
          status: 'pending',
          paidDate: undefined,
          receiptNumber: existing?.receiptNumber,
          calculatedFromAttendance: !existing,
        };
      })
      .sort(compareSalaryRecordsNewestFirst);
  }, [
    myTeacher,
    salaryRecords,
    teacherAttendanceRecords,
    teacherAttendanceSettings,
    teacherHolidays,
    teacherLeaves,
    user,
  ]);

  const totalPayable = payableRecords.reduce(
    (total, record) => total + (Number(record.amount) || 0),
    0,
  );
  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom + 20;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.headerTop, { paddingTop: topPad, backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/teacher');
          }}
          accessibilityLabel="Back to teacher panel"
        >
          <Feather name="arrow-left" size={24} color={colors.cardForeground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.cardForeground }]}>Payable Salary</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={payableRecords}
        keyExtractor={record => record.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(bottomPad, 36), flexGrow: 1 }}
        ListHeaderComponent={
          <View style={[s.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.summaryIcon, { backgroundColor: colors.primary + '18' }]}>
              <Feather name="credit-card" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.summaryLabel, { color: colors.mutedForeground }]}>Total payable</Text>
              <Text style={[s.summaryAmount, { color: colors.text }]}>
                ₹{totalPayable.toLocaleString('en-IN')}
              </Text>
              <Text style={[s.summaryMeta, { color: colors.mutedForeground }]}>
                {payableRecords.length} month{payableRecords.length === 1 ? '' : 's'} with a breakdown
              </Text>
              <Text style={[s.summaryMeta, { color: colors.mutedForeground }]}>
                Starting from {formatJoiningMonth(myTeacher?.joinDate)}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="credit-card"
            title="No Payable Salary"
            subtitle="Completed unpaid months are calculated from attendance and stay here until the admin records payment."
          />
        }
        renderItem={({ item }) => {
          const breakdown = getTeacherSalaryBreakdown(
            item,
            item.teacherId,
            myTeacher?.salary ?? item.amount,
            teacherAttendanceRecords,
            teacherHolidays,
            teacherLeaves,
            teacherAttendanceSettings,
            item.year === new Date().getFullYear() && item.month === monthNames[new Date().getMonth()]
              ? formatLocalDate(new Date())
              : undefined,
          );
          const noSalaryDue = breakdown.payable === 0;
          const badgeColor = noSalaryDue ? colors.mutedForeground : colors.warning;

          return (
            <View style={[s.salaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.salaryHeading}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.month, { color: colors.text }]}>{item.month} {item.year}</Text>
                  <View style={[s.pendingBadge, { backgroundColor: noSalaryDue ? colors.muted : colors.warning + '18' }]}>
                    <Feather name={noSalaryDue ? 'minus-circle' : 'clock'} size={12} color={badgeColor} />
                    <Text style={[s.pendingText, { color: badgeColor }]}>
                      {noSalaryDue
                        ? 'No salary due'
                        : item.calculatedFromAttendance ? 'Calculated from attendance' : 'Awaiting payment'}
                    </Text>
                  </View>
                </View>
                <Text style={[s.amount, { color: colors.text }]}>
                  ₹{breakdown.payable.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={[s.breakdown, { backgroundColor: colors.muted }]}>
                <Text style={[s.breakdownTitle, { color: colors.text }]}>Monthly breakdown</Text>
                <Text style={[s.breakdownText, { color: colors.mutedForeground }]}>
                  Basic salary  ₹{(myTeacher?.salary ?? item.amount).toLocaleString('en-IN')}
                </Text>
                <Text style={[s.breakdownText, { color: colors.mutedForeground }]}>
                  Present {breakdown.present} · Late {breakdown.late} · Absent {breakdown.absent}
                </Text>
                <Text style={[s.breakdownText, { color: colors.mutedForeground }]}>
                  Holidays {breakdown.holidays} · Approved leave {breakdown.leave}
                </Text>
                <View style={[s.breakdownTotal, { borderTopColor: colors.border }]}>
                  <Text style={[s.breakdownText, { color: colors.destructive }]}>
                    Deduction  −₹{breakdown.deduction.toLocaleString('en-IN')}
                  </Text>
                  <Text style={[s.payableText, { color: colors.primary }]}>
                    Payable  ₹{breakdown.payable.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    justifyContent: 'space-between',
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
  },
  summaryIcon: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 13, fontWeight: '500' },
  summaryAmount: { fontSize: 26, fontWeight: '800', marginTop: 2 },
  summaryMeta: { fontSize: 12, marginTop: 3 },
  salaryCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  salaryHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  month: { fontSize: 16, fontWeight: '700' },
  amount: { fontSize: 19, fontWeight: '800' },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, marginTop: 6 },
  pendingText: { fontSize: 11, fontWeight: '700' },
  breakdown: { borderRadius: 11, padding: 12 },
  breakdownTitle: { fontSize: 13, fontWeight: '800', marginBottom: 5 },
  breakdownText: { fontSize: 12, lineHeight: 19 },
  breakdownTotal: { borderTopWidth: 1, marginTop: 8, paddingTop: 8 },
  payableText: { fontSize: 13, fontWeight: '800', marginTop: 3 },
});