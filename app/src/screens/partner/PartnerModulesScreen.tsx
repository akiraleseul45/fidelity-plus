import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Select } from '../../components/Select';
import { usePartnerHeader } from '../../components/PartnerMenu';
import {
  BOOKING_MODES,
  BookingModeValue,
  MODULES,
  ModuleValue,
  bookingModeForCategory,
} from '../../constants/business';
import { apiProUpdateProfile } from '../../store/api';
import { RootStackParamList } from '../../navigation';
import { confirm } from '../../stores/confirmStore';
import { useAuthStore } from '../../stores/authStore';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerModules'>;

const MODULE_FIELD: Record<ModuleValue, 'modLoyalty' | 'modBooking' | 'modVitrine'> = {
  loyalty: 'modLoyalty',
  booking: 'modBooking',
  vitrine: 'modVitrine',
};

export const PartnerModulesScreen: React.FC<Props> = ({ navigation }) => {
  usePartnerHeader(navigation);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const partner = user?.role === 'partner' ? user : null;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!partner) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Session expirée.</Text>
      </Screen>
    );
  }

  const mods = {
    loyalty: !!partner.modLoyalty,
    booking: !!partner.modBooking,
    vitrine: !!partner.modVitrine,
  };
  const bookingMode: BookingModeValue =
    (partner.bookingMode as BookingModeValue | null) ?? bookingModeForCategory(partner.category);

  const toggleModule = async (mod: ModuleValue, next: boolean) => {
    const field = MODULE_FIELD[mod];
    setError(null);
    setBusy(field);
    const res = await apiProUpdateProfile({ [field]: next });
    setBusy(null);
    if (!res.success || !res.partner) {
      setError(res.error || 'Mise à jour impossible.');
      return;
    }
    setUser(res.partner);
  };

  const changeBookingMode = async (next: BookingModeValue) => {
    if (next === bookingMode) return;
    const ok = await confirm({
      title: 'Changer le mode de réservation ?',
      message:
        next === 'table'
          ? 'Le mode « Table / Couverts » convient aux restaurants et cafés (réservation de couverts sur un service).'
          : 'Le mode « Rendez-vous » convient aux prestations sur créneaux (coiffeur, esthétique, mécanique…).',
      confirmLabel: 'Changer',
    });
    if (!ok) return;
    setError(null);
    setBusy('bookingMode');
    const res = await apiProUpdateProfile({ bookingMode: next });
    setBusy(null);
    if (!res.success || !res.partner) {
      setError(res.error || 'Mise à jour impossible.');
      return;
    }
    setUser(res.partner);
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Text style={styles.intro}>
          Active ou désactive chaque axe de ton établissement. Les trois sont indépendants.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ gap: spacing.md }}>
          {MODULES.map((m) => {
            const field = MODULE_FIELD[m.value];
            const value = mods[m.value];
            return (
              <View key={m.value} style={styles.card}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.cardTitle}>
                    {m.emoji} {m.label}
                  </Text>
                  <Text style={styles.cardHint}>{m.hint}</Text>
                </View>
                {busy === field ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Switch
                    value={value}
                    onValueChange={(next) => toggleModule(m.value, next)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                    accessibilityLabel={`${m.label} ${value ? 'activé' : 'désactivé'}`}
                  />
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Mode de réservation</Text>
          <Text style={styles.blockHint}>
            Pré-réglé selon ton métier, modifiable à tout moment. Il définit la façon dont les
            clients réservent.
          </Text>
          {busy === 'bookingMode' ? (
            <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <Select<BookingModeValue>
              value={bookingMode}
              options={BOOKING_MODES.map((b) => ({ value: b.value, label: b.label, emoji: b.emoji }))}
              onChange={changeBookingMode}
              accessibilityLabel="Mode de réservation"
            />
          )}
          {!mods.booking ? (
            <Text style={styles.note}>
              Le module Réservation est désactivé — active-le pour que les clients puissent réserver.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  intro: { ...typography.body, color: colors.textMuted },
  error: { ...typography.small, color: colors.danger, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  cardTitle: { ...typography.h3, color: colors.text },
  cardHint: { ...typography.small, color: colors.textMuted },
  block: { gap: spacing.sm, paddingTop: spacing.sm },
  blockTitle: { ...typography.h3, color: colors.text },
  blockHint: { ...typography.small, color: colors.textMuted },
  note: { ...typography.small, color: colors.textMuted, fontStyle: 'italic' },
});
