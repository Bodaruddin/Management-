import React from 'react';
import {
  Platform, Pressable, StyleSheet, Text, useColorScheme, View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs, useRouter } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Visible tab definitions ───────────────────────────────────────────────────
const TABS = [
  { name: 'index',    label: 'Dashboard', icon: 'home'      },
  { name: 'students', label: 'Students',  icon: 'users'     },
  { name: 'teachers', label: 'Teachers',  icon: 'user-check'},
  { name: 'finance',  label: 'Finance',   icon: 'finance'   }, // special: ₹
  { name: 'exams',    label: 'Exams',     icon: 'book-open' },
  { name: 'alumni',   label: 'Alumni',    icon: 'award'     },
] as const;

// ─── Custom tab bar ─────────────────────────────────────────────────────────────
function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';

  // Map route name → TABS index for the visible routes only
  const visibleRoutes = state.routes.filter((r: any) =>
    TABS.some(t => t.name === r.name)
  );

  const bottomPad = isIOS ? insets.bottom : Math.max(insets.bottom, 4);

  return (
    <View style={[tb.container, { paddingBottom: bottomPad }]}>
      {/* Blur / solid background */}
      {isIOS ? (
        <BlurView
          intensity={90}
          tint={isDark ? 'dark' : 'extraLight'}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, tb.solidBg]} />
      )}

      {/* Tab row — each item is flex:1 so they share width perfectly */}
      <View style={tb.row}>
        {TABS.map((tab) => {
          const route = visibleRoutes.find((r: any) => r.name === tab.name);
          if (!route) return null;

          const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
          const focused = state.index === routeIndex;
          const tint = focused ? colors.primary : '#94A3B8';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={tab.name}
              onPress={onPress}
              style={tb.item}
              android_ripple={{ color: colors.primary + '22', borderless: true }}
            >
              {/* Pill highlight behind icon */}
              <View style={[
                tb.iconWrap,
                focused && { backgroundColor: colors.primary + '18' },
              ]}>
                {tab.icon === 'finance' ? (
                  <Text style={[tb.rupee, { color: tint }]}>₹</Text>
                ) : (
                  <Feather
                    name={tab.icon as React.ComponentProps<typeof Feather>['name']}
                    size={20}
                    color={tint}
                  />
                )}
              </View>
              <Text
                style={[tb.label, { color: tint }]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const tb = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    // Shadow
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 12,
  },
  solidBg: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  row: {
    flexDirection: 'row',
    height: 56,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 6,
  },
  iconWrap: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 12,
    includeFontPadding: false,
  },
  rupee: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    includeFontPadding: false,
  },
});

// ─── iOS Liquid Glass layout (native tabs — no custom bar needed) ───────────────
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Dashboard</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="students">
        <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
        <Label>Students</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="teachers">
        <Icon sf={{ default: 'person.badge.key', selected: 'person.badge.key.fill' }} />
        <Label>Teachers</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="finance">
        <Icon sf={{ default: 'dollarsign.circle', selected: 'dollarsign.circle.fill' }} />
        <Label>Finance</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="exams">
        <Icon sf={{ default: 'book.closed', selected: 'book.closed.fill' }} />
        <Label>Exams</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="alumni">
        <Icon sf={{ default: 'person.crop.circle.badge.checkmark', selected: 'person.crop.circle.badge.checkmark' }} />
        <Label>Alumni</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// ─── Classic layout (Android / Web) ────────────────────────────────────────────
function ClassicTabLayout() {
  const colors = useColors();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#94A3B8',
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.primary,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800', fontSize: 17, letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Dashboard', headerShown: false }} />
      <Tabs.Screen name="students" options={{ title: 'Students' }} />
      <Tabs.Screen name="teachers" options={{ title: 'Teachers' }} />
      <Tabs.Screen name="finance"  options={{ title: 'Finance'  }} />
      <Tabs.Screen name="exams"    options={{ title: 'Exams'    }} />
      <Tabs.Screen name="alumni"   options={{ title: 'Alumni'   }} />
      <Tabs.Screen name="attendance"         options={{ title: 'Attendance',           tabBarButton: () => null }} />
      <Tabs.Screen name="promote"            options={{ title: 'Promote',              tabBarButton: () => null }} />
      <Tabs.Screen name="admitcard"          options={{ title: 'Admit Cards',          headerShown: false, tabBarButton: () => null }} />
      <Tabs.Screen name="marksheet"          options={{ title: 'Marksheet',            headerShown: false, tabBarButton: () => null }} />
      <Tabs.Screen name="inactive-management" options={{ title: 'Inactive Management',   headerShown: false, tabBarButton: () => null }} />
      <Tabs.Screen name="idcard"             options={{ title: 'ID Card Generator',    headerShown: false, tabBarButton: () => null }} />
    </Tabs>
  );
}

// ─── Entry point ────────────────────────────────────────────────────────────────
export default function TabLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
