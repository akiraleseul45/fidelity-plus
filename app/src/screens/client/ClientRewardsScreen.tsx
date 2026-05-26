import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientRewards'>;

/**
 * "Mes récompenses" — backend-driven view of every partner where the
 * client has accumulated points, grouped by readiness.
 */
export const ClientRewardsScreen: React.FC<Props> = () => {
  const { user, clientLoyalty, refreshClientLoyalty } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const client = user?.role === 'client' ? user : null;

  useEffect(() => {
    refreshClientLoyalty();
  }, [refreshClientLoyalty]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshClientLoyalty();
    setRefreshing(false);
  };

  if (!client) {
    return (
      <Screen>
        <Text style={styles.muted}>Connecte-toi pour voir tes récompenses.</Text>
      </Screen>
    );
  }

  const ready = clientLoyalty.filter((l) => l.points >= l.rewardThreshold);
  const inProgress = clientLoyalty.filter((l) => l.points < l.rewardThreshold);
  const sections = [
    { title: 'Récompenses disponibles', data: ready },
    { title: 'En cours', data: inProgress },
  ].filter((s) => s.data.length > 0);

  return (
    <Screen padded={false}>
      <FlatList
        contentContainerStyle={styles.list}
        data={sections.flatMap((s) => [{ _section: s.title } as any, ...s.data])}
        keyExtractor={(item, i) => (item._section ? `s-${i}` : `${item.partnerId}`)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.headerBox}>
            <Text style={styles.h1}>Mes récompenses</Text>
            <Text style={styles.sub}>
              {clientLoyalty.length} partenaire
              {clientLoyalty.length > 1 ? 's' : ''} fréquenté
              {clientLoyalty.length > 1 ? 's' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            Aucun point pour l'instant — fais scanner ton QR chez un partenaire pour commencer.
          </Text>
        }
        renderItem={({ item }) => {
          if (item._section) {
            return <Text style={styles.sectionTitle}>{item._section}</Text>;
          }
          const isReady = item.points >= item.rewardThreshold;
          const pct = Math.min(1, item.points / item.rewardThreshold);
          return (
            <View style={[styles.card, isReady && styles.cardReady]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.companyName}
                </Text>
                {isReady ? <Text style={styles.badge}>🎉 Disponible</Text> : null}
              </View>
              {item.ownerName ? <Text style={styles.owner}>{item.ownerName}</Text> : null}
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.points}>
                  {item.points} / {item.rewardThreshold} pts
                </Text>
                <Text style={styles.reward}>
                  {item.rewardType === 'free_meal'
                    ? 'Gratuit seulement'
                    : `−${item.rewardValue ?? 10}%`}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  headerBox: { marginBottom: spacing.md },
  h1: { ...typography.h1, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted, marginTop: 4 },
  sectionTitle: { ...typography.h3, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  muted: { ...typography.body, color: colors.textMuted },
  card: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardReady: {
    borderColor: colors.primary,
    backgroundColor: '#EAF4FF',
  },
  name: { ...typography.h3, color: colors.text, flex: 1 },
  owner: { ...typography.small, color: colors.textMuted },
  badge: {
    ...typography.small,
    color: '#fff',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  points: { ...typography.body, color: colors.text, fontWeight: '700' },
  reward: { ...typography.small, color: colors.textMuted },
});
