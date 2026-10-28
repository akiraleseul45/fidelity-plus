import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCookieStore } from '../stores/cookieStore';
import { colors, radius, spacing, typography } from '../theme/theme';

/**
 * RGPD cookie notice — shown once until dismissed. Only essential cookies
 * (staying logged in) are used, so there is nothing to opt in to (audit A-15).
 */
export const CookieConsent: React.FC = () => {
  const decided = useCookieStore((s) => s.decided);
  const load = useCookieStore((s) => s.load);
  const acknowledge = useCookieStore((s) => s.acknowledge);

  useEffect(() => {
    load();
  }, [load]);

  if (decided) return null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>🍪 Cookies</Text>
        <Text style={styles.body}>
          On utilise uniquement des cookies essentiels, pour te garder connecté. Aucun cookie de
          publicité ni de mesure d'audience.
        </Text>
        <View style={styles.row}>
          <Pressable onPress={acknowledge}style={({ pressed }) => [styles.btn, styles.primary, pressed && { opacity: 0.85 }]}>
            <Text style={styles.primaryText}>J'ai compris</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    padding: spacing.md,
    ...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null),
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  title: { ...typography.h3, color: colors.text },
  body: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  primary: { backgroundColor: colors.primary },
  primaryText: { ...typography.small, color: '#fff', fontWeight: '800' },
});
