import { Platform } from 'react-native';

const DEFAULT_API_BASE = 'https://management-2-5u13.onrender.com';

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

  // Keep production APKs usable even when EAS environment variables are not
  // configured in the selected EAS environment. A build-time override still
  // takes precedence above this fallback.
  return DEFAULT_API_BASE;
}