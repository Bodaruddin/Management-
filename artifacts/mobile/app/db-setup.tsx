import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useDbSetup, DbProvider, PendingDbConfig } from '@/context/DbSetupContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  offline?: boolean; // true = API unreachable, not a credential failure
}

// ─── API helpers ──────────────────────────────────────────────────────────────
function getApiBase(): string {
  if (Platform.OS === 'web') return '';
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : '';
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(body?.error ?? `Request failed: ${res.status}`),
      { status: res.status },
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function isOfflineError(e: any): boolean {
  const msg: string = e?.message ?? '';
  const status: number = e?.status ?? 0;
  return (
    status === 502 || status === 503 || status === 504 ||
    msg.includes('Failed to fetch') ||
    msg.includes('Network request failed') ||
    msg.includes('ERR_CONNECTION_REFUSED') ||
    msg.includes('ERR_FAILED')
  );
}

// ─── Animation helper ─────────────────────────────────────────────────────────
function FadeSlide({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 260, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: visible ? 0 : 10, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Provider definitions ─────────────────────────────────────────────────────
const PROVIDERS: {
  id: DbProvider;
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  description: string;
}[] = [
  {
    id: 'supabase',
    label: 'Supabase',
    icon: 'layers',
    color: '#10B981',
    bg: '#ECFDF5',
    border: '#6EE7B7',
    description: 'Open-source Firebase alternative with PostgreSQL',
  },
  {
    id: 'firebase',
    label: 'Firebase',
    icon: 'cloud',
    color: '#F59E0B',
    bg: '#FFFBEB',
    border: '#FCD34D',
    description: 'Google Firebase with Firestore database',
  },
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    icon: 'database',
    color: '#2563EB',
    bg: '#EFF6FF',
    border: '#93C5FD',
    description: 'Direct PostgreSQL database connection',
  },
  {
    id: 'custom',
    label: 'Custom',
    icon: 'settings',
    color: '#7C3AED',
    bg: '#F5F3FF',
    border: '#C4B5FD',
    description: 'Any PostgreSQL-compatible connection string',
  },
];

// ─── Field component ──────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, secure, multiline, hint, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; secure?: boolean; multiline?: boolean; hint?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={fm.fieldWrap}>
      <Text style={fm.label}>
        {label}
        {required && <Text style={{ color: '#EF4444' }}> *</Text>}
      </Text>
      <View style={[fm.inputWrap, multiline && { alignItems: 'flex-start', minHeight: 90 }]}>
        <TextInput
          style={[fm.input, multiline && { textAlignVertical: 'top', minHeight: 80, paddingTop: 10 }]}
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
          <TouchableOpacity onPress={() => setShow(!show)} style={{ padding: 6 }}>
            <Feather name={show ? 'eye-off' : 'eye'} size={15} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>
      {hint ? <Text style={fm.hint}>{hint}</Text> : null}
    </View>
  );
}

