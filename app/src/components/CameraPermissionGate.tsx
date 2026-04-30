import { useCameraPermissions } from 'expo-camera';
import React, { useEffect } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/theme';
import { Button } from './Button';

type Props = {
  children: React.ReactNode;
};

export const CameraPermissionGate: React.FC<Props> = ({ children }) => {
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>Initialisation de la caméra…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Caméra requise</Text>
        <Text style={styles.msg}>
          L'accès à la caméra est nécessaire pour scanner les QR codes des clients.
        </Text>
        {permission.canAskAgain ? (
          <Button title="Autoriser la caméra" onPress={() => requestPermission()} />
        ) : (
          <Button title="Ouvrir les réglages" onPress={() => Linking.openSettings()} />
        )}
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  title: { ...typography.h2, color: colors.text, textAlign: 'center' },
  msg: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
