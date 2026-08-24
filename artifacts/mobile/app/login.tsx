import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import SystemNotReadyModal from '@/components/SystemNotReadyModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useDbSetup } from '@/context/DbSetupContext';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoading, login } = useAuth();
  const { isSetupComplete } = useDbSetup();
  const [role, setRole] = useState<'admin' | 'teacher'>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNotReadyModal, setShowNotReadyModal] = useState(false);

  // If a user is already signed in, send them to the right place.
  // Admins go to db-setup first if the database hasn't been configured yet.
  useEffect(() => {
    if (isLoading || !user || isSetupComplete === null) return;
    if (user.role === 'admin') {
      router.replace(isSetupComplete ? '/(tabs)' : '/db-setup');
    } else {
      if (isSetupComplete) router.replace('/teacher');
      // If setup not done and a teacher session is somehow persisted, stay on login
    }
  }, [isLoading, user, isSetupComplete]);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter username and password');
      return;
    }
    setLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await login(username.trim(), password, role);
    setLoading(false);
    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (role === 'admin') {
        router.replace(isSetupComplete ? '/(tabs)' : '/db-setup');
      } else {
        router.replace('/teacher');
      }
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (role === 'teacher' && result.error === 'DATABASE_NOT_READY') {
        setShowNotReadyModal(true);
      } else {
        Alert.alert('Login Failed', result.error ?? 'Invalid credentials');
      }
    }
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <SystemNotReadyModal
        visible={showNotReadyModal}
        onDismiss={() => setShowNotReadyModal(false)}
      />
      {/* Header */}
      <View style={s.header}>
        <Image
          source={require('../assets/images/school-logo.png')}
          style={s.logoImg}
          resizeMode="contain"
        />
        <Text style={s.appName}>DR. APJ ABDUL KALAM{'\n'}JATIYA VIDYALAYA</Text>
        <Text style={s.appSub}>School Management System</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.formWrap} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.welcomeText}>Welcome Back</Text>
            <Text style={s.subText}>Sign in to continue</Text>

            {/* Role Toggle */}
            <View style={s.roleRow}>
              {(['admin', 'teacher'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[s.roleBtn, role === r && s.roleBtnActive]}
                  onPress={() => { setRole(r); setUsername(''); setPassword(''); }}
                  activeOpacity={0.8}
                >
                  <Feather
                    name={r === 'admin' ? 'shield' : 'user'}
                    size={16}
                    color={role === r ? '#fff' : colors.mutedForeground}
                  />
                  <Text style={[s.roleBtnText, role === r && s.roleBtnTextActive]}>
                    {r === 'admin' ? 'Admin' : 'Teacher'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Username */}
            <View style={s.inputGroup}>
              <Text style={s.label}>Username</Text>
              <View style={s.inputWrap}>
                <Feather name="user" size={18} color={colors.mutedForeground} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder={role === 'admin' ? 'admin' : 'Enter username'}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password */}
            <View style={s.inputGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <Feather name="lock" size={18} color={colors.mutedForeground} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={s.eyeBtn}>
                  <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Login Button */}
            <TouchableOpacity style={s.loginBtn} onPress={handleLogin} activeOpacity={0.85} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={s.loginBtnText}>Sign In</Text>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={{ height: insets.bottom + 16 }} />
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.primary },
  header: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24 },
  logoImg: { width: 110, height: 110, marginBottom: 12 },
  appName: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center', lineHeight: 26 },
  appSub: { fontSize: 13, color: 'rgba(255,255,255,0.80)', marginTop: 4, fontWeight: '500' },
  formWrap: { paddingHorizontal: 20, paddingBottom: 24 },
  card: { backgroundColor: c.card, borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  welcomeText: { fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 4 },
  subText: { fontSize: 14, color: c.mutedForeground, marginBottom: 24 },
  roleRow: { flexDirection: 'row', backgroundColor: c.muted, borderRadius: 12, padding: 4, marginBottom: 24 },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  roleBtnActive: { backgroundColor: c.primary },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: c.mutedForeground },
  roleBtnTextActive: { color: '#fff' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.muted, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  inputIcon: { paddingLeft: 14 },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 14, fontSize: 15, color: c.text },
  eyeBtn: { paddingRight: 14 },
  loginBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 16, marginTop: 8, marginBottom: 12 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  changeDbBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 8 },
  changeDbText: { fontSize: 13, color: c.mutedForeground, fontWeight: '600' },
  demoBox: { backgroundColor: c.secondary, borderRadius: 10, padding: 12 },
  demoTitle: { fontSize: 12, fontWeight: '700', color: c.primary, marginBottom: 4 },
  demoText: { fontSize: 12, color: c.primary, lineHeight: 18 },
});
