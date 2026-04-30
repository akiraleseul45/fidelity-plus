import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientRestaurantDetail'>;

export const ClientRestaurantDetailScreen: React.FC<Props> = ({ route }) => {
  const { restaurants, client, getPoints } = useApp();
  const resto = restaurants.find((r) => r.id === route.params.restaurantId);

  if (!resto) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Partenaire introuvable.</Text>
      </Screen>
    );
  }

  const points = client ? getPoints(client.id, resto.id) : 0;
  const remaining = Math.max(0, resto.rewardThreshold - points);
  const pct = Math.min(1, points / resto.rewardThreshold);

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <Image source={{ uri: resto.imageUrl }} style={styles.hero} />
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Text style={styles.name}>{resto.name}</Text>

          {resto.ownerName ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>👤</Text>
              <Text style={styles.infoText}>{resto.ownerName}</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.infoText}>{resto.address || 'Adresse non renseignée'}</Text>
          </View>

          {resto.phoneFixed ? (
            <Pressable onPress={() => callPhone(resto.phoneFixed!)} style={styles.infoRow}>
              <Text style={styles.infoIcon}>☎️</Text>
              <Text style={[styles.infoText, styles.link]}>{resto.phoneFixed}</Text>
            </Pressable>
          ) : null}

          {resto.phoneMobile ? (
            <Pressable onPress={() => callPhone(resto.phoneMobile!)} style={styles.infoRow}>
              <Text style={styles.infoIcon}>📱</Text>
              <Text style={[styles.infoText, styles.link]}>{resto.phoneMobile}</Text>
            </Pressable>
          ) : null}

          <View style={styles.pointsBox}>
            <Text style={styles.mega}>{points}</Text>
            <Text style={styles.pointsLabel}>
              {remaining === 0 ? 'Récompense disponible !' : `${remaining} pts avant ta récompense`}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
            </View>
            <Text style={styles.rewardInfo}>
              Récompense :{' '}
              {resto.rewardType === 'free_meal'
                ? 'repas gratuit'
                : `−${resto.rewardValue ?? 10}% sur l'addition`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  hero: { width: '100%', height: 220, backgroundColor: colors.surface },
  name: { ...typography.h1, color: colors.text, marginTop: spacing.md },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  infoIcon: { fontSize: 16 },
  infoText: { ...typography.body, color: colors.text, flex: 1 },
  link: { color: colors.primary, fontWeight: '600' },
  pointsBox: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mega: { ...typography.mega, color: colors.primary, lineHeight: 100 },
  pointsLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  rewardInfo: { ...typography.small, color: colors.textMuted },
});
