import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { buildDriverUrl, DriverAppConfig, saveConfig } from './config';

type Props = {
  initialConfig: DriverAppConfig | null;
  /** Whether this is being shown because no config exists yet (first launch). */
  isFirstLaunch: boolean;
  onSaved: (config: DriverAppConfig) => void;
  onCancel?: () => void;
};

export default function SettingsScreen({ initialConfig, isFirstLaunch, onSaved, onCancel }: Props) {
  const [baseUrl, setBaseUrl] = useState(initialConfig?.baseUrl ?? '');
  const [orgSlug, setOrgSlug] = useState(initialConfig?.orgSlug ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const previewUrl =
    baseUrl.trim() && orgSlug.trim() ? buildDriverUrl({ baseUrl, orgSlug }) : null;

  async function handleSave() {
    const trimmedBase = baseUrl.trim();
    const trimmedSlug = orgSlug.trim();

    if (!trimmedBase || !trimmedSlug) {
      setError('Please fill in both the app URL and the org code.');
      return;
    }
    if (!/^https?:\/\//i.test(trimmedBase)) {
      setError('The app URL should start with https:// (or http:// for local testing).');
      return;
    }

    setError(null);
    setSaving(true);
    const config: DriverAppConfig = { baseUrl: trimmedBase, orgSlug: trimmedSlug };
    try {
      await saveConfig(config);
      onSaved(config);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Vanlytics Driver Setup</Text>
          <Text style={styles.subtitle}>
            {isFirstLaunch
              ? 'One-time setup. Ask your dispatcher or admin for these details.'
              : 'Update the connection settings for this app.'}
          </Text>

          <Text style={styles.label}>Vanlytics app URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://acme.vanlytics.app"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={baseUrl}
            onChangeText={setBaseUrl}
          />

          <Text style={styles.label}>Organization code</Text>
          <TextInput
            style={styles.input}
            placeholder="acme-fleet"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            value={orgSlug}
            onChangeText={setOrgSlug}
          />

          {previewUrl && (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>This app will open:</Text>
              <Text style={styles.previewUrl}>{previewUrl}</Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save & Continue'}</Text>
          </TouchableOpacity>

          {!isFirstLaunch && onCancel && (
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  previewBox: {
    marginTop: 20,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  previewLabel: {
    fontSize: 12,
    color: '#4338ca',
    marginBottom: 2,
  },
  previewUrl: {
    fontSize: 13,
    color: '#312e81',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  error: {
    marginTop: 16,
    color: '#dc2626',
    fontSize: 13,
  },
  button: {
    marginTop: 28,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 14,
  },
});
