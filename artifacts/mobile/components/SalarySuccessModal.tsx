/**
 * SalarySuccessModal — Premium salary payment confirmation sheet.
 *
 * A beautifully animated bottom-sheet modal that replaces the stock Alert
 * shown after recording a salary payment. Displays the teacher name, period,
 * and amount, then lets the user dismiss or print the receipt.
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  teacherName: string;
  month: string;
  year: string | number;
  amount: number;
  onDismiss: () => void;
  onPrint: () => void;
}

export default function SalarySuccessModal({
  visible,
  teacherName,
  month,
  year,
  amount,
  onDismiss,
  onPrint,
}: Props) {
  const slideAnim  = useRef(new Animated.Value(140)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(0.3)).current;
  const checkAnim  = useRef(new Animated.Value(0)).current;
  const amountAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(140);
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.3);
      checkAnim.setValue(0);
      amountAnim.setValue(0);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 70,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 90,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.stagger(80, [
          Animated.spring(checkAnim, {
            toValue: 1,
            tension: 100,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.spring(amountAnim, {
            toValue: 1,
            tension: 80,
            friction: 9,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }
  }, [visible]);

  const animatedDismiss = (cb: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0, duration: 160, useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 120, duration: 180, easing: Easing.in(Easing.ease), useNativeDriver: true,
      }),
    ]).start(cb);
  };

  const handleDismiss = () => animatedDismiss(onDismiss);
  const handlePrint   = () => animatedDismiss(onPrint);

  const checkScale = checkAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const amountTranslate = amountAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  const formattedAmount = `₹${amount.toLocaleString('en-IN')}`;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleDismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[styles.sheetWrapper, { transform: [{ translateY: slideAnim }] }]}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Icon circle */}
          <Animated.View style={[styles.iconRing, { transform: [{ scale: scaleAnim }] }]}>
            <LinearGradient
              colors={['#22C55E', '#15803D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconGradient}
            >
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <Feather name="check-circle" size={30} color="#fff" />
              </Animated.View>
            </LinearGradient>
          </Animated.View>

          {/* Title */}
          <Text style={styles.title}>Salary Paid!</Text>
          <Text style={styles.subtitle}>Payment recorded successfully</Text>

          {/* Amount chip */}
          <Animated.View style={[
            styles.amountChipWrapper,
            { opacity: amountAnim, transform: [{ translateY: amountTranslate }] },
          ]}>
            <LinearGradient
              colors={['#14532D', '#166534']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.amountChip}
            >
              <Feather name="dollar-sign" size={13} color="#4ADE80" />
              <Text style={styles.amountText}>{formattedAmount}</Text>
            </LinearGradient>
          </Animated.View>

          {/* Info card */}
          <Animated.View style={[styles.infoCard, { opacity: amountAnim }]}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconBox}>
                <Feather name="user" size={13} color="#60A5FA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Teacher</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{teacherName}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <View style={styles.infoIconBox}>
                <Feather name="calendar" size={13} color="#A78BFA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Period</Text>
                <Text style={styles.infoValue}>{month} {year}</Text>
              </View>
            </View>
          </Animated.View>

          {/* Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.skipBtn} onPress={handleDismiss} activeOpacity={0.8}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.printBtnWrapper} onPress={handlePrint} activeOpacity={0.85}>
              <LinearGradient
                colors={['#1D4ED8', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.printBtn}
              >
                <Feather name="printer" size={15} color="#fff" />
                <Text style={styles.printText}>Print Receipt</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    paddingBottom: 40,
    paddingTop: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 28,
  },
  iconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginBottom: 18,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 14,
  },
  iconGradient: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 20,
  },
  amountChipWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  amountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  amountText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: -0.5,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
  },
  infoLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: '#E2E8F0',
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  skipBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  skipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  printBtnWrapper: {
    flex: 2,
    borderRadius: 14,
    overflow: 'hidden',
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  printText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.1,
  },
});
