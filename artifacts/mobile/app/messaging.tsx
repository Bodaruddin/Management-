import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, Platform, StyleSheet, Modal, ActivityIndicator,
  Dimensions, Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ViewShot from 'react-native-view-shot';
import { useColors } from '@/hooks/useColors';
import { useApp, Student, isActiveStudent } from '@/context/AppContext';
import { SCHOOL_INFO } from '@/constants/schoolInfo';
import { sendReminderWhatsApp, sendReminderSMS, shareReminderImage } from '@/utils/reminder';
import ReminderCard from '@/components/ReminderCard';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Templates ────────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'fee',
    label: 'Fee Reminder',
    desc: 'Notify parents about pending school fees',
    icon: 'bell' as const,
    emoji: '💰',
    color: '#D84315',
    gradient: ['#FF6F00', '#D84315'],
    bg: '#FFF3E0',
  },
  {
    id: 'exam',
    label: 'Exam Notice',
    desc: 'Upcoming exam schedule & instructions',
    icon: 'book-open' as const,
    emoji: '📚',
    color: '#4527A0',
    gradient: ['#7C3AED', '#4527A0'],
    bg: '#F3E5F5',
  },
  {
    id: 'attendance',
    label: 'Attendance Alert',
    desc: 'Alert for low or irregular attendance',
    icon: 'calendar' as const,
    emoji: '⚠️',
    color: '#B71C1C',
    gradient: ['#EF5350', '#B71C1C'],
    bg: '#FFEBEE',
  },
  {
    id: 'general',
    label: 'General Notice',
    desc: 'Custom message to parents/guardians',
    icon: 'message-circle' as const,
    emoji: '📢',
    color: '#1565C0',
    gradient: ['#1E88E5', '#1565C0'],
    bg: '#E3F2FD',
  },
];

