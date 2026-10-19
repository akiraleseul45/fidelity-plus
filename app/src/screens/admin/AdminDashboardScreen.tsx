import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Screen } from '../../components/Screen';
import { Select } from '../../components/Select';
import {
  CATEGORIES,
  SERVICE_MODES,
  categoryLabel,
  serviceModeLabel,
} from '../../constants/business';
import { RootStackParamList } from '../../navigation';
import {
  AdminClient,
  AdminPartner,
  AdminReport,
  apiAdminClients,
  apiAdminDeleteClient,
  apiAdminDeletePartner,
  apiAdminDeleteReport,
  apiAdminPartners,
  apiAdminReports,
  apiAdminSetPartnerStatus,
  apiAdminSetReportStatus,
  apiAdminStats,
  apiAdminSuspendClient,
  apiAdminSuspendPartner,
  apiAdminUpdateClient,
  apiAdminUpdatePartner,
} from '../../store/api';
import { confirm } from '../../stores/confirmStore';
import { useAuthStore } from '../../stores/authStore';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminDashboard'>;
type Tab = 'partners' | 'clients' | 'reports';

function confirmAction(message: string): Promise<boolean> {
  return confirm({ title: 'Confirmer', message, confirmLabel: 'Confirmer', danger: true });
}

export const AdminDashboardScreen: React.FC<Props> = ({ navigation }) => {
  const logout = useAuthStore((s) => s.logout);
  const [tab, setTab] = useState<Tab>('partners');
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [stats, setStats] = useState<{ clients: number; partners: number; pendingPartners: number; openReports: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [editPartner, setEditPartner] = useState<AdminPartner | null>(null);
  const [editClient, setEditClient] = useState<AdminClient | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p, c, rep] = await Promise.all([
      apiAdminStats(),
      apiAdminPartners(),
      apiAdminClients(),
      apiAdminReports(),
    ]);
    if (s.success && s.stats) setStats(s.stats);
    if (p.success && p.items) setPartners(p.items);
    if (c.success && c.items) setClients(c.items);
    if (rep.success && rep.items) setReports(rep.items);
    // A 403 means the session is no longer an admin — bounce home.
    if ((p as any).error && /réservé|Authentification|Token/i.test((p as any).error)) {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
    setLoading(false);
  }, [navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const doLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  // ---- Partner actions ----
  const approve = async (p: AdminPartner) => {
    await apiAdminSetPartnerStatus(p.id, 'approved');
    load();
  };
  const togglePartnerSuspend = async (p: AdminPartner) => {
    await apiAdminSuspendPartner(p.id, !p.suspendedAt);
    load();
  };
  const deletePartner = async (p: AdminPartner) => {
    if (!(await confirmAction(`Supprimer définitivement « ${p.companyName} » ? Les données personnelles seront anonymisées.`)))
      return;
    await apiAdminDeletePartner(p.id);
    load();
  };

  // ---- Client actions ----
  const toggleClientSuspend = async (c: AdminClient) => {
    await apiAdminSuspendClient(c.id, !c.suspendedAt);
    load();
  };
  const deleteClient = async (c: AdminClient) => {
    if (!(await confirmAction(`Supprimer définitivement « ${c.pseudonym} » ? Les données personnelles seront anonymisées.`)))
      return;
    await apiAdminDeleteClient(c.id);
    load();
  };

  // ---- Report actions ----
  const toggleReport = async (r: AdminReport) => {
    await apiAdminSetReportStatus(r.id, r.status === 'open' ? 'resolved' : 'open');
    load();
  };
  const deleteReport = async (r: AdminReport) => {
    if (!(await confirmAction('Supprimer ce signalement ?'))) return;
    await apiAdminDeleteReport(r.id);
    load();
  };

  const q = query.trim().toLowerCase();
  const visiblePartners = q
    ? partners.filter((p) => `${p.companyName} ${p.ownerName} ${p.email ?? ''} ${p.address}`.toLowerCase().includes(q))
    : partners;
  const visibleClients = q
    ? clients.filter((c) => `${c.pseudonym} ${c.email ?? ''}`.toLowerCase().includes(q))
    : clients;
  const visibleReports = q
    ? reports.filter((r) => `${r.message} ${r.reporterName ?? ''}`.toLowerCase().includes(q))
    : reports;

  return (
    <Screen padded={false}>
      <View style={styles.topBar}>
        <Text style={styles.title}>🛡️ Admin</Text>
        <Pressable onPress={doLogout} hitSlop={8} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Déconnexion</Text>
        </Pressable>
      </View>

      {stats ? (
        <View style={styles.statsRow}>
          <Stat n={stats.partners} label="Pros" />
          <Stat n={stats.clients} label="Clients" />
          <Stat n={stats.pendingPartners} label="En attente" highlight={stats.pendingPartners > 0} />
          <Stat n={stats.openReports} label="Signalements" highlight={stats.openReports > 0} />
        </View>
      ) : null}

      <View style={styles.tabs}>
        <Tab label="Pros" active={tab === 'partners'} onPress={() => setTab('partners')} />
        <Tab label="Clients" active={tab === 'clients'} onPress={() => setTab('clients')} />
        <Tab
          label={`Signalements${stats?.openReports ? ` (${stats.openReports})` : ''}`}
          active={tab === 'reports'}
          onPress={() => setTab('reports')}
        />
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tab === 'partners' ? '🔍 Rechercher un pro…' : '🔍 Rechercher un client…'}
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {tab === 'partners' ? (
        <FlatList
          data={visiblePartners}
          keyExtractor={(p) => p.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>Aucun professionnel.</Text>}
          renderItem={({ item }) => (
            <PartnerCard
              p={item}
              onApprove={() => approve(item)}
              onToggleSuspend={() => togglePartnerSuspend(item)}
              onDelete={() => deletePartner(item)}
              onEdit={() => setEditPartner(item)}
            />
          )}
        />
      ) : tab === 'clients' ? (
        <FlatList
          data={visibleClients}
          keyExtractor={(c) => c.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>Aucun client.</Text>}
          renderItem={({ item }) => (
            <ClientCard
              c={item}
              onToggleSuspend={() => toggleClientSuspend(item)}
              onDelete={() => deleteClient(item)}
              onEdit={() => setEditClient(item)}
            />
          )}
        />
      ) : (
        <FlatList
          data={visibleReports}
          keyExtractor={(r) => r.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>Aucun signalement.</Text>}
          renderItem={({ item }) => (
            <ReportCard r={item} onToggle={() => toggleReport(item)} onDelete={() => deleteReport(item)} />
          )}
        />
      )}

      {editPartner ? (
        <EditPartnerModal
          partner={editPartner}
          onClose={() => setEditPartner(null)}
          onSaved={() => {
            setEditPartner(null);
            load();
          }}
        />
      ) : null}
      {editClient ? (
        <EditClientModal
          client={editClient}
          onClose={() => setEditClient(null)}
          onSaved={() => {
            setEditClient(null);
            load();
          }}
        />
      ) : null}
    </Screen>
  );
};

