import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { Alumni, Student, useApp } from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';

const STATUS_OPTIONS = ['Studying', 'Working', 'Self-Employed', 'Other'];
const EMPTY_FORM = {
  name: '',
  fatherName: '',
  mobileNumber: '',
  batch: '',
  passOutClass: '',
  rollNumber: '',
  admissionNo: '',
  dateOfBirth: '',
  address: '',
  achievements: '',
  currentStatus: '',
  photo: undefined as string | undefined,
};

type AlumniForm = typeof EMPTY_FORM;
type AlumniPopup = {
  title: string;
  message: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  tone: 'warning' | 'success';
};

function studentToAlumni(student: Student, batch: string): Omit<Alumni, 'id' | 'batch'> {
  return {
    studentId: student.id,
    studentName: student.name,
    class: student.class,
    section: student.section,
    graduationYear: batch,
    name: student.name,
    fatherName: student.fatherName ?? '',
    mobileNumber: student.mobileNumber ?? '',
    passOutClass: student.class,
    rollNumber: student.rollNumber ?? '',
    admissionNo: student.admissionNo,
    dateOfBirth: student.dateOfBirth ?? '',
    address: student.address,
    achievements: '',
    currentStatus: '',
    photo: student.photo,
  };
}

function sortAlumni(a: Alumni, b: Alumni) {
  return String(b.batch ?? '').localeCompare(String(a.batch ?? ''), undefined, { numeric: true })
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export default function AlumniScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    alumni,
    students,
    classes,
    addAlumni,
    updateAlumni,
    deleteAlumni,
    bulkAddAlumni,
  } = useApp();

  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('All');
  const [selectedAlumni, setSelectedAlumni] = useState<Alumni | null>(null);
  const [editing, setEditing] = useState<Alumni | null>(null);
  const [form, setForm] = useState<AlumniForm>({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [reviewImport, setReviewImport] = useState(false);
  const [importClass, setImportClass] = useState('');
  const [importBatch, setImportBatch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [alumniPopup, setAlumniPopup] = useState<AlumniPopup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Alumni | null>(null);

  const batches = useMemo(
    () => ['All', ...Array.from(new Set(alumni.map(item => item.batch).filter(Boolean))).sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }))],
    [alumni],
  );

  const visibleAlumni = useMemo(() => {
    const query = search.trim().toLowerCase();
    return alumni
      .filter(item => {
        const matchesBatch = batchFilter === 'All' || item.batch === batchFilter;
        if (!query) return matchesBatch;
        const haystack = [
          item.name, item.batch, item.passOutClass, item.rollNumber,
          item.admissionNo, item.mobileNumber, item.fatherName,
        ].filter(Boolean).join(' ').toLowerCase();
        return matchesBatch && haystack.includes(query);
      })
      .sort(sortAlumni);
  }, [alumni, batchFilter, search]);

  const importStudents = useMemo(
    () => students.filter(student => student.class === importClass && (!student.status || student.status === 'active')),
    [students, importClass],
  );

  const bottomPadding = Platform.OS === 'web' ? 84 : insets.bottom + 88;
  const setField = (key: keyof AlumniForm, value: string) => {
    setForm(previous => ({ ...previous, [key]: value }));
  };

  const showAlumniPopup = (
    title: string,
    message: string,
    icon: AlumniPopup['icon'],
    tone: AlumniPopup['tone'],
  ) => setAlumniPopup({ title, message, icon, tone });

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm({ ...EMPTY_FORM });
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (item: Alumni) => {
    setEditing(item);
    setForm({
      name: item.name,
      fatherName: item.fatherName ?? '',
      mobileNumber: item.mobileNumber ?? '',
      batch: item.batch ?? '',
      passOutClass: item.passOutClass ?? item.class ?? '',
      rollNumber: item.rollNumber ?? '',
      admissionNo: item.admissionNo ?? '',
      dateOfBirth: item.dateOfBirth ?? '',
      address: item.address ?? '',
      achievements: item.achievements ?? '',
      currentStatus: item.currentStatus ?? '',
      photo: item.photo,
    });
    setSelectedAlumni(null);
    setShowForm(true);
  };

  const saveAlumni = async () => {
    if (!form.name.trim() || !form.batch.trim() || !form.passOutClass.trim()) {
      Alert.alert('Missing information', 'Name, batch, and pass-out class are required.');
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const data = {
      studentId: editing?.studentId ?? `manual-${Date.now()}`,
      studentName: form.name.trim(),
      class: editing?.class ?? form.passOutClass.trim(),
      section: editing?.section,
      graduationYear: form.batch.trim(),
      name: form.name.trim(),
      fatherName: form.fatherName.trim(),
      mobileNumber: form.mobileNumber.trim(),
      batch: form.batch.trim(),
      passOutClass: form.passOutClass.trim(),
      rollNumber: form.rollNumber.trim(),
      admissionNo: form.admissionNo.trim() || undefined,
      dateOfBirth: form.dateOfBirth.trim(),
      address: form.address.trim() || undefined,
      achievements: form.achievements.trim() || undefined,
      currentStatus: form.currentStatus || undefined,
      photo: form.photo,
    };
    if (editing) updateAlumni(editing.id, data);
    else addAlumni(data);
    closeForm();
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setField('photo', `data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const confirmDelete = (item: Alumni) => {
    setDeleteTarget(item);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteAlumni(deleteTarget.id);
    setDeleteTarget(null);
    setSelectedAlumni(null);
  };

  const openImport = () => {
    setImportClass('');
    setImportBatch('');
    setSelectedStudentIds([]);
    setReviewImport(false);
    setShowImport(true);
  };

  const continueImport = () => {
    if (!importClass) {
      Alert.alert('Select a class', 'Choose the class whose students should become alumni.');
      return;
    }
    if (!importBatch.trim()) {
      showAlumniPopup(
        'Enter a batch',
        'Add the graduation batch before reviewing students.',
        'calendar',
        'warning',
      );
      return;
    }
    if (importStudents.length === 0) {
      showAlumniPopup(
        'No active students',
        `There are no active students in ${importClass}.`,
        'users',
        'warning',
      );
      return;
    }
    setSelectedStudentIds(importStudents.map(student => student.id));
    setReviewImport(true);
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds(previous =>
      previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id],
    );
  };

  const runImport = async () => {
    const selected = importStudents.filter(student => selectedStudentIds.includes(student.id));
    if (selected.length === 0) {
      Alert.alert('Select students', 'Choose at least one student to import.');
      return;
    }
    setImportLoading(true);
    try {
      await bulkAddAlumni(selected.map(student => studentToAlumni(student, importBatch.trim())), importBatch.trim());
      setShowImport(false);
      setReviewImport(false);
      showAlumniPopup(
        'Import complete',
        `${selected.length} student${selected.length === 1 ? '' : 's'} added to your alumni directory.`,
        'check',
        'success',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Import failed', message.replace(/^POST \/api\/alumni\/bulk failed: \d+\s*—?\s*/, ''));
    } finally {
      setImportLoading(false);
    }
  };

  const renderAlumni = ({ item }: { item: Alumni }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={() => setSelectedAlumni(item)}
      activeOpacity={0.85}
    >
      <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
        {item.photo
          ? <Image source={{ uri: item.photo }} style={styles.avatarImage} />
          : <Text style={[styles.avatarText, { color: colors.primary }]}>{item.name.charAt(0).toUpperCase()}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.passOutClass} · Batch {item.batch}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {item.rollNumber ? `Roll ${item.rollNumber}` : 'No roll number'}
          {item.mobileNumber ? ` · ${item.mobileNumber}` : ''}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search alumni"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {!!search && <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={15} color={colors.mutedForeground} /></TouchableOpacity>}
        </View>
        <TouchableOpacity style={[styles.headerIcon, { backgroundColor: colors.secondary }]} onPress={openImport}>
          <Feather name="upload" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={openAdd}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]} contentContainerStyle={styles.filterContent}>
        {batches.map(batch => (
          <TouchableOpacity key={batch} style={[styles.filter, { backgroundColor: batchFilter === batch ? colors.primary : colors.muted }]} onPress={() => setBatchFilter(batch)}>
            <Text style={{ color: batchFilter === batch ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>{batch}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[styles.summary, { backgroundColor: colors.secondary }]}>
        <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color: colors.primary }]}>{alumni.length}</Text><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total</Text></View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color: colors.primary }]}>{batches.length - 1}</Text><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Batches</Text></View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color: colors.primary }]}>{visibleAlumni.length}</Text><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Showing</Text></View>
      </View>

      <FlatList
        data={visibleAlumni}
        keyExtractor={item => item.id}
        renderItem={renderAlumni}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPadding, flexGrow: visibleAlumni.length === 0 ? 1 : undefined }}
        ListEmptyComponent={<EmptyState icon="award" title="No Alumni Records" subtitle={search ? 'No alumni match your search.' : 'Add an alumnus or import a class to get started.'} actionLabel={search ? undefined : 'Import Class'} onAction={search ? undefined : openImport} />}
      />

      <Modal visible={!!selectedAlumni} animationType="slide" transparent onRequestClose={() => setSelectedAlumni(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            {selectedAlumni && (
              <>
                <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Alumni Details</Text>
                  <TouchableOpacity onPress={() => setSelectedAlumni(null)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={styles.detailContent}>
                  <View style={[styles.profile, { backgroundColor: colors.secondary }]}>
                    <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
                      {selectedAlumni.photo
                        ? <Image source={{ uri: selectedAlumni.photo }} style={styles.profileImage} />
                        : <Text style={styles.profileInitial}>{selectedAlumni.name.charAt(0).toUpperCase()}</Text>}
                    </View>
                    <Text style={[styles.profileName, { color: colors.text }]}>{selectedAlumni.name}</Text>
                    <Text style={[styles.profileBatch, { color: colors.primary }]}>Batch {selectedAlumni.batch}</Text>
                    <Text style={[styles.profileClass, { color: colors.mutedForeground }]}>{selectedAlumni.passOutClass}</Text>
                  </View>
                  {[
                    ["Father's Name", selectedAlumni.fatherName],
                    ['Mobile', selectedAlumni.mobileNumber],
                    ['Roll Number', selectedAlumni.rollNumber],
                    ['Admission No', selectedAlumni.admissionNo],
                    ['Date of Birth', selectedAlumni.dateOfBirth],
                    ['Current Status', selectedAlumni.currentStatus],
                    ['Address', selectedAlumni.address],
                    ['Achievements', selectedAlumni.achievements],
                  ].filter(([, value]) => !!value).map(([label, value]) => (
                    <View key={label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={[styles.footer, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={[styles.footerButton, { borderColor: colors.destructive }]} onPress={() => confirmDelete(selectedAlumni)}>
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                    <Text style={{ color: colors.destructive, fontWeight: '700' }}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.footerButton, { flex: 2, backgroundColor: colors.primary }]} onPress={() => openEdit(selectedAlumni)}>
                    <Feather name="edit-2" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={closeForm}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{editing ? 'Edit Alumni' : 'Add Alumni'}</Text>
              <TouchableOpacity onPress={closeForm}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={[styles.photoButton, { backgroundColor: colors.secondary }]} onPress={pickPhoto}>
                {form.photo ? <Image source={{ uri: form.photo }} style={styles.photoImage} /> : <><Feather name="camera" size={24} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Photo</Text></>}
              </TouchableOpacity>
              {([
                ['name', 'Full Name *', 'Student full name'],
                ['fatherName', "Father's Name", "Father's name"],
                ['mobileNumber', 'Mobile', '10-digit number'],
                ['batch', 'Batch *', 'e.g. 2023-24'],
                ['passOutClass', 'Pass-out Class *', 'e.g. Class 10'],
                ['rollNumber', 'Roll Number', 'e.g. 01'],
                ['admissionNo', 'Admission No', 'Admission number'],
                ['dateOfBirth', 'Date of Birth', 'YYYY-MM-DD'],
                ['address', 'Address', 'Home address'],
                ['achievements', 'Achievements', 'Awards and achievements'],
              ] as [keyof AlumniForm, string, string][]).map(([key, label, placeholder]) => (
                <View key={key} style={styles.field}>
                  <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
                  <TextInput
                    value={form[key] as string}
                    onChangeText={value => setField(key, value)}
                    placeholder={placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    multiline={key === 'address' || key === 'achievements'}
                    style={[styles.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }, (key === 'address' || key === 'achievements') && styles.multiline]}
                  />
                </View>
              ))}
              <Text style={[styles.label, { color: colors.text }]}>Current Status</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {['', ...STATUS_OPTIONS].map(status => (
                  <TouchableOpacity key={status || 'none'} style={[styles.statusOption, { backgroundColor: form.currentStatus === status ? colors.primary : colors.muted, borderColor: form.currentStatus === status ? colors.primary : colors.border }]} onPress={() => setField('currentStatus', status)}>
                    <Text style={{ color: form.currentStatus === status ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>{status || 'None'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </ScrollView>
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[styles.footerButton, { borderColor: colors.border }]} onPress={closeForm}><Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.footerButton, { flex: 2, backgroundColor: colors.primary }]} onPress={saveAlumni}><Text style={{ color: '#fff', fontWeight: '700' }}>{editing ? 'Save Changes' : 'Add Alumni'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showImport} animationType="slide" transparent onRequestClose={() => setShowImport(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{reviewImport ? 'Review Students' : 'Import Class'}</Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>{reviewImport ? `${importClass} · Batch ${importBatch}` : 'Create alumni records from active students'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowImport(false)}><Feather name="x" size={24} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            {!reviewImport ? (
              <ScrollView contentContainerStyle={styles.formContent}>
                <Text style={[styles.label, { color: colors.text }]}>Select Class *</Text>
                <View style={styles.classGrid}>
                  {classes.map(item => (
                    <TouchableOpacity key={item} style={[styles.classOption, { backgroundColor: importClass === item ? colors.primary : colors.muted, borderColor: importClass === item ? colors.primary : colors.border }]} onPress={() => setImportClass(item)}>
                      <Text style={{ color: importClass === item ? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.label, { color: colors.text, marginTop: 20 }]}>Batch Year *</Text>
                <TextInput value={importBatch} onChangeText={setImportBatch} placeholder="e.g. 2023-24" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]} />
                {importClass ? <Text style={[styles.help, { color: colors.mutedForeground }]}>{importStudents.length} active student{importStudents.length === 1 ? '' : 's'} found in {importClass}.</Text> : null}
              </ScrollView>
            ) : (
              <FlatList
                data={importStudents}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingVertical: 8 }}
                renderItem={({ item }) => {
                  const checked = selectedStudentIds.includes(item.id);
                  return (
                    <TouchableOpacity style={[styles.studentRow, { borderBottomColor: colors.border }]} onPress={() => toggleStudent(item.id)}>
                      <View style={[styles.checkbox, { backgroundColor: checked ? colors.primary : 'transparent', borderColor: checked ? colors.primary : colors.border }]}>{checked && <Feather name="check" size={13} color="#fff" />}</View>
                      <View style={[styles.smallAvatar, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.primary, fontWeight: '800' }}>{item.name.charAt(0).toUpperCase()}</Text></View>
                      <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>Roll {item.rollNumber || '—'}{item.admissionNo ? ` · Adm ${item.admissionNo}` : ''}</Text></View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[styles.footerButton, { borderColor: colors.border }]} onPress={() => reviewImport ? setReviewImport(false) : setShowImport(false)} disabled={importLoading}><Text style={{ color: colors.text, fontWeight: '700' }}>{reviewImport ? 'Back' : 'Cancel'}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.footerButton, { flex: 2, backgroundColor: colors.primary }]} onPress={reviewImport ? runImport : continueImport} disabled={importLoading}>
                {importLoading ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: '#fff', fontWeight: '700' }}>{reviewImport ? `Import ${selectedStudentIds.length} Students` : 'Review Students'}</Text><Feather name={reviewImport ? 'upload' : 'arrow-right'} size={16} color="#fff" /></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View style={[styles.popupOverlay, { backgroundColor: colors.text + 'B8' }]}>
          <View style={[styles.popupCard, styles.deletePopupCard, { backgroundColor: colors.card }]}>
            {deleteTarget && (
              <>
                <View style={[styles.popupIcon, styles.deletePopupIcon, { backgroundColor: colors.destructive + '16' }]}>
                  <Feather name="trash-2" size={24} color={colors.destructive} />
                </View>
                <Text style={[styles.popupEyebrow, { color: colors.destructive }]}>PERMANENT ACTION</Text>
                <Text style={[styles.popupTitle, { color: colors.text }]}>Delete alumni record?</Text>
                <Text style={[styles.popupMessage, { color: colors.mutedForeground }]}>
                  Remove <Text style={{ color: colors.text, fontWeight: '800' }}>{deleteTarget.name}</Text> from your alumni records? This action cannot be undone.
                </Text>
                <View style={styles.deleteActions}>
                  <TouchableOpacity
                    activeOpacity={0.84}
                    onPress={() => setDeleteTarget(null)}
                    style={[styles.deleteCancelButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                  >
                    <Text style={[styles.deleteCancelText, { color: colors.text }]}>Keep Record</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.84}
                    onPress={handleDelete}
                    style={[styles.deleteConfirmButton, { backgroundColor: colors.destructive }]}
                  >
                    <Feather name="trash-2" size={16} color={colors.destructiveForeground} />
                    <Text style={[styles.deleteConfirmText, { color: colors.destructiveForeground }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!alumniPopup}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAlumniPopup(null)}
      >
        <View style={[styles.popupOverlay, { backgroundColor: colors.text + 'B0' }]}>
          <View style={[styles.popupCard, { backgroundColor: colors.card }]}>
            {alumniPopup && (
              <>
                <View
                  style={[
                    styles.popupIcon,
                    {
                      backgroundColor: alumniPopup.tone === 'success'
                        ? colors.success + '18'
                        : colors.warning + '18',
                    },
                  ]}
                >
                  <Feather
                    name={alumniPopup.icon}
                    size={25}
                    color={alumniPopup.tone === 'success' ? colors.success : colors.warning}
                  />
                </View>
                <Text style={[styles.popupTitle, { color: colors.text }]}>{alumniPopup.title}</Text>
                <Text style={[styles.popupMessage, { color: colors.mutedForeground }]}>
                  {alumniPopup.message}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => setAlumniPopup(null)}
                  style={[
                    styles.popupButton,
                    {
                      backgroundColor: alumniPopup.tone === 'success'
                        ? colors.primary
                        : colors.text,
                    },
                  ]}
                >
                  <Text style={[styles.popupButtonText, { color: colors.primaryForeground }]}>Okay</Text>
                  <Feather name="arrow-right" size={16} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, padding: 0, fontSize: 14 },
  headerIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  filterBar: { maxHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  filterContent: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  filter: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7 },
  summary: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 12, padding: 14 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 50, height: 50, borderRadius: 25 },
  avatarText: { fontSize: 20, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  meta: { fontSize: 12, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', minHeight: '45%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  popupOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  popupCard: { width: '100%', maxWidth: 390, borderRadius: 24, paddingHorizontal: 24, paddingTop: 26, paddingBottom: 22, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 14 },
  deletePopupCard: { paddingTop: 24, paddingBottom: 20 },
  popupIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  deletePopupIcon: { marginBottom: 12 },
  popupEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 7 },
  popupTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  popupMessage: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 9, maxWidth: 300 },
  popupButton: { width: '100%', minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22 },
  popupButtonText: { fontSize: 15, fontWeight: '800' },
  deleteActions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 22 },
  deleteCancelButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  deleteConfirmButton: { flex: 1, minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  deleteCancelText: { fontSize: 14, fontWeight: '800' },
  deleteConfirmText: { fontSize: 14, fontWeight: '800' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSubtitle: { fontSize: 13, marginTop: 3 },
  detailContent: { padding: 20, paddingBottom: 28 },
  profile: { alignItems: 'center', borderRadius: 16, padding: 20, marginBottom: 16 },
  profileAvatar: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10 },
  profileImage: { width: 78, height: 78, borderRadius: 39 },
  profileInitial: { color: '#fff', fontSize: 32, fontWeight: '800' },
  profileName: { fontSize: 20, fontWeight: '800' },
  profileBatch: { fontSize: 13, fontWeight: '700', marginTop: 5 },
  profileClass: { fontSize: 13, marginTop: 3 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { flex: 1, fontSize: 13 },
  detailValue: { flex: 2, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  footerButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  formContent: { padding: 20, paddingBottom: 32 },
  photoButton: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 18, overflow: 'hidden', gap: 4 },
  photoImage: { width: 78, height: 78, borderRadius: 39 },
  field: { marginBottom: 13 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  statusOption: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7 },
  help: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classOption: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  checkbox: { width: 22, height: 22, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  smallAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});