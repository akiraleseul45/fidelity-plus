import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { PartnerMap } from '../../components/PartnerMap';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientPartners'>;

type UserLoc = { lat: number; lng: number; accuracy?: number };

type Filter = 'all' | 'with_points' | 'ready';

export const ClientPartnersScreen: React.FC<Props> = ({ navigation }) => {
  const { partners, user, clientLoyalty, refreshPartners, refreshClientLoyalty } = useApp();
  const client = user?.role === 'client' ? user : null;
  const [userLoc, setUserLoc] = useState<UserLoc | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Helper: get points for the current client at a given partner.
  const pointsFor = (partnerId: string) =>
    clientLoyalty.find((l) => l.partnerId === partnerId)?.points ?? 0;
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'denied' | 'unavailable'>(
    'idle',
  );

  // Filtered + searched list (memoised would be nice but partners list stays small).
  const filteredPartners = partners.filter((p) => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const haystack = `${p.companyName} ${p.ownerName} ${p.address}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filter === 'with_points') return pointsFor(p.id) > 0;
    if (filter === 'ready') return pointsFor(p.id) >= p.rewardThreshold;
    return true;
  });

  const goToDetail = (id: string) =>
    navigation.navigate('ClientPartnerDetail', { partnerId: id });

  /**
   * Request the browser/device geolocation. On web we use navigator.geolocation
   * directly (no extra dependency). The user is prompted for permission the
   * first time.
   */
  const requestLocation = useCallback(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('unavailable');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGeoStatus('idle');
      },
      (err) => {
        console.warn('[geolocation]', err.message);
        setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 },
    );
  }, []);

  // Geolocation is requested only when the user taps "Me localiser"
  // (audit FP-24), never automatically on mount.

  // Refresh server data on mount.
  useEffect(() => {
    refreshPartners();
    if (client) refreshClientLoyalty();
  }, [refreshPartners, refreshClientLoyalty, client]);

  return (
    <Screen padded={false}>
      <View style={styles.container}>
        {/* ─── HAUT FIGÉ : greeting + carte + compteur ─── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Salut {client?.pseudonym ?? ''}</Text>
            <Text style={styles.hint}>Trouve les partenaires Fidelity Plus à Orléans</Text>
          </View>
          <ErrorBoundary>
            <PartnerMap
              partners={partners}
              onPressMarker={goToDetail}
              height={220}
              userLocation={userLoc}
            />
          </ErrorBoundary>

          <View style={styles.geoRow}>
            <Pressable
              onPress={requestLocation}
              style={({ pressed }) => [styles.geoBtn, pressed && { opacity: 0.8 }]}
              hitSlop={6}
            >
              <Text style={styles.geoBtnText}>
                {geoStatus === 'loading'
                  ? '⏳ Localisation…'
                  : userLoc
                    ? '📍 Recentrer sur moi'
                    : '📍 Me localiser'}
              </Text>
            </Pressable>
            {geoStatus === 'denied' ? (
              <Text style={styles.geoHint}>
                Autorisation refusée. Active la géolocalisation dans ton navigateur.
              </Text>
            ) : null}
            {geoStatus === 'unavailable' && !userLoc ? (
              <Text style={styles.geoHint}>Géolocalisation indisponible.</Text>
            ) : null}
          </View>

          {/* Search + filter chips */}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher un partenaire…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
          />

          <View style={styles.chipsRow}>
            <FilterChip label="Tous" active={filter === 'all'} onPress={() => setFilter('all')} />
            <FilterChip
              label="Avec points"
              active={filter === 'with_points'}
              onPress={() => setFilter('with_points')}
            />
            <FilterChip
              label="Récompense prête"
              active={filter === 'ready'}
              onPress={() => setFilter('ready')}
            />
          </View>

          <Text style={styles.sectionTitle}>
            {filteredPartners.length} partenaire{filteredPartners.length > 1 ? 's' : ''}
            {filteredPartners.length !== partners.length ? ` sur ${partners.length}` : ''}
          </Text>
        </View>

        {/* ─── BAS SCROLLABLE : liste des partenaires ─── */}
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={filteredPartners}
          keyExtractor={(r) => r.id}
          showsVerticalScrollIndicator
          ListEmptyComponent={
            <Text style={styles.empty}>Aucun partenaire pour l'instant.</Text>
          }
          renderItem={({ item }) => {
            const points = pointsFor(item.id);
            const ready = points >= item.rewardThreshold;
            return (
              <Pressable
                onPress={() => goToDetail(item.id)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              >
                <View style={{ gap: 6 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.companyName}
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
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      </View>
    </Screen>
  );
};

const FilterChip: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({
  label,
  active,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={[styles.filterChip, active && styles.filterChipActive]}
    hitSlop={4}
  >
    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // On web, the parent must have a constrained height so the FlatList
    // child can overflow & scroll independently of the fixed header.
    minHeight: 0,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  greeting: { ...typography.h2, color: colors.text },
  hint: { ...typography.body, color: colors.textMuted, marginTop: 4 },
  sectionTitle: { ...typography.h3, color: colors.text },
  geoRow: { gap: 4, alignItems: 'flex-start' },
  geoBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  geoBtnText: { ...typography.small, color: colors.primary, fontWeight: '700' },
  geoHint: { ...typography.small, color: colors.textMuted },
  searchInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { ...typography.small, color: colors.text, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
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
