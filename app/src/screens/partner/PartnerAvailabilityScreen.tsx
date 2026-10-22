import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { usePartnerHeader } from '../../components/PartnerMenu';
import { WEEKDAYS, labelToMinutes, minutesToLabel } from '../../constants/business';
import {
  AvailabilityException,
  AvailabilityRule,
  BookingSettings,
  apiProAvailability,
  apiProBookingSettings,
  apiProDeleteException,
  apiProSetRules,
  apiProUpdateBookingSettings,
  apiProUpsertException,
} from '../../store/api';
import { RootStackParamList } from '../../navigation';
import { confirm } from '../../stores/confirmStore';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerAvailability'>;

type Range = { start: string; end: string };
type WeekGrid = Record<number, Range[]>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rulesToGrid(rules: AvailabilityRule[]): WeekGrid {
  const grid: WeekGrid = {};
  for (const d of WEEKDAYS) grid[d.value] = [];
  for (const r of rules) {
    (grid[r.weekday] ||= []).push({ start: minutesToLabel(r.startMin), end: minutesToLabel(r.endMin) });
  }
  for (const d of WEEKDAYS) grid[d.value].sort((a, b) => a.start.localeCompare(b.start));
  return grid;
}

export const PartnerAvailabilityScreen: React.FC<Props> = ({ navigation }) => {
  usePartnerHeader(navigation);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [grid, setGrid] = useState<WeekGrid>(() => rulesToGrid([]));
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [settings, setSettings] = useState<BookingSettings | null>(null);

  const [savingRules, setSavingRules] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [av, bs] = await Promise.all([apiProAvailability(), apiProBookingSettings()]);
    setLoading(false);
    if (!av.success) {
      setError(av.error || 'Chargement impossible.');
      return;
    }
    setError(null);
    setGrid(rulesToGrid(av.rules ?? []));
    setExceptions(av.exceptions ?? []);
    if (bs.success && bs.settings) setSettings(bs.settings);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Weekly grid helpers ----
  const addRange = (weekday: number) =>
    setGrid((g) => ({ ...g, [weekday]: [...g[weekday], { start: '09:00', end: '18:00' }] }));
  const removeRange = (weekday: number, idx: number) =>
    setGrid((g) => ({ ...g, [weekday]: g[weekday].filter((_, i) => i !== idx) }));
  const editRange = (weekday: number, idx: number, key: keyof Range, value: string) =>
    setGrid((g) => ({
      ...g,
      [weekday]: g[weekday].map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
    }));

  const saveRules = async () => {
    setRulesSaved(false);
    const rules: AvailabilityRule[] = [];
    for (const d of WEEKDAYS) {
      for (const r of grid[d.value]) {
        const s = labelToMinutes(r.start);
        const e = labelToMinutes(r.end);
        if (s == null || e == null) {
          setError(`Horaire invalide ${d.label} (format HH:MM).`);
          return;
        }
        if (e <= s) {
          setError(`${d.label} : l’heure de fin doit suivre l’heure de début.`);
          return;
        }
        rules.push({ weekday: d.value, startMin: s, endMin: e });
      }
    }
    setError(null);
    setSavingRules(true);
    const res = await apiProSetRules(rules);
    setSavingRules(false);
    if (!res.success) {
      setError(res.error || 'Enregistrement impossible.');
      return;
    }
    if (res.rules) setGrid(rulesToGrid(res.rules));
    setRulesSaved(true);
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* ---- Weekly opening hours ---- */}
        <View style={{ gap: spacing.md }}>
          <Text style={styles.sectionTitle}>Horaires d’ouverture</Text>
          <Text style={styles.sectionHint}>
            Ajoute un ou plusieurs créneaux par jour (format 24 h, HH:MM). Un jour sans créneau est
            fermé.
          </Text>
          {WEEKDAYS.map((d) => (
            <View key={d.value} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayName}>{d.label}</Text>
                <Pressable onPress={() => addRange(d.value)} hitSlop={8}>
                  <Text style={styles.addLink}>+ Créneau</Text>
                </Pressable>
              </View>
              {grid[d.value].length === 0 ? (
                <Text style={styles.closed}>Fermé</Text>
              ) : (
                grid[d.value].map((r, idx) => (
                  <View key={idx} style={styles.rangeRow}>
                    <TextInput
                      value={r.start}
                      onChangeText={(v) => editRange(d.value, idx, 'start', v)}
                      placeholder="09:00"
                      placeholderTextColor={colors.textMuted}
                      style={styles.timeInput}
                      maxLength={5}
                    />
                    <Text style={styles.dash}>→</Text>
                    <TextInput
                      value={r.end}
                      onChangeText={(v) => editRange(d.value, idx, 'end', v)}
                      placeholder="18:00"
                      placeholderTextColor={colors.textMuted}
                      style={styles.timeInput}
                      maxLength={5}
                    />
                    <Pressable
                      onPress={() => removeRange(d.value, idx)}
                      hitSlop={8}
                      accessibilityLabel="Supprimer le créneau"
                    >
                      <Text style={styles.removeX}>✕</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          ))}
          {rulesSaved ? <Text style={styles.success}>Horaires enregistrés.</Text> : null}
          <Button
            title="Enregistrer les horaires"
            onPress={saveRules}
            loading={savingRules}
            disabled={savingRules}
          />
        </View>

        {/* ---- Exceptions ---- */}
        <ExceptionsSection
          exceptions={exceptions}
          onChange={setExceptions}
          onError={setError}
        />

        {/* ---- Engine settings ---- */}
        {settings ? (
          <SettingsSection settings={settings} onSaved={setSettings} onError={setError} />
        ) : null}
      </ScrollView>
    </Screen>
  );
};

// ---------------------------------------------------------------------
//                            Exceptions
// ---------------------------------------------------------------------
const ExceptionsSection: React.FC<{
  exceptions: AvailabilityException[];
  onChange: (next: AvailabilityException[]) => void;
  onError: (msg: string | null) => void;
}> = ({ exceptions, onChange, onError }) => {
  const [date, setDate] = useState('');
  const [closed, setClosed] = useState(true);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const d = date.trim();
    if (!DATE_RE.test(d)) {
      onError('Date invalide (format AAAA-MM-JJ).');
      return;
    }
    const body: {
      date: string;
      isClosed?: boolean;
      startMin?: number;
      endMin?: number;
      reason?: string;
    } = { date: d, reason: reason.trim() || undefined };
    if (closed) {
      body.isClosed = true;
    } else {
      const s = labelToMinutes(start);
      const e = labelToMinutes(end);
      if (s == null || e == null || e <= s) {
        onError('Horaires spéciaux invalides (HH:MM, fin après début).');
        return;
      }
      body.isClosed = false;
      body.startMin = s;
      body.endMin = e;
    }
    onError(null);
    setSaving(true);
    const res = await apiProUpsertException(body);
    setSaving(false);
    if (!res.success || !res.exception) {
      onError(res.error || 'Exception non enregistrée.');
      return;
    }
    const saved = res.exception;
    const rest = exceptions.filter((x) => x.date !== saved.date);
    onChange([...rest, saved].sort((a, b) => a.date.localeCompare(b.date)));
    setDate('');
    setReason('');
  };

  const remove = async (ex: AvailabilityException) => {
    const ok = await confirm({
      title: 'Supprimer l’exception ?',
      message: `L’exception du ${ex.date} sera supprimée.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    const res = await apiProDeleteException(ex.date);
    if (!res.success) {
      onError(res.error || 'Suppression impossible.');
      return;
    }
    onChange(exceptions.filter((x) => x.date !== ex.date));
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.sectionTitle}>Exceptions</Text>
      <Text style={styles.sectionHint}>
        Ferme un jour précis (jour férié, congé) ou applique des horaires spéciaux.
      </Text>

      {exceptions.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {exceptions.map((ex) => (
            <View key={ex.date} style={styles.exRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exDate}>{ex.date}</Text>
                <Text style={styles.exInfo}>
                  {ex.isClosed
                    ? 'Fermé'
                    : `${minutesToLabel(ex.startMin ?? 0)} → ${minutesToLabel(ex.endMin ?? 0)}`}
                  {ex.reason ? ` · ${ex.reason}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => remove(ex)} hitSlop={8} accessibilityLabel="Supprimer">
                <Text style={styles.removeX}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.exForm}>
        <Text style={styles.label}>Date (AAAA-MM-JJ)</Text>
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="2026-12-25"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={styles.input}
          maxLength={10}
        />
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Fermé toute la journée</Text>
          <Switch
            value={closed}
            onValueChange={setClosed}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
        {!closed ? (
          <View style={styles.rangeRow}>
            <TextInput
              value={start}
              onChangeText={setStart}
              style={styles.timeInput}
              maxLength={5}
              placeholder="09:00"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.dash}>→</Text>
            <TextInput
              value={end}
              onChangeText={setEnd}
              style={styles.timeInput}
              maxLength={5}
              placeholder="18:00"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        ) : null}
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Motif (optionnel)"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <Button
          title="Ajouter l’exception"
          variant="secondary"
          onPress={add}
          loading={saving}
          disabled={saving}
        />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------
//                          Engine settings
// ---------------------------------------------------------------------
const SettingsSection: React.FC<{
  settings: BookingSettings;
  onSaved: (s: BookingSettings) => void;
  onError: (msg: string | null) => void;
}> = ({ settings, onSaved, onError }) => {
  const [slotInterval, setSlotInterval] = useState(String(settings.slotIntervalMin));
  const [minNotice, setMinNotice] = useState(String(settings.minNoticeMin));
  const [maxAdvance, setMaxAdvance] = useState(String(settings.maxAdvanceDays));
  const [buffer, setBuffer] = useState(String(settings.bufferMin));
  const [limitPerDay, setLimitPerDay] = useState(settings.maxPerDay != null);
  const [maxPerDay, setMaxPerDay] = useState(String(settings.maxPerDay ?? 10));
  const [defaultCapacity, setDefaultCapacity] = useState(String(settings.defaultCapacity));
  const [timezone, setTimezone] = useState(settings.timezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const num = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const save = async () => {
    setSaved(false);
    const si = num(slotInterval);
    const mn = num(minNotice);
    const ma = num(maxAdvance);
    const bf = num(buffer);
    const dc = num(defaultCapacity);
    if (si == null || si <= 0) return onError('Intervalle de créneaux invalide.');
    if (mn == null) return onError('Délai minimum invalide.');
    if (ma == null || ma <= 0) return onError('Jours à l’avance invalides.');
    if (bf == null) return onError('Tampon invalide.');
    if (dc == null || dc <= 0) return onError('Capacité par défaut invalide.');
    let mpd: number | null = null;
    if (limitPerDay) {
      const v = num(maxPerDay);
      if (v == null || v <= 0) return onError('Maximum par jour invalide.');
      mpd = v;
    }
    const tz = timezone.trim();
    if (!tz) return onError('Fuseau horaire requis.');

    onError(null);
    setSaving(true);
    const res = await apiProUpdateBookingSettings({
      slotIntervalMin: si,
      minNoticeMin: mn,
      maxAdvanceDays: ma,
      bufferMin: bf,
      maxPerDay: mpd,
      defaultCapacity: dc,
      timezone: tz,
    });
    setSaving(false);
    if (!res.success || !res.settings) {
      onError(res.error || 'Enregistrement impossible.');
      return;
    }
    onSaved(res.settings);
    setSaved(true);
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.sectionTitle}>Réglages du moteur</Text>
      <Text style={styles.sectionHint}>
        Contrôlent la génération des créneaux proposés aux clients.
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <NumField label="Intervalle (min)" value={slotInterval} onChange={setSlotInterval} />
        <NumField label="Tampon (min)" value={buffer} onChange={setBuffer} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <NumField label="Délai mini (min)" value={minNotice} onChange={setMinNotice} />
        <NumField label="Jours à l’avance" value={maxAdvance} onChange={setMaxAdvance} />
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Limiter le nombre de réservations / jour</Text>
          <Text style={styles.toggleHint}>Sans limite si désactivé.</Text>
        </View>
        <Switch
          value={limitPerDay}
          onValueChange={setLimitPerDay}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>
      {limitPerDay ? (
        <NumField label="Maximum par jour" value={maxPerDay} onChange={setMaxPerDay} />
      ) : null}

      <NumField
        label="Capacité par défaut (mode Table / Couverts)"
        value={defaultCapacity}
        onChange={setDefaultCapacity}
      />

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Fuseau horaire</Text>
        <TextInput
          value={timezone}
          onChangeText={setTimezone}
          placeholder="Europe/Paris"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      {saved ? <Text style={styles.success}>Réglages enregistrés.</Text> : null}
      <Button title="Enregistrer les réglages" onPress={save} loading={saving} disabled={saving} />
    </View>
  );
};

const NumField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <View style={{ gap: 6, flex: 1 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType="number-pad"
      style={styles.input}
    />
  </View>
);

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.small, color: colors.danger, fontWeight: '600' },
  success: { ...typography.small, color: colors.success, fontWeight: '600' },
  sectionTitle: { ...typography.h2, color: colors.text },
  sectionHint: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  dayCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { ...typography.h3, color: colors.text },
  addLink: { ...typography.small, color: colors.primary, fontWeight: '700' },
  closed: { ...typography.small, color: colors.textMuted, fontStyle: 'italic' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeInput: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: 90,
    textAlign: 'center',
  },
  dash: { ...typography.body, color: colors.textMuted },
  removeX: { fontSize: 18, color: colors.danger, fontWeight: '700', paddingHorizontal: 4 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  exDate: { ...typography.body, color: colors.text, fontWeight: '700' },
  exInfo: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  exForm: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggleLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
  toggleHint: { ...typography.small, color: colors.textMuted },
});
