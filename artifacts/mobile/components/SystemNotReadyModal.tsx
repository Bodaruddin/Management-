/**
 * SystemNotReadyModal — Premium "System Not Ready" alert sheet.
 *
 * Replaces the stock React Native Alert for the database-not-configured
 * state on the login screen. Matches the app's navy + gold design language.
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
  onDismiss: () => void;
}

export default function SystemNotReadyModal({ visible, onDismiss }: Props) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.82)).current;
  const iconAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.82);
      iconAnim.setValue(0);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 230,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 72,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.spring(iconAnim, {
          toValue: 1,
          tension: 80,
          friction: 7,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.88,
        duration: 180,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(onDismiss);
  };

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

      {/* Card */}
      <View style={styles.centeredView} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Top accent bar */}
          <LinearGradient
            colors={['#1E3A8A', '#2D4FA3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentBar}
          />

          {/* Icon */}
          <Animated.View
            style={[
              styles.iconWrapper,
              { transform: [{ scale: iconAnim }] },
            ]}
          >
            <LinearGradient
              colors={['#C8A040', '#E2B84A', '#C8A040']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconGradient}
            >
              <Feather name="database" size={28} color="#fff" />
            </LinearGradient>

            {/* Badge */}
            <View style={styles.badge}>
              <Feather name="alert-circle" size={13} color="#fff" />
            </View>
          </Animated.View>

          {/* Text */}
          <Text style={styles.title}>System Not Ready</Text>

          <View style={styles.divider} />

          <Text style={styles.body}>
            The database has not been configured yet.
          </Text>
          <Text style={styles.sub}>
            Please ask your administrator to set up the system before logging in as a teacher.
          </Text>

          {/* Action */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={handleDismiss}
            style={styles.btnWrapper}
          >
            <LinearGradient
              colors={['#1E3A8A', '#2D4FA3']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btn}
            >
              <Text style={styles.btnText}>Got It</Text>
              <Feather name="check" size={16} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Footer hint */}
          <Text style={styles.hint}>Contact your school administrator for access</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 18, 46, 0.72)',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    shadowColor: '#0C1F4A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 20,
  },
  accentBar: {
    width: '100%',
    height: 5,
  },
  iconWrapper: {
    marginTop: 28,
    marginBottom: 20,
    position: 'relative',
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C8A040',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  badge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0C1F4A',
    letterSpacing: 0.2,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  divider: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#C8A040',
    marginTop: 10,
    marginBottom: 16,
  },
  body: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E3A8A',
    textAlign: 'center',
    paddingHorizontal: 28,
    lineHeight: 22,
  },
  sub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
    marginTop: 8,
  },
  btnWrapper: {
    width: '100%',
    paddingHorizontal: 24,
    marginTop: 28,
    borderRadius: 14,
    overflow: 'hidden',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 14,
    marginBottom: 22,
  },
});