// ---------------------------------------------------------------- sub-views

const Stat: React.FC<{ n: number; label: string; highlight?: boolean }> = ({ n, label, highlight }) => (
  <View style={[styles.stat, highlight && styles.statHot]}>
    <Text style={[styles.statN, highlight && { color: colors.accent }]}>{n}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Tab: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
    <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
  </Pressable>
);

const Badge: React.FC<{ text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = ({ text, tone }) => {
  const toneStyle = {
    ok: styles.badge_ok,
    warn: styles.badge_warn,
    bad: styles.badge_bad,
    muted: styles.badge_muted,
  }[tone];
  return <Text style={[styles.badge, toneStyle]}>{text}</Text>;
};

const ActionBtn: React.FC<{ label: string; onPress: () => void; tone?: 'default' | 'danger' | 'primary' }> = ({
  label,
  onPress,
  tone = 'default',
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.actBtn,
      tone === 'danger' && styles.actDanger,
      tone === 'primary' && styles.actPrimary,
      pressed && { opacity: 0.8 },
    ]}
    hitSlop={4}
  >
    <Text
      style={[
        styles.actText,
        tone === 'danger' && { color: colors.danger },
        tone === 'primary' && { color: '#fff' },
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

const PartnerCard: React.FC<{
  p: AdminPartner;
  onApprove: () => void;
  onToggleSuspend: () => void;
  onDelete: () => void;
  onEdit: () => void;
}> = ({ p, onApprove, onToggleSuspend, onDelete, onEdit }) => (
  <View style={styles.card}>
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {p.companyName}
      </Text>
      <View style={styles.badges}>
        {p.suspendedAt ? <Badge text="désactivé" tone="bad" /> : null}
        <Badge
          text={p.status === 'approved' ? 'validé' : p.status === 'pending' ? 'en attente' : 'suspendu'}
          tone={p.status === 'approved' ? 'ok' : p.status === 'pending' ? 'warn' : 'muted'}
        />
      </View>
    </View>
    <Text style={styles.cardLine}>👤 {p.ownerName}</Text>
    {p.category ? (
      <Text style={styles.cardLine}>
        🏷️ {categoryLabel(p.category)}
        {p.serviceMode ? ` · ${serviceModeLabel(p.serviceMode)}` : ''}
      </Text>
    ) : null}
    {p.email ? <Text style={styles.cardMuted}>✉️ {p.email}</Text> : null}
    <Text style={styles.cardMuted} numberOfLines={1}>📍 {p.address}</Text>
    <View style={styles.actRow}>
      {p.status !== 'approved' ? <ActionBtn label="✅ Approuver" tone="primary" onPress={onApprove} /> : null}
      <ActionBtn label="✏️ Modifier" onPress={onEdit} />
      <ActionBtn label={p.suspendedAt ? '♻️ Réactiver' : '🚫 Désactiver'} onPress={onToggleSuspend} />
      <ActionBtn label="🗑️ Supprimer" tone="danger" onPress={onDelete} />
    </View>
  </View>
);

const ClientCard: React.FC<{
  c: AdminClient;
  onToggleSuspend: () => void;
  onDelete: () => void;
  onEdit: () => void;
}> = ({ c, onToggleSuspend, onDelete, onEdit }) => (
  <View style={styles.card}>
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {c.pseudonym}
      </Text>
      {c.suspendedAt ? <Badge text="désactivé" tone="bad" /> : null}
    </View>
    {c.email ? <Text style={styles.cardMuted}>✉️ {c.email}</Text> : <Text style={styles.cardMuted}>— sans email</Text>}
    <Text style={styles.cardLine}>
      ⭐ {c.totalPoints} pts · {c.partnersCount} partenaire{c.partnersCount > 1 ? 's' : ''}
    </Text>
    <View style={styles.actRow}>
      <ActionBtn label="✏️ Modifier" onPress={onEdit} />
      <ActionBtn label={c.suspendedAt ? '♻️ Réactiver' : '🚫 Désactiver'} onPress={onToggleSuspend} />
      <ActionBtn label="🗑️ Supprimer" tone="danger" onPress={onDelete} />
    </View>
  </View>
);

const ReportCard: React.FC<{ r: AdminReport; onToggle: () => void; onDelete: () => void }> = ({
  r,
  onToggle,
  onDelete,
}) => {
  const who = r.reporterDeleted ? 'Compte supprimé' : r.reporterName || 'Utilisateur';
  const roleLabel = r.role === 'partner' ? 'Pro' : r.role === 'client' ? 'Client' : '—';
  const when = new Date(r.createdAt).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <View style={[styles.card, r.status === 'open' && styles.cardOpen]}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {roleLabel} · {who}
        </Text>
        <Badge text={r.status === 'open' ? 'ouvert' : 'résolu'} tone={r.status === 'open' ? 'warn' : 'ok'} />
      </View>
      <Text style={styles.reportMsg}>{r.message}</Text>
      <Text style={styles.cardMuted}>
        🕑 {when}
        {r.context ? ` · ${r.context}` : ''}
        {r.reporterEmail ? ` · ${r.reporterEmail}` : ''}
      </Text>
      <View style={styles.actRow}>
        <ActionBtn
          label={r.status === 'open' ? '✅ Marquer résolu' : '↩️ Rouvrir'}
          tone={r.status === 'open' ? 'primary' : 'default'}
          onPress={onToggle}
        />
        <ActionBtn label="🗑️ Supprimer" tone="danger" onPress={onDelete} />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------- edit modals

const FormField: React.FC<{ label: string; value: string; onChange: (v: string) => void; keyboardType?: any }> = ({
  label,
  value,
  onChange,
  keyboardType,
}) => (
  <View style={{ gap: 6 }}>
    <Text style={styles.formLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      style={styles.formInput}
      placeholderTextColor={colors.textMuted}
      keyboardType={keyboardType}
      autoCapitalize="sentences"
    />
  </View>
);

const EditPartnerModal: React.FC<{ partner: AdminPartner; onClose: () => void; onSaved: () => void }> = ({
  partner,
  onClose,
  onSaved,
}) => {
  const [companyName, setCompanyName] = useState(partner.companyName);
  const [ownerName, setOwnerName] = useState(partner.ownerName);
  const [address, setAddress] = useState(partner.address);
  const [phoneFixed, setPhoneFixed] = useState(partner.phoneFixed ?? '');
  const [phoneMobile, setPhoneMobile] = useState(partner.phoneMobile ?? '');
  const [category, setCategory] = useState<string | null>(partner.category);
  const [serviceMode, setServiceMode] = useState<string | null>(partner.serviceMode);
  const [status, setStatus] = useState<string>(partner.status);
  const [rewardThreshold, setRewardThreshold] = useState(String(partner.rewardThreshold));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const fields: Record<string, any> = {
      companyName: companyName.trim(),
      ownerName: ownerName.trim(),
      address: address.trim(),
      phoneFixed: phoneFixed.trim(),
      phoneMobile: phoneMobile.trim(),
      status,
    };
    if (category) fields.category = category;
    if (serviceMode) fields.serviceMode = serviceMode;
    const n = parseInt(rewardThreshold, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 1000) fields.rewardThreshold = n;
    const res = await apiAdminUpdatePartner(partner.id, fields);
    setSaving(false);
    if (!res.success) {
      if (Platform.OS === 'web') window.alert(res.error || 'Échec de la modification.');
      else Alert.alert('Erreur', res.error || 'Échec de la modification.');
      return;
    }
    onSaved();
  };

  return (
    <EditModalShell title="Modifier le professionnel" onClose={onClose} onSave={save} saving={saving}>
      <FormField label="Nom de l'entreprise" value={companyName} onChange={setCompanyName} />
      <FormField label="Nom du domaine / gérant" value={ownerName} onChange={setOwnerName} />
      <FormField label="Adresse" value={address} onChange={setAddress} />
      <FormField label="Téléphone fixe" value={phoneFixed} onChange={setPhoneFixed} keyboardType="phone-pad" />
      <FormField label="Téléphone mobile" value={phoneMobile} onChange={setPhoneMobile} keyboardType="phone-pad" />
      <Select label="Catégorie" value={category} options={CATEGORIES} onChange={setCategory} />
      <Select label="Mode de service" value={serviceMode} options={SERVICE_MODES} onChange={setServiceMode} />
      <Select
        label="Statut"
        value={status}
        options={[
          { value: 'pending', label: 'En attente' },
          { value: 'approved', label: 'Validé' },
          { value: 'suspended', label: 'Suspendu' },
        ]}
        onChange={setStatus}
      />
      <FormField label="Seuil de récompense (pts)" value={rewardThreshold} onChange={setRewardThreshold} keyboardType="number-pad" />
    </EditModalShell>
  );
};

const EditClientModal: React.FC<{ client: AdminClient; onClose: () => void; onSaved: () => void }> = ({
  client,
  onClose,
  onSaved,
}) => {
  const [pseudonym, setPseudonym] = useState(client.pseudonym);
  const [email, setEmail] = useState(client.email ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await apiAdminUpdateClient(client.id, {
      pseudonym: pseudonym.trim(),
      email: email.trim() ? email.trim() : null,
    });
    setSaving(false);
    if (!res.success) {
      if (Platform.OS === 'web') window.alert(res.error || 'Échec de la modification.');
      else Alert.alert('Erreur', res.error || 'Échec de la modification.');
      return;
    }
    onSaved();
  };

  return (
    <EditModalShell title="Modifier le client" onClose={onClose} onSave={save} saving={saving}>
      <FormField label="Pseudonyme" value={pseudonym} onChange={setPseudonym} />
      <FormField label="Email" value={email} onChange={setEmail} keyboardType="email-address" />
    </EditModalShell>
  );
};

const EditModalShell: React.FC<{
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
}> = ({ title, onClose, onSave, saving, children }) => (
  <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.modalBackdrop}>
      <View style={styles.modalSheet}>
        <View style={styles.modalHead}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.modalClose}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}>
          {children}
        </ScrollView>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveBtn, (pressed || saving) && { opacity: 0.8 }]}
        >
          <Text style={styles.saveText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: { ...typography.h1, color: colors.text },
  logoutBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface },
  logoutText: { ...typography.small, color: colors.danger, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statHot: { backgroundColor: '#FFF6E6' },
  statN: { ...typography.h1, color: colors.text },
  statLabel: { ...typography.small, color: colors.textMuted },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.body, color: colors.text, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  search: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  listContent: { padding: spacing.lg, gap: spacing.md },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    backgroundColor: colors.bg,
  },
  cardOpen: { borderColor: colors.accent, backgroundColor: '#FFFCF4' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { ...typography.h3, color: colors.text, flex: 1 },
  cardLine: { ...typography.small, color: colors.text },
  reportMsg: { ...typography.body, color: colors.text, marginVertical: 4, lineHeight: 20 },
  cardMuted: { ...typography.small, color: colors.textMuted },
  badges: { flexDirection: 'row', gap: 6 },
  badge: {
    ...typography.small,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    fontSize: 11,
  },
  badge_ok: { backgroundColor: '#E4F6EC', color: '#137a43' },
  badge_warn: { backgroundColor: '#FFF6E6', color: '#9A6B00' },
  badge_bad: { backgroundColor: '#FDECEC', color: colors.danger },
  badge_muted: { backgroundColor: colors.surface, color: colors.textMuted },
  actRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  actBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  actPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actDanger: { borderColor: '#F3B4B4', backgroundColor: '#FDECEC' },
  actText: { ...typography.small, color: colors.text, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '90%',
    gap: spacing.md,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { ...typography.h2, color: colors.text },
  modalClose: { ...typography.h2, color: colors.textMuted },
  formLabel: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  formInput: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveText: { ...typography.body, color: '#fff', fontWeight: '800' },
});
