import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { ClientHistoryItem, apiClientHistory } from '../../store/api';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientHistory'>;

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const ClientHistoryScreen: React.FC<Props> = () => {
  const [items, setItems] = useState<ClientHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await apiClientHistory();
    if (r.success && r.items) setItems(r.items);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen padded={false}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        data={items}
        keyExtractor={(i) => i.id}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <Text style={styles.sub}>Tes dernières activités de fidélité.</Text>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? 'Chargement…' : "Aucune activité pour l'instant."}
          </Text>
        }
        renderItem={({ item }) => {
          const isRedeem = item.kind === 'redeem';
          return (
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>{isRedeem ? '🎁' : '⭐'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.companyName || 'Partenaire'}
                </Text>
                <Text style={styles.meta}>
                  {isRedeem ? 'Récompense utilisée' : 'Point gagné'} · {formatDate(item.createdAt)}
                </Text>
              </View>
              <Text style={[styles.delta, isRedeem ? styles.deltaNeg : styles.deltaPos]}>
                {item.delta > 0 ? `+${item.delta}` : item.delta} pt{Math.abs(item.delta) > 1 ? 's' : ''}
              </Text>
            </View>
          );
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  sub: { ...typography.body, color: colors.textMuted, marginBottom: spacing.sm },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.bg,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  title: { ...typography.body, color: colors.text, fontWeight: '700' },
  meta: { ...typography.small, color: colors.textMuted },
  delta: { ...typography.body, fontWeight: '800' },
  deltaPos: { color: colors.primary },
  deltaNeg: { color: colors.accentPressed ?? colors.textMuted },
});
