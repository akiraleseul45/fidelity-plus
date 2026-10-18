import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerDashboard'>;

export const PartnerDashboardScreen: React.FC<Props> = ({ navigation }) => {
  const { user, partnerLoyalty, refreshPartnerLoyalty } = useApp();
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

  const readyCount = partnerLoyalty.filter((i) => i.points >= partner.rewardThreshold).length;

  return (
    <Screen padded={false}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        data={partnerLoyalty}
        keyExtractor={(e) => e.clientId}
        refreshing={false}
        onRefresh={refreshPartnerLoyalty}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
            <Text style={styles.h1}>{partnerLoyalty.length} clients</Text>
            <Text style={styles.sub}>
              Seuil récompense : {partner.rewardThreshold} pts ·{' '}
              {partner.rewardType === 'free_meal'
                ? 'Gratuit seulement'
                : `−${partner.rewardValue ?? 10}%`}
            </Text>
            {readyCount > 0 ? (
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>
                  {readyCount} client{readyCount > 1 ? 's' : ''} ont atteint le seuil. Pour utiliser
                  une récompense, ouvre le scanner en mode « récompense » et scanne le QR du client.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('PartnerScanner')}
                  style={styles.hintBtn}
                >
                  <Text style={styles.hintBtnText}>Ouvrir le scanner</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Aucun client pour l'instant — scanne pour commencer.</Text>
        }
        renderItem={({ item }) => {
          const ready = item.points >= partner.rewardThreshold;
          return (
            <View
              accessibilityRole="text"
              accessibilityLabel={`${item.pseudonym}, ${item.points} points${ready ? ', récompense disponible' : ''}`}
              style={[styles.row, ready && styles.rowReady]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.pseudonym}</Text>
                {ready ? <Text style={styles.readyTag}>🎁 Récompense disponible</Text> : null}
              </View>
              <Text style={[styles.pts, ready && { color: colors.primary }]}>
                {item.points} pts
              </Text>
            </View>
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
  readyTag: { ...typography.small, color: colors.primary, fontWeight: '700', marginTop: 2 },
  pts: { ...typography.h3, color: colors.text },
  hintBox: {
    backgroundColor: '#EAF4FF',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  hintText: { ...typography.small, color: '#0B4A8C', lineHeight: 18 },
  hintBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  hintBtnText: { ...typography.small, color: '#fff', fontWeight: '700' },
});
