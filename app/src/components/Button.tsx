import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'pillLight' | 'pillAccent';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: 'md' | 'lg';
};

export const Button: React.FC<Props> = ({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  size = 'lg',
}) => {
  const isDisabled = disabled || loading;
  const shape =
    variant === 'pillLight' || variant === 'pillAccent' ? styles.pill : styles.rect;

  const bg = {
    primary: colors.primary,
    secondary: colors.surface,
    ghost: 'transparent',
    accent: colors.accent,
    pillLight: '#FFFFFF',
    pillAccent: colors.accent,
  }[variant];

  const fg = {
    primary: colors.onPrimary,
    secondary: colors.text,
    ghost: colors.primary,
    accent: colors.onAccent,
    pillLight: colors.primary,
    pillAccent: colors.onAccent,
  }[variant];

  const border =
    variant === 'secondary'
      ? { borderWidth: 1, borderColor: colors.border }
      : undefined;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        shape,
        size === 'lg' ? styles.lg : styles.md,
        { backgroundColor: bg },
        border,
        pressed && !isDisabled && { opacity: 0.85 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.text, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  rect: { borderRadius: radius.md },
  pill: { borderRadius: radius.pill },
  lg: { paddingVertical: 18, paddingHorizontal: spacing.lg },
  md: { paddingVertical: 12, paddingHorizontal: spacing.md },
  text: { ...typography.h3 },
});
