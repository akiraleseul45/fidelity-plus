import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import {
  buildDateOptions,
  formatDateTime,
  formatDuration,
  formatEuro,
} from '../../components/BookingFormat';
import { Screen } from '../../components/Screen';
import { Select, SelectOption } from '../../components/Select';
import { RootStackParamList } from '../../navigation';
import {
  Booking,
  BookingMode,
  ProService,
  Slot,
  VitrinePartner,
  apiBook,
  apiSlots,
  apiVitrine,
} from '../../store/api';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientBooking'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ClientBookingScreen: React.FC<Props> = ({ route, navigation }) => {
  const { partnerId, serviceId: initialServiceId } = route.params;
  const { user } = useApp();
  const client = user?.role === 'client' ? user : null;

  // ─── Initial vitrine load ───
  const [vitrine, setVitrine] = useState<VitrinePartner | null>(null);
  const [services, setServices] = useState<ProService[]>([]);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ─── Selection ───
  const [serviceId, setServiceId] = useState<string | undefined>(initialServiceId);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotCapacity, setSlotCapacity] = useState(1);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [partySize, setPartySize] = useState(2);

  // ─── Form ───
  const [customerName, setCustomerName] = useState(client?.pseudonym ?? '');
  const [customerEmail, setCustomerEmail] = useState(client?.email ?? '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ─── Result ───
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const mode: BookingMode = vitrine?.bookingMode ?? 'appointment';
  const isTable = mode === 'table';
  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );
  const dateOptions = useMemo(() => buildDateOptions(maxAdvanceDays), [maxAdvanceDays]);

  const loadVitrine = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const r = await apiVitrine(partnerId);
    if (r.success && r.partner) {
      setVitrine(r.partner);
      setServices((r.services ?? []).filter((s) => s.isActive && !s.isPrivate));
      if (r.bookingSettings?.maxAdvanceDays) setMaxAdvanceDays(r.bookingSettings.maxAdvanceDays);
    } else {
      setLoadError(r.error ?? 'Ce partenaire n’est pas disponible.');
    }
    setLoading(false);
  }, [partnerId]);

  useEffect(() => {
    loadVitrine();
  }, [loadVitrine]);

  // Fetch slots whenever the chosen date or service changes.
  const loadSlots = useCallback(async () => {
    if (!selectedDate) return;
    setSlotsLoading(true);
    setSlotsError(null);
    setSelectedSlot(null);
    const r = await apiSlots(partnerId, selectedDate, serviceId);
    if (r.success) {
      setSlots(r.slots ?? []);
      if (r.capacity && r.capacity > 0) setSlotCapacity(r.capacity);
    } else {
      setSlots([]);
      setSlotsError(r.error ?? 'Impossible de charger les créneaux.');
    }
    setSlotsLoading(false);
  }, [partnerId, selectedDate, serviceId]);

  useEffect(() => {
    if (selectedDate) loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, serviceId]);

  const serviceSelectOptions: SelectOption<string>[] = services.map((s) => {
    const price = formatEuro(s.priceCents, s.currency);
    return { value: s.id, label: price ? `${s.name} — ${price}` : s.name };
  });

  const partySizeOptions: SelectOption<string>[] = useMemo(() => {
    const max = Math.max(1, slotCapacity);
    return Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      return { value: String(n), label: n > 1 ? `${n} personnes` : '1 personne' };
    });
  }, [slotCapacity]);

  const canSubmit =
    !!selectedSlot &&
    customerName.trim().length > 0 &&
    EMAIL_RE.test(customerEmail.trim()) &&
    acceptTerms &&
    !submitting;

  const submit = async () => {
    if (!selectedSlot || !selectedDate) return;
    setFormError(null);
    if (!customerName.trim()) {
      setFormError('Indique ton nom.');
      return;
    }
    if (!EMAIL_RE.test(customerEmail.trim())) {
      setFormError('Indique un email valide (pour recevoir la confirmation).');
      return;
    }
    if (!acceptTerms) {
      setFormError('Tu dois accepter les conditions de réservation.');
      return;
    }
    setSubmitting(true);
    const r = await apiBook(partnerId, {
      serviceId,
      date: selectedDate,
      startMin: selectedSlot.startMin,
      partySize: isTable ? partySize : undefined,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      acceptTerms: true,
    });
    setSubmitting(false);
    if (r.success && r.booking) {
      setConfirmed(r.booking);
    } else {
      // A conflict (slot just taken) or any failure: refresh the grid so the
      // client sees current availability, and surface the message.
      setFormError(r.error ?? 'La réservation a échoué. Réessaie.');
      loadSlots();
    }
  };

  // ─────────────────────────── RENDER ───────────────────────────

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  if (loadError || !vitrine) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>{loadError ?? 'Partenaire introuvable.'}</Text>
          <Button title="Réessayer" variant="secondary" onPress={loadVitrine} style={{ marginTop: spacing.md }} />
        </View>
      </Screen>
    );
  }

  if (!vitrine.modBooking) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>Ce partenaire n’accepte pas les réservations en ligne.</Text>
          <Button title="Retour" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }} />
        </View>
      </Screen>
    );
  }

  // ─── Confirmation view ───
  if (confirmed) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.confirmWrap}>
          <Text style={styles.confirmTick}>✅</Text>
          <Text style={styles.confirmTitle}>Réservation confirmée</Text>
          <View style={styles.refPill}>
            <Text style={styles.refLabel}>Référence</Text>
            <Text style={styles.refValue}>{confirmed.reference}</Text>
          </View>

          <View style={styles.recapBox}>
            <RecapRow label="Établissement" value={vitrine.companyName} />
            {confirmed.serviceName ? <RecapRow label="Prestation" value={confirmed.serviceName} /> : null}
            <RecapRow label="Date & heure" value={formatDateTime(confirmed.startsAt)} />
            {isTable ? <RecapRow label="Couverts" value={String(confirmed.partySize)} /> : null}
          </View>

          <Text style={styles.confirmNote}>
            📩 Un email de confirmation t’a été envoyé. Aucun paiement n’est requis.
          </Text>

          <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            {client ? (
              <Button
                title="Mes réservations"
                variant="primary"
                onPress={() => navigation.navigate('ClientBookings')}
              />
            ) : null}
            <Button
              title="Terminé"
              variant="secondary"
              onPress={() =>
                navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')
              }
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  // ─── Booking flow ───
  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.flowWrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.partner}>{vitrine.companyName}</Text>
        <Text style={styles.modeHint}>
          {isTable ? '🍽️ Réservation de table' : '🗓️ Prise de rendez-vous'}
        </Text>

        {/* Prestation */}
        {services.length > 0 ? (
          <View style={styles.block}>
            <Select
              label="Prestation"
              placeholder="Choisir une prestation"
              value={serviceId ?? null}
              options={serviceSelectOptions}
              onChange={(v) => setServiceId(v)}
            />
            {selectedService ? (
              <Text style={styles.serviceMeta}>
                {formatDuration(selectedService.durationMin)}
                {formatEuro(selectedService.priceCents, selectedService.currency)
                  ? ` · ${formatEuro(selectedService.priceCents, selectedService.currency)} (indicatif)`
                  : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Couverts (table) */}
        {isTable ? (
          <View style={styles.block}>
            <Select
              label="Nombre de couverts"
              value={String(partySize)}
              options={partySizeOptions}
              onChange={(v) => setPartySize(Number(v))}
            />
          </View>
        ) : null}

        {/* Date */}
        <View style={styles.block}>
          <Text style={styles.blockLabel}>Date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
          >
            {dateOptions.map((d) => {
              const active = d.iso === selectedDate;
              return (
                <Pressable
                  key={d.iso}
                  onPress={() => setSelectedDate(d.iso)}
                  style={[styles.dateChip, active && styles.dateChipActive]}
                >
                  <Text style={[styles.dateWeekday, active && styles.dateTextActive]}>{d.weekday}</Text>
                  <Text style={[styles.dateDay, active && styles.dateTextActive]}>{d.day}</Text>
                  <Text style={[styles.dateMonth, active && styles.dateTextActive]}>{d.month}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Slots */}
        {selectedDate ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Créneaux disponibles</Text>
            {slotsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : slotsError ? (
              <Text style={styles.muted}>{slotsError}</Text>
            ) : slots.length === 0 ? (
              <Text style={styles.muted}>Aucun créneau disponible ce jour-là.</Text>
            ) : (
              <View style={styles.slotGrid}>
                {slots.map((s) => {
                  const enough = s.remaining >= (isTable ? partySize : 1);
                  const active = selectedSlot?.startMin === s.startMin;
                  return (
                    <Pressable
                      key={s.startMin}
                      disabled={!enough}
                      onPress={() => setSelectedSlot(s)}
                      style={[
                        styles.slot,
                        active && styles.slotActive,
                        !enough && styles.slotDisabled,
                      ]}
                    >
                      <Text style={[styles.slotTime, active && styles.slotTimeActive]}>{s.time}</Text>
                      <Text style={[styles.slotRemaining, active && styles.slotTimeActive]}>
                        {isTable ? `${s.remaining} pl.` : s.remaining > 1 ? `${s.remaining} disp.` : 'dispo'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {/* Form (once a slot is chosen) */}
        {selectedSlot ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Tes coordonnées</Text>

            <Field label="Nom *" value={customerName} onChangeText={setCustomerName} placeholder="Ton nom" />
            <Field
              label="Email *"
              value={customerEmail}
              onChangeText={setCustomerEmail}
              placeholder="pour recevoir la confirmation"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Téléphone"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="facultatif"
              keyboardType="phone-pad"
            />
            <Field
              label="Note"
              value={notes}
              onChangeText={setNotes}
              placeholder="facultatif (allergies, demande…)"
              multiline
            />

            <Pressable
              onPress={() => setAcceptTerms((v) => !v)}
              style={styles.termsRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptTerms }}
            >
              <View style={[styles.checkbox, acceptTerms && styles.checkboxOn]}>
                {acceptTerms ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.termsText}>
                J’accepte les conditions de réservation. Aucun paiement n’est demandé.
              </Text>
            </Pressable>

            {formError ? <Text style={styles.error}>{formError}</Text> : null}

            <Button
              title="Confirmer la réservation"
              variant="primary"
              onPress={submit}
              loading={submitting}
              disabled={!canSubmit}
              style={{ marginTop: spacing.sm }}
            />
            <Text style={styles.recapSmall}>
              {formatDateTime(selectedSlot.startsAt)}
              {isTable ? ` · ${partySize} couvert${partySize > 1 ? 's' : ''}` : ''}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
};

const RecapRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.recapRow}>
    <Text style={styles.recapLabel}>{label}</Text>
    <Text style={styles.recapValue}>{value}</Text>
  </View>
);

const Field: React.FC<{
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences';
  multiline?: boolean;
}> = ({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, multiline }) => (
  <View style={{ gap: 6 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      multiline={multiline}
      style={[styles.input, multiline && styles.inputMultiline]}
    />
  </View>
);

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  flowWrap: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  partner: { ...typography.h2, color: colors.text },
  modeHint: { ...typography.body, color: colors.textMuted, marginTop: -spacing.md },
  block: { gap: spacing.sm },
  blockLabel: { ...typography.h3, color: colors.text },
  serviceMeta: { ...typography.small, color: colors.textMuted },

  dateChip: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
    minWidth: 60,
  },
  dateChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateWeekday: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },
  dateDay: { ...typography.h3, color: colors.text, fontWeight: '800' },
  dateMonth: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },
  dateTextActive: { color: '#fff' },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
    minWidth: 76,
  },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotDisabled: { opacity: 0.35 },
  slotTime: { ...typography.body, color: colors.text, fontWeight: '700' },
  slotTimeActive: { color: '#fff' },
  slotRemaining: { ...typography.small, color: colors.textMuted },

  fieldLabel: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },

  termsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: '#fff', fontWeight: '800', fontSize: 14 },
  termsText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 18 },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
  recapSmall: { ...typography.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, textTransform: 'capitalize' },

  // Confirmation
  confirmWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  confirmTick: { fontSize: 64 },
  confirmTitle: { ...typography.h1, color: colors.text, textAlign: 'center' },
  refPill: {
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  refLabel: { ...typography.small, color: colors.textMuted, letterSpacing: 1 },
  refValue: { ...typography.h2, color: colors.primary, fontWeight: '800', letterSpacing: 1 },
  recapBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  recapLabel: { ...typography.small, color: colors.textMuted },
  recapValue: { ...typography.body, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right', textTransform: 'capitalize' },
  confirmNote: { ...typography.body, color: colors.text, textAlign: 'center', lineHeight: 22 },
});
