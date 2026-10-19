import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { navigationRef } from '../navigation';
import { useAuthStore } from '../stores/authStore';
import { colors, radius, spacing, typography } from '../theme/theme';

/**
 * Shown app-wide while an admin is simulating a demo client/partner. Lets
 * them swap back to the admin console at any time.
 */
export const DemoBanner: React.FC = () => {
  const impersonating = useAuthStore((s) => s.impersonating);
  const user = useAuthStore((s) => s.user);
  const stopDemo = useAuthStore((s) => s.stopDemo);

  if (!impersonating) return null;

  const roleLabel = user?.role === 'partner' ? 'pro' : 'client';

  const back = async () => {
    await stopDemo();
    if (navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe} pointerEvents="box-none">
      <View style={styles.bar}>
        <Text style={styles.text} numberOfLines={1}>
          🎭 Mode simulation ({roleLabel} démo)
        </Text>
        <Pressable onPress={back} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
          <Text style={styles.btnText}>Revenir à l'admin</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    ...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null),
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: { ...typography.small, color: colors.onAccent, fontWeight: '800', flex: 1 },
  btn: {
    backgroundColor: '#0B1220',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  btnText: { ...typography.small, color: '#fff', fontWeight: '800' },
});
