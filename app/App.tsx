import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfirmHost } from './src/components/ConfirmHost';
import { CookieConsent } from './src/components/CookieConsent';
import { DemoBanner } from './src/components/DemoBanner';
import { PhoneFrame } from './src/components/PhoneFrame';
import { RootNavigator } from './src/navigation';
import { bootstrapApp } from './src/stores/bootstrap';
import { colors } from './src/theme/theme';

/**
 * Root component.
 *
 * Boot sequence:
 *  1. PhoneFrame wraps the app (mobile look on desktop)
 *  2. Run async bootstrap (rehydrate session + load partners)
 *  3. Once ready, render the navigator
 */

const Gate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrapApp()
      .then(() => setReady(true))
      .catch((err) => {
        console.error('[bootstrap]', err);
        // Even if bootstrap fails (e.g. backend down), the app must boot.
        // Stores will be empty; the user can still try to log in.
        setReady(true);
        setError(err?.message ?? 'Démarrage partiel');
      });
  }, []);

  if (!ready) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // Render children regardless of error; an error UI inside the navigator
  // can surface offline state if needed.
  void error;
  return <>{children}</>;
};

export default function App() {
  return (
    <PhoneFrame>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Gate>
          <RootNavigator />
        </Gate>
        <DemoBanner />
        <CookieConsent />
        <ConfirmHost />
      </SafeAreaProvider>
    </PhoneFrame>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
