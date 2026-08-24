import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform, Linking, Modal, Animated, Dimensions, TextInput, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect as SvgRect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { useApp, Student, alumniToStudent, isActiveStudent } from '@/context/AppContext';
import { SCHOOL_INFO } from '@/constants/schoolInfo';
import { daysUntilBirthday, isBirthdayToday, extractMMDD } from '@/utils/dateUtils';
import { sendBirthdayCardWhatsApp, sendReminderWhatsApp } from '@/utils/reminder';

// ─── DB status hook ───────────────────────────────────────────────────────────
function useDbStatus() {
  const [dbInfo, setDbInfo] = useState<{ name: string; connected: boolean; apiReachable: boolean }>({
    name: 'Database Settings',
    connected: false,
    apiReachable: false,
  });
  const getApiBase = () => {
    if (Platform.OS === 'web') return '';
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    return domain ? `https://${domain}` : '';
  };
  const refresh = () => {
    fetch(`${getApiBase()}/api/db-connections/active`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setDbInfo({ name: d.name, connected: d.connected, apiReachable: true });
        } else {
          setDbInfo({ name: 'Configure Database', connected: false, apiReachable: true });
        }
      })
      .catch(() => {
        setDbInfo({ name: 'Database Settings', connected: false, apiReachable: false });
      });
  };
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);
  return dbInfo;
}

