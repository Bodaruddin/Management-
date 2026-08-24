/**
 * Inactive Management — Admin-only screen.
 * Three tabs:
 *   1. Class Rules  – enable/disable auto-inactive and set the absence limit per class
 *   2. All Students – view all students with status; manually activate / deactivate
 *   3. Requests     – review teacher reactivation requests with document preview
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
  TextInput, Switch, Modal, ActivityIndicator, Image, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useColors } from '@/hooks/useColors';
import { useApp, InactivationRequest } from '@/context/AppContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

function StatusBadge({ status, colors }: { status: string; colors: ReturnType<typeof useColors> }) {
  const color = status === 'active' ? colors.success : status === 'inactive' ? colors.destructive : colors.warning;
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
    </View>
  );
}

// ─── Tab 1: Class Rules ────────────────────────────────────────────────────────
function ClassRulesTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { classes, classAbsentLimits, setClassAbsentLimit } = useApp();
  // Local draft state: className → { enabled, limit }
  const [draft, setDraft] = useState<Record<string, { enabled: boolean; limit: string }>>(() => {
    const init: Record<string, { enabled: boolean; limit: string }> = {};
    classes.forEach(cls => {
      const saved = classAbsentLimits[cls] ?? 0;
      init[cls] = { enabled: saved > 0, limit: saved > 0 ? String(saved) : '5' };
    });
    return init;
  });
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSavedState] = useState<Record<string, boolean>>({});

  // Sync when classAbsentLimits or classes changes externally
  React.useEffect(() => {
    setDraft(prev => {
      const next = { ...prev };
      classes.forEach(cls => {
        if (!next[cls]) {
          const saved = classAbsentLimits[cls] ?? 0;
          next[cls] = { enabled: saved > 0, limit: saved > 0 ? String(saved) : '5' };
        }
      });
      return next;
    });
  }, [classes, classAbsentLimits]);

  const setEnabled = (cls: string, enabled: boolean) => {
    setDraft(prev => ({ ...prev, [cls]: { ...prev[cls], enabled } }));
  };
  const setLimit = (cls: string, limit: string) => {
    setDraft(prev => ({ ...prev, [cls]: { ...prev[cls], limit } }));
  };

  const save = async (cls: string) => {
    const d = draft[cls];
    if (!d) return;
    const days = d.enabled ? parseInt(d.limit, 10) : 0;
    if (d.enabled && (isNaN(days) || days < 1)) {
      Alert.alert('Invalid limit', 'Please enter a positive number for the absence limit.');
      return;
    }
    setSaving(prev => ({ ...prev, [cls]: true }));
    try {
      await setClassAbsentLimit(cls, days);
      setSavedState(prev => ({ ...prev, [cls]: true }));
      setTimeout(() => setSavedState(prev => ({ ...prev, [cls]: false })), 2000);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save');
    } finally {
      setSaving(prev => ({ ...prev, [cls]: false }));
    }
  };

  const s = rulesStyles(colors);

  return (
    <FlatList
      data={classes}
      keyExtractor={c => c}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
      ListHeaderComponent={
        <View style={[s.header, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
          <Feather name="info" size={14} color={colors.primary} />
          <Text style={[s.headerText, { color: colors.primary }]}>
            When auto-inactive is ON for a class, students who miss that many consecutive days are automatically marked Inactive.
          </Text>
        </View>
      }
      renderItem={({ item: cls }) => {
        const d = draft[cls] ?? { enabled: false, limit: '5' };
        const currentLimit = classAbsentLimits[cls] ?? 0;
        const isDirty = d.enabled !== (currentLimit > 0) || (d.enabled && String(currentLimit) !== d.limit);
        return (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <View style={s.cardTop}>
              <Text style={[s.className, { color: colors.text }]}>{cls}</Text>
              <Switch
                value={d.enabled}
                onValueChange={v => setEnabled(cls, v)}
                trackColor={{ false: colors.border, true: colors.primary + '80' }}
                thumbColor={d.enabled ? colors.primary : colors.mutedForeground}
              />
            </View>
            {d.enabled && (
              <View style={s.limitRow}>
                <Feather name="alert-circle" size={14} color={colors.mutedForeground} />
                <Text style={[s.limitLabel, { color: colors.mutedForeground }]}>Max consecutive absences:</Text>
                <TextInput
                  style={[s.limitInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={d.limit}
                  onChangeText={v => setLimit(cls, v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={[s.limitLabel, { color: colors.mutedForeground }]}>days</Text>
              </View>
            )}
            {!d.enabled && (
              <Text style={[s.disabledNote, { color: colors.mutedForeground }]}>Auto-inactive is off for this class</Text>
            )}
            {isDirty && (
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: saving[cls] ? colors.muted : colors.primary }]}
                onPress={() => save(cls)}
                disabled={!!saving[cls]}
                activeOpacity={0.8}
              >
                {saving[cls]
                  ? <ActivityIndicator size="small" color="#fff" />
                  : saved[cls]
                  ? <><Feather name="check" size={14} color="#fff" /><Text style={s.saveBtnText}>Saved</Text></>
                  : <><Feather name="save" size={14} color="#fff" /><Text style={s.saveBtnText}>Save</Text></>
                }
              </TouchableOpacity>
            )}
            {!isDirty && currentLimit > 0 && (
              <Text style={[s.currentNote, { color: colors.success }]}>
                Active — students absent {currentLimit}+ consecutive days are auto-marked inactive
              </Text>
            )}
          </View>
        );
      }}
    />
  );
}

const rulesStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  header: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 6, alignItems: 'flex-start' },
  headerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  card: { borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  className: { fontSize: 15, fontWeight: '700' },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  limitLabel: { fontSize: 13 },
  limitInput: { width: 52, textAlign: 'center', borderWidth: 1.5, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, fontSize: 16, fontWeight: '700' },
  disabledNote: { fontSize: 12, marginTop: 2 },
  currentNote: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, marginTop: 10 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

// ─── Tab 2: All Students ───────────────────────────────────────────────────────
type StudentFilter = 'all' | 'active' | 'inactive';

type ConfirmTarget = { id: string; name: string; current: string };

function AllStudentsTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { students, setStudentStatus } = useApp();
  const [filter, setFilter] = useState<StudentFilter>('all');
  const [search, setSearch] = useState('');
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 2500);
  }, []);

  const filtered = useMemo(() => {
    let list = students.filter(s => s.status !== 'graduated');
    if (filter !== 'all') list = list.filter(s => (s.status ?? 'active') === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.class.toLowerCase().includes(q) || s.rollNumber.includes(q));
    }
    return [...list].sort((a, b) => {
      // Inactive first, then by name
      const sa = a.status === 'inactive' ? 0 : 1;
      const sb = b.status === 'inactive' ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name);
    });
  }, [students, filter, search]);

  const handleToggle = useCallback(async (id: string, current: string) => {
    const next = current === 'inactive' ? 'active' : 'inactive';
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setToggling(prev => ({ ...prev, [id]: true }));
    setConfirmTarget(null);
    try {
      await setStudentStatus(id, next as 'active' | 'inactive');
      showSuccess(next === 'active' ? 'Student activated successfully' : 'Student deactivated successfully');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update status');
    } finally {
      setToggling(prev => ({ ...prev, [id]: false }));
    }
  }, [setStudentStatus, showSuccess]);

  const inactiveCount = useMemo(() => students.filter(s => s.status === 'inactive').length, [students]);
  const s = studStyles(colors);

  const isActivating = confirmTarget ? confirmTarget.current === 'inactive' : false;
  const actionColor = isActivating ? colors.success : colors.destructive;

  return (
    <View style={{ flex: 1 }}>
      {/* ── Confirmation Modal ── */}
      <Modal visible={!!confirmTarget} animationType="fade" transparent onRequestClose={() => setConfirmTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            {/* Icon */}
            <View style={[s.modalIconWrap, { backgroundColor: actionColor + '18' }]}>
              <Feather name={isActivating ? 'user-check' : 'user-x'} size={28} color={actionColor} />
            </View>
            {/* Title */}
            <Text style={[s.modalTitle, { color: colors.text }]}>
              {isActivating ? 'Activate Student' : 'Deactivate Student'}
            </Text>
            {/* Body */}
            <Text style={[s.modalBody, { color: colors.mutedForeground }]}>
              {isActivating
                ? `Activate ${confirmTarget?.name ?? 'this student'}? They will be marked active and included in attendance.`
                : `Deactivate ${confirmTarget?.name ?? 'this student'}? They will be marked inactive and excluded from attendance.`}
            </Text>
            {/* Buttons */}
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalCancelBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
                onPress={() => setConfirmTarget(null)}
                activeOpacity={0.8}
              >
                <Text style={[s.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmBtn, { backgroundColor: actionColor }]}
                onPress={() => confirmTarget && handleToggle(confirmTarget.id, confirmTarget.current)}
                activeOpacity={0.8}
              >
                <Feather name={isActivating ? 'user-check' : 'user-x'} size={15} color="#fff" />
                <Text style={s.modalConfirmText}>{isActivating ? 'Activate' : 'Deactivate'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Success Toast ── */}
      {!!successMsg && (
        <View style={[s.toast, { backgroundColor: colors.success }]} pointerEvents="none">
          <Feather name="check-circle" size={16} color="#fff" />
          <Text style={s.toastText}>{successMsg}</Text>
        </View>
      )}

      {/* Search + Filter */}
      <View style={[s.controls, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, class, roll…"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
          />
          {search ? <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={14} color={colors.mutedForeground} /></TouchableOpacity> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['all', 'active', 'inactive'] as StudentFilter[]).map(f => {
            const cnt = f === 'all'
              ? students.filter(s => s.status !== 'graduated').length
              : students.filter(s => (s.status ?? 'active') === f).length;
            const active = filter === f;
            const col = f === 'all' ? colors.primary : f === 'active' ? colors.success : colors.destructive;
            return (
              <TouchableOpacity key={f} style={[s.chip, { backgroundColor: active ? col : colors.muted, borderColor: active ? col : colors.border }]} onPress={() => setFilter(f)} activeOpacity={0.8}>
                <Text style={[s.chipText, { color: active ? '#fff' : colors.mutedForeground }]}>{f.charAt(0).toUpperCase() + f.slice(1)} ({cnt})</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={s => s.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="users" size={44} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>No Students</Text>
            <Text style={[s.emptySub, { color: colors.mutedForeground }]}>{filter === 'inactive' ? 'No inactive students.' : 'No students match your search.'}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isInactive = (item.status ?? 'active') === 'inactive';
          const isToggling = !!toggling[item.id];
          return (
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <View style={[s.avatar, { backgroundColor: isInactive ? colors.destructive + '15' : colors.primary + '12' }]}>
                <Text style={[s.avatarText, { color: isInactive ? colors.destructive : colors.primary }]}>{item.rollNumber}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[s.meta, { color: colors.mutedForeground }]}>{item.class}{item.section ? ` · ${item.section}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <StatusBadge status={item.status ?? 'active'} colors={colors} />
                <TouchableOpacity
                  style={[s.toggleBtn, {
                    backgroundColor: isInactive ? colors.success + '15' : colors.destructive + '12',
                    borderColor: isInactive ? colors.success + '40' : colors.destructive + '30',
                    opacity: isToggling ? 0.5 : 1,
                  }]}
                  onPress={() => setConfirmTarget({ id: item.id, name: item.name, current: item.status ?? 'active' })}
                  disabled={isToggling}
                  activeOpacity={0.75}
                >
                  {isToggling
                    ? <ActivityIndicator size="small" color={isInactive ? colors.success : colors.destructive} />
                    : <>
                        <Feather name={isInactive ? 'user-check' : 'user-x'} size={12} color={isInactive ? colors.success : colors.destructive} />
                        <Text style={[s.toggleBtnText, { color: isInactive ? colors.success : colors.destructive }]}>
                          {isInactive ? 'Activate' : 'Deactivate'}
                        </Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const studStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  controls: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, gap: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  avatar: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  meta: { fontSize: 12 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  toggleBtnText: { fontSize: 12, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center' },
  // Confirmation modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  modalCard: { width: '100%', borderRadius: 24, padding: 28, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  modalIconWrap: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  modalBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 26 },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  modalCancelBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  modalCancelText: { fontSize: 15, fontWeight: '700' },
  modalConfirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingVertical: 14 },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Success toast
  toast: { position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 16, zIndex: 999, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 10 },
  toastText: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
});

// ─── Tab 3: Requests (with document preview) ──────────────────────────────────
type ReqFilter = 'pending' | 'approved' | 'rejected' | 'all';

function reqStatusColor(status: string, colors: ReturnType<typeof useColors>) {
  if (status === 'pending') return colors.warning;
  if (status === 'approved') return colors.success;
  return colors.destructive;
}
function reqStatusIcon(status: string): React.ComponentProps<typeof Feather>['name'] {
  if (status === 'pending') return 'clock';
  if (status === 'approved') return 'check-circle';
  return 'x-circle';
}

function RequestReviewModal({
  request,
  onClose,
  onApprove,
  onReject,
  onDeleteDocument,
  onDeleteRequest,
  colors,
}: {
  request: InactivationRequest | null;
  onClose: () => void;
  onApprove: (id: string, note?: string) => Promise<void>;
  onReject: (id: string, note?: string) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onDeleteRequest: (id: string) => Promise<void>;
  colors: ReturnType<typeof useColors>;
}) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [requestDeleteConfirmVisible, setRequestDeleteConfirmVisible] = useState(false);
  const [deletingRequest, setDeletingRequest] = useState(false);

  const reset = () => {
    setNote('');
    setLoading(null);
    setError('');
    setDeleteConfirmVisible(false);
    setDeletingDocument(false);
    setRequestDeleteConfirmVisible(false);
    setDeletingRequest(false);
  };
  const handleClose = () => { reset(); onClose(); };

  const handleApprove = async () => {
    if (!request) return;
    setError(''); setLoading('approve');
    try {
      await onApprove(request.id, note.trim() || undefined);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset(); onClose();
    } catch (e: any) { setError(e?.message ?? 'Failed'); setLoading(null); }
  };

  const handleReject = async () => {
    if (!request) return;
    if (!note.trim()) { setError('Please provide a note explaining the rejection.'); return; }
    setError(''); setLoading('reject');
    try {
      await onReject(request.id, note.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      reset(); onClose();
    } catch (e: any) { setError(e?.message ?? 'Failed'); setLoading(null); }
  };

  const handleDownload = async () => {
    if (!request?.documentBase64) return;
    try {
      const filename = request.documentName?.trim() || `application-document-${request.id}`;
      if (Platform.OS === 'web') {
        const anchor = document.createElement('a');
        anchor.href = `data:${request.documentMimeType || 'application/octet-stream'};base64,${request.documentBase64}`;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return;
      }

      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error('Document storage is unavailable on this device.');
      const fileUri = `${directory}${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await FileSystem.writeAsStringAsync(fileUri, request.documentBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: request.documentMimeType || 'application/octet-stream',
          dialogTitle: filename,
        });
      } else {
        Alert.alert('Document saved', 'The document was saved on this device.');
      }
    } catch (e: any) {
      Alert.alert('Download failed', e?.message ?? 'Unable to download the document.');
    }
  };

  const handleDeleteDocument = () => {
    if (!request?.documentBase64) return;
    setDeleteConfirmVisible(true);
  };

  const confirmDeleteDocument = async () => {
    if (!request?.documentBase64 || deletingDocument) return;
    setDeletingDocument(true);
    try {
      await onDeleteDocument(request.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDeleteConfirmVisible(false);
    } catch (e: any) {
      setDeletingDocument(false);
      Alert.alert('Delete failed', e?.message ?? 'Unable to delete the document.');
    }
  };

  const handleDeleteRequest = () => {
    if (!request || deletingRequest) return;
    setRequestDeleteConfirmVisible(true);
  };

  const confirmDeleteRequest = async () => {
    if (!request || deletingRequest) return;
    setDeletingRequest(true);
    try {
      await onDeleteRequest(request.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onClose();
    } catch (e: any) {
      setDeletingRequest(false);
      Alert.alert('Delete failed', e?.message ?? 'Unable to delete the request.');
    }
  };

  if (!request) return null;
  const isReviewed = request.status !== 'pending';
  const col = reqStatusColor(request.status, colors);
  const hasImage = request.documentBase64 && request.documentMimeType?.startsWith('image/');
  const hasDoc = request.documentBase64 && !hasImage;
  const documentLabel = request.documentName?.trim() || 'Attached document';
  const m = reqModalStyles(colors);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={handleClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={m.avoidView}>
          <View style={m.sheet}>
            <View style={m.handle} />

            {/* Header */}
            <View style={m.header}>
              <View style={[m.iconWrap, { backgroundColor: col + '18' }]}>
                <Feather name={reqStatusIcon(request.status)} size={20} color={col} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[m.title, { color: colors.text }]}>{request.studentName}</Text>
                <Text style={[m.sub, { color: colors.mutedForeground }]}>{request.studentClass} · By {request.teacherName}</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={m.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Status row */}
              {isReviewed && (
                <View style={[m.statusRow, { backgroundColor: col + '14', borderColor: col + '35' }]}>
                  <Feather name={reqStatusIcon(request.status)} size={13} color={col} />
                  <Text style={[m.statusText, { color: col }]}>
                    {request.status === 'approved' ? 'Approved' : 'Rejected'}
                    {request.reviewedAt ? ` · ${fmt(request.reviewedAt)}` : ''}
                  </Text>
                </View>
              )}

              {/* Date submitted */}
              <Text style={[m.label, { color: colors.mutedForeground }]}>Submitted</Text>
              <Text style={[m.value, { color: colors.text }]}>{fmt(request.createdAt)}</Text>

              {/* Reason */}
              <Text style={[m.label, { color: colors.mutedForeground, marginTop: 12 }]}>Reason for Absence</Text>
              <View style={[m.box, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[m.boxText, { color: colors.text }]}>{request.reason}</Text>
              </View>

              {/* Document — image preview */}
              {hasImage && (
                <>
                  <Text style={[m.label, { color: colors.mutedForeground, marginTop: 12 }]}>
                    Application Document — {request.documentName}
                  </Text>
                  <View style={[m.imgWrap, { borderColor: colors.border }]}>
                    <Image
                      source={{ uri: `data:${request.documentMimeType};base64,${request.documentBase64}` }}
                      style={m.docImage}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={m.documentActions}>
                    <TouchableOpacity
                      style={[m.documentAction, { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}
                      onPress={handleDownload}
                      activeOpacity={0.8}
                    >
                      <Feather name="download" size={15} color={colors.primary} />
                      <Text style={[m.documentActionText, { color: colors.primary }]}>Download</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[m.documentAction, { borderColor: colors.destructive, backgroundColor: colors.destructive + '10' }]}
                      onPress={handleDeleteDocument}
                      activeOpacity={0.8}
                    >
                      <Feather name="trash-2" size={15} color={colors.destructive} />
                      <Text style={[m.documentActionText, { color: colors.destructive }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Document — non-image indicator */}
              {hasDoc && (
                <>
                  <Text style={[m.label, { color: colors.mutedForeground, marginTop: 12 }]}>Application Document</Text>
                  <View style={[m.docRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name="file-text" size={20} color={colors.primary} />
                    <Text style={[m.docName, { color: colors.text }]} numberOfLines={1}>{request.documentName ?? 'Attached document'}</Text>
                  </View>
                  <View style={m.documentActions}>
                    <TouchableOpacity
                      style={[m.documentAction, { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}
                      onPress={handleDownload}
                      activeOpacity={0.8}
                    >
                      <Feather name="download" size={15} color={colors.primary} />
                      <Text style={[m.documentActionText, { color: colors.primary }]}>Download</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[m.documentAction, { borderColor: colors.destructive, backgroundColor: colors.destructive + '10' }]}
                      onPress={handleDeleteDocument}
                      activeOpacity={0.8}
                    >
                      <Feather name="trash-2" size={15} color={colors.destructive} />
                      <Text style={[m.documentActionText, { color: colors.destructive }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {!request.documentBase64 && (
                <View style={[m.noDoc, { backgroundColor: colors.muted }]}>
                  <Feather name="paperclip" size={14} color={colors.mutedForeground} />
                  <Text style={[m.noDocText, { color: colors.mutedForeground }]}>No document attached</Text>
                </View>
              )}

              {/* Admin note (previous) */}
              {request.adminNote && isReviewed && (
                <>
                  <Text style={[m.label, { color: colors.mutedForeground, marginTop: 12 }]}>Admin Note</Text>
                  <View style={[m.box, { backgroundColor: col + '10', borderColor: col + '30' }]}>
                    <Text style={[m.boxText, { color: colors.text }]}>{request.adminNote}</Text>
                  </View>
                </>
              )}

              {/* Admin note input */}
              {!isReviewed && (
                <>
                  <Text style={[m.label, { color: colors.mutedForeground, marginTop: 12 }]}>
                    Admin Note <Text style={{ color: colors.mutedForeground, fontWeight: '400' }}>(required for rejection)</Text>
                  </Text>
                  <TextInput
                    style={[m.noteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                    value={note}
                    onChangeText={setNote}
                    placeholder="Add a note for the teacher…"
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </>
              )}

              {error ? (
                <View style={[m.errorBox, { backgroundColor: colors.destructive + '14', borderColor: colors.destructive }]}>
                  <Feather name="alert-circle" size={13} color={colors.destructive} />
                  <Text style={[m.errorText, { color: colors.destructive }]}>{error}</Text>
                </View>
              ) : null}

              <View style={{ height: 8 }} />
            </ScrollView>

            {/* Actions */}
            <TouchableOpacity
              style={[m.deleteRequestBtn, { borderColor: colors.destructive, opacity: loading || deletingRequest ? 0.55 : 1 }]}
              onPress={handleDeleteRequest}
              disabled={!!loading || deletingRequest}
              activeOpacity={0.8}
            >
              {deletingRequest
                ? <ActivityIndicator size="small" color={colors.destructive} />
                : <><Feather name="trash-2" size={16} color={colors.destructive} /><Text style={[m.deleteRequestText, { color: colors.destructive }]}>Delete Request</Text></>
              }
            </TouchableOpacity>
            {!isReviewed && (
              <View style={m.actions}>
                <TouchableOpacity
                  style={[m.rejectBtn, { borderColor: colors.destructive, opacity: loading ? 0.55 : 1 }]}
                  onPress={handleReject} disabled={!!loading} activeOpacity={0.8}
                >
                  {loading === 'reject'
                    ? <ActivityIndicator size="small" color={colors.destructive} />
                    : <><Feather name="x-circle" size={16} color={colors.destructive} /><Text style={[m.rejectText, { color: colors.destructive }]}>Reject</Text></>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[m.approveBtn, { backgroundColor: colors.success, opacity: loading ? 0.55 : 1 }]}
                  onPress={handleApprove} disabled={!!loading} activeOpacity={0.8}
                >
                  {loading === 'approve'
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Feather name="check-circle" size={16} color="#fff" /><Text style={m.approveText}>Approve & Reactivate</Text></>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>

        <Modal
          visible={deleteConfirmVisible}
          animationType="fade"
          transparent
          onRequestClose={() => !deletingDocument && setDeleteConfirmVisible(false)}
        >
          <View style={m.confirmOverlay}>
            <View style={[m.confirmCard, { backgroundColor: colors.card }]}>
              <View style={m.confirmHeader}>
                <View style={[m.confirmIcon, { backgroundColor: colors.destructive + '14' }]}>
                  <Feather name="trash-2" size={22} color={colors.destructive} />
                </View>
                <TouchableOpacity
                  onPress={() => !deletingDocument && setDeleteConfirmVisible(false)}
                  style={m.confirmClose}
                  disabled={deletingDocument}
                  activeOpacity={0.75}
                >
                  <Feather name="x" size={19} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <Text style={[m.confirmTitle, { color: colors.text }]}>Remove attachment?</Text>
              <Text style={[m.confirmDescription, { color: colors.mutedForeground }]}>
                This document will be permanently removed from the request.
              </Text>

              <View style={[m.confirmFile, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <View style={[m.confirmFileIcon, { backgroundColor: colors.primary + '12' }]}>
                  <Feather name={hasImage ? 'image' : 'file-text'} size={17} color={colors.primary} />
                </View>
                <Text style={[m.confirmFileName, { color: colors.text }]} numberOfLines={2}>
                  {documentLabel}
                </Text>
              </View>

              <View style={[m.confirmNotice, { backgroundColor: colors.warning + '10', borderColor: colors.warning + '35' }]}>
                <Feather name="info" size={14} color={colors.warning} />
                <Text style={[m.confirmNoticeText, { color: colors.mutedForeground }]}>
                  The request, student status, and review history will remain unchanged.
                </Text>
              </View>

              <View style={m.confirmActions}>
                <TouchableOpacity
                  style={[m.confirmCancel, { borderColor: colors.border, backgroundColor: colors.muted }]}
                  onPress={() => setDeleteConfirmVisible(false)}
                  disabled={deletingDocument}
                  activeOpacity={0.8}
                >
                  <Text style={[m.confirmCancelText, { color: colors.mutedForeground }]}>Keep document</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[m.confirmDelete, { backgroundColor: colors.destructive, opacity: deletingDocument ? 0.65 : 1 }]}
                  onPress={confirmDeleteDocument}
                  disabled={deletingDocument}
                  activeOpacity={0.8}
                >
                  {deletingDocument
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Feather name="trash-2" size={15} color="#fff" /><Text style={m.confirmDeleteText}>Remove</Text></>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
      <Modal
        visible={requestDeleteConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingRequest && setRequestDeleteConfirmVisible(false)}
      >
        <View style={m.confirmOverlay}>
          <View style={[m.confirmCard, { backgroundColor: colors.background }]}>
            <View style={m.confirmHeader}>
              <View style={[m.confirmIcon, { backgroundColor: colors.destructive + '15' }]}>
                <Feather name="trash-2" size={23} color={colors.destructive} />
              </View>
              <TouchableOpacity
                style={m.confirmClose}
                onPress={() => setRequestDeleteConfirmVisible(false)}
                disabled={deletingRequest}
              >
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[m.confirmTitle, { color: colors.text }]}>Delete request permanently?</Text>
            <Text style={[m.confirmDescription, { color: colors.mutedForeground }]}>
              This permanently removes the application request and its uploaded document from the database. It cannot be restored.
            </Text>
            <View style={[m.confirmFile, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={[m.confirmFileIcon, { backgroundColor: colors.destructive + '12' }]}>
                <Feather name="file-text" size={17} color={colors.destructive} />
              </View>
              <Text style={[m.confirmFileName, { color: colors.text }]} numberOfLines={2}>
                {request?.studentName ?? 'Application request'}
              </Text>
            </View>
            <View style={m.confirmActions}>
              <TouchableOpacity
                style={[m.confirmCancel, { borderColor: colors.border, backgroundColor: colors.muted }]}
                onPress={() => setRequestDeleteConfirmVisible(false)}
                disabled={deletingRequest}
                activeOpacity={0.8}
              >
                <Text style={[m.confirmCancelText, { color: colors.mutedForeground }]}>Keep request</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.confirmDelete, { backgroundColor: colors.destructive, opacity: deletingRequest ? 0.65 : 1 }]}
                onPress={confirmDeleteRequest}
                disabled={deletingRequest}
                activeOpacity={0.8}
              >
                {deletingRequest
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Feather name="trash-2" size={15} color="#fff" /><Text style={m.confirmDeleteText}>Delete</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const reqModalStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  avoidView: { justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%', paddingBottom: Platform.OS === 'ios' ? 34 : 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center', marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  body: { paddingHorizontal: 16, maxHeight: 500 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  statusText: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  value: { fontSize: 14, marginBottom: 4 },
  box: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 4 },
  boxText: { fontSize: 14, lineHeight: 20 },
  imgWrap: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 4, backgroundColor: '#000' },
  docImage: { width: '100%', height: 240 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 4 },
  docName: { flex: 1, fontSize: 13 },
  documentActions: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 4 },
  documentAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 9 },
  documentActionText: { fontSize: 13, fontWeight: '700' },
  noDoc: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginTop: 4, marginBottom: 4 },
  noDocText: { fontSize: 13 },
  noteInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 76, marginBottom: 10 },
  errorBox: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  errorText: { flex: 1, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  deleteRequestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 16, marginTop: 8, borderRadius: 12, paddingVertical: 10, borderWidth: 1 },
  deleteRequestText: { fontSize: 13, fontWeight: '700' },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5 },
  rejectText: { fontSize: 15, fontWeight: '700' },
  approveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 14 },
  approveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(7,18,35,0.62)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  confirmCard: { width: '100%', maxWidth: 390, borderRadius: 26, padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.24, shadowRadius: 28, elevation: 18 },
  confirmHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  confirmIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  confirmClose: { padding: 7, marginRight: -5, marginTop: -5 },
  confirmTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginBottom: 7 },
  confirmDescription: { fontSize: 14, lineHeight: 21, marginBottom: 18 },
  confirmFile: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 15, padding: 11, marginBottom: 12 },
  confirmFileIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  confirmFileName: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  confirmNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 20 },
  confirmNoticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  confirmCancel: { flex: 1.25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 13, paddingVertical: 13 },
  confirmCancelText: { fontSize: 13, fontWeight: '700' },
  confirmDelete: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, paddingVertical: 13 },
  confirmDeleteText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});

function RequestsTab({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { inactivationRequests, approveInactivationRequest, rejectInactivationRequest, deleteInactivationRequestDocument, deleteInactivationRequest, refreshInactivationRequests } = useApp();
  const [filter, setFilter] = useState<ReqFilter>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<InactivationRequest | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-fetch on mount so data restores after app is killed and relaunched
  React.useEffect(() => {
    refreshInactivationRequests().catch(() => {});
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refreshInactivationRequests(); } catch { /* ignore */ }
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    let list = inactivationRequests;
    if (filter !== 'all') list = list.filter(r => r.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.studentName.toLowerCase().includes(q) || r.studentClass.toLowerCase().includes(q) || r.teacherName.toLowerCase().includes(q));
    }
    return list;
  }, [inactivationRequests, filter, search]);

  const pendingCount = useMemo(() => inactivationRequests.filter(r => r.status === 'pending').length, [inactivationRequests]);
  const s = reqTabStyles(colors);

  return (
    <View style={{ flex: 1 }}>
      {selected && (
        <RequestReviewModal
          request={selected}
          onClose={() => setSelected(null)}
          onApprove={approveInactivationRequest}
          onReject={rejectInactivationRequest}
          onDeleteRequest={async id => {
            await deleteInactivationRequest(id);
            setSelected(null);
          }}
          onDeleteDocument={async id => {
            await deleteInactivationRequestDocument(id);
            setSelected(prev => prev && prev.id === id
              ? { ...prev, documentBase64: undefined, documentName: undefined, documentMimeType: undefined }
              : prev);
          }}
          colors={colors}
        />
      )}

      <View style={[s.controls, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.searchRow, { backgroundColor: colors.muted, borderColor: colors.border, flex: 1 }]}>
            <Feather name="search" size={15} color={colors.mutedForeground} />
            <TextInput style={[s.searchInput, { color: colors.text }]} value={search} onChangeText={setSearch} placeholder="Search…" placeholderTextColor={colors.mutedForeground} />
            {search ? <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={14} color={colors.mutedForeground} /></TouchableOpacity> : null}
          </View>
          <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={{ padding: 8 }}>
            {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="refresh-cw" size={17} color={colors.primary} />}
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['all', 'pending', 'approved', 'rejected'] as ReqFilter[]).map(f => {
            const cnt = f === 'all' ? inactivationRequests.length : inactivationRequests.filter(r => r.status === f).length;
            const active = filter === f;
            const col = f === 'all' ? colors.primary : f === 'pending' ? colors.warning : f === 'approved' ? colors.success : colors.destructive;
            return (
              <TouchableOpacity key={f} style={[s.chip, { backgroundColor: active ? col : colors.muted, borderColor: active ? col : colors.border }]} onPress={() => setFilter(f)} activeOpacity={0.8}>
                <Text style={[s.chipText, { color: active ? '#fff' : colors.mutedForeground }]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)} ({cnt})
                  {f === 'pending' && cnt > 0 ? ' ●' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="inbox" size={44} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>No Requests</Text>
            <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
              {filter === 'pending' ? 'No pending requests.' : `No ${filter} requests.`}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const col = reqStatusColor(item.status, colors);
          const hasDoc = !!item.documentBase64;
          return (
            <TouchableOpacity style={[s.card, { backgroundColor: colors.card }]} onPress={() => setSelected(item)} activeOpacity={0.85}>
              <View style={[s.stripe, { backgroundColor: col }]} />
              <View style={{ flex: 1, paddingLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={[s.cardName, { color: colors.text }]} numberOfLines={1}>{item.studentName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {hasDoc && (
                      <View style={[s.docBadge, { backgroundColor: colors.primary + '15' }]}>
                        <Feather name="image" size={11} color={colors.primary} />
                        <Text style={[s.docBadgeText, { color: colors.primary }]}>Doc</Text>
                      </View>
                    )}
                    <View style={[s.badge, { backgroundColor: col + '18' }]}>
                      <Feather name={reqStatusIcon(item.status)} size={10} color={col} />
                      <Text style={[s.badgeText, { color: col }]}>{item.status}</Text>
                    </View>
                  </View>
                </View>
                <Text style={[s.cardMeta, { color: colors.mutedForeground }]}>{item.studentClass} · {item.teacherName} · {fmt(item.createdAt)}</Text>
                <Text style={[s.cardReason, { color: colors.mutedForeground }]} numberOfLines={1}>{item.reason}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const reqTabStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  controls: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, gap: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, marginBottom: 10, overflow: 'hidden', paddingRight: 12, paddingVertical: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  stripe: { width: 4, alignSelf: 'stretch' },
  cardName: { fontSize: 14, fontWeight: '700', flex: 1 },
  cardMeta: { fontSize: 12, marginBottom: 2 },
  cardReason: { fontSize: 13 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  docBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  docBadgeText: { fontSize: 11, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type Tab = 'rules' | 'students' | 'requests';

export default function InactiveManagementScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { inactivationRequests, students } = useApp();
  const [tab, setTab] = useState<Tab>('rules');

  const pendingCount = useMemo(() => inactivationRequests.filter(r => r.status === 'pending').length, [inactivationRequests]);
  const inactiveCount = useMemo(() => students.filter(s => s.status === 'inactive').length, [students]);

  const topPad = Platform.OS === 'web' ? 16 : insets.top + 4;
  const botPad = Platform.OS === 'web' ? 0 : insets.bottom;

  const s = mainStyles(colors);

  const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Feather>['name']; badge?: number }[] = [
    { key: 'rules', label: 'Class Rules', icon: 'settings' },
    { key: 'students', label: 'Students', icon: 'users', badge: inactiveCount },
    { key: 'requests', label: 'Requests', icon: 'inbox', badge: pendingCount },
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingBottom: botPad }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad, backgroundColor: colors.card }]}>
        <View style={[s.headerIcon, { backgroundColor: colors.destructive + '14' }]}>
          <Feather name="shield" size={20} color={colors.destructive} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.text }]}>Inactive Management</Text>
          <Text style={[s.headerSub, { color: colors.mutedForeground }]}>
            {inactiveCount} inactive · {pendingCount} pending request{pendingCount !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[s.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabItem, tab === t.key && { borderBottomColor: colors.primary }]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.75}
          >
            <View style={{ position: 'relative' }}>
              <Feather name={t.icon} size={16} color={tab === t.key ? colors.primary : colors.mutedForeground} />
              {!!t.badge && t.badge > 0 && (
                <View style={[s.dot, { backgroundColor: tab === t.key && t.key === 'requests' ? colors.warning : colors.destructive }]}>
                  <Text style={s.dotText}>{t.badge > 9 ? '9+' : t.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[s.tabLabel, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {tab === 'rules' && <ClassRulesTab colors={colors} />}
        {tab === 'students' && <AllStudentsTab colors={colors} />}
        {tab === 'requests' && <RequestsTab colors={colors} />}
      </View>
    </View>
  );
}

const mainStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 3 },
  headerIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 13, fontWeight: '700' },
  dot: { position: 'absolute', top: -5, right: -8, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dotText: { fontSize: 9, fontWeight: '800', color: '#fff' },
});
