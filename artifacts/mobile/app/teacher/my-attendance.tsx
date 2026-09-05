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
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
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

function getWebLocationWithOptions(options: PositionOptions): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => reject(error),
      options,
    );
  });
}

async function getWebLocation(): Promise<Coordinates> {
  try {
    return await getWebLocationWithOptions({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  } catch (error: any) {
    if (error?.code === 1) {
      throw new Error('Location permission is required to mark attendance');
    }
    if (error?.code !== 3) {
      throw new Error(error?.message || 'Could not read your location');
    }
    // A cold GPS fix can exceed the high-accuracy timeout in mobile Chrome.
    // Retry for a current network-assisted position; the server still applies
    // the unchanged geofence check before marking attendance.
    try {
      return await getWebLocationWithOptions({
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 0,
      });
    } catch {
      throw new Error('Could not get your current location. Turn on location services and try again.');
    }
  }
}

async function readCurrentLocation(): Promise<Coordinates> {
  if (Platform.OS === 'web') return getWebLocation();
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Location permission is required to mark attendance');
  let location;
  try {
    location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  } catch {
    // Keep the server-side geofence authoritative while allowing devices with
    // a slow GPS warm-up to retry with a current balanced-accuracy fix.
    location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  }
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}

type FaceCapturePurpose = 'enroll' | 'check-in' | 'check-out';
type FaceFlowStage = 'detected' | 'verifying';

function jpegDataUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(',');
  const payload = (commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed)
    .replace(/\s/g, '');

  // CameraView can return either raw base64 or a browser data/blob URL.
  // Do not reject a valid browser payload based on one particular base64
  // prefix; the server decodes the bytes and remains authoritative about
  // whether the image is a readable JPEG.
  if (payload.length < 100) return null;
  return `data:image/jpeg;base64,${payload}`;
}

async function readWebImageAsBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The browser camera image could not be read');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The browser camera image could not be read'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
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
        [{ resize: { width: 720 } }],
        {
          compress: 0.88,
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

  if (photo.uri && Platform.OS === 'web') {
    try {
      candidates.unshift(await readWebImageAsBase64(photo.uri));
    } catch {
      // Fall back to CameraView's base64 field below when the URI is a
      // short-lived blob URL that the browser has already released.
    }
  }
  if (photo.base64) candidates.push(photo.base64);

  for (const candidate of candidates) {
    const jpeg = jpegDataUrl(candidate);
    if (jpeg) return jpeg;
  }

  throw new Error('The camera returned an unreadable photo. Please keep your face centered and try again.');
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function FaceCaptureModal({
  visible,
  purpose,
  onCancel,
  onStageChange,
  onCaptured,
}: {
  visible: boolean;
  purpose: FaceCapturePurpose;
  onCancel: () => void;
  onStageChange: (stage: FaceFlowStage) => void;
  onCaptured: (imagesBase64: string[]) => Promise<void>;
}) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureNumber, setCaptureNumber] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const cameraRef = useRef<CameraView>(null);
  const scanProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setCameraReady(false);
      setCameraError('');
      setCaptureNumber(0);
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
      const sampleCount = purpose === 'enroll' ? 5 : 3;
      const images: string[] = [];
      for (let index = 0; index < sampleCount; index += 1) {
        setCaptureNumber(index + 1);
        const photo = await cameraRef.current.takePictureAsync({
          // A short burst lets the server choose the clearest frame while
          // keeping the enrollment template independent from one photo.
          base64: true,
          quality: 0.92,
          imageType: 'jpg',
          skipProcessing: false,
        });
        images.push(await getFaceImageBase64(photo));
        if (index < sampleCount - 1) await wait(180);
      }
      onStageChange('detected');
      await wait(160);
      onStageChange('verifying');
      await onCaptured(images);
    } catch (error: any) {
      setCameraError(error?.message ?? 'Could not capture your face. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const title = purpose === 'enroll' ? 'Set up face verification' : 'Verify your face';
  const description = purpose === 'enroll'
    ? 'We will capture five quick samples so normal lighting and expression changes still verify safely.'
    : 'We will capture three quick frames and verify the clearest one securely.';
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
              <Text style={cs.guideCopy}>Keep your eyes visible · face a light source · hold still</Text>
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
              <Text style={cs.hint}>
                {capturing ? `Capturing sample ${captureNumber} of ${purpose === 'enroll' ? 5 : 3}…` : 'Tap to capture a short burst'}
              </Text>
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

function FaceProgressModal({
  visible,
  purpose,
}: {
  visible: boolean;
  purpose: 'check-in' | 'check-out';
}) {
  const colors = useColors();
  const action = purpose === 'check-in' ? 'check-in' : 'check-out';
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[resultStyles.backdrop, { backgroundColor: colors.primary + 'E6' }]}>
        <View style={[resultStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[resultStyles.progressIcon, { backgroundColor: colors.secondary }]}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={[resultStyles.title, { color: colors.text }]}>Verifying securely</Text>
          <Text style={[resultStyles.description, { color: colors.mutedForeground }]}>
            Checking the best frame before recording your {action}.
          </Text>
          <View style={resultStyles.steps}>
            <View style={resultStyles.step}>
              <View style={[resultStyles.stepIcon, { backgroundColor: colors.success }]}>
                <Feather name="check" size={12} color={colors.primaryForeground} />
              </View>
              <Text style={[resultStyles.stepText, { color: colors.text }]}>Face detected</Text>
            </View>
            <View style={[resultStyles.stepLine, { backgroundColor: colors.border }]} />
            <View style={resultStyles.step}>
              <View style={[resultStyles.stepIcon, { backgroundColor: colors.primary }]}>
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              </View>
              <Text style={[resultStyles.stepText, { color: colors.text }]}>Verifying</Text>
            </View>
            <View style={[resultStyles.stepLine, { backgroundColor: colors.border }]} />
            <View style={resultStyles.step}>
              <View style={[resultStyles.stepIcon, { backgroundColor: colors.muted }]}>
                <Feather name="clock" size={12} color={colors.mutedForeground} />
              </View>
              <Text style={[resultStyles.stepText, { color: colors.mutedForeground }]}>Attendance marked</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

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
            <>
              <View style={resultStyles.steps}>
                {['Face detected', 'Verifying', 'Attendance marked'].map((step, index) => (
                  <React.Fragment key={step}>
                    <View style={resultStyles.step}>
                      <View style={[resultStyles.stepIcon, { backgroundColor: colors.success }]}>
                        <Feather name="check" size={12} color={colors.primaryForeground} />
                      </View>
                      <Text style={[resultStyles.stepText, { color: colors.text }]}>{step}</Text>
                    </View>
                    {index < 2 ? <View style={[resultStyles.stepLine, { backgroundColor: colors.success }]} /> : null}
                  </React.Fragment>
                ))}
              </View>
              <View style={[resultStyles.redirectNote, { backgroundColor: colors.muted }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[resultStyles.redirectText, { color: colors.mutedForeground }]}>
                  Returning to your dashboard…
                </Text>
              </View>
            </>
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

type AttendanceErrorCopy = {
  isLocationError: boolean;
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  distance?: string;
  radius?: string;
};

function getAttendanceErrorCopy(rawMessage: string): AttendanceErrorCopy {
  const isCheckOutError = /check[-\s]?out/i.test(rawMessage);
  const cleanedMessage = rawMessage
    .replace(/^.*?check-out failed:\s*/i, '')
    .replace(/^\d{3}\s*[—-]\s*/i, '')
    .replace(/^(?:GET|POST|PUT|DELETE)\s+\S+\s+(?:failed|error):\s*/i, '')
    .trim();
  const locationMatch = cleanedMessage.match(
    /You are\s+([\d.]+)m from school;\s*check-out is allowed within\s*([\d.]+)m/i,
  );

  if (locationMatch) {
    return {
      isLocationError: true,
      eyebrow: 'LOCATION CHECK',
      title: 'Location Verification Required',
      description: 'You’re outside the approved check-out area.',
      detail: 'Check-out is protected by your school’s location boundary.',
      distance: `${Math.round(Number(locationMatch[1]))}m`,
      radius: `${Math.round(Number(locationMatch[2]))}m`,
    };
  }

  return {
    isLocationError: false,
    eyebrow: 'ACTION NEEDED',
    title: isCheckOutError ? 'Check-out Not Available' : 'We couldn’t complete that',
    description: isCheckOutError
      ? 'Your check-out cannot be completed at this time.'
      : 'Something interrupted this attendance action. Review the detail below and try again.',
    detail: cleanedMessage || 'Please try again in a moment.',
  };
}

function AttendanceErrorModal({
  visible,
  message,
  onDismiss,
}: {
  visible: boolean;
  message: string;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const copy = getAttendanceErrorCopy(message);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={[feedbackStyles.backdrop, { backgroundColor: colors.primary + 'D9' }]}>
        <View
          style={[
            feedbackStyles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: colors.primary,
            },
          ]}
        >
          <View style={feedbackStyles.topRow}>
            <View style={[feedbackStyles.kicker, { backgroundColor: colors.warning + '18' }]}>
              <View style={[feedbackStyles.kickerDot, { backgroundColor: colors.warning }]} />
              <Text style={[feedbackStyles.kickerText, { color: colors.warning }]}>
                {copy.eyebrow}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onDismiss}
              style={[feedbackStyles.closeButton, { backgroundColor: colors.muted }]}
              accessibilityRole="button"
              accessibilityLabel="Close attendance message"
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={[feedbackStyles.iconHalo, { backgroundColor: colors.warning + '18' }]}>
            <View style={[feedbackStyles.iconCircle, { backgroundColor: colors.warning }]}>
              <Feather
                name={copy.isLocationError ? 'map-pin' : 'alert-triangle'}
                size={27}
                color={colors.primaryForeground}
              />
            </View>
          </View>

          <Text style={[feedbackStyles.title, { color: colors.text }]}>{copy.title}</Text>
          <Text style={[feedbackStyles.description, { color: colors.mutedForeground }]}>
            {copy.description}
          </Text>

          {copy.isLocationError && copy.distance && copy.radius ? (
            <View style={[feedbackStyles.metrics, { backgroundColor: colors.muted }]}>
              <View style={feedbackStyles.metric}>
                <Text style={[feedbackStyles.metricLabel, { color: colors.mutedForeground }]}>
                  YOUR DISTANCE
                </Text>
                <Text style={[feedbackStyles.metricValue, { color: colors.warning }]}>
                  {copy.distance}
                </Text>
                <Text style={[feedbackStyles.metricHint, { color: colors.mutedForeground }]}>
                  from school
                </Text>
              </View>
              <View style={[feedbackStyles.metricDivider, { backgroundColor: colors.border }]} />
              <View style={feedbackStyles.metric}>
                <Text style={[feedbackStyles.metricLabel, { color: colors.mutedForeground }]}>
                  ALLOWED RADIUS
                </Text>
                <Text style={[feedbackStyles.metricValue, { color: colors.primary }]}>
                  {copy.radius}
                </Text>
                <Text style={[feedbackStyles.metricHint, { color: colors.mutedForeground }]}>
                  maximum distance
                </Text>
              </View>
            </View>
          ) : null}

          <View style={[feedbackStyles.detail, { backgroundColor: colors.secondary }]}>
            <Feather name="info" size={16} color={colors.primary} />
            <Text style={[feedbackStyles.detailText, { color: colors.secondaryForeground }]}>
              {copy.detail}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onDismiss}
            style={[feedbackStyles.primaryAction, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Try the attendance action again"
          >
            <Text style={[feedbackStyles.primaryActionText, { color: colors.primaryForeground }]}>
              Try again
            </Text>
            <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDismiss}
            style={feedbackStyles.secondaryAction}
            accessibilityRole="button"
            accessibilityLabel="Close attendance message"
          >
            <Text style={[feedbackStyles.secondaryActionText, { color: colors.mutedForeground }]}>
              Close message
            </Text>
          </TouchableOpacity>
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
  const [faceFlowStage, setFaceFlowStage] = useState<FaceFlowStage | null>(null);
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

  const handleFaceStageChange = (stage: FaceFlowStage) => {
    setFaceFlowStage(stage);
  };

  const handleFaceCaptured = async (faceSamplesBase64: string[]) => {
    const purpose = faceCaptureMode;
    setFaceCaptureMode(null);
    if (!purpose || !user) return;
    await runAction(async () => {
      if (purpose === 'enroll') {
        await enrollTeacherFace(user.id, faceSamplesBase64);
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
          faceImageBase64: faceSamplesBase64[0],
          faceSamplesBase64,
        });
      } else {
        if (!todayRecord) throw new Error('No check-in found for today');
        await checkOutTeacher(todayRecord.id, {
          teacherId: user.id,
          ...coordinates,
          faceImageBase64: faceSamplesBase64[0],
          faceSamplesBase64,
        });
      }
    }, {
      onSuccess: () => {
        setFaceFlowStage(null);
        if (purpose !== 'enroll') showFaceResult('success', purpose);
      },
      onError: message => {
        setFaceFlowStage(null);
        if (purpose !== 'enroll' && /face|selfie|camera|verification|blurry|dark|light|center/i.test(message)) {
          setError('');
          showFaceResult(
            'error',
            purpose,
            message || 'Your face could not be verified. Please try again with your face centered in the frame.',
          );
        }
      },
    });
  };

  const handleCheckIn = () => {
    if (teacherAttendanceSettings.requireFaceVerification) {
      setError('');
      setFaceResultPurpose('check-in');
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
      setFaceResultPurpose('check-out');
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
        <TouchableOpacity onPress={() => router.replace('/teacher')} style={[s.backButton, { backgroundColor: colors.muted }]}>
          <Feather name="arrow-left" size={22} color={colors.cardForeground} />
        </TouchableOpacity>
        <View style={s.headerCopy}>
          <Text style={[s.eyebrow, { color: colors.primary }]}>SECURE ATTENDANCE</Text>
          <Text style={[s.title, { color: colors.cardForeground }]}>My Attendance</Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>GPS + face verification</Text>
        </View>
        <TouchableOpacity onPress={() => refreshTeacherAttendance(user?.id)} style={[s.iconButton, { backgroundColor: colors.secondary }]}>
          <Feather name="refresh-cw" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[s.tabs, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        {([
          ['today', 'Today'], ['history', 'History'], ['leave', 'Leave'],
        ] as [Tab, string][]).map(([value, label]) => (
          <TouchableOpacity
            key={value}
            onPress={() => setTab(value)}
            style={[s.tab, tab === value && { backgroundColor: colors.card, shadowColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Text style={[s.tabText, { color: tab === value ? colors.primary : colors.mutedForeground }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
          <ScrollView contentContainerStyle={[s.todayScroll, { paddingBottom: bottomPad }]}>
            <LinearGradient
              colors={['#101E4F', '#1E3A8A', '#315BCB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.hero}
            >
              <View style={s.heroDecorOne} />
              <View style={s.heroDecorTwo} />
              <View style={s.heroTopRow}>
                <View style={s.heroIcon}><Feather name="shield" size={23} color="#173B92" /></View>
                <View style={s.heroSecurePill}>
                  <View style={s.heroSecureDot} />
                  <Text style={s.heroSecureText}>SECURE CHECK-IN</Text>
                </View>
              </View>
              <Text style={s.heroKicker}>TODAY’S ATTENDANCE</Text>
              <Text style={s.heroTitle}>{todayRecord ? (todayRecord.status === 'late' ? 'Checked in late' : 'Checked in') : 'Ready to check in?'}</Text>
              <Text style={s.heroCopy}>Your location must be within {teacherAttendanceSettings.radiusMeters}m of school.</Text>
              <View style={s.heroFooter}>
                <View style={s.heroFooterItem}>
                  <Feather name="map-pin" size={14} color="#BFD0FF" />
                  <Text style={s.heroFooterText}>{teacherAttendanceSettings.radiusMeters}m geofence</Text>
                </View>
                <View style={s.heroFooterItem}>
                  <Feather name="user-check" size={14} color="#BFD0FF" />
                  <Text style={s.heroFooterText}>Face match on</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={[s.recordCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.recordRow}>
                <View style={[s.recordIcon, { backgroundColor: todayRecord ? colors.success + '18' : colors.muted }]}>
                  <Feather name={todayRecord ? 'check-circle' : 'clock'} size={20} color={todayRecord ? colors.success : colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.recordHeading}>
                    <Text style={[s.recordLabel, { color: colors.mutedForeground }]}>Today · {today}</Text>
                    <View style={[s.statusPill, { backgroundColor: todayRecord ? colors.success + '18' : colors.secondary }]}>
                      <View style={[s.statusDot, { backgroundColor: todayRecord ? colors.success : colors.primary }]} />
                      <Text style={[s.statusPillText, { color: todayRecord ? colors.success : colors.primary }]}>
                        {todayRecord ? (todayRecord.status === 'late' ? 'LATE' : 'PRESENT') : 'PENDING'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[s.recordValue, { color: colors.text }]}>
                    {todayRecord ? (todayRecord.status === 'late' ? 'Late' : 'Present') : 'Not marked'}
                  </Text>
                </View>
              </View>
              <View style={[s.timeGrid, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <View style={s.timeLabelRow}>
                    <Feather name="log-in" size={13} color={colors.primary} />
                    <Text style={[s.smallLabel, { color: colors.mutedForeground }]}>CHECK-IN</Text>
                  </View>
                  <Text style={[s.time, { color: colors.text }]}>{formatTime(todayRecord?.checkInAt)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.timeLabelRow}>
                    <Feather name="log-out" size={13} color={colors.primary} />
                    <Text style={[s.smallLabel, { color: colors.mutedForeground }]}>CHECK-OUT</Text>
                  </View>
                  <Text style={[s.time, { color: colors.text }]}>{formatTime(todayRecord?.checkOutAt)}</Text>
                </View>
              </View>
              {todayRecord?.distanceFromSchool !== undefined && (
                <View style={[s.distanceRow, { borderTopColor: colors.border }]}>
                  <Feather name="navigation" size={13} color={colors.success} />
                  <Text style={[s.distance, { color: colors.mutedForeground }]}>
                    Verified {Math.round(todayRecord.distanceFromSchool)}m from school
                  </Text>
                </View>
              )}
            </View>

            {!todayRecord ? (
              <TouchableOpacity disabled={busy} onPress={handleCheckIn} activeOpacity={0.9}>
                <LinearGradient
                  colors={busy ? [colors.muted, colors.muted] : ['#1E3A8A', '#315BCB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.primaryButton}
                >
                  <View style={s.buttonIcon}><Feather name="camera" size={17} color={colors.primary} /></View>
                  <Text style={s.primaryButtonText}>{busy ? 'Verifying…' : 'Verify face & check in'}</Text>
                  {!busy && <Feather name="arrow-up-right" size={18} color={colors.primaryForeground} />}
                </LinearGradient>
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

            <View style={[s.info, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.infoIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="lock" size={14} color={colors.primary} />
              </View>
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                Your private face template is matched securely in the camera flow. Original photos are never stored.
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
        onStageChange={handleFaceStageChange}
        onCaptured={handleFaceCaptured}
      />
      <FaceProgressModal
        visible={faceFlowStage === 'verifying'}
        purpose={faceResultPurpose}
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
      <AttendanceErrorModal
        visible={Boolean(error)}
        message={error}
        onDismiss={() => setError('')}
      />
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 15, gap: 11 },
  backButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 2 },
  iconButton: { width: 38, height: 38, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 13,
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    borderRadius: 12,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tabText: { fontSize: 13, fontWeight: '700' },
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
  todayScroll: { paddingHorizontal: 16, paddingTop: 16 },
  hero: {
    borderRadius: 25,
    padding: 20,
    marginBottom: 14,
    overflow: 'hidden',
    minHeight: 210,
    position: 'relative',
    shadowColor: '#102461',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  heroDecorOne: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -72,
    top: -72,
    backgroundColor: 'rgba(126, 160, 255, 0.17)',
  },
  heroDecorTwo: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    right: 20,
    bottom: -66,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heroIcon: { backgroundColor: '#fff', width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  heroSecurePill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.13)' },
  heroSecureDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#83F0C0' },
  heroSecureText: { color: '#DCE6FF', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  heroKicker: { color: '#BFD0FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 5 },
  heroTitle: { color: '#fff', fontSize: 25, fontWeight: '800', letterSpacing: -0.6 },
  heroCopy: { color: '#DCE6FF', fontSize: 13, marginTop: 6, lineHeight: 18 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 17, marginTop: 21 },
  heroFooterItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroFooterText: { color: '#DCE6FF', fontSize: 11, fontWeight: '600' },
  recordCard: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    shadowColor: '#0C1F4A',
    shadowOpacity: 0.06,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  recordRow: { flexDirection: 'row', alignItems: 'center', padding: 17, gap: 12 },
  recordIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recordLabel: { fontSize: 12 },
  recordHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recordValue: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  timeGrid: { flexDirection: 'row', padding: 17, borderTopWidth: 1 },
  timeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  time: { fontSize: 19, fontWeight: '800', marginTop: 6 },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 17, paddingVertical: 12, borderTopWidth: 1 },
  distance: { fontSize: 11, fontWeight: '600' },
  primaryButton: { minHeight: 58, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 17, marginBottom: 12 },
  buttonIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondaryButton: { minHeight: 58, borderRadius: 17, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, marginBottom: 12 },
  secondaryButtonText: { fontSize: 15, fontWeight: '800' },
  complete: { minHeight: 58, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 12 },
  completeText: { fontSize: 14, fontWeight: '700' },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1 },
  infoIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
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

const feedbackStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  kickerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  kickerText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHalo: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 16,
    marginBottom: 17,
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
    paddingHorizontal: 3,
  },
  metrics: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 14,
    marginTop: 20,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 44,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  metricHint: {
    fontSize: 10,
    marginTop: 1,
  },
  detail: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  detailText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  primaryAction: {
    width: '100%',
    minHeight: 52,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 18,
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryAction: {
    alignItems: 'center',
    paddingVertical: 13,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
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
  progressIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
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
  steps: {
    width: '100%',
    marginTop: 21,
    gap: 8,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  stepIcon: {
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepLine: {
    width: 1,
    height: 9,
    marginLeft: 11,
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