// ─── Message builders ─────────────────────────────────────────────────────────
function buildMsg(templateId: string, s: Student, custom: string) {
  const base = `🏫 *${SCHOOL_INFO.name}*\n📍 ${SCHOOL_INFO.address}  |  📞 ${SCHOOL_INFO.contact}\n`;

  if (templateId === 'fee') return (
    base + `\nDear Parent/Guardian of *${s.name}*,\n\nThis is a *friendly fee reminder* from ${SCHOOL_INFO.name}.\n\n👤 Student : ${s.name}\n🏷 Class   : ${s.class}\n📋 Roll    : ${s.rollNumber || '—'}\n\n⚠️ Please clear the *pending school fees* at the earliest.\n\n📞 Contact : ${SCHOOL_INFO.contact}\n✉ Email   : ${SCHOOL_INFO.email}\n\nThank you 🙏\n— *${SCHOOL_INFO.name}*`
  );
  if (templateId === 'exam') return (
    base + `\nDear Parent/Guardian of *${s.name}* (${s.class}),\n\n📢 *EXAM NOTICE*\n\nExaminations are scheduled. Please ensure your ward:\n• Revises all subjects thoroughly\n• Carries their admit card\n• Arrives on time\n\n📞 ${SCHOOL_INFO.contact}\n\nBest wishes! 📝\n— *${SCHOOL_INFO.name}*`
  );
  if (templateId === 'attendance') return (
    base + `\nDear Parent/Guardian of *${s.name}* (${s.class}),\n\n⚠️ *ATTENDANCE ALERT*\n\nYour ward's attendance requires immediate attention. Regular attendance is critical for academic success.\n\nPlease ensure *${s.name}* attends school regularly.\n\n📞 ${SCHOOL_INFO.contact}\n✉ ${SCHOOL_INFO.email}\n\nThank you.\n— *${SCHOOL_INFO.name}*`
  );
  return (
    base + `\nDear Parent/Guardian of *${s.name}* (${s.class}),\n\n${custom || '[Your message here]'}\n\n📞 ${SCHOOL_INFO.contact}\n\nThank you.\n— *${SCHOOL_INFO.name}*`
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MessagingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { students } = useApp();

  const topPad = Platform.OS === 'web' ? 12 : insets.top;
  const botPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const [templateId, setTemplateId] = useState('fee');
  const [customBody, setCustomBody] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);

  // Image-send state
  const [imgModalVisible, setImgModalVisible] = useState(false);
  const [imgStudent, setImgStudent] = useState<Student | null>(null);
  const [imgCaptured, setImgCaptured] = useState<string | null>(null);
  const [imgSharing, setImgSharing] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);
  const [imgQueue, setImgQueue] = useState<Student[]>([]);
  const [imgQueueIdx, setImgQueueIdx] = useState(0);

  const tpl = TEMPLATES.find(t => t.id === templateId)!;

  const uniqueClasses = useMemo(
    () => ['All', ...Array.from(new Set(students.filter(isActiveStudent).map(s => s.class))).sort()],
    [students],
  );
  const filteredStudents = useMemo(
    () => students.filter(s => {
      if (!isActiveStudent(s)) return false;
      const matchClass = classFilter === 'All' || s.class === classFilter;
      const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.rollNumber?.toLowerCase().includes(search.toLowerCase());
      return matchClass && matchSearch;
    }),
    [students, classFilter, search],
  );
  const recipients = students.filter(s => isActiveStudent(s) && selectedIds.has(s.id));

  const toggle = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelectedIds(new Set(filteredStudents.map(s => s.id)));
  const clearAll = () => setSelectedIds(new Set());

  const previewMsg = buildMsg(templateId, recipients.length > 0 ? recipients[0] : {
    id: '', name: '[Student Name]', class: '[Class]', rollNumber: '[Roll]',
    fatherName: '', motherName: '', mobileNumber: '', dateOfBirth: '',
  }, customBody);

  // ── Text send ──
  const sendAll = async (via: 'whatsapp' | 'sms') => {
    if (recipients.length === 0) { Alert.alert('No Recipients', 'Select at least one student first.'); return; }
    const noPhone = recipients.filter(s => !s.mobileNumber?.replace(/\D/g, ''));
    if (noPhone.length === recipients.length) { Alert.alert('No Numbers', 'None of the selected students have a mobile number.'); return; }
    setSending(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    for (const s of recipients) {
      const msg = buildMsg(templateId, s, customBody);
      if (via === 'whatsapp') await sendReminderWhatsApp(s, msg);
      else await sendReminderSMS(s, msg);
    }
    setSending(false);
    Alert.alert('✅ Done', `Sent to ${recipients.length} student${recipients.length > 1 ? 's' : ''}.`);
  };

  // ── Image send ──
  const startImageSend = async () => {
    if (recipients.length === 0) { Alert.alert('No Recipients', 'Select at least one student first.'); return; }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const queue = [...recipients];
    setImgQueue(queue);
    setImgQueueIdx(0);
    setImgStudent(queue[0]);
    setImgCaptured(null);
    setImgModalVisible(true);
  };

  const captureCard = async () => {
    if (!viewShotRef.current) return;
    setImgSharing(true);
    try {
      const uri = await (viewShotRef.current as any).capture();
      setImgCaptured(uri);
    } catch {
      Alert.alert('Capture failed', 'Could not capture the card. Please try again.');
    } finally {
      setImgSharing(false);
    }
  };

  const shareCard = async () => {
    if (!imgCaptured || !imgStudent) return;
    setImgSharing(true);
    try {
      await shareReminderImage(imgCaptured, imgStudent);
    } finally {
      setImgSharing(false);
    }
    // Advance to next in queue
    const nextIdx = imgQueueIdx + 1;
    if (nextIdx < imgQueue.length) {
      setImgQueueIdx(nextIdx);
      setImgStudent(imgQueue[nextIdx]);
      setImgCaptured(null);
    } else {
      setImgModalVisible(false);
      Alert.alert('✅ Done', `Image card sent for ${imgQueue.length} student${imgQueue.length > 1 ? 's' : ''}.`);
    }
  };

  const skipToNext = () => {
    const nextIdx = imgQueueIdx + 1;
    if (nextIdx < imgQueue.length) {
      setImgQueueIdx(nextIdx);
      setImgStudent(imgQueue[nextIdx]);
      setImgCaptured(null);
    } else {
      setImgModalVisible(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ══════════════════════ HEADER ══════════════════════ */}
      <View style={[st.header, { paddingTop: topPad, backgroundColor: '#0D1B4B' }]}>
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Broadcast Message</Text>
          <Text style={st.headerSub}>
            {recipients.length > 0
              ? `${recipients.length} recipient${recipients.length !== 1 ? 's' : ''} selected`
              : 'Select recipients below'}
          </Text>
        </View>
        <View style={[st.headerBadge, { backgroundColor: tpl.color }]}>
          <Text style={{ fontSize: 18 }}>{tpl.emoji}</Text>
        </View>
      </View>

      {/* Accent stripe */}
      <View style={[st.accentStripe, { backgroundColor: tpl.color }]} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: botPad + 130 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ══ TEMPLATE CARDS ══ */}
        <View style={{ paddingTop: 20, paddingBottom: 6 }}>
          <Text style={[st.sectionLabel, { color: colors.text, paddingHorizontal: 16 }]}>Message Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
            {TEMPLATES.map(t => {
              const active = templateId === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    st.tplCard,
                    { backgroundColor: active ? t.color : colors.card, borderColor: active ? t.color : colors.border },
                  ]}
                  onPress={() => setTemplateId(t.id)}
                  activeOpacity={0.85}
                >
                  <View style={[st.tplIconWrap, { backgroundColor: active ? 'rgba(255,255,255,0.2)' : t.bg }]}>
                    <Text style={{ fontSize: 22 }}>{t.emoji}</Text>
                  </View>
                  <Text style={[st.tplLabel, { color: active ? '#fff' : colors.text }]}>{t.label}</Text>
                  <Text style={[st.tplDesc, { color: active ? 'rgba(255,255,255,0.75)' : colors.mutedForeground }]} numberOfLines={2}>
                    {t.desc}
                  </Text>
                  {active && (
                    <View style={st.tplCheck}>
                      <Feather name="check-circle" size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ══ CUSTOM BODY ══ */}
        {templateId === 'general' && (
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <Text style={[st.fieldLabel, { color: colors.text }]}>Your Message *</Text>
            <TextInput
              style={[st.textArea, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
              value={customBody}
              onChangeText={setCustomBody}
              placeholder="Type your message to parents here..."
              placeholderTextColor={colors.mutedForeground}
              multiline textAlignVertical="top"
            />
          </View>
        )}

        {/* ══ MESSAGE PREVIEW ══ */}
        <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
          <Text style={[st.sectionLabel, { color: colors.text, marginBottom: 10 }]}>Message Preview</Text>
          <View style={[st.previewWrap, { backgroundColor: '#ECE5DD' }]}>
            {/* WhatsApp-style header */}
            <View style={[st.previewHeader, { backgroundColor: '#0D1B4B' }]}>
              <View style={st.previewAvatar}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0D1B4B' }}>S</Text>
              </View>
              <View>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{SCHOOL_INFO.name.split(' ').slice(0, 3).join(' ')}</Text>
                {recipients.length > 0 && (
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>→ {recipients[0].name}</Text>
                )}
              </View>
              <View style={[st.previewBadge, { backgroundColor: tpl.color }]}>
                <Text style={{ fontSize: 13 }}>{tpl.emoji}</Text>
              </View>
            </View>
            {/* Bubble */}
            <View style={{ padding: 12 }}>
              <View style={st.bubble}>
                <View style={st.bubbleTail} />
                <Text style={st.bubbleText}>{previewMsg}</Text>
                <Text style={st.bubbleTime}>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ══ RECIPIENTS ══ */}
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={[st.sectionLabel, { color: colors.text }]}>
              Recipients
              {recipients.length > 0 && (
                <Text style={{ color: tpl.color, fontWeight: '800' }}> · {recipients.length} selected</Text>
              )}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={selectAll} style={[st.miniBtn, { borderColor: tpl.color }]}>
                <Text style={{ fontSize: 12, color: tpl.color, fontWeight: '700' }}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearAll} style={[st.miniBtn, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontWeight: '600' }}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search */}
          <View style={[st.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              style={[st.searchInput, { color: colors.text }]}
              value={search} onChangeText={setSearch}
              placeholder="Search students…" placeholderTextColor={colors.mutedForeground}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* Class filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
            {uniqueClasses.map(cls => (
              <TouchableOpacity
                key={cls}
                style={[st.classChip, {
                  backgroundColor: classFilter === cls ? tpl.color : colors.muted,
                  borderColor: classFilter === cls ? tpl.color : colors.border,
                }]}
                onPress={() => setClassFilter(cls)}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: classFilter === cls ? '#fff' : colors.mutedForeground }}>
                  {cls}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Student list */}
          {filteredStudents.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 32 }}>👤</Text>
              <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>No students found</Text>
            </View>
          ) : (
            filteredStudents.map(st2 => {
              const selected = selectedIds.has(st2.id);
              const hasPhone = !!st2.mobileNumber?.replace(/\D/g, '');
              return (
                <TouchableOpacity
                  key={st2.id}
                  style={[
                    st.studentRow,
                    {
                      backgroundColor: selected ? tpl.color + '10' : colors.card,
                      borderColor: selected ? tpl.color : colors.border,
                      borderWidth: selected ? 1.5 : 1,
                    },
                  ]}
                  onPress={() => toggle(st2.id)}
                  activeOpacity={0.8}
                >
                  <View style={[st.checkbox, {
                    backgroundColor: selected ? tpl.color : 'transparent',
                    borderColor: selected ? tpl.color : colors.border,
                  }]}>
                    {selected && <Feather name="check" size={12} color="#fff" />}
                  </View>
                  <View style={[st.avatarCircle, { backgroundColor: selected ? tpl.color + '20' : colors.secondary }]}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: selected ? tpl.color : colors.text }}>
                      {st2.name.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.studentName, { color: colors.text }]}>{st2.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{st2.class} · Roll {st2.rollNumber || '—'}</Text>
                    <Text style={{ fontSize: 11, marginTop: 2, color: hasPhone ? '#25D366' : colors.mutedForeground }}>
                      {hasPhone ? `📞 ${st2.mobileNumber}` : 'No mobile number'}
                    </Text>
                  </View>
                  {selected && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={[st.quickBtn, { backgroundColor: '#25D36618' }]}
                        onPress={async e => { e.stopPropagation?.(); await sendReminderWhatsApp(st2, buildMsg(templateId, st2, customBody)); }}
                      >
                        <FontAwesome5 name="whatsapp" size={14} color="#25D366" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[st.quickBtn, { backgroundColor: tpl.color + '18' }]}
                        onPress={e => {
                          e.stopPropagation?.();
                          setImgQueue([st2]);
                          setImgQueueIdx(0);
                          setImgStudent(st2);
                          setImgCaptured(null);
                          setImgModalVisible(true);
                        }}
                      >
                        <Feather name="image" size={14} color={tpl.color} />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ══════════════════════ BOTTOM BAR ══════════════════════ */}
      <View style={[st.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: botPad || 16 }]}>
        {recipients.length > 0 && (
          <View style={[st.recipientBanner, { backgroundColor: tpl.color + '15', borderColor: tpl.color + '30' }]}>
            <Text style={{ fontSize: 13, color: tpl.color, fontWeight: '700' }}>
              📤 Sending to {recipients.length} recipient{recipients.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* WhatsApp */}
          <TouchableOpacity
            style={[st.sendBtn, { backgroundColor: recipients.length === 0 ? '#25D36650' : '#25D366', flex: 2 }]}
            onPress={() => sendAll('whatsapp')}
            disabled={sending || recipients.length === 0}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <><FontAwesome5 name="whatsapp" size={18} color="#fff" /><Text style={st.sendBtnText}>WhatsApp</Text></>}
          </TouchableOpacity>

          {/* SMS */}
          <TouchableOpacity
            style={[st.sendBtn, { backgroundColor: recipients.length === 0 ? colors.primary + '50' : colors.primary, flex: 1 }]}
            onPress={() => sendAll('sms')}
            disabled={sending || recipients.length === 0}
            activeOpacity={0.85}
          >
            <Feather name="message-square" size={18} color="#fff" />
            <Text style={st.sendBtnText}>SMS</Text>
          </TouchableOpacity>

          {/* Image */}
          <TouchableOpacity
            style={[st.sendBtn, { backgroundColor: recipients.length === 0 ? tpl.color + '50' : tpl.color, flex: 1 }]}
            onPress={startImageSend}
            disabled={sending || recipients.length === 0}
            activeOpacity={0.85}
          >
            <Feather name="image" size={18} color="#fff" />
            <Text style={st.sendBtnText}>Image</Text>
          </TouchableOpacity>
        </View>
        {recipients.length === 0 && (
          <Text style={{ textAlign: 'center', fontSize: 12, color: colors.mutedForeground, marginTop: 8 }}>
            Select recipients above to enable sending
          </Text>
        )}
      </View>

      {/* ══════════════════════ IMAGE SEND MODAL ══════════════════════ */}
      <Modal visible={imgModalVisible} animationType="slide" transparent>
        <View style={img.overlay}>
          <View style={[img.sheet, { backgroundColor: colors.card }]}>

            {/* Header */}
            <View style={[img.header, { borderBottomColor: colors.border, backgroundColor: '#0D1B4B' }]}>
              <View style={{ flex: 1 }}>
                <Text style={img.headerTitle}>Send Image Card</Text>
                {imgQueue.length > 1 && (
                  <Text style={img.headerSub}>{imgQueueIdx + 1} of {imgQueue.length} students</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setImgModalVisible(false)} style={img.closeBtn}>
                <Feather name="x" size={20} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>

            {/* Progress bar for bulk */}
            {imgQueue.length > 1 && (
              <View style={[img.progressBar, { backgroundColor: colors.muted }]}>
                <View style={[img.progressFill, { backgroundColor: tpl.color, width: `${((imgQueueIdx + 1) / imgQueue.length) * 100}%` as any }]} />
              </View>
            )}

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={[img.previewLabel, { color: colors.mutedForeground }]}>
                Preview for <Text style={{ color: colors.text, fontWeight: '700' }}>{imgStudent?.name}</Text>
              </Text>

              {/* Card preview (capturable) */}
              <View style={{ borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}>
                <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.95 }}>
                  {imgStudent && (
                    <ReminderCard
                      studentName={imgStudent.name}
                      studentClass={imgStudent.class}
                      rollNumber={imgStudent.rollNumber}
                      fatherName={imgStudent.fatherName}
                      admissionNo={imgStudent.admissionNo}
                      dueAmount={0}
                      type={templateId as any}
                      customNote={templateId === 'general' ? customBody : undefined}
                    />
                  )}
                </ViewShot>
              </View>

              {/* Captured preview */}
              {imgCaptured && (
                <View style={{ marginTop: 12, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#25D366' }}>
                  <Image source={{ uri: imgCaptured }} style={{ width: '100%', aspectRatio: 0.75 }} resizeMode="contain" />
                  <View style={{ backgroundColor: '#25D36620', padding: 8, alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
                    <Feather name="check-circle" size={14} color="#25D366" />
                    <Text style={{ color: '#25D366', fontWeight: '700', fontSize: 13 }}>Card ready to share!</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Actions */}
            <View style={[img.footer, { borderTopColor: colors.border }]}>
              {!imgCaptured ? (
                <>
                  <TouchableOpacity
                    style={[img.footBtn, { borderColor: colors.border }]}
                    onPress={() => setImgModalVisible(false)}
                  >
                    <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[img.footBtn, { flex: 2, backgroundColor: tpl.color }]}
                    onPress={captureCard}
                    disabled={imgSharing}
                    activeOpacity={0.85}
                  >
                    {imgSharing
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Feather name="camera" size={16} color="#fff" /><Text style={img.footBtnText}>Capture Card</Text></>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {imgQueue.length > 1 && (
                    <TouchableOpacity
                      style={[img.footBtn, { borderColor: colors.border }]}
                      onPress={skipToNext}
                    >
                      <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>Skip</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[img.footBtn, { borderColor: colors.border }]}
                    onPress={() => setImgCaptured(null)}
                  >
                    <Feather name="refresh-cw" size={14} color={colors.text} />
                    <Text style={{ color: colors.text, fontWeight: '600' }}>Recapture</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[img.footBtn, { flex: 2, backgroundColor: '#25D366' }]}
                    onPress={shareCard}
                    disabled={imgSharing}
                    activeOpacity={0.85}
                  >
                    {imgSharing
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <>
                          <FontAwesome5 name="whatsapp" size={16} color="#fff" />
                          <Text style={img.footBtnText}>
                            {imgQueue.length > 1 && imgQueueIdx < imgQueue.length - 1 ? 'Share & Next' : 'Share Image'}
                          </Text>
                        </>}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  headerBadge: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  accentStripe: { height: 3 },
  sectionLabel: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  fieldLabel:   { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  textArea: {
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, height: 110, lineHeight: 20,
  },

  /* Template cards */
  tplCard: {
    width: 150, borderRadius: 16, padding: 14, borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  tplIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  tplLabel:    { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  tplDesc:     { fontSize: 11, lineHeight: 14 },
  tplCheck:    { position: 'absolute', top: 10, right: 10 },

  /* Preview */
  previewWrap:   { borderRadius: 16, overflow: 'hidden' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  previewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  previewBadge:  { marginLeft: 'auto', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bubble: {
    backgroundColor: '#fff', borderRadius: 14, borderTopLeftRadius: 2, padding: 12,
    maxWidth: '92%', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  bubbleTail: {
    position: 'absolute', top: 0, left: -8,
    width: 0, height: 0,
    borderTopWidth: 10, borderTopColor: '#fff',
    borderLeftWidth: 8, borderLeftColor: 'transparent',
  },
  bubbleText: { fontSize: 12, lineHeight: 18, color: '#333', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  bubbleTime: { fontSize: 10, color: '#999', textAlign: 'right', marginTop: 6 },

  /* Recipients */
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  classChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5 },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 14, marginBottom: 8,
  },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarCircle: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  studentName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  quickBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  /* Bottom bar */
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 10,
  },
  recipientBanner: { borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10, alignItems: 'center' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 14, paddingVertical: 14,
  },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});

const img = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  progressBar: { height: 3, width: '100%' },
  progressFill: { height: 3 },
  previewLabel: { fontSize: 13, marginBottom: 12, fontWeight: '500' },
  footer: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: 'transparent',
  },
  footBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
