import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Linking, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import {
  TeacherAttendanceRecord, TeacherLeaveApplication, useApp,
} from '@/context/AppContext';
import EmptyState from '@/components/EmptyState';

type Tab = 'today' | 'history' | 'leave';
type Coordinates = { latitude: number; longitude: number };

function getWebLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => reject(new Error(error.message || 'Could not read your location')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

async function readCurrentLocation(): Promise<Coordinates> {
  if (Platform.OS === 'web') return getWebLocation();
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Location permission is required to mark attendance');
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}

type FaceCapturePurpose = 'enroll' | 'check-in' | 'check-out';

function jpegDataUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(',');
  const payload = (commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed)
    .replace(/\s/g, '');

  // JPEG files start with FF D8 FF, which is /9j/ in base64. Rejecting other
  // formats here prevents Android camera payloads from being mislabeled as
  // JPEGs and then rejected by the API decoder.
  if (!payload.startsWith('/9j/')) return null;
  return `data:image/jpeg;base64,${payload}`;
}

async function getFaceImageBase64(photo: { uri?: string; base64?: string }): Promise<string> {
  const candidates: string[] = [];

  if (photo.uri && Platform.OS !== 'web') {
    // Some Android devices return a base64 field that is truncated or cannot
    // be decoded by the server. Re-encode the actual captured file as a
    // standard JPEG before uploading it. Read the resulting file first:
    // ImageManipulator's inline base64 field is not reliable on every device.
    try {
      const normalized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      try {
        candidates.push(await FileSystem.readAsStringAsync(
          normalized.uri,
          { encoding: FileSystem.EncodingType.Base64 },
        ));
      } catch {
        if (normalized.base64) candidates.push(normalized.base64);
      }
    } catch {
      // Keep the direct camera payload as a fallback if image manipulation
      // is unavailable on a particular Expo Go/native build.
      try {
        candidates.push(await FileSystem.readAsStringAsync(
          photo.uri,
          { encoding: FileSystem.EncodingType.Base64 },
        ));
      } catch {
        if (photo.base64) candidates.push(photo.base64);
      }
    }
  }

  if (photo.base64) candidates.push(photo.base64);
  if (photo.uri && Platform.OS === 'web' && !photo.base64) {
    throw new Error('The camera did not return an image. Please try again.');
  }

  for (const candidate of candidates) {
    const jpeg = jpegDataUrl(candidate);
    if (jpeg) return jpeg;
  }

  throw new Error('The camera returned an unreadable photo. Please keep your face centered and try again.');
}

