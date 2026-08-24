import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  Switch, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useApp, isActiveStudent } from '@/context/AppContext';

export default function PromoteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    students, classes, teachers, promotionRecords,
    promoteStudent, bulkPromoteClass, updateTeacher,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'promote' | 'permissions'>('promote');

  // ── Promote tab state ──────────────────────────────────────────────────────
  const [fromClass, setFromClass] = useState('');
  const [toClass, setToClass] = useState('');
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [showIndividualPicker, setShowIndividualPicker] = useState<string | null>(null);
  const [promotionSuccess, setPromotionSuccess] = useState<{ count: number; toClass: string } | null>(null);

  const studentsInFromClass = useMemo(
    () => (fromClass ? students.filter(s => s.class === fromClass && isActiveStudent(s)) : []),
    [students, fromClass],
  );

  const selectedStudentForPromotion = useMemo(
    () => (showIndividualPicker ? students.find(s => s.id === showIndividualPicker && isActiveStudent(s)) : null),
    [students, showIndividualPicker],
  );

  const handleBulkPromote = async () => {
    if (!fromClass || !toClass) return;
    const count = bulkPromoteClass(fromClass, toClass, 'Admin');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConfirmBulk(false);
    setFromClass('');
    setToClass('');
    setPromotionSuccess({ count, toClass });
  };

  const handleIndividualPromote = async (studentId: string, targetClass: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    promoteStudent(studentId, targetClass, 'Admin');
    setShowIndividualPicker(null);
  };

  const togglePromotePermission = (teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;
    updateTeacher(teacherId, {
      permissions: {
        ...teacher.permissions,
        promoteStudents: !teacher.permissions.promoteStudents,
      },
    });
  };

  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;
  const c = colors;

  return (
    <View style={[s.root, { backgroundColor: c.background }]}>

      {/* ── Sub-tab bar ─────────────────────────────────────────────────────── */}
      <View style={[s.subTabBar, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        {(['promote', 'permissions'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.subTab, activeTab === tab && { borderBottomColor: c.primary }]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Feather
              name={tab === 'promote' ? 'arrow-up-circle' : 'shield'}
              size={16}
              color={activeTab === tab ? c.primary : c.mutedForeground}
            />
            <Text style={[s.subTabText, { color: activeTab === tab ? c.primary : c.mutedForeground }]}>
              {tab === 'promote' ? 'Promote Students' : 'Teacher Permissions'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── PROMOTE TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'promote' ? (
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
                  onPress={() => setShowFromPicker(true)}
                  activeOpacity={0.8}
                >
                  <Feather name="layers" size={14} color={fromClass ? c.primary : c.mutedForeground} />
                  <Text style={[s.pickerText, { color: fromClass ? c.text : c.mutedForeground }]} numberOfLines={1}>
                    {fromClass || 'Select...'}
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

            {fromClass ? (
              <View style={[s.countBadge, { backgroundColor: c.primary + '12', borderColor: c.primary + '30' }]}>
                <Feather name="users" size={13} color={c.primary} />
                <Text style={[s.countBadgeText, { color: c.primary }]}>
                  {studentsInFromClass.length} student{studentsInFromClass.length !== 1 ? 's' : ''} in {fromClass}
                </Text>
              </View>
            ) : null}

            {fromClass && toClass && fromClass !== toClass && studentsInFromClass.length > 0 ? (
              <TouchableOpacity
                style={[s.bulkBtn, { backgroundColor: c.primary }]}
                onPress={() => setConfirmBulk(true)}
                activeOpacity={0.85}
              >
                <Feather name="arrow-up-circle" size={18} color="#fff" />
                <Text style={s.bulkBtnText}>Promote All {studentsInFromClass.length} to {toClass}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Student list */}
          {fromClass ? (
            studentsInFromClass.length === 0 ? (
              <View style={[s.emptyWrap, { backgroundColor: c.card, borderColor: c.border }]}>
                <Feather name="users" size={36} color={c.mutedForeground} />
                <Text style={[s.emptyText, { color: c.mutedForeground }]}>No students in {fromClass}</Text>
              </View>
            ) : (
              <>
                <Text style={[s.listTitle, { color: c.text }]}>Students in {fromClass}</Text>
                {studentsInFromClass.map(st => (
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

          {/* Recent promotions history */}
          {promotionRecords.length > 0 ? (
            <>
              <Text style={[s.listTitle, { color: c.text, marginTop: 20 }]}>
                Recent Promotions ({promotionRecords.length})
              </Text>
              {[...promotionRecords].reverse().slice(0, 15).map(r => (
                <View key={r.id} style={[s.historyRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={[s.historyIcon, { backgroundColor: c.success + '15' }]}>
                    <Feather name="trending-up" size={14} color={c.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.historyName, { color: c.text }]}>{r.studentName}</Text>
                    <Text style={[s.historySub, { color: c.mutedForeground }]}>
                      {r.fromClass} → {r.toClass} · by {r.promotedBy}
                    </Text>
                  </View>
                  <Text style={[s.historyDate, { color: c.mutedForeground }]}>{r.promotedAt}</Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>

      ) : (
        /* ── PERMISSIONS TAB ──────────────────────────────────────────────── */
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: botPad }}>
          <View style={[s.infoBox, { backgroundColor: c.primary + '10', borderColor: c.primary + '30' }]}>
            <Feather name="info" size={15} color={c.primary} />
            <Text style={[s.infoText, { color: c.primary }]}>
              Enable the toggle to allow a teacher to promote students to the next class.
            </Text>
          </View>

          {teachers.length === 0 ? (
            <View style={[s.emptyWrap, { backgroundColor: c.card, borderColor: c.border }]}>
              <Feather name="users" size={36} color={c.mutedForeground} />
              <Text style={[s.emptyText, { color: c.mutedForeground }]}>No teachers found</Text>
            </View>
          ) : (
            teachers.map(t => (
              <View key={t.id} style={[s.teacherCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={[s.teacherAvatar, { backgroundColor: c.primary }]}>
                  <Text style={s.teacherAvatarText}>{t.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.teacherName, { color: c.text }]}>{t.name}</Text>
                  <Text style={[s.teacherSubject, { color: c.mutedForeground }]}>{t.subject}</Text>
                  <View style={[
                    s.permBadge,
                    { backgroundColor: t.permissions.promoteStudents ? c.success + '15' : c.muted },
                  ]}>
                    <Feather
                      name={t.permissions.promoteStudents ? 'unlock' : 'lock'}
                      size={11}
                      color={t.permissions.promoteStudents ? c.success : c.mutedForeground}
                    />
                    <Text style={[
                      s.permBadgeText,
                      { color: t.permissions.promoteStudents ? c.success : c.mutedForeground },
                    ]}>
                      {t.permissions.promoteStudents ? 'Can Promote' : 'No Access'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={!!t.permissions.promoteStudents}
                  onValueChange={() => togglePromotePermission(t.id)}
                  trackColor={{ false: c.border, true: c.primary + '60' }}
                  thumbColor={t.permissions.promoteStudents ? c.primary : c.mutedForeground}
                />
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── FROM class picker ───────────────────────────────────────────────── */}
      <Modal visible={showFromPicker} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: c.card }]}>
            <View style={[mo.header, { borderBottomColor: c.border }]}>
              <Text style={[mo.title, { color: c.text }]}>Select From Class</Text>
              <TouchableOpacity onPress={() => setShowFromPicker(false)}>
                <Feather name="x" size={22} color={c.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {classes.map(cls => (
                <TouchableOpacity
                  key={cls}
                  style={[mo.option, { borderBottomColor: c.border }]}
                  onPress={() => { setFromClass(cls); setToClass(''); setShowFromPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[mo.optionText, { color: fromClass === cls ? c.primary : c.text }]}>{cls}</Text>
                  {fromClass === cls && <Feather name="check" size={16} color={c.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── TO class picker ─────────────────────────────────────────────────── */}
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
              {classes.filter(cls => cls !== fromClass).map(cls => (
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

      {/* ── Individual promote picker ────────────────────────────────────────── */}
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

      {/* ── Bulk confirm ─────────────────────────────────────────────────────── */}
      <Modal visible={confirmBulk} animationType="fade" transparent>
        <View style={[mo.overlay, { justifyContent: 'center', paddingHorizontal: 24 }]}>
          <View style={[mo.sheet, { backgroundColor: c.card, borderRadius: 20 }]}>
            <View style={[mo.header, { borderBottomColor: c.border }]}>
              <Text style={[mo.title, { color: c.text }]}>Confirm Bulk Promotion</Text>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>
                Promote all{' '}
                <Text style={{ fontWeight: '700' }}>{studentsInFromClass.length}</Text> students
                {' '}from{' '}
                <Text style={{ fontWeight: '700', color: c.primary }}>{fromClass}</Text>
                {' '}to{' '}
                <Text style={{ fontWeight: '700', color: c.success }}>{toClass}</Text>?
                {'\n\n'}
                <Text style={{ fontSize: 13, color: c.mutedForeground }}>
                  Each student's class record will be updated. You can reverse this by promoting them back.
                </Text>
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

      {/* ── Bulk promotion success ─────────────────────────────────────────── */}
      <Modal visible={!!promotionSuccess} animationType="fade" transparent onRequestClose={() => setPromotionSuccess(null)}>
        <View style={success.overlay}>
          <View style={[success.sheet, { backgroundColor: c.card }]}>
            <LinearGradient
              colors={[c.primary, '#2563C7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={success.hero}
            >
              <View style={success.decorativeCircle} />
              <View style={[success.orbRing, { borderColor: 'rgba(255,255,255,0.22)' }]}>
                <View style={[success.orb, { backgroundColor: c.success }]}>
                  <Feather name="check" size={30} color="#fff" strokeWidth={3} />
                </View>
              </View>
              <Text style={success.heroTitle}>Promotion complete</Text>
              <Text style={success.heroSubtitle}>Your student records are up to date</Text>
            </LinearGradient>

            <View style={success.body}>
              <View style={[success.summary, { backgroundColor: c.success + '10', borderColor: c.success + '30' }]}>
                <View style={[success.summaryIcon, { backgroundColor: c.success + '20' }]}>
                  <Feather name="trending-up" size={16} color={c.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[success.summaryTitle, { color: c.success }]}>
                    {promotionSuccess?.count ?? 0} student{promotionSuccess?.count !== 1 ? 's' : ''} promoted
                  </Text>
                  <Text style={[success.summarySubtitle, { color: c.mutedForeground }]}>
                    Moved successfully to {promotionSuccess?.toClass}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[success.primaryButton, { backgroundColor: c.primary }]}
                onPress={() => setPromotionSuccess(null)}
                activeOpacity={0.85}
              >
                <Text style={success.primaryButtonText}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={success.secondaryButton}
                onPress={() => setPromotionSuccess(null)}
                activeOpacity={0.8}
              >
                <Text style={[success.secondaryButtonText, { color: c.mutedForeground }]}>View promotion history</Text>
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
  subTabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  subTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  subTabText: { fontSize: 13, fontWeight: '700' },
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
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  teacherCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10,
  },
  teacherAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  teacherAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  teacherName: { fontSize: 15, fontWeight: '700' },
  teacherSubject: { fontSize: 12, marginTop: 2 },
  permBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: 'flex-start',
  },
  permBadgeText: { fontSize: 11, fontWeight: '600' },
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

const success = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(4,17,46,0.66)',
  },
  sheet: {
    width: '100%',
    maxWidth: 356,
    overflow: 'hidden',
    borderRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 14,
  },
  hero: {
    position: 'relative',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 24,
  },
  decorativeCircle: {
    position: 'absolute',
    right: -35,
    top: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  orbRing: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 7,
    borderRadius: 33,
    marginBottom: 14,
  },
  orb: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    shadowColor: '#031A52',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  heroTitle: { color: '#fff', fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  heroSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 7 },
  body: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 18 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  summaryTitle: { fontSize: 13, fontWeight: '800' },
  summarySubtitle: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    paddingVertical: 13,
    marginTop: 17,
    shadowColor: '#173F92',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', paddingVertical: 5, marginTop: 10 },
  secondaryButtonText: { fontSize: 12, fontWeight: '700' },
});
