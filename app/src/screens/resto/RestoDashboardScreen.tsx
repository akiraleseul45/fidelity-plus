import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RestoDashboard'>;

export const RestoDashboardScreen: React.FC<Props> = () => {
  const { currentRestoId, restaurants, loyalty, redeemReward } = useApp();
  const resto = restaurants.find((r) => r.id === currentRestoId);

  const rows = useMemo(
    () =>
      loyalty
        .filter((e) => e.restaurantId === currentRestoId)
        .sort((a, b) => b.points - a.points),
    [loyalty, currentRestoId],
  );

  if (!resto) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Session expirée.</Text>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        data={rows}
        keyExtractor={(e) => e.clientId}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.h1}>{rows.length} clients</Text>
            <Text style={styles.sub}>
              Seuil récompense : {resto.rewardThreshold} pts ·{' '}
              {resto.rewardType === 'free_meal' ? 'Repas gratuit' : `−${resto.rewardValue ?? 10}%`}
            </Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Aucun client pour l'instant — scanne pour commencer.</Text>}
        renderItem={({ item }) => {
          const ready = item.points >= resto.rewardThreshold;
          return (
            <Pressable
              onPress={() => {
                if (!ready) return;
                Alert.alert(
                  'Utiliser la récompense ?',
                  `Retirer ${resto.rewardThreshold} pts à ${item.pseudonym} ?`,
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Confirmer',
                      style: 'destructive',
                      onPress: () => redeemReward(item.clientId, resto.id),
                    },
                  ],
                );
              }}
              style={[styles.row, ready && styles.rowReady]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.pseudonym}</Text>
                <Text style={styles.cid} numberOfLines={1}>
                  {item.clientId.slice(0, 8)}…
                </Text>
              </View>
              <Text style={[styles.pts, ready && { color: colors.primary }]}>
                {item.points} pts
              </Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  h1: { ...typography.h2, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted, marginTop: 4 },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  rowReady: { borderColor: colors.primary, backgroundColor: '#FFF5F6' },
  name: { ...typography.h3, color: colors.text },
  cid: { ...typography.small, color: colors.textMuted },
  pts: { ...typography.h3, color: colors.text },
});