function FaceCaptureModal({
  visible,
  purpose,
  onCancel,
  onCaptured,
}: {
  visible: boolean;
  purpose: FaceCapturePurpose;
  onCancel: () => void;
  onCaptured: (imageBase64: string) => Promise<void>;
}) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const cameraRef = useRef<CameraView>(null);
  const scanProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setCameraReady(false);
      setCameraError('');
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanProgress, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(scanProgress, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [scanProgress, visible]);

  const takeFacePhoto = async () => {
    if (!cameraRef.current || !cameraReady || capturing) return;
    setCameraError('');
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        // The file URI is normalized to a known-good JPEG below. Keeping the
        // camera's own base64 as a fallback also preserves web compatibility.
        base64: true,
        quality: 0.3,
        skipProcessing: false,
      });
      const imageBase64 = await getFaceImageBase64(photo);
      await onCaptured(imageBase64);
    } catch (error: any) {
      setCameraError(error?.message ?? 'Could not capture your face. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const title = purpose === 'enroll' ? 'Set up face verification' : 'Verify your face';
  const description = purpose === 'enroll'
    ? 'This private scan will be used to recognize you at check-in and check-out.'
    : purpose === 'check-in' ? 'Look at the camera to check in automatically.' : 'Look at the camera to check out automatically.';
  const needsSettings = permission?.status === 'denied' && permission.canAskAgain === false;
  const scanLineY = scanProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 230] });
  const scanLineOpacity = scanProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1, 0.35] });
  const cs = cameraStyles(colors);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View style={cs.root}>
        {permission?.granted ? (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode="picture"
              onCameraReady={() => setCameraReady(true)}
              onMountError={(event) => setCameraError(event.message)}
            />
            <View style={cs.cameraShade} pointerEvents="none" />
            <View style={cs.topBar}>
              <TouchableOpacity style={cs.roundButton} onPress={onCancel} accessibilityLabel="Close face camera">
                <Feather name="x" size={21} color={colors.primaryForeground} />
              </TouchableOpacity>
              <View style={cs.livePill}>
                <View style={cs.liveDot} />
                <Text style={cs.liveText}>LIVE CAMERA</Text>
              </View>
              <TouchableOpacity
                style={cs.roundButton}
                onPress={() => setFacing(current => current === 'front' ? 'back' : 'front')}
                accessibilityLabel="Switch camera"
              >
                <Feather name="refresh-cw" size={19} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>

            <View style={cs.guideArea} pointerEvents="none">
              <View style={cs.scanFrame}>
                <View style={[cs.corner, cs.cornerTopLeft]} />
                <View style={[cs.corner, cs.cornerTopRight]} />
                <View style={[cs.corner, cs.cornerBottomLeft]} />
                <View style={[cs.corner, cs.cornerBottomRight]} />
                <Animated.View style={[cs.scanLine, { transform: [{ translateY: scanLineY }], opacity: scanLineOpacity }]} />
              </View>
              <Text style={cs.guideTitle}>Center your face in the frame</Text>
              <Text style={cs.guideCopy}>Keep your eyes visible and use good lighting</Text>
            </View>

            <View style={cs.bottomPanel}>
              <View style={cs.bottomCopy}>
                <Text style={cs.title}>{title}</Text>
                <Text style={cs.description}>{description}</Text>
              </View>
              {cameraError ? (
                <View style={cs.cameraError}>
                  <Feather name="alert-circle" size={15} color={colors.destructive} />
                  <Text style={cs.cameraErrorText}>{cameraError}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[cs.shutter, (!cameraReady || capturing) && cs.shutterDisabled]}
                onPress={takeFacePhoto}
                disabled={!cameraReady || capturing}
                accessibilityLabel="Capture face"
              >
                {capturing ? <ActivityIndicator color={colors.primary} /> : <View style={cs.shutterInner} />}
              </TouchableOpacity>
              <Text style={cs.hint}>{capturing ? 'Checking securely…' : 'Tap to capture'}</Text>
            </View>
          </>
        ) : (
          <View style={cs.permissionPanel}>
            <TouchableOpacity style={cs.permissionClose} onPress={onCancel} accessibilityLabel="Close">
              <Feather name="x" size={21} color={colors.text} />
            </TouchableOpacity>
            <View style={cs.permissionIcon}>
              <Feather name="camera" size={31} color={colors.primary} />
            </View>
            <Text style={cs.permissionTitle}>Camera access needed</Text>
            <Text style={cs.permissionCopy}>
              School Management uses the camera only to create or verify your private attendance face template.
            </Text>
            <TouchableOpacity
              style={cs.permissionButton}
              onPress={() => {
                if (needsSettings && Platform.OS !== 'web') {
                  Linking.openSettings().catch(() => undefined);
                } else {
                  requestPermission();
                }
              }}
            >
              <Feather name={needsSettings ? 'settings' : 'camera'} size={18} color={colors.primaryForeground} />
              <Text style={cs.permissionButtonText}>{needsSettings ? 'Open device settings' : 'Allow camera access'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} style={cs.permissionCancel}>
              <Text style={cs.permissionCancelText}>Not now</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

type FaceResultKind = 'success' | 'error';

function FaceResultModal({
  visible,
  kind,
  purpose,
  message,
  onRetry,
  onDismiss,
}: {
  visible: boolean;
  kind: FaceResultKind;
  purpose: 'check-in' | 'check-out';
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const success = kind === 'success';
  const resultColor = success ? colors.success : colors.destructive;
  const resultBackground = success ? colors.success + '18' : colors.destructive + '18';
  const title = success
    ? purpose === 'check-in' ? 'Attendance marked' : 'Check-out complete'
    : 'Face not recognized';
  const description = success
    ? purpose === 'check-in'
      ? 'Your face matched securely and your attendance has been recorded.'
      : 'Your face matched securely and your check-out has been recorded.'
    : 'We could not verify this face. Make sure you are centered, well lit, and try again.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={success ? undefined : onDismiss}>
      <View style={[resultStyles.backdrop, { backgroundColor: colors.primary + 'E6' }]}>
        <View style={[resultStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[resultStyles.iconHalo, { backgroundColor: resultBackground }]}>
            <View style={[resultStyles.iconCircle, { backgroundColor: resultColor }]}>
              <Feather name={success ? 'check' : 'alert-circle'} size={30} color={colors.primaryForeground} />
            </View>
          </View>
          <View style={[resultStyles.statusPill, { backgroundColor: resultBackground }]}>
            <View style={[resultStyles.statusDot, { backgroundColor: resultColor }]} />
            <Text style={[resultStyles.statusText, { color: resultColor }]}>
              {success ? 'VERIFIED SECURELY' : 'VERIFICATION NEEDED'}
            </Text>
          </View>
          <Text style={[resultStyles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[resultStyles.description, { color: colors.mutedForeground }]}>
            {success ? description : message || description}
          </Text>

          {success ? (
            <View style={[resultStyles.redirectNote, { backgroundColor: colors.muted }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[resultStyles.redirectText, { color: colors.mutedForeground }]}>
                Returning to your dashboard…
              </Text>
            </View>
          ) : (
            <View style={resultStyles.actions}>
              <TouchableOpacity
                style={[resultStyles.retryButton, { backgroundColor: colors.primary }]}
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel="Try face verification again"
              >
                <Feather name="camera" size={17} color={colors.primaryForeground} />
                <Text style={[resultStyles.retryButtonText, { color: colors.primaryForeground }]}>Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={resultStyles.dismissButton}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel="Close face verification message"
              >
                <Text style={[resultStyles.dismissButtonText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function formatTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MyTeacherAttendance() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    teacherAttendanceRecords, teacherLeaves, teacherAttendanceSettings,
    refreshTeacherAttendance, getTeacherFaceStatus, enrollTeacherFace,
    checkInTeacher, checkOutTeacher, applyTeacherLeave,
    updateTeacherLeave, deleteTeacherLeave,
  } = useApp();
  const [tab, setTab] = useState<Tab>('today');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null);
  const [faceCaptureMode, setFaceCaptureMode] = useState<FaceCapturePurpose | null>(null);
  const [faceResult, setFaceResult] = useState<FaceResultKind | null>(null);
  const [faceResultPurpose, setFaceResultPurpose] = useState<'check-in' | 'check-out'>('check-in');
  const [faceResultMessage, setFaceResultMessage] = useState('');
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [leaveStart, setLeaveStart] = useState(new Date().toISOString().slice(0, 10));
  const [leaveEnd, setLeaveEnd] = useState(new Date().toISOString().slice(0, 10));
  const [leaveReason, setLeaveReason] = useState('');
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const myRecords = useMemo(
    () => teacherAttendanceRecords
      .filter(record => record.teacherId === user?.id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [teacherAttendanceRecords, user?.id],
  );
  const todayRecord = myRecords.find(record => record.date === today);
  const myLeaves = useMemo(
    () => teacherLeaves.filter(leave => leave.teacherId === user?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [teacherLeaves, user?.id],
  );

  useEffect(() => {
    if (user?.id) refreshTeacherAttendance(user.id).catch(error => console.error('[TeacherAttendance]', error));
  }, [refreshTeacherAttendance, user?.id]);

  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  useEffect(() => {
    if (!user?.id || !teacherAttendanceSettings.requireFaceVerification) {
      setFaceEnrolled(true);
      return;
    }
    let active = true;
    setError('');
    setFaceEnrolled(null);
    getTeacherFaceStatus(user.id)
      .then(enrolled => { if (active) setFaceEnrolled(enrolled); })
      .catch((e: any) => {
        if (!active) return;
        // A status-read failure must not leave the teacher on an infinite
        // loading screen. Showing setup is safe because the enrollment API
        // refuses duplicate profiles and persists before returning success.
        setFaceEnrolled(false);
        setError(e?.message ?? 'Could not check face verification status. You can try setting up your face now.');
      })
      .finally(() => undefined);
    return () => { active = false; };
  }, [getTeacherFaceStatus, teacherAttendanceSettings.requireFaceVerification, user?.id]);

  const runAction = async (
    action: () => Promise<void>,
    feedback?: { onSuccess?: () => void; onError?: (message: string) => void },
  ) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      feedback?.onSuccess?.();
    } catch (e: any) {
      const message = e?.message ?? 'Something went wrong';
      setError(message);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      feedback?.onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  const showFaceResult = (kind: FaceResultKind, purpose: 'check-in' | 'check-out', message = '') => {
    setFaceResultPurpose(purpose);
    setFaceResultMessage(message);
    setFaceResult(kind);
    if (kind === 'success') {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
      redirectTimer.current = setTimeout(() => {
        setFaceResult(null);
        router.replace('/teacher');
      }, 1900);
    }
  };

  const handleFaceCaptured = async (faceImageBase64: string) => {
    const purpose = faceCaptureMode;
    setFaceCaptureMode(null);
    if (!purpose || !user) return;
    await runAction(async () => {
      if (purpose === 'enroll') {
        await enrollTeacherFace(user.id, faceImageBase64);
        setFaceEnrolled(true);
        return;
      }
      const coordinates = await readCurrentLocation();
      if (purpose === 'check-in') {
        await checkInTeacher({
          teacherId: user.id,
          teacherName: user.name,
          ...coordinates,
          faceVerified: true,
          faceVerificationMethod: 'camera_face_match',
          faceImageBase64,
        });
      } else {
        if (!todayRecord) throw new Error('No check-in found for today');
        await checkOutTeacher(todayRecord.id, {
          teacherId: user.id,
          ...coordinates,
          faceImageBase64,
        });
      }
    }, {
      onSuccess: () => {
        if (purpose !== 'enroll') showFaceResult('success', purpose);
      },
      onError: message => {
        if (purpose !== 'enroll' && /face did not match|face verification failed/i.test(message)) {
          setError('');
          showFaceResult(
            'error',
            purpose,
            'Your face did not match the enrolled profile. Please try again with your face centered in the frame.',
          );
        }
      },
    });
  };

  const handleCheckIn = () => {
    if (teacherAttendanceSettings.requireFaceVerification) {
      setError('');
      setFaceCaptureMode('check-in');
      return;
    }
    runAction(async () => {
      if (!user) throw new Error('Please sign in again');
      const coordinates = await readCurrentLocation();
      await checkInTeacher({
        teacherId: user.id,
        teacherName: user.name,
        ...coordinates,
        faceVerified: false,
        faceVerificationMethod: 'disabled_by_admin',
      });
    });
  };

  const handleCheckOut = () => {
    if (teacherAttendanceSettings.requireFaceVerification) {
      setError('');
      setFaceCaptureMode('check-out');
      return;
    }
    runAction(async () => {
      if (!todayRecord) throw new Error('No check-in found for today');
      const coordinates = await readCurrentLocation();
      await checkOutTeacher(todayRecord.id, { teacherId: user?.id ?? '', ...coordinates });
    });
  };

  const handleLeave = () => runAction(async () => {
    if (!user) throw new Error('Please sign in again');
    if (!leaveStart || !leaveEnd || leaveStart > leaveEnd || !leaveReason.trim()) {
      throw new Error('Enter a valid date range and reason');
    }
    if (editingLeaveId) {
      await updateTeacherLeave(editingLeaveId, {
        teacherId: user.id, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason.trim(),
      });
    } else {
      await applyTeacherLeave({
        teacherId: user.id, teacherName: user.name, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason.trim(),
      });
    }
    setEditingLeaveId(null);
    setLeaveStart(today);
    setLeaveEnd(today);
    setLeaveReason('');
    Alert.alert(
      editingLeaveId ? 'Application updated' : 'Application sent',
      editingLeaveId ? 'Your pending leave application was updated.' : 'Your leave application is waiting for admin approval.',
    );
  });

  const editLeave = (leave: TeacherLeaveApplication) => {
    setEditingLeaveId(leave.id);
    setLeaveStart(leave.startDate);
    setLeaveEnd(leave.endDate);
    setLeaveReason(leave.reason);
  };

  const cancelLeaveEdit = () => {
    setEditingLeaveId(null);
    setLeaveStart(today);
    setLeaveEnd(today);
    setLeaveReason('');
  };

  const removeLeave = (leave: TeacherLeaveApplication) => {
    if (!user) return;
    const remove = () => runAction(() => deleteTeacherLeave(leave.id, user.id));
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this pending leave application?')) remove();
      return;
    }
    Alert.alert('Delete application?', 'This pending leave application will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
  };

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom + 24;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.card, paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.replace('/teacher')} style={s.backButton}>
          <Feather name="arrow-left" size={22} color={colors.cardForeground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: colors.cardForeground }]}>My Attendance</Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>GPS + face verification</Text>
        </View>
        <TouchableOpacity onPress={() => refreshTeacherAttendance(user?.id)} style={s.iconButton}>
          <Feather name="refresh-cw" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[s.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          ['today', 'Today'], ['history', 'History'], ['leave', 'Leave'],
        ] as [Tab, string][]).map(([value, label]) => (
          <TouchableOpacity key={value} onPress={() => setTab(value)} style={[s.tab, tab === value && { borderBottomColor: colors.primary }]}>
            <Text style={[s.tabText, { color: tab === value ? colors.primary : colors.mutedForeground }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={[s.error, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive }]}>
          <Feather name="alert-circle" size={16} color={colors.destructive} />
          <Text style={[s.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}

      {tab === 'today' && (
        faceEnrolled === null ? (
          <View style={s.loadingState}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Preparing secure face verification…</Text>
          </View>
        ) : !faceEnrolled && teacherAttendanceSettings.requireFaceVerification ? (
          <ScrollView contentContainerStyle={[s.setupScroll, { paddingBottom: bottomPad }]}>
            <View style={[s.setupPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.setupOrb, { backgroundColor: colors.secondary }]}>
                <View style={[s.setupOrbInner, { backgroundColor: colors.primary }]}>
                  <Feather name="user-check" size={30} color={colors.primaryForeground} />
                </View>
              </View>
              <View style={[s.setupBadge, { backgroundColor: colors.accent + '18' }]}>
                <View style={[s.setupBadgeDot, { backgroundColor: colors.accent }]} />
                <Text style={[s.setupBadgeText, { color: colors.accentForeground }]}>ONE-TIME SETUP</Text>
              </View>
              <Text style={[s.setupTitle, { color: colors.text }]}>Set up face verification</Text>
              <Text style={[s.setupCopy, { color: colors.mutedForeground }]}>
                Create your private face template once. After that, a quick in-app scan will verify you and mark attendance automatically.
              </Text>
              <View style={s.setupSteps}>
                {[
                  ['camera', 'Scan your face in the built-in camera'],
                  ['shield', 'Your original photo is never stored'],
                  ['check-circle', 'Use it for check-in and check-out'],
                ].map(([icon, label]) => (
                  <View key={label} style={s.setupStep}>
                    <View style={[s.setupStepIcon, { backgroundColor: colors.muted }]}>
                      <Feather name={icon as any} size={15} color={colors.primary} />
                    </View>
                    <Text style={[s.setupStepText, { color: colors.text }]}>{label}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[s.primaryButton, { backgroundColor: busy ? colors.muted : colors.primary }]}
                disabled={busy}
                onPress={() => { setError(''); setFaceCaptureMode('enroll'); }}
              >
                <Feather name="camera" size={18} color={colors.primaryForeground} />
                <Text style={s.primaryButtonText}>{busy ? 'Preparing…' : 'Scan my face'}</Text>
              </TouchableOpacity>
              <Text style={[s.setupPrivacy, { color: colors.mutedForeground }]}>
                <Feather name="lock" size={12} color={colors.mutedForeground} /> Encrypted template · private to your account
              </Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
            <View style={[s.hero, { backgroundColor: colors.primary }]}>
              <View style={s.heroIcon}><Feather name="shield" size={26} color={colors.primary} /></View>
              <Text style={s.heroTitle}>{todayRecord ? (todayRecord.status === 'late' ? 'Checked in late' : 'Checked in') : 'Ready to check in?'}</Text>
              <Text style={s.heroCopy}>Your location must be within {teacherAttendanceSettings.radiusMeters}m of school.</Text>
            </View>

            <View style={[s.recordCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.recordRow}>
                <View style={[s.recordIcon, { backgroundColor: todayRecord ? colors.success + '18' : colors.muted }]}>
                  <Feather name={todayRecord ? 'check-circle' : 'clock'} size={20} color={todayRecord ? colors.success : colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.recordLabel, { color: colors.mutedForeground }]}>Today · {today}</Text>
                  <Text style={[s.recordValue, { color: colors.text }]}>
                    {todayRecord ? (todayRecord.status === 'late' ? 'Late' : 'Present') : 'Not marked'}
                  </Text>
                </View>
                {todayRecord?.distanceFromSchool !== undefined && (
                  <Text style={[s.distance, { color: colors.mutedForeground }]}>{Math.round(todayRecord.distanceFromSchool)}m away</Text>
                )}
              </View>
              <View style={[s.timeGrid, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.smallLabel, { color: colors.mutedForeground }]}>CHECK-IN</Text>
                  <Text style={[s.time, { color: colors.text }]}>{formatTime(todayRecord?.checkInAt)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.smallLabel, { color: colors.mutedForeground }]}>CHECK-OUT</Text>
                  <Text style={[s.time, { color: colors.text }]}>{formatTime(todayRecord?.checkOutAt)}</Text>
                </View>
              </View>
            </View>

            {!todayRecord ? (
              <TouchableOpacity style={[s.primaryButton, { backgroundColor: busy ? colors.muted : colors.primary }]} disabled={busy} onPress={handleCheckIn}>
                <Feather name="camera" size={18} color={colors.primaryForeground} />
                <Text style={s.primaryButtonText}>{busy ? 'Verifying…' : 'Verify face & check in'}</Text>
              </TouchableOpacity>
            ) : !todayRecord.checkOutAt ? (
              <TouchableOpacity style={[s.secondaryButton, { borderColor: colors.primary }]} disabled={busy} onPress={handleCheckOut}>
                <Feather name="log-out" size={18} color={colors.primary} />
                <Text style={[s.secondaryButtonText, { color: colors.primary }]}>{busy ? 'Verifying…' : 'Verify face & check out'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={[s.complete, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <Text style={[s.completeText, { color: colors.success }]}>Attendance complete for today</Text>
              </View>
            )}

            <View style={[s.info, { backgroundColor: colors.muted }]}>
              <Feather name="info" size={15} color={colors.mutedForeground} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                Your private face template is matched in the camera flow. The original photos are not stored.
              </Text>
            </View>
          </ScrollView>
        )
      )}

      {tab === 'history' && (
        <FlatList
          data={myRecords}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon="calendar" title="No Attendance Yet" subtitle="Your check-in history will appear here" />}
          renderItem={({ item }) => (
            <View style={[s.historyRow, { backgroundColor: colors.card }]}>
              <View style={[s.dateBadge, { backgroundColor: item.status === 'late' ? colors.warning + '18' : colors.success + '18' }]}>
                <Text style={[s.dateDay, { color: item.status === 'late' ? colors.warning : colors.success }]}>{item.date.slice(-2)}</Text>
                <Text style={[s.dateMonth, { color: colors.mutedForeground }]}>{item.date.slice(5, 7)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.historyTitle, { color: colors.text }]}>{item.status === 'late' ? 'Late' : 'Present'}</Text>
                <Text style={[s.historyMeta, { color: colors.mutedForeground }]}>In {formatTime(item.checkInAt)} · Out {formatTime(item.checkOutAt)}</Text>
              </View>
              <Text style={[s.statusText, { color: item.status === 'late' ? colors.warning : colors.success }]}>{item.status.toUpperCase()}</Text>
            </View>
          )}
        />
      )}

      {tab === 'leave' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Apply for leave</Text>
          {([
            ['Start date', leaveStart, setLeaveStart],
            ['End date', leaveEnd, setLeaveEnd],
          ] as [string, string, (value: string) => void][]).map(([label, value, setter]) => (
            <View key={label} style={s.field}>
              <Text style={[s.label, { color: colors.text }]}>{label}</Text>
              <TextInput value={value} onChangeText={setter} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} />
            </View>
          ))}
          <View style={s.field}>
            <Text style={[s.label, { color: colors.text }]}>Reason</Text>
            <TextInput value={leaveReason} onChangeText={setLeaveReason} multiline numberOfLines={4} textAlignVertical="top" placeholder="Why do you need leave?" placeholderTextColor={colors.mutedForeground} style={[s.input, s.multiline, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} />
          </View>
          <TouchableOpacity style={[s.primaryButton, { backgroundColor: busy ? colors.muted : colors.primary }]} disabled={busy} onPress={handleLeave}>
            <Feather name={editingLeaveId ? 'save' : 'send'} size={17} color="#fff" />
            <Text style={s.primaryButtonText}>{busy ? (editingLeaveId ? 'Saving…' : 'Sending…') : (editingLeaveId ? 'Save changes' : 'Send application')}</Text>
          </TouchableOpacity>
          {editingLeaveId && (
            <TouchableOpacity style={[s.cancelButton, { borderColor: colors.border }]} disabled={busy} onPress={cancelLeaveEdit}>
              <Text style={[s.cancelButtonText, { color: colors.mutedForeground }]}>Cancel edit</Text>
            </TouchableOpacity>
          )}

          <Text style={[s.sectionTitle, { color: colors.text, marginTop: 28 }]}>My applications</Text>
          {myLeaves.length === 0 ? <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No leave applications yet.</Text> : myLeaves.map((leave: TeacherLeaveApplication) => (
            <View key={leave.id} style={[s.leaveRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.historyTitle, { color: colors.text }]}>{leave.startDate} → {leave.endDate}</Text>
                <Text style={[s.historyMeta, { color: colors.mutedForeground }]}>{leave.reason}</Text>
                {leave.status === 'pending' && <Text style={[s.pendingHint, { color: colors.mutedForeground }]}>You can edit or delete while pending.</Text>}
              </View>
              <View style={s.leaveSide}>
                <Text style={[s.statusText, { color: leave.status === 'approved' ? colors.success : leave.status === 'rejected' ? colors.destructive : colors.warning }]}>{leave.status.toUpperCase()}</Text>
                {leave.status === 'pending' && (
                  <View style={s.leaveActions}>
                    <TouchableOpacity style={[s.leaveAction, { borderColor: colors.primary }]} disabled={busy} onPress={() => editLeave(leave)} hitSlop={6}>
                      <Feather name="edit-2" size={12} color={colors.primary} />
                      <Text style={[s.leaveActionText, { color: colors.primary }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.leaveAction, { borderColor: colors.destructive }]} disabled={busy} onPress={() => removeLeave(leave)} hitSlop={6}>
                      <Feather name="trash-2" size={12} color={colors.destructive} />
                      <Text style={[s.leaveActionText, { color: colors.destructive }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      <FaceCaptureModal
        visible={faceCaptureMode !== null}
        purpose={faceCaptureMode ?? 'check-in'}
        onCancel={() => setFaceCaptureMode(null)}
        onCaptured={handleFaceCaptured}
      />
      <FaceResultModal
        visible={faceResult !== null}
        kind={faceResult ?? 'error'}
        purpose={faceResultPurpose}
        message={faceResultMessage}
        onRetry={() => {
          setFaceResult(null);
          setFaceResultMessage('');
          setError('');
          setFaceCaptureMode(faceResultPurpose);
        }}
        onDismiss={() => {
          setFaceResult(null);
          setFaceResultMessage('');
        }}
      />
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backButton: { width: 36, height: 36, justifyContent: 'center' },
  iconButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 12 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '700' },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 16, marginBottom: 0, padding: 11, borderRadius: 10, borderWidth: 1 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13 },
  setupScroll: { padding: 16, flexGrow: 1, justifyContent: 'center' },
  setupPanel: { borderRadius: 24, borderWidth: 1, padding: 22, alignItems: 'center', shadowColor: '#0C1F4A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  setupOrb: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  setupOrbInner: { width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  setupBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
  setupBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  setupBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  setupTitle: { fontSize: 23, fontWeight: '800', textAlign: 'center' },
  setupCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9, marginBottom: 20 },
  setupSteps: { width: '100%', gap: 10, marginBottom: 20 },
  setupStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  setupStepIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  setupStepText: { fontSize: 13, fontWeight: '600', flex: 1 },
  setupPrivacy: { fontSize: 11, marginTop: 1 },
  hero: { borderRadius: 18, padding: 18, marginBottom: 14 },
  heroIcon: { backgroundColor: '#fff', width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  heroCopy: { color: '#E0E7FF', fontSize: 13, marginTop: 5, lineHeight: 18 },
  recordCard: { borderRadius: 16, borderWidth: 1, marginBottom: 14 },
  recordRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  recordIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recordLabel: { fontSize: 12 },
  recordValue: { fontSize: 18, fontWeight: '800', marginTop: 3 },
  distance: { fontSize: 11 },
  timeGrid: { flexDirection: 'row', padding: 16, borderTopWidth: 1 },
  smallLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  time: { fontSize: 18, fontWeight: '700', marginTop: 5 },
  primaryButton: { minHeight: 54, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, marginBottom: 12 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondaryButton: { minHeight: 54, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, marginBottom: 12 },
  secondaryButtonText: { fontSize: 15, fontWeight: '800' },
  complete: { minHeight: 54, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 12 },
  completeText: { fontSize: 14, fontWeight: '700' },
  info: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
  historyRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 13, marginBottom: 9, gap: 12 },
  dateBadge: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  dateDay: { fontSize: 17, fontWeight: '800' },
  dateMonth: { fontSize: 10, marginTop: -2 },
  historyTitle: { fontSize: 14, fontWeight: '700' },
  historyMeta: { fontSize: 12, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  multiline: { minHeight: 100 },
  emptyText: { fontSize: 13 },
  cancelButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  cancelButtonText: { fontSize: 13, fontWeight: '700' },
  leaveRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 13, padding: 13, marginBottom: 9, gap: 10 },
  leaveSide: { alignItems: 'flex-end', gap: 8 },
  leaveActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leaveAction: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 6 },
  leaveActionText: { fontSize: 10, fontWeight: '800' },
  pendingHint: { fontSize: 10, marginTop: 5 },
});

const resultStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 20,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  iconHalo: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginBottom: 13,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
  },
  redirectNote: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 13,
    paddingVertical: 12,
    marginTop: 21,
  },
  redirectText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    marginTop: 21,
  },
  retryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  dismissButton: {
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  dismissButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

const cameraStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080B12' },
  cameraShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,9,18,0.28)' },
  topBar: { position: 'absolute', left: 18, right: 18, top: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(8,11,18,0.62)', alignItems: 'center', justifyContent: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(8,11,18,0.62)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.success },
  liveText: { color: c.primaryForeground, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  guideArea: { position: 'absolute', top: '24%', left: 0, right: 0, alignItems: 'center' },
  scanFrame: { width: 250, height: 250, borderRadius: 125, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: c.primaryForeground },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 20 },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 20 },
  cornerBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 20 },
  cornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 20 },
  scanLine: { position: 'absolute', left: 18, right: 18, top: 0, height: 2, backgroundColor: c.primaryForeground },
  guideTitle: { color: c.primaryForeground, fontSize: 16, fontWeight: '800', marginTop: 22 },
  guideCopy: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 6 },
  bottomPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 34, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: 'rgba(8,11,18,0.9)' },
  bottomCopy: { alignItems: 'center', marginBottom: 13 },
  title: { color: c.primaryForeground, fontSize: 19, fontWeight: '800' },
  description: { color: 'rgba(255,255,255,0.72)', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 5 },
  cameraError: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.15)', marginBottom: 12 },
  cameraErrorText: { color: c.primaryForeground, flex: 1, fontSize: 12 },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: c.primaryForeground, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  shutterDisabled: { opacity: 0.45 },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: c.primaryForeground },
  hint: { color: 'rgba(255,255,255,0.58)', fontSize: 11, textAlign: 'center', marginTop: 9 },
  permissionPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: c.background },
  permissionClose: { position: 'absolute', top: 56, right: 18, width: 44, height: 44, borderRadius: 22, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' },
  permissionIcon: { width: 78, height: 78, borderRadius: 26, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  permissionTitle: { color: c.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  permissionCopy: { color: c.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 25 },
  permissionButton: { minHeight: 54, paddingHorizontal: 22, borderRadius: 15, backgroundColor: c.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%' },
  permissionButtonText: { color: c.primaryForeground, fontSize: 15, fontWeight: '800' },
  permissionCancel: { padding: 14 },
  permissionCancelText: { color: c.mutedForeground, fontSize: 13, fontWeight: '700' },
});