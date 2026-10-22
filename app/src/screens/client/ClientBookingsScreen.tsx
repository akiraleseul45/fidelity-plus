import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../theme/theme';

// SCAFFOLD — filled by the reservation CLIENT session. Keep the export name/path.
export const ClientBookingsScreen: React.FC = () => (
  <SafeAreaView style={styles.safe}>
    <View style={styles.c}>
      <Text style={styles.t}>Mes réservations</Text>
      <Text style={styles.m}>Écran en cours de construction…</Text>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  t: { ...typography.h2, color: colors.text },
  m: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