const fm = StyleSheet.create({
  fieldWrap: { marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 14 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0',
    paddingHorizontal: 14, paddingVertical: 2,
  },
  input: { flex: 1, fontSize: 13, color: '#1E293B', paddingVertical: 11 },
  hint: { fontSize: 11, color: '#94A3B8', marginTop: 5, lineHeight: 16 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function DbSetupScreen() {
  const insets = useSafeAreaInsets();
  const { isSetupComplete, markSetupComplete, saveLocalConfig, clearLocalConfig } = useDbSetup();

  useEffect(() => {
    if (isSetupComplete === true) router.replace('/login');
  }, [isSetupComplete]);

  const [selectedProvider, setSelectedProvider] = useState<DbProvider | null>(null);

  // PostgreSQL / Supabase / Custom
  const [connUrl, setConnUrl] = useState('');
  const [connName, setConnName] = useState('');

  // Firebase
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbAuthDomain, setFbAuthDomain] = useState('');
  const [fbStorageBucket, setFbStorageBucket] = useState('');
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState('');
  const [fbAppId, setFbAppId] = useState('');
  const [fbServiceAccountJson, setFbServiceAccountJson] = useState('');

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTestResult(null);
    setError(null);
    if (selectedProvider) {
      setConnName(`${PROVIDERS.find((p) => p.id === selectedProvider)?.label ?? ''} Database`);
      setConnUrl('');
    }
  }, [selectedProvider]);

  const isFirebase = selectedProvider === 'firebase';

  const validate = (): string | null => {
    if (!selectedProvider) return 'Please choose a database provider.';
    if (!connName.trim()) return 'Connection name is required.';
    if (!isFirebase) {
      if (!connUrl.trim()) return 'Connection URL is required.';
    } else {
      if (!fbProjectId.trim()) return 'Firebase Project ID is required.';
      if (!fbServiceAccountJson.trim()) return 'Service Account JSON is required.';
    }
    return null;
  };

  const buildLocalConfig = (): PendingDbConfig => {
    const base = { provider: selectedProvider!, name: connName.trim() };
    if (!isFirebase) return { ...base, url: connUrl.trim() };
    return {
      ...base,
      projectId: fbProjectId.trim(),
      apiKey: fbApiKey.trim(),
      authDomain: fbAuthDomain.trim(),
      storageBucket: fbStorageBucket.trim(),
      messagingSenderId: fbMessagingSenderId.trim(),
      appId: fbAppId.trim(),
      serviceAccountJson: fbServiceAccountJson.trim(),
    };
  };

  const buildApiBody = (name: string) => {
    const dbType = isFirebase ? 'firebase' : 'postgresql';
    if (!isFirebase) return { name, dbType, url: connUrl.trim() };
    return {
      name, dbType,
      projectId: fbProjectId.trim(),
      apiKey: fbApiKey.trim(),
      authDomain: fbAuthDomain.trim(),
      storageBucket: fbStorageBucket.trim(),
      messagingSenderId: fbMessagingSenderId.trim(),
      appId: fbAppId.trim(),
      serviceAccountJson: fbServiceAccountJson.trim(),
    };
  };

  // ── Test ──────────────────────────────────────────────────────────────────
  const handleTest = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setTesting(true);
    setTestResult(null);
    try {
      const tempName = `__setup_test_${Date.now()}`;
      const created = await apiFetch<{ id: string }>('/db-connections', {
        method: 'POST',
        body: JSON.stringify(buildApiBody(tempName)),
      });
      const result = await apiFetch<TestResult>(`/db-connections/${created.id}/test`, { method: 'POST' });
      await apiFetch(`/db-connections/${created.id}`, { method: 'DELETE' }).catch(() => {});
      setTestResult(result);
    } catch (e: any) {
      if (isOfflineError(e)) {
        setTestResult({
          success: false,
          offline: true,
          message:
            'The API server is not reachable right now. Your credentials will be saved locally and the connection will be verified automatically when the server comes online.',
        });
      } else {
        setTestResult({ success: false, message: e.message ?? 'Connection test failed.' });
      }
    } finally {
      setTesting(false);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);
    try {
      // 1. Always save locally first — works even when API is offline
      const cfg = buildLocalConfig();
      await saveLocalConfig(cfg);

      // 2. Try to register + activate on the API (best-effort)
      let syncedToApi = false;
      try {
        const created = await apiFetch<{ id: string }>('/db-connections', {
          method: 'POST',
          body: JSON.stringify(buildApiBody(connName.trim())),
        });
        const result = await apiFetch<TestResult>(`/db-connections/${created.id}/test`, { method: 'POST' });
        if (result.success) {
          await apiFetch(`/db-connections/${created.id}/activate`, { method: 'POST' });
          await clearLocalConfig(); // synced — no need to retry later
          syncedToApi = true;
        } else {
          // Bad credentials — delete the entry, keep local config, show error
          await apiFetch(`/db-connections/${created.id}`, { method: 'DELETE' }).catch(() => {});
          setTestResult(result);
          setError('Connection test failed. Check your credentials and try again.');
          return; // don't mark complete — let user fix it
        }
      } catch (apiErr: any) {
        if (!isOfflineError(apiErr)) {
          // Real credential / server error — show it
          setError(apiErr.message ?? 'Failed to save connection. Please check your credentials.');
          return;
        }
        // API offline — continue anyway; AppContext will sync on next startup
        syncedToApi = false;
      }

      // 3. Mark setup done and proceed to login
      await markSetupComplete();
      if (!syncedToApi) {
        // Show a brief message before navigating (handled via the saving state copy below)
      }
      router.replace('/login');
    } catch (e: any) {
      setError(e.message ?? 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const topPad = Platform.OS === 'web' ? 20 : insets.top;
  const botPad = Platform.OS === 'web' ? 40 : insets.bottom + 24;
  const activeProv = PROVIDERS.find((p) => p.id === selectedProvider);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.root}>
        {/* ── Gradient header ── */}
        <LinearGradient
          colors={['#0F2460', '#1E40AF', '#2563EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.header, { paddingTop: topPad + 24 }]}
        >
          <View style={s.deco1} />
          <View style={s.deco2} />
          <View style={s.headerIconWrap}>
            <Feather name="database" size={28} color="#fff" />
          </View>
          <Text style={s.headerTitle}>Database Setup</Text>
          <Text style={s.headerSub}>
            Connect a database to get started.{'\n'}This is a one-time setup for the admin.
          </Text>
        </LinearGradient>

        {/* ── Body ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.body, { paddingBottom: botPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 1 — Provider */}
          <View style={s.stepRow}>
            <View style={s.stepBadge}><Text style={s.stepNum}>1</Text></View>
            <Text style={s.stepLabel}>Choose a database provider</Text>
          </View>

          <View style={s.providerGrid}>
            {PROVIDERS.map((p) => {
              const active = selectedProvider === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[s.providerCard, active && { borderColor: p.border, backgroundColor: p.bg }]}
                  onPress={() => setSelectedProvider(p.id)}
                  activeOpacity={0.8}
                >
                  <View style={[s.providerIcon, active && { backgroundColor: p.color }]}>
                    <Feather name={p.icon as any} size={18} color={active ? '#fff' : '#94A3B8'} />
                  </View>
                  <Text style={[s.providerLabel, active && { color: p.color }]}>{p.label}</Text>
                  <Text style={s.providerDesc} numberOfLines={2}>{p.description}</Text>
                  {active && (
                    <View style={[s.providerCheck, { backgroundColor: p.color }]}>
                      <Feather name="check" size={10} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Step 2 — Credentials */}
          <FadeSlide visible={selectedProvider !== null}>
            {selectedProvider !== null && (
              <>
                <View style={[s.stepRow, { marginTop: 24 }]}>
                  <View style={s.stepBadge}><Text style={s.stepNum}>2</Text></View>
                  <Text style={s.stepLabel}>Enter connection details</Text>
                </View>

                <View style={s.formCard}>
                  <Field
                    label="Connection Name"
                    value={connName}
                    onChange={setConnName}
                    placeholder="e.g. School Database"
                    required
                  />

                  {selectedProvider === 'supabase' && (
                    <Field
                      label="Database URL"
                      value={connUrl}
                      onChange={setConnUrl}
                      placeholder="postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres"
                      secure
                      required
                      hint="Supabase Dashboard → Project Settings → Database → Connection string (URI mode)"
                    />
                  )}

                  {(selectedProvider === 'postgresql' || selectedProvider === 'custom') && (
                    <Field
                      label="Connection URL"
                      value={connUrl}
                      onChange={setConnUrl}
                      placeholder="postgresql://user:password@host:5432/dbname"
                      secure
                      required
                      hint="Format: postgresql://username:password@host:port/database"
                    />
                  )}

                  {selectedProvider === 'firebase' && (
                    <>
                      <Field label="Project ID" value={fbProjectId} onChange={setFbProjectId} placeholder="your-project-id" required />
                      <Field label="API Key" value={fbApiKey} onChange={setFbApiKey} placeholder="AIza..." secure required />
                      <Field label="Auth Domain" value={fbAuthDomain} onChange={setFbAuthDomain} placeholder="your-project.firebaseapp.com" />
                      <Field label="Storage Bucket" value={fbStorageBucket} onChange={setFbStorageBucket} placeholder="your-project.appspot.com" />
                      <Field label="Messaging Sender ID" value={fbMessagingSenderId} onChange={setFbMessagingSenderId} placeholder="123456789" />
                      <Field label="App ID" value={fbAppId} onChange={setFbAppId} placeholder="1:123:web:abc" />
                      <Field
                        label="Service Account JSON"
                        value={fbServiceAccountJson}
                        onChange={setFbServiceAccountJson}
                        placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                        multiline
                        required
                        hint="Firebase Console → Project Settings → Service Accounts → Generate new private key"
                      />
                    </>
                  )}
                </View>

                {/* Validation error */}
                {error && (
                  <View style={s.errorBanner}>
                    <Feather name="alert-circle" size={14} color="#DC2626" />
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                )}

                {/* Test result */}
                {testResult && (
                  <View style={[
                    s.resultBanner,
                    testResult.offline
                      ? { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1 }
                      : { backgroundColor: testResult.success ? '#ECFDF5' : '#FEF2F2' },
                  ]}>
                    <Feather
                      name={testResult.offline ? 'wifi-off' : testResult.success ? 'check-circle' : 'x-circle'}
                      size={16}
                      color={testResult.offline ? '#D97706' : testResult.success ? '#10B981' : '#EF4444'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[
                        s.resultText,
                        { color: testResult.offline ? '#92400E' : testResult.success ? '#065F46' : '#991B1B' },
                      ]}>
                        {testResult.offline ? 'API server offline' : testResult.success ? 'Connection successful' : 'Connection failed'}
                      </Text>
                      <Text style={[
                        s.resultSub,
                        { color: testResult.offline ? '#B45309' : testResult.success ? '#10B981' : '#EF4444' },
                      ]}>
                        {testResult.message}
                        {testResult.latencyMs != null ? `  ·  ${testResult.latencyMs}ms` : ''}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Offline save note — shown when API was unreachable on last test */}
                {testResult?.offline && (
                  <View style={s.offlineNote}>
                    <Feather name="info" size={13} color="#2563EB" />
                    <Text style={s.offlineNoteText}>
                      You can still save and continue. Your credentials are stored securely on this device and will be verified automatically when the API server comes online.
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <TouchableOpacity
                  style={s.testBtn}
                  onPress={handleTest}
                  disabled={testing || saving}
                  activeOpacity={0.85}
                >
                  {testing
                    ? <ActivityIndicator size={15} color="#7C3AED" />
                    : <Feather name="zap" size={15} color="#7C3AED" />}
                  <Text style={s.testBtnText}>
                    {testing ? 'Testing…' : 'Test Connection'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.saveBtn, (saving || testing) && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={saving || testing}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={activeProv ? [activeProv.color, activeProv.color] : ['#1D4ED8', '#3B82F6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.saveBtnGradient}
                  >
                    {saving
                      ? <ActivityIndicator size={16} color="#fff" />
                      : <Feather name="arrow-right-circle" size={18} color="#fff" />}
                    <Text style={s.saveBtnText}>
                      {saving ? 'Saving…' : 'Save & Get Started'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </FadeSlide>

          <View style={s.infoNote}>
            <Feather name="info" size={13} color="#94A3B8" />
            <Text style={s.infoNoteText}>
              This screen appears only once. You can update your database connection anytime from the admin dashboard.
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F4FF' },

  header: { paddingHorizontal: 24, paddingBottom: 36, alignItems: 'center', overflow: 'hidden' },
  deco1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -60,
  },
  deco2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: -30, left: -30,
  },
  headerIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 8, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 20 },

  body: { padding: 20 },

  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepLabel: { fontSize: 14, fontWeight: '700', color: '#1E293B' },

  providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  providerCard: {
    width: '47.5%', backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, position: 'relative',
  },
  providerIcon: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  providerLabel: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
  providerDesc: { fontSize: 11, color: '#64748B', lineHeight: 15 },
  providerCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  formCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 2, marginBottom: 12,
  },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 13,
    borderWidth: 1, borderColor: '#FECACA', marginBottom: 10,
  },
  errorText: { flex: 1, fontSize: 13, color: '#DC2626', fontWeight: '600', lineHeight: 18 },

  resultBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  resultText: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  resultSub: { fontSize: 12, fontWeight: '500', lineHeight: 17 },

  offlineNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 12,
  },
  offlineNoteText: { flex: 1, fontSize: 12, color: '#1D4ED8', lineHeight: 17, fontWeight: '500' },

  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F5F3FF', borderRadius: 14, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#DDD6FE', marginBottom: 10,
  },
  testBtnText: { fontSize: 14, fontWeight: '700', color: '#7C3AED' },

  saveBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
  saveBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },

  infoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(148,163,184,0.12)', borderRadius: 12, padding: 12,
  },
  infoNoteText: { flex: 1, fontSize: 11, color: '#94A3B8', lineHeight: 16 },
});
