import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigationState } from '@react-navigation/native';
import React, { useLayoutEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { RootStackParamList } from '../navigation';
import { colors, radius, spacing, typography } from '../theme/theme';

// Accept any route's navigation prop — the hook/menu are used from every pro
// screen, each carrying its own route name in the generic. `any` for the route
// name sidesteps the (contravariant) per-route setParams signature mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNav = NativeStackNavigationProp<RootStackParamList, any>;

type MenuItem = {
  label: string;
  emoji: string;
  route: keyof RootStackParamList;
  /** Whether the entry is shown for the current partner's active modules. */
  visible: (mods: { loyalty: boolean; booking: boolean; vitrine: boolean }) => boolean;
};

// Order requested by the product spec. Gating:
//  - Prestations / Disponibilités / Réservations → module Réservation (modBooking)
//  - Ma vitrine                                   → module Vitrine (modVitrine)
//  - Scanner / Fidélité                           → module Fidélité (modLoyalty)
//  - Tableau de bord / Modules / Mon compte       → always visible
const ITEMS: MenuItem[] = [
  { label: 'Tableau de bord', emoji: '📊', route: 'PartnerDashboard', visible: () => true },
  { label: 'Scanner', emoji: '📷', route: 'PartnerScanner', visible: (m) => m.loyalty },
  { label: 'Fidélité', emoji: '🎁', route: 'PartnerSettings', visible: (m) => m.loyalty },
  { label: 'Prestations', emoji: '🧾', route: 'PartnerServices', visible: (m) => m.booking },
  { label: 'Disponibilités', emoji: '🗓️', route: 'PartnerAvailability', visible: (m) => m.booking },
  { label: 'Réservations', emoji: '📅', route: 'PartnerBookings', visible: (m) => m.booking },
  { label: 'Ma vitrine', emoji: '🪟', route: 'PartnerVitrineEdit', visible: (m) => m.vitrine },
  { label: 'Modules', emoji: '⚙️', route: 'PartnerModules', visible: () => true },
  { label: 'Mon compte', emoji: '👤', route: 'Profile', visible: () => true },
];

/**
 * Burger (☰) menu for the whole partner space.
 *
 * Renders a single button that opens an overlay listing the partner screens,
 * filtered by the 3 active modules (loyalty / booking / vitrine). The module
 * flags arrive from the backend as 0/1 integers, hence the `!!` reads.
 */
export const PartnerMenu: React.FC<{ navigation: AnyNav }> = ({ navigation }) => {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const partner = user?.role === 'partner' ? user : null;

  // Active top-level route, used to highlight the current entry.
  const activeRoute = useNavigationState((s) => s?.routes[s.index]?.name as string | undefined);

  if (!partner) return null;

  const mods = {
    loyalty: !!partner.modLoyalty,
    booking: !!partner.modBooking,
    vitrine: !!partner.modVitrine,
  };
  const items = ITEMS.filter((i) => i.visible(mods));

  const go = (route: keyof RootStackParamList) => {
    setOpen(false);
    if (route !== activeRoute) {
      // All partner entries take no params.
      navigation.navigate(route as never);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir le menu"
        style={styles.burger}
      >
        <Text style={styles.burgerIcon}>☰</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.panelTitle} numberOfLines={1}>
              {partner.companyName}
            </Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {items.map((item) => {
                const active = item.route === activeRoute;
                return (
                  <Pressable
                    key={item.route}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => go(item.route)}
                    style={({ pressed }) => [
                      styles.row,
                      (pressed || active) && styles.rowActive,
                    ]}
                  >
                    <Text style={styles.rowEmoji}>{item.emoji}</Text>
                    <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

/**
 * Header-left for every partner screen: the app-wide back arrow (‹, only when
 * there is history) immediately followed by the burger menu — both on the left
 * as requested. Call this hook from a screen's body; it drives
 * `navigation.setOptions` inside a `useLayoutEffect`.
 */
export function usePartnerHeader(navigation: AnyNav) {
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <View style={styles.headerLeft}>
          {navigation.canGoBack() ? (
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Text style={styles.backArrow}>‹</Text>
            </Pressable>
          ) : null}
          <PartnerMenu navigation={navigation} />
        </View>
      ),
    });
  }, [navigation]);
}

const styles = StyleSheet.create({
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  backArrow: { fontSize: 30, lineHeight: 32, color: colors.text, fontWeight: '800', paddingRight: 2 },
  burger: { paddingHorizontal: 4, paddingVertical: 2 },
  burgerIcon: { fontSize: 24, lineHeight: 26, color: colors.text, fontWeight: '800' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    marginTop: 54,
    marginLeft: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    width: 260,
    maxWidth: '86%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  panelTitle: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.surface },
  rowEmoji: { fontSize: 18, width: 24, textAlign: 'center' },
  rowLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
  rowLabelActive: { color: colors.primary },
});
