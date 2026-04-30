import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { PartnerMap } from '../../components/PartnerMap';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientRestaurants'>;

export const ClientRestaurantsScreen: React.FC<Props> = ({ navigation }) => {
  const { restaurants, client, getPoints } = useApp();

  const goToDetail = (id: string) =>
    navigation.navigate('ClientRestaurantDetail', { restaurantId: id });

  return (
    <Screen padded={false}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        data={restaurants}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <View>
              <Text style={styles.greeting}>Salut {client?.pseudonym ?? ''}</Text>
              <Text style={styles.hint}>Trouve les partenaires Fidelity Plus à Orléans</Text>
            </View>
            <ErrorBoundary>
              <PartnerMap restaurants={restaurants} onPressMarker={goToDetail} height={240} />
            </ErrorBoundary>
            <Text style={styles.sectionTitle}>
              {restaurants.length} partenaire{restaurants.length > 1 ? 's' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Aucun partenaire pour l'instant.</Text>
        }
        renderItem={({ item }) => {
          const points = client ? getPoints(client.id, item.id) : 0;
          const ready = points >= item.rewardThreshold;
          return (
            <Pressable
              onPress={() => goToDetail(item.id)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <View style={{ gap: 6 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.ownerName ? (
                  <Text style={styles.owner} numberOfLines={1}>
                    👤 {item.ownerName}
                  </Text>
                ) : null}
                <Text style={styles.addr} numberOfLines={2}>
                  📍 {item.address || 'Adresse non renseignée'}
                </Text>
                {item.phoneMobile ? (
                  <Text style={styles.phone} numberOfLines={1}>
                    📱 {item.phoneMobile}
                  </Text>
                ) : null}
                {item.phoneFixed ? (
                  <Text style={styles.phone} numberOfLines={1}>
                    ☎️ {item.phoneFixed}
                  </Text>
                ) : null}
                <View style={styles.rowBetween}>
                  <Text style={styles.points}>
                    {points} / {item.rewardThreshold} pts
                  </Text>
                  {ready && <Text style={styles.badge}>Récompense !</Text>}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  greeting: { ...typography.h2, color: colors.text },
  hint: { ...typography.body, color: colors.textMuted, marginTop: 4 },
  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.sm },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    padding: spacing.md,
  },
  name: { ...typography.h3, color: colors.text },
  owner: { ...typography.small, color: colors.text, fontWeight: '600' },
  addr: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  phone: { ...typography.small, color: colors.textMuted },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  points: { ...typography.body, color: colors.text, fontWeight: '600' },
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
});
