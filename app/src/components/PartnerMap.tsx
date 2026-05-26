import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

export type MapPartner = {
  id: string;
  companyName: string;
  ownerName?: string | null;
  address?: string | null;
  lat: number | null;
  lng: number | null;
  phoneFixed?: string | null;
  phoneMobile?: string | null;
};

type Props = {
  partners: MapPartner[];
  onPressMarker?: (id: string) => void;
  height?: number;
  userLocation?: { lat: number; lng: number; accuracy?: number } | null;
};

/**
 * Native fallback. The web build resolves PartnerMap.web.tsx (interactive
 * Leaflet map). On native we show a simple summary block — full mobile map
 * support would need react-native-maps as a dependency.
 */
export const PartnerMap: React.FC<Props> = ({ partners, height = 240 }) => {
  return (
    <View style={[styles.fallback, { height }]}>
      <Text style={styles.fallbackTitle}>🗺️ Carte d'Orléans</Text>
      <Text style={styles.fallbackText}>
        {partners.length} partenaire{partners.length > 1 ? 's' : ''} référencé
        {partners.length > 1 ? 's' : ''}
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
