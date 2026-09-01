import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Platform, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useApp, compareSalaryRecordsNewestFirst } from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';
import { printSalarySlip } from '@/utils/receipt';

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function TeacherSalary() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    salaryRecords, teachers, documentBranding, teacherAttendanceRecords,
    teacherHolidays, teacherLeaves,
  } = useApp();

  const myRecords = useMemo(() =>
    salaryRecords.filter(s => s.teacherId === user?.id).sort(compareSalaryRecordsNewestFirst),
    [salaryRecords, user]
  );

  const now = new Date();
  const curMonth = monthNames[now.getMonth()];
  const curYear = now.getFullYear();

  const currentMonthRecord = myRecords.find(r => r.month === curMonth && r.year === curYear);
  const myTeacher = teachers.find(t => t.id === user?.id);

  const getBreakdown = (record: typeof myRecords[number]) => {
    const monthIndex = monthNames.indexOf(record.month);
    const monthKey = `${record.year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const holidayDates = new Set(
      teacherHolidays.filter(holiday => holiday.date.startsWith(monthKey)).map(holiday => holiday.date),
    );
    const leaveDates = new Set<string>();
    teacherLeaves.filter(leave => leave.teacherId === user?.id && leave.status === 'approved').forEach(leave => {
      const cursor = new Date(`${leave.startDate}T12:00:00Z`);
      const end = new Date(`${leave.endDate}T12:00:00Z`);
      while (cursor <= end) {
        const date = cursor.toISOString().slice(0, 10);
        if (date.startsWith(monthKey)) leaveDates.add(date);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    });
    const daysInMonth = new Date(Date.UTC(record.year, monthIndex + 1, 0)).getUTCDate();
    const workingDays = Array.from({ length: daysInMonth }, (_, index) => {
      const date = `${monthKey}-${String(index + 1).padStart(2, '0')}`;
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      return weekday !== 0 && weekday !== 6 && !holidayDates.has(date) && !leaveDates.has(date);
    }).filter(Boolean).length;
    const rows = teacherAttendanceRecords.filter(item => item.teacherId === user?.id && item.date.startsWith(monthKey));
    const present = rows.filter(item => item.status === 'present').length;
    const late = rows.filter(item => item.status === 'late').length;
    const absent = Math.max(0, workingDays - present - late);
    return {
      present, late, absent, holidays: holidayDates.size, leave: leaveDates.size,
      deduction: Math.max(0, (myTeacher?.salary ?? record.amount) - record.amount),
      payable: record.amount,
    };
  };

  const handlePrintReceipt = (record: any) => {
    if (myTeacher) {
      printSalarySlip(record, myTeacher, documentBranding);
    }
  };

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 12 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 20;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.headerTop, { paddingTop: topPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
          <Feather name="arrow-left" size={24} color={colors.cardForeground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.cardForeground }]}>Salary</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.currentCard, { borderColor: currentMonthRecord?.status === 'paid' ? colors.success : colors.border }]}>
          <View style={[s.currentIconWrap, { backgroundColor: currentMonthRecord?.status === 'paid' ? colors.success + '20' : colors.muted }]}>
            <Feather name="credit-card" size={28} color={currentMonthRecord?.status === 'paid' ? colors.success : colors.mutedForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.currentMonth, { color: colors.mutedForeground }]}>{curMonth} {curYear}</Text>
            <Text style={[s.currentAmount, { color: colors.text }]}>₹{(currentMonthRecord?.amount ?? myTeacher?.salary ?? 0).toLocaleString('en-IN')}</Text>
            <View style={[s.statusBadge, { backgroundColor: currentMonthRecord?.status === 'paid' ? colors.success + '20' : colors.muted }]}>
              <Feather name={currentMonthRecord?.status === 'paid' ? 'check-circle' : 'minus-circle'} size={13} color={currentMonthRecord?.status === 'paid' ? colors.success : colors.mutedForeground} />
              <Text style={[s.statusText, { color: currentMonthRecord?.status === 'paid' ? colors.success : colors.mutedForeground }]}>
                {currentMonthRecord?.status === 'paid' ? `Paid on ${currentMonthRecord.paidDate ?? ''}` : 'Not paid yet'}
              </Text>
            </View>
            {currentMonthRecord && (
              <View style={[s.breakdown, { backgroundColor: colors.muted }]}>
                {(() => {
                  const breakdown = getBreakdown(currentMonthRecord);
                  return (
                    <>
                      <Text style={[s.breakdownTitle, { color: colors.text }]}>Attendance breakdown</Text>
                      <Text style={[s.breakdownText, { color: colors.mutedForeground }]}>Present {breakdown.present} · Late {breakdown.late} · Absent {breakdown.absent}</Text>
                      <Text style={[s.breakdownText, { color: colors.mutedForeground }]}>Holiday {breakdown.holidays} · Approved leave {breakdown.leave}</Text>
                      <Text style={[s.breakdownText, { color: colors.destructive }]}>Deduction ₹{breakdown.deduction.toLocaleString('en-IN')} · Payable ₹{breakdown.payable.toLocaleString('en-IN')}</Text>
                    </>
                  );
                })()}
              </View>
            )}
          </View>
        </View>

        <View style={s.summaryRow}>
          {[
            { label: 'Total Salary', value: `₹${myRecords.reduce((sum, r) => sum + (r.amount ?? 0), 0).toLocaleString('en-IN')}`, color: colors.primary },
            { label: 'Paid This Year', value: myRecords.filter(r => r.year === curYear && r.status === 'paid').length, color: colors.success },
            { label: 'Total Records', value: myRecords.length, color: colors.info },
          ].map(stat => (
            <View key={stat.label} style={[s.sumCard, { backgroundColor: stat.color + '15' }]}>
              <Text style={[s.sumVal, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[s.sumLabel, { color: stat.color }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={[s.histTitle, { color: colors.text }]}>Salary History</Text>
      <FlatList
        data={myRecords}
        keyExtractor={i => i.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: botPad, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="credit-card" title="No Salary Records" subtitle="Your salary history will appear here" />}
        renderItem={({ item }) => (
          <View style={[s.histRow, { backgroundColor: colors.card }]}>
            <View style={[s.histIcon, { backgroundColor: colors.success + '20' }]}>
              <Feather name="check" size={18} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.histMonth, { color: colors.text }]}>{item.month} {item.year}</Text>
              {item.paidDate && <Text style={[s.histMeta, { color: colors.mutedForeground }]}>Paid: {item.paidDate}</Text>}
              {(() => {
                const breakdown = getBreakdown(item);
                return <Text style={[s.histMeta, { color: colors.mutedForeground }]}>P {breakdown.present} · L {breakdown.late} · A {breakdown.absent} · Deduction ₹{breakdown.deduction.toLocaleString('en-IN')}</Text>;
              })()}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={[s.histAmount, { color: colors.text }]}>₹{item.amount.toLocaleString('en-IN')}</Text>
              <TouchableOpacity style={[s.receiptBtn, { backgroundColor: colors.primary + '15' }]} onPress={() => handlePrintReceipt(item)}>
                <Feather name="printer" size={12} color={colors.primary} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>RECEIPT</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  headerTop: { backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  header: { padding: 16, borderBottomWidth: 1 },
  currentCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1.5, borderRadius: 16, padding: 16, marginBottom: 16 },
  currentIconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  currentMonth: { fontSize: 13, fontWeight: '500', marginBottom: 4 },
  currentAmount: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start' },
  statusText: { fontSize: 12, fontWeight: '600' },
  breakdown: { borderRadius: 10, padding: 10, marginTop: 12 },
  breakdownTitle: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  breakdownText: { fontSize: 11, lineHeight: 17 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  sumCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  sumVal: { fontSize: 16, fontWeight: '800' },
  sumLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  histTitle: { fontSize: 16, fontWeight: '700', padding: 16, paddingBottom: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  histIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  histMonth: { fontSize: 15, fontWeight: '700' },
  histMeta: { fontSize: 12, marginTop: 2 },
  histAmount: { fontSize: 16, fontWeight: '700' },
  histBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
});
