import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import {
  ProService,
  apiProCreateService,
  apiProDeleteService,
  apiProServices,
  apiProUpdateService,
} from '../../store/api';
import { RootStackParamList } from '../../navigation';
import { confirm } from '../../stores/confirmStore';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerServices'>;

function centsToEuros(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function priceLabel(cents: number | null): string {
  if (cents == null) return 'Tarif non indiqué';
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

type FormState = {
  id: string | null;
  name: string;
  description: string;
  category: string;
  priceEuros: string;
  durationMin: string;
  capacity: string;
  isActive: boolean;
  isPrivate: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  description: '',
  category: '',
  priceEuros: '',
  durationMin: '30',
  capacity: '1',
  isActive: true,
  isPrivate: false,
};

export const PartnerServicesScreen: React.FC<Props> = ({ navigation }) => {
  usePartnerHeader(navigation);

  const [items, setItems] = useState<ProService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiProServices();
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Chargement impossible.');
      return;
    }
    setError(null);
    setItems(res.items ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (s: ProService) => {
    setForm({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      category: s.category ?? '',
      priceEuros: centsToEuros(s.priceCents),
      durationMin: String(s.durationMin),
      capacity: String(s.capacity),
      isActive: !!s.isActive,
      isPrivate: !!s.isPrivate,
    });
    setFormOpen(true);
  };

  const remove = async (s: ProService) => {
    const ok = await confirm({
      title: 'Supprimer cette prestation ?',
      message: `« ${s.name} » sera définitivement supprimée.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    const res = await apiProDeleteService(s.id);
    if (!res.success) {
      setError(res.error || 'Suppression impossible.');
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== s.id));
  };

  return (
    <Screen padded={false}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        data={items}
        keyExtractor={(s) => s.id}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <Text style={styles.note}>
              Les tarifs sont purement indicatifs — aucun paiement n’a lieu dans l’application.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="+ Nouvelle prestation" onPress={openCreate} />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <Text style={styles.empty}>Aucune prestation — crée la première.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{item.name}</Text>
                {item.category ? <Text style={styles.cardCat}>{item.category}</Text> : null}
              </View>
              <Text style={styles.cardPrice}>{priceLabel(item.priceCents)}</Text>
            </View>
            {item.description ? (
              <Text style={styles.cardDesc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <View style={styles.badges}>
              <Badge text={`${item.durationMin} min`} />
              <Badge text={`${item.capacity} place${item.capacity > 1 ? 's' : ''}`} />
              {!item.isActive ? <Badge text="Inactif" muted /> : null}
              {item.isPrivate ? <Badge text="Sur lien" muted /> : null}
            </View>
            <View style={styles.actions}>
              <Button
                title="Modifier"
                variant="secondary"
                size="md"
                onPress={() => openEdit(item)}
                style={{ flex: 1 }}
              />
              <Button
                title="Supprimer"
                variant="ghost"
                size="md"
                onPress={() => remove(item)}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      />

      <ServiceFormModal
        visible={formOpen}
        form={form}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          setItems((prev) => {
            const idx = prev.findIndex((x) => x.id === saved.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = saved;
              return next;
            }
            return [...prev, saved];
          });
          setFormOpen(false);
        }}
      />
    </Screen>
  );
};

const Badge: React.FC<{ text: string; muted?: boolean }> = ({ text, muted }) => (
  <View style={[styles.badge, muted && styles.badgeMuted]}>
    <Text style={[styles.badgeText, muted && styles.badgeTextMuted]}>{text}</Text>
  </View>
);

const ServiceFormModal: React.FC<{
  visible: boolean;
  form: FormState;
  onClose: () => void;
  onSaved: (s: ProService) => void;
}> = ({ visible, form, onClose, onSaved }) => {
  const [state, setState] = useState<FormState>(form);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setState(form);
      setErr(null);
    }
  }, [visible, form]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const parsePriceCents = (): number | null => {
    const raw = state.priceEuros.trim().replace(',', '.');
    if (raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return NaN as unknown as number;
    return Math.round(n * 100);
  };

  const save = async () => {
    setErr(null);
    const name = state.name.trim();
    if (!name) {
      setErr('Le nom est obligatoire.');
      return;
    }
    const priceCents = parsePriceCents();
    if (Number.isNaN(priceCents)) {
      setErr('Tarif invalide.');
      return;
    }
    const duration = parseInt(state.durationMin, 10);
    if (!Number.isFinite(duration) || duration <= 0) {
      setErr('Durée invalide (minutes).');
      return;
    }
    const capacity = parseInt(state.capacity, 10);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setErr('Capacité invalide.');
      return;
    }

    setSaving(true);
    const payload = {
      name,
      description: state.description.trim(),
      category: state.category.trim(),
      priceCents,
      durationMin: duration,
      capacity,
      isActive: state.isActive,
      isPrivate: state.isPrivate,
    };
    const res = state.id
      ? await apiProUpdateService(state.id, payload)
      : await apiProCreateService(payload);
    setSaving(false);
    if (!res.success || !res.service) {
      setErr(res.error || 'Enregistrement impossible.');
      return;
    }
    onSaved(res.service);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {state.id ? 'Modifier la prestation' : 'Nouvelle prestation'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fermer">
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            <Field label="Nom *">
              <TextInput
                value={state.name}
                onChangeText={(v) => set('name', v)}
                placeholder="Ex. Coupe homme"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </Field>

            <Field label="Description">
              <TextInput
                value={state.description}
                onChangeText={(v) => set('description', v)}
                placeholder="Détails de la prestation…"
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, { minHeight: 80 }]}
                textAlignVertical="top"
              />
            </Field>

            <Field label="Catégorie">
              <TextInput
                value={state.category}
                onChangeText={(v) => set('category', v)}
                placeholder="Ex. Coupe, Soin, Menu…"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </Field>

            <Field label="Tarif indicatif (€) — aucun paiement">
              <TextInput
                value={state.priceEuros}
                onChangeText={(v) => set('priceEuros', v)}
                placeholder="Ex. 25"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </Field>

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Field label="Durée (min)" style={{ flex: 1 }}>
                <TextInput
                  value={state.durationMin}
                  onChangeText={(v) => set('durationMin', v)}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
              <Field label="Capacité" style={{ flex: 1 }}>
                <TextInput
                  value={state.capacity}
                  onChangeText={(v) => set('capacity', v)}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Active</Text>
                <Text style={styles.toggleHint}>Visible et réservable par les clients.</Text>
              </View>
              <Switch
                value={state.isActive}
                onValueChange={(v) => set('isActive', v)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Privée / sur lien</Text>
                <Text style={styles.toggleHint}>
                  Masquée de la vitrine, accessible uniquement via un lien direct.
                </Text>
              </View>
              <Switch
                value={state.isPrivate}
                onValueChange={(v) => set('isPrivate', v)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            {err ? <Text style={styles.error}>{err}</Text> : null}
          </ScrollView>

          <Button title="Enregistrer" onPress={save} loading={saving} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; style?: object }> = ({
  label,
  children,
  style,
}) => (
  <View style={[{ gap: 6 }, style]}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  note: { ...typography.small, color: colors.textMuted, fontStyle: 'italic' },
  error: { ...typography.small, color: colors.danger, fontWeight: '600' },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardName: { ...typography.h3, color: colors.text },
  cardCat: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  cardPrice: { ...typography.h3, color: colors.primary },
  cardDesc: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeMuted: { backgroundColor: '#FDECEC' },
  badgeText: { ...typography.small, color: colors.text, fontWeight: '600' },
  badgeTextMuted: { color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '92%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { ...typography.h2, color: colors.text },
  close: { fontSize: 22, color: colors.textMuted, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 4,
  },
  toggleLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
  toggleHint: { ...typography.small, color: colors.textMuted },
});
