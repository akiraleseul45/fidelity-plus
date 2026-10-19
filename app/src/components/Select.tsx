import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

export type SelectOption<T extends string> = { value: T; label: string; emoji?: string };

type Props<T extends string> = {
  label?: string;
  placeholder?: string;
  value: T | null | undefined;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/**
 * Lightweight cross-platform dropdown (works on Expo web + native) without
 * any extra dependency. A pressable field opens a modal list of options.
 */
export function Select<T extends string>({
  label,
  placeholder = 'Choisir…',
  value,
  options,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.85 }]}
      >
        <Text style={[styles.fieldText, !current && styles.placeholder]} numberOfLines={1}>
          {current ? `${current.emoji ? current.emoji + ' ' : ''}${current.label}` : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.option, (pressed || active) && styles.optionActive]}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {item.emoji ? item.emoji + '  ' : ''}
                      {item.label}
                    </Text>
                    {active ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  fieldText: { ...typography.body, color: colors.text, flex: 1 },
  placeholder: { color: colors.textMuted },
  chevron: { color: colors.textMuted, fontSize: 14 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  sheetTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: colors.surface },
  optionText: { ...typography.body, color: colors.text },
  optionTextActive: { color: colors.primary, fontWeight: '700' },
  check: { color: colors.primary, fontWeight: '800' },
});
