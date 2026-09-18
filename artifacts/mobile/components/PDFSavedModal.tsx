/**
 * PDFSavedModal — Premium "PDF Saved" confirmation sheet.
 *
 * Shows a beautifully designed bottom-sheet style modal when a PDF has been
 * saved to the device. Replaces the stock React Native Alert.
 */

import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

interface Props {
  visible: boolean;
  filename: string;          // with .pdf extension
  fileUri?: string | null;   // native URI to open in Files (optional)
  onDismiss: () => void;
}

export default function PDFSavedModal({ visible, filename, fileUri, onDismiss }: Props) {
  const slideAnim  = useRef(new Animated.Value(120)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(0.4)).current;
  const checkAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset
      slideAnim.setValue(120);
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.4);
      checkAnim.setValue(0);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.timing(checkAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }).start();
      });
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0, duration: 180, useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 100, duration: 180, easing: Easing.in(Easing.ease), useNativeDriver: true,
      }),
    ]).start(onDismiss);
  };

  const handleOpenFiles = async () => {
    handleDismiss();
    if (fileUri) {
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } catch { /* ignore if sharing unavailable */ }
    }
  };

  const checkScale = checkAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleDismiss} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleDismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheetWrapper,
          { transform: [{ translateY: slideAnim }] },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Icon circle */}
          <Animated.View style={[styles.iconRingOuter, { transform: [{ scale: scaleAnim }] }]}>
            <LinearGradient
              colors={['#22C55E', '#16A34A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconGradient}
            >
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <Feather name="check" size={32} color="#fff" />
              </Animated.View>
            </LinearGradient>
          </Animated.View>

          {/* Texts */}
          <Text style={styles.title}>PDF Saved!</Text>
          <Text style={styles.subtitle}>Your file is ready and saved to your device.</Text>

          {/* File chip */}
          <View style={styles.fileChip}>
            <LinearGradient
              colors={['#1E3A8A', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fileChipGradient}
            >
              <Feather name="file-text" size={14} color="#93C5FD" />
              <Text style={styles.fileChipText} numberOfLines={1} ellipsizeMode="middle">
                {filename}
              </Text>
            </LinearGradient>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {Platform.OS === 'android' && fileUri ? (
              <TouchableOpacity style={styles.openBtn} onPress={handleOpenFiles} activeOpacity={0.8}>
                <LinearGradient
                  colors={['#0F172A', '#1E293B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.openBtnGradient}
                >
                  <Feather name="folder" size={15} color="#60A5FA" />
                  <Text style={styles.openBtnText}>Open File</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity onPress={handleDismiss} activeOpacity={0.85} style={styles.okBtnWrapper}>
              <LinearGradient
                colors={['#22C55E', '#16A34A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.okBtn}
              >
                <Text style={styles.okBtnText}>Got it</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Hint */}
          <Text style={styles.hint}>Find it in your Files app › Downloads</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    alignItems: 'center',
    // Premium shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 24,
  },
  iconRingOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 20,
    // Glow effect
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  fileChip: {
    width: '100%',
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fileChipGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  fileChipText: {
    flex: 1,
    fontSize: 13,
    color: '#BFDBFE',
    fontWeight: '600',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: 14,
  },
  openBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
  },
  openBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  openBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#60A5FA',
  },
  okBtnWrapper: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  okBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  okBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },
  hint: {
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
  },
});