const { width: SW } = Dimensions.get('window');
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY     = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ─── Age from date of birth ───────────────────────────────────────────────────
function calcAge(dob: string): number {
  if (!dob) return 0;
  let b: Date;
  // Handle DD-MM-YYYY or DD/MM/YYYY (user-facing format)
  const ddmmyyyy = dob.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ddmmyyyy) {
    b = new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
  } else {
    b = new Date(dob); // fallback: YYYY-MM-DD (legacy stored data)
  }
  if (isNaN(b.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return Math.max(0, age);
}

// ─── Birthday confetti scatter ────────────────────────────────────────────────
function BdayConfetti() {
  const pieces = [
    { x: 2,  y: 15, w: 9,  h: 4,  fill: '#FFB3C6', r: 25  },
    { x: 16, y: 4,  w: 5,  h: 10, fill: '#93C5FD', r: -15 },
    { x: 30, y: 14, w: 10, h: 4,  fill: '#FDE68A', r: 45  },
    { x: 45, y: 2,  w: 5,  h: 10, fill: '#A7F3D0', r: -30 },
    { x: 57, y: 13, w: 8,  h: 3,  fill: '#DDD6FE', r: 15  },
    { x: 68, y: 0,  w: 6,  h: 5,  fill: '#BAE6FD', r: -20 },
    { x: 77, y: 13, w: 5,  h: 9,  fill: '#FED7AA', r: 35  },
  ];
  return (
    <Svg width={88} height={30} style={{ position: 'absolute', top: 8, right: 8 }}>
      {pieces.map((p, i) => (
        <SvgRect
          key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={2}
          fill={p.fill}
          transform={`rotate(${p.r} ${p.x + p.w / 2} ${p.y + p.h / 2})`}
        />
      ))}
    </Svg>
  );
}

// ─── Animated section wrapper ─────────────────────────────────────────────────
function FadeSlide({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,     { toValue: 1, duration: 450, delay, useNativeDriver: true }),
      Animated.timing(translateY,  { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

// ─── App Header ───────────────────────────────────────────────────────────────
function AppHeader({ onAvatarPress, userName }: { onAvatarPress: () => void; userName: string }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 0 : insets.top;
  return (
    <View style={[ah.wrap, { paddingTop: topPad + 10 }]}>
      <View style={ah.inner}>
        {/* Left: logo + title */}
        <View style={ah.left}>
          <Image
            source={require('../../assets/images/school-logo.png')}
            style={ah.logoImg}
            resizeMode="contain"
          />
          <Text style={ah.title} numberOfLines={2}>DR. APJ ABDUL KALAM{'\n'}JATIYA VIDYALAYA</Text>
        </View>
        {/* Right: bell + avatar */}
        <View style={ah.right}>
          <TouchableOpacity style={ah.iconBtn} activeOpacity={0.7}>
            <Feather name="bell" size={20} color="#64748B" />
            <View style={ah.notifDot} />
          </TouchableOpacity>
          <TouchableOpacity style={ah.avatarBtn} onPress={onAvatarPress} activeOpacity={0.75}>
            <Text style={ah.avatarTxt}>{(userName ?? 'A').charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
const ah = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 10,
    shadowColor: '#0C1F4A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoImg: { width: 40, height: 40 },
  title: { fontSize: 11, fontWeight: '800', color: '#0C1F4A', letterSpacing: -0.1, flexShrink: 1, lineHeight: 15 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: {
    position: 'absolute', width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#C8A040', top: 7, right: 7,
    borderWidth: 1.5, borderColor: '#fff',
  },
  avatarBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#C8A040',
  },
  avatarTxt: { fontSize: 15, fontWeight: '800', color: '#1E3A8A' },
});

// ─── Hero Card ────────────────────────────────────────────────────────────────
function HeroCard({
  greeting, userName, dateLabel, schoolName,
}: { greeting: string; userName: string; dateLabel: string; schoolName: string }) {
  return (
    <LinearGradient
      colors={['#0F2456', '#1E3A8A', '#2563EB']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={hc.card}
    >
      {/* Decorative waves */}
      <View style={hc.wave1} />
      <View style={hc.wave2} />

      {/* Building illustration (right side) */}
      <View style={hc.building} pointerEvents="none">
        {/* Flag */}
        <View style={hc.flagpole} />
        <View style={hc.flag} />
        {/* Clock */}
        <View style={hc.clockRing}>
          <Feather name="clock" size={18} color="rgba(255,255,255,0.7)" />
        </View>
        {/* Building body */}
        <View style={hc.buildBody}>
          {/* Windows row */}
          <View style={hc.windowRow}>
            {[0,1,2].map(i => <View key={i} style={hc.window} />)}
          </View>
          <View style={hc.windowRow}>
            {[0,1,2].map(i => <View key={i} style={hc.window} />)}
          </View>
          {/* Door */}
          <View style={hc.door} />
        </View>
        {/* Ground */}
        <View style={hc.ground} />
        {/* Clouds */}
        <View style={[hc.cloud, { top: 8, right: 40 }]} />
        <View style={[hc.cloud, { top: 2, right: 10, width: 28, height: 14 }]} />
      </View>

      {/* Text content */}
      <View style={hc.textBlock}>
        <Text style={hc.greetSub}>{greeting},</Text>
        <Text style={hc.greetName}>{userName}</Text>
        <View style={hc.dateRow}>
          <Feather name="calendar" size={12} color="rgba(255,255,255,0.8)" />
          <Text style={hc.dateTxt}>{dateLabel}</Text>
        </View>
        <Text style={hc.schoolTxt} numberOfLines={2}>{schoolName.toUpperCase()}</Text>
      </View>

      {/* Arrow button */}
      <TouchableOpacity
        style={hc.arrowBtn}
        onPress={() => router.push('/(tabs)/students' as any)}
        activeOpacity={0.85}
      >
        <Feather name="arrow-right" size={18} color="#C8A040" />
      </TouchableOpacity>
    </LinearGradient>
  );
}
const hc = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 20,
    padding: 20, paddingBottom: 60, overflow: 'hidden', position: 'relative',
    minHeight: 160,
    shadowColor: '#0F2456', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  wave1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -80, right: -60,
  },
  wave2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -60, right: 30,
  },
  textBlock: { zIndex: 1, maxWidth: '55%' },
  greetSub: { fontSize: 14, color: 'rgba(255,255,255,0.82)', fontWeight: '500', marginBottom: 2 },
  greetName: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  dateTxt: { fontSize: 12, color: 'rgba(255,255,255,0.82)', fontWeight: '500' },
  schoolTxt: { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '700', letterSpacing: 0.8 },
  arrowBtn: {
    position: 'absolute', bottom: 16, right: 16,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0F2456', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  // building illustration
  building: { position: 'absolute', right: 12, top: 8, bottom: 0, width: 130, zIndex: 0 },
  flagpole: {
    position: 'absolute', top: 14, right: 55,
    width: 2, height: 50, backgroundColor: 'rgba(255,255,255,0.5)',
  },
  flag: {
    position: 'absolute', top: 14, right: 40,
    width: 16, height: 10, backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 2,
  },
  clockRing: {
    position: 'absolute', top: 46, right: 44,
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  buildBody: {
    position: 'absolute', bottom: 14, right: 24,
    width: 80, height: 68,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    padding: 6, gap: 4, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  windowRow: { flexDirection: 'row', gap: 5 },
  window: {
    width: 12, height: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
  },
  door: {
    width: 14, height: 18,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 3, marginTop: 2,
  },
  ground: {
    position: 'absolute', bottom: 12, right: 16,
    width: 96, height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 1,
  },
  cloud: {
    position: 'absolute',
    width: 36, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  title, linkLabel, onLink, rightBadge,
}: { title: string; linkLabel?: string; onLink?: () => void; rightBadge?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: '#0C1F4A', letterSpacing: -0.3 }}>{title}</Text>
      {rightBadge ?? (linkLabel ? (
        <TouchableOpacity onPress={onLink} activeOpacity={0.7}>
          <Text style={{ fontSize: 13, color: '#C8A040', fontWeight: '700' }}>{linkLabel}</Text>
        </TouchableOpacity>
      ) : null)}
    </View>
  );
}

// ─── People overview card (Students / Teachers / Classes) ──────────────────────
function PeopleCard({
  icon, label, value, accentColor, accentBg, onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string; value: number;
  accentColor: string; accentBg: string;
  onPress?: () => void;
}) {
  // derive a lighter tint from accentBg for the card gradient
  return (
    <TouchableOpacity style={[pc.wrap, { shadowColor: accentColor }]} onPress={onPress} activeOpacity={0.82}>
      {/* subtle top-right glow blob */}
      <View style={[pc.glowBlob, { backgroundColor: accentBg }]} />
      {/* icon */}
      <LinearGradient
        colors={[accentColor, accentColor + 'CC']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={pc.iconWrap}
      >
        <Feather name={icon} size={18} color="#fff" />
      </LinearGradient>
      {/* value */}
      <Text style={[pc.value, { color: accentColor }]}>{value}</Text>
      <Text style={pc.label}>{label}</Text>
      {/* footer */}
      <View style={pc.footer}>
        <Text style={[pc.viewAll, { color: accentColor }]}>View all</Text>
        <Feather name="arrow-right" size={11} color={accentColor} />
      </View>
      {/* gradient bottom strip */}
      <LinearGradient
        colors={[accentColor + '00', accentColor]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={pc.strip}
      />
    </TouchableOpacity>
  );
}
const pc = StyleSheet.create({
  wrap: {
    flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 14,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 16, elevation: 6,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  glowBlob: {
    position: 'absolute', top: -18, right: -18,
    width: 72, height: 72, borderRadius: 36, opacity: 0.55,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  value: { fontSize: 30, fontWeight: '900', letterSpacing: -1.2, marginBottom: 2, lineHeight: 34 },
  label: { fontSize: 11.5, color: '#64748B', fontWeight: '600', marginBottom: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewAll: { fontSize: 11, fontWeight: '800' },
  strip: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3.5 },
});

// ─── Finance overview card (Fees / Expenses / Net Balance) ────────────────────
function FinanceCard({
  icon, label, value, accentColor, accentBg, change, isPositiveChange, onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string; value: string;
  accentColor: string; accentBg: string;
  change?: string; isPositiveChange?: boolean;
  onPress?: () => void;
}) {
  const changeColor = isPositiveChange ? '#10B981' : '#EF4444';
  return (
    <TouchableOpacity
      style={[fc.wrap, { shadowColor: accentColor }]}
      onPress={onPress} activeOpacity={onPress ? 0.8 : 1}
    >
      <LinearGradient
        colors={[accentColor + '14', accentColor + '05']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* shimmer corner orb */}
      <View style={[fc.orb, { backgroundColor: accentColor + '18' }]} />
      {/* icon badge */}
      <LinearGradient
        colors={[accentColor, accentColor + 'BB']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={fc.iconWrap}
      >
        <Feather name={icon} size={16} color="#fff" />
      </LinearGradient>
      <Text style={[fc.value, { color: accentColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={fc.label}>{label}</Text>
      {change !== undefined && (
        <View style={[fc.changePill, { backgroundColor: changeColor + '18', borderColor: changeColor + '30' }]}>
          <Feather
            name={isPositiveChange ? 'trending-up' : 'trending-down'}
            size={10} color={changeColor}
          />
          <Text style={[fc.changeTxt, { color: changeColor }]}>{change}</Text>
        </View>
      )}
      {/* gradient top-edge accent */}
      <LinearGradient
        colors={[accentColor, accentColor + '00']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={fc.topStrip}
      />
    </TouchableOpacity>
  );
}
const fc = StyleSheet.create({
  wrap: {
    flex: 1, borderRadius: 20, padding: 13, overflow: 'hidden',
    backgroundColor: '#fff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16, shadowRadius: 14, elevation: 5,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
  },
  orb: {
    position: 'absolute', top: -20, right: -20,
    width: 64, height: 64, borderRadius: 32,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 11,
  },
  value: { fontSize: 17, fontWeight: '900', letterSpacing: -0.6, marginBottom: 2, lineHeight: 21 },
  label: { fontSize: 9.5, color: '#64748B', fontWeight: '600', marginBottom: 8 },
  changePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start',
  },
  changeTxt: { fontSize: 9.5, fontWeight: '800' },
  topStrip: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
});

// ─── Finance Panel types & helpers ────────────────────────────────────────────
type FilterPeriod = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';
type FinancePanelTab = 'fees' | 'expenses' | 'net';

function getDateRange(period: FilterPeriod, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();
  const toStr = (d: Date) => d.toISOString().split('T')[0];
  const today = toStr(now);
  if (period === 'today') return { start: today, end: today };
  if (period === 'week') {
    const dow = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    return { start: toStr(mon), end: today };
  }
  if (period === 'month') {
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return { start, end: today };
  }
  if (period === 'year') return { start: `${now.getFullYear()}-01-01`, end: today };
  if (period === 'custom' && customStart && customEnd) return { start: customStart, end: customEnd };
  return { start: '2000-01-01', end: today };
}

// ─── Mini bar for chart ───────────────────────────────────────────────────────
function ChartBar({ label, feesAmt, expAmt, maxAmt }: { label: string; feesAmt: number; expAmt: number; maxAmt: number }) {
  const H = 72;
  const feesH = maxAmt > 0 ? Math.max(3, (feesAmt / maxAmt) * H) : 3;
  const expH  = maxAmt > 0 ? Math.max(3, (expAmt  / maxAmt) * H) : 3;
  return (
    <View style={{ alignItems: 'center', gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: H }}>
        <View style={{ width: 9, height: feesH, backgroundColor: '#10B981', borderRadius: 3 }} />
        <View style={{ width: 9, height: expH,  backgroundColor: '#EF4444', borderRadius: 3 }} />
      </View>
      <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

// ─── Finance Detail Panel ─────────────────────────────────────────────────────
const FP_PERIODS: { key: FilterPeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year',  label: 'This Year' },
  { key: 'all',   label: 'All Time' },
  { key: 'custom',label: 'Custom' },
];
const MONTH_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function FinanceDetailPanel({
  visible, onClose, initialTab, feeRecords, expenses,
}: {
  visible: boolean; onClose: () => void; initialTab: FinancePanelTab;
  feeRecords: any[]; expenses: any[];
}) {
  const [period, setPeriod]         = useState<FilterPeriod>('month');
  const [tab, setTab]               = useState<FinancePanelTab>(initialTab);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');

  useEffect(() => { if (visible) { setTab(initialTab); setPeriod('month'); } }, [visible, initialTab]);

  const { start, end } = useMemo(() => getDateRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const filteredFees = useMemo(() => feeRecords.filter(f => f.date >= start && f.date <= end), [feeRecords, start, end]);
  const filteredExp  = useMemo(() => expenses.filter(e => e.date >= start && e.date <= end),   [expenses,    start, end]);

  const totalFees = filteredFees.reduce((s, f) => s + f.amount, 0);
  const totalExp  = filteredExp.reduce((s, e) => s + e.amount, 0);
  const netBal    = totalFees - totalExp;

  const fmtFull = (n: number) => {
    const abs = Math.abs(n);
    const pre = n < 0 ? '-₹' : '₹';
    if (abs >= 100000) return `${pre}${(abs / 100000).toFixed(2)}L`;
    if (abs >= 1000)   return `${pre}${(abs / 1000).toFixed(1)}k`;
    return `${pre}${abs.toLocaleString('en-IN')}`;
  };

  // Chart groups
  const chartData = useMemo(() => {
    const groups: { label: string; fees: number; exp: number }[] = [];
    if (period === 'today') {
      groups.push({ label: 'Today', fees: totalFees, exp: totalExp });
    } else if (period === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        groups.push({
          label: ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()],
          fees: filteredFees.filter(f => f.date === ds).reduce((s, f) => s + f.amount, 0),
          exp:  filteredExp.filter(e => e.date === ds).reduce((s, e) => s + e.amount, 0),
        });
      }
    } else if (period === 'month') {
      for (let w = 3; w >= 0; w--) {
        const wEnd = new Date(); wEnd.setDate(wEnd.getDate() - w * 7);
        const wStart = new Date(wEnd); wStart.setDate(wEnd.getDate() - 6);
        const ws = wStart.toISOString().split('T')[0] < start ? start : wStart.toISOString().split('T')[0];
        const we = wEnd.toISOString().split('T')[0];
        groups.push({
          label: `W${4 - w}`,
          fees: filteredFees.filter(f => f.date >= ws && f.date <= we).reduce((s, f) => s + f.amount, 0),
          exp:  filteredExp.filter(e => e.date >= ws && e.date <= we).reduce((s, e) => s + e.amount, 0),
        });
      }
    } else {
      const monthSet = new Set<string>();
      [...filteredFees, ...filteredExp].forEach(r => monthSet.add(r.date.substring(0, 7)));
      Array.from(monthSet).sort().slice(-12).forEach(m => {
        groups.push({
          label: MONTH_S[parseInt(m.split('-')[1]) - 1],
          fees: filteredFees.filter(f => f.date.startsWith(m)).reduce((s, f) => s + f.amount, 0),
          exp:  filteredExp.filter(e => e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0),
        });
      });
    }
    return groups;
  }, [period, filteredFees, filteredExp, totalFees, totalExp, start]);

  const maxAmt = Math.max(...chartData.map(g => Math.max(g.fees, g.exp)), 1);

  // Fee type breakdown
  const feesByType = useMemo(() => {
    const map: Record<string, number> = {};
    filteredFees.forEach(f => {
      const key = f.feeTypeName ?? f.description ?? 'Other';
      map[key] = (map[key] ?? 0) + f.amount;
    });
    return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }, [filteredFees]);

  // Transactions list
  const transactions = useMemo(() => {
    const fees = filteredFees.map(f => ({ id: `f-${f.id}`, type: 'fee' as const, title: f.studentName || 'Student', subtitle: f.description || 'Fee payment', amount: f.amount, date: f.date }));
    const exps = filteredExp.map(e => ({ id: `e-${e.id}`, type: 'expense' as const, title: e.description || 'Expense', subtitle: e.category || 'General', amount: e.amount, date: e.date }));
    if (tab === 'fees')     return fees.sort((a, b) => b.date.localeCompare(a.date));
    if (tab === 'expenses') return exps.sort((a, b) => b.date.localeCompare(a.date));
    return [...fees, ...exps].sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredFees, filteredExp, tab]);

  const fpInsets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[fp.sheet, { paddingTop: fpInsets.top, paddingBottom: fpInsets.bottom + 12 }]}>

          {/* Header */}
          <View style={fp.header}>
            <TouchableOpacity onPress={onClose} style={fp.backBtn} activeOpacity={0.7}>
              <Feather name="arrow-left" size={20} color="#0C1F4A" />
            </TouchableOpacity>
            <Text style={fp.headerTitle}>Financial Overview</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Period pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 48 }} contentContainerStyle={fp.pillsRow}>
            {FP_PERIODS.map(p => (
              <TouchableOpacity key={p.key} style={[fp.pill, period === p.key && fp.pillOn]} onPress={() => setPeriod(p.key)} activeOpacity={0.7}>
                <Text style={[fp.pillTxt, period === p.key && fp.pillTxtOn]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Custom range inputs */}
          {period === 'custom' && (
            <View style={fp.customRow}>
              <View style={{ flex: 1 }}>
                <Text style={fp.customLbl}>From</Text>
                <TextInput style={fp.customField} value={customStart} onChangeText={setCustomStart} placeholder="YYYY-MM-DD" placeholderTextColor="#94A3B8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fp.customLbl}>To</Text>
                <TextInput style={fp.customField} value={customEnd} onChangeText={setCustomEnd} placeholder="YYYY-MM-DD" placeholderTextColor="#94A3B8" />
              </View>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {/* Summary tabs */}
            <View style={fp.summaryRow}>
              {([
                { key: 'fees'     as FinancePanelTab, label: 'Fees Collected', amt: totalFees, color: '#10B981', bg: '#ECFDF5', icon: 'arrow-down-circle' as const },
                { key: 'expenses' as FinancePanelTab, label: 'Total Expenses', amt: totalExp,  color: '#EF4444', bg: '#FEF2F2', icon: 'trending-down'      as const },
                { key: 'net'      as FinancePanelTab, label: 'Net Balance',    amt: netBal,    color: netBal >= 0 ? '#10B981' : '#EF4444', bg: '#FFFBEB', icon: 'briefcase' as const },
              ] as const).map(item => (
                <TouchableOpacity key={item.key} style={[fp.sumCard, tab === item.key && fp.sumCardOn]} onPress={() => setTab(item.key)} activeOpacity={0.8}>
                  <View style={[fp.sumIcon, { backgroundColor: item.bg }]}>
                    <Feather name={item.icon} size={15} color={item.color} />
                  </View>
                  <Text style={[fp.sumAmt, { color: item.color }]}>{fmtFull(item.amt)}</Text>
                  <Text style={fp.sumLbl}>{item.label}</Text>
                  {tab === item.key && <View style={[fp.sumStrip, { backgroundColor: item.color }]} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Chart */}
            {chartData.length > 0 && chartData.some(g => g.fees > 0 || g.exp > 0) && (
              <View style={fp.chartCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={fp.chartTitle}>Breakdown</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                      <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>Fees</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                      <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>Expenses</Text>
                    </View>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 14, alignItems: 'flex-end', paddingHorizontal: 4, paddingBottom: 2 }}>
                  {chartData.map((g, i) => <ChartBar key={i} label={g.label} feesAmt={g.fees} expAmt={g.exp} maxAmt={maxAmt} />)}
                </ScrollView>
              </View>
            )}

            {/* Fee Type Breakdown */}
            {tab !== 'expenses' && feesByType.length > 0 && (
              <View style={[fp.txnCard, { marginBottom: 0, marginTop: 12 }]}>
                <Text style={fp.chartTitle}>Collected by Fee Type</Text>
                {feesByType.map(({ name, total }, i) => {
                  const pct = totalFees > 0 ? total / totalFees : 0;
                  return (
                    <View key={name} style={[{ paddingVertical: 10 }, i < feesByType.length - 1 && fp.txnBorder]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#1E293B' }}>{name}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981' }}>₹{total.toLocaleString('en-IN')}</Text>
                          <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>{(pct * 100).toFixed(1)}%</Text>
                        </View>
                      </View>
                      <View style={{ height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ height: 4, width: `${(pct * 100).toFixed(1)}%` as any, backgroundColor: '#10B981', borderRadius: 2 }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Transaction list */}
            <View style={[fp.txnCard, { marginTop: 12 }]}>
              <Text style={fp.chartTitle}>Transactions ({transactions.length})</Text>
              {transactions.length === 0 ? (
                <View style={fp.empty}>
                  <Feather name="inbox" size={30} color="#CBD5E1" />
                  <Text style={fp.emptyTxt}>No transactions for this period</Text>
                </View>
              ) : transactions.map((t, i) => (
                <View key={t.id} style={[fp.txn, i < transactions.length - 1 && fp.txnBorder]}>
                  <View style={[fp.txnIcon, { backgroundColor: t.type === 'fee' ? '#ECFDF5' : '#FEF2F2' }]}>
                    <Feather name={t.type === 'fee' ? 'arrow-down-circle' : 'trending-down'} size={14} color={t.type === 'fee' ? '#10B981' : '#EF4444'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fp.txnTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={fp.txnSub}   numberOfLines={1}>{t.subtitle}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[fp.txnAmt, { color: t.type === 'fee' ? '#10B981' : '#EF4444' }]}>
                      {t.type === 'fee' ? '+' : '-'}₹{t.amount.toLocaleString('en-IN')}
                    </Text>
                    <Text style={fp.txnDate}>{t.date}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Quick action item ─────────────────────────────────────────────────────────
function QuickActionItem({
  icon, label, gradient, onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string; gradient: [string, string];
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={qa.wrap} onPress={onPress} activeOpacity={0.8}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={qa.iconWrap}
      >
        <View style={qa.iconInner}>
          <Feather name={icon} size={21} color="#FFFFFF" />
        </View>
      </LinearGradient>
      <Text style={qa.label}>{label}</Text>
    </TouchableOpacity>
  );
}
const qa = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 7, width: '33.33%', paddingBottom: 4 },
  iconWrap: {
    width: 54, height: 54, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0C1F4A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 4,
  },
  iconInner: {
    width: 32, height: 32, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
  },
  label: { fontSize: 10, fontWeight: '800', color: '#0C1F4A', textAlign: 'center' },
});

// ─── Recent activity item ──────────────────────────────────────────────────────
function ActivityItem({
  icon, iconColor, iconBg, title, subtitle, timeLabel, amount, amountColor, amountBg, isLast,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string; iconBg: string;
  title: string; subtitle: string;
  timeLabel: string;
  amount: string; amountColor: string; amountBg: string;
  isLast: boolean;
}) {
  return (
    <View style={[ai.wrap, !isLast && ai.border]}>
      <View style={[ai.iconCircle, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ai.title} numberOfLines={1}>{title}</Text>
        <Text style={ai.sub} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={ai.time}>{timeLabel}</Text>
        <View style={[ai.pill, { backgroundColor: amountBg }]}>
          <Text style={[ai.pillTxt, { color: amountColor }]}>{amount}</Text>
        </View>
      </View>
    </View>
  );
}
const ai = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingHorizontal: 16 },
  border: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, fontWeight: '700', color: '#0C1F4A' },
  sub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  time: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  pill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    borderWidth: 1, borderColor: 'transparent',
  },
  pillTxt: { fontSize: 10, fontWeight: '800' },
});

// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const { user, isLoading, logout, changeAdminCredentials } = useAuth();
  const { students, teachers, classes, feeRecords, expenses, attendanceRecords, alumni, documentBranding, updateDocumentBranding } = useApp();
  const insets = useSafeAreaInsets();
  const dbInfo = useDbStatus();

  const [logoutModal, setLogoutModal] = useState(false);
  const [credentialsModal, setCredentialsModal] = useState(false);
  const [credForm, setCredForm] = useState({ currentPassword: '', newUsername: '', newPassword: '', confirmPassword: '' });
  const [credError, setCredError] = useState('');
  const [credSaving, setCredSaving] = useState(false);
  const [credSuccess, setCredSuccess] = useState(false);
  const [birthdayCard, setBirthdayCard] = useState<Student | null>(null);
  const [birthdaySharing, setBirthdaySharing] = useState(false);
  const birthdayCardRef = useRef<View>(null);
  const [financePanel, setFinancePanel] = useState<FinancePanelTab | null>(null);
  const [brandingSaving, setBrandingSaving] = useState<
    'logo' | 'principalSignature' | 'teacherSignature' | 'examInChargeSignature'
    | 'remove-logo' | 'remove-principalSignature' | 'remove-teacherSignature' | 'remove-examInChargeSignature'
    | null
  >(null);
  const [brandingModal, setBrandingModal] = useState(false);
  const [showMonthBirthdays, setShowMonthBirthdays] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'teacher') { router.replace('/teacher'); }
  }, [isLoading, user]);

  const now   = new Date();
  const curMonthIdx = now.getMonth();
  const curYear     = now.getFullYear();
  const padM = (m: number) => String(m + 1).padStart(2, '0');

  // ── Greeting ───────────────────────────────────────────────────────────────
  const getGreeting = () => {
    const h = now.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // ── Date label ─────────────────────────────────────────────────────────────
  const dateLabel = `${WEEKDAY[now.getDay()]}, ${now.getDate()} ${MONTH_LONG[curMonthIdx]}, ${curYear}`;

  type BrandingImageKind = 'logo' | 'principalSignature' | 'teacherSignature' | 'examInChargeSignature';

  const pickBrandingImage = async (kind: BrandingImageKind) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to choose a logo or signature image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: kind === 'logo',          // signatures: no forced crop
      aspect: kind === 'logo' ? [1, 1] : undefined,
      quality: 0.65,
      base64: true,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    setBrandingSaving(kind);
    try {
      const mime = asset.mimeType?.startsWith('image/') ? asset.mimeType : 'image/jpeg';
      const field = kind === 'logo' ? 'logoDataUrl' : `${kind}DataUrl` as
        'principalSignatureDataUrl' | 'teacherSignatureDataUrl' | 'examInChargeSignatureDataUrl';
      await updateDocumentBranding({
        ...documentBranding,
        [field]: `data:${mime};base64,${asset.base64}`,
      });
      Alert.alert('Saved', `${kind === 'logo' ? 'Logo' : 'Signature'} updated for marksheets and admit cards.`);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not save this image.');
    } finally {
      setBrandingSaving(null);
    }
  };

  const removeBrandingImage = async (kind: BrandingImageKind) => {
    setBrandingSaving(kind === 'logo' ? 'remove-logo' : `remove-${kind}`);
    try {
      const field = kind === 'logo' ? 'logoDataUrl' : `${kind}DataUrl` as
        'principalSignatureDataUrl' | 'teacherSignatureDataUrl' | 'examInChargeSignatureDataUrl';
      await updateDocumentBranding({
        ...documentBranding,
        [field]: null,
        ...(kind === 'principalSignature' ? { signatureDataUrl: null } : {}),
      });
    } catch (e: any) {
      Alert.alert('Could not remove image', e?.message ?? 'Please try again.');
    } finally {
      setBrandingSaving(null);
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const activeStudents = useMemo(() => students.filter(isActiveStudent), [students]);
  const uniqueClasses = useMemo(() => new Set(activeStudents.map(s => s.class)).size, [activeStudents]);
  const visibleStudentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);
  const visibleFeeRecords = useMemo(
    () => feeRecords.filter(record => visibleStudentIds.has(record.studentId)),
    [feeRecords, visibleStudentIds],
  );
  const visibleAttendanceRecords = useMemo(
    () => attendanceRecords.filter(record => visibleStudentIds.has(record.studentId)),
    [attendanceRecords, visibleStudentIds],
  );

  const monthFees = useMemo(() =>
    visibleFeeRecords
      .filter(f => f.date.startsWith(`${curYear}-${padM(curMonthIdx)}`))
      .reduce((s, f) => s + f.amount, 0),
    [visibleFeeRecords, curMonthIdx, curYear]);

  const monthExpenses = useMemo(() =>
    expenses
      .filter(e => e.date.startsWith(`${curYear}-${padM(curMonthIdx)}`))
      .reduce((s, e) => s + e.amount, 0),
    [expenses, curMonthIdx, curYear]);

  const netBalance = monthFees - monthExpenses;

  const fmtAmt = (n: number) => {
    const abs = Math.abs(n);
    const prefix = n < 0 ? '-₹' : '₹';
    return abs >= 1000 ? `${prefix}${(abs / 1000).toFixed(1)}k` : `${prefix}${abs}`;
  };

  // ── Attendance ─────────────────────────────────────────────────────────────
  const todayStr     = now.toISOString().split('T')[0];
  const todayPresent = visibleAttendanceRecords.filter(a => a.date === todayStr && a.status === 'present').length;
  const todayAbsent  = visibleAttendanceRecords.filter(a => a.date === todayStr && a.status === 'absent').length;
  const todayLeave   = visibleAttendanceRecords.filter(a => a.date === todayStr && a.status === 'leave').length;
  const todayTotal   = todayPresent + todayAbsent + todayLeave;
  const attendancePct = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0;

  // ── Birthdays ──────────────────────────────────────────────────────────────
  const birthdayStudents = useMemo(() =>
    [...students, ...alumni.map(alumniToStudent)].filter(s => isBirthdayToday(s.dateOfBirth)),
    [students, alumni],
  );
  const upcomingBirthdays = useMemo(() =>
    [...students, ...alumni.map(alumniToStudent)]
      .filter(s => (() => { const d = daysUntilBirthday(s.dateOfBirth); return d > 0 && d <= 30; })())
      .sort((a, b) => daysUntilBirthday(a.dateOfBirth) - daysUntilBirthday(b.dateOfBirth))
      .slice(0, 5),
    [students, alumni],
  );
  const monthBirthdays = useMemo(() => {
    const month = now.getMonth() + 1;
    const today = now.getDate();
    return [...students, ...alumni.map(alumniToStudent)]
      .filter(s => {
        const mmdd = extractMMDD(s.dateOfBirth);
        if (!mmdd) return false;
        const [mm, dd] = mmdd.split('-').map(Number);
        // Only today and upcoming — skip already-passed dates
        return mm === month && dd >= today;
      })
      .sort((a, b) => {
        const da = Number(extractMMDD(a.dateOfBirth)?.split('-')[1] ?? 99);
        const db = Number(extractMMDD(b.dateOfBirth)?.split('-')[1] ?? 99);
        return da - db;
      });
  }, [students, alumni, now.getMonth(), now.getDate()]);
  // ── Recent activity (fees + expenses, newest first) ────────────────────────
  const recentActivity = useMemo(() => {
    const feeItems = visibleFeeRecords.map(f => ({
      id: `fee-${f.id}`,
      type: 'fee' as const,
      title: `Fee collected from ${f.studentName}`,
      subtitle: `${f.description || 'Fee'} · ₹${f.amount.toLocaleString('en-IN')}`,
      amount: `+₹${f.amount.toLocaleString('en-IN')}`,
      amountColor: '#10B981',
      amountBg: '#ECFDF5',
      icon: 'arrow-down-circle' as const,
      iconColor: '#10B981',
      iconBg: '#ECFDF5',
      date: f.date,
    }));

    const expItems = (expenses as any[]).map((e: any) => ({
      id: `exp-${e.id}`,
      type: 'expense' as const,
      title: `Expense: ${e.description}`,
      subtitle: `${e.category || 'General'} · ₹${e.amount.toLocaleString('en-IN')}`,
      amount: `-₹${e.amount.toLocaleString('en-IN')}`,
      amountColor: '#EF4444',
      amountBg: '#FEF2F2',
      icon: 'trending-down' as const,
      iconColor: '#EF4444',
      iconBg: '#FEF2F2',
      date: e.date,
    }));

    return [...feeItems, ...expItems]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [visibleFeeRecords, expenses]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const doLogout = async () => {
    setLogoutModal(false);
    router.replace('/login');
    await logout();
  };

  const openCredentialsModal = () => {
    setLogoutModal(false);
    setCredForm({ currentPassword: '', newUsername: user?.username ?? 'admin', newPassword: '', confirmPassword: '' });
    setCredError('');
    setCredSuccess(false);
    setCredentialsModal(true);
  };

  const doChangeCredentials = async () => {
    setCredError('');
    if (!credForm.currentPassword) { setCredError('Please enter your current password.'); return; }
    if (credForm.newUsername.trim().length < 3) { setCredError('Username must be at least 3 characters.'); return; }
    if (credForm.newPassword && credForm.newPassword.length < 6) { setCredError('Password must be at least 6 characters.'); return; }
    if (credForm.newPassword && credForm.newPassword !== credForm.confirmPassword) { setCredError('New passwords do not match.'); return; }
    setCredSaving(true);
    const result = await changeAdminCredentials(
      credForm.currentPassword,
      credForm.newUsername.trim() || undefined,
      credForm.newPassword || undefined,
    );
    setCredSaving(false);
    if (!result.success) { setCredError(result.error ?? 'Update failed.'); return; }
    setCredSuccess(true);
  };

  // Throws on real errors so the caller's try/catch can surface them without
  // any unhandled rejection reaching Expo Router (which would navigate to root).
  const sendBirthdayWhatsApp = async (student: Student): Promise<void> => {
    const caption =
`🎂 Happy Birthday ${student.name}! 🎂\n\n🎈 Wishing you a fantastic birthday filled with joy, laughter, and endless success!\n\n🏫 ${SCHOOL_INFO.name}\n📞 ${SCHOOL_INFO.contact}`;
    await sendReminderWhatsApp(student, caption);
  };

  const sendBirthdayCard = async (student: Student): Promise<void> => {
    const caption =
`🎂 Happy Birthday ${student.name}! 🎂\n\n🎈 Wishing you a fantastic birthday filled with joy, laughter, and endless success!\n\n🏫 ${SCHOOL_INFO.name}\n📞 ${SCHOOL_INFO.contact}`;
    await sendBirthdayCardWhatsApp(birthdayCardRef, student, caption);
  };

  const botPad = Platform.OS === 'web' ? 80 : insets.bottom + 80;

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── App Header ── */}
      <AppHeader
        onAvatarPress={() => setLogoutModal(true)}
        userName={user?.name ?? 'A'}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: '#F8FAFC' }}
        contentContainerStyle={{ paddingBottom: botPad }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card ── */}
        <FadeSlide delay={0}>
          <HeroCard
            greeting={getGreeting()}
            userName={user?.name ?? 'Administrator'}
            dateLabel={dateLabel}
            schoolName={SCHOOL_INFO.name}
          />
        </FadeSlide>

        {/* ── DB Status chip ── */}
        <FadeSlide delay={30}>
          <TouchableOpacity
            style={dbs.chip}
            onPress={() => router.push('/db-manager' as any)}
            activeOpacity={0.8}
          >
            <View style={[dbs.dot, { backgroundColor: dbInfo.connected ? '#10B981' : '#94A3B8' }]} />
            <Feather name="database" size={12} color={dbInfo.connected ? '#10B981' : '#64748B'} />
            <Text style={[dbs.name, { color: dbInfo.connected ? '#10B981' : '#64748B' }]} numberOfLines={1}>
              {dbInfo.name}
            </Text>
            <Feather name="chevron-right" size={12} color="#94A3B8" />
          </TouchableOpacity>
        </FadeSlide>

        {/* ── Overview ── */}
        <FadeSlide delay={60}>
          <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
            <SectionHeader
              title="Overview"
              rightBadge={
                <View style={ov.monthBadge}>
                  <Text style={ov.monthTxt}>This Month</Text>
                  <Feather name="chevron-down" size={13} color="#64748B" />
                </View>
              }
            />

            {/* Row 1: People */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <PeopleCard
                icon="users" label="Students" value={activeStudents.length}
                accentColor="#1E3A8A" accentBg="#EFF6FF"
                onPress={() => router.push('/(tabs)/students' as any)}
              />
              <PeopleCard
                icon="user-check" label="Teachers" value={teachers.length}
                accentColor="#10B981" accentBg="#ECFDF5"
                onPress={() => router.push('/(tabs)/teachers' as any)}
              />
              <PeopleCard
                icon="book" label="Classes" value={uniqueClasses}
                accentColor="#7C3AED" accentBg="#F5F3FF"
                onPress={() => router.push('/teacher/classes' as any)}
              />
            </View>

            {/* Row 2: Finance */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <FinanceCard
                icon="arrow-down-circle"
                label={`Fees (${MONTH_SHORT[curMonthIdx]})`}
                value={fmtAmt(monthFees)}
                accentColor="#10B981" accentBg="#F0FDF4"
                change="collected" isPositiveChange={true}
                onPress={() => setFinancePanel('fees')}
              />
              <FinanceCard
                icon="trending-down"
                label={`Expenses (${MONTH_SHORT[curMonthIdx]})`}
                value={fmtAmt(monthExpenses)}
                accentColor="#EF4444" accentBg="#FEF2F2"
                change="spent" isPositiveChange={false}
                onPress={() => setFinancePanel('expenses')}
              />
              <FinanceCard
                icon="briefcase"
                label={`Net Balance (${MONTH_SHORT[curMonthIdx]})`}
                value={fmtAmt(netBalance)}
                accentColor="#F59E0B"
                accentBg="#FFFBEB"
                change={netBalance >= 0 ? 'surplus' : 'deficit'}
                isPositiveChange={netBalance >= 0}
                onPress={() => setFinancePanel('net')}
              />
            </View>
          </View>
        </FadeSlide>

        {/* ── Quick Actions ── */}
        <FadeSlide delay={120}>
          <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
            <SectionHeader
              title="Quick Actions"
              linkLabel="View all"
            />
            <View style={qa_row.wrap}>
              <QuickActionItem
                icon="user-plus" label="Add Student" gradient={['#0F2456', '#2563EB']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/students' as any); }}
              />
              <QuickActionItem
                icon="user-check" label="Add Teacher" gradient={['#047857', '#34D399']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/teachers' as any); }}
              />
              <QuickActionItem
                icon="credit-card" label="Collect Fee" gradient={['#A16207', '#FBBF24']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/finance' as any); }}
              />
              <QuickActionItem
                icon="minus-circle" label="Add Expense" gradient={['#B91C1C', '#F87171']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/finance' as any); }}
              />
              <QuickActionItem
                icon="send" label="Send Message" gradient={['#5B21B6', '#A78BFA']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/messaging' as any); }}
              />
              <QuickActionItem
                icon="calendar" label="Attendance" gradient={['#0E7490', '#22D3EE']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/attendance' as any); }}
              />
              <QuickActionItem
                icon="arrow-up-circle" label="Promote" gradient={['#1E3A8A', '#6366F1']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/promote' as any); }}
              />
              <QuickActionItem
                icon="file-text" label="Admit Card" gradient={['#92400E', '#F59E0B']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/admitcard' as any); }}
              />
              <QuickActionItem
                icon="award" label="Marksheet" gradient={['#0F2456', '#C8A040']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/marksheet' as any); }}
              />
              <QuickActionItem
                icon="shield" label="Inactive Mgmt" gradient={['#7C2D12', '#B45309']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/inactive-management' as any); }}
              />
              <QuickActionItem
                icon="credit-card" label="ID Cards" gradient={['#1e3a8a', '#6d28d9']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/idcard' as any); }}
              />
              <QuickActionItem
                icon="layers" label="Branding" gradient={['#0369A1', '#6D28D9']}
                onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBrandingModal(true); }}
              />
            </View>
          </View>
        </FadeSlide>

        {/* ── Today's Attendance ── */}
        {todayTotal > 0 && (
          <FadeSlide delay={170}>
            <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
              <SectionHeader title="Today's Attendance" linkLabel={`${attendancePct}% Present`} />
              <View style={att.card}>
                {/* Segmented bar */}
                <View style={att.barBg}>
                  {todayPresent > 0 && (
                    <LinearGradient
                      colors={['#10B981', '#34D399']}
                      style={[att.barSeg, { flex: todayPresent }]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    />
                  )}
                  {todayAbsent > 0 && <View style={[att.barSeg, { flex: todayAbsent, backgroundColor: '#EF4444' }]} />}
                  {todayLeave > 0 && <View style={[att.barSeg, { flex: todayLeave, backgroundColor: '#F59E0B' }]} />}
                </View>
                <View style={att.statsRow}>
                  {[
                    { label: 'Present', val: todayPresent, color: '#10B981' },
                    { label: 'Absent',  val: todayAbsent,  color: '#EF4444' },
                    { label: 'Leave',   val: todayLeave,   color: '#F59E0B' },
                    { label: 'Total',   val: todayTotal,   color: '#1E3A8A' },
                  ].map((item, i) => (
                    <React.Fragment key={item.label}>
                      {i > 0 && <View style={att.div} />}
                      <View style={att.statItem}>
                        <Text style={[att.statNum, { color: item.color }]}>{item.val}</Text>
                        <Text style={att.statLbl}>{item.label}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </View>
            </View>
          </FadeSlide>
        )}

        {/* ── Birthdays ── */}
        <FadeSlide delay={200}>
          <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
            {/* Header */}
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 14 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#0C1F4A', letterSpacing: -0.3 }}>
                {birthdayStudents.length > 0 ? '🎂 Birthdays Today' : '🎁 Birthdays'}
              </Text>
              <TouchableOpacity onPress={() => setShowMonthBirthdays(true)} activeOpacity={0.82} style={{ borderRadius: 20, overflow: 'hidden' }}>
                <LinearGradient colors={['#EC4899','#8B5CF6']} style={{ flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:14, paddingVertical:7 }} start={{x:0,y:0}} end={{x:1,y:0}}>
                  <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>View All</Text>
                  <Feather name="chevron-right" size={12} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {birthdayStudents.length > 0 ? (
              birthdayStudents.map(student => (
                <View key={`today-${student.id}`} style={bday.heroWrap}>
                  <LinearGradient colors={['#FF3CAC','#784BA0','#2B86C5']} style={bday.heroGrad} start={{x:0,y:0}} end={{x:1,y:1}}>
                    {/* Glossy sheen */}
                    <View style={bday.heroSheen} />
                    {/* Confetti top-right */}
                    <BdayConfetti />
                    <View style={{ flexDirection:'row', alignItems:'center', gap:14, marginBottom:18 }}>
                      <View style={bday.heroAvatar}>
                        <Text style={bday.heroAvatarLetter}>{student.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex:1 }}>
                        <Text style={bday.heroLabel}>HAPPY BIRTHDAY 🎂</Text>
                        <Text style={bday.heroName}>{student.name}</Text>
                        <Text style={bday.heroMeta}>{student.class} · Roll {student.rollNumber}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection:'row', gap:10 }}>
                      <TouchableOpacity onPress={() => setBirthdayCard(student)} activeOpacity={0.8} style={bday.heroBtn}>
                        <Feather name="gift" size={14} color="#fff" />
                        <Text style={bday.heroBtnTxt}>Birthday Card</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setBirthdayCard(student)} activeOpacity={0.8} style={bday.heroBtn}>
                        <Feather name="message-circle" size={14} color="#fff" />
                        <Text style={bday.heroBtnTxt}>Send Card PNG</Text>
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>
                </View>
              ))
            ) : (
              <View style={bday.noTodayWrap}>
                <LinearGradient colors={['#FAF5FF','#FDF2F8']} style={bday.noTodayGrad} start={{x:0,y:0}} end={{x:1,y:1}}>
                  <View style={bday.noTodayIcon}>
                    <Text style={{ fontSize:26 }}>🎁</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={bday.noTodayTitle}>No birthdays today</Text>
                    <Text style={bday.noTodayMeta}>
                      {upcomingBirthdays.length > 0
                        ? `Next: ${upcomingBirthdays[0].name} in ${daysUntilBirthday(upcomingBirthdays[0].dateOfBirth)} day${daysUntilBirthday(upcomingBirthdays[0].dateOfBirth) === 1 ? '' : 's'}`
                        : 'No upcoming birthdays soon'}
                    </Text>
                  </View>
                  <Feather name="calendar" size={18} color="#A855F7" />
                </LinearGradient>
              </View>
            )}
          </View>
        </FadeSlide>

        {/* ── Recent Activity ── */}
        {recentActivity.length > 0 && (
          <FadeSlide delay={230}>
            <View style={{ marginTop: 20, paddingHorizontal: 16, marginBottom: 8 }}>
              <SectionHeader
                title="Recent Activity"
                linkLabel="View all"
                onLink={() => router.push('/(tabs)/finance' as any)}
              />
              <View style={act.card}>
                {recentActivity.map((item, i) => (
                  <ActivityItem
                    key={item.id}
                    icon={item.icon as any}
                    iconColor={item.iconColor}
                    iconBg={item.iconBg}
                    title={item.title}
                    subtitle={item.subtitle}
                    timeLabel={item.date}
                    amount={item.amount}
                    amountColor={item.amountColor}
                    amountBg={item.amountBg}
                    isLast={i === recentActivity.length - 1}
                  />
                ))}
              </View>
            </View>
          </FadeSlide>
        )}
      </ScrollView>

      {/* ── Profile / Settings Modal ── */}
      <Modal visible={logoutModal} animationType="fade" transparent>
        <View style={lm.overlay}>
          <View style={lm.sheet}>
            <View style={lm.avatarWrap}>
              <LinearGradient colors={['#0F2456', '#1E3A8A']} style={lm.avatar}>
                <Text style={lm.avatarTxt}>{(user?.name ?? 'A').charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            </View>
            <Text style={lm.name}>{user?.name}</Text>
            <Text style={lm.role}>Administrator</Text>
            <Text style={lm.school}>{SCHOOL_INFO.name}</Text>
            <View style={lm.divider} />

            {/* DB status in modal */}
            {dbInfo && (
              <View style={[lm.dbStatusRow, { backgroundColor: dbInfo.connected ? '#ECFDF5' : '#F8FAFC' }]}>
                <View style={[lm.dbStatusDot, { backgroundColor: dbInfo.connected ? '#10B981' : '#94A3B8' }]} />
                <Feather name="database" size={13} color={dbInfo.connected ? '#10B981' : '#64748B'} />
                <Text style={[lm.dbStatusTxt, { color: dbInfo.connected ? '#10B981' : '#64748B' }]} numberOfLines={1}>
                  {dbInfo.name}
                </Text>
              </View>
            )}

            {/* Database Manager button */}
            <TouchableOpacity
              style={lm.dbBtn}
              onPress={() => { setLogoutModal(false); router.push('/db-manager' as any); }}
              activeOpacity={0.85}
            >
              <View style={lm.dbBtnIcon}>
                <Feather name="database" size={18} color="#C8A040" />
              </View>
              <Text style={lm.dbBtnTxt}>Database Manager</Text>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </TouchableOpacity>

            {/* Change Credentials button */}
            <TouchableOpacity
              style={lm.credBtn}
              onPress={openCredentialsModal}
              activeOpacity={0.85}
            >
              <View style={lm.credBtnIcon}>
                <Feather name="lock" size={18} color="#7C3AED" />
              </View>
              <Text style={lm.credBtnTxt}>Change Username / Password</Text>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity style={lm.logoutBtn} onPress={doLogout} activeOpacity={0.85}>
              <Feather name="log-out" size={18} color="#fff" />
              <Text style={lm.logoutTxt}>Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity style={lm.cancelBtn} onPress={() => setLogoutModal(false)} activeOpacity={0.8}>
              <Text style={lm.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Change Credentials Modal ── */}
      <Modal visible={credentialsModal} animationType="slide" transparent onRequestClose={() => setCredentialsModal(false)}>
        <View style={cm.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setCredentialsModal(false)} activeOpacity={1} />
          <View style={cm.sheet}>
            <View style={cm.handle} />
            <View style={cm.header}>
              <View style={cm.iconWrap}>
                <Feather name="lock" size={20} color="#7C3AED" />
              </View>
              <Text style={cm.title}>Change Credentials</Text>
              <TouchableOpacity onPress={() => setCredentialsModal(false)} style={cm.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {credSuccess ? (
              <View style={cm.successBox}>
                <Feather name="check-circle" size={36} color="#16A34A" />
                <Text style={cm.successTitle}>Credentials Updated</Text>
                <Text style={cm.successSub}>Your login details have been saved successfully.</Text>
                <TouchableOpacity style={cm.doneBtn} onPress={() => setCredentialsModal(false)} activeOpacity={0.85}>
                  <Text style={cm.doneBtnTxt}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={cm.sectionLabel}>CURRENT PASSWORD</Text>
                <View style={cm.inputWrap}>
                  <Feather name="lock" size={15} color="#94A3B8" style={cm.inputIcon} />
                  <TextInput
                    style={cm.input}
                    placeholder="Enter current password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry
                    value={credForm.currentPassword}
                    onChangeText={v => setCredForm(f => ({ ...f, currentPassword: v }))}
                    editable={!credSaving}
                  />
                </View>

                <Text style={[cm.sectionLabel, { marginTop: 16 }]}>NEW USERNAME</Text>
                <View style={cm.inputWrap}>
                  <Feather name="user" size={15} color="#94A3B8" style={cm.inputIcon} />
                  <TextInput
                    style={cm.input}
                    placeholder="New username (min 3 chars)"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    value={credForm.newUsername}
                    onChangeText={v => setCredForm(f => ({ ...f, newUsername: v }))}
                    editable={!credSaving}
                  />
                </View>

                <Text style={[cm.sectionLabel, { marginTop: 16 }]}>NEW PASSWORD <Text style={cm.optional}>(optional)</Text></Text>
                <View style={cm.inputWrap}>
                  <Feather name="key" size={15} color="#94A3B8" style={cm.inputIcon} />
                  <TextInput
                    style={cm.input}
                    placeholder="Leave blank to keep current"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry
                    value={credForm.newPassword}
                    onChangeText={v => setCredForm(f => ({ ...f, newPassword: v }))}
                    editable={!credSaving}
                  />
                </View>

                {credForm.newPassword.length > 0 && (
                  <>
                    <Text style={[cm.sectionLabel, { marginTop: 16 }]}>CONFIRM NEW PASSWORD</Text>
                    <View style={cm.inputWrap}>
                      <Feather name="key" size={15} color="#94A3B8" style={cm.inputIcon} />
                      <TextInput
                        style={cm.input}
                        placeholder="Repeat new password"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry
                        value={credForm.confirmPassword}
                        onChangeText={v => setCredForm(f => ({ ...f, confirmPassword: v }))}
                        editable={!credSaving}
                      />
                    </View>
                  </>
                )}

                {!!credError && (
                  <View style={cm.errorBox}>
                    <Feather name="alert-circle" size={14} color="#DC2626" />
                    <Text style={cm.errorTxt}>{credError}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[cm.saveBtn, credSaving && { opacity: 0.6 }]}
                  onPress={doChangeCredentials}
                  disabled={credSaving}
                  activeOpacity={0.85}
                >
                  <Feather name={credSaving ? 'loader' : 'check'} size={17} color="#fff" />
                  <Text style={cm.saveBtnTxt}>{credSaving ? 'Saving…' : 'Save Changes'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={cm.cancelBtn} onPress={() => setCredentialsModal(false)} activeOpacity={0.8}>
                  <Text style={cm.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Finance Detail Panel ── */}
      <FinanceDetailPanel
        visible={financePanel !== null}
        onClose={() => setFinancePanel(null)}
        initialTab={financePanel ?? 'fees'}
        feeRecords={visibleFeeRecords}
        expenses={expenses}
      />

      {/* ── Branding Modal ── */}
      <Modal visible={brandingModal} animationType="slide" transparent onRequestClose={() => setBrandingModal(false)}>
        <View style={bm.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setBrandingModal(false)} activeOpacity={1} />
          <View style={bm.sheet}>
            <View style={bm.handle} />
            <View style={bm.header}>
              <Text style={bm.title}>Document Branding</Text>
              <TouchableOpacity onPress={() => setBrandingModal(false)} style={bm.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <View style={bm.intro}>
              <View style={bm.introIcon}><Feather name="file-text" size={17} color="#1D4ED8" /></View>
              <Text style={bm.desc}>
                Add your school identity once. Each signature will appear above its matching role on printed marksheets and admit cards.
              </Text>
            </View>

            <View style={bm.sectionLabel}>
              <Text style={bm.sectionEyebrow}>DOCUMENT IDENTITY</Text>
              <Text style={bm.sectionTitle}>Header mark</Text>
            </View>
            <View style={bm.assetCard}>
              <View style={[bm.preview, bm.logoPreview]}>
                {documentBranding.logoDataUrl ? (
                  <Animated.Image source={{ uri: documentBranding.logoDataUrl }} style={bm.logoImg} resizeMode="contain" />
                ) : (
                  <Feather name="image" size={24} color="#94A3B8" />
                )}
              </View>
              <View style={bm.assetCopy}>
                <Text style={bm.assetTitle}>School logo</Text>
                <Text style={bm.assetHint}>Centered in the printed document header</Text>
                <View style={bm.btnRow}>
                  <TouchableOpacity style={bm.uploadBtn} onPress={() => pickBrandingImage('logo')} disabled={!!brandingSaving} activeOpacity={0.8}>
                    <Feather name="upload" size={13} color="#fff" />
                    <Text style={bm.uploadTxt}>{brandingSaving === 'logo' ? 'Saving…' : 'Upload logo'}</Text>
                  </TouchableOpacity>
                  {documentBranding.logoDataUrl && (
                    <TouchableOpacity onPress={() => removeBrandingImage('logo')} disabled={!!brandingSaving} activeOpacity={0.7}>
                      <Text style={bm.removeTxt}>{brandingSaving === 'remove-logo' ? 'Removing…' : 'Remove'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            <View style={bm.sectionLabel}>
              <Text style={bm.sectionEyebrow}>SIGNATURES</Text>
              <Text style={bm.sectionTitle}>Assign each signature to its printed position</Text>
            </View>
            {([
              { kind: 'teacherSignature' as BrandingImageKind, field: 'teacherSignatureDataUrl' as const, title: 'Class Teacher', hint: 'Bottom-left on marksheets', color: '#0F766E', icon: 'user' as const },
              { kind: 'examInChargeSignature' as BrandingImageKind, field: 'examInChargeSignatureDataUrl' as const, title: 'Exam In-Charge', hint: 'Bottom-center on marksheets and admit cards', color: '#7C3AED', icon: 'check-square' as const },
              { kind: 'principalSignature' as BrandingImageKind, field: 'principalSignatureDataUrl' as const, title: 'Principal', hint: 'Bottom-right on marksheets and admit cards', color: '#B45309', icon: 'award' as const },
            ]).map(item => (
              <View key={item.kind} style={bm.signatureCard}>
                    <View style={[bm.sigIcon, { backgroundColor: `${item.color}14` }]}>
                  <Feather name={item.icon} size={17} color={item.color} />
                </View>
                <View style={bm.assetCopy}>
                    <View style={bm.roleLine}>
                    <Text style={bm.assetTitle}>{item.title}</Text>
                    <View style={[bm.statusDot, { backgroundColor: (documentBranding[item.field] || (item.kind === 'principalSignature' && documentBranding.signatureDataUrl)) ? '#16A34A' : '#CBD5E1' }]} />
                  </View>
                  <Text style={bm.assetHint}>{item.hint}</Text>
                  <View style={bm.btnRow}>
                    <TouchableOpacity style={[bm.uploadBtn, { backgroundColor: item.color }]} onPress={() => pickBrandingImage(item.kind)} disabled={!!brandingSaving} activeOpacity={0.8}>
                      <Feather name="upload" size={13} color="#fff" />
                      <Text style={bm.uploadTxt}>{brandingSaving === item.kind ? 'Saving…' : 'Upload signature'}</Text>
                    </TouchableOpacity>
                    {documentBranding[item.field] && (
                      <TouchableOpacity onPress={() => removeBrandingImage(item.kind)} disabled={!!brandingSaving} activeOpacity={0.7}>
                        <Text style={bm.removeTxt}>{brandingSaving === `remove-${item.kind}` ? 'Removing…' : 'Remove'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── All Birthdays Modal ── */}
      <Modal visible={showMonthBirthdays} animationType="slide" transparent onRequestClose={() => setShowMonthBirthdays(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(10,5,30,0.7)', justifyContent:'flex-end' }}>
          <TouchableOpacity style={{flex:1}} onPress={() => setShowMonthBirthdays(false)} activeOpacity={1} />
          <View style={{ borderTopLeftRadius:28, borderTopRightRadius:28, overflow:'hidden', maxHeight:'88%', minHeight:'70%' }}>
            {/* Gradient header */}
            <LinearGradient colors={['#2D1B69','#1a0533']} style={{ paddingTop:16, paddingBottom:20, paddingHorizontal:20 }} start={{x:0,y:0}} end={{x:1,y:1}}>
              <View style={{ width:38, height:4, backgroundColor:'rgba(255,255,255,0.25)', borderRadius:2, alignSelf:'center', marginBottom:18 }} />
              <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                <View>
                   <Text style={{ fontSize:20, fontWeight:'900', color:'#fff', letterSpacing:-0.5 }}>🎂 Birthdays This Month</Text>
                  <Text style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:3 }}>
                     {monthBirthdays.length} student{monthBirthdays.length !== 1 ? 's' : ''} this month
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowMonthBirthdays(false)} style={{ width:34, height:34, borderRadius:17, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' }} activeOpacity={0.7}>
                  <Feather name="x" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
            <View style={{ backgroundColor:'#0F0824', flex:1 }}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding:16, paddingBottom:24 }}>
                {monthBirthdays.length === 0 ? (
                  <View style={{ alignItems:'center', paddingVertical:48 }}>
                    <Text style={{ fontSize:40, marginBottom:12 }}>🎈</Text>
                     <Text style={{ fontSize:15, color:'rgba(255,255,255,0.4)', fontWeight:'600' }}>No birthdays this month</Text>
                  </View>
                ) : monthBirthdays.map(student => {
                  const isToday = isBirthdayToday(student.dateOfBirth);
                  const birthdayDay = Number(extractMMDD(student.dateOfBirth)?.split('-')[1] ?? 0);
                  const hasPassed = !isToday && birthdayDay < now.getDate();
                  const days = daysUntilBirthday(student.dateOfBirth);
                  return (
                    <View key={student.id} style={bday.modalCard}>
                      <LinearGradient
                        colors={isToday ? ['#FF3CAC','#784BA0'] : ['#3B1F6A','#1E1040']}
                        style={bday.modalCardGrad}
                        start={{x:0,y:0}} end={{x:1,y:1}}
                      >
                        {isToday && <View style={bday.modalCardSheen} />}
                        <View style={{ flexDirection:'row', alignItems:'center', gap:12 }}>
                          <View style={[bday.modalAvatar, isToday && bday.modalAvatarToday]}>
                            <Text style={bday.modalAvatarTxt}>{student.name.charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex:1 }}>
                            {isToday && <Text style={bday.modalTodayLabel}>🎉 BIRTHDAY TODAY</Text>}
                            <Text style={bday.modalName}>{student.name}</Text>
                            <Text style={bday.modalMeta}>{student.class} · Roll {student.rollNumber}</Text>
                          </View>
                          <View style={[bday.modalDaysBadge, isToday && bday.modalDaysBadgeToday]}>
                            <Text style={[bday.modalDaysTxt, isToday && { color:'#FFD6EF' }]}>
                               {isToday ? '🎂 Today' : hasPassed ? 'Passed' : days === 1 ? 'Tomorrow' : `${days}d`}
                            </Text>
                          </View>
                        </View>
                        <View style={{ flexDirection:'row', gap:8, marginTop:12 }}>
                          <TouchableOpacity onPress={() => { setShowMonthBirthdays(false); setBirthdayCard(student); }} activeOpacity={0.8} style={bday.modalActionBtn}>
                            <LinearGradient colors={['#EC4899','#8B5CF6']} style={bday.modalActionGrad} start={{x:0,y:0}} end={{x:1,y:0}}>
                              <Feather name="gift" size={12} color="#fff" />
                              <Text style={bday.modalActionTxt}>Card</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => { setShowMonthBirthdays(false); setBirthdayCard(student); }} activeOpacity={0.8} style={bday.modalActionBtn}>
                            <LinearGradient colors={['#10B981','#059669']} style={bday.modalActionGrad} start={{x:0,y:0}} end={{x:1,y:0}}>
                              <Feather name="message-circle" size={12} color="#fff" />
                              <Text style={bday.modalActionTxt}>Card PNG</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      </LinearGradient>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Birthday Card Modal ── */}
      <Modal visible={!!birthdayCard} animationType="fade" transparent>
        <View style={bc.overlay}>
          <View style={bc.container}>
            {birthdayCard && (
              <>
                {/* Premium dark card */}
                <View style={bc.card} ref={birthdayCardRef} nativeID="birthday-card-capture">
                  <LinearGradient
                    colors={['#0F0C29','#302B63','#24243E']}
                    style={StyleSheet.absoluteFillObject}
                    start={{x:0,y:0}} end={{x:1,y:1}}
                  />
                  {/* Top gold accent */}
                  <LinearGradient colors={['transparent','#F59E0B','#FCD34D','#F59E0B','transparent']} style={bc.topAccent} start={{x:0,y:0}} end={{x:1,y:0}} />
                  {/* Glow orbs */}
                  <View style={bc.orb1} />
                  <View style={bc.orb2} />
                  <View style={bc.orb3} />
                  {/* Sparkle dots */}
                  <View style={bc.sparkleRow}>
                    {['✦','✧','✦','✧','✦','✧','✦'].map((sp, i) => (
                      <Text key={i} style={[bc.sparkleDot, {opacity: i % 2 === 0 ? 0.7 : 0.3}]}>{sp}</Text>
                    ))}
                  </View>
                  {/* Emoji trio */}
                  <View style={bc.emojiRow}>
                    <Text style={bc.sideEmoji}>🎊</Text>
                    <Text style={bc.mainEmoji}>🎂</Text>
                    <Text style={bc.sideEmoji}>🎊</Text>
                  </View>
                  {/* Title */}
                  <Text style={bc.titleSub}>HAPPY</Text>
                  <Text style={bc.titleMain}>BIRTHDAY</Text>
                  {/* Gold shimmer line */}
                  <LinearGradient colors={['transparent','#F59E0B','#FCD34D','#F59E0B','transparent']} style={bc.shimmer} start={{x:0,y:0}} end={{x:1,y:0}} />
                  {/* Avatar with gold ring */}
                  <View style={bc.avatarRing}>
                    <LinearGradient colors={['#F59E0B','#FCD34D','#F59E0B']} style={bc.avatarG} start={{x:0,y:0}} end={{x:1,y:1}}>
                      <Text style={bc.avatarLetter}>{birthdayCard.name.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                  </View>
                  {/* Student info */}
                  <Text style={bc.studentName}>{birthdayCard.name}</Text>
                  <View style={bc.classBadge}>
                    <Text style={bc.classText}>{birthdayCard.class} · Roll No. {birthdayCard.rollNumber}</Text>
                  </View>
                  {/* Message */}
                  <View style={bc.messageBox}>
                    <Text style={bc.msg1}>🎈 Wishing you a fantastic birthday filled with joy, laughter, and endless success!</Text>
                    <View style={bc.msgDivider} />
                    <Text style={bc.msg2}>🏆 May this year bring great happiness and remarkable achievements.</Text>
                  </View>
                  {/* School footer */}
                  <View style={bc.schoolRow}>
                    <Text style={bc.schoolEmoji}>🏫</Text>
                    <View style={{flex:1}}>
                      <Text style={bc.schoolName}>{SCHOOL_INFO.name}</Text>
                      <Text style={bc.schoolContact}>📞 {SCHOOL_INFO.contact}</Text>
                    </View>
                    <View style={bc.bottomStars}>
                      {['⭐','✨','🌟'].map((em, i) => (
                        <Text key={i} style={{fontSize: i === 2 ? 13 : 11}}>{em}</Text>
                      ))}
                    </View>
                  </View>
                                </View>
                {/* Action buttons */}
                <View style={bc.actions}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={birthdaySharing}
                    onPress={async () => {
                      if (birthdaySharing) return;
                      setBirthdaySharing(true);
                      try {
                        console.log('[BirthdayShare] ── Starting share flow for:', birthdayCard.name);
                        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        await sendBirthdayCard(birthdayCard);
                        console.log('[BirthdayShare] ── Flow finished, closing modal');
                        setBirthdayCard(null);
                      } catch (err: any) {
                        console.error('[BirthdayShare] ── Unhandled error:', err?.message ?? err, err);
                        Alert.alert('Sharing Error', err?.message ?? 'An unexpected error occurred. Please try again.');
                        // Stay on the modal — do NOT navigate away
                      } finally {
                        setBirthdaySharing(false);
                      }
                    }}
                    style={bc.whatsappBtn}
                  >
                    <LinearGradient colors={['#128C7E','#25D366']} style={bc.whatsappGrad} start={{x:0,y:0}} end={{x:1,y:0}}>
                      <Feather name="message-circle" size={20} color="#fff" />
                      <Text style={bc.whatsappTxt}>{birthdaySharing ? 'Preparing…' : 'Send on WhatsApp'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity style={bc.closeBtn} onPress={() => setBirthdayCard(null)} activeOpacity={0.75}>
                    <Feather name="x" size={16} color="rgba(255,255,255,0.6)" />
                    <Text style={bc.closeTxt}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Overview styles ──────────────────────────────────────────────────────────
const ov = StyleSheet.create({
  monthBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EEF2FF', borderRadius: 20, borderWidth: 1, borderColor: '#C7D2FE',
    paddingHorizontal: 12, paddingVertical: 6,
  },
  monthTxt: { fontSize: 12, color: '#4F46E5', fontWeight: '700' },
});

// ─── Quick action row ──────────────────────────────────────────────────────────
const qa_row = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    paddingBottom: 8,
    gap: 0,
    rowGap: 16,
    shadowColor: '#0C1F4A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
});

// ─── Attendance styles ─────────────────────────────────────────────────────────
const att = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#0C1F4A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3, gap: 14,
  },
  barBg: { height: 8, borderRadius: 8, flexDirection: 'row', overflow: 'hidden', backgroundColor: '#F1F5F9' },
  barSeg: { borderRadius: 0 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  div: { width: 1, height: 36, backgroundColor: '#E2E8F0' },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLbl: { fontSize: 11, color: '#64748B', fontWeight: '600' },
});

// ─── Birthday styles ───────────────────────────────────────────────────────────
const bday = StyleSheet.create({
  // Hero card (today's birthday) on dashboard
  heroWrap: {
    borderRadius: 24, overflow: 'hidden', marginBottom: 4,
    shadowColor: '#EC4899', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 12,
  },
  heroGrad:        { padding: 20, overflow: 'hidden' },
  heroSheen:       { position:'absolute', top:0, left:0, right:0, height:'55%', backgroundColor:'rgba(255,255,255,0.14)', borderRadius:24 },
  heroAvatar: {
    width: 62, height: 62, borderRadius: 21, flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.55)',
  },
  heroAvatarLetter: { fontSize: 27, fontWeight: '900', color: '#fff' },
  heroLabel:  { fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  heroName:   { fontSize: 21, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  heroMeta:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  heroBtn: {
    flex: 1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.38)', paddingVertical: 11,
  },
  heroBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // No-birthday-today placeholder card
  noTodayWrap: {
    borderRadius: 20, overflow: 'hidden',
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
  },
  noTodayGrad: { flexDirection:'row', alignItems:'center', gap:14, padding:18 },
  noTodayIcon: {
    width:52, height:52, borderRadius:18, alignItems:'center', justifyContent:'center',
    backgroundColor:'rgba(168,85,247,0.12)', borderWidth:1.5, borderColor:'rgba(168,85,247,0.22)',
  },
  noTodayTitle: { fontSize: 15, fontWeight: '800', color: '#4C1D95' },
  noTodayMeta:  { fontSize: 12, color: '#7C3AED', marginTop: 3 },

  // All-birthdays modal cards
  modalCard:     { borderRadius: 18, overflow: 'hidden', marginBottom: 10 },
  modalCardGrad: { padding: 14, overflow: 'hidden' },
  modalCardSheen:{ position:'absolute', top:0, left:0, right:0, height:'50%', backgroundColor:'rgba(255,255,255,0.12)' },
  modalAvatar: {
    width: 46, height: 46, borderRadius: 15, flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems:'center', justifyContent:'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
  },
  modalAvatarToday: { backgroundColor:'rgba(255,255,255,0.28)', borderColor:'rgba(255,255,255,0.6)' },
  modalAvatarTxt:   { fontSize: 19, fontWeight: '800', color: '#fff' },
  modalTodayLabel:  { fontSize: 9, color: '#FFD6EF', fontWeight: '800', letterSpacing: 1.5, marginBottom: 3 },
  modalName:    { fontSize: 15, fontWeight: '800', color: '#fff' },
  modalMeta:    { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  modalDaysBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  modalDaysBadgeToday: { backgroundColor:'rgba(255,60,172,0.35)', borderColor:'rgba(255,182,222,0.5)' },
  modalDaysTxt: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  modalActionBtn:  { flex:1, borderRadius: 14, overflow: 'hidden' },
  modalActionGrad: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:9 },
  modalActionTxt:  { color: '#fff', fontSize: 12, fontWeight: '700' },
});

// ─── Activity card ─────────────────────────────────────────────────────────────
const act = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#0C1F4A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
});

// ─── DB status chip styles ─────────────────────────────────────────────────────
const dbs = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 6,
    marginHorizontal: 16, marginTop: 10, alignSelf: 'flex-start',
    shadowColor: '#0C1F4A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  name: { fontSize: 11, fontWeight: '700', maxWidth: 180 },
});

// ─── Branding modal styles ─────────────────────────────────────────────────────
const bm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 24, paddingTop: 4, maxHeight: '92%', minHeight: '70%',
  },
  handle: { width: 38, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginVertical: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 17, fontWeight: '800', color: '#0C1F4A', letterSpacing: -0.3 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 11, marginBottom: 16 },
  introIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  desc: { flex: 1, fontSize: 11, color: '#475569', lineHeight: 16 },
  sectionLabel: { marginBottom: 8, marginTop: 3 },
  sectionEyebrow: { fontSize: 9, color: '#94A3B8', fontWeight: '800', letterSpacing: 1.2 },
  sectionTitle: { fontSize: 13, color: '#0C1F4A', fontWeight: '800', marginTop: 2 },
  assetCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 10, marginBottom: 16 },
  signatureCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 10, marginBottom: 8 },
  assetCopy: { flex: 1, minWidth: 0 },
  roleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  sigIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  preview: {
    width: 70, height: 70, borderRadius: 14, backgroundColor: '#F8FAFC',
    borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logoPreview: { width: 64, height: 64, backgroundColor: '#fff' },
  logoImg: { width: 60, height: 60 },
  signImg: { width: 100, height: 48 },
  assetTitle: { fontSize: 14, fontWeight: '800', color: '#0C1F4A' },
  assetHint: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2563EB',
    borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7,
  },
  uploadTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  removeTxt: { color: '#DC2626', fontSize: 11, fontWeight: '700' },
});

// ─── Logout modal styles ───────────────────────────────────────────────────────
const lm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, alignItems: 'center',
  },
  avatarWrap: { marginBottom: 12 },
  avatar: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 28, fontWeight: '800', color: '#fff' },
  name: { fontSize: 20, fontWeight: '800', color: '#0C1F4A' },
  role: { fontSize: 13, color: '#C8A040', fontWeight: '700', marginTop: 2 },
  school: { fontSize: 12, color: '#64748B', marginTop: 4, textAlign: 'center' },
  divider: { width: '100%', height: 1, backgroundColor: '#F1F5F9', marginVertical: 20 },
  dbStatusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    width: '100%', marginBottom: 12,
  },
  dbStatusDot: { width: 7, height: 7, borderRadius: 4 },
  dbStatusTxt: { flex: 1, fontSize: 12, fontWeight: '700' },
  dbBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F8FAFC', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
    width: '100%', marginBottom: 10,
    borderWidth: 1.5, borderColor: '#D7DFEE',
  },
  dbBtnIcon: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  dbBtnTxt: { flex: 1, color: '#1E40AF', fontSize: 15, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EF4444', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32,
    width: '100%', justifyContent: 'center', marginBottom: 10,
  },
  logoutTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  credBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F5F3FF', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
    width: '100%', marginBottom: 10,
    borderWidth: 1.5, borderColor: '#DDD6FE',
  },
  credBtnIcon: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center',
  },
  credBtnTxt: { flex: 1, color: '#6D28D9', fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 12 },
  cancelTxt: { color: '#64748B', fontSize: 15, fontWeight: '600' },
});

// ─── Change credentials modal styles ──────────────────────────────────────────
const cm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#0C1F4A' },
  closeBtn: { padding: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 6 },
  optional: { fontWeight: '500', color: '#CBD5E1' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14,
    backgroundColor: '#F8FAFC', paddingHorizontal: 14, paddingVertical: 13,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#0F172A' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginTop: 14,
    borderWidth: 1, borderColor: '#FECACA',
  },
  errorTxt: { flex: 1, fontSize: 13, color: '#DC2626', fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#7C3AED', borderRadius: 16, paddingVertical: 15,
    width: '100%', marginTop: 20,
  },
  saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', width: '100%' },
  cancelTxt: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  successBox: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  successTitle: { fontSize: 20, fontWeight: '800', color: '#0C1F4A' },
  successSub: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  doneBtn: {
    backgroundColor: '#16A34A', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40,
    marginTop: 10,
  },
  doneBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

// ─── Birthday card modal styles ────────────────────────────────────────────────
const bc = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(5,0,20,0.94)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  container: { width: '100%', maxWidth: 380, alignItems: 'center', gap: 10 },

  card: {
    width: '100%', borderRadius: 24, overflow: 'hidden', padding: 18, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 12,
  },
  topAccent: { width: '100%', height: 2, marginBottom: 12 },
  orb1: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(124,58,237,0.22)', top: -40, right: -35 },
  orb2: { position: 'absolute', width: 80,  height: 80,  borderRadius: 40, backgroundColor: 'rgba(245,158,11,0.12)', bottom: 30, left: -25 },
  orb3: { position: 'absolute', width: 55,  height: 55,  borderRadius: 28, backgroundColor: 'rgba(236,72,153,0.18)', top: 50, left: 8 },

  sparkleRow: { flexDirection: 'row', gap: 5, marginBottom: 6 },
  sparkleDot: { fontSize: 10, color: 'rgba(252,211,77,0.8)' },

  emojiRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  sideEmoji: { fontSize: 20 },
  mainEmoji: { fontSize: 38 },

  titleSub:  { fontSize: 11, fontWeight: '800', color: 'rgba(252,211,77,0.7)', letterSpacing: 8, marginBottom: 2 },
  titleMain: { fontSize: 26, fontWeight: '900', color: '#FCD34D', letterSpacing: 5, textAlign: 'center', marginBottom: 6 },

  shimmer: { width: '80%', height: 1.5, marginVertical: 10 },

  avatarRing: {
    width: 70, height: 70, borderRadius: 35, padding: 3,
    backgroundColor: '#F59E0B', marginBottom: 8,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
  },
  avatarG:      { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 26, fontWeight: '900', color: '#fff' },

  studentName: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 4 },
  classBadge:  {
    backgroundColor: 'rgba(245,158,11,0.18)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3,
    marginBottom: 10, borderWidth: 1, borderColor: 'rgba(252,211,77,0.35)',
  },
  classText: { fontSize: 11, color: '#FCD34D', fontWeight: '700' },

  messageBox: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 11,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 6,
  },
  msg1:       { fontSize: 12, color: 'rgba(255,255,255,0.88)', textAlign: 'center', lineHeight: 18, marginBottom: 6 },
  msgDivider: { width: '40%', height: 1, backgroundColor: 'rgba(252,211,77,0.3)', alignSelf: 'center', marginBottom: 6 },
  msg2:       { fontSize: 11.5, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 17 },

  schoolRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, width: '100%' },
  schoolEmoji:   { fontSize: 17 },
  schoolName:    { fontSize: 11, fontWeight: '800', color: '#F59E0B', letterSpacing: 0.3 },
  schoolContact: { fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 1 },

  bottomStars: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  actions:    { width: '100%', gap: 8 },
  whatsappBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  whatsappGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  whatsappTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  closeTxt:   { color: 'rgba(255,255,255,0.55)', fontWeight: '600', fontSize: 13 },
});

// ─── Finance Detail Panel styles ───────────────────────────────────────────────
const fp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#F8FAFC' },
  sheet: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  handle: { display: 'none' as any },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0C1F4A', letterSpacing: -0.3, textAlign: 'center' },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  pillsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  pillOn: { backgroundColor: '#EFF6FF', borderColor: '#C8A040' },
  pillTxt: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  pillTxtOn: { color: '#1E3A8A' },
  customRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  customLbl: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  customField: {
    height: 38, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 10, fontSize: 13, color: '#0C1F4A', backgroundColor: '#F8FAFC',
  },
  summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  sumCard: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 11,
    overflow: 'hidden', borderWidth: 1.5, borderColor: 'transparent',
  },
  sumCardOn: {
    backgroundColor: '#fff', borderColor: '#E2E8F0',
    shadowColor: '#0C1F4A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  sumIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  sumAmt: { fontSize: 15, fontWeight: '800', color: '#0C1F4A', letterSpacing: -0.4, marginBottom: 2 },
  sumLbl: { fontSize: 9, color: '#64748B', fontWeight: '600' },
  sumStrip: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },
  chartCard: {
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14,
  },
  chartTitle: { fontSize: 13, fontWeight: '800', color: '#0C1F4A', marginBottom: 6 },
  txnCard: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 12,
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  txnBorder: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  txnIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  txnTitle: { fontSize: 13, fontWeight: '700', color: '#0C1F4A' },
  txnSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  txnAmt: { fontSize: 13, fontWeight: '800' },
  txnDate: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 30, gap: 10 },
  emptyTxt: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
});
