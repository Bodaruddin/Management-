import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, ScrollView, Alert, Switch, Platform, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useApp, Teacher, compareSalaryRecordsNewestFirst } from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';
import SalarySuccessModal from '@/components/SalarySuccessModal';
import { printSalarySlip as printSalaryReceipt } from '@/utils/receipt';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const BLANK = {
  name: '', subject: '', mobileNumber: '', salary: '', username: '', password: '',
  permissions: { addStudent: false, feeCollection: false, manageClasses: false, manageExams: false, manageResults: false, promoteStudents: false, sendFeeReminder: false, allowMarkEdit: false }, photo: undefined as string | undefined
};

export default function TeachersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { teachers, addTeacher, updateTeacher, deleteTeacher, salaryRecords, addSalaryRecord, deleteSalaryRecord, documentBranding } = useApp();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [detailTeacher, setDetailTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  // Salary management
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [salaryTeacher, setSalaryTeacher] = useState<Teacher | null>(null);
  const [salaryMonth, setSalaryMonth] = useState(MONTH_NAMES[new Date().getMonth()]);
  const [salaryYear, setSalaryYear] = useState(String(new Date().getFullYear()));
  const [salaryAmount, setSalaryAmount] = useState('');
  const [salaryStatus] = useState<'paid'>('paid');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Teacher | null>(null);
  const [confirmDeleteSalaryId, setConfirmDeleteSalaryId] = useState<string | null>(null);
  const [salarySuccess, setSalarySuccess] = useState<{ name: string; month: string; year: string; amount: number; rec: any; teacher: Teacher } | null>(null);

  const now = new Date();
  const curMonth = MONTH_NAMES[now.getMonth()];
  const curYear = now.getFullYear();

  const getSalaryRecord = (teacherId: string, month: string, year: number) =>
    salaryRecords.find(s => s.teacherId === teacherId && s.month === month && s.year === year);

  const getCurrentSalary = (teacherId: string) => getSalaryRecord(teacherId, curMonth, curYear);

  const openAdd = () => { setEditing(null); setForm({ ...BLANK }); setShowModal(true); };
  const openEdit = (t: Teacher) => {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject, mobileNumber: t.mobileNumber, salary: t.salary > 0 ? String(t.salary) : '', username: t.username, password: t.password, permissions: { ...t.permissions }, photo: t.photo });
    setShowModal(true);
  };

  const handleSave = async () => {
    const monthlySalary = form.salary.trim() === '' ? 0 : Number(form.salary);
    if (!form.name.trim() || !form.subject.trim() || !form.username.trim() || !form.password.trim()) {
      Alert.alert('Validation', 'Please fill all required fields');
      return;
    }
    if (form.salary.trim() !== '' && (!Number.isInteger(monthlySalary) || monthlySalary <= 0)) {
      Alert.alert('Validation', 'Enter a valid monthly salary greater than ₹0, or leave it blank');
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const data = { name: form.name.trim(), subject: form.subject.trim(), mobileNumber: form.mobileNumber.trim(), salary: monthlySalary, username: form.username.trim(), password: form.password, joinDate: editing?.joinDate ?? new Date().toISOString().split('T')[0], permissions: form.permissions, photo: form.photo };
    if (editing) updateTeacher(editing.id, data);
    else addTeacher(data);
    setShowModal(false);
  };

  const handleDelete = (t: Teacher) => {
    setConfirmDelete(t);
  };

  const confirmDoDelete = async () => {
    if (!confirmDelete) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteTeacher(confirmDelete.id);
    setDetailTeacher(null);
    setConfirmDelete(null);
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0] && result.assets[0].base64) {
      const photo = 'data:image/jpeg;base64,' + result.assets[0].base64;
      setForm(prev => ({ ...prev, photo }));
    }
  };

  const openSalaryModal = (t: Teacher) => {
    setSalaryTeacher(t);
    setSalaryMonth(curMonth);
    setSalaryYear(String(curYear));
    setSalaryAmount('');
    setShowSalaryModal(true);
  };

  const handlePaySalary = async () => {
    if (!salaryAmount || Number(salaryAmount) <= 0) { Alert.alert('Validation', 'Enter a valid salary amount'); return; }
    if (!salaryTeacher) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const rec = addSalaryRecord({
      teacherId: salaryTeacher.id,
      teacherName: salaryTeacher.name,
      month: salaryMonth,
      year: Number(salaryYear) || curYear,
      amount: Number(salaryAmount),
      status: 'paid',
      paidDate: new Date().toISOString().split('T')[0],
    });
    setShowSalaryModal(false);
    setSalarySuccess({ name: salaryTeacher.name, month: salaryMonth, year: salaryYear, amount: Number(salaryAmount), rec, teacher: salaryTeacher });
  };


  const s = styles(colors);
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.topBar, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: Platform.OS === 'web' ? 12 : 8 }]}>
        <Text style={[s.countText, { color: colors.mutedForeground }]}>{teachers.length} teacher{teachers.length !== 1 ? 's' : ''}</Text>
        <TouchableOpacity style={[s.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd} activeOpacity={0.8}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add Teacher</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={teachers}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="user-check" title="No Teachers" subtitle="Add your first teacher" onAction={openAdd} actionLabel="Add Teacher" />}
        renderItem={({ item: t }) => {
          const sal = getCurrentSalary(t.id);
          return (
            <TouchableOpacity style={[card.container, { backgroundColor: colors.card }]} onPress={() => setDetailTeacher(t)} activeOpacity={0.85}>
              <View style={card.row}>
                <View style={[card.avatar, { backgroundColor: colors.secondary }]}>
                  {t.photo ? (
                    <Image source={{ uri: t.photo }} style={card.avatarImage} />
                  ) : (
                    <Text style={[card.avatarText, { color: colors.primary }]}>{t.name.charAt(0)}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[card.name, { color: colors.text }]}>{t.name}</Text>
                  <Text style={[card.sub, { color: colors.mutedForeground }]}>{t.subject}</Text>
                  <Text style={[card.sub, { color: colors.mutedForeground }]}>@{t.username}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={[card.salary, { color: colors.text }]}>₹{t.salary.toLocaleString('en-IN')}/mo</Text>
                  <View style={[card.badge, { backgroundColor: sal?.status === 'paid' ? colors.success + '20' : colors.muted }]}>
                    <Text style={[card.badgeText, { color: sal?.status === 'paid' ? colors.success : colors.mutedForeground }]}>
                      {sal?.status === 'paid' ? 'Paid' : 'Not paid'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={[card.perms, { borderTopColor: colors.border }]}>
                {t.permissions.addStudent && <View style={[card.permBadge, { backgroundColor: colors.info + '15' }]}><Text style={[card.permText, { color: colors.info }]}>Add Students</Text></View>}
                {t.permissions.feeCollection && <View style={[card.permBadge, { backgroundColor: colors.success + '15' }]}><Text style={[card.permText, { color: colors.success }]}>Collect Fees</Text></View>}
                {t.permissions.manageClasses && <View style={[card.permBadge, { backgroundColor: colors.accent + '15' }]}><Text style={[card.permText, { color: colors.accent }]}>Classes</Text></View>}
                {t.permissions.manageExams && <View style={[card.permBadge, { backgroundColor: colors.primary + '15' }]}><Text style={[card.permText, { color: colors.primary }]}>Exams</Text></View>}
                {t.permissions.manageResults && <View style={[card.permBadge, { backgroundColor: '#8B5CF6' + '15' }]}><Text style={[card.permText, { color: '#8B5CF6' }]}>Results</Text></View>}
                {t.permissions.promoteStudents && <View style={[card.permBadge, { backgroundColor: '#059669' + '15' }]}><Text style={[card.permText, { color: '#059669' }]}>Promote</Text></View>}
                {t.permissions.sendFeeReminder && <View style={[card.permBadge, { backgroundColor: '#F59E0B' + '15' }]}><Text style={[card.permText, { color: '#F59E0B' }]}>Fee Reminder</Text></View>}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ════ Teacher Detail Modal ════ */}
      <Modal visible={!!detailTeacher} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={[m.sheet, { backgroundColor: colors.card }]}>
            {detailTeacher && (() => {
              const sal = getCurrentSalary(detailTeacher.id);
              const salHistory = salaryRecords
                .filter(s => s.teacherId === detailTeacher.id)
                .sort(compareSalaryRecordsNewestFirst);
              const totalPaid = salHistory
                .filter(s => s.status === 'paid')
                .reduce((total, record) => total + record.amount, 0);
              return (
                <>
                  <View style={[m.header, { borderBottomColor: colors.border }]}>
                    <Text style={[m.title, { color: colors.text }]}>Teacher Details</Text>
                    <TouchableOpacity onPress={() => setDetailTeacher(null)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
                  </View>
                  <ScrollView style={{ padding: 20 }}>
                    {/* Info Card */}
                    <View style={[detail.infoCard, { backgroundColor: colors.secondary }]}>
                      <View style={[detail.bigAvatar, { backgroundColor: colors.primary }]}>
                        {detailTeacher.photo ? (
                          <Image source={{ uri: detailTeacher.photo }} style={detail.bigAvatarImage} />
                        ) : (
                          <Text style={detail.bigAvatarText}>{detailTeacher.name.charAt(0)}</Text>
                        )}
                      </View>
                      <Text style={[detail.bigName, { color: colors.text }]}>{detailTeacher.name}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>{detailTeacher.subject}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 2 }}>{detailTeacher.mobileNumber}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>@{detailTeacher.username} • Joined {detailTeacher.joinDate}</Text>
                    </View>

                    {/* Total Paid Salary */}
                    <View style={[detail.salaryCard, { borderColor: sal?.status === 'paid' ? colors.success : colors.border, backgroundColor: sal?.status === 'paid' ? colors.success + '10' : colors.muted }]}>
                      <View>
                        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Total Salary Paid</Text>
                        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>₹{totalPaid.toLocaleString('en-IN')}</Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          {sal?.status === 'paid' ? `${curMonth} ${curYear} paid` : `Monthly salary: ₹${detailTeacher.salary.toLocaleString('en-IN')}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[detail.salaryBtn, { backgroundColor: colors.primary }]}
                        onPress={() => { setDetailTeacher(null); openSalaryModal(detailTeacher); }}
                        activeOpacity={0.8}
                      >
                        <Feather name="plus" size={15} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Add Salary</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Permissions */}
                    <Text style={[m.sectionLabel, { color: colors.text }]}>Permissions</Text>
                    {([
                      { key: 'addStudent' as const, label: 'Add Students', desc: 'Can add new students to the system' },
                      { key: 'feeCollection' as const, label: 'Fee Collection', desc: 'Can collect fees from students' },
                      { key: 'sendFeeReminder' as const, label: 'Fee Reminder', desc: 'Can send WhatsApp & SMS fee reminders to parents' },
                      { key: 'manageClasses' as const, label: 'Manage Classes', desc: 'Can add, edit and delete classes' },
                      { key: 'manageExams' as const, label: 'Create Exams', desc: 'Can create and delete exams' },
                      { key: 'manageResults' as const, label: 'Manage Results', desc: 'Can view and enter student marks' },
                      { key: 'allowMarkEdit' as const, label: 'Allow Mark Edit', desc: 'Can edit marks after submitting them' },
                      { key: 'promoteStudents' as const, label: 'Promote Students', desc: 'Can promote students to next class' },
                    ]).map(perm => (
                      <View key={perm.key} style={[detail.permRow, { borderBottomColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{perm.label}</Text>
                          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{perm.desc}</Text>
                        </View>
                        <Switch
                          value={detailTeacher.permissions[perm.key]}
                          onValueChange={async (val) => {
                            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            const updated = { ...detailTeacher, permissions: { ...detailTeacher.permissions, [perm.key]: val } };
                            updateTeacher(detailTeacher.id, { permissions: updated.permissions });
                            setDetailTeacher(updated);
                          }}
                          trackColor={{ true: colors.primary, false: colors.border }}
                          thumbColor="#fff"
                        />
                      </View>
                    ))}

                    {/* Salary History */}
                    <Text style={[m.sectionLabel, { color: colors.text, marginTop: 20 }]}>Salary History</Text>
                    {salHistory.length === 0 && (
                      <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 10 }}>No salary records yet</Text>
                    )}
                    {salHistory.map(r => (
                      <View key={r.id} style={[detail.histRow, { borderBottomColor: colors.border }]}>
                        {confirmDeleteSalaryId === r.id ? (
                          /* ── inline confirm ── */
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 13, color: colors.mutedForeground, flex: 1 }}>Delete {r.month} {r.year}?</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }}
                                onPress={() => setConfirmDeleteSalaryId(null)}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>Cancel</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.destructive }}
                                onPress={() => { deleteSalaryRecord(r.id); setConfirmDeleteSalaryId(null); }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Delete</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          /* ── normal row ── */
                          <>
                            <View style={[detail.histIcon, { backgroundColor: r.status === 'paid' ? colors.success + '20' : colors.warning + '20' }]}>
                              <Feather name={r.status === 'paid' ? 'check' : 'clock'} size={15} color={r.status === 'paid' ? colors.success : colors.warning} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{r.month} {r.year}</Text>
                              {r.paidDate && <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Paid: {r.paidDate}</Text>}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>₹{r.amount.toLocaleString('en-IN')}</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                {r.status === 'paid' && (
                                  <TouchableOpacity onPress={() => printSalaryReceipt(r, detailTeacher, documentBranding)}>
                                    <Feather name="printer" size={14} color={colors.primary} />
                                  </TouchableOpacity>
                                )}
                                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: r.status === 'paid' ? colors.success + '20' : colors.warning + '20' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: r.status === 'paid' ? colors.success : colors.warning }}>{r.status === 'paid' ? 'PAID' : 'PENDING'}</Text>
                                </View>
                                <TouchableOpacity
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  onPress={() => setConfirmDeleteSalaryId(r.id)}
                                >
                                  <Feather name="trash-2" size={14} color={colors.destructive} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                  <View style={[m.footer, { borderTopColor: colors.border }]}>
                    <TouchableOpacity style={[m.footBtn, { borderColor: colors.destructive }]} onPress={() => handleDelete(detailTeacher)} activeOpacity={0.8}>
                      <Feather name="trash-2" size={16} color={colors.destructive} />
                      <Text style={{ color: colors.destructive, fontWeight: '600' }}>Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[m.footBtn, { flex: 2, backgroundColor: colors.primary }]} onPress={() => { setDetailTeacher(null); openEdit(detailTeacher); }} activeOpacity={0.8}>
                      <Feather name="edit-2" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '600' }}>Edit Teacher</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ════ Add/Edit Teacher Modal ════ */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={[m.sheet, { backgroundColor: colors.card }]}>
            <View style={[m.header, { borderBottomColor: colors.border }]}>
              <Text style={[m.title, { color: colors.text }]}>{editing ? 'Edit Teacher' : 'Add Teacher'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <TouchableOpacity style={[m.photoUpload, { backgroundColor: colors.secondary }]} onPress={handlePickImage}>
                  {form.photo ? (
                    <Image source={{ uri: form.photo }} style={m.photoImage} />
                  ) : (
                    <>
                      <Feather name="camera" size={24} color={colors.primary} />
                      <Text style={[m.photoUploadText, { color: colors.primary }]}>Upload Photo</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {([
                { key: 'name', label: 'Full Name *', placeholder: 'Teacher full name' },
                { key: 'subject', label: 'Subject *', placeholder: 'e.g. Mathematics' },
                { key: 'mobileNumber', label: 'Mobile Number', placeholder: '10-digit number', keyboard: 'phone-pad' as const },
                { key: 'salary', label: 'Monthly Salary (₹)', placeholder: 'Optional — e.g. 25000', keyboard: 'number-pad' as const },
                { key: 'username', label: 'Username *', placeholder: 'Login username' },
                { key: 'password', label: 'Password *', placeholder: 'Login password' },
              ] as { key: keyof typeof BLANK & string; label: string; placeholder: string; keyboard?: any }[]).map(f => (
                <View key={f.key} style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 }}>{f.label}</Text>
                  <TextInput
                    style={[inp.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                    value={(form as any)[f.key]}
                    onChangeText={v => setForm(p => ({ ...p, [f.key]: f.key === 'salary' ? v.replace(/\D/g, '') : v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={f.keyboard}
                    autoCapitalize="none"
                    secureTextEntry={f.key === 'password'}
                  />
                </View>
              ))}
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 12 }}>Permissions</Text>
              {([
                { key: 'addStudent' as const, label: 'Can Add Students', desc: 'Allow adding new students' },
                { key: 'feeCollection' as const, label: 'Can Collect Fees', desc: 'Allow fee collection' },
                { key: 'sendFeeReminder' as const, label: 'Can Send Fee Reminders', desc: 'Allow sending WhatsApp & SMS fee reminders to parents' },
                { key: 'manageClasses' as const, label: 'Can Manage Classes', desc: 'Allow adding, editing & deleting classes' },
                { key: 'manageExams' as const, label: 'Can Create Exams', desc: 'Allow creating & deleting exams' },
                { key: 'manageResults' as const, label: 'Can Manage Results', desc: 'Allow viewing & entering student marks' },
                { key: 'allowMarkEdit' as const, label: 'Allow Mark Edit', desc: 'Allow editing submitted marks' },
                { key: 'promoteStudents' as const, label: 'Can Promote Students', desc: 'Allow promoting students to next class' },
              ]).map(p => (
                <View key={p.key} style={{ marginBottom: 16, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.muted }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{p.label}</Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>{p.desc}</Text>
                    </View>
                    <Switch value={form.permissions[p.key]} onValueChange={val => setForm(prev => ({ ...prev, permissions: { ...prev.permissions, [p.key]: val } }))} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={[m.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[m.footBtn, { borderColor: colors.border }]} onPress={() => setShowModal(false)} activeOpacity={0.8}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[m.footBtn, { flex: 2, backgroundColor: colors.primary }]} onPress={handleSave} activeOpacity={0.8}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save Teacher</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════ Pay Salary Modal ════ */}
      <Modal visible={showSalaryModal} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={[m.sheet, { backgroundColor: colors.card }]}>
            <View style={[m.header, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[m.title, { color: colors.text }]}>Add Salary Payment</Text>
                {salaryTeacher && <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{salaryTeacher.name}</Text>}
              </View>
              <TouchableOpacity onPress={() => setShowSalaryModal(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              {/* Month picker */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[sal_.label, { color: colors.text }]}>Month *</Text>
                <TouchableOpacity style={[sal_.input, { backgroundColor: colors.muted, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setShowMonthPicker(true)}>
                  <Text style={{ color: colors.text }}>{salaryMonth}</Text>
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <View style={{ marginBottom: 16 }}>
                <Text style={[sal_.label, { color: colors.text }]}>Year *</Text>
                <TextInput style={[sal_.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]} value={salaryYear} onChangeText={setSalaryYear} placeholder="e.g. 2026" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" />
              </View>
              <View style={{ marginBottom: 16 }}>
                <Text style={[sal_.label, { color: colors.text }]}>Salary Amount (₹) *</Text>
                <TextInput style={[sal_.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]} value={salaryAmount} onChangeText={setSalaryAmount} placeholder="Enter amount" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" />
              </View>
            </ScrollView>
            <View style={[m.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[m.footBtn, { borderColor: colors.border }]} onPress={() => setShowSalaryModal(false)}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[m.footBtn, { flex: 2, backgroundColor: colors.success }]} onPress={handlePaySalary}>
                <Feather name="credit-card" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save Salary</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal visible={!!confirmDelete} animationType="fade" transparent>
        <View style={m.overlay}>
          <View style={[m.sheet, { backgroundColor: colors.card, borderRadius: 20, margin: 24 }]}>
            <View style={[m.header, { borderBottomColor: colors.border }]}>
              <Text style={[m.title, { color: colors.text }]}>Delete Teacher</Text>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
                Are you sure you want to remove <Text style={{ fontWeight: '700' }}>{confirmDelete?.name}</Text>? This action cannot be undone.
              </Text>
            </View>
            <View style={[m.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[m.footBtn, { borderColor: colors.border }]} onPress={() => setConfirmDelete(null)} activeOpacity={0.8}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[m.footBtn, { flex: 2, backgroundColor: colors.destructive }]} onPress={confirmDoDelete} activeOpacity={0.8}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════ Salary Success Modal ════ */}
      <SalarySuccessModal
        visible={!!salarySuccess}
        teacherName={salarySuccess?.name ?? ''}
        month={salarySuccess?.month ?? ''}
        year={salarySuccess?.year ?? ''}
        amount={salarySuccess?.amount ?? 0}
        onDismiss={() => setSalarySuccess(null)}
        onPrint={() => {
          if (salarySuccess) printSalaryReceipt(salarySuccess.rec, salarySuccess.teacher, documentBranding);
          setSalarySuccess(null);
        }}
      />

      {/* Month Picker */}
      <Modal visible={showMonthPicker} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={[m.sheet, { backgroundColor: colors.card, maxHeight: 440 }]}>
            <View style={[m.header, { borderBottomColor: colors.border }]}>
              <Text style={[m.title, { color: colors.text }]}>Select Month</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView>
              {MONTH_NAMES.map(mo => (
                <TouchableOpacity key={mo} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => { setSalaryMonth(mo); setShowMonthPicker(false); }}>
                  <Text style={{ fontSize: 15, color: salaryMonth === mo ? colors.primary : colors.text }}>{mo}</Text>
                  {salaryMonth === mo && <Feather name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const card = StyleSheet.create({
  container: { borderRadius: 14, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontSize: 20, fontWeight: '700' },
  avatarImage: { width: '100%', height: '100%' },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  salary: { fontSize: 13, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  perms: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1, paddingTop: 12 },
  permBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  permText: { fontSize: 11, fontWeight: '600' },
});
const detail = StyleSheet.create({
  infoCard: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 },
  bigAvatar: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden' },
  bigAvatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  bigAvatarImage: { width: '100%', height: '100%' },
  bigName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  salaryCard: { borderWidth: 1.5, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 },
  salaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  permRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  histIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
const inp = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
});
const sal_ = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  statusBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12 },
});
const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '95%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  sectionLabel: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  footer: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1 },
  footBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 14 },
  photoUpload: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoUploadText: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  photoImage: { width: '100%', height: '100%' },
});
const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  countText: { fontSize: 14 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});