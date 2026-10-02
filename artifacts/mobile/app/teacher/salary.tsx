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
import { getTeacherSalaryBreakdown } from '@/utils/teacherSalary';

export default function TeacherSalary() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    salaryRecords, teachers, documentBranding, teacherAttendanceRecords,
    teacherHolidays, teacherLeaves, teacherAttendanceSettings,
  } = useApp();

  const myRecords = useMemo(() =>
    salaryRecords
      .filter(s => s.teacherId === user?.id && s.status === 'paid')
      .sort(compareSalaryRecordsNewestFirst),
    [salaryRecords, user]
  );

  const myTeacher = teachers.find(t => t.id === user?.id);
  const latestPaidRecord = myRecords[0];
  const currentYear = new Date().getFullYear();

  const handlePrintReceipt = (record: any) => {
    if (myTeacher) {
      printSalarySlip(record, myTeacher, documentBranding);
    }
  };

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
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
        <View style={[s.currentCard, { borderColor: colors.success }]}>
          <View style={[s.currentIconWrap, { backgroundColor: colors.success + '20' }]}>
            <Feather name="check-circle" size={26} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.currentMonth, { color: colors.mutedForeground }]}>Total salary paid</Text>
            <Text style={[s.currentAmount, { color: colors.text }]}>
              ₹{myRecords.reduce((sum, record) => sum + (Number(record.amount) || 0), 0).toLocaleString('en-IN')}
            </Text>
            {latestPaidRecord ? (
              <Text style={[s.statusText, { color: colors.success }]}>
                Latest: {latestPaidRecord.month} {latestPaidRecord.year}
                {latestPaidRecord.paidDate ? ` · Paid ${latestPaidRecord.paidDate}` : ''}
              </Text>
            ) : (
              <Text style={[s.statusText, { color: colors.mutedForeground }]}>
                Payments recorded by admin will appear here.
              </Text>
            )}
          </View>
        </View>

        <View style={s.summaryRow}>
          {[
            { label: 'Payments', value: myRecords.length, color: colors.primary },
            { label: 'Paid This Year', value: myRecords.filter(r => r.year === currentYear).length, color: colors.success },
            { label: 'Latest Payment', value: latestPaidRecord ? latestPaidRecord.month.slice(0, 3) : '—', color: colors.info },
          ].map(stat => (
            <View key={stat.label} style={[s.sumCard, { backgroundColor: stat.color + '15' }]}>
              <Text style={[s.sumVal, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[s.sumLabel, { color: stat.color }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[s.payableLink, { backgroundColor: colors.primary + '12' }]}
          onPress={() => router.replace('/teacher/payable-salary')}
          accessibilityRole="button"
          accessibilityLabel="View payable salary and monthly breakdown"
        >
          <View style={[s.payableIcon, { backgroundColor: colors.primary + '20' }]}>
            <Feather name="clock" size={17} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.payableLinkTitle, { color: colors.text }]}>Payable Salary</Text>
            <Text style={[s.payableLinkSubtitle, { color: colors.mutedForeground }]}>
              View unpaid months and salary breakdown
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <Text style={[s.histTitle, { color: colors.text }]}>Salary History</Text>
      <FlatList
        data={myRecords}
        keyExtractor={i => i.id}
         contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(botPad, 36), flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="credit-card" title="No Paid Salary Yet" subtitle="Salary payments recorded by the admin will appear here" />}
        renderItem={({ item }) => (
          <View style={[s.histRow, { backgroundColor: colors.card }]}>
            <View style={[s.histIcon, { backgroundColor: colors.success + '20' }]}>
              <Feather name="check" size={18} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.histMonth, { color: colors.text }]}>{item.month} {item.year}</Text>
              {item.paidDate && <Text style={[s.histMeta, { color: colors.mutedForeground }]}>Paid: {item.paidDate}</Text>}
              {(() => {
                const breakdown = getTeacherSalaryBreakdown(
                  item,
                  item.teacherId,
                  myTeacher?.salary ?? item.amount,
                  teacherAttendanceRecords,
                  teacherHolidays,
                  teacherLeaves,
                  teacherAttendanceSettings,
                );
                return (
                  <Text style={[s.histMeta, { color: colors.mutedForeground }]}>
                    P {breakdown.present} · L {breakdown.late} · A {breakdown.absent} · Deduction ₹{breakdown.deduction.toLocaleString('en-IN')}
                  </Text>
                );
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
  statusText: { fontSize: 12, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 10 },
  sumCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  sumVal: { fontSize: 16, fontWeight: '800' },
  sumLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  payableLink: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 13, marginTop: 14 },
  payableIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  payableLinkTitle: { fontSize: 13, fontWeight: '700' },
  payableLinkSubtitle: { fontSize: 11, marginTop: 2 },
  histTitle: { fontSize: 16, fontWeight: '700', padding: 16, paddingBottom: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  histIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  histMonth: { fontSize: 15, fontWeight: '700' },
  histMeta: { fontSize: 12, marginTop: 2 },
  histAmount: { fontSize: 16, fontWeight: '700' },
  histBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
});
