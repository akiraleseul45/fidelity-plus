import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Restaurant } from '../types';
import { colors, radius, spacing, typography } from '../theme/theme';

type Props = {
  restaurants: Restaurant[];
  onPressMarker?: (id: string) => void;
  height?: number;
};

/**
 * Native fallback. The web build resolves PartnerMap.web.tsx (interactive
 * Leaflet map). On native we show a simple summary block — full mobile map
 * support would need react-native-maps as a dependency.
 */
export const PartnerMap: React.FC<Props> = ({ restaurants, height = 240 }) => {
  return (
    <View style={[styles.fallback, { height }]}>
      <Text style={styles.fallbackTitle}>🗺️ Carte d'Orléans</Text>
      <Text style={styles.fallbackText}>
        {restaurants.length} partenaire{restaurants.length > 1 ? 's' : ''} référencé
        {restaurants.length > 1 ? 's' : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  fallbackTitle: { ...typography.h3, color: colors.text },
  fallbackText: { ...typography.small, color: colors.textMuted },
});
