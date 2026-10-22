import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { usePartnerHeader } from '../../components/PartnerMenu';
import {
  Booking,
  BookingStatus,
  apiProBookings,
  apiProSetBookingStatus,
} from '../../store/api';
import { RootStackParamList } from '../../navigation';
import { confirm } from '../../stores/confirmStore';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerBookings'>;
type Scope = 'upcoming' | 'past' | 'all';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'upcoming', label: 'À venir' },
  { value: 'past', label: 'Passées' },
  { value: 'all', label: 'Toutes' },
];

const STATUS_META: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'En attente', color: '#8A5A00', bg: '#FFF3DB' },
  confirmed: { label: 'Confirmée', color: '#0B6B2E', bg: '#EAF7EE' },
  cancelled: { label: 'Annulée', color: colors.danger, bg: '#FDECEC' },
  done: { label: 'Honorée', color: '#0B4A8C', bg: '#EAF4FF' },
  no_show: { label: 'Absent', color: '#6B2E0B', bg: '#F7EDEA' },
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: '2-digit',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export const PartnerBookingsScreen: React.FC<Props> = ({ navigation }) => {
  usePartnerHeader(navigation);

  const [scope, setScope] = useState<Scope>('upcoming');
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (s: Scope) => {
    setLoading(true);
    const res = await apiProBookings(s);
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Chargement impossible.');
      return;
    }
    setError(null);
    setItems(res.items ?? []);
  }, []);

  useEffect(() => {
    load(scope);
  }, [scope, load]);

  const setStatus = async (b: Booking, status: BookingStatus) => {
    if (status === 'cancelled') {
      const ok = await confirm({
        title: 'Annuler la réservation ?',
        message: `${b.customerName} · ${dateFmt.format(new Date(b.startsAt))}`,
        confirmLabel: 'Annuler la réservation',
        cancelLabel: 'Retour',
        danger: true,
      });
      if (!ok) return;
    }
    const res = await apiProSetBookingStatus(b.id, status);
    if (!res.success || !res.booking) {
      setError(res.error || 'Changement de statut impossible.');
      return;
    }
    const updated = res.booking;
    setItems((prev) => {
      // When viewing "upcoming", a cancelled booking drops out on next refresh;
      // here we just reflect the new status in place.
      return prev.map((x) => (x.id === updated.id ? updated : x));
    });
  };

  return (
    <Screen padded={false}>
      <View style={styles.tabs}>
        {SCOPES.map((s) => {
          const active = s.value === scope;
          return (
            <Pressable
              key={s.value}
              onPress={() => setScope(s.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        data={items}
        keyExtractor={(b) => b.id}
        refreshing={loading}
        onRefresh={() => load(scope)}
        ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <Text style={styles.empty}>Aucune réservation.</Text>
          )
        }
        renderItem={({ item }) => <BookingCard booking={item} onStatus={setStatus} />}
      />
    </Screen>
  );
};

const BookingCard: React.FC<{
  booking: Booking;
  onStatus: (b: Booking, status: BookingStatus) => void;
}> = ({ booking: b, onStatus }) => {
  const meta = STATUS_META[b.status];
  const isActive = b.status === 'pending' || b.status === 'confirmed';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.when}>{dateFmt.format(new Date(b.startsAt))}</Text>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <Text style={styles.customer}>{b.customerName}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          👥 {b.partySize} {b.partySize > 1 ? 'personnes' : 'personne'}
        </Text>
        {b.serviceName ? <Text style={styles.metaText}>· {b.serviceName}</Text> : null}
      </View>
      {b.notes ? <Text style={styles.notes}>“{b.notes}”</Text> : null}

      {isActive ? (
        <View style={styles.actions}>
          {b.status === 'pending' ? (
            <Button
              title="Confirmer"
              size="md"
              onPress={() => onStatus(b, 'confirmed')}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button
            title="Honorée"
            variant="secondary"
            size="md"
            onPress={() => onStatus(b, 'done')}
            style={{ flex: 1 }}
          />
          <Button
            title="Absent"
            variant="secondary"
            size="md"
            onPress={() => onStatus(b, 'no_show')}
            style={{ flex: 1 }}
          />
          <Button
            title="Annuler"
            variant="ghost"
            size="md"
            onPress={() => onStatus(b, 'cancelled')}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.small, color: colors.text, fontWeight: '700' },
  tabTextActive: { color: colors.onPrimary },
  error: { ...typography.small, color: colors.danger, fontWeight: '600', marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  when: { ...typography.h3, color: colors.text, flex: 1, textTransform: 'capitalize' },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusText: { ...typography.small, fontWeight: '700' },
  customer: { ...typography.body, color: colors.text, fontWeight: '600', marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metaText: { ...typography.small, color: colors.textMuted },
  notes: { ...typography.small, color: colors.textMuted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});
