import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { SCHOOL_INFO } from '@/constants/schoolInfo';

interface Props {
  studentName: string;
  studentClass: string;
  rollNumber?: string;
  fatherName?: string;
  admissionNo?: string;
  dueAmount: number;
  date?: string;
  type?: 'fee' | 'exam' | 'attendance' | 'general';
  customNote?: string;
  logoDataUrl?: string | null;
}

const TYPE_CONFIG = {
  fee:        { label: 'FEE REMINDER',       accent: '#C62828', sub: '#EF5350', icon: '⚠' },
  exam:       { label: 'EXAM NOTICE',         accent: '#4527A0', sub: '#7E57C2', icon: '📋' },
  attendance: { label: 'ATTENDANCE ALERT',    accent: '#C62828', sub: '#EF5350', icon: '📅' },
  general:    { label: 'SCHOOL NOTICE',       accent: '#1565C0', sub: '#42A5F5', icon: '📢' },
};

export default function ReminderCard({
  studentName,
  studentClass,
  rollNumber,
  fatherName,
  admissionNo,
  dueAmount,
  date,
  type = 'fee',
  customNote,
  logoDataUrl,
}: Props) {
  const displayDate = date ?? new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const cfg = TYPE_CONFIG[type];

  return (
    <View style={s.card}>

      {/* ══ TOP ACCENT STRIPE ══ */}
      <View style={[s.topStripe, { backgroundColor: cfg.sub }]} />

      {/* ══ HEADER ══ */}
      <View style={s.header}>
        {/* Logo */}
        <View style={s.logoWrap}>
          {logoDataUrl ? (
            <Image source={{ uri: logoDataUrl }} style={s.logoImg} resizeMode="contain" />
          ) : (
            <View style={s.logoBadge}>
              <Text style={s.logoTop}>DR.</Text>
              <Text style={s.logoMiddle}>APJ</Text>
              <Text style={s.logoBottom}>AKJ</Text>
            </View>
          )}
        </View>

        {/* School info */}
        <View style={s.schoolInfo}>
          <Text style={s.schoolName} numberOfLines={2}>{SCHOOL_INFO.name}</Text>
          <Text style={s.schoolMeta} numberOfLines={1}>📍 {SCHOOL_INFO.address}</Text>
          <Text style={s.schoolMeta}>📞 {SCHOOL_INFO.contact}</Text>
        </View>

        {/* Date pill */}
        <View style={s.datePill}>
          <Text style={s.dateText}>{displayDate}</Text>
        </View>
      </View>

      {/* ══ TYPE BANNER ══ */}
      <View style={[s.banner, { backgroundColor: cfg.accent }]}>
        <View style={s.bannerLeft}>
          <Text style={s.bannerIcon}>{cfg.icon}</Text>
          <Text style={s.bannerText}>{cfg.label}</Text>
        </View>
        <View style={s.bannerDots}>
          {[0,1,2,3].map(i => <View key={i} style={s.dot} />)}
        </View>
      </View>

      {/* ══ BODY ══ */}
      <View style={s.body}>

        {/* Student details box */}
        <View style={[s.studentBox, { borderLeftColor: cfg.accent }]}>
          <View style={[s.avatar, { backgroundColor: cfg.accent }]}>
            <Text style={s.avatarText}>{studentName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={s.studentDetails}>
            <Text style={s.studentName}>{studentName}</Text>
            <View style={s.studentMeta}>
              <View style={s.metaChip}>
                <Text style={s.metaChipText}>🏫 {studentClass}</Text>
              </View>
              {rollNumber ? (
                <View style={s.metaChip}>
                  <Text style={s.metaChipText}>📋 Roll {rollNumber}</Text>
                </View>
              ) : null}
            </View>
            {fatherName ? <Text style={s.fatherName}>S/O: {fatherName}</Text> : null}
            {admissionNo ? <Text style={s.fatherName}>Adm No: {admissionNo}</Text> : null}
          </View>
        </View>

        {/* Amount box — only for fee type */}
        {type === 'fee' && (
          <View style={s.amountSection}>
            <Text style={s.amountLabel}>OUTSTANDING DUES</Text>
            <View style={s.amountDivider} />
            {dueAmount > 0 ? (
              <View style={s.amountRow}>
                <Text style={s.amountCurrency}>₹</Text>
                <Text style={s.amountValue}>{dueAmount.toLocaleString('en-IN')}</Text>
              </View>
            ) : (
              <Text style={s.amountVerify}>Kindly verify at the school office</Text>
            )}
            <Text style={s.amountNote}>Please clear at the earliest</Text>
          </View>
        )}

        {/* Custom note */}
        {customNote ? (
          <View style={s.noteBox}>
            <Text style={s.noteLabel}>📝 MESSAGE</Text>
            <Text style={s.noteText}>{customNote}</Text>
          </View>
        ) : null}

        {/* Notice text */}
        <View style={[s.noticeBox, { borderColor: cfg.accent + '40', backgroundColor: cfg.accent + '08' }]}>
          <Text style={[s.noticeText, { color: cfg.accent }]}>
            {type === 'fee'
              ? 'Please clear the pending school fees at the earliest to avoid any inconvenience.'
              : type === 'exam'
              ? 'Ensure your ward revises all subjects and carries their admit card on exam day.'
              : type === 'attendance'
              ? 'Regular attendance is critical. Please ensure your ward attends school regularly.'
              : 'Please contact the school office for more information.'}
          </Text>
        </View>
      </View>

      {/* ══ FOOTER ══ */}
      <View style={[s.footer, { borderTopColor: cfg.accent + '30' }]}>
        <Text style={s.footerContact}>📞 {SCHOOL_INFO.contact}</Text>
        {SCHOOL_INFO.email ? <Text style={s.footerContact}>✉ {SCHOOL_INFO.email}</Text> : null}
        <View style={[s.seal, { borderColor: cfg.accent }]}>
          <Text style={[s.sealLine1, { color: cfg.accent }]}>OFFICIAL</Text>
          <Text style={[s.sealLine2, { color: cfg.accent }]}>NOTICE</Text>
        </View>
      </View>

      {/* ══ BRAND BAR ══ */}
      <View style={[s.brandBar, { backgroundColor: cfg.accent }]}>
        <Text style={s.brandText}>{SCHOOL_INFO.name}  ·  School Management</Text>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },

  topStripe: { height: 4 },

  /* Header */
  header: {
    backgroundColor: '#0D1B4B',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoWrap: {
    width: 50, height: 50,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  logoImg: { width: 46, height: 46, borderRadius: 8 },
  logoBadge: { alignItems: 'center', justifyContent: 'center' },
  logoTop:    { fontSize: 7,  fontWeight: '900', color: '#0D1B4B', lineHeight: 8 },
  logoMiddle: { fontSize: 14, fontWeight: '900', color: '#0D1B4B', lineHeight: 16 },
  logoBottom: { fontSize: 7,  fontWeight: '900', color: '#0D1B4B', lineHeight: 8 },
  schoolInfo: { flex: 1 },
  schoolName: { color: '#ffffff', fontSize: 11, fontWeight: '800', lineHeight: 15, textTransform: 'uppercase', letterSpacing: 0.4 },
  schoolMeta: { color: 'rgba(255,255,255,0.65)', fontSize: 9, marginTop: 2 },
  datePill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 6, alignSelf: 'flex-start', flexShrink: 0,
  },
  dateText: { color: 'rgba(255,255,255,0.92)', fontSize: 9.5, fontWeight: '600' },

  /* Banner */
  banner: {
    paddingVertical: 9, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerIcon: { fontSize: 13 },
  bannerText: { color: '#ffffff', fontSize: 12, fontWeight: '900', letterSpacing: 1.8 },
  bannerDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.4)' },

  /* Body */
  body: { backgroundColor: '#FAFBFF', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },

  /* Student box */
  studentBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0F4FF', borderRadius: 10,
    padding: 10, marginBottom: 10,
    borderLeftWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  avatarText: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  studentDetails: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '800', color: '#0D1B4B', marginBottom: 4 },
  studentMeta: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 2 },
  metaChip: { backgroundColor: '#0D1B4B15', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  metaChipText: { fontSize: 9.5, fontWeight: '700', color: '#0D1B4B' },
  fatherName: { fontSize: 10, color: '#666', marginTop: 1 },

  /* Amount */
  amountSection: {
    alignItems: 'center', backgroundColor: '#fff', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#FFB300',
    shadowColor: '#FF6F00', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 2,
  },
  amountLabel: { fontSize: 9.5, fontWeight: '800', color: '#E65100', letterSpacing: 2, marginBottom: 4 },
  amountDivider: { width: 36, height: 1.5, backgroundColor: '#FFB300', marginBottom: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  amountCurrency: { fontSize: 15, fontWeight: '900', color: '#B71C1C', marginTop: 4 },
  amountValue: { fontSize: 36, fontWeight: '900', color: '#B71C1C', lineHeight: 42 },
  amountNote: { fontSize: 9.5, color: '#B71C1C', fontStyle: 'italic', marginTop: 2 },
  amountVerify: { fontSize: 13, color: '#2E7D32', fontWeight: '700', fontStyle: 'italic' },

  /* Note box */
  noteBox: { backgroundColor: '#FFFDE7', borderRadius: 8, padding: 10, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#F9A825' },
  noteLabel: { fontSize: 8.5, fontWeight: '800', color: '#F57F17', letterSpacing: 1.2, marginBottom: 3 },
  noteText: { fontSize: 11.5, color: '#333', lineHeight: 16 },

  /* Notice */
  noticeBox: { borderRadius: 8, borderWidth: 1, padding: 9 },
  noticeText: { fontSize: 10.5, lineHeight: 15, textAlign: 'center', fontStyle: 'italic' },

  /* Footer */
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F5F7FF', paddingHorizontal: 14, paddingVertical: 9,
    borderTopWidth: 1,
  },
  footerContact: { fontSize: 9.5, color: '#444', lineHeight: 14 },
  seal: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  sealLine1: { fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5 },
  sealLine2: { fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5 },

  /* Brand bar */
  brandBar: { paddingVertical: 4, alignItems: 'center' },
  brandText: { fontSize: 7.5, color: 'rgba(255,255,255,0.78)', letterSpacing: 0.4 },
});
