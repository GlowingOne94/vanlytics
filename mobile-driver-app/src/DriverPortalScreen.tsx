import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import WebView, { WebViewNavigation } from 'react-native-webview';

type Props = {
  url: string;
  onOpenSettings: () => void;
};

export default function DriverPortalScreen({ url, onOpenSettings }: Props) {
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  // Bumping this forces the WebView to fully remount, which is the most
  // reliable way to retry after a hard load failure (offline, DNS, etc.).
  const [reloadKey, setReloadKey] = useState(0);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    // A successful navigation clears any earlier error state.
    if (!navState.loading) {
      setHasError(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {hasError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Can&apos;t reach Vanlytics</Text>
            <Text style={styles.errorSubtitle}>
              Check your internet connection and try again.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <WebView
              key={reloadKey}
              ref={webviewRef}
              source={{ uri: url }}
              style={styles.webview}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onNavigationStateChange={handleNavigationStateChange}
              onError={() => {
                setHasError(true);
                setLoading(false);
              }}
              onHttpError={(syntheticEvent) => {
                // Only treat server errors (5xx) as a hard failure screen;
                // 4xx pages (e.g. a bad slug) still render inside the WebView
                // so the driver can see whatever message the web app shows.
                if (syntheticEvent.nativeEvent.statusCode >= 500) {
                  setHasError(true);
                }
                setLoading(false);
              }}
              startInLoadingState
              pullToRefreshEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              domStorageEnabled
              javaScriptEnabled
              allowsBackForwardNavigationGestures
              renderLoading={() => (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#4f46e5" />
                </View>
              )}
            />
            {loading && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color="#4f46e5" />
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={onOpenSettings}
          accessibilityLabel="Open app settings"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  settingsButton: {
    position: 'absolute',
    top: Platform.select({ ios: 8, android: 12, default: 12 }),
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    color: '#ffffff',
    fontSize: 17,
  },
});
