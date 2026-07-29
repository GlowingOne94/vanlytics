import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted configuration for the driver app.
 *
 * The app is a thin WebView wrapper around the Vanlytics driver portal page
 * (`${baseUrl}/driver/${orgSlug}`). Instead of hardcoding a URL at build
 * time, the admin who installs the app on a driver's phone enters it once
 * on the setup screen, and it is saved to on-device storage so drivers
 * never see or need to touch it again.
 */

const STORAGE_KEY = 'vanlytics-driver-config';

export type DriverAppConfig = {
  baseUrl: string;
  orgSlug: string;
};

export function buildDriverUrl(config: DriverAppConfig): string {
  const trimmedBase = config.baseUrl.trim().replace(/\/+$/, '');
  const trimmedSlug = config.orgSlug.trim().replace(/^\/+|\/+$/g, '');
  return `${trimmedBase}/driver/${trimmedSlug}`;
}

export async function loadConfig(): Promise<DriverAppConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.baseUrl === 'string' && typeof parsed?.orgSlug === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConfig(config: DriverAppConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function clearConfig(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
