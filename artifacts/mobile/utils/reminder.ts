import { Alert, Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { captureRef } from 'react-native-view-shot';
import { SCHOOL_INFO } from '@/constants/schoolInfo';
import { Student } from '@/context/AppContext';

// ─── Build reminder message ───────────────────────────────────────────────────
export function buildReminderMessage(student: Student, customNote?: string): string {
  return (
`🏫 *${SCHOOL_INFO.name}*
📍 ${SCHOOL_INFO.address}  |  📞 ${SCHOOL_INFO.contact}

Dear Parent/Guardian of *${student.name}*,

This is a *friendly fee reminder* from ${SCHOOL_INFO.name}.

━━━━━━━━━━━━━━━━━━━━
👤 *Student Details*
• Name   : ${student.name}
• Class  : ${student.class}
• Roll   : ${student.rollNumber || '—'}
━━━━━━━━━━━━━━━━━━━━

${customNote ? `📝 *Note:* ${customNote}\n\n` : ''}⚠️ Kindly clear the *pending school fees* at the earliest to avoid any inconvenience.

For queries or payment, please visit the school office or contact us at:
📞 *${SCHOOL_INFO.contact}*
✉ ${SCHOOL_INFO.email}

Thank you for your cooperation. 🙏

Regards,
*${SCHOOL_INFO.name}*`
  );
}

// ─── Send via WhatsApp ────────────────────────────────────────────────────────
export async function sendReminderWhatsApp(student: Student, message: string): Promise<void> {
  const digits = student.mobileNumber?.replace(/\D/g, '') ?? '';
  const phone = digits.startsWith('91') && digits.length > 10 ? digits : `91${digits}`;
  if (!digits || digits.length < 7) {
    Alert.alert('No Mobile Number', `${student.name} does not have a mobile number on record.`);
    return;
  }
  // Open a direct WhatsApp chat for the registered student/guardian number.
  // Prefer the native scheme so Android opens WhatsApp instead of a generic
  // browser/share surface; keep the web URL as a fallback.
  const nativeUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
  const webUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  try {
    if (Platform.OS !== 'web') {
      try {
        await Linking.openURL(nativeUrl);
        return;
      } catch {
        await Linking.openURL(webUrl);
      }
    } else {
      await Linking.openURL(webUrl);
    }
  } catch {
    Alert.alert('WhatsApp Unavailable', 'Could not open WhatsApp. Please try SMS instead.');
  }
}

// ─── Send via SMS ─────────────────────────────────────────────────────────────
export async function sendReminderSMS(student: Student, message: string): Promise<void> {
  const phone = student.mobileNumber?.replace(/\D/g, '');
  if (!phone || phone.length < 7) {
    Alert.alert('No Mobile Number', `${student.name} does not have a mobile number on record.`);
    return;
  }
  // iOS uses & Android uses ?
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${phone}${separator}body=${encodeURIComponent(message)}`;
  try {
    const can = await Linking.canOpenURL(url);
    if (can) {
      await Linking.openURL(url);
    } else {
      // Web / unsupported — try without body
      await Linking.openURL(`sms:${phone}`);
    }
  } catch {
    Alert.alert('SMS Unavailable', 'Could not open the messaging app on this device.');
  }
}

// ─── Share reminder card image via native share sheet / WhatsApp ──────────────
export async function shareReminderImage(imageUri: string, student: Student): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      // Web: try Web Share API with file, fall back to opening the image
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        try {
          const res = await fetch(imageUri);
          const blob = await res.blob();
          const file = new File(
            [blob],
            `FeeReminder_${student.name.replace(/\s+/g, '_')}.png`,
            { type: 'image/png' },
          );
          if ((navigator as any).canShare?.({ files: [file] })) {
            await (navigator as any).share({ files: [file], title: `Fee Reminder – ${student.name}` });
            return;
          }
        } catch {}
      }
      // Fallback: open image in a new tab so the user can save/share manually
      const win = window.open(imageUri, '_blank');
      if (!win) Alert.alert('Popup blocked', 'Please allow popups to view the reminder card image.');
    } else {
      // Native: open system share sheet (user picks WhatsApp, Messages, etc.)
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/png',
          dialogTitle: `Fee Reminder – ${student.name}`,
          UTI: 'public.image',
        });
      } else {
        Alert.alert('Sharing unavailable', 'This device does not support file sharing. Please use SMS.');
      }
    }
  } catch {
    Alert.alert('Error', 'Could not share the reminder card. Please try SMS instead.');
  }
}

// ─── Share birthday card image via native share sheet ─────────────────────────
// Kept for other image-sharing flows. Birthday wish buttons use the direct
// registered-number WhatsApp helper above instead of opening the share sheet.
export async function shareBirthdayCardImage(cardRef: any, student: Student): Promise<void> {
  if (!cardRef?.current) {
    throw new Error('Birthday card is not ready to share. Please try again.');
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Image sharing is unavailable on this device.');
  }

  const imageUri = await captureRef(cardRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  await Sharing.shareAsync(imageUri, {
    mimeType: 'image/png',
    dialogTitle: `Happy Birthday – ${student.name}`,
    UTI: 'public.png',
  });
}

// ─── Send birthday card directly to the registered WhatsApp number ────────────
// Android's whatsapp:// URL can open a chat or carry text, but it cannot attach
// a local PNG. Use a targeted ACTION_SEND intent so WhatsApp opens directly
// with the captured card image and the student's registered number.
export async function sendBirthdayCardWhatsApp(
  cardRef: any,
  student: Student,
  caption: string,
): Promise<void> {
  if (!cardRef?.current) {
    throw new Error('Birthday card is not ready to share. Please try again.');
  }

  const digits = student.mobileNumber?.replace(/\D/g, '') ?? '';
  if (!digits || digits.length < 7) {
    Alert.alert('No Mobile Number', `${student.name} does not have a mobile number on record.`);
    return;
  }
  const phone = digits.startsWith('91') && digits.length > 10 ? digits : `91${digits}`;
  const imageUri = await captureRef(cardRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(imageUri);
    let lastError: unknown;
    for (const packageName of ['com.whatsapp', 'com.whatsapp.w4b']) {
      try {
        const contactPickerClass = `${packageName}.ContactPicker`;
        await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
          type: 'image/*',
          packageName,
          // expo-intent-launcher only applies packageName when className is
          // also supplied. ContactPicker accepts ACTION_SEND image intents
          // and keeps the send inside the targeted WhatsApp app.
          className: contactPickerClass,
          flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
          extra: {
            'android.intent.extra.STREAM': contentUri,
            'android.intent.extra.TEXT': caption,
            jid: `${phone}@s.whatsapp.net`,
          },
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error('WhatsApp is not installed or could not open the selected chat.', { cause: lastError });
  }

  if (Platform.OS === 'web') {
    throw new Error('Direct birthday-card sending is available in the Android app.');
  }

  // iOS does not expose the same package-targeted Android intent. Keep its
  // existing native image share behavior rather than falling back to text.
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Image sharing is unavailable on this device.');
  }
  await Sharing.shareAsync(imageUri, {
    mimeType: 'image/png',
    dialogTitle: `Happy Birthday – ${student.name}`,
    UTI: 'public.png',
  });
}
