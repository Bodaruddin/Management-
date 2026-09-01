import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import {
  TeacherAttendanceRecord, TeacherLeaveApplication, useApp,
} from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';

type Tab = 'today' | 'history' | 'leave';
type Coordinates = { latitude: number; longitude: number };

function getWebLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => reject(new Error(error.message || 'Could not read your location')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

async function readCurrentLocation(): Promise<Coordinates> {
  if (Platform.OS === 'web') return getWebLocation();
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Location permission is required to mark attendance');
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}

async function captureFace(): Promise<{ verified: boolean; method?: string; faceImageBase64: string }> {
  if (Platform.OS === 'web') {
    throw new Error('Face verification is available on a physical device. Open the app in Expo Go to check in.');
  }
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Face verification needs camera permission.');
  }
  const photo = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.35,
    exif: false,
  });
  if (photo.canceled || !photo.assets[0]) throw new Error('A face photo is required to check in');
  const faceImageBase64 = await FileSystem.readAsStringAsync(photo.assets[0].uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { verified: true, method: 'camera_face_capture', faceImageBase64 };
}

function formatTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MyTeacherAttendance() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    teacherAttendanceRecords, teacherLeaves, teacherAttendanceSettings,
    refreshTeacherAttendance, checkInTeacher, checkOutTeacher, applyTeacherLeave,
    updateTeacherLeave, deleteTeacherLeave,
  } = useApp();
  const [tab, setTab] = useState<Tab>('today');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leaveStart, setLeaveStart] = useState(new Date().toISOString().slice(0, 10));
  const [leaveEnd, setLeaveEnd] = useState(new Date().toISOString().slice(0, 10));
  const [leaveReason, setLeaveReason] = useState('');
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const myRecords = useMemo(
    () => teacherAttendanceRecords
      .filter(record => record.teacherId === user?.id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [teacherAttendanceRecords, user?.id],
  );
  const todayRecord = myRecords.find(record => record.date === today);
  const myLeaves = useMemo(
    () => teacherLeaves.filter(leave => leave.teacherId === user?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [teacherLeaves, user?.id],
  );

  useEffect(() => {
    if (user?.id) refreshTeacherAttendance(user.id).catch(error => console.error('[TeacherAttendance]', error));
  }, [refreshTeacherAttendance, user?.id]);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckIn = () => runAction(async () => {
    if (!user) throw new Error('Please sign in again');
    const [coordinates, face] = await Promise.all([
      readCurrentLocation(),
      teacherAttendanceSettings.requireFaceVerification
         ? captureFace()
        : Promise.resolve({ verified: false, method: 'disabled_by_admin' }),
    ]);
    await checkInTeacher({
      teacherId: user.id,
      teacherName: user.name,
      ...coordinates,
      faceVerified: face.verified,
      faceVerificationMethod: face.method,
      faceImageBase64: face.verified && 'faceImageBase64' in face ? face.faceImageBase64 : undefined,
    });
  });

  const handleCheckOut = () => runAction(async () => {
    if (!todayRecord) throw new Error('No check-in found for today');
    const [coordinates, face] = await Promise.all([
      readCurrentLocation(),
      teacherAttendanceSettings.requireFaceVerification
        ? captureFace()
        : Promise.resolve({ verified: false, method: 'disabled_by_admin' }),
    ]);
    await checkOutTeacher(todayRecord.id, {
      teacherId: user?.id ?? '',
      ...coordinates,
      faceImageBase64: face.verified && 'faceImageBase64' in face ? face.faceImageBase64 : undefined,
    });
  });

  const handleLeave = () => runAction(async () => {
    if (!user) throw new Error('Please sign in again');
    if (!leaveStart || !leaveEnd || leaveStart > leaveEnd || !leaveReason.trim()) {
      throw new Error('Enter a valid date range and reason');
    }
    if (editingLeaveId) {
      await updateTeacherLeave(editingLeaveId, {
        teacherId: user.id, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason.trim(),
      });
    } else {
      await applyTeacherLeave({
        teacherId: user.id, teacherName: user.name, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason.trim(),
      });
    }
    setEditingLeaveId(null);
    setLeaveStart(today);
    setLeaveEnd(today);
    setLeaveReason('');
    Alert.alert(
      editingLeaveId ? 'Application updated' : 'Application sent',
      editingLeaveId ? 'Your pending leave application was updated.' : 'Your leave application is waiting for admin approval.',
    );
  });

  const editLeave = (leave: TeacherLeaveApplication) => {
    setEditingLeaveId(leave.id);
    setLeaveStart(leave.startDate);
    setLeaveEnd(leave.endDate);
    setLeaveReason(leave.reason);
  };

  const cancelLeaveEdit = () => {
    setEditingLeaveId(null);
    setLeaveStart(today);
    setLeaveEnd(today);
    setLeaveReason('');
  };

  const removeLeave = (leave: TeacherLeaveApplication) => {
    if (!user) return;
    const remove = () => runAction(() => deleteTeacherLeave(leave.id, user.id));
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this pending leave application?')) remove();
      return;
    }
    Alert.alert('Delete application?', 'This pending leave application will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
  };

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom + 24;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.card, paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.replace('/teacher')} style={s.backButton}>
          <Feather name="arrow-left" size={22} color={colors.cardForeground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.cardForeground }]}>My Attendance</Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>GPS + face verification</Text>
        </View>
        <TouchableOpacity onPress={() => refreshTeacherAttendance(user?.id)} style={s.iconButton}>
          <Feather name="refresh-cw" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[s.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          ['today', 'Today'], ['history', 'History'], ['leave', 'Leave'],
        ] as [Tab, string][]).map(([value, label]) => (
          <TouchableOpacity key={value} onPress={() => setTab(value)} style={[s.tab, tab === value && { borderBottomColor: colors.primary }]}>
            <Text style={[s.tabText, { color: tab === value ? colors.primary : colors.mutedForeground }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={[s.error, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive }]}>
          <Feather name="alert-circle" size={16} color={colors.destructive} />
          <Text style={[s.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}

      {tab === 'today' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
          <View style={[s.hero, { backgroundColor: colors.primary }]}>
            <View style={s.heroIcon}><Feather name="shield" size={26} color={colors.primary} /></View>
            <Text style={s.heroTitle}>{todayRecord ? (todayRecord.status === 'late' ? 'Checked in late' : 'Checked in') : 'Ready to check in?'}</Text>
            <Text style={s.heroCopy}>Your location must be within {teacherAttendanceSettings.radiusMeters}m of school.</Text>
          </View>

          <View style={[s.recordCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.recordRow}>
              <View style={[s.recordIcon, { backgroundColor: todayRecord ? colors.success + '18' : colors.muted }]}>
                <Feather name={todayRecord ? 'check-circle' : 'clock'} size={20} color={todayRecord ? colors.success : colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.recordLabel, { color: colors.mutedForeground }]}>Today · {today}</Text>
                <Text style={[s.recordValue, { color: colors.text }]}>
                  {todayRecord ? (todayRecord.status === 'late' ? 'Late' : 'Present') : 'Not marked'}
                </Text>
              </View>
              {todayRecord?.distanceFromSchool !== undefined && (
                <Text style={[s.distance, { color: colors.mutedForeground }]}>{Math.round(todayRecord.distanceFromSchool)}m away</Text>
              )}
            </View>
            <View style={[s.timeGrid, { borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.smallLabel, { color: colors.mutedForeground }]}>CHECK-IN</Text>
                <Text style={[s.time, { color: colors.text }]}>{formatTime(todayRecord?.checkInAt)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.smallLabel, { color: colors.mutedForeground }]}>CHECK-OUT</Text>
                <Text style={[s.time, { color: colors.text }]}>{formatTime(todayRecord?.checkOutAt)}</Text>
              </View>
            </View>
          </View>

          {!todayRecord ? (
            <TouchableOpacity style={[s.primaryButton, { backgroundColor: busy ? colors.muted : colors.primary }]} disabled={busy} onPress={handleCheckIn}>
              <Feather name="camera" size={18} color="#fff" />
              <Text style={s.primaryButtonText}>{busy ? 'Verifying…' : 'Verify face & check in'}</Text>
            </TouchableOpacity>
          ) : !todayRecord.checkOutAt ? (
            <TouchableOpacity style={[s.secondaryButton, { borderColor: colors.primary }]} disabled={busy} onPress={handleCheckOut}>
              <Feather name="log-out" size={18} color={colors.primary} />
               <Text style={[s.secondaryButtonText, { color: colors.primary }]}>{busy ? 'Verifying…' : 'Verify face & check out'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[s.complete, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={[s.completeText, { color: colors.success }]}>Attendance complete for today</Text>
            </View>
          )}

          <View style={[s.info, { backgroundColor: colors.muted }]}>
            <Feather name="info" size={15} color={colors.mutedForeground} />
            <Text style={[s.infoText, { color: colors.mutedForeground }]}>
               Your first selfie enrolls a private face template. Later check-in and check-out selfies are matched against it; the original photos are not stored.
            </Text>
          </View>
        </ScrollView>
      )}

      {tab === 'history' && (
        <FlatList
          data={myRecords}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon="calendar" title="No Attendance Yet" subtitle="Your check-in history will appear here" />}
          renderItem={({ item }) => (
            <View style={[s.historyRow, { backgroundColor: colors.card }]}>
              <View style={[s.dateBadge, { backgroundColor: item.status === 'late' ? colors.warning + '18' : colors.success + '18' }]}>
                <Text style={[s.dateDay, { color: item.status === 'late' ? colors.warning : colors.success }]}>{item.date.slice(-2)}</Text>
                <Text style={[s.dateMonth, { color: colors.mutedForeground }]}>{item.date.slice(5, 7)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.historyTitle, { color: colors.text }]}>{item.status === 'late' ? 'Late' : 'Present'}</Text>
                <Text style={[s.historyMeta, { color: colors.mutedForeground }]}>In {formatTime(item.checkInAt)} · Out {formatTime(item.checkOutAt)}</Text>
              </View>
              <Text style={[s.statusText, { color: item.status === 'late' ? colors.warning : colors.success }]}>{item.status.toUpperCase()}</Text>
            </View>
          )}
        />
      )}

      {tab === 'leave' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Apply for leave</Text>
          {([
            ['Start date', leaveStart, setLeaveStart],
            ['End date', leaveEnd, setLeaveEnd],
          ] as [string, string, (value: string) => void][]).map(([label, value, setter]) => (
            <View key={label} style={s.field}>
              <Text style={[s.label, { color: colors.text }]}>{label}</Text>
              <TextInput value={value} onChangeText={setter} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} />
            </View>
          ))}
          <View style={s.field}>
            <Text style={[s.label, { color: colors.text }]}>Reason</Text>
            <TextInput value={leaveReason} onChangeText={setLeaveReason} multiline numberOfLines={4} textAlignVertical="top" placeholder="Why do you need leave?" placeholderTextColor={colors.mutedForeground} style={[s.input, s.multiline, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} />
          </View>
          <TouchableOpacity style={[s.primaryButton, { backgroundColor: busy ? colors.muted : colors.primary }]} disabled={busy} onPress={handleLeave}>
            <Feather name={editingLeaveId ? 'save' : 'send'} size={17} color="#fff" />
            <Text style={s.primaryButtonText}>{busy ? (editingLeaveId ? 'Saving…' : 'Sending…') : (editingLeaveId ? 'Save changes' : 'Send application')}</Text>
          </TouchableOpacity>
          {editingLeaveId && (
            <TouchableOpacity style={[s.cancelButton, { borderColor: colors.border }]} disabled={busy} onPress={cancelLeaveEdit}>
              <Text style={[s.cancelButtonText, { color: colors.mutedForeground }]}>Cancel edit</Text>
            </TouchableOpacity>
          )}

          <Text style={[s.sectionTitle, { color: colors.text, marginTop: 28 }]}>My applications</Text>
          {myLeaves.length === 0 ? <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No leave applications yet.</Text> : myLeaves.map((leave: TeacherLeaveApplication) => (
            <View key={leave.id} style={[s.leaveRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.historyTitle, { color: colors.text }]}>{leave.startDate} → {leave.endDate}</Text>
                <Text style={[s.historyMeta, { color: colors.mutedForeground }]}>{leave.reason}</Text>
                {leave.status === 'pending' && <Text style={[s.pendingHint, { color: colors.mutedForeground }]}>You can edit or delete while pending.</Text>}
              </View>
              <View style={s.leaveSide}>
                <Text style={[s.statusText, { color: leave.status === 'approved' ? colors.success : leave.status === 'rejected' ? colors.destructive : colors.warning }]}>{leave.status.toUpperCase()}</Text>
                {leave.status === 'pending' && (
                  <View style={s.leaveActions}>
                    <TouchableOpacity style={[s.leaveAction, { borderColor: colors.primary }]} disabled={busy} onPress={() => editLeave(leave)} hitSlop={6}>
                      <Feather name="edit-2" size={12} color={colors.primary} />
                      <Text style={[s.leaveActionText, { color: colors.primary }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.leaveAction, { borderColor: colors.destructive }]} disabled={busy} onPress={() => removeLeave(leave)} hitSlop={6}>
                      <Feather name="trash-2" size={12} color={colors.destructive} />
                      <Text style={[s.leaveActionText, { color: colors.destructive }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backButton: { width: 36, height: 36, justifyContent: 'center' },
  iconButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 12 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '700' },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 16, marginBottom: 0, padding: 11, borderRadius: 10, borderWidth: 1 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  hero: { borderRadius: 18, padding: 18, marginBottom: 14 },
  heroIcon: { backgroundColor: '#fff', width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  heroCopy: { color: '#E0E7FF', fontSize: 13, marginTop: 5, lineHeight: 18 },
  recordCard: { borderRadius: 16, borderWidth: 1, marginBottom: 14 },
  recordRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  recordIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recordLabel: { fontSize: 12 },
  recordValue: { fontSize: 18, fontWeight: '800', marginTop: 3 },
  distance: { fontSize: 11 },
  timeGrid: { flexDirection: 'row', padding: 16, borderTopWidth: 1 },
  smallLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  time: { fontSize: 18, fontWeight: '700', marginTop: 5 },
  primaryButton: { minHeight: 54, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, marginBottom: 12 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondaryButton: { minHeight: 54, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, marginBottom: 12 },
  secondaryButtonText: { fontSize: 15, fontWeight: '800' },
  complete: { minHeight: 54, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 12 },
  completeText: { fontSize: 14, fontWeight: '700' },
  info: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
  historyRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 13, marginBottom: 9, gap: 12 },
  dateBadge: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  dateDay: { fontSize: 17, fontWeight: '800' },
  dateMonth: { fontSize: 10, marginTop: -2 },
  historyTitle: { fontSize: 14, fontWeight: '700' },
  historyMeta: { fontSize: 12, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  multiline: { minHeight: 100 },
  emptyText: { fontSize: 13 },
  cancelButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  cancelButtonText: { fontSize: 13, fontWeight: '700' },
  leaveRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 13, padding: 13, marginBottom: 9, gap: 10 },
  leaveSide: { alignItems: 'flex-end', gap: 8 },
  leaveActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leaveAction: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 6 },
  leaveActionText: { fontSize: 10, fontWeight: '800' },
  pendingHint: { fontSize: 10, marginTop: 5 },
});