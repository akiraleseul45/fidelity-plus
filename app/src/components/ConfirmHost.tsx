import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useConfirmStore } from '../stores/confirmStore';
import { colors, radius, spacing, typography } from '../theme/theme';

/**
 * Renders the global confirmation dialog. Mount once near the app root.
 */
export const ConfirmHost: React.FC = () => {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const answer = useConfirmStore((s) => s.answer);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => answer(false)}>
      <Pressable style={styles.backdrop} onPress={() => answer(false)}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation?.()}>
          <Text style={styles.title}>{options.title}</Text>
          {options.message ? <Text style={styles.message}>{options.message}</Text> : null}
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              onPress={() => answer(false)}
              style={({ pressed }) => [styles.btn, styles.cancel, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.cancelText}>{options.cancelLabel || 'Annuler'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => answer(true)}
              style={({ pressed }) => [
                styles.btn,
                options.danger ? styles.danger : styles.primary,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.confirmText}>{options.confirmLabel || 'Confirmer'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    width: '100%',
    maxWidth: 420,
  },
  title: { ...typography.h2, color: colors.text },
  message: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  cancel: { backgroundColor: colors.surface },
  cancelText: { ...typography.body, color: colors.text, fontWeight: '700' },
  primary: { backgroundColor: colors.primary },
  danger: { backgroundColor: colors.danger },
  confirmText: { ...typography.body, color: '#fff', fontWeight: '800' },
});
