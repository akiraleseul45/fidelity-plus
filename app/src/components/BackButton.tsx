import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

type Props = {
  onPress: () => void;
  tone?: 'dark' | 'light';
  style?: ViewStyle;
  label?: string;
};

export const BackButton: React.FC<Props> = ({ onPress, tone = 'dark', style, label = 'Retour' }) => {
  const isDark = tone === 'dark';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        isDark ? styles.btnDark : styles.btnLight,
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      <Text style={[styles.text, { color: isDark ? colors.text : '#FFFFFF' }]}>‹ {label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.pill,
  },
  btnDark: { backgroundColor: colors.surface },
  btnLight: { backgroundColor: 'rgba(255,255,255,0.18)' },
  text: { ...typography.h3, fontWeight: '700' },
});
