import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, ScrollView, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useApp, Exam, SubjectSchedule, ClassSubjectAssignment } from '@/context/AppContext';

interface ClassAssignment {
  class: string;
  selectedSubjects: string[];
  subjectSchedules: SubjectSchedule[];
}

export default function TeacherExams() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { exams, classes, subjects, addExam, deleteExam } = useApp();

  const [showCreate, setShowCreate] = useState(false);
  const todayISO = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    name: '',
    selectedClasses: [] as string[],
    classAssignments: [] as ClassAssignment[],
    defaultDate: new Date().toISOString().split('T')[0],
    defaultMaxMarks: '100',
  });
  const [confirmDelete, setConfirmDelete] = useState<Exam | null>(null);

  const hasPermission = user?.permissions?.manageExams === true;

  const topPad = Platform.OS === 'web' ? 12 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;

  const resetForm = () =>
    setForm({ name: '', selectedClasses: [], classAssignments: [], defaultDate: todayISO, defaultMaxMarks: '100' });

  const toggleClass = (cls: string) => {
    setForm(p => {
      const alreadySelected = p.selectedClasses.includes(cls);
      if (alreadySelected) {
        return {
          ...p,
          selectedClasses: p.selectedClasses.filter(c => c !== cls),
          classAssignments: p.classAssignments.filter(ca => ca.class !== cls),
        };
      } else {
        return {
          ...p,
          selectedClasses: [...p.selectedClasses, cls],
          classAssignments: [...p.classAssignments, { class: cls, selectedSubjects: [], subjectSchedules: [] }],
        };
      }
    });
  };

  const toggleSubjectForClass = (cls: string, sub: string) => {
    setForm(p => ({
      ...p,
      classAssignments: p.classAssignments.map(ca => {
        if (ca.class !== cls) return ca;
        const alreadySelected = ca.selectedSubjects.includes(sub);
        return {
          ...ca,
          selectedSubjects: alreadySelected
            ? ca.selectedSubjects.filter(s => s !== sub)
            : [...ca.selectedSubjects, sub],
          subjectSchedules: alreadySelected
            ? ca.subjectSchedules.filter(s => s.subject !== sub)
            : [...ca.subjectSchedules, { subject: sub, date: p.defaultDate, maxMarks: Number(p.defaultMaxMarks) || 100 }],
        };
      }),
    }));
  };

  const updateSubjectScheduleForClass = (cls: string, subject: string, field: 'date' | 'maxMarks', value: string) => {
    setForm(p => ({
      ...p,
      classAssignments: p.classAssignments.map(ca => {
        if (ca.class !== cls) return ca;
        return {
          ...ca,
          subjectSchedules: ca.subjectSchedules.map(s =>
            s.subject === subject
              ? { ...s, [field]: field === 'maxMarks' ? (Number(value) || 0) : value }
              : s
          ),
        };
      }),
    }));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { Alert.alert('Validation', 'Enter exam name'); return; }
    if (form.selectedClasses.length === 0) { Alert.alert('Validation', 'Select at least one class'); return; }
    const emptyClass = form.classAssignments.find(ca => ca.selectedSubjects.length === 0);
    if (emptyClass) { Alert.alert('Validation', `Select at least one subject for ${emptyClass.class}`); return; }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const classSubjects: ClassSubjectAssignment[] = form.classAssignments.map(ca => ({
      class: ca.class,
      subjects: ca.selectedSubjects,
      subjectSchedule: ca.subjectSchedules.length > 0 ? ca.subjectSchedules : undefined,
    }));

    const primaryAssignment = form.classAssignments[0];
    const allSubjects = [...new Set(form.classAssignments.flatMap(ca => ca.selectedSubjects))];
    const primarySchedules = primaryAssignment?.subjectSchedules ?? [];

    addExam({
      name: form.name.trim(),
      class: form.selectedClasses[0] || '',
      subjects: allSubjects,
      subjectSchedule: primarySchedules.length > 0 ? primarySchedules : undefined,
      classSubjects,
      date: primarySchedules[0]?.date || form.defaultDate,
      maxMarks: primarySchedules[0]?.maxMarks || Number(form.defaultMaxMarks) || 100,
    });
    resetForm();
    setShowCreate(false);
    Alert.alert('Success', 'Exam created successfully!');
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteExam(confirmDelete.id);
    setConfirmDelete(null);
  };

  const getExamClassLabel = (exam: Exam) => {
    if (exam.classSubjects && exam.classSubjects.length > 1) {
      return exam.classSubjects.map(cs => cs.class).join(', ');
    }
    return exam.class;
  };

  const s = styles(colors);

  // ── Access Denied ─────────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Exam Management</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.deniedContainer}>
          <View style={[s.deniedIcon, { backgroundColor: colors.destructive + '15' }]}>
            <Feather name="lock" size={40} color={colors.destructive} />
          </View>
          <Text style={[s.deniedTitle, { color: colors.text }]}>Access Restricted</Text>
          <Text style={[s.deniedSub, { color: colors.mutedForeground }]}>
            You don't have permission to create exams.{'\n'}Contact your admin to grant the{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>"Create Exams"</Text> permission.
          </Text>
        </View>
      </View>
    );
  }

  // ── Exam Management ───────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Exam Management</Text>
        <TouchableOpacity
          style={[s.createBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Exam List */}
      <FlatList
        data={exams}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="book-open" size={40} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>No Exams Yet</Text>
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Tap + to create your first exam</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.examCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.examIcon, { backgroundColor: colors.primary + '15' }]}>
              <Feather name="book-open" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.examName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[s.examMeta, { color: colors.mutedForeground }]}>
                {getExamClassLabel(item)} • {item.date} • Max {item.maxMarks}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {item.subjects.map(sub => (
                  <View key={sub} style={[s.subBadge, { backgroundColor: colors.secondary }]}>
                    <Text style={[s.subBadgeText, { color: colors.primary }]}>{sub}</Text>
                  </View>
                ))}
              </View>
            </View>
            <TouchableOpacity
              style={[s.deleteBtn, { backgroundColor: colors.destructive + '15' }]}
              onPress={() => setConfirmDelete(item)}
              activeOpacity={0.8}
            >
              <Feather name="trash-2" size={15} color={colors.destructive} />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Create Exam Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: colors.card }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <Text style={[mo.title, { color: colors.text }]}>Create Exam</Text>
              <TouchableOpacity onPress={() => { setShowCreate(false); resetForm(); }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">

              {/* Exam Name */}
              <Text style={[mo.label, { color: colors.text }]}>Exam Name *</Text>
              <TextInput
                style={[mo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                value={form.name}
                onChangeText={v => setForm(p => ({ ...p, name: v }))}
                placeholder="e.g. 1st Unit Test 2026"
                placeholderTextColor={colors.mutedForeground}
              />

              {/* Default Date & Max Marks */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[mo.label, { color: colors.text }]}>Default Date</Text>
                  <TextInput
                    style={[mo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                    value={form.defaultDate}
                    onChangeText={v => setForm(p => ({ ...p, defaultDate: v }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[mo.label, { color: colors.text }]}>Default Max Marks</Text>
                  <TextInput
                    style={[mo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                    value={form.defaultMaxMarks}
                    onChangeText={v => setForm(p => ({ ...p, defaultMaxMarks: v }))}
                    placeholder="100"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              {/* Classes — multi-select chips */}
              <Text style={[mo.label, { color: colors.text, marginTop: 14, marginBottom: 10 }]}>
                Classes * ({form.selectedClasses.length} selected)
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {classes.map(cls => {
                  const sel = form.selectedClasses.includes(cls);
                  return (
                    <TouchableOpacity
                      key={cls}
                      style={[s.subChip, { backgroundColor: sel ? colors.primary : colors.muted, borderColor: sel ? colors.primary : colors.border }]}
                      onPress={() => toggleClass(cls)}
                      activeOpacity={0.8}
                    >
                      {sel && <Feather name="check" size={12} color="#fff" />}
                      <Text style={[s.subChipText, { color: sel ? '#fff' : colors.text }]}>{cls}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Per-class subject selection */}
              {form.classAssignments.map((ca) => (
                <View key={ca.class} style={{ marginTop: 18 }}>
                  {/* Class section header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
                    <Text style={[mo.label, { color: colors.text, marginBottom: 0 }]}>
                      {ca.class} — Subjects *{' '}
                      <Text style={{ color: colors.mutedForeground, fontWeight: '400' }}>
                        ({ca.selectedSubjects.length} selected)
                      </Text>
                    </Text>
                  </View>

                  {/* Subject chips for this class */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {subjects.map(sub => {
                      const sel = ca.selectedSubjects.includes(sub);
                      return (
                        <TouchableOpacity
                          key={sub}
                          style={[s.subChip, { backgroundColor: sel ? colors.primary : colors.muted, borderColor: sel ? colors.primary : colors.border }]}
                          onPress={() => toggleSubjectForClass(ca.class, sub)}
                          activeOpacity={0.8}
                        >
                          {sel && <Feather name="check" size={12} color="#fff" />}
                          <Text style={[s.subChipText, { color: sel ? '#fff' : colors.text }]}>{sub}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Per-subject schedule for this class */}
                  {ca.subjectSchedules.length > 0 && (
                    <View>
                      <Text style={[mo.label, { color: colors.text, marginBottom: 8, fontSize: 12 }]}>
                        Exam Schedule — {ca.class}
                      </Text>
                      {ca.subjectSchedules.map((sched) => (
                        <View key={sched.subject} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: colors.muted }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 }}>{sched.subject}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <View style={{ flex: 3 }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.mutedForeground, marginBottom: 4 }}>DATE</Text>
                              <TextInput
                                style={[mo.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, paddingVertical: 8, fontSize: 13 }]}
                                value={sched.date}
                                onChangeText={v => updateSubjectScheduleForClass(ca.class, sched.subject, 'date', v)}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={colors.mutedForeground}
                              />
                            </View>
                            <View style={{ flex: 2 }}>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.mutedForeground, marginBottom: 4 }}>MAX MARKS</Text>
                              <TextInput
                                style={[mo.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, paddingVertical: 8, fontSize: 13, textAlign: 'center' }]}
                                value={String(sched.maxMarks)}
                                onChangeText={v => updateSubjectScheduleForClass(ca.class, sched.subject, 'maxMarks', v)}
                                placeholder="100"
                                placeholderTextColor={colors.mutedForeground}
                                keyboardType="number-pad"
                              />
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Divider between class sections */}
                  <View style={{ height: 1, backgroundColor: colors.border, marginTop: 4 }} />
                </View>
              ))}

              <View style={{ height: 20 }} />
            </ScrollView>
            <View style={[mo.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[mo.btn, { borderColor: colors.border }]} onPress={() => { setShowCreate(false); resetForm(); }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mo.btn, { flex: 2, backgroundColor: colors.primary }]} onPress={handleCreate}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>Create Exam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal visible={!!confirmDelete} animationType="fade" transparent>
        <View style={[mo.overlay, { justifyContent: 'center', paddingHorizontal: 24 }]}>
          <View style={[mo.sheet, { backgroundColor: colors.card, minHeight: 0 }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <Text style={[mo.title, { color: colors.text }]}>Delete Exam</Text>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>
                Delete <Text style={{ fontWeight: '700' }}>"{confirmDelete?.name}"</Text>?{'\n'}
                <Text style={{ fontSize: 13, color: colors.mutedForeground }}>All results for this exam will also be removed.</Text>
              </Text>
            </View>
            <View style={[mo.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[mo.btn, { borderColor: colors.border }]} onPress={() => setConfirmDelete(null)}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mo.btn, { flex: 2, backgroundColor: colors.destructive }]} onPress={handleDelete}>
                <Feather name="trash-2" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const mo = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', minHeight: '70%', overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 13 },
});

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  createBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  examCard: {
    flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14,
    padding: 14, marginBottom: 12, gap: 12, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  examIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  examName: { fontSize: 15, fontWeight: '700' },
  examMeta: { fontSize: 12, marginTop: 3 },
  subBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  subBadgeText: { fontSize: 11, fontWeight: '600' },
  deleteBtn: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  subChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  subChipText: { fontSize: 13, fontWeight: '500' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText: { fontSize: 13 },
  // Access denied
  deniedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  deniedIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  deniedTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  deniedSub: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
