import React, { useEffect, useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import {
  TeacherAttendanceSettings, TeacherLeaveApplication, useApp,
} from '@/context/AppContext';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const TIME_SETTING_KEYS = ['checkInStart', 'checkInEnd', 'checkOutStart', 'checkOutEnd'] as const;
type TimeSettingKey = typeof TIME_SETTING_KEYS[number];

const TIME_SETTING_LABELS: Record<TimeSettingKey, string> = {
  checkInStart: 'Check-in starts',
  checkInEnd: 'Check-in closes',
  checkOutStart: 'Check-out starts',
  checkOutEnd: 'Check-out closes',
};

function formatTime12Hour(value: string): string {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (hours < 0 || hours > 23) return value;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${period}`;
}

function parseTime12Hour(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, ' ');
  const twelveHour = normalized.match(/^(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)$/);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    if (hour < 1 || hour > 12) return null;
    const minute = twelveHour[2] ?? '00';
    const hour24 = (hour % 12) + (twelveHour[3] === 'PM' ? 12 : 0);
    return `${String(hour24).padStart(2, '0')}:${minute}`;
  }

  const twentyFourHour = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return twentyFourHour ? `${twentyFourHour[1]}:${twentyFourHour[2]}` : null;
}

function createTimeDrafts(settings: TeacherAttendanceSettings): Record<TimeSettingKey, string> {
  return TIME_SETTING_KEYS.reduce((drafts, key) => {
    drafts[key] = formatTime12Hour(settings[key]);
    return drafts;
  }, {} as Record<TimeSettingKey, string>);
}

async function readAdminLocation(): Promise<{ latitude: number; longitude: number }> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        e => reject(new Error(e.message || 'Could not read browser location')),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  }
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Location permission is required');
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}

export default function AdminTeacherAttendance() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    teacherAttendanceSettings, teacherAttendanceRecords, teacherLeaves, teacherHolidays, teachers,
    refreshTeacherAttendance, updateTeacherAttendanceSettings, reviewTeacherLeave,
    addTeacherHoliday, updateTeacherHoliday, deleteTeacherHoliday, calculateTeacherPayroll,
  } = useApp();
  const [settings, setSettings] = useState<TeacherAttendanceSettings>(teacherAttendanceSettings);
  const [timeDrafts, setTimeDrafts] = useState<Record<TimeSettingKey, string>>(() => createTimeDrafts(teacherAttendanceSettings));
  const [holidayDate, setHolidayDate] = useState(new Date().toISOString().slice(0, 10));
  const [holidayName, setHolidayName] = useState('');
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [payroll, setPayroll] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshTeacherAttendance().catch(error => console.error('[AdminTeacherAttendance]', error));
  }, [refreshTeacherAttendance]);

  useEffect(() => {
    setSettings(teacherAttendanceSettings);
    setTimeDrafts(createTimeDrafts(teacherAttendanceSettings));
  }, [teacherAttendanceSettings]);

  const save = async (action: () => Promise<void>) => {
    setSaving(true);
    try {
      await action();
      Alert.alert('Saved', 'Teacher attendance data was updated.');
    } catch (error: any) {
      Alert.alert('Could not save', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const useCurrentLocation = () => save(async () => {
    const coordinates = await readAdminLocation();
    const nextSettings = { ...getSettingsForSave(), schoolLatitude: coordinates.latitude, schoolLongitude: coordinates.longitude };
    setSettings(nextSettings);
    await updateTeacherAttendanceSettings(nextSettings);
  });

  const getSettingsForSave = (): TeacherAttendanceSettings => {
    const nextSettings = {
      ...settings,
      radiusMeters: Number(settings.radiusMeters),
      workingDaysPerMonth: Number(settings.workingDaysPerMonth),
      lateGraceMinutes: Number(settings.lateGraceMinutes),
      lateDeductionAmount: Number(settings.lateDeductionAmount),
    };

    for (const key of TIME_SETTING_KEYS) {
      const parsed = parseTime12Hour(timeDrafts[key]);
      if (!parsed) {
        throw new Error(`${TIME_SETTING_LABELS[key]} must use a time like 1:00 AM or 1:00 PM.`);
      }
      nextSettings[key] = parsed;
    }
    return nextSettings;
  };

  const saveSettings = () => save(() => updateTeacherAttendanceSettings(getSettingsForSave()));

  const resetHolidayForm = () => {
    setEditingHolidayId(null);
    setHolidayDate(new Date().toISOString().slice(0, 10));
    setHolidayName('');
  };

  const saveHoliday = () => save(async () => {
    if (!holidayDate || !holidayName.trim()) throw new Error('Enter a date and holiday name');
    if (editingHolidayId) {
      await updateTeacherHoliday(editingHolidayId, { date: holidayDate, name: holidayName.trim() });
    } else {
      await addTeacherHoliday({ date: holidayDate, name: holidayName.trim() });
    }
    resetHolidayForm();
  });

  const editHoliday = (id: string, date: string, name: string) => {
    setEditingHolidayId(id);
    setHolidayDate(date);
    setHolidayName(name);
  };

  const removeHoliday = (id: string) => save(() => deleteTeacherHoliday(id));

  const runPayroll = () => save(async () => {
    const report = await calculateTeacherPayroll(month, Number(year));
    setPayroll(report);
  });

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom + 24;
  const pendingLeaves = teacherLeaves.filter(leave => leave.status === 'pending');
  const reportMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const monthlyRecords = teacherAttendanceRecords.filter(record => record.date.startsWith(reportMonthKey));

  const field = (label: string, key: keyof TeacherAttendanceSettings, keyboardType: 'default' | 'numeric' = 'default') => {
    const isTimeField = TIME_SETTING_KEYS.includes(key as TimeSettingKey);
    const timeKey = key as TimeSettingKey;
    return (
      <View style={s.field} key={key}>
        <Text style={[s.label, { color: colors.text }]}>{label}</Text>
        <TextInput
          value={isTimeField ? timeDrafts[timeKey] : String(settings[key] ?? '')}
          onChangeText={value => {
            if (isTimeField) {
              setTimeDrafts(previous => ({ ...previous, [timeKey]: value }));
              const parsed = parseTime12Hour(value);
              if (parsed) setSettings(previous => ({ ...previous, [key]: parsed }));
              return;
            }
            setSettings(previous => ({ ...previous, [key]: keyboardType === 'numeric' ? value.replace(/[^\d.]/g, '') : value }));
          }}
          keyboardType={isTimeField ? 'default' : keyboardType}
          placeholder={isTimeField ? 'e.g. 1:00 PM' : undefined}
          placeholderTextColor={colors.mutedForeground}
          style={[s.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
        />
      </View>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.card, paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/attendance' as any)} style={s.backButton}>
          <Feather name="arrow-left" size={22} color={colors.cardForeground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.cardForeground }]}>Teacher Attendance</Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>Admin controls & payroll</Text>
        </View>
        <Feather name="settings" size={20} color={colors.primary} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }} keyboardShouldPersistTaps="handled">
        <View style={[s.section, { backgroundColor: colors.card }]}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>Attendance rules</Text>
              <Text style={[s.sectionCopy, { color: colors.mutedForeground }]}>These rules apply to every teacher check-in. Times use 12-hour format, such as 1:00 AM or 1:00 PM.</Text>
            </View>
            <Feather name="shield" size={20} color={colors.primary} />
          </View>
          <View style={[s.locationCard, { backgroundColor: colors.muted }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.text }]}>School location</Text>
              <Text style={[s.mutedText, { color: colors.mutedForeground }]}>
                {settings.schoolLatitude === null ? 'Not configured' : `${settings.schoolLatitude.toFixed(5)}, ${settings.schoolLongitude?.toFixed(5)}`}
              </Text>
            </View>
            <TouchableOpacity style={[s.smallButton, { backgroundColor: colors.primary }]} onPress={useCurrentLocation} disabled={saving}>
              <Feather name="crosshair" size={14} color="#fff" />
              <Text style={s.smallButtonText}>Use my location</Text>
            </TouchableOpacity>
          </View>
          {field('Allowed radius (meters)', 'radiusMeters', 'numeric')}
          <View style={s.twoCol}>
            {field('Check-in starts', 'checkInStart')}
            {field('Check-in closes', 'checkInEnd')}
          </View>
          <View style={s.twoCol}>
            {field('Check-out starts', 'checkOutStart')}
            {field('Check-out closes', 'checkOutEnd')}
          </View>
          <View style={[s.switchRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.text }]}>Require face verification</Text>
              <Text style={[s.mutedText, { color: colors.mutedForeground }]}>Use device facial biometrics or a camera selfie.</Text>
            </View>
            <Switch value={settings.requireFaceVerification} onValueChange={value => setSettings(previous => ({ ...previous, requireFaceVerification: value }))} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
          </View>
          <TouchableOpacity style={[s.primaryButton, { backgroundColor: saving ? colors.muted : colors.primary }]} onPress={saveSettings} disabled={saving}>
            <Feather name="save" size={16} color="#fff" />
            <Text style={s.primaryText}>Save attendance rules</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.section, { backgroundColor: colors.card }]}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>This month&apos;s attendance</Text>
              <Text style={[s.sectionCopy, { color: colors.mutedForeground }]}>A live summary of recorded check-ins for {reportMonthKey}.</Text>
            </View>
            <Feather name="calendar" size={20} color={colors.primary} />
          </View>
          {teachers.map(teacher => {
            const rows = monthlyRecords.filter(record => record.teacherId === teacher.id);
            const present = rows.filter(record => record.status === 'present').length;
            const late = rows.filter(record => record.status === 'late').length;
            return (
              <View key={teacher.id} style={[s.payrollRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.historyTitle, { color: colors.text }]}>{teacher.name}</Text>
                  <Text style={[s.mutedText, { color: colors.mutedForeground }]}>Present {present} · Late {late} · Check-outs {rows.filter(record => record.checkOutAt).length}</Text>
                </View>
                <Text style={[s.amount, { color: rows.length ? colors.success : colors.mutedForeground }]}>{rows.length ? `${rows.length} days` : 'No records'}</Text>
              </View>
            );
          })}
        </View>

        <View style={[s.section, { backgroundColor: colors.card }]}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>Payroll deductions</Text>
              <Text style={[s.sectionCopy, { color: colors.mutedForeground }]}>Deductions are calculated only when payroll is run.</Text>
            </View>
            <Feather name="credit-card" size={20} color={colors.success} />
          </View>
          {field('Working-day divisor', 'workingDaysPerMonth', 'numeric')}
          <View style={s.twoCol}>
            {field('Late grace (minutes)', 'lateGraceMinutes', 'numeric')}
            {field('Late deduction (₹)', 'lateDeductionAmount', 'numeric')}
          </View>
          <Text style={[s.label, { color: colors.text }]}>Absence deduction method</Text>
          <View style={s.choiceRow}>
            {([
              ['daily_rate', 'Salary ÷ working days'],
              ['fixed', 'Fixed late amount'],
            ] as [TeacherAttendanceSettings['deductionType'], string][]).map(([value, label]) => (
              <TouchableOpacity key={value} onPress={() => setSettings(previous => ({ ...previous, deductionType: value }))} style={[s.choice, { borderColor: settings.deductionType === value ? colors.primary : colors.border, backgroundColor: settings.deductionType === value ? colors.primary + '12' : colors.card }]}>
                <Feather name={settings.deductionType === value ? 'check-circle' : 'circle'} size={15} color={settings.deductionType === value ? colors.primary : colors.mutedForeground} />
                <Text style={[s.choiceText, { color: colors.text }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[s.secondaryButton, { borderColor: colors.primary }]} onPress={runPayroll} disabled={saving}>
            <Feather name="bar-chart-2" size={16} color={colors.primary} />
            <Text style={[s.secondaryText, { color: colors.primary }]}>{saving ? 'Calculating…' : `Calculate ${month} ${year}`}</Text>
          </TouchableOpacity>
          {payroll && (
            <View style={[s.payrollBox, { backgroundColor: colors.muted }]}>
              <Text style={[s.label, { color: colors.text }]}>{payroll.month} {payroll.year} · {payroll.workingDays} working days</Text>
              {payroll.result.map((item: any) => (
                <View key={item.teacherId} style={[s.payrollRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.historyTitle, { color: colors.text }]}>{item.teacherName}</Text>
                    <Text style={[s.mutedText, { color: colors.mutedForeground }]}>P {item.presentDays} · L {item.lateDays} · A {item.absentDays} · Excluded leave {item.excludedLeaveDays}</Text>
                  </View>
                  <Text style={[s.amount, { color: colors.success }]}>₹{item.payableAmount.toLocaleString('en-IN')}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={[s.section, { backgroundColor: colors.card }]}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>Leave approvals</Text>
              <Text style={[s.sectionCopy, { color: colors.mutedForeground }]}>{pendingLeaves.length} pending application{pendingLeaves.length === 1 ? '' : 's'}</Text>
            </View>
            <Feather name="inbox" size={20} color={colors.warning} />
          </View>
          {pendingLeaves.length === 0 ? <Text style={[s.mutedText, { color: colors.mutedForeground }]}>No pending leave applications.</Text> : pendingLeaves.map((leave: TeacherLeaveApplication) => (
            <View key={leave.id} style={[s.leaveCard, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.historyTitle, { color: colors.text }]}>{leave.teacherName}</Text>
                <Text style={[s.historyMeta, { color: colors.mutedForeground }]}>{leave.startDate} → {leave.endDate}</Text>
                <Text style={[s.historyMeta, { color: colors.text }]}>{leave.reason}</Text>
              </View>
              <View style={{ gap: 7 }}>
                <TouchableOpacity style={[s.approve, { backgroundColor: colors.success }]} onPress={() => save(() => reviewTeacherLeave(leave.id, 'approved'))}>
                  <Feather name="check" size={14} color="#fff" />
                  <Text style={s.actionText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.reject, { borderColor: colors.destructive }]} onPress={() => save(() => reviewTeacherLeave(leave.id, 'rejected'))}>
                  <Feather name="x" size={14} color={colors.destructive} />
                  <Text style={[s.rejectText, { color: colors.destructive }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={[s.section, { backgroundColor: colors.card }]}>
          <View style={s.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>School holidays</Text>
              <Text style={[s.sectionCopy, { color: colors.mutedForeground }]}>Holidays never create salary deductions.</Text>
            </View>
            <Feather name="sun" size={20} color={colors.warning} />
          </View>
          <View style={s.twoCol}>
            <View style={[s.field, { flex: 1 }]}>
              <Text style={[s.label, { color: colors.text }]}>Date</Text>
              <TextInput value={holidayDate} onChangeText={setHolidayDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} style={[s.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]} />
            </View>
            <View style={[s.field, { flex: 1 }]}>
              <Text style={[s.label, { color: colors.text }]}>Name</Text>
              <TextInput value={holidayName} onChangeText={setHolidayName} placeholder="Holiday name" placeholderTextColor={colors.mutedForeground} style={[s.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]} />
            </View>
          </View>
          <TouchableOpacity style={[s.secondaryButton, { borderColor: colors.primary }]} onPress={saveHoliday} disabled={saving}>
            <Feather name={editingHolidayId ? 'save' : 'plus'} size={16} color={colors.primary} />
            <Text style={[s.secondaryText, { color: colors.primary }]}>{editingHolidayId ? 'Save holiday changes' : 'Add holiday'}</Text>
          </TouchableOpacity>
          {editingHolidayId && (
            <TouchableOpacity style={[s.cancelButton, { borderColor: colors.border }]} onPress={resetHolidayForm} disabled={saving}>
              <Text style={[s.cancelText, { color: colors.mutedForeground }]}>Cancel edit</Text>
            </TouchableOpacity>
          )}
          {teacherHolidays.map(holiday => (
            <View key={holiday.id} style={[s.holidayRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.historyTitle, { color: colors.text }]}>{holiday.name}</Text>
                <Text style={[s.historyMeta, { color: colors.mutedForeground }]}>{holiday.date}</Text>
              </View>
              <View style={s.holidayActions}>
                <TouchableOpacity style={[s.holidayAction, { borderColor: colors.primary }]} onPress={() => editHoliday(holiday.id, holiday.date, holiday.name)} disabled={saving} hitSlop={6}>
                  <Feather name="edit-2" size={13} color={colors.primary} />
                  <Text style={[s.holidayActionText, { color: colors.primary }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.holidayAction, { borderColor: colors.destructive }]} onPress={() => removeHoliday(holiday.id)} disabled={saving} hitSlop={6}>
                  <Feather name="trash-2" size={13} color={colors.destructive} />
                  <Text style={[s.holidayActionText, { color: colors.destructive }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backButton: { width: 36, height: 36, justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  section: { borderRadius: 16, padding: 15, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionCopy: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  locationCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, gap: 9, marginBottom: 15 },
  field: { flex: 1, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  mutedText: { fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 14 },
  twoCol: { flexDirection: 'row', gap: 10 },
  smallButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9 },
  smallButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 13, marginTop: 2, marginBottom: 13 },
  primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  choiceRow: { gap: 8, marginBottom: 14, marginTop: 3 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 10, borderWidth: 1 },
  choiceText: { fontSize: 13, fontWeight: '600' },
  secondaryButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, marginBottom: 12 },
  secondaryText: { fontSize: 14, fontWeight: '800' },
  cancelButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  cancelText: { fontSize: 12, fontWeight: '700' },
  payrollBox: { borderRadius: 11, padding: 11, marginTop: 2 },
  payrollRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  historyTitle: { fontSize: 13, fontWeight: '700' },
  historyMeta: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  amount: { fontSize: 15, fontWeight: '800' },
  leaveCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 11, padding: 11, marginBottom: 9 },
  approve: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  reject: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  rejectText: { fontSize: 11, fontWeight: '800' },
  holidayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1 },
  holidayActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  holidayAction: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 6 },
  holidayActionText: { fontSize: 10, fontWeight: '800' },
});