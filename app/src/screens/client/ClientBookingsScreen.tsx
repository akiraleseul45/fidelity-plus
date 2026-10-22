import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { bookingStatusLabel, formatDateTime } from '../../components/BookingFormat';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { Booking, apiCancelBooking, apiMyBookings } from '../../store/api';
import { confirm } from '../../stores/confirmStore';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientBookings'>;

type Row = { _section: string } | Booking;

const isSection = (r: Row): r is { _section: string } => '_section' in r;

export const ClientBookingsScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useApp();
  const client = user?.role === 'client' ? user : null;

  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiMyBookings();
    if (r.success && r.items) setItems(r.items);
    else setError(r.error ?? 'Impossible de charger tes réservations.');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (client) load();
  }, [client, load]);

  const onCancel = async (b: Booking) => {
    const ok = await confirm({
      title: 'Annuler la réservation ?',
      message: `${b.partnerName ?? 'Réservation'} — ${formatDateTime(b.startsAt)}`,
      confirmLabel: 'Annuler la réservation',
      cancelLabel: 'Garder',
      danger: true,
    });
    if (!ok) return;
    setCancelling(b.id);
    const r = await apiCancelBooking(b.id);
    setCancelling(null);
    if (r.success) {
      setItems((prev) =>
        prev.map((x) => (x.id === b.id ? { ...x, status: 'cancelled', ...(r.booking ?? {}) } : x)),
      );
    } else {
      await confirm({
        title: 'Échec',
        message: r.error ?? 'L’annulation a échoué.',
        confirmLabel: 'OK',
      });
    }
  };

  if (!client) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>Connecte-toi pour voir tes réservations.</Text>
          <Button
            title="Se connecter"
            variant="primary"
            onPress={() => navigation.navigate('ClientLogin')}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  const now = Date.now();
  const upcoming = items
    .filter((b) => b.startsAt >= now && b.status !== 'cancelled')
    .sort((a, b) => a.startsAt - b.startsAt);
  const past = items
    .filter((b) => b.startsAt < now || b.status === 'cancelled')
    .sort((a, b) => b.startsAt - a.startsAt);

  const rows: Row[] = [];
  if (upcoming.length) rows.push({ _section: 'À venir' }, ...upcoming);
  if (past.length) rows.push({ _section: 'Passées' }, ...past);

  return (
    <Screen padded={false}>
      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(r, i) => (isSection(r) ? `s-${i}` : r.id)}
        ListHeaderComponent={
          error ? <Text style={styles.error}>{error}</Text> : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            Tu n’as pas encore de réservation. Découvre les partenaires pour en faire une.
          </Text>
        }
        renderItem={({ item }) => {
          if (isSection(item)) {
            return <Text style={styles.sectionTitle}>{item._section}</Text>;
          }
          const b = item;
          const canCancel =
            b.startsAt >= now && (b.status === 'confirmed' || b.status === 'pending');
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.partner} numberOfLines={1}>
                  {b.partnerName ?? 'Partenaire'}
                </Text>
                <View style={[styles.statusChip, statusStyle(b.status)]}>
                  <Text style={styles.statusText}>{bookingStatusLabel(b.status)}</Text>
                </View>
              </View>
              {b.serviceName ? <Text style={styles.service}>{b.serviceName}</Text> : null}
              <Text style={styles.when}>📅 {formatDateTime(b.startsAt)}</Text>
              {b.partySize > 1 ? (
                <Text style={styles.meta}>👥 {b.partySize} personnes</Text>
              ) : null}
              <Text style={styles.ref}>Réf. {b.reference}</Text>
              {canCancel ? (
                <Button
                  title="Annuler"
                  variant="secondary"
                  size="md"
                  onPress={() => onCancel(b)}
                  loading={cancelling === b.id}
                  style={{ marginTop: spacing.sm }}
                />
              ) : null}
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      />
    </Screen>
  );
};

function statusStyle(status: Booking['status']) {
  if (status === 'cancelled' || status === 'no_show') return { backgroundColor: colors.danger };
  if (status === 'confirmed' || status === 'done') return { backgroundColor: colors.success };
  return { backgroundColor: colors.accent };
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  error: { ...typography.body, color: colors.danger, textAlign: 'center', marginBottom: spacing.md },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  sectionTitle: {
    ...typography.h3,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.bg,
    gap: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  partner: { ...typography.h3, color: colors.text, flex: 1 },
  service: { ...typography.body, color: colors.text, fontWeight: '600' },
  when: { ...typography.body, color: colors.text, textTransform: 'capitalize' },
  meta: { ...typography.small, color: colors.textMuted },
  ref: { ...typography.small, color: colors.textMuted, letterSpacing: 0.5 },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusText: { ...typography.small, color: '#fff', fontWeight: '700' },
});
