import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { formatDuration, formatEuro } from '../../components/BookingFormat';
import { Screen } from '../../components/Screen';
import {
  categoryEmoji,
  categoryLabel,
  serviceModeEmoji,
  serviceModeLabel,
} from '../../constants/business';
import { RootStackParamList } from '../../navigation';
import { ProService, VitrinePartner, apiVitrine } from '../../store/api';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientPartnerDetail'>;

/**
 * Public partner page ("vitrine"). Loads the vitrine payload on mount and
 * adapts to the 3 toggleable axes:
 *   - modVitrine  → presentation (cover, description, address, phones)
 *   - modLoyalty  → the loyalty advantage (+ live points if signed in)
 *   - modBooking  → the bookable services, each with a "Réserver" button
 * No payment — prices are informative only.
 */
export const ClientPartnerDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { partnerId } = route.params;
  const { user, clientLoyalty, refreshClientLoyalty } = useApp();
  const client = user?.role === 'client' ? user : null;

  const [vitrine, setVitrine] = useState<VitrinePartner | null>(null);
  const [services, setServices] = useState<ProService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await apiVitrine(partnerId);
    if (r.success && r.partner) {
      setVitrine(r.partner);
      setServices((r.services ?? []).filter((s) => s.isActive && !s.isPrivate));
    } else {
      setError(r.error ?? 'Ce partenaire n’est pas disponible.');
    }
    setLoading(false);
  }, [partnerId]);

  useEffect(() => {
    load();
    if (client) refreshClientLoyalty();
  }, [load, client, refreshClientLoyalty]);

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
  };

  const goBook = (serviceId?: string) =>
    navigation.navigate('ClientBooking', { partnerId, serviceId });

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  if (error || !vitrine) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>{error ?? 'Partenaire introuvable.'}</Text>
          <Button title="Réessayer" variant="secondary" onPress={load} style={{ marginTop: spacing.md }} />
        </View>
      </Screen>
    );
  }

  const points = clientLoyalty.find((l) => l.partnerId === vitrine.id)?.points ?? 0;
  const pct = vitrine.rewardThreshold > 0 ? Math.min(1, points / vitrine.rewardThreshold) : 0;
  const remaining = Math.max(0, vitrine.rewardThreshold - points);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {vitrine.imageUrl ? (
          <Image source={{ uri: vitrine.imageUrl }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <Text style={styles.heroPlaceholderText}>{vitrine.companyName.charAt(0)}</Text>
          </View>
        )}

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Text style={styles.name}>{vitrine.companyName}</Text>

          {vitrine.category ? (
            <Text style={styles.cat}>
              {categoryEmoji(vitrine.category)} {categoryLabel(vitrine.category)}
              {vitrine.serviceMode
                ? `  ·  ${serviceModeEmoji(vitrine.serviceMode)} ${serviceModeLabel(vitrine.serviceMode)}`
                : ''}
            </Text>
          ) : null}

          {vitrine.description ? (
            <Text style={styles.description}>{vitrine.description}</Text>
          ) : null}

          {vitrine.ownerName ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>👤</Text>
              <Text style={styles.infoText}>{vitrine.ownerName}</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.infoText}>{vitrine.address || 'Adresse non renseignée'}</Text>
          </View>

          {vitrine.phoneFixed ? (
            <Pressable onPress={() => callPhone(vitrine.phoneFixed!)} style={styles.infoRow}>
              <Text style={styles.infoIcon}>☎️</Text>
              <Text style={[styles.infoText, styles.link]}>{vitrine.phoneFixed}</Text>
            </Pressable>
          ) : null}

          {vitrine.phoneMobile ? (
            <Pressable onPress={() => callPhone(vitrine.phoneMobile!)} style={styles.infoRow}>
              <Text style={styles.infoIcon}>📱</Text>
              <Text style={[styles.infoText, styles.link]}>{vitrine.phoneMobile}</Text>
            </Pressable>
          ) : null}

          {/* ─── Avantage fidélité ─── */}
          {vitrine.modLoyalty ? (
            <View style={styles.loyaltyBox}>
              <Text style={styles.boxTitle}>🎁 Fidélité</Text>
              <Text style={styles.loyaltyReward}>
                {vitrine.rewardType === 'free_meal'
                  ? `Une récompense offerte tous les ${vitrine.rewardThreshold} points`
                  : `−${vitrine.rewardValue ?? 10}% de réduction tous les ${vitrine.rewardThreshold} points`}
              </Text>
              {client ? (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
                  </View>
                  <Text style={styles.loyaltyPoints}>
                    {remaining === 0
                      ? '🎉 Récompense disponible !'
                      : `${points} / ${vitrine.rewardThreshold} pts · ${remaining} avant ta récompense`}
                  </Text>
                </>
              ) : (
                <Text style={styles.loyaltyHint}>
                  Connecte-toi et fais scanner ton QR pour cumuler des points.
                </Text>
              )}
            </View>
          ) : null}

          {/* ─── Prestations réservables ─── */}
          {vitrine.modBooking ? (
            <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {vitrine.bookingMode === 'table' ? '🍽️ Réserver une table' : '🗓️ Prendre rendez-vous'}
                </Text>
              </View>

              {services.length > 0 ? (
                services.map((s) => {
                  const price = formatEuro(s.priceCents, s.currency);
                  return (
                    <View key={s.id} style={styles.serviceCard}>
                      <View style={styles.serviceTop}>
                        <Text style={styles.serviceName}>{s.name}</Text>
                        {price ? <Text style={styles.servicePrice}>{price}</Text> : null}
                      </View>
                      {s.description ? (
                        <Text style={styles.serviceDesc}>{s.description}</Text>
                      ) : null}
                      <Text style={styles.serviceMeta}>
                        {formatDuration(s.durationMin)}
                        {vitrine.bookingMode === 'table' && s.capacity > 1
                          ? ` · jusqu’à ${s.capacity} couverts`
                          : ''}
                      </Text>
                      <Button
                        title="Réserver"
                        variant="primary"
                        size="md"
                        onPress={() => goBook(s.id)}
                        style={{ marginTop: spacing.sm }}
                      />
                    </View>
                  );
                })
              ) : (
                <Text style={styles.muted}>Aucune prestation publiée pour l’instant.</Text>
              )}

              <Button
                title={vitrine.bookingMode === 'table' ? 'Réserver une table' : 'Réserver un créneau'}
                variant="accent"
                onPress={() => goBook()}
              />
              <Text style={styles.noPay}>Aucun paiement en ligne — les prix sont indicatifs.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  hero: { width: '100%', height: 220, backgroundColor: colors.surface },
  heroPlaceholder: { backgroundColor: colors.heroBg, alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderText: { fontSize: 80, fontWeight: '800', color: colors.heroText },
  name: { ...typography.h1, color: colors.text, marginTop: spacing.md },
  cat: { ...typography.small, color: colors.primary, fontWeight: '700' },
  description: { ...typography.body, color: colors.text, lineHeight: 22 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  infoIcon: { fontSize: 16 },
  infoText: { ...typography.body, color: colors.text, flex: 1 },
  link: { color: colors.primary, fontWeight: '600' },
  loyaltyBox: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  boxTitle: { ...typography.h3, color: colors.text },
  loyaltyReward: { ...typography.body, color: colors.text, fontWeight: '600' },
  loyaltyHint: { ...typography.small, color: colors.textMuted },
  loyaltyPoints: { ...typography.small, color: colors.text, fontWeight: '600' },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  sectionHeader: { marginTop: spacing.sm },
  sectionTitle: { ...typography.h2, color: colors.text },
  serviceCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.bg,
    gap: 4,
  },
  serviceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  serviceName: { ...typography.h3, color: colors.text, flex: 1 },
  servicePrice: { ...typography.h3, color: colors.primary, fontWeight: '800' },
  serviceDesc: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  serviceMeta: { ...typography.small, color: colors.text, fontWeight: '600', marginTop: 2 },
  noPay: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
});
