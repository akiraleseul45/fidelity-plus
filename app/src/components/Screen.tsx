import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/theme';

export const Screen: React.FC<{ children: React.ReactNode; style?: ViewStyle; padded?: boolean }> = ({
  children,
  style,
  padded = true,
}) => {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={[styles.inner, padded && { paddingHorizontal: spacing.lg }, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  // ALWAYS flex:1 so children can fill the screen (otherwise FlatList /
  // ScrollView inside collapse and aren't scrollable on web).
  inner: { flex: 1 },
});
