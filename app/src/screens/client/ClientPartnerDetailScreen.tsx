import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientPartnerDetail'>;

export const ClientPartnerDetailScreen: React.FC<Props> = ({ route }) => {
  const { partners, clientLoyalty, refreshClientLoyalty } = useApp();
  const partner = partners.find((p) => p.id === route.params.partnerId);

  useEffect(() => {
    refreshClientLoyalty();
  }, [refreshClientLoyalty]);

  if (!partner) {
    return (
      <Screen>
        <Text style={{ color: colors.text }}>Partenaire introuvable.</Text>
      </Screen>
    );
  }

  const points = clientLoyalty.find((l) => l.partnerId === partner.id)?.points ?? 0;
  const remaining = Math.max(0, partner.rewardThreshold - points);
  const pct = Math.min(1, points / partner.rewardThreshold);

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {partner.imageUrl ? (
          <Image source={{ uri: partner.imageUrl }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <Text style={styles.heroPlaceholderText}>{partner.companyName.charAt(0)}</Text>
          </View>
        )}
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Text style={styles.name}>{partner.companyName}</Text>

          {partner.ownerName ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>👤</Text>
              <Text style={styles.infoText}>{partner.ownerName}</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.infoText}>{partner.address || 'Adresse non renseignée'}</Text>
          </View>

          {partner.phoneFixed ? (
            <Pressable onPress={() => callPhone(partner.phoneFixed)} style={styles.infoRow}>
              <Text style={styles.infoIcon}>☎️</Text>
              <Text style={[styles.infoText, styles.link]}>{partner.phoneFixed}</Text>
            </Pressable>
          ) : null}

          {partner.phoneMobile ? (
            <Pressable onPress={() => callPhone(partner.phoneMobile)} style={styles.infoRow}>
              <Text style={styles.infoIcon}>📱</Text>
              <Text style={[styles.infoText, styles.link]}>{partner.phoneMobile}</Text>
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
              {partner.rewardType === 'free_meal'
                ? 'gratuit seulement'
                : `−${partner.rewardValue ?? 10}% sur la prestation`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  hero: { width: '100%', height: 220, backgroundColor: colors.surface },
  heroPlaceholder: {
    backgroundColor: colors.heroBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: { fontSize: 80, fontWeight: '800', color: colors.heroText },
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
