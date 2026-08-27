import { Platform } from 'react-native';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getApiBase(): string {
  if (Platform.OS === 'web') return '';

  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredUrl) return normalizeBaseUrl(configuredUrl);

  const configuredDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (configuredDomain) {
    return normalizeBaseUrl(
      /^https?:\/\//i.test(configuredDomain)
        ? configuredDomain
        : `https://${configuredDomain}`,
    );
  }

  throw new Error(
    'EXPO_PUBLIC_API_URL or EXPO_PUBLIC_DOMAIN must be configured for native builds.',
  );
}