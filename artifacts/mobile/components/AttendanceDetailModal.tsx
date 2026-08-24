import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal, TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AttendanceRecord } from '@/context/AppContext';

export default function AttendanceDetailModal({
  visible,
  studentId,
  studentName,
  studentClass,
  allRecords,
  onClose,
  colors,
}: {
  visible: boolean;
  studentId: string;
  studentName: string;
  studentClass: string;
  allRecords: AttendanceRecord[];
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const records = useMemo(
    () => allRecords.filter(r => r.studentId === studentId).sort((a, b) => a.date.localeCompare(b.date)),
    [allRecords, studentId],
  );

  const presentDays = records.filter(r => r.status === 'present').length;
  const absentDays = records.filter(r => r.status === 'absent').length;
  const holidayDays = records.filter(r => r.status === 'holiday').length;
  const inactiveDays = records.filter(r => r.status === 'inactive').length;
  const attendanceDays = presentDays + absentDays + inactiveDays;
  const attendancePct = attendanceDays > 0 ? Math.round((presentDays / attendanceDays) * 100) : 0;
  const pctColor = attendancePct >= 75 ? colors.success : attendancePct >= 50 ? colors.warning : colors.destructive;

  const monthMap = useMemo(() => {
    const map: Record<string, { present: string[]; absent: string[]; holiday: string[]; inactive: string[] }> = {};
    records.forEach(record => {
      const month = record.date.slice(0, 7);
      if (!map[month]) map[month] = { present: [], absent: [], holiday: [], inactive: [] };
      map[month][record.status].push(record.date);
    });
    return map;
  }, [records]);

  const months = Object.keys(monthMap).sort().reverse();

  const formatMonthLabel = (yearMonth: string) => {
    const [year, month] = yearMonth.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
  };

  const formatDate = (date: string) => `${parseInt(date.split('-')[2], 10)}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>{studentName}</Text>
              <Text style={[styles.className, { color: colors.mutedForeground }]}>{studentClass}</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{attendanceDays}</Text>
                <Text style={[styles.statLabel, { color: colors.primary }]}>Attendance Days</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: pctColor + '15' }]}>
                <Text style={[styles.statValue, { color: pctColor }]}>{attendancePct}%</Text>
                <Text style={[styles.statLabel, { color: pctColor }]}>Attendance</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.success + '15' }]}>
                <Text style={[styles.statValue, { color: colors.success }]}>{presentDays}</Text>
                <Text style={[styles.statLabel, { color: colors.success }]}>Present</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.destructive + '15' }]}>
                <Text style={[styles.statValue, { color: colors.destructive }]}>{absentDays}</Text>
                <Text style={[styles.statLabel, { color: colors.destructive }]}>Absent</Text>
              </View>
              {holidayDays > 0 && (
                <View style={[styles.statBox, { backgroundColor: colors.warning + '15' }]}>
                  <Text style={[styles.statValue, { color: colors.warning }]}>{holidayDays}</Text>
                  <Text style={[styles.statLabel, { color: colors.warning }]}>Holiday</Text>
                </View>
              )}
              {inactiveDays > 0 && (
                <View style={[styles.statBox, { backgroundColor: colors.muted + '80' }]}>
                  <Text style={[styles.statValue, { color: colors.mutedForeground }]}>{inactiveDays}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Inactive</Text>
                </View>
              )}
            </View>

            {months.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Feather name="calendar" size={40} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, marginTop: 8, fontSize: 14 }}>
                  No attendance records found
                </Text>
              </View>
            ) : (
              months.map(month => {
                const { present, absent, holiday, inactive } = monthMap[month];
                const monthAttendanceDays = present.length + absent.length + inactive.length;
                const monthPct = monthAttendanceDays > 0
                  ? Math.round((present.length / monthAttendanceDays) * 100)
                  : 0;
                const monthColor = monthPct >= 75 ? colors.success : monthPct >= 50 ? colors.warning : colors.destructive;

                return (
                  <View key={month} style={[styles.monthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.monthHeader}>
                      <Text style={[styles.monthTitle, { color: colors.text }]}>{formatMonthLabel(month)}</Text>
                      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          P: <Text style={{ color: colors.success, fontWeight: '700' }}>{present.length}</Text>
                          {'  '}A: <Text style={{ color: colors.destructive, fontWeight: '700' }}>{absent.length}</Text>
                          {holiday.length > 0 ? (
                            <> {'  '}H: <Text style={{ color: colors.warning, fontWeight: '700' }}>{holiday.length}</Text></>
                          ) : null}
                          {inactive.length > 0 ? (
                            <> {'  '}I: <Text style={{ color: colors.mutedForeground, fontWeight: '700' }}>{inactive.length}</Text></>
                          ) : null}
                        </Text>
                        <View style={[styles.pctBadge, { backgroundColor: monthColor + '20' }]}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: monthColor }}>{monthPct}%</Text>
                        </View>
                      </View>
                    </View>

                    {absent.length > 0 && (
                      <View style={styles.dateSection}>
                        <Text style={[styles.dateTitle, { color: colors.destructive }]}>
                          <Feather name="x-circle" size={11} color={colors.destructive} /> Absent Dates
                        </Text>
                        <View style={styles.datePills}>
                          {absent.map(date => (
                            <View key={date} style={[styles.datePill, { backgroundColor: colors.destructive + '15' }]}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.destructive }}>{formatDate(date)}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {holiday.length > 0 && (
                      <View style={styles.dateSection}>
                        <Text style={[styles.dateTitle, { color: colors.warning }]}>
                          <Feather name="sun" size={11} color={colors.warning} /> Holiday Dates
                        </Text>
                        <View style={styles.datePills}>
                          {holiday.map(date => (
                            <View key={date} style={[styles.datePill, { backgroundColor: colors.warning + '15' }]}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.warning }}>{formatDate(date)}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    {inactive.length > 0 && (
                      <View style={styles.dateSection}>
                        <Text style={[styles.dateTitle, { color: colors.mutedForeground }]}>
                          <Feather name="user-x" size={11} color={colors.mutedForeground} /> Inactive Dates
                        </Text>
                        <View style={styles.datePills}>
                          {inactive.map(date => (
                            <View key={date} style={[styles.datePill, { backgroundColor: colors.muted + '90' }]}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.mutedForeground }}>{formatDate(date)}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  name: { fontSize: 17, fontWeight: '800' },
  className: { fontSize: 13, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statBox: { flex: 1, minWidth: 70, borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 3, textAlign: 'center' },
  monthCard: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 10 },
  monthTitle: { fontSize: 15, fontWeight: '700' },
  pctBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  dateSection: { paddingHorizontal: 14, paddingBottom: 12 },
  dateTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  datePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  datePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
});