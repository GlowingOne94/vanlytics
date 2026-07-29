import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { buildDriverUrl, DriverAppConfig, loadConfig } from './src/config';
import DriverPortalScreen from './src/DriverPortalScreen';
import SettingsScreen from './src/SettingsScreen';

type Screen = 'loading' | 'setup' | 'portal' | 'edit-settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [config, setConfig] = useState<DriverAppConfig | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await loadConfig();
      setConfig(saved);
      setScreen(saved ? 'portal' : 'setup');
    })();
  }, []);

  function handleSaved(newConfig: DriverAppConfig) {
    setConfig(newConfig);
    setScreen('portal');
  }

  if (screen === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (screen === 'setup') {
    return (
      <>
        <SettingsScreen initialConfig={config} isFirstLaunch onSaved={handleSaved} />
        <StatusBar style="dark" />
      </>
    );
  }

  if (screen === 'edit-settings') {
    return (
      <>
        <SettingsScreen
          initialConfig={config}
          isFirstLaunch={false}
          onSaved={handleSaved}
          onCancel={() => setScreen('portal')}
        />
        <StatusBar style="dark" />
      </>
    );
  }

  // screen === 'portal'
  return (
    <>
      <DriverPortalScreen
        url={buildDriverUrl(config as DriverAppConfig)}
        onOpenSettings={() => setScreen('edit-settings')}
      />
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
});
