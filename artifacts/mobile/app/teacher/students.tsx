import React from 'react';
import { Redirect, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import StudentsScreen from '../(tabs)/students';

/** Teacher-facing student management, guarded by the same permission as the dashboard tile. */
export default function TeacherStudentsScreen() {
  const colors = useColors();
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user || user.role !== 'teacher') return <Redirect href="/login" />;

  if (!user.permissions?.addStudent) {
    return (
      <View style={[styles.denied, { backgroundColor: colors.background }]}>
        <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
          <Feather name="lock" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Student access is restricted</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Ask your administrator for the Add Student permission.</Text>
        <TouchableOpacity style={[styles.backButton, { borderColor: colors.border }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={16} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back to dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} accessibilityLabel="Back to teacher dashboard">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Student Management</Text>
        <View style={styles.headerButton} />
      </View>
      <View style={styles.content}>
        <StudentsScreen teacherMode />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderBottomWidth: 1 },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  icon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 21, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300, marginBottom: 24 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  backText: { fontSize: 14, fontWeight: '700' },
});
