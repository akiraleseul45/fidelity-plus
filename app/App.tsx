import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PhoneFrame } from './src/components/PhoneFrame';
import { RootNavigator } from './src/navigation';
import { AppProvider, useApp } from './src/store/AppContext';
import { colors } from './src/theme/theme';

const Gate: React.FC = () => {
  const { ready } = useApp();
  if (!ready) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <RootNavigator />;
};

export default function App() {
  return (
    <PhoneFrame>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style="dark" />
          <Gate />
        </AppProvider>
      </SafeAreaProvider>
    </PhoneFrame>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
