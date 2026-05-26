import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerDashboard'>;

export const PartnerDashboardScreen: React.FC<Props> = () => {
  const { user, partnerLoyalty, refreshPartnerLoyalty, redeemReward } = useApp();
  const partner = user?.role === 'partner' ? user : null;

  useEffect(() => {
    refreshPartnerLoyalty();
  }, [refreshPartnerLoyalty]);

  if (!partner) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Session expirée.</Text>
      </Screen>
    );
  }

  const onRedeem = async (clientId: string, pseudonym: string) => {
    const confirm =
      Platform.OS === 'web'
        ? typeof window !== 'undefined'
          ? window.confirm(`Retirer ${partner.rewardThreshold} pts à ${pseudonym} ?`)
          : true
        : await new Promise<boolean>((resolve) =>
            Alert.alert(
              'Utiliser la récompense ?',
              `Retirer ${partner.rewardThreshold} pts à ${pseudonym} ?`,
              [
                { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Confirmer', style: 'destructive', onPress: () => resolve(true) },
              ],
            ),
          );
    if (!confirm) return;
    const res = await redeemReward(clientId);
    if (!res.success) {
      if (Platform.OS === 'web') window.alert(res.error || 'Erreur.');
      else Alert.alert('Erreur', res.error || 'Impossible.');
    }
  };

  return (
    <Screen padded={false}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        data={partnerLoyalty}
        keyExtractor={(e) => e.clientId}
        refreshing={false}
        onRefresh={refreshPartnerLoyalty}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.h1}>{partnerLoyalty.length} clients</Text>
            <Text style={styles.sub}>
              Seuil récompense : {partner.rewardThreshold} pts ·{' '}
              {partner.rewardType === 'free_meal'
                ? 'Gratuit seulement'
                : `−${partner.rewardValue ?? 10}%`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Aucun client pour l'instant — scanne pour commencer.</Text>
        }
        renderItem={({ item }) => {
          const ready = item.points >= partner.rewardThreshold;
          return (
            <Pressable
              onPress={() => ready && onRedeem(item.clientId, item.pseudonym)}
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
