import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useApp, isActiveStudent } from '@/context/AppContext';

export default function TeacherPromote() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { students, classes, promotionRecords, promoteStudent, bulkPromoteClass } = useApp();

  const [selectedClass, setSelectedClass] = useState('');
  const [toClass, setToClass] = useState('');
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [showIndividualPicker, setShowIndividualPicker] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const hasPermission =
    user?.role === 'admin' || user?.permissions?.promoteStudents === true;

  const promoterName = user?.name ?? 'Teacher';

  const studentsInClass = useMemo(
    () => (selectedClass ? students.filter(s => s.class === selectedClass && isActiveStudent(s)) : []),
    [students, selectedClass],
  );

  const selectedStudentForPromotion = useMemo(
    () => (showIndividualPicker ? students.find(s => s.id === showIndividualPicker && isActiveStudent(s)) : null),
    [students, showIndividualPicker],
  );

  // promotions done by this teacher in this session
  const myPromotions = useMemo(
    () => promotionRecords.filter(r => r.promotedBy === promoterName),
    [promotionRecords, promoterName],
  );

  const handleIndividualPromote = async (studentId: string, targetClass: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    promoteStudent(studentId, targetClass, promoterName);
    setShowIndividualPicker(null);
  };

  const handleBulkPromote = async () => {
    if (!selectedClass || !toClass) return;
    const count = bulkPromoteClass(selectedClass, toClass, promoterName);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Success', `${count} student${count !== 1 ? 's' : ''} promoted to ${toClass}`);
    setConfirmBulk(false);
    setSelectedClass('');
    setToClass('');
  };

  const topPad = Platform.OS === 'web' ? 12 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;
  const c = colors;

  // ── Access Denied ─────────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={[s.root, { backgroundColor: c.background }]}>
        <View style={[s.header, { paddingTop: topPad + 8, backgroundColor: c.card, borderBottomColor: c.border }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
            <Feather name="arrow-left" size={22} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: c.text }]}>Promote Students</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.deniedContainer}>
          <View style={[s.deniedIcon, { backgroundColor: c.destructive + '15' }]}>
            <Feather name="lock" size={40} color={c.destructive} />
          </View>
          <Text style={[s.deniedTitle, { color: c.text }]}>Access Restricted</Text>
          <Text style={[s.deniedSub, { color: c.mutedForeground }]}>
            You don't have permission to promote students.{'\n'}
            Contact your admin to grant the{' '}
            <Text style={{ fontWeight: '700', color: c.text }}>"Promote Students"</Text> permission.
          </Text>
        </View>
      </View>
    );
  }

  // ── Full Promote Screen ───────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8, backgroundColor: c.card, borderBottomColor: c.border }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
          <Feather name="arrow-left" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: c.text }]}>Promote Students</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: botPad }}>

        {/* Class selector card */}
        <View style={[s.selectorCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Select Classes</Text>

          <View style={s.classRow}>
            {/* From */}
            <View style={{ flex: 1 }}>
              <Text style={[s.pickerLabel, { color: c.mutedForeground }]}>From Class</Text>
              <TouchableOpacity
                style={[s.picker, { backgroundColor: c.muted, borderColor: c.border }]}
                onPress={() => setShowClassPicker(true)}
                activeOpacity={0.8}
              >
                <Feather name="layers" size={14} color={selectedClass ? c.primary : c.mutedForeground} />
                <Text style={[s.pickerText, { color: selectedClass ? c.text : c.mutedForeground }]} numberOfLines={1}>
                  {selectedClass || 'Select...'}
                </Text>
                <Feather name="chevron-down" size={13} color={c.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={[s.arrowWrap, { backgroundColor: c.secondary }]}>
              <Feather name="arrow-right" size={17} color={c.primary} />
            </View>

            {/* To */}
            <View style={{ flex: 1 }}>
              <Text style={[s.pickerLabel, { color: c.mutedForeground }]}>To Class</Text>
              <TouchableOpacity
                style={[s.picker, { backgroundColor: c.muted, borderColor: c.border }]}
                onPress={() => setShowToPicker(true)}
                activeOpacity={0.8}
              >
                <Feather name="layers" size={14} color={toClass ? c.success : c.mutedForeground} />
                <Text style={[s.pickerText, { color: toClass ? c.text : c.mutedForeground }]} numberOfLines={1}>
                  {toClass || 'Select...'}
                </Text>
                <Feather name="chevron-down" size={13} color={c.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          {selectedClass ? (
            <View style={[s.countBadge, { backgroundColor: c.primary + '12', borderColor: c.primary + '30' }]}>
              <Feather name="users" size={13} color={c.primary} />
              <Text style={[s.countBadgeText, { color: c.primary }]}>
                {studentsInClass.length} student{studentsInClass.length !== 1 ? 's' : ''} in {selectedClass}
              </Text>
            </View>
          ) : null}

          {selectedClass && toClass && selectedClass !== toClass && studentsInClass.length > 0 ? (
            <TouchableOpacity
              style={[s.bulkBtn, { backgroundColor: c.primary }]}
              onPress={() => setConfirmBulk(true)}
              activeOpacity={0.85}
            >
              <Feather name="arrow-up-circle" size={18} color="#fff" />
              <Text style={s.bulkBtnText}>Promote All {studentsInClass.length} to {toClass}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Student list */}
        {selectedClass ? (
          studentsInClass.length === 0 ? (
            <View style={[s.emptyWrap, { backgroundColor: c.card, borderColor: c.border }]}>
              <Feather name="users" size={36} color={c.mutedForeground} />
              <Text style={[s.emptyText, { color: c.mutedForeground }]}>No students in {selectedClass}</Text>
            </View>
          ) : (
            <>
              <Text style={[s.listTitle, { color: c.text }]}>Students in {selectedClass}</Text>
              {studentsInClass.map(st => (
                <View key={st.id} style={[s.studentCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={[s.avatar, { backgroundColor: c.secondary }]}>
                    <Text style={[s.avatarText, { color: c.primary }]}>
                      {st.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.studentName, { color: c.text }]}>{st.name}</Text>
                    <Text style={[s.studentSub, { color: c.mutedForeground }]}>
                      Roll No: {st.rollNumber}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[s.promoteBtn, { backgroundColor: c.primary + '15' }]}
                    onPress={() => setShowIndividualPicker(st.id)}
                    activeOpacity={0.8}
                  >
                    <Feather name="arrow-up" size={14} color={c.primary} />
                    <Text style={[s.promoteBtnText, { color: c.primary }]}>Promote</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )
        ) : (
          <View style={[s.emptyWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <Feather name="arrow-up-circle" size={36} color={c.mutedForeground} />
            <Text style={[s.emptyText, { color: c.mutedForeground }]}>Select a class to begin promoting</Text>
          </View>
        )}

        {/* My recent promotions */}
        {myPromotions.length > 0 ? (
          <>
            <Text style={[s.listTitle, { color: c.text, marginTop: 20 }]}>
              My Promotions ({myPromotions.length})
            </Text>
            {[...myPromotions].reverse().slice(0, 10).map(r => (
              <View key={r.id} style={[s.historyRow, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={[s.historyIcon, { backgroundColor: c.success + '15' }]}>
                  <Feather name="trending-up" size={14} color={c.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.historyName, { color: c.text }]}>{r.studentName}</Text>
                  <Text style={[s.historySub, { color: c.mutedForeground }]}>
                    {r.fromClass} → {r.toClass}
                  </Text>
                </View>
                <Text style={[s.historyDate, { color: c.mutedForeground }]}>{r.promotedAt}</Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* From Class Picker */}
      <Modal visible={showClassPicker} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: c.card }]}>
            <View style={[mo.header, { borderBottomColor: c.border }]}>
              <Text style={[mo.title, { color: c.text }]}>Select From Class</Text>
              <TouchableOpacity onPress={() => setShowClassPicker(false)}>
                <Feather name="x" size={22} color={c.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {classes.map(cls => (
                <TouchableOpacity
                  key={cls}
                  style={[mo.option, { borderBottomColor: c.border }]}
                  onPress={() => { setSelectedClass(cls); setToClass(''); setShowClassPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[mo.optionText, { color: selectedClass === cls ? c.primary : c.text }]}>{cls}</Text>
                  {selectedClass === cls && <Feather name="check" size={16} color={c.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* To Class Picker */}
      <Modal visible={showToPicker} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: c.card }]}>
            <View style={[mo.header, { borderBottomColor: c.border }]}>
              <Text style={[mo.title, { color: c.text }]}>Select Target Class</Text>
              <TouchableOpacity onPress={() => setShowToPicker(false)}>
                <Feather name="x" size={22} color={c.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {classes.filter(cls => cls !== selectedClass).map(cls => (
                <TouchableOpacity
                  key={cls}
                  style={[mo.option, { borderBottomColor: c.border }]}
                  onPress={() => { setToClass(cls); setShowToPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[mo.optionText, { color: toClass === cls ? c.primary : c.text }]}>{cls}</Text>
                  {toClass === cls && <Feather name="check" size={16} color={c.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Individual promote picker */}
      <Modal visible={!!showIndividualPicker} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: c.card }]}>
            <View style={[mo.header, { borderBottomColor: c.border }]}>
              <Text style={[mo.title, { color: c.text }]}>
                Promote {selectedStudentForPromotion?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowIndividualPicker(null)}>
                <Feather name="x" size={22} color={c.mutedForeground} />
              </TouchableOpacity>
            </View>
            {selectedStudentForPromotion ? (
              <Text style={[mo.subtitle, { color: c.mutedForeground }]}>
                Currently in: {selectedStudentForPromotion.class}
              </Text>
            ) : null}
            <ScrollView>
              {classes
                .filter(cls => cls !== selectedStudentForPromotion?.class)
                .map(cls => (
                  <TouchableOpacity
                    key={cls}
                    style={[mo.option, { borderBottomColor: c.border }]}
                    onPress={() =>
                      showIndividualPicker && handleIndividualPromote(showIndividualPicker, cls)
                    }
                    activeOpacity={0.7}
                  >
                    <Feather name="arrow-right" size={16} color={c.primary} />
                    <Text style={[mo.optionText, { color: c.text }]}>Promote to {cls}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bulk confirm */}
      <Modal visible={confirmBulk} animationType="fade" transparent>
        <View style={[mo.overlay, { justifyContent: 'center', paddingHorizontal: 24 }]}>
          <View style={[mo.sheet, { backgroundColor: c.card, borderRadius: 20 }]}>
            <View style={[mo.header, { borderBottomColor: c.border }]}>
              <Text style={[mo.title, { color: c.text }]}>Confirm Bulk Promotion</Text>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>
                Promote all{' '}
                <Text style={{ fontWeight: '700' }}>{studentsInClass.length}</Text> students
                {' '}from{' '}
                <Text style={{ fontWeight: '700', color: c.primary }}>{selectedClass}</Text>
                {' '}to{' '}
                <Text style={{ fontWeight: '700', color: c.success }}>{toClass}</Text>?
              </Text>
            </View>
            <View style={[mo.footer, { borderTopColor: c.border }]}>
              <TouchableOpacity
                style={[mo.btn, { borderColor: c.border }]}
                onPress={() => setConfirmBulk(false)}
              >
                <Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[mo.btn, { flex: 2, backgroundColor: c.primary }]}
                onPress={handleBulkPromote}
              >
                <Feather name="arrow-up-circle" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>Promote All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  selectorCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  classRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pickerLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  picker: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10,
  },
  pickerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  arrowWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 12,
  },
  countBadgeText: { fontSize: 13, fontWeight: '600' },
  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 12,
  },
  bulkBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  listTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  studentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10,
  },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700' },
  studentName: { fontSize: 14, fontWeight: '700' },
  studentSub: { fontSize: 12, marginTop: 2 },
  promoteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  promoteBtnText: { fontSize: 12, fontWeight: '700' },
  emptyWrap: {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, borderWidth: 1, padding: 32, gap: 10, marginTop: 8,
  },
  emptyText: { fontSize: 14, textAlign: 'center' },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8,
  },
  historyIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  historyName: { fontSize: 13, fontWeight: '600' },
  historySub: { fontSize: 12, marginTop: 2 },
  historyDate: { fontSize: 11 },
  // access denied
  deniedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  deniedIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  deniedTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  deniedSub: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});

const mo = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { paddingHorizontal: 20, paddingTop: 10, fontSize: 13 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  optionText: { flex: 1, fontSize: 15 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 13,
  },
});
