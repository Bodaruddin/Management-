import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ScrollView, Platform, Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';

type ReportMode = 'daily' | 'monthly' | 'class' | 'student';

// ─── Student Attendance Detail Modal ─────────────────────────────────────────
function StudentAttendanceDetailModal({
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
  allRecords: ReturnType<typeof useApp>['attendanceRecords'];
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const records = useMemo(
    () => allRecords.filter(r => r.studentId === studentId).sort((a, b) => a.date.localeCompare(b.date)),
    [allRecords, studentId],
  );

  const presentDays = records.filter(r => r.status === 'present').length;
  const absentDays  = records.filter(r => r.status === 'absent').length;
  const holidayDays = records.filter(r => r.status === 'holiday').length;
  const inactiveDays = records.filter(r => r.status === 'inactive').length;
  const attendanceDays = presentDays + absentDays + inactiveDays;
  const attendancePct = attendanceDays > 0 ? Math.round((presentDays / attendanceDays) * 100) : 0;
  const pctColor = attendancePct >= 75 ? colors.success : attendancePct >= 50 ? colors.warning : colors.destructive;

  // Group by month (YYYY-MM)
  const monthMap = useMemo(() => {
    const map: Record<string, { present: string[]; absent: string[]; holiday: string[]; inactive: string[] }> = {};
    records.forEach(r => {
      const month = r.date.slice(0, 7); // YYYY-MM
      if (!map[month]) map[month] = { present: [], absent: [], holiday: [], inactive: [] };
      map[month][r.status].push(r.date);
    });
    return map;
  }, [records]);

  const months = Object.keys(monthMap).sort().reverse();

  const formatMonthLabel = (ym: string) => {
    const [year, month] = ym.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(month, 10) - 1]} ${year}`;
  };

  const formatDate = (d: string) => {
    const [, , day] = d.split('-');
    return `${parseInt(day, 10)}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[det.overlay]}>
        <View style={[det.sheet, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[det.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[det.name, { color: colors.text }]}>{studentName}</Text>
              <Text style={[det.cls, { color: colors.mutedForeground }]}>{studentClass}</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={det.closeBtn}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            {/* Overall Stats */}
            <View style={det.statsRow}>
              <View style={[det.statBox, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[det.statVal, { color: colors.primary }]}>{attendanceDays}</Text>
                <Text style={[det.statLbl, { color: colors.primary }]}>Attendance Days</Text>
              </View>
              <View style={[det.statBox, { backgroundColor: pctColor + '15' }]}>
                <Text style={[det.statVal, { color: pctColor }]}>{attendancePct}%</Text>
                <Text style={[det.statLbl, { color: pctColor }]}>Attendance</Text>
              </View>
              <View style={[det.statBox, { backgroundColor: colors.success + '15' }]}>
                <Text style={[det.statVal, { color: colors.success }]}>{presentDays}</Text>
                <Text style={[det.statLbl, { color: colors.success }]}>Present</Text>
              </View>
              <View style={[det.statBox, { backgroundColor: colors.destructive + '15' }]}>
                <Text style={[det.statVal, { color: colors.destructive }]}>{absentDays}</Text>
                <Text style={[det.statLbl, { color: colors.destructive }]}>Absent</Text>
              </View>
              {holidayDays > 0 && (
                <View style={[det.statBox, { backgroundColor: colors.warning + '15' }]}>
                  <Text style={[det.statVal, { color: colors.warning }]}>{holidayDays}</Text>
                  <Text style={[det.statLbl, { color: colors.warning }]}>Holiday</Text>
                </View>
              )}
              {inactiveDays > 0 && (
                <View style={[det.statBox, { backgroundColor: colors.muted + '80' }]}>
                  <Text style={[det.statVal, { color: colors.mutedForeground }]}>{inactiveDays}</Text>
                  <Text style={[det.statLbl, { color: colors.mutedForeground }]}>Inactive</Text>
                </View>
              )}
            </View>

            {/* Month-by-month breakdown */}
            {months.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Feather name="calendar" size={40} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, marginTop: 8, fontSize: 14 }}>No attendance records found</Text>
              </View>
            ) : (
              months.map(month => {
                const { present, absent, holiday, inactive } = monthMap[month];
                const mTotal = present.length + absent.length + inactive.length;
                const mPct = mTotal > 0 ? Math.round((present.length / mTotal) * 100) : 0;
                const mColor = mPct >= 75 ? colors.success : mPct >= 50 ? colors.warning : colors.destructive;
                return (
                  <View key={month} style={[det.monthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {/* Month header */}
                    <View style={det.monthHeader}>
                      <Text style={[det.monthTitle, { color: colors.text }]}>{formatMonthLabel(month)}</Text>
                      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          P: <Text style={{ color: colors.success, fontWeight: '700' }}>{present.length}</Text>
                          {'  '}A: <Text style={{ color: colors.destructive, fontWeight: '700' }}>{absent.length}</Text>
                          {holiday.length > 0 ? <>{'  '}H: <Text style={{ color: colors.warning, fontWeight: '700' }}>{holiday.length}</Text></> : null}
                          {inactive.length > 0 ? <>{'  '}I: <Text style={{ color: colors.mutedForeground, fontWeight: '700' }}>{inactive.length}</Text></> : null}
                        </Text>
                        <View style={[det.pctBadge, { backgroundColor: mColor + '20' }]}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: mColor }}>{mPct}%</Text>
                        </View>
                      </View>
                    </View>

                    {/* Absent dates */}
                    {absent.length > 0 && (
                      <View style={det.absentSection}>
                        <Text style={[det.absentTitle, { color: colors.destructive }]}>
                          <Feather name="x-circle" size={11} color={colors.destructive} /> Absent Dates
                        </Text>
                        <View style={det.datePills}>
                          {absent.map(d => (
                            <View key={d} style={[det.datePill, { backgroundColor: colors.destructive + '15' }]}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.destructive }}>{formatDate(d)}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Holiday dates */}
                    {holiday.length > 0 && (
                      <View style={det.absentSection}>
                        <Text style={[det.absentTitle, { color: colors.warning }]}>
                          <Feather name="sun" size={11} color={colors.warning} /> Holiday Dates
                        </Text>
                        <View style={det.datePills}>
                          {holiday.map(d => (
                            <View key={d} style={[det.datePill, { backgroundColor: colors.warning + '15' }]}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.warning }}>{formatDate(d)}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    {inactive.length > 0 && (
                      <View style={det.absentSection}>
                        <Text style={[det.absentTitle, { color: colors.mutedForeground }]}>
                          <Feather name="user-x" size={11} color={colors.mutedForeground} /> Inactive Dates
                        </Text>
                        <View style={det.datePills}>
                          {inactive.map(d => (
                            <View key={d} style={[det.datePill, { backgroundColor: colors.muted + '90' }]}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.mutedForeground }}>{formatDate(d)}</Text>
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

const det = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', overflow: 'hidden' },
  header:       { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  name:         { fontSize: 17, fontWeight: '800' },
  cls:          { fontSize: 13, marginTop: 2 },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statBox:      { flex: 1, minWidth: 70, borderRadius: 12, padding: 12, alignItems: 'center' },
  statVal:      { fontSize: 20, fontWeight: '800' },
  statLbl:      { fontSize: 11, fontWeight: '600', marginTop: 3, textAlign: 'center' },
  monthCard:    { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  monthHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 10 },
  monthTitle:   { fontSize: 15, fontWeight: '700' },
  pctBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  absentSection:{ paddingHorizontal: 14, paddingBottom: 12 },
  absentTitle:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  datePills:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  datePill:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
});

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { attendanceRecords, students, classes } = useApp();

  const [mode, setMode] = useState<ReportMode>('daily');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterClass, setFilterClass] = useState('All');
  const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent' | 'holiday' | 'inactive'>('all');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [searchStudent, setSearchStudent] = useState('');

  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const [detailStudent, setDetailStudent] = useState<{ id: string; name: string; cls: string } | null>(null);

  const getFilteredRecords = () => {
    let records = attendanceRecords;

    if (mode === 'daily') {
      records = records.filter(r => r.date === filterDate);
      if (filterClass !== 'All') records = records.filter(r => r.class === filterClass);
      if (filterStatus !== 'all') records = records.filter(r => r.status === filterStatus);
    } else if (mode === 'monthly') {
      records = records.filter(r => r.date.startsWith(filterMonth));
      if (filterClass !== 'All') records = records.filter(r => r.class === filterClass);
    } else if (mode === 'class') {
      records = records.filter(r => r.class === filterClass);
      if (filterMonth) records = records.filter(r => r.date.startsWith(filterMonth));
    } else if (mode === 'student') {
      if (searchStudent) {
        records = records.filter(r => r.studentName.toLowerCase().includes(searchStudent.toLowerCase()));
      }
    }

    return records;
  };

  const records = getFilteredRecords();
  const total = records.length;
  const presentCount = records.filter(r => r.status === 'present').length;
  const absentCount = records.filter(r => r.status === 'absent').length;
  const holidayCount = records.filter(r => r.status === 'holiday').length;
  const inactiveCount = records.filter(r => r.status === 'inactive').length;
  const attendanceDays = presentCount + absentCount + inactiveCount;

  const presentPct = attendanceDays > 0 ? Math.round((presentCount / attendanceDays) * 100) : 0;
  const absentPct = attendanceDays > 0 ? Math.round((absentCount / attendanceDays) * 100) : 0;
  const holidayPct = total > 0 ? Math.round((holidayCount / total) * 100) : 0;

  const s = styles(colors);
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;

  const renderDailyReport = () => (
    <FlatList
      data={records}
      keyExtractor={i => i.id}
      contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
      ListEmptyComponent={<EmptyState icon="calendar" title="No Records" subtitle="No attendance taken for this date." />}
      renderItem={({ item: r }) => (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setDetailStudent({ id: r.studentId, name: r.studentName, cls: r.class })}
           style={[c.card, { backgroundColor: colors.card, borderLeftColor: r.status === 'present' ? colors.success : r.status === 'absent' ? colors.destructive : r.status === 'inactive' ? colors.mutedForeground : colors.warning, borderLeftWidth: 4 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[c.name, { color: colors.text }]}>{r.studentName}</Text>
            <Text style={[c.sub, { color: colors.mutedForeground }]}>{r.class} • Taken by {r.takenBy}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
             <View style={[c.badge, { backgroundColor: r.status === 'present' ? colors.success + '20' : r.status === 'absent' ? colors.destructive + '20' : r.status === 'inactive' ? colors.muted + '90' : colors.warning + '20' }]}>
               <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'capitalize', color: r.status === 'present' ? colors.success : r.status === 'absent' ? colors.destructive : r.status === 'inactive' ? colors.mutedForeground : colors.warning }}>
                {r.status === 'holiday' ? 'Holiday' : r.status}
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      )}
    />
  );

  const renderStudentWiseReport = () => {
    // Group records by student
    const studentStats: Record<string, { id: string; name: string; cls: string; present: number; absent: number; holiday: number; inactive: number; total: number }> = {};
    records.forEach(r => {
      if (!studentStats[r.studentId]) {
        studentStats[r.studentId] = { id: r.studentId, name: r.studentName, cls: r.class, present: 0, absent: 0, holiday: 0, inactive: 0, total: 0 };
      }
      studentStats[r.studentId][r.status]++;
      studentStats[r.studentId].total++;
    });

    const data = Object.values(studentStats).sort((a, b) => a.name.localeCompare(b.name));

    return (
      <FlatList
        data={data}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="users" title="No Students" subtitle="Adjust filters or search" />}
        renderItem={({ item: stat }) => {
          const attendanceDays = stat.present + stat.absent + stat.inactive;
          const pct = attendanceDays > 0 ? Math.round((stat.present / attendanceDays) * 100) : 0;
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setDetailStudent({ id: stat.id, name: stat.name, cls: stat.cls })}
              style={[c.card, { backgroundColor: colors.card }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[c.name, { color: colors.text }]}>{stat.name}</Text>
                <Text style={[c.sub, { color: colors.mutedForeground }]}>{stat.cls} • {attendanceDays} Attendance Days</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4, flexDirection: 'row', alignSelf: 'center' }}>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.destructive }}>
                    {pct}%
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>P: {stat.present} | A: {stat.absent} | I: {stat.inactive}</Text>
                </View>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Modes Segmented Control */}
      <View style={[s.segmentContainer, { backgroundColor: colors.card }]}>
        {(['daily', 'monthly', 'class', 'student'] as ReportMode[]).map(m => (
          <TouchableOpacity key={m} style={[s.segmentBtn, mode === m && { backgroundColor: colors.primary }]} onPress={() => setMode(m)} activeOpacity={0.8}>
            <Text style={[s.segmentText, { color: mode === m ? '#fff' : colors.text, textTransform: 'capitalize' }]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filters */}
      <View style={[s.filters, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {mode === 'daily' && (
          <View style={s.filterRow}>
            <View style={s.filterWrap}>
              <Text style={[s.filterLabel, { color: colors.mutedForeground }]}>Date</Text>
              <TextInput style={[s.filterInput, { backgroundColor: colors.muted, color: colors.text }]} value={filterDate} onChangeText={setFilterDate} placeholder="YYYY-MM-DD" />
            </View>
            <TouchableOpacity style={[s.filterWrap, s.pickerBtn, { backgroundColor: colors.muted }]} onPress={() => setShowClassPicker(true)}>
              <Text style={[s.filterLabel, { color: colors.mutedForeground }]}>Class</Text>
              <Text style={{ color: colors.text, fontWeight: '500' }}>{filterClass}</Text>
            </TouchableOpacity>
          </View>
        )}
        {mode === 'monthly' && (
          <View style={s.filterRow}>
            <View style={s.filterWrap}>
              <Text style={[s.filterLabel, { color: colors.mutedForeground }]}>Month</Text>
              <TextInput style={[s.filterInput, { backgroundColor: colors.muted, color: colors.text }]} value={filterMonth} onChangeText={setFilterMonth} placeholder="YYYY-MM" />
            </View>
            <TouchableOpacity style={[s.filterWrap, s.pickerBtn, { backgroundColor: colors.muted }]} onPress={() => setShowClassPicker(true)}>
              <Text style={[s.filterLabel, { color: colors.mutedForeground }]}>Class</Text>
              <Text style={{ color: colors.text, fontWeight: '500' }}>{filterClass}</Text>
            </TouchableOpacity>
          </View>
        )}
        {mode === 'class' && (
          <View style={s.filterRow}>
             <TouchableOpacity style={[s.filterWrap, s.pickerBtn, { backgroundColor: colors.muted }]} onPress={() => setShowClassPicker(true)}>
              <Text style={[s.filterLabel, { color: colors.mutedForeground }]}>Class</Text>
              <Text style={{ color: colors.text, fontWeight: '500' }}>{filterClass}</Text>
            </TouchableOpacity>
            <View style={s.filterWrap}>
              <Text style={[s.filterLabel, { color: colors.mutedForeground }]}>Month (Optional)</Text>
              <TextInput style={[s.filterInput, { backgroundColor: colors.muted, color: colors.text }]} value={filterMonth} onChangeText={setFilterMonth} placeholder="YYYY-MM" />
            </View>
          </View>
        )}
        {mode === 'student' && (
          <View style={s.filterRow}>
            <View style={s.filterWrap}>
              <Text style={[s.filterLabel, { color: colors.mutedForeground }]}>Student Name</Text>
              <TextInput style={[s.filterInput, { backgroundColor: colors.muted, color: colors.text }]} value={searchStudent} onChangeText={setSearchStudent} placeholder="Search..." />
            </View>
          </View>
        )}
      </View>

      {/* Summary Cards */}
      <View style={s.summaryCards}>
        {[
          { label: 'Total Records', val: total, color: colors.primary },
          { label: 'Present', val: `${presentPct}%`, count: presentCount, color: colors.success },
          { label: 'Absent', val: `${absentPct}%`, count: absentCount, color: colors.destructive },
          { label: 'Holiday', val: `${holidayPct}%`, count: holidayCount, color: colors.warning },
          { label: 'Inactive', val: `${attendanceDays > 0 ? Math.round((inactiveCount / attendanceDays) * 100) : 0}%`, count: inactiveCount, color: colors.mutedForeground },
        ].map(st => (
          <View key={st.label} style={[s.sumCard, { backgroundColor: st.color + '15' }]}>
            <Text style={[s.sumVal, { color: st.color }]}>{st.val}</Text>
            <Text style={[s.sumLabel, { color: st.color }]}>{st.label}</Text>
            {st.count !== undefined && <Text style={[s.sumCount, { color: st.color }]}>({st.count})</Text>}
          </View>
        ))}
      </View>

      {mode === 'daily' ? renderDailyReport() : renderStudentWiseReport()}

      {/* Student Attendance Detail */}
      {detailStudent && (
        <StudentAttendanceDetailModal
          visible={!!detailStudent}
          studentId={detailStudent.id}
          studentName={detailStudent.name}
          studentClass={detailStudent.cls}
          allRecords={attendanceRecords}
          onClose={() => setDetailStudent(null)}
          colors={colors}
        />
      )}

      {/* Class Picker */}
      <Modal visible={showClassPicker} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={[m.sheet, { backgroundColor: colors.card, maxHeight: 400 }]}>
            <View style={[m.header, { borderBottomColor: colors.border }]}>
              <Text style={[m.title, { color: colors.text }]}>Select Class</Text>
              <TouchableOpacity onPress={() => setShowClassPicker(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView>
              {['All', ...classes].map(cls => (
                <TouchableOpacity key={cls} style={[m.option, { borderBottomColor: colors.border }]} onPress={() => { setFilterClass(cls); setShowClassPicker(false); }}>
                  <Text style={[m.optionText, { color: filterClass === cls ? colors.primary : colors.text }]}>{cls}</Text>
                  {filterClass === cls && <Feather name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const c = StyleSheet.create({
  card: { padding: 16, borderRadius: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  name: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  sub: { fontSize: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  optionText: { fontSize: 15 },
});

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  segmentContainer: { flexDirection: 'row', margin: 16, borderRadius: 12, padding: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  filters: { padding: 16, borderBottomWidth: 1, paddingTop: 0 },
  filterRow: { flexDirection: 'row', gap: 12 },
  filterWrap: { flex: 1 },
  filterLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterInput: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 14 },
  pickerBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, justifyContent: 'center' },
  summaryCards: { flexDirection: 'row', padding: 16, gap: 10, flexWrap: 'wrap' },
  sumCard: { flex: 1, minWidth: '22%', borderRadius: 12, padding: 12, alignItems: 'center' },
  sumVal: { fontSize: 18, fontWeight: '700' },
  sumLabel: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  sumCount: { fontSize: 10, marginTop: 2, opacity: 0.8 },
});