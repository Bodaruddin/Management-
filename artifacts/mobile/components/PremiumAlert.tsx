import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';

type PremiumAlertVariant = 'warning' | 'success';

interface PremiumAlertProps {
  visible: boolean;
  title: string;
  message: string;
  variant: PremiumAlertVariant;
  onDismiss: () => void;
}

/**
 * Branded single-action alert for the two upgraded feedback states.
 * Keep this opt-in rather than replacing the app-wide native Alert API:
 * some existing alerts intentionally remain native or have custom flows.
 */
export default function PremiumAlert({
  visible,
  title,
  message,
  variant,
  onDismiss,
}: PremiumAlertProps) {
  const colors = useColors();
  const isSuccess = variant === 'success';
  const accent = isSuccess ? colors.success : colors.warning;
  const icon = isSuccess ? 'check' : 'alert-circle';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <LinearGradient
            colors={isSuccess ? [colors.primary, '#3159B7'] : [colors.primary, '#274A9E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerGlow} />
            <View style={[styles.iconRing, { borderColor: `${accent}55` }]}>
              <View style={[styles.iconCircle, { backgroundColor: accent }]}>
                <Feather name={icon} size={25} color="#FFFFFF" strokeWidth={2.8} />
              </View>
            </View>
            <Text style={styles.headerLabel}>{isSuccess ? 'ALL SET' : 'NEEDS ATTENTION'}</Text>
          </LinearGradient>

          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
          </View>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss message"
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary, opacity: pressed ? 0.86 : 1 },
              ]}
            >
              <Text style={styles.buttonText}>Got it</Text>
              <Feather name="arrow-right" size={17} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(5, 16, 42, 0.68)',
  },
  card: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#061536',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 14,
  },
  header: {
    minHeight: 142,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    width: 230,
    height: 230,
    top: -148,
    right: -40,
    borderRadius: 115,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  iconRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginTop: 12,
  },
  content: {
    paddingHorizontal: 26,
    paddingTop: 23,
    paddingBottom: 21,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 9,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 15,
    paddingBottom: 20,
  },
  button: {
    minHeight: 50,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});