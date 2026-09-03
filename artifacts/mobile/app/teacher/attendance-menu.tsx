import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';

type AttendanceOption = {
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  route: '/teacher/attendance' | '/teacher/my-attendance';
};

export default function AttendanceMenu() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom + 24;

  const options: AttendanceOption[] = [
    {
      title: 'Students Attendance',
      description: 'Mark student attendance and view attendance reports.',
      icon: 'users',
      color: colors.success,
      route: '/teacher/attendance',
    },
    {
      title: 'Teacher Attendance',
      description: 'Check in, check out, view history, and manage leave.',
      icon: 'user-check',
      color: colors.primary,
      route: '/teacher/my-attendance',
    },
  ];

  const openAttendance = (route: AttendanceOption['route']) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    router.push(route);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace('/teacher')}
          accessibilityLabel="Back to teacher dashboard"
        >
          <Feather name="arrow-left" size={22} color={colors.cardForeground} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.cardForeground }]}>Attendance</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Choose an attendance section</Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.secondary }]}>
          <Feather name="check-square" size={19} color={colors.primary} />
        </View>
      </View>

      <View style={[styles.content, { paddingBottom: bottomPad }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Attendance sections</Text>
        <Text style={[styles.sectionCopy, { color: colors.mutedForeground }]}>
          Select what you want to manage.
        </Text>

        <View style={styles.options}>
          {options.map(option => (
            <TouchableOpacity
              key={option.title}
              style={[styles.option, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => openAttendance(option.route)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={option.title}
            >
              <View style={[styles.optionIcon, { backgroundColor: option.color }]}>
                <Feather name={option.icon} size={24} color={colors.primaryForeground} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>{option.title}</Text>
                <Text style={[styles.optionDescription, { color: colors.mutedForeground }]}>
                  {option.description}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backButton: { width: 36, height: 36, justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 19, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  headerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, flex: 1 },
  sectionTitle: { fontSize: 22, fontWeight: '800', marginTop: 8 },
  sectionCopy: { fontSize: 14, marginTop: 6 },
  options: { gap: 12, marginTop: 24 },
  option: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  optionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, gap: 4 },
  optionTitle: { fontSize: 16, fontWeight: '800' },
  optionDescription: { fontSize: 12, lineHeight: 17 },
});