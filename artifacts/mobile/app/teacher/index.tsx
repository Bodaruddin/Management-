import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform,
  Modal, TextInput, Animated, Linking, useWindowDimensions, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Ellipse, Circle, Path, Polygon, Line, G } from 'react-native-svg';
import { SCHOOL_INFO } from '@/constants/schoolInfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { useApp, Student, alumniToStudent, isActiveStudent } from '@/context/AppContext';
import { isBirthdayToday, daysUntilBirthday, extractMMDD } from '@/utils/dateUtils';
import { sendBirthdayCardWhatsApp, sendReminderWhatsApp } from '@/utils/reminder';
import PremiumAlert from '@/components/PremiumAlert';

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcFinalPayable(annualFee: string, discountType: 'fixed' | 'percent', discountValue: string) {
  const fee = Number(annualFee) || 0;
  const disc = Number(discountValue) || 0;
  if (fee === 0) return 0;
  const discAmt = discountType === 'percent' ? Math.round((fee * disc) / 100) : disc;
  return Math.max(0, fee - discAmt);
}
function genAdmissionNo(count: number): string {
  return `ADM${new Date().getFullYear()}${String(count).padStart(4, '0')}`;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const H_START  = '#1A237E';
const H_MID    = '#3B5BDB';
const H_END    = '#748FFC';
const H_PAD    = 16;
const GRID_GAP = 10;
const COLS     = 3;

// ── School illustration ───────────────────────────────────────────────────────
function SchoolIllustration() {
  return (
    <Svg width={88} height={72} viewBox="0 0 160 130">
      <Ellipse cx={30} cy={25} rx={18} ry={10} fill="rgba(255,255,255,0.25)" />
      <Ellipse cx={46} cy={19} rx={14} ry={8}  fill="rgba(255,255,255,0.18)" />
      <Ellipse cx={132} cy={28} rx={16} ry={9} fill="rgba(255,255,255,0.18)" />
      {/* trees */}
      <Rect x={8}   y={92} width={8} height={24} rx={2} fill="#2F9E44" />
      <Ellipse cx={12} cy={86} rx={14} ry={18}  fill="#40C057" />
      <Rect x={142} y={92} width={8} height={24} rx={2} fill="#2F9E44" />
      <Ellipse cx={146} cy={86} rx={14} ry={18} fill="#40C057" />
      {/* building */}
      <Rect x={30} y={60} width={100} height={60} rx={3} fill="rgba(255,255,255,0.88)" />
      <Polygon points="25,62 80,30 135,62" fill="white" opacity={0.92} />
      {/* flag */}
      <Rect x={78} y={18} width={3} height={14} fill="#868E96" />
      <Polygon points="81,18 92,22 81,26" fill="#E03131" />
      {/* clock */}
      <Circle cx={80} cy={50} r={10} fill="white" stroke="#CED4DA" strokeWidth={1.5} />
      <Line x1={80} y1={45} x2={80} y2={50} stroke="#495057" strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={80} y1={50} x2={84} y2={50} stroke="#495057" strokeWidth={1.8} strokeLinecap="round" />
      {/* windows */}
      <Rect x={42} y={70} width={18} height={14} rx={2} fill="#74C0FC" opacity={0.75} />
      <Rect x={70} y={70} width={18} height={14} rx={2} fill="#74C0FC" opacity={0.75} />
      <Rect x={98} y={70} width={18} height={14} rx={2} fill="#74C0FC" opacity={0.75} />
      {/* door */}
      <Rect x={68} y={90} width={22} height={30} rx={3} fill="#4DABF7" opacity={0.82} />
      <Circle cx={85} cy={107} r={2} fill="white" />
      <Rect x={0} y={118} width={160} height={12} fill="rgba(255,255,255,0.1)" />
    </Svg>
  );
}

// ── Mini sparkline chart ──────────────────────────────────────────────────────
function MiniSparkline({ color, values }: { color: string; values: number[] }) {
  const W = 60, H = 26;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => ({
    x: (i / Math.max(values.length - 1, 1)) * W,
    y: H - 4 - (v / max) * (H - 8),
  }));
  const pathD = pts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
  ).join(' ');
  const areaD = `${pathD} L${W},${H} L0,${H} Z`;
  const last  = pts[pts.length - 1];
  return (
    <Svg width={W} height={H}>
      <Path d={areaD} fill={color} opacity={0.12} />
      <Path d={pathD} stroke={color} strokeWidth={2} fill="none"
        strokeLinecap="round" strokeLinejoin="round" opacity={0.65} />
      <Circle cx={last.x} cy={last.y} r={3} fill={color} opacity={0.9} />
    </Svg>
  );
}

// ── Animated press card ───────────────────────────────────────────────────────
function AnimatedCard({ children, style, onPress }: {
  children: React.ReactNode; style?: any; onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(scale, {
    toValue: 0.93, useNativeDriver: true, speed: 60, bounciness: 0,
  }).start();
  const onOut = () => Animated.spring(scale, {
    toValue: 1, useNativeDriver: true, speed: 28, bounciness: 8,
  }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Age from date of birth ────────────────────────────────────────────────────
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

// ── Birthday confetti (SVG scatter) ──────────────────────────────────────────
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
        <Rect
          key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={2}
          fill={p.fill}
          transform={`rotate(${p.r} ${p.x + p.w / 2} ${p.y + p.h / 2})`}
        />
      ))}
    </Svg>
  );
}

// ── Avatar initials bubble ────────────────────────────────────────────────────
const BUBBLE_COLORS = ['#8B5CF6','#3B82F6','#10B981','#F59E0B','#F43F5E','#06B6D4','#F97316'];
function AvatarBubble({
  name, size = 44, fontSize = 16,
}: { name: string; size?: number; fontSize?: number }) {
  const initials = name.split(' ').map((w: string) => w[0] ?? '').slice(0, 2).join('').toUpperCase();
  const color    = BUBBLE_COLORS[name.charCodeAt(0) % BUBBLE_COLORS.length];
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize, fontWeight: '700', color: '#fff' }}>{initials}</Text>
    </View>
  );
}

// ── Quick-action definitions ──────────────────────────────────────────────────
// permKey = undefined  → always accessible
// permKey = string     → always shown; locked (grayed + lock icon) unless teacher has that permission
const ACTIONS: {
  label: string; sub: string;
  grad: [string, string];
  icon: React.ComponentProps<typeof Feather>['name'];
  route?: string;
  actionKey?: string;
  permKey?: string;
}[] = [
  // ── Always-accessible ──
  { label: 'Attendance',   sub: 'Mark & View',     grad: ['#8B5CF6','#A855F7'], icon: 'check-square',    route: '/teacher/attendance' },
  { label: 'Enter Marks',  sub: 'Add & Manage',    grad: ['#F59E0B','#FBBF24'], icon: 'edit-2',          route: '/teacher/marks',   permKey: 'manageResults' },
  { label: 'View Salary',  sub: 'Details',         grad: ['#10B981','#34D399'], icon: 'credit-card',     route: '/teacher/salary' },
  // ── Permission-gated (all 6 always rendered; locked when no access) ──
  { label: 'Collect Fee',  sub: 'Add & View',      grad: ['#F43F5E','#FB7185'], icon: 'dollar-sign',     route: '/teacher/fees',    permKey: 'feeCollection',   actionKey: 'feeCollection' },
  { label: 'Add Student',  sub: 'New Admission',   grad: ['#3B82F6','#60A5FA'], icon: 'user-plus',                                  permKey: 'addStudent',      actionKey: 'addStudent' },
  { label: 'Classes',      sub: 'Manage',          grad: ['#6366F1','#818CF8'], icon: 'layers',          route: '/teacher/classes', permKey: 'manageClasses' },
  { label: 'Exams',        sub: 'Create & Manage', grad: ['#0EA5E9','#38BDF8'], icon: 'book-open',       route: '/teacher/exams',   permKey: 'manageExams' },
  { label: 'Promote',      sub: 'Promote Class',   grad: ['#06B6D4','#22D3EE'], icon: 'arrow-up-circle', route: '/teacher/promote', permKey: 'promoteStudents', actionKey: 'promoteStudents' },
  { label: 'Fee Reminder', sub: 'Send Reminder',   grad: ['#F97316','#FB923C'], icon: 'send',            route: '/teacher/fees?tab=reminder', permKey: 'sendFeeReminder' },
];

const EMPTY_STUDENT = {
  name: '', fatherName: '', motherName: '', mobileNumber: '',
  class: '', section: '', admissionNo: '',
  rollNumber: '', dateOfBirth: '', address: '', photo: '' as string,
  annualFee: '', discountType: 'fixed' as 'fixed' | 'percent', discountValue: '',
};

// ── Main component ────────────────────────────────────────────────────────────
export default function TeacherDashboard() {
  const insets = useSafeAreaInsets();
  const { user, isLoading, logout } = useAuth();
  const { students, exams, classes, sections, attendanceRecords, alumni, addStudent, addSection, updateSection, deleteSection } = useApp();
  const signingOutRef = useRef(false);

  const [showProfile,     setShowProfile]     = useState(false);
  const [showAddStudent,        setShowAddStudent]        = useState(false);
  const [showClassPicker,       setShowClassPicker]       = useState(false);
  const [classSearch,           setClassSearch]           = useState('');
  const [showSectionPicker,     setShowSectionPicker]     = useState(false);
  const [showSectionsMgr,       setShowSectionsMgr]       = useState(false);
  const [formPausedForSections, setFormPausedForSections] = useState(false);
  const [newSectionName,        setNewSectionName]        = useState('');
  const [editingSectionName,    setEditingSectionName]    = useState<string | null>(null);
  const [editingSectionValue,   setEditingSectionValue]   = useState('');
  const [sectionLoading,        setSectionLoading]        = useState(false);
  const [confirmDeleteSection,  setConfirmDeleteSection]  = useState<string | null>(null);
  const [studentForm,           setStudentForm]           = useState(EMPTY_STUDENT);
  const [blockedAction,   setBlockedAction]    = useState<null | {
    label: string; icon: React.ComponentProps<typeof Feather>['name'];
    grad: [string, string];
  }>(null);
  const [birthdayCard,    setBirthdayCard]     = useState<Student | null>(null);
  const [birthdaySharing, setBirthdaySharing]  = useState(false);
  const birthdayCardRef = useRef<View>(null);
  const [showMonthBirthdays, setShowMonthBirthdays] = useState(false);
  const [showStudentSuccess, setShowStudentSuccess] = useState(false);

  // ── Stable values needed by hooks below (must be before early-return) ───────
  const now      = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const upcomingExams = useMemo(() =>
    exams.filter(e => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3),
    [exams, todayStr],
  );

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

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      // Sign-out navigates explicitly after clearing auth. Skipping this
      // redirect during that transition prevents two competing replaces
      // from remounting the nested teacher stack into the error boundary.
      if (!signingOutRef.current) router.replace('/login');
      return;
    }
    if (user.role === 'admin') router.replace('/(tabs)');
  }, [isLoading, user]);

  if (isLoading || !user || user.role !== 'teacher') return null;

  // ── Time & greeting ─────────────────────────────────────────────────────────
  const hour     = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dateLabel = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
    const visibleStudentIds = new Set(students.map(student => student.id));
    const todayRecords        = attendanceRecords.filter(r => r.date === todayStr && visibleStudentIds.has(r.studentId));
  const presentCount        = todayRecords.filter(r => r.status === 'present').length;
  const absentCount         = todayRecords.filter(r => r.status === 'absent').length;
   const todayAttendanceTaken = attendanceRecords.some(
     a => a.date === todayStr && a.takenBy === user.name && visibleStudentIds.has(a.studentId),
  );

  const initials = user.name
    .split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  // ── Handlers ────────────────────────────────────────────────────────────────
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

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setStudentForm(prev => ({ ...prev, photo: 'data:image/jpeg;base64,' + result.assets[0].base64 }));
    }
  };

  const handleAddSectionTeacher = async () => {
    if (!newSectionName.trim()) return;
    setSectionLoading(true);
    try { await addSection(newSectionName.trim()); setNewSectionName(''); }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Failed to add section'); }
    finally { setSectionLoading(false); }
  };
  const handleUpdateSectionTeacher = async (oldName: string) => {
    if (!editingSectionValue.trim()) return;
    setSectionLoading(true);
    try {
      const newName = editingSectionValue.trim();
      await updateSection(oldName, newName);
      setStudentForm(prev => prev.section === oldName ? { ...prev, section: newName } : prev);
      setEditingSectionName(null);
    }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Failed to update section'); }
    finally { setSectionLoading(false); }
  };
  const handleDeleteSectionTeacher = async () => {
    if (!confirmDeleteSection) return;
    const name = confirmDeleteSection;
    setSectionLoading(true);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await deleteSection(name);
      setStudentForm(prev => prev.section === name ? { ...prev, section: '' } : prev);
      setConfirmDeleteSection(null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to delete section');
    } finally {
      setSectionLoading(false);
    }
  };

  const handleAddStudentSubmit = async () => {
    if (!studentForm.name.trim() || !studentForm.fatherName.trim() || !studentForm.class || !studentForm.rollNumber.trim()) {
      Alert.alert('Validation', 'Name, Father Name, Class and Roll Number are required');
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const annualFeeNum = studentForm.annualFee ? Number(studentForm.annualFee) : undefined;
    addStudent({
      name:         studentForm.name.trim(),
      fatherName:   studentForm.fatherName.trim(),
      motherName:   studentForm.motherName.trim(),
      mobileNumber: studentForm.mobileNumber.trim(),
      class:        studentForm.class,
      section:      studentForm.section || undefined,
      admissionNo:  studentForm.admissionNo || undefined,
      rollNumber:   studentForm.rollNumber.trim(),
      dateOfBirth:  studentForm.dateOfBirth.trim() || `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`,
      address:      studentForm.address || undefined,
      photo:        studentForm.photo || undefined,
      annualFee:    annualFeeNum,
      discountType: annualFeeNum ? studentForm.discountType : undefined,
      discountValue: (annualFeeNum && studentForm.discountValue) ? Number(studentForm.discountValue) : undefined,
    });
    setStudentForm({ ...EMPTY_STUDENT, admissionNo: genAdmissionNo(students.length + 2) });
    setShowAddStudent(false);
    setShowStudentSuccess(true);
  };


  // ── Responsive dimensions ────────────────────────────────────────────────────
  const { width: screenW } = useWindowDimensions();
  const ITEM_W = Math.floor((screenW - H_PAD * 2 - GRID_GAP * (COLS - 1)) / COLS);
  const STAT_W = (screenW - H_PAD * 2 - GRID_GAP) / 2;

  // ── Action items: all 9 rendered, permission ones show lock when disabled ────
  const actionItems = ACTIONS.map(a => ({
    ...a,
    disabled: a.permKey
      ? !(user.permissions?.[a.permKey as keyof typeof user.permissions] ?? false)
      : false,
  }));

  const topPad = Platform.OS === 'web' ? 24 : insets.top;
  const botPad = Platform.OS === 'web' ? 48 : insets.bottom + 24;

  // Decorative sparkline data (reflects current values as trailing bar)
  const sparks = {
    present: [4, 7, 5, 9, 6, presentCount || 8],
    absent:  [2, 4, 3, 5, 2, absentCount  || 2],
    exams:   [1, 3, 2, 4, 2, upcomingExams.length || 2],
    classes: [4, 6, 5, 7, 5, classes.length || 6],
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingBottom: botPad }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#050D2D', '#0D2060', '#1A3A9C']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.headerGrad, { paddingTop: topPad + 14 }]}
      >
        {/* Decorative ambient orbs */}
        <View style={s.headerOrb1} />
        <View style={s.headerOrb2} />
        <View style={s.headerOrb3} />

        {/* Top bar */}
        <View style={s.topBar}>
          <View style={s.schoolBadge}>
            <Image
              source={require('../../assets/images/school-logo.png')}
              style={s.schoolLogo}
              resizeMode="contain"
            />
            <Text style={s.schoolName}>DR. APJ ABDUL KALAM{'\n'}JATIYA VIDYALAYA</Text>
          </View>
          <TouchableOpacity style={s.avatar} onPress={() => setShowProfile(true)} activeOpacity={0.8}>
            <Text style={s.avatarTxt}>{initials}</Text>
            <View style={s.onlineDot} />
          </TouchableOpacity>
        </View>

        {/* Greeting hero row */}
        <View style={s.heroRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={s.greetingTxt}>{greeting} 👋</Text>
            <Text style={s.heroName} numberOfLines={1}>{user.name}</Text>
            <View style={s.dateChip}>
              <Feather name="calendar" size={11} color="rgba(255,255,255,0.9)" />
              <Text style={s.dateTxt}>{dateLabel}</Text>
            </View>
          </View>
          <SchoolIllustration />
        </View>

        <View style={{ height: 36 }} />
      </LinearGradient>

      {/* ── ATTENDANCE CARD (overlapping header) ────────────────────────────── */}
      {todayAttendanceTaken ? (
        <View style={[s.attCard, { shadowColor: '#10B981' }]}>
          <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={s.attInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <LinearGradient colors={['#10B981', '#059669']} style={s.attIconCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather name="check-circle" size={22} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[s.attTitle, { color: '#065F46' }]}>Attendance Submitted ✓</Text>
              <Text style={[s.attSub, { color: '#047857' }]}>You've marked today's attendance successfully.</Text>
            </View>
          </LinearGradient>
        </View>
      ) : (
        <View style={[s.attCard, { shadowColor: '#F59E0B' }]}>
          <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={s.attInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <LinearGradient colors={['#F59E0B', '#D97706']} style={s.attIconCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Feather name="alert-circle" size={22} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[s.attTitle, { color: '#92400E' }]}>Attendance Pending</Text>
              <Text style={[s.attSub, { color: '#B45309' }]}>Please mark today's attendance now</Text>
              <TouchableOpacity style={s.markBtn} activeOpacity={0.85} onPress={() => router.push('/teacher/attendance' as any)}>
                <LinearGradient colors={[H_MID, H_END]} style={s.markBtnInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Feather name="check-square" size={13} color="#fff" />
                  <Text style={s.markBtnTxt}>Mark Attendance</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
      <View style={s.content}>

        {/* Today's Summary */}
        <View style={s.sectionRow}>
          <View style={s.sectionLabelRow}>
            <View style={[s.sectionAccent, { backgroundColor: '#10B981' }]} />
            <Text style={s.sectionTitle}>Today's Summary</Text>
          </View>
        </View>
        <View style={s.statsGrid}>
          {([
            { label: 'Present Students', num: presentCount,        color: '#10B981', icon: 'users'     as const, spark: sparks.present },
            { label: 'Absent Students',  num: absentCount,         color: '#F59E0B', icon: 'user-x'    as const, spark: sparks.absent  },
            { label: 'Upcoming Exams',   num: upcomingExams.length, color: '#6366F1', icon: 'book-open' as const, spark: sparks.exams   },
            { label: "Today's Classes",  num: classes.length,       color: '#8B5CF6', icon: 'layers'    as const, spark: sparks.classes },
          ] as const).map(item => (
            <View key={item.label} style={[s.statCard, { shadowColor: item.color }]}>
              <View style={s.statTop}>
                <LinearGradient colors={[item.color, item.color + 'BB']} style={s.statIconGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Feather name={item.icon} size={17} color="#fff" />
                </LinearGradient>
                <MiniSparkline color={item.color} values={item.spark} />
              </View>
              <Text style={[s.statNum, { color: item.color }]}>{item.num}</Text>
              <Text style={s.statLbl}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <View style={s.sectionRow}>
          <View style={s.sectionLabelRow}>
            <View style={[s.sectionAccent, { backgroundColor: '#8B5CF6' }]} />
            <Text style={s.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={s.chip}>
            <Feather name="grid" size={11} color={H_MID} />
            <Text style={s.chipTxt}>All</Text>
          </View>
        </View>

        <View style={s.grid}>
          {actionItems.map(a => (
            <AnimatedCard
              key={a.label}
              style={{ width: ITEM_W }}
              onPress={async () => {
                if (a.disabled) {
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  setBlockedAction({ label: a.label, icon: a.icon, grad: a.grad });
                  return;
                }
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (a.actionKey === 'addStudent') {
                  setStudentForm({ ...EMPTY_STUDENT, admissionNo: genAdmissionNo(students.length + 1) });
                  setShowAddStudent(true);
                  return;
                }
                if (a.route) router.push(a.route as any);
              }}
            >
              <View style={s.gridItem}>
                <LinearGradient
                  colors={a.grad}
                  style={s.gridIconGrad}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                  <Feather name={a.icon} size={22} color="#fff" />
                </LinearGradient>
                <Text style={s.gridLabel} numberOfLines={1}>{a.label}</Text>
                <Text style={s.gridSub} numberOfLines={1}>{a.sub}</Text>
              </View>
            </AnimatedCard>
          ))}
        </View>

        {/* Birthdays */}
        <>
          <View style={[s.sectionRow, { marginTop: 28 }]}>
            <View style={s.sectionLabelRow}>
              <View style={[s.sectionAccent, { backgroundColor: '#EC4899' }]} />
              <Text style={s.sectionTitle}>
                {birthdayStudents.length > 0 ? '🎂 Birthdays Today' : '🎁 Birthdays'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowMonthBirthdays(true)} activeOpacity={0.82} style={{ borderRadius:20, overflow:'hidden' }}>
              <LinearGradient colors={['#EC4899','#8B5CF6']} style={s.bdayViewBtn} start={{x:0,y:0}} end={{x:1,y:0}}>
                <Text style={s.bdayViewBtnTxt}>View All</Text>
                <Feather name="chevron-right" size={12} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {birthdayStudents.length > 0 ? (
            birthdayStudents.map(st => (
              <View key={`today-${st.id}`} style={s.bdayHeroWrap}>
                <LinearGradient colors={['#FF3CAC','#784BA0','#2B86C5']} style={s.bdayHeroGrad} start={{x:0,y:0}} end={{x:1,y:1}}>
                  <View style={s.bdayHeroSheen} />
                  <BdayConfetti />
                  <View style={{ flexDirection:'row', alignItems:'center', gap:14, marginBottom:18 }}>
                    <View style={s.bdayHeroAvatar}>
                      <Text style={s.bdayHeroAvatarLetter}>{st.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={s.bdayHeroLabel}>HAPPY BIRTHDAY 🎂</Text>
                      <Text style={s.bdayHeroName}>{st.name}</Text>
                      <Text style={s.bdayHeroMeta}>{st.class} · Roll {st.rollNumber}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection:'row', gap:10 }}>
                    <TouchableOpacity onPress={() => setBirthdayCard(st)} activeOpacity={0.8} style={s.bdayHeroBtn}>
                      <Feather name="gift" size={14} color="#fff" />
                      <Text style={s.bdayHeroBtnTxt}>Birthday Card</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setBirthdayCard(st)} activeOpacity={0.8} style={s.bdayHeroBtn}>
                      <Feather name="message-circle" size={14} color="#fff" />
                      <Text style={s.bdayHeroBtnTxt}>Send Card PNG</Text>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </View>
            ))
          ) : (
            <View style={bday.noTodayWrap}>
              <LinearGradient colors={['#FAF5FF','#FDF2F8']} style={bday.noTodayGrad} start={{x:0,y:0}} end={{x:1,y:1}}>
                <View style={bday.noTodayIcon}><Text style={{ fontSize:26 }}>🎁</Text></View>
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
        </>

        {/* Upcoming Exams */}
        {upcomingExams.length > 0 && (
          <>
            <View style={[s.sectionRow, { marginTop: 28 }]}>
              <View style={s.sectionLabelRow}>
                <View style={[s.sectionAccent, { backgroundColor: H_MID }]} />
                <Text style={s.sectionTitle}>Upcoming Exams</Text>
              </View>
            </View>
            {upcomingExams.map(exam => (
              <View key={exam.id} style={s.examCard}>
                <LinearGradient colors={[H_MID, H_END]} style={s.examIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Feather name="book-open" size={18} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={s.examName}>{exam.name}</Text>
                  <Text style={s.examMeta}>{exam.class} · {exam.date}</Text>
                </View>
                <View style={s.examBadge}>
                  <Text style={s.examBadgeTxt}>{exam.subjects.length} subj.</Text>
                </View>
              </View>
            ))}
          </>
        )}

      </View>

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
                <View style={bc.card} ref={birthdayCardRef} nativeID="birthday-card-capture">
                  <LinearGradient
                    colors={['#0F0C29','#302B63','#24243E']}
                    style={StyleSheet.absoluteFillObject}
                    start={{x:0,y:0}} end={{x:1,y:1}}
                  />
                  {/* Top gold accent */}
                  <LinearGradient colors={['transparent','#F59E0B','#FCD34D','#F59E0B','transparent']} style={bc.topAccent} start={{x:0,y:0}} end={{x:1,y:0}} />
                  <View style={bc.orb1} /><View style={bc.orb2} /><View style={bc.orb3} />
                  <View style={bc.sparkleRow}>
                    {['✦','✧','✦','✧','✦','✧','✦'].map((sp, i) => (
                      <Text key={i} style={[bc.sparkleDot, {opacity: i % 2 === 0 ? 0.7 : 0.3}]}>{sp}</Text>
                    ))}
                  </View>
                  <View style={bc.emojiRow}>
                    <Text style={bc.sideEmoji}>🎊</Text>
                    <Text style={bc.mainEmoji}>🎂</Text>
                    <Text style={bc.sideEmoji}>🎊</Text>
                  </View>
                  <Text style={bc.titleSub}>HAPPY</Text>
                  <Text style={bc.titleMain}>BIRTHDAY</Text>
                  <LinearGradient colors={['transparent','#F59E0B','#FCD34D','#F59E0B','transparent']} style={bc.shimmer} start={{x:0,y:0}} end={{x:1,y:0}} />
                  <View style={bc.avatarRing}>
                    <LinearGradient colors={['#F59E0B','#FCD34D','#F59E0B']} style={bc.avatarG} start={{x:0,y:0}} end={{x:1,y:1}}>
                      <Text style={bc.avatarLetter}>{birthdayCard.name.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                  </View>
                  <Text style={bc.studentName}>{birthdayCard.name}</Text>
                  <View style={bc.classBadge}>
                    <Text style={bc.classText}>{birthdayCard.class} · Roll No. {birthdayCard.rollNumber}</Text>
                  </View>
                  <View style={bc.messageBox}>
                    <Text style={bc.msg1}>🎈 Wishing you a fantastic birthday filled with joy, laughter, and endless success!</Text>
                    <View style={bc.msgDivider} />
                    <Text style={bc.msg2}>🏆 May this year bring great happiness and remarkable achievements.</Text>
                  </View>
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

      {/* ── PROFILE SHEET ───────────────────────────────────────────────────── */}
      <Modal
        visible={showProfile} animationType="slide" transparent
        onRequestClose={() => setShowProfile(false)}
      >
        <TouchableOpacity style={po.overlay} activeOpacity={1} onPress={() => setShowProfile(false)}>
          <TouchableOpacity style={po.sheet} activeOpacity={1}>
            <View style={po.handle} />
            <LinearGradient
              colors={[H_START, H_MID]}
              style={po.avatarGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Text style={po.avatarTxt}>{initials}</Text>
            </LinearGradient>
            <Text style={po.name}>{user.name}</Text>
            <View style={po.roleBadge}>
              <Text style={po.roleTxt}>Teacher</Text>
            </View>
            <Text style={po.username}>@{user.username}</Text>
            <TouchableOpacity
              style={po.signOutBtn} activeOpacity={0.85}
              onPress={async () => {
                setShowProfile(false);
                signingOutRef.current = true;
                await logout();
                router.replace('/login');
              }}
            >
              <Feather name="log-out" size={17} color="#fff" />
              <Text style={po.signOutTxt}>Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity style={po.cancelBtn} onPress={() => setShowProfile(false)}>
              <Text style={po.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── ADD STUDENT MODAL ───────────────────────────────────────────────── */}
      <Modal visible={showAddStudent} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: '#fff' }]}>
            <View style={[mo.mHeader, { borderBottomColor: '#E2E8F0' }]}>
              <Text style={mo.mTitle}>Add New Student</Text>
              <TouchableOpacity onPress={() => { setShowAddStudent(false); setStudentForm(EMPTY_STUDENT); }}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              {/* Photo */}
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <TouchableOpacity style={mo.photoUpload} onPress={handlePickImage}>
                  {studentForm.photo
                    ? <Image source={{ uri: studentForm.photo }} style={mo.photoImage} />
                    : <><Feather name="camera" size={24} color={H_MID} /><Text style={mo.photoUploadText}>Upload Photo</Text></>}
                </TouchableOpacity>
              </View>

              {/* Admission No — read-only */}
              <View style={{ marginBottom: 14 }}>
                <Text style={mo.mLabel}>Admission No <Text style={{ fontWeight: '400', color: '#94A3B8' }}>(auto-generated)</Text></Text>
                <View style={[mo.mInput, { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F5F9' }]}>
                  <Feather name="hash" size={14} color={H_MID} />
                  <Text style={{ fontSize: 15, color: H_MID, fontWeight: '700', letterSpacing: 0.5 }}>
                    {studentForm.admissionNo || '—'}
                  </Text>
                </View>
              </View>

              {/* Standard fields */}
              {([
                { key: 'name',         label: 'Student Name *',  placeholder: 'Full name' },
                { key: 'fatherName',   label: "Father's Name *", placeholder: "Father's full name" },
                { key: 'motherName',   label: "Mother's Name",   placeholder: "Mother's full name" },
                { key: 'mobileNumber', label: 'Mobile Number',   placeholder: '10-digit mobile', keyboard: 'phone-pad' as const },
                { key: 'rollNumber',   label: 'Roll Number *',   placeholder: 'e.g. 01' },
                { key: 'dateOfBirth',  label: 'Date of Birth',   placeholder: 'DD-MM-YYYY' },
                { key: 'address',      label: 'Address',         placeholder: 'Full residential address' },
              ] as const).map(f => (
                <View key={f.key} style={{ marginBottom: 14 }}>
                  <Text style={mo.mLabel}>{f.label}</Text>
                  <TextInput
                    style={mo.mInput}
                    value={studentForm[f.key]}
                    onChangeText={v => setStudentForm(p => ({ ...p, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor="#94A3B8"
                    keyboardType={(f as any).keyboard ?? 'default'}
                  />
                </View>
              ))}

              {/* Class Picker */}
              <View style={{ marginBottom: 14 }}>
                <Text style={mo.mLabel}>Class *</Text>
                <TouchableOpacity
                  style={[mo.mInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                  onPress={() => { setClassSearch(''); setShowClassPicker(true); }}
                >
                  <Text style={{ color: studentForm.class ? '#0F172A' : '#94A3B8', fontSize: 15 }}>
                    {studentForm.class || 'Select class...'}
                  </Text>
                  <Feather name="chevron-down" size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Section Picker */}
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[mo.mLabel, { marginBottom: 0 }]}>Section</Text>
                  <TouchableOpacity onPress={() => {
                    setShowAddStudent(false);
                    setFormPausedForSections(true);
                    setTimeout(() => setShowSectionsMgr(true), 350);
                  }}>
                    <Text style={{ fontSize: 12, color: H_MID, fontWeight: '600' }}>Manage Sections</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[mo.mInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                  onPress={() => setShowSectionPicker(true)}
                >
                  <Text style={{ color: studentForm.section ? '#0F172A' : '#94A3B8', fontSize: 15 }}>
                    {studentForm.section || 'Select section...'}
                  </Text>
                  <Feather name="chevron-down" size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Fee Details */}
              <View style={mo.feeSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Feather name="dollar-sign" size={16} color={H_MID} />
                  <Text style={mo.feeSectionTitle}>Fee Details</Text>
                </View>
                <View style={{ marginBottom: 14 }}>
                  <Text style={mo.mLabel}>Annual Fee (₹)</Text>
                  <TextInput
                    style={[mo.mInput, { backgroundColor: '#fff' }]}
                    value={studentForm.annualFee}
                    onChangeText={v => setStudentForm(p => ({ ...p, annualFee: v }))}
                    placeholder="e.g. 10000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                  />
                </View>
                {Number(studentForm.annualFee) > 0 && (() => {
                  const finalPayable = calcFinalPayable(studentForm.annualFee, studentForm.discountType, studentForm.discountValue);
                  const discAmt = (Number(studentForm.annualFee) || 0) - finalPayable;
                  const discDisplay = studentForm.discountType === 'percent'
                    ? `${studentForm.discountValue || 0}% = ₹${discAmt.toLocaleString('en-IN')}`
                    : `₹${discAmt.toLocaleString('en-IN')}`;
                  return (
                    <>
                      <Text style={[mo.mLabel, { marginBottom: 8 }]}>Discount Type</Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                        {(['fixed', 'percent'] as const).map(t => (
                          <TouchableOpacity
                            key={t}
                            style={[mo.discBtn, { borderColor: studentForm.discountType === t ? H_MID : '#E2E8F0', backgroundColor: studentForm.discountType === t ? H_MID + '15' : '#fff' }]}
                            onPress={() => setStudentForm(p => ({ ...p, discountType: t }))}
                            activeOpacity={0.8}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: studentForm.discountType === t ? H_MID : '#94A3B8' }}>
                              {t === 'fixed' ? '₹ Fixed Amount' : '% Percentage'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={{ marginBottom: 14 }}>
                        <Text style={mo.mLabel}>Discount {studentForm.discountType === 'percent' ? '(%)' : '(₹)'}</Text>
                        <TextInput
                          style={[mo.mInput, { backgroundColor: '#fff' }]}
                          value={studentForm.discountValue}
                          onChangeText={v => setStudentForm(p => ({ ...p, discountValue: v }))}
                          placeholder={studentForm.discountType === 'percent' ? 'e.g. 10' : 'e.g. 1000'}
                          placeholderTextColor="#94A3B8"
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={mo.feeCalc}>
                        {[
                          { label: 'Annual Fee',    value: `₹${Number(studentForm.annualFee).toLocaleString('en-IN')}`, color: '#0F172A', bold: false },
                          { label: 'Discount',      value: `− ${discDisplay}`,                                           color: '#F59E0B', bold: false },
                          { label: 'Final Payable', value: `₹${finalPayable.toLocaleString('en-IN')}`,                  color: '#10B981', bold: true  },
                        ].map(row => (
                          <View key={row.label} style={[mo.feeCalcRow, { borderBottomColor: '#E2E8F0' }]}>
                            <Text style={{ fontSize: 13, color: '#64748B' }}>{row.label}</Text>
                            <Text style={{ fontSize: 14, fontWeight: row.bold ? '700' : '600', color: row.color }}>{row.value}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  );
                })()}
              </View>
            </ScrollView>
            <View style={[mo.mFooter, { borderTopColor: '#E2E8F0' }]}>
              <TouchableOpacity
                style={[mo.mBtn, { borderColor: '#E2E8F0' }]}
                onPress={() => { setShowAddStudent(false); setStudentForm(EMPTY_STUDENT); }}
              >
                <Text style={{ color: '#0F172A', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[mo.mBtn, { flex: 2, backgroundColor: H_MID, borderColor: H_MID }]}
                onPress={handleAddStudentSubmit}
              >
                <Feather name="user-plus" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add Student</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── CLASS PICKER ────────────────────────────────────────────────────── */}
      <Modal visible={showClassPicker} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: '#fff', maxHeight: 400 }]}>
            <View style={[mo.mHeader, { borderBottomColor: '#E2E8F0' }]}>
              <Text style={mo.mTitle}>Select Class</Text>
              <TouchableOpacity onPress={() => { setClassSearch(''); setShowClassPicker(false); }}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <TextInput
              value={classSearch}
              onChangeText={setClassSearch}
              placeholder="Search class..."
              placeholderTextColor="#94A3B8"
              style={[mo.mInput, { margin: 16, marginBottom: 8 }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView>
              {classes.filter((cls: string) => cls.toLowerCase().includes(classSearch.trim().toLowerCase())).map((cls: string) => (
                <TouchableOpacity
                  key={cls}
                  style={mo.classRow}
                  onPress={() => {
                    setStudentForm(p => ({ ...p, class: cls }));
                    setClassSearch('');
                    setShowClassPicker(false);
                  }}
                >
                  <Text style={{ fontSize: 15, color: studentForm.class === cls ? H_MID : '#0F172A' }}>
                    {cls}
                  </Text>
                  {studentForm.class === cls && <Feather name="check" size={18} color={H_MID} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── SECTION PICKER ──────────────────────────────────────────────────── */}
      <Modal visible={showSectionPicker} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: '#fff', maxHeight: 400 }]}>
            <View style={[mo.mHeader, { borderBottomColor: '#E2E8F0' }]}>
              <Text style={mo.mTitle}>Select Section</Text>
              <TouchableOpacity onPress={() => setShowSectionPicker(false)}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                style={mo.classRow}
                onPress={() => { setStudentForm(p => ({ ...p, section: '' })); setShowSectionPicker(false); }}
              >
                <Text style={{ fontSize: 15, fontStyle: 'italic', color: !studentForm.section ? H_MID : '#94A3B8' }}>None</Text>
                {!studentForm.section && <Feather name="check" size={18} color={H_MID} />}
              </TouchableOpacity>
              {sections.length === 0 && (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: '#94A3B8', textAlign: 'center' }}>No sections yet.{'\n'}Tap "Manage Sections" to add one.</Text>
                </View>
              )}
              {sections.map((sec: string) => (
                <TouchableOpacity
                  key={sec}
                  style={mo.classRow}
                  onPress={() => { setStudentForm(p => ({ ...p, section: sec })); setShowSectionPicker(false); }}
                >
                  <Text style={{ fontSize: 15, color: studentForm.section === sec ? H_MID : '#0F172A' }}>{sec}</Text>
                  {studentForm.section === sec && <Feather name="check" size={18} color={H_MID} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── SECTIONS MANAGER ────────────────────────────────────────────────── */}
      <Modal visible={showSectionsMgr} animationType="slide" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: '#fff', height: '78%' as any, minHeight: 0 }]}>
            <View style={[mo.mHeader, { borderBottomColor: '#E2E8F0' }]}>
              <View>
                <Text style={mo.mTitle}>Manage Sections</Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Add, edit or delete sections</Text>
              </View>
              <TouchableOpacity onPress={() => {
                setShowSectionsMgr(false);
                if (formPausedForSections) {
                  setFormPausedForSections(false);
                  setTimeout(() => setShowAddStudent(true), 350);
                }
              }}>
                <Feather name="x" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }}>
              {sections.length === 0 && (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Feather name="layers" size={32} color="#94A3B8" />
                  <Text style={{ color: '#94A3B8', marginTop: 8 }}>No sections yet. Add one below.</Text>
                </View>
              )}
              {sections.map((sec: string) => (
                <View key={sec} style={[mo.secRow, { borderBottomColor: '#E2E8F0' }]}>
                  {editingSectionName === sec ? (
                    <>
                      <TextInput
                        style={mo.secEditInput}
                        value={editingSectionValue}
                        onChangeText={setEditingSectionValue}
                        autoFocus
                        placeholder="New name"
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity onPress={() => handleUpdateSectionTeacher(sec)} style={{ padding: 6 }}>
                        <Feather name="check" size={18} color="#10B981" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingSectionName(null)} style={{ padding: 6 }}>
                        <Feather name="x" size={18} color="#94A3B8" />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Feather name="tag" size={15} color={H_MID} />
                      <Text style={{ flex: 1, fontSize: 15, color: '#0F172A', marginLeft: 8 }}>{sec}</Text>
                      <TouchableOpacity onPress={() => { setEditingSectionName(sec); setEditingSectionValue(sec); }} style={{ padding: 6 }}>
                        <Feather name="edit-2" size={16} color={H_MID} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setConfirmDeleteSection(sec)} style={{ padding: 6 }}>
                        <Feather name="trash-2" size={16} color="#F43F5E" />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ))}
            </ScrollView>
            <View style={[mo.secAddRow, { borderTopColor: '#E2E8F0', backgroundColor: '#fff' }]}>
              <TextInput
                style={mo.secAddInput}
                value={newSectionName}
                onChangeText={setNewSectionName}
                placeholder="New section name (e.g. A, B, C)"
                placeholderTextColor="#94A3B8"
                onSubmitEditing={handleAddSectionTeacher}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[mo.secAddBtn, { backgroundColor: newSectionName.trim() ? H_MID : '#E2E8F0' }]}
                onPress={handleAddSectionTeacher}
                disabled={!newSectionName.trim() || sectionLoading}
                activeOpacity={0.8}
              >
                <Feather name="plus" size={20} color={newSectionName.trim() ? '#fff' : '#94A3B8'} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── SECTION DELETE CONFIRMATION ─────────────────────────────────────── */}
      <Modal visible={!!confirmDeleteSection} animationType="fade" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, {
            backgroundColor: '#fff',
            borderRadius: 24,
            margin: 24,
            minHeight: 0,
          }]}>
            <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 18 }}>
              <View style={{ width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', marginBottom: 16 }}>
                <Feather name="trash-2" size={26} color="#F43F5E" />
              </View>
              <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Delete section?</Text>
              <Text style={{ color: '#64748B', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 }}>
                This will permanently remove <Text style={{ color: '#0F172A', fontWeight: '800' }}>{confirmDeleteSection}</Text> and clear it from any student records. This action cannot be undone.
              </Text>
            </View>
            <View style={[mo.mFooter, { borderTopColor: '#E2E8F0' }]}>
              <TouchableOpacity
                style={[mo.mBtn, { borderColor: '#E2E8F0' }]}
                onPress={() => setConfirmDeleteSection(null)}
                disabled={sectionLoading}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '700' }}>Keep Section</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[mo.mBtn, { backgroundColor: '#F43F5E', borderColor: '#F43F5E' }]}
                onPress={handleDeleteSectionTeacher}
                disabled={sectionLoading}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{sectionLoading ? 'Deleting…' : 'Delete Forever'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── PERMISSION MODAL ────────────────────────────────────────────────── */}
      <Modal
        visible={!!blockedAction}
        transparent
        animationType="fade"
        onRequestClose={() => setBlockedAction(null)}
      >
        <View style={pm.overlay}>
          <View style={pm.card}>
            {/* Icon with gradient + lock badge */}
            <View style={pm.iconWrap}>
              <LinearGradient
                colors={blockedAction?.grad ?? ['#94A3B8', '#CBD5E1']}
                style={pm.iconGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Feather name={blockedAction?.icon ?? 'lock'} size={36} color="#fff" />
              </LinearGradient>
              {/* Lock badge */}
              <View style={pm.lockBadge}>
                <Feather name="lock" size={11} color="#fff" />
              </View>
            </View>

            {/* Heading */}
            <Text style={pm.title}>Access Restricted</Text>

            {/* Action chip */}
            <View style={pm.actionChip}>
              <Feather name={blockedAction?.icon ?? 'lock'} size={12} color={H_MID} />
              <Text style={pm.actionChipTxt}>{blockedAction?.label}</Text>
            </View>

            {/* Body */}
            <Text style={pm.body}>
              You don't have permission to use this feature. Please contact your admin to get access granted.
            </Text>

            {/* Contact admin hint */}
            <View style={pm.hintRow}>
              <Feather name="info" size={13} color="#F59E0B" />
              <Text style={pm.hintTxt}>Ask your school admin to enable this for your account.</Text>
            </View>

            {/* Button */}
            <TouchableOpacity
              style={pm.btn}
              activeOpacity={0.85}
              onPress={() => setBlockedAction(null)}
            >
              <LinearGradient
                colors={blockedAction?.grad ?? [H_MID, H_END]}
                style={pm.btnGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={pm.btnTxt}>Got It</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      <PremiumAlert
        visible={showStudentSuccess}
        variant="success"
        title="Student added"
        message="The student has been added successfully."
        onDismiss={() => setShowStudentSuccess(false)}
      />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF1FF' },

  // ── Header
  headerGrad: { paddingHorizontal: H_PAD, overflow: 'hidden' },
  headerOrb1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(99,102,241,0.22)', top: -70, right: -55,
  },
  headerOrb2: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(59,130,246,0.16)', top: 30, right: 55,
  },
  headerOrb3: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(139,92,246,0.14)', bottom: 10, left: -25,
  },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 22,
  },
  schoolBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    maxWidth: '72%',
  },
  schoolLogo: { width: 32, height: 32, flexShrink: 0 },
  schoolName: { fontSize: 10, fontWeight: '800', color: '#fff', lineHeight: 14, flexShrink: 1 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.55)',
  },
  avatarTxt: { fontSize: 15, fontWeight: '900', color: '#fff' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 11, height: 11, borderRadius: 5.5,
    backgroundColor: '#34D399', borderWidth: 2, borderColor: '#fff',
  },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  greetingTxt: { fontSize: 13.5, color: 'rgba(255,255,255,0.78)', fontWeight: '500', marginBottom: 4 },
  heroName: { fontSize: 25, fontWeight: '900', color: '#fff', lineHeight: 30, letterSpacing: -0.6 },
  dateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  dateTxt: { fontSize: 11.5, color: 'rgba(255,255,255,0.92)', fontWeight: '600' },

  // ── Attendance overlapping card
  attCard: {
    marginHorizontal: H_PAD, marginTop: -34, borderRadius: 24, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22, shadowRadius: 28, elevation: 14,
    marginBottom: 24,
  },
  attInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 18 },
  attIconCircle: {
    width: 50, height: 50, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  attTitle: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  attSub:   { fontSize: 12.5, lineHeight: 18 },
  markBtn: { marginTop: 8, borderRadius: 12, overflow: 'hidden', alignSelf: 'flex-start' },
  markBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  markBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // ── Content
  content: { paddingHorizontal: H_PAD },

  // ── Section headers
  sectionRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionAccent: { width: 4, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 16.5, fontWeight: '800', color: '#0D1B40', letterSpacing: -0.3 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEF2FF', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  chipTxt: { fontSize: 12, fontWeight: '700', color: H_MID },
  linkTxt: { fontSize: 13, fontWeight: '600', color: H_MID },

  // ── Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginBottom: 28 },
  statCard: {
    flex: 1, flexBasis: '45%',
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13, shadowRadius: 18, elevation: 6,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  statTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  statIconGrad: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statNum: { fontSize: 32, fontWeight: '900', lineHeight: 36, letterSpacing: -1 },
  statLbl: { fontSize: 11.5, color: '#64748B', marginTop: 4, fontWeight: '600' },

  // ── Quick actions (3-column)
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginBottom: 4 },
  gridItem: {
    height: 126,
    backgroundColor: '#fff', borderRadius: 22,
    paddingHorizontal: 6, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center', gap: 7,
    shadowColor: '#3B5BDB', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1, shadowRadius: 16, elevation: 5,
    borderWidth: 1, borderColor: 'rgba(59,91,219,0.07)',
  },
  gridItemLocked: {
    backgroundColor: '#F8FAFC',
    shadowOpacity: 0.04,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  lockBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  gridIconGrad: {
    width: 54, height: 54, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  gridLabel:      { fontSize: 11.5, fontWeight: '800', color: '#0D1B40', textAlign: 'center' },
  gridLabelMuted: { color: '#94A3B8' },
  gridSub:        { fontSize: 9.5, color: '#94A3B8', textAlign: 'center', lineHeight: 12 },
  gridSubLocked:  { color: '#EF4444', fontWeight: '600' },

  // ── Birthday cards
  bdaySectionRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bdaySectionIcon:  { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bdaySectionTitle: { fontSize: 17, fontWeight: '800', color: '#0C1F4A', letterSpacing: -0.3 },
  bdaySectionSub:   { fontSize: 12, color: '#64748B', marginTop: 1 },
  bdayCard: {
    backgroundColor: '#fff', borderRadius: 18, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 4,
  },
  bdayHeroWrap: {
    borderRadius: 26, overflow: 'hidden', marginBottom: 10,
    shadowColor: '#EC4899', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45, shadowRadius: 24, elevation: 14,
  },
  bdayHeroGrad:        { padding: 20, overflow: 'hidden' },
  bdayHeroSheen:       { position:'absolute', top:0, left:0, right:0, height:'52%', backgroundColor:'rgba(255,255,255,0.13)', borderRadius:26 },
  bdayHeroAvatar:      { width:60, height:60, borderRadius:20, flexShrink:0, backgroundColor:'rgba(255,255,255,0.25)', alignItems:'center', justifyContent:'center', borderWidth:2.5, borderColor:'rgba(255,255,255,0.55)' },
  bdayHeroAvatarLetter:{ fontSize:26, fontWeight:'900', color:'#fff' },
  bdayHeroLabel:       { fontSize:10, color:'rgba(255,255,255,0.75)', fontWeight:'800', letterSpacing:2, marginBottom:3 },
  bdayHeroName:        { fontSize:21, fontWeight:'900', color:'#fff', letterSpacing:-0.4 },
  bdayHeroMeta:        { fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 },
  bdayHeroBtn:         { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:7, backgroundColor:'rgba(255,255,255,0.2)', borderRadius:14, borderWidth:1.5, borderColor:'rgba(255,255,255,0.38)', paddingVertical:11 },
  bdayHeroBtnTxt:      { color:'#fff', fontWeight:'700', fontSize:13 },
  bdayUpcomingWrap: {
    borderRadius: 20, overflow: 'hidden', marginBottom: 10,
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
  },
  bdayUpcomingGrad:         { padding: 14, overflow: 'hidden' },
  bdayUpcomingAvatar:       { width:46, height:46, borderRadius:15, flexShrink:0, alignItems:'center', justifyContent:'center' },
  bdayUpcomingAvatarLetter: { fontSize:19, fontWeight:'800', color:'#fff' },
  bdayUpcomingName:         { fontSize:15, fontWeight:'800', color:'#fff' },
  bdayUpcomingSub:          { fontSize:11, color:'rgba(255,255,255,0.55)', marginTop:2 },
  bdayUpcomingDaysBadge: {
    backgroundColor:'rgba(236,72,153,0.25)', borderRadius:20,
    paddingHorizontal:10, paddingVertical:4,
    borderWidth:1, borderColor:'rgba(236,72,153,0.45)',
  },
  bdayUpcomingDaysTxt: { fontSize:11, fontWeight:'700', color:'#F9A8D4' },
  bdayUpcomingBtn:     { flex:1, borderRadius:13, overflow:'hidden' },
  bdayUpcomingBtnGrad: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:9 },
  bdayUpcomingBtnTxt:  { color:'#fff', fontSize:12, fontWeight:'700' },
  bdayViewBtn:    { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:14, paddingVertical:8 },
  bdayViewBtnTxt: { fontSize:12, fontWeight:'700', color:'#fff' },
  bdayEmpty:    { backgroundColor:'#F8FAFC', borderRadius:18, padding:28, alignItems:'center', borderWidth:1.5, borderColor:'#E2E8F0' },
  bdayEmptyTxt: { fontSize:13, color:'#94A3B8', fontWeight:'500' },

  // ── Exam cards
  examCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10,
    shadowColor: '#3B5BDB', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09, shadowRadius: 14, elevation: 4,
    borderWidth: 1, borderColor: 'rgba(59,91,219,0.07)',
  },
  examIcon:     { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  examName:     { fontSize: 14.5, fontWeight: '700', color: '#0D1B40' },
  examMeta:     { fontSize: 12, color: '#94A3B8', marginTop: 3 },
  examBadge:    { backgroundColor: '#EEF2FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#C7D2FE' },
  examBadgeTxt: { fontSize: 11, fontWeight: '700', color: H_MID },
});

// ── Profile bottom sheet styles ───────────────────────────────────────────────
const po = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(5,13,45,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    paddingHorizontal: 28, paddingTop: 20, paddingBottom: 40,
    alignItems: 'center',
  },
  handle: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: '#E2E8F0', marginBottom: 28,
  },
  avatarGrad: {
    width: 90, height: 90, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: H_MID, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
  },
  avatarTxt:  { fontSize: 32, fontWeight: '900', color: '#fff' },
  name:       { fontSize: 21, fontWeight: '900', color: '#0D1B40', textAlign: 'center', letterSpacing: -0.4 },
  roleBadge:  {
    backgroundColor: '#EEF2FF', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6, marginTop: 10,
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  roleTxt:    { fontSize: 13, fontWeight: '700', color: H_MID },
  username:   { fontSize: 13, color: '#9CA3AF', marginTop: 5, marginBottom: 28, fontWeight: '500' },
  signOutBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    backgroundColor: '#EF4444', borderRadius: 18, paddingVertical: 17,
    shadowColor: '#EF4444', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 7,
  },
  signOutTxt: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  cancelBtn:  { marginTop: 18, paddingVertical: 8 },
  cancelTxt:  { fontSize: 15, color: '#9CA3AF', fontWeight: '500' },
});

// ── Modal styles ──────────────────────────────────────────────────────────────
const mo = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%', minHeight: '70%' },
  mHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1,
  },
  mTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  mLabel: { fontSize: 13, fontWeight: '600', color: '#0F172A', marginBottom: 8 },
  mInput: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
    backgroundColor: '#F8FAFF', color: '#0F172A',
  },
  mFooter: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1 },
  mBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 14,
  },
  classRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  // Photo upload
  photoUpload: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#C7D2FE', borderStyle: 'dashed', gap: 4,
  },
  photoImage:      { width: 96, height: 96, borderRadius: 48 },
  photoUploadText: { fontSize: 11, color: H_MID, fontWeight: '600', marginTop: 4 },
  // Fee section
  feeSection: {
    backgroundColor: '#F8FAFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 14,
  },
  feeSectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  feeCalc: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', marginTop: 4,
  },
  feeCalcRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  discBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1.5, borderRadius: 10, alignItems: 'center',
  },
  // Sections manager
  secRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  secEditInput: {
    flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: '#F8FAFF',
  },
  secAddRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, borderTopWidth: 1,
  },
  secAddInput: {
    flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, backgroundColor: '#F8FAFF',
  },
  secAddBtn: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
});

// ── Permission modal styles ───────────────────────────────────────────────────
const pm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 28,
  },
  card: {
    width: '100%', backgroundColor: '#fff',
    borderRadius: 28, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 28,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25, shadowRadius: 40, elevation: 24,
  },
  iconWrap: { marginBottom: 22, position: 'relative' },
  iconGrad: {
    width: 80, height: 80, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute', bottom: -4, right: -4,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
  },
  title: {
    fontSize: 21, fontWeight: '800', color: '#0F172A',
    marginBottom: 10, textAlign: 'center',
  },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16,
  },
  actionChipTxt: { fontSize: 13, fontWeight: '700', color: H_MID },
  body: {
    fontSize: 14, color: '#64748B', textAlign: 'center',
    lineHeight: 21, marginBottom: 16,
  },
  hintRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFFBEB', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 24, width: '100%',
  },
  hintTxt: { flex: 1, fontSize: 12.5, color: '#92400E', lineHeight: 18 },
  btn:     { width: '100%', borderRadius: 18, overflow: 'hidden' },
  btnGrad: { paddingVertical: 16, alignItems: 'center' },
  btnTxt:  { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
});

// ── Birthday card modal styles ─────────────────────────────────────────────────
// ── Birthday styles ───────────────────────────────────────────────────────────
const bday = StyleSheet.create({
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
  emojiRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  sideEmoji:  { fontSize: 20 },
  mainEmoji:  { fontSize: 38 },
  titleSub:   { fontSize: 11, fontWeight: '800', color: 'rgba(252,211,77,0.7)', letterSpacing: 8, marginBottom: 2 },
  titleMain:  { fontSize: 26, fontWeight: '900', color: '#FCD34D', letterSpacing: 5, textAlign: 'center', marginBottom: 6 },
  shimmer:    { width: '80%', height: 1.5, marginVertical: 10 },
  avatarRing: {
    width: 70, height: 70, borderRadius: 35, padding: 3,
    backgroundColor: '#F59E0B', marginBottom: 8,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
  },
  avatarG:       { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarLetter:  { fontSize: 26, fontWeight: '900', color: '#fff' },
  studentName:   { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 4 },
  classBadge:    {
    backgroundColor: 'rgba(245,158,11,0.18)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3,
    marginBottom: 10, borderWidth: 1, borderColor: 'rgba(252,211,77,0.35)',
  },
  classText:   { fontSize: 11, color: '#FCD34D', fontWeight: '700' },
  messageBox:  {
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
  bottomStars:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  actions:      { width: '100%', gap: 8 },
  whatsappBtn:  { width: '100%', borderRadius: 14, overflow: 'hidden' },
  whatsappGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  whatsappTxt:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  closeTxt:     { color: 'rgba(255,255,255,0.55)', fontWeight: '600', fontSize: 13 },
});
