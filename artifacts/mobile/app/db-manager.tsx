import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

// ─── Types ────────────────────────────────────────────────────────────────────
type DbType = 'postgresql' | 'firebase';

interface DbConnection {
  id: string;
  name: string;
  dbType: DbType;
  // PostgreSQL
  host?: string;
  dbName?: string;
  // Firebase
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

interface ActiveInfo {
  id: string | null;
  name: string;
  connected: boolean;
  dbType: DbType | null;
}

interface TestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  dbType?: DbType;
}

interface FirebaseFields {
  projectId: string;
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  serviceAccountJson: string;
}

interface FormState {
  name: string;
  dbType: DbType;
  // PostgreSQL
  url: string;
  // Firebase
  firebase: FirebaseFields;
}

const DEFAULT_FIREBASE: FirebaseFields = {
  projectId: '', apiKey: '', authDomain: '', storageBucket: '',
  messagingSenderId: '', appId: '', serviceAccountJson: '',
};

// ─── API helpers ──────────────────────────────────────────────────────────────
const getApiBase = (): string => {
  if (Platform.OS === 'web') return '';
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : '';
};

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 340, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <View style={[sp.pill, { backgroundColor: connected ? '#DCFCE7' : '#FEF2F2' }]}>
      <View style={[sp.dot, { backgroundColor: connected ? '#16A34A' : '#DC2626' }]} />
      <Text style={[sp.txt, { color: connected ? '#16A34A' : '#DC2626' }]}>
        {connected ? 'Connected' : 'Disconnected'}
      </Text>
    </View>
  );
}
const sp = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  txt: { fontSize: 11, fontWeight: '700' },
});

function DbTypeBadge({ type }: { type: DbType }) {
  const isPg = type === 'postgresql';
  return (
    <View style={[dtb.wrap, { backgroundColor: isPg ? '#EFF6FF' : '#FFF7ED' }]}>
      <Feather name={isPg ? 'database' : 'cloud'} size={10} color={isPg ? '#2563EB' : '#EA580C'} />
      <Text style={[dtb.txt, { color: isPg ? '#2563EB' : '#EA580C' }]}>
        {isPg ? 'PostgreSQL' : 'Firebase'}
      </Text>
    </View>
  );
}
const dtb = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  txt: { fontSize: 10, fontWeight: '700' },
});

