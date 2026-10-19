import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerDashboard'>;

export const PartnerDashboardScreen: React.FC<Props> = ({ navigation }) => {
  const { user, partnerLoyalty, refreshPartnerLoyalty } = useApp();
  const partner = user?.role === 'partner' ? user : null;
  const [query, setQuery] = useState('');

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
  const q = query.trim().toLowerCase();
  const visibleClients = q
    ? partnerLoyalty.filter((i) => i.pseudonym.toLowerCase().includes(q))
    : partnerLoyalty;

  return (
    <Screen padded={false}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        data={visibleClients}
        keyExtractor={(e) => e.clientId}
        refreshing={false}
        onRefresh={refreshPartnerLoyalty}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
            <Text style={styles.h1}>{partnerLoyalty.length} clients</Text>
            <Text style={styles.sub}>
              Seuil récompense : {partner.rewardThreshold} pts ·{' '}
              {partner.rewardType === 'free_meal'
                ? 'Gratuit seulement'
                : `−${partner.rewardValue ?? 10}%`}
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="🔍 Rechercher un client par pseudo…"
              placeholderTextColor={colors.textMuted}
              style={styles.search}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Rechercher un client"
            />
            {q && visibleClients.length !== partnerLoyalty.length ? (
              <Text style={styles.sub}>
                {visibleClients.length} résultat{visibleClients.length > 1 ? 's' : ''} sur{' '}
                {partnerLoyalty.length}
              </Text>
            ) : null}
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
          <Text style={styles.empty}>
            {q
              ? `Aucun client ne correspond à « ${query.trim()} ».`
              : "Aucun client pour l'instant — scanne pour commencer."}
          </Text>
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
  search: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
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
