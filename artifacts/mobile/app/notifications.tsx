import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetAdminNotificationsQueryKey,
  getGetTeacherNotificationInboxQueryKey,
  useGetAdminNotifications,
  useGetTeacherNotificationInbox,
  useMarkTeacherNotificationRead,
  useRegisterTeacherNotificationDevice,
  useSaveDailyNotificationSchedule,
  useSendTeacherNotification,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

const C = {
  navy: "#0F2456",
  blue: "#2563EB",
  paleBlue: "#EFF6FF",
  gold: "#C8A040",
  ink: "#15213B",
  muted: "#64748B",
  border: "#E2E8F0",
  page: "#F5F7FB",
  white: "#FFFFFF",
  green: "#047857",
  paleGreen: "#ECFDF5",
  red: "#B91C1C",
  paleRed: "#FEF2F2",
};

const inputStyle = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: C.border,
  borderRadius: 12,
  backgroundColor: C.white,
  paddingHorizontal: 14,
  paddingVertical: 12,
  color: C.ink,
  fontSize: 15,
} as const;

function RecipientChooser({
  teachers,
  selected,
  onSelect,
}: {
  teachers: Array<{ id: string; name: string }>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => onSelect(null)}
        style={[s.recipientChip, selected === null && s.recipientChipActive]}
      >
        <Feather name="users" size={14} color={selected === null ? C.white : C.muted} />
        <Text style={[s.recipientText, selected === null && s.recipientTextActive]}>All teachers</Text>
      </Pressable>
      {teachers.map((teacher) => {
        const active = selected === teacher.id;
        return (
          <Pressable
            key={teacher.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(teacher.id)}
            style={[s.recipientChip, active && s.recipientChipActive]}
          >
            <Text style={[s.recipientText, active && s.recipientTextActive]} numberOfLines={1}>
              {teacher.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();
  const isAdmin = user?.role === "admin";
  const adminQuery = useGetAdminNotifications({
    query: {
      queryKey: getGetAdminNotificationsQueryKey(),
      enabled: Boolean(isAdmin),
      refetchInterval: 30_000,
    },
  });
  const inboxQuery = useGetTeacherNotificationInbox({
    query: {
      queryKey: getGetTeacherNotificationInboxQueryKey(),
      enabled: Boolean(user?.role === "teacher"),
      refetchInterval: 30_000,
    },
  });
  const [feedback, setFeedback] = useState("");
  const [sendTitle, setSendTitle] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sendTeacherId, setSendTeacherId] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleBody, setScheduleBody] = useState("");
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [scheduleTeacherId, setScheduleTeacherId] = useState<string | null>(null);
  const didHydrateSchedule = useRef(false);

  useEffect(() => {
    const schedule = adminQuery.data?.schedule;
    if (!schedule || didHydrateSchedule.current) return;
    setScheduleEnabled(schedule.enabled);
    setScheduleTitle(schedule.title);
    setScheduleBody(schedule.body);
    setScheduleTime(schedule.time);
    setScheduleTeacherId(schedule.teacherId ?? null);
    didHydrateSchedule.current = true;
  }, [adminQuery.data]);

  const sendMutation = useSendTeacherNotification({
    mutation: {
      onSuccess: (result) => {
        setFeedback(
          `Sent to ${result.inAppCount} teacher${result.inAppCount === 1 ? "" : "s"}. Push accepted: ${result.pushAccepted}.`,
        );
        setSendTitle("");
        setSendBody("");
        void adminQuery.refetch();
      },
      onError: (error) => setFeedback(errorText(error, "Could not send the notification.")),
    },
  });
  const scheduleMutation = useSaveDailyNotificationSchedule({
    mutation: {
      onSuccess: () => {
        setFeedback(scheduleEnabled ? "Daily notification schedule saved." : "Daily notification schedule turned off.");
        void adminQuery.refetch();
      },
      onError: (error) => setFeedback(errorText(error, "Could not save the daily schedule.")),
    },
  });
  const markReadMutation = useMarkTeacherNotificationRead({
    mutation: {
      onSuccess: () => void inboxQuery.refetch(),
      onError: (error) => setFeedback(errorText(error, "Could not mark this notification as read.")),
    },
  });
  const registerMutation = useRegisterTeacherNotificationDevice({
    mutation: {
      onSuccess: async () => {
        setFeedback("Push notifications are enabled on this device.");
        await inboxQuery.refetch();
      },
      onError: (error) => setFeedback(errorText(error, "Could not enable push notifications.")),
    },
  });

  const teachers = adminQuery.data?.teachers ?? [];
  const contentTop = (Platform.OS === "web" ? 20 : insets.top) + 14;
  const contentBottom = (Platform.OS === "web" ? 28 : insets.bottom) + 24;

  const sendNow = () => {
    const title = sendTitle.trim();
    const body = sendBody.trim();
    if (!title || !body) {
      setFeedback("Add a title and message before sending.");
      return;
    }
    sendMutation.mutate({ data: { title, body, teacherId: sendTeacherId } });
  };

  const saveSchedule = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)) {
      setFeedback("Enter a valid time in 24-hour format, such as 08:30.");
      return;
    }
    if (scheduleEnabled && (!scheduleTitle.trim() || !scheduleBody.trim())) {
      setFeedback("Add a title and message before enabling the daily schedule.");
      return;
    }
    scheduleMutation.mutate({
      data: {
        enabled: scheduleEnabled,
        title: scheduleTitle.trim(),
        body: scheduleBody.trim(),
        time: scheduleTime,
        teacherId: scheduleTeacherId,
      },
    });
  };

  const enablePush = async () => {
    setFeedback("");
    if (Platform.OS === "web") {
      setFeedback("Push setup is available in the installed mobile app. Your in-app inbox still works here.");
      return;
    }
    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "School notifications",
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: C.blue,
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) {
        setFeedback("Allow notifications in your device settings to receive push alerts.");
        return;
      }
      const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) throw new Error("Push notification project is not configured.");
      const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
      await registerMutation.mutateAsync({ data: { token: pushToken.data } });
    } catch (error) {
      setFeedback(errorText(error, "Could not enable push notifications on this device."));
    }
  };

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.blue} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={s.center}>
        <Feather name="lock" size={28} color={C.muted} />
        <Text style={s.emptyTitle}>Sign in to view notifications</Text>
        <Pressable style={s.primaryButton} onPress={() => router.replace("/login" as any)}>
          <Text style={s.primaryButtonText}>Go to sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={[s.pageContent, { paddingTop: contentTop, paddingBottom: contentBottom }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={s.container}>
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={s.backButton}
          >
            <Feather name="arrow-left" size={20} color={C.navy} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>{isAdmin ? "ADMIN TOOLS" : "TEACHER INBOX"}</Text>
            <Text style={s.pageTitle}>Notifications</Text>
          </View>
          <View style={s.headerIcon}>
            <Feather name="bell" size={19} color={C.blue} />
          </View>
        </View>

        {!!feedback && (
          <View style={s.feedback}>
            <Feather name="info" size={16} color={C.navy} />
            <Text style={s.feedbackText}>{feedback}</Text>
            <Pressable accessibilityLabel="Dismiss message" onPress={() => setFeedback("")}>
              <Feather name="x" size={16} color={C.muted} />
            </Pressable>
          </View>
        )}

        {isAdmin ? (
          <>
            {adminQuery.isLoading && (
              <View style={s.loadingRow}>
                <ActivityIndicator color={C.blue} />
                <Text style={s.mutedText}>Loading notification settings…</Text>
              </View>
            )}
            {adminQuery.isError && (
              <Pressable style={s.errorCard} onPress={() => void adminQuery.refetch()}>
                <Feather name="alert-circle" size={18} color={C.red} />
                <Text style={s.errorText}>Could not load notification settings. Tap to retry.</Text>
              </Pressable>
            )}

            <View style={s.card}>
              <View style={s.cardHeading}>
                <View style={[s.cardIcon, { backgroundColor: C.paleBlue }]}>
                  <Feather name="send" size={17} color={C.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Send a notification</Text>
                  <Text style={s.cardSubtitle}>Deliver now to a teacher or the whole staff.</Text>
                </View>
              </View>
              <Text style={s.fieldLabel}>Recipient</Text>
              {teachers.length > 0 ? (
                <RecipientChooser teachers={teachers} selected={sendTeacherId} onSelect={setSendTeacherId} />
              ) : (
                <Text style={s.mutedText}>No teacher accounts are available yet.</Text>
              )}
              <Text style={s.fieldLabel}>Title</Text>
              <TextInput
                value={sendTitle}
                onChangeText={setSendTitle}
                placeholder="e.g. Staff meeting"
                placeholderTextColor="#94A3B8"
                maxLength={100}
                style={inputStyle}
              />
              <Text style={s.fieldLabel}>Message</Text>
              <TextInput
                value={sendBody}
                onChangeText={setSendBody}
                placeholder="Write the announcement for teachers…"
                placeholderTextColor="#94A3B8"
                maxLength={500}
                multiline
                textAlignVertical="top"
                style={[inputStyle, { minHeight: 104 }]}
              />
              <Text style={s.characterCount}>{sendBody.length}/500</Text>
              <Pressable
                accessibilityRole="button"
                disabled={sendMutation.isPending || teachers.length === 0}
                onPress={sendNow}
                style={[s.primaryButton, (sendMutation.isPending || teachers.length === 0) && s.disabledButton]}
              >
                {sendMutation.isPending
                  ? <ActivityIndicator color={C.white} />
                  : <Feather name="send" size={16} color={C.white} />}
                <Text style={s.primaryButtonText}>
                  {sendMutation.isPending ? "Sending…" : "Send now"}
                </Text>
              </Pressable>
              <Text style={s.helperText}>Every recipient also gets this message in their app inbox.</Text>
            </View>

            <View style={s.card}>
              <View style={s.cardHeading}>
                <View style={[s.cardIcon, { backgroundColor: "#FEF3C7" }]}>
                  <Feather name="clock" size={17} color="#A16207" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Daily notification</Text>
                  <Text style={s.cardSubtitle}>Automatically send the saved message once each day.</Text>
                </View>
              </View>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabelNoMargin}>Daily schedule</Text>
                  <Text style={s.helperText}>Server time zone: {adminQuery.data?.schedule.timeZone ?? "Asia/Kolkata"}</Text>
                </View>
                <Switch
                  value={scheduleEnabled}
                  onValueChange={setScheduleEnabled}
                  trackColor={{ false: "#CBD5E1", true: C.blue }}
                  thumbColor={C.white}
                  accessibilityLabel="Enable daily notification"
                />
              </View>
              <Text style={s.fieldLabel}>Recipient</Text>
              {teachers.length > 0 ? (
                <RecipientChooser
                  teachers={teachers}
                  selected={scheduleTeacherId}
                  onSelect={setScheduleTeacherId}
                />
              ) : (
                <Text style={s.mutedText}>No teacher accounts are available yet.</Text>
              )}
              <Text style={s.fieldLabel}>Send time (24-hour)</Text>
              <TextInput
                value={scheduleTime}
                onChangeText={setScheduleTime}
                placeholder="08:30"
                placeholderTextColor="#94A3B8"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                style={inputStyle}
              />
              <Text style={s.fieldLabel}>Title</Text>
              <TextInput
                value={scheduleTitle}
                onChangeText={setScheduleTitle}
                placeholder="Daily staff reminder"
                placeholderTextColor="#94A3B8"
                maxLength={100}
                style={inputStyle}
              />
              <Text style={s.fieldLabel}>Message</Text>
              <TextInput
                value={scheduleBody}
                onChangeText={setScheduleBody}
                placeholder="Write the message that should go out each day…"
                placeholderTextColor="#94A3B8"
                maxLength={500}
                multiline
                textAlignVertical="top"
                style={[inputStyle, { minHeight: 104 }]}
              />
              <Pressable
                accessibilityRole="button"
                disabled={scheduleMutation.isPending}
                onPress={saveSchedule}
                style={[s.secondaryButton, scheduleMutation.isPending && s.disabledSecondaryButton]}
              >
                {scheduleMutation.isPending
                  ? <ActivityIndicator color={C.navy} />
                  : <Feather name="save" size={16} color={C.navy} />}
                <Text style={s.secondaryButtonText}>
                  {scheduleMutation.isPending ? "Saving…" : "Save daily schedule"}
                </Text>
              </Pressable>
              {adminQuery.data?.schedule.enabled && (
                <View style={s.scheduleStatus}>
                  <Feather name="check-circle" size={15} color={C.green} />
                  <Text style={s.scheduleStatusText}>
                    Active at {adminQuery.data.schedule.time} ·{" "}
                    {adminQuery.data.schedule.teacherId
                      ? teachers.find((teacher) => teacher.id === adminQuery.data?.schedule.teacherId)?.name ?? "one teacher"
                      : "all teachers"}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.card}>
              <View style={s.cardHeading}>
                <View style={[s.cardIcon, { backgroundColor: C.paleGreen }]}>
                  <Feather name="activity" size={17} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Recent sends</Text>
                  <Text style={s.cardSubtitle}>Latest immediate and daily notifications.</Text>
                </View>
              </View>
              {(adminQuery.data?.history.length ?? 0) === 0 ? (
                <Text style={s.emptyInline}>No notifications have been sent yet.</Text>
              ) : (
                adminQuery.data?.history.slice(0, 20).map((item) => (
                  <View key={item.id} style={s.historyItem}>
                    <View style={s.historyTop}>
                      <Text style={s.historyTitle} numberOfLines={1}>{item.title}</Text>
                      <View style={s.historyBadge}>
                        <Text style={s.historyBadgeText}>{item.source === "daily" ? "DAILY" : "SENT"}</Text>
                      </View>
                    </View>
                    <Text style={s.historyBody} numberOfLines={2}>{item.body}</Text>
                    <Text style={s.historyMeta}>
                      {item.teacherId
                        ? teachers.find((teacher) => teacher.id === item.teacherId)?.name ?? "1 teacher"
                        : `${item.recipientCount} teacher${item.recipientCount === 1 ? "" : "s"}`}
                      {" · "}{formatDate(item.sentAt)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <>
            <View style={s.pushCard}>
              <View style={[s.cardIcon, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
                <Feather name="bell" size={18} color={C.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pushTitle}>
                  {inboxQuery.data?.pushEnabled ? "Push notifications are on" : "Get school alerts"}
                </Text>
                <Text style={s.pushSubtitle}>
                  Enable push alerts on this phone. Messages also stay in your inbox.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={registerMutation.isPending}
                onPress={() => void enablePush()}
                style={s.pushButton}
              >
                {registerMutation.isPending
                  ? <ActivityIndicator color={C.navy} size="small" />
                  : <Text style={s.pushButtonText}>
                    {inboxQuery.data?.pushEnabled ? "Refresh" : "Enable"}
                  </Text>}
              </Pressable>
            </View>

            {inboxQuery.isLoading && (
              <View style={s.loadingRow}>
                <ActivityIndicator color={C.blue} />
                <Text style={s.mutedText}>Loading your inbox…</Text>
              </View>
            )}
            {inboxQuery.isError && (
              <Pressable style={s.errorCard} onPress={() => void inboxQuery.refetch()}>
                <Feather name="alert-circle" size={18} color={C.red} />
                <Text style={s.errorText}>Could not load your inbox. Tap to retry.</Text>
              </Pressable>
            )}
            <View style={s.card}>
              <View style={s.cardHeading}>
                <View style={[s.cardIcon, { backgroundColor: C.paleBlue }]}>
                  <Feather name="inbox" size={17} color={C.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Your inbox</Text>
                  <Text style={s.cardSubtitle}>Announcements from your school administrator.</Text>
                </View>
                <Text style={s.unreadCount}>
                  {inboxQuery.data?.notifications.filter((item) => !item.read).length ?? 0} new
                </Text>
              </View>
              {(inboxQuery.data?.notifications.length ?? 0) === 0 ? (
                <View style={s.emptyBox}>
                  <Feather name="bell-off" size={22} color="#94A3B8" />
                  <Text style={s.emptyTitle}>You’re all caught up</Text>
                  <Text style={s.mutedText}>New school announcements will appear here.</Text>
                </View>
              ) : (
                inboxQuery.data?.notifications.map((item) => (
                  <View key={item.id} style={[s.inboxItem, !item.read && s.inboxItemUnread]}>
                    <View style={s.inboxItemHeading}>
                      <Text style={s.inboxTitle}>{item.title}</Text>
                      {!item.read && <View style={s.unreadDot} />}
                    </View>
                    <Text style={s.inboxBody}>{item.body}</Text>
                    <View style={s.inboxBottom}>
                      <Text style={s.historyMeta}>
                        {item.source === "daily" ? "Daily reminder" : "School announcement"} · {formatDate(item.sentAt)}
                      </Text>
                      {!item.read && (
                        <Pressable
                          accessibilityRole="button"
                          disabled={markReadMutation.isPending}
                          onPress={() => markReadMutation.mutate({ id: item.id })}
                        >
                          <Text style={s.markReadText}>Mark read</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        <Text style={s.footerNote}>
          {isAdmin
            ? "Push alerts go to teachers who enabled notifications. All announcements are also saved to their app inbox."
            : "Your inbox refreshes automatically while this screen is open."}
        </Text>
      </View>
    </ScrollView>
  );
}

const s = {
  page: { flex: 1, backgroundColor: C.page },
  pageContent: { paddingHorizontal: 16 },
  container: { width: "100%" as const, maxWidth: 760, alignSelf: "center" as const, gap: 14 },
  center: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 14, backgroundColor: C.page, padding: 24 },
  header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, marginBottom: 4 },
  backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.white, alignItems: "center" as const, justifyContent: "center" as const, borderWidth: 1, borderColor: C.border },
  eyebrow: { color: C.gold, fontSize: 10, fontWeight: "800" as const, letterSpacing: 1.3 },
  pageTitle: { color: C.navy, fontSize: 24, fontWeight: "800" as const, marginTop: 2 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.paleBlue, alignItems: "center" as const, justifyContent: "center" as const },
  feedback: { flexDirection: "row" as const, alignItems: "center" as const, gap: 9, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: "#E8F0FF" },
  feedbackText: { color: C.navy, fontSize: 13, fontWeight: "600" as const, flex: 1, lineHeight: 19 },
  card: { padding: 17, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, gap: 12 },
  cardHeading: { flexDirection: "row" as const, alignItems: "center" as const, gap: 11, marginBottom: 2 },
  cardIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center" as const, justifyContent: "center" as const },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: "800" as const },
  cardSubtitle: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  fieldLabel: { color: C.ink, fontSize: 13, fontWeight: "700" as const, marginTop: 2 },
  fieldLabelNoMargin: { color: C.ink, fontSize: 14, fontWeight: "700" as const },
  recipientChip: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, minHeight: 36, borderRadius: 20, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, maxWidth: 190 },
  recipientChipActive: { backgroundColor: C.navy, borderColor: C.navy },
  recipientText: { color: C.muted, fontSize: 12, fontWeight: "700" as const, flexShrink: 1 },
  recipientTextActive: { color: C.white },
  characterCount: { color: "#94A3B8", fontSize: 11, textAlign: "right" as const, marginTop: -7 },
  primaryButton: { minHeight: 48, borderRadius: 13, backgroundColor: C.blue, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 9, paddingHorizontal: 16 },
  primaryButtonText: { color: C.white, fontSize: 14, fontWeight: "800" as const },
  disabledButton: { opacity: 0.55 },
  secondaryButton: { minHeight: 48, borderRadius: 13, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 9, paddingHorizontal: 16 },
  secondaryButtonText: { color: C.navy, fontSize: 14, fontWeight: "800" as const },
  disabledSecondaryButton: { opacity: 0.55 },
  helperText: { color: C.muted, fontSize: 11, lineHeight: 16 },
  switchRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingVertical: 4 },
  scheduleStatus: { flexDirection: "row" as const, alignItems: "center" as const, gap: 7, padding: 10, borderRadius: 10, backgroundColor: C.paleGreen },
  scheduleStatusText: { color: C.green, fontSize: 12, fontWeight: "700" as const, flex: 1 },
  historyItem: { borderTopWidth: 1, borderColor: C.border, paddingTop: 12, gap: 5 },
  historyTop: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  historyTitle: { flex: 1, color: C.ink, fontSize: 14, fontWeight: "700" as const },
  historyBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: C.paleBlue },
  historyBadgeText: { color: C.blue, fontSize: 9, fontWeight: "800" as const, letterSpacing: 0.5 },
  historyBody: { color: "#475569", fontSize: 13, lineHeight: 19 },
  historyMeta: { color: "#94A3B8", fontSize: 10, lineHeight: 15 },
  emptyInline: { color: C.muted, fontSize: 13, paddingVertical: 8 },
  pushCard: { flexDirection: "row" as const, alignItems: "center" as const, gap: 11, padding: 15, borderRadius: 18, backgroundColor: C.navy },
  pushTitle: { color: C.white, fontSize: 14, fontWeight: "800" as const },
  pushSubtitle: { color: "#CBD5E1", fontSize: 11, lineHeight: 16, marginTop: 3 },
  pushButton: { minWidth: 68, height: 38, paddingHorizontal: 11, borderRadius: 11, backgroundColor: C.white, alignItems: "center" as const, justifyContent: "center" as const },
  pushButtonText: { color: C.navy, fontSize: 12, fontWeight: "800" as const },
  unreadCount: { color: C.blue, fontSize: 11, fontWeight: "800" as const, backgroundColor: C.paleBlue, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  emptyBox: { alignItems: "center" as const, paddingVertical: 28, gap: 8 },
  emptyTitle: { color: C.ink, fontSize: 16, fontWeight: "800" as const },
  inboxItem: { borderTopWidth: 1, borderColor: C.border, paddingTop: 13, gap: 8 },
  inboxItemUnread: { borderLeftWidth: 3, borderLeftColor: C.blue, paddingLeft: 10 },
  inboxItemHeading: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  inboxTitle: { flex: 1, color: C.ink, fontSize: 15, fontWeight: "800" as const },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue },
  inboxBody: { color: "#475569", fontSize: 13, lineHeight: 20 },
  inboxBottom: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 8 },
  markReadText: { color: C.blue, fontSize: 11, fontWeight: "800" as const },
  loadingRow: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 9, padding: 12 },
  mutedText: { color: C.muted, fontSize: 12, lineHeight: 18 },
  errorCard: { flexDirection: "row" as const, gap: 9, alignItems: "center" as const, borderRadius: 12, padding: 13, backgroundColor: C.paleRed },
  errorText: { color: C.red, fontSize: 12, fontWeight: "600" as const, flex: 1 },
  footerNote: { color: "#94A3B8", fontSize: 11, lineHeight: 16, textAlign: "center" as const, paddingHorizontal: 8 },
};