// ─── Connection card ──────────────────────────────────────────────────────────
function ConnectionCard({
  conn, testResult, testing, activating,
  onTest, onActivate, onEdit, onDelete,
}: {
  conn: DbConnection;
  testResult?: TestResult;
  testing: boolean; activating: boolean;
  onTest: () => void; onActivate: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const isPg = conn.dbType === 'postgresql';
  const subtitle = isPg ? conn.host : `${conn.projectId}`;
  const sub2 = isPg ? (conn.dbName ? `/${conn.dbName}` : '') : 'Firestore';

  return (
    <View style={[cc.card, conn.isActive && cc.activeCard]}>
      {conn.isActive && (
        <View style={cc.activeBadge}>
          <Feather name="check-circle" size={11} color="#fff" />
          <Text style={cc.activeBadgeTxt}>ACTIVE</Text>
        </View>
      )}

      <View style={cc.header}>
        <View style={[cc.iconWrap, { backgroundColor: conn.isActive ? (isPg ? '#DBEAFE' : '#FFEDD5') : '#F1F5F9' }]}>
          <Feather
            name={isPg ? 'database' : 'cloud'}
            size={20}
            color={conn.isActive ? (isPg ? '#2563EB' : '#EA580C') : '#64748B'}
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Text style={cc.name} numberOfLines={1}>{conn.name}</Text>
            <DbTypeBadge type={conn.dbType} />
          </View>
          <Text style={cc.host} numberOfLines={1}>{subtitle}</Text>
          <Text style={cc.db} numberOfLines={1}>{sub2}</Text>
        </View>
      </View>

      {testResult && (
        <View style={[cc.testBanner, { backgroundColor: testResult.success ? '#ECFDF5' : '#FEF2F2' }]}>
          <Feather name={testResult.success ? 'check-circle' : 'x-circle'} size={13}
            color={testResult.success ? '#10B981' : '#EF4444'} />
          <Text style={[cc.testTxt, { color: testResult.success ? '#10B981' : '#EF4444' }]}>
            {testResult.message}{testResult.latencyMs != null ? ` (${testResult.latencyMs}ms)` : ''}
          </Text>
        </View>
      )}

      <View style={cc.actions}>
        <TouchableOpacity style={[cc.btn, cc.testBtn]} onPress={onTest} disabled={testing} activeOpacity={0.8}>
          {testing ? <ActivityIndicator size={13} color="#7C3AED" /> : <Feather name="zap" size={13} color="#7C3AED" />}
          <Text style={[cc.btnTxt, { color: '#7C3AED' }]}>Test</Text>
        </TouchableOpacity>
        {!conn.isActive && (
          <TouchableOpacity style={[cc.btn, cc.activateBtn]} onPress={onActivate} disabled={activating} activeOpacity={0.8}>
            {activating ? <ActivityIndicator size={13} color="#2563EB" /> : <Feather name="toggle-right" size={13} color="#2563EB" />}
            <Text style={[cc.btnTxt, { color: '#2563EB' }]}>Activate</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[cc.btn, cc.editBtn]} onPress={onEdit} activeOpacity={0.8}>
          <Feather name="edit-2" size={13} color="#F59E0B" />
          <Text style={[cc.btnTxt, { color: '#F59E0B' }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cc.btn, cc.deleteBtn]} onPress={onDelete} activeOpacity={0.8}>
          <Feather name="trash-2" size={13} color="#EF4444" />
          <Text style={[cc.btnTxt, { color: '#EF4444' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const cc = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3, borderWidth: 1.5, borderColor: '#F1F5F9',
  },
  activeCard: { borderColor: '#BFDBFE' },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563EB',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 10,
  },
  activeBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  host: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  db: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  testBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 12,
  },
  testTxt: { fontSize: 12, fontWeight: '600', flex: 1 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  btnTxt: { fontSize: 12, fontWeight: '700' },
  testBtn: { borderColor: '#DDD6FE', backgroundColor: '#F5F3FF' },
  activateBtn: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  editBtn: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  deleteBtn: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
});

// ─── Form field helpers ───────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, secure, multiline, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; secure?: boolean; multiline?: boolean; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <Text style={fm.label}>{label}</Text>
      <View style={[fm.inputWrap, multiline && { alignItems: 'flex-start', minHeight: 80 }]}>
        <TextInput
          style={[fm.input, multiline && { textAlignVertical: 'top', minHeight: 72, paddingTop: 8 }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#CBD5E1"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure && !show}
          multiline={multiline}
        />
        {secure && (
          <TouchableOpacity onPress={() => setShow(!show)} style={{ padding: 4 }}>
            <Feather name={show ? 'eye-off' : 'eye'} size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>
      {hint ? <Text style={fm.hint}>{hint}</Text> : null}
    </>
  );
}

// ─── Type selector ────────────────────────────────────────────────────────────
function TypeSelector({ value, onChange, disabled }: { value: DbType; onChange: (v: DbType) => void; disabled?: boolean }) {
  return (
    <View style={ts.row}>
      {(['postgresql', 'firebase'] as DbType[]).map((t) => {
        const active = value === t;
        return (
          <TouchableOpacity
            key={t}
            style={[ts.btn, active && ts.active]}
            onPress={() => !disabled && onChange(t)}
            activeOpacity={0.8}
          >
            <Feather name={t === 'postgresql' ? 'database' : 'cloud'} size={14}
              color={active ? '#fff' : '#64748B'} />
            <Text style={[ts.txt, active && ts.activeTxt]}>
              {t === 'postgresql' ? 'PostgreSQL' : 'Firebase'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const ts = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 4 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  active: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  txt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  activeTxt: { color: '#fff' },
});

// ─── Connection form modal ────────────────────────────────────────────────────
function ConnectionFormModal({
  visible, initial, onClose, onSave,
}: {
  visible: boolean;
  initial?: DbConnection;
  onClose: () => void;
  onSave: (data: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>({
    name: '', dbType: 'postgresql', url: '', firebase: DEFAULT_FIREBASE,
  });
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const setFb = (key: keyof FirebaseFields, val: string) =>
    setForm((f) => ({ ...f, firebase: { ...f.firebase, [key]: val } }));

  useEffect(() => {
    if (visible) {
      setForm({
        name: initial?.name ?? '',
        dbType: initial?.dbType ?? 'postgresql',
        url: '',
        firebase: DEFAULT_FIREBASE,
      });
      setTestResult(null);
    }
  }, [visible, initial]);

  const handleTest = async () => {
    const isPg = form.dbType === 'postgresql';
    if (isPg && !form.url.trim()) { Alert.alert('Validation', 'Enter a connection URL first'); return; }
    if (!isPg && (!form.firebase.projectId || !form.firebase.serviceAccountJson)) {
      Alert.alert('Validation', 'Enter Project ID and Service Account JSON first'); return;
    }
    setTesting(true); setTestResult(null);
    try {
      const body: any = { name: `__test_${Date.now()}`, dbType: form.dbType };
      if (isPg) body.url = form.url.trim();
      else Object.assign(body, form.firebase);

      const created = await apiFetch<DbConnection>('/db-connections', { method: 'POST', body: JSON.stringify(body) });
      const result = await apiFetch<TestResult>(`/db-connections/${created.id}/test`, { method: 'POST' });
      await apiFetch(`/db-connections/${created.id}`, { method: 'DELETE' });
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Validation', 'Connection name is required'); return; }
    const isPg = form.dbType === 'postgresql';
    if (!initial) {
      if (isPg && !form.url.trim()) { Alert.alert('Validation', 'Connection URL is required'); return; }
      if (!isPg && (!form.firebase.projectId || !form.firebase.serviceAccountJson)) {
        Alert.alert('Validation', 'Project ID and Service Account JSON are required'); return;
      }
    }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  const isPg = form.dbType === 'postgresql';

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={fm.overlay}>
          <View style={fm.sheet}>
            <View style={fm.handle} />
            <Text style={fm.title}>{initial ? 'Edit Connection' : 'New Connection'}</Text>
            <Text style={fm.subtitle}>
              {initial ? 'Update connection details below.' : 'Configure a database connection.'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Name */}
              <Field
                label="Connection Name *"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. Production DB"
              />

              {/* Type selector — only show when creating */}
              {!initial && (
                <>
                  <Text style={fm.label}>Database Type *</Text>
                  <TypeSelector value={form.dbType} onChange={(v) => setForm((f) => ({ ...f, dbType: v }))} />
                </>
              )}

              {/* PostgreSQL fields */}
              {isPg && (
                <Field
                  label={initial ? 'New URL (leave blank to keep)' : 'Connection URL *'}
                  value={form.url}
                  onChange={(v) => setForm((f) => ({ ...f, url: v }))}
                  placeholder="postgresql://user:pass@host:5432/dbname"
                  secure
                  hint="Format: postgresql://username:password@host:port/database"
                />
              )}

              {/* Firebase fields */}
              {!isPg && (
                <>
                  <Field label="Project ID *" value={form.firebase.projectId} onChange={(v) => setFb('projectId', v)} placeholder="your-project-id" />
                  <Field label="API Key *" value={form.firebase.apiKey} onChange={(v) => setFb('apiKey', v)} placeholder="AIza..." secure />
                  <Field label="Auth Domain" value={form.firebase.authDomain} onChange={(v) => setFb('authDomain', v)} placeholder="your-project.firebaseapp.com" />
                  <Field label="Storage Bucket" value={form.firebase.storageBucket} onChange={(v) => setFb('storageBucket', v)} placeholder="your-project.appspot.com" />
                  <Field label="Messaging Sender ID" value={form.firebase.messagingSenderId} onChange={(v) => setFb('messagingSenderId', v)} placeholder="123456789" />
                  <Field label="App ID" value={form.firebase.appId} onChange={(v) => setFb('appId', v)} placeholder="1:123:web:abc" />
                  <Field
                    label="Service Account JSON *"
                    value={form.firebase.serviceAccountJson}
                    onChange={(v) => setFb('serviceAccountJson', v)}
                    placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                    multiline
                    hint="Paste the full service account JSON from Firebase Console → Project Settings → Service Accounts"
                  />
                </>
              )}

              {/* Test result */}
              {testResult && (
                <View style={[fm.testBanner, { backgroundColor: testResult.success ? '#ECFDF5' : '#FEF2F2' }]}>
                  <Feather name={testResult.success ? 'check-circle' : 'x-circle'} size={14}
                    color={testResult.success ? '#10B981' : '#EF4444'} />
                  <Text style={[fm.testTxt, { color: testResult.success ? '#10B981' : '#EF4444' }]}>
                    {testResult.message}{testResult.latencyMs != null ? ` · ${testResult.latencyMs}ms` : ''}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <TouchableOpacity style={fm.testBtn} onPress={handleTest} disabled={testing} activeOpacity={0.8}>
                  {testing ? <ActivityIndicator size={14} color="#7C3AED" /> : <Feather name="zap" size={14} color="#7C3AED" />}
                  <Text style={fm.testBtnTxt}>Test</Text>
                </TouchableOpacity>
                <TouchableOpacity style={fm.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                  <Text style={fm.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={fm.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                  {saving ? <ActivityIndicator size={14} color="#fff" /> : <Feather name="save" size={14} color="#fff" />}
                  <Text style={fm.saveBtnTxt}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const fm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, maxHeight: '92%', minHeight: '70%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748B', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 14 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 4,
  },
  input: { flex: 1, fontSize: 13, color: '#1E293B', paddingVertical: 10 },
  hint: { fontSize: 11, color: '#94A3B8', marginTop: 5 },
  testBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 12, marginTop: 12 },
  testTxt: { fontSize: 13, fontWeight: '600', flex: 1 },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F5F3FF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: '#DDD6FE',
  },
  testBtnTxt: { color: '#7C3AED', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  cancelBtnTxt: { color: '#64748B', fontWeight: '700', fontSize: 14 },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 12,
  },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Main screen
// ═══════════════════════════════════════════════════════════════════════════════
export default function DbManagerScreen() {
  const insets = useSafeAreaInsets();
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [activeInfo, setActiveInfo] = useState<ActiveInfo>({ id: null, name: 'None', connected: false, dbType: null });
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editingConn, setEditingConn] = useState<DbConnection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DbConnection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [conns, info] = await Promise.all([
        apiFetch<DbConnection[]>('/db-connections'),
        apiFetch<ActiveInfo>('/db-connections/active'),
      ]);
      setConnections(conns);
      setActiveInfo(info);
    } catch (e) {
      console.error('Failed to load DB connections', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const handleTest = async (conn: DbConnection) => {
    setTestingId(conn.id);
    try {
      const result = await apiFetch<TestResult>(`/db-connections/${conn.id}/test`, { method: 'POST' });
      setTestResults((prev) => ({ ...prev, [conn.id]: result }));
    } catch (e: any) {
      setTestResults((prev) => ({ ...prev, [conn.id]: { success: false, message: e.message } }));
    } finally {
      setTestingId(null);
    }
  };

  const handleActivate = async (conn: DbConnection) => {
    setActivatingId(conn.id);
    try {
      const result = await apiFetch<{ success: boolean; message: string }>(
        `/db-connections/${conn.id}/activate`, { method: 'POST' },
      );
      if (result.success) {
        Alert.alert('✅ Switched', result.message);
        await load();
      } else {
        Alert.alert('Connection Failed', result.message);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = (conn: DbConnection) => {
    setDeleteTarget(conn);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/db-connections/${deleteTarget.id}`, { method: 'DELETE' });
      setTestResults((prev) => { const n = { ...prev }; delete n[deleteTarget.id]; return n; });
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      setDeleteTarget(null);
      Alert.alert('Error', e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (data: FormState) => {
    try {
      if (editingConn) {
        const body: any = { name: data.name };
        if (editingConn.dbType === 'postgresql' && data.url) body.url = data.url;
        if (editingConn.dbType === 'firebase') {
          const hasChanges = Object.values(data.firebase).some((v) => v);
          if (hasChanges) body.config = data.firebase;
        }
        await apiFetch(`/db-connections/${editingConn.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        const body: any = { name: data.name, dbType: data.dbType };
        if (data.dbType === 'postgresql') body.url = data.url;
        else Object.assign(body, data.firebase);
        await apiFetch('/db-connections', { method: 'POST', body: JSON.stringify(body) });
      }
      setFormVisible(false);
      setEditingConn(null);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
      throw e;
    }
  };

  const topPad = Platform.OS === 'web' ? 16 : insets.top + 10;
  const botPad = Platform.OS === 'web' ? 80 : insets.bottom + 24;

  // Active db color/icon
  const activeIsPg = activeInfo.dbType === 'postgresql';
  const activeColors: [string, string, string] = activeInfo.connected
    ? (activeIsPg ? ['#1E3A8A', '#1D4ED8', '#2563EB'] : ['#7C2D12', '#C2410C', '#EA580C'])
    : ['#374151', '#4B5563', '#6B7280'];

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFF' }}>
      {/* Header */}
      <LinearGradient
        colors={['#1E40AF', '#2563EB', '#3B82F6']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: topPad }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Database Manager</Text>
          <Text style={s.headerSub}>Manage PostgreSQL &amp; Firebase connections</Text>
        </View>
        <TouchableOpacity
          style={s.addHeaderBtn}
          onPress={() => { setEditingConn(null); setFormVisible(true); }}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={20} color="#2563EB" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad }}
        showsVerticalScrollIndicator={false}
      >
        {/* Active connection card */}
        <FadeIn delay={0}>
          <LinearGradient
            colors={activeColors}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.activeCard}
          >
            <View style={s.activeCardDeco1} />
            <View style={s.activeCardDeco2} />
            <View style={s.activeCardRow}>
              <View style={s.activeDbIcon}>
                <Feather name={activeIsPg ? 'database' : 'cloud'} size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.activeLabel}>Active Database</Text>
                <Text style={s.activeName} numberOfLines={1}>{activeInfo.name}</Text>
                {activeInfo.dbType && (
                  <Text style={s.activeType}>{activeInfo.dbType === 'postgresql' ? 'PostgreSQL' : 'Firebase Firestore'}</Text>
                )}
              </View>
              <StatusPill connected={activeInfo.connected} />
            </View>
            {!activeInfo.connected && (
              <View style={s.noDbBanner}>
                <Feather name="alert-circle" size={13} color="#FCD34D" />
                <Text style={s.noDbTxt}>No database connected. Add one below.</Text>
              </View>
            )}
          </LinearGradient>
        </FadeIn>

        {/* Section header */}
        <FadeIn delay={80}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Saved Connections</Text>
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => { setEditingConn(null); setFormVisible(true); }}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={14} color="#fff" />
              <Text style={s.addBtnTxt}>Add New</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>

        {/* Connection list */}
        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={s.loadingTxt}>Loading connections…</Text>
          </View>
        ) : connections.length === 0 ? (
          <FadeIn delay={120}>
            <View style={s.emptyCard}>
              <View style={s.emptyIcon}>
                <Feather name="database" size={32} color="#CBD5E1" />
              </View>
              <Text style={s.emptyTitle}>No connections saved</Text>
              <Text style={s.emptySub}>Add a PostgreSQL or Firebase connection to get started.</Text>
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => { setEditingConn(null); setFormVisible(true); }}
                activeOpacity={0.85}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={s.emptyBtnTxt}>Add Connection</Text>
              </TouchableOpacity>
            </View>
          </FadeIn>
        ) : (
          connections.map((conn, i) => (
            <FadeIn key={conn.id} delay={100 + i * 60}>
              <ConnectionCard
                conn={conn}
                testResult={testResults[conn.id]}
                testing={testingId === conn.id}
                activating={activatingId === conn.id}
                onTest={() => handleTest(conn)}
                onActivate={() => handleActivate(conn)}
                onEdit={() => { setEditingConn(conn); setFormVisible(true); }}
                onDelete={() => handleDelete(conn)}
              />
            </FadeIn>
          ))
        )}

        {/* Info card */}
        {connections.length > 0 && (
          <FadeIn delay={300}>
            <View style={s.infoCard}>
              <Feather name="info" size={15} color="#2563EB" style={{ marginTop: 1 }} />
              <Text style={s.infoTxt}>
                All credentials are encrypted at rest (AES-256).
                Activating a connection automatically creates required tables/collections if they don't exist.
                No server restart needed.
              </Text>
            </View>
          </FadeIn>
        )}
      </ScrollView>

      {/* Form modal */}
      <ConnectionFormModal
        visible={formVisible}
        initial={editingConn ?? undefined}
        onClose={() => { setFormVisible(false); setEditingConn(null); }}
        onSave={handleSave}
      />

      {/* Delete confirmation modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={s.delOverlay}>
          <View style={s.delCard}>
            <View style={s.delIconWrap}>
              <Feather name="trash-2" size={28} color="#EF4444" />
            </View>
            <Text style={s.delTitle}>Delete Connection</Text>
            <Text style={s.delMsg}>
              Remove <Text style={{ fontWeight: '700' }}>"{deleteTarget?.name}"</Text>?{'\n'}This cannot be undone.
            </Text>
            <View style={s.delBtnRow}>
              <TouchableOpacity
                style={s.delCancelBtn}
                onPress={() => setDeleteTarget(null)}
                activeOpacity={0.8}
                disabled={deleting}
              >
                <Text style={s.delCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.delConfirmBtn}
                onPress={confirmDelete}
                activeOpacity={0.8}
                disabled={deleting}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Feather name="trash-2" size={15} color="#fff" /><Text style={s.delConfirmTxt}>Delete</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingBottom: 20,
    shadowColor: '#1D4ED8', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  addHeaderBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1D4ED8', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  activeCard: {
    borderRadius: 20, padding: 20, marginBottom: 20,
    overflow: 'hidden', position: 'relative',
    shadowColor: '#1D4ED8', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  activeCardDeco1: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40,
  },
  activeCardDeco2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -30, left: 20,
  },
  activeCardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  activeDbIcon: {
    width: 50, height: 50, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  activeLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 2 },
  activeName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  activeType: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '500' },
  noDbBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginTop: 12,
  },
  noDbTxt: { fontSize: 12, color: '#FCD34D', fontWeight: '600' },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1E293B', letterSpacing: -0.3 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#2563EB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  loadingWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingTxt: { color: '#94A3B8', fontSize: 14 },
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#F1F5F9', borderStyle: 'dashed',
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 22, backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#2563EB', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12,
  },
  emptyBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  infoCard: {
    flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF',
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#BFDBFE',
  },
  infoTxt: { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },
  // Delete confirmation modal
  delOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  delCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 28,
    width: '100%', maxWidth: 360, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 16,
  },
  delIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  delTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
  delMsg: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  delBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  delCancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 14,
  },
  delCancelTxt: { fontSize: 15, fontWeight: '700', color: '#64748B' },
  delConfirmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 14,
  },
  delConfirmTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
