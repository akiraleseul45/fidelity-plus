import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { Select } from '../../components/Select';
import {
  CATEGORIES,
  CategoryValue,
  SERVICE_MODES,
  ServiceModeValue,
} from '../../constants/business';
import { RootStackParamList } from '../../navigation';
import { useApp } from '../../store/AppContext';
import { colors, radius, spacing, typography } from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerSignup'>;

export const PartnerSignupScreen: React.FC<Props> = ({ navigation }) => {
  const { signupPartner } = useApp();
  const [ownerName, setOwnerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [phoneFixed, setPhoneFixed] = useState('');
  const [phoneMobile, setPhoneMobile] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<CategoryValue | null>(null);
  const [serviceMode, setServiceMode] = useState<ServiceModeValue | null>(null);
  const [loading, setLoading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    ownerName.trim().length > 1 &&
    companyName.trim().length > 1 &&
    address.trim().length > 4 &&
    /.+@.+\..+/.test(email) &&
    !!category &&
    !!serviceMode &&
    consent;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    const result = await signupPartner({
      ownerName: ownerName.trim(),
      companyName: companyName.trim(),
      address: address.trim(),
      lat: coords?.lat,
      lng: coords?.lng,
      phoneFixed: phoneFixed.trim() || undefined,
      phoneMobile: phoneMobile.trim() || undefined,
      email: email.trim(),
      category: category || undefined,
      serviceMode: serviceMode || undefined,
    });
    setLoading(false);

    // On failure, stay on the form and show the real error — the account was
    // NOT created (audit FP-15).
    if (!result.ok) {
      setError(result.error || "L'inscription a échoué. Réessaie.");
      return;
    }

    navigation.replace('PartnerSignupSuccess', {
      code: result.loginCode,
      email: email.trim(),
      emailSent: true,
    });
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.h1}>Inscription</Text>
          <Text style={styles.sub}>
            Tes infos sont envoyées pour vérification manuelle. Tu reçois ton code par email.
          </Text>

          <Field label="Nom du domaine" value={ownerName} onChange={setOwnerName} />
          <Field label="Nom de l'entreprise" value={companyName} onChange={setCompanyName} />

          <Select
            label="Catégorie de métier"
            placeholder="Choisis ta catégorie"
            value={category}
            options={CATEGORIES}
            onChange={setCategory}
            accessibilityLabel="Catégorie de métier"
          />
          <Select
            label="Mode de service"
            placeholder="Sur place, à domicile…"
            value={serviceMode}
            options={SERVICE_MODES}
            onChange={setServiceMode}
            accessibilityLabel="Mode de service"
          />

          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Adresse</Text>
            <AddressAutocomplete
              value={address}
              onChange={(t) => {
                setAddress(t);
                if (coords) setCoords(null); // user is editing — clear stale geocode
              }}
              onSelect={(s) => {
                setAddress(s.display_name);
                setCoords({ lat: s.lat, lng: s.lon });
              }}
            />
            <Text style={styles.hint}>
              {coords
                ? `📍 Adresse géolocalisée (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
                : 'Sera affichée aux clients · Choisis une suggestion pour la placer sur la carte'}
            </Text>
          </View>
          <Field
            label="Téléphone fixe"
            value={phoneFixed}
            onChange={setPhoneFixed}
            placeholder="02 38 00 00 00"
            keyboardType="phone-pad"
            optional
          />
          <Field
            label="Téléphone mobile"
            value={phoneMobile}
            onChange={setPhoneMobile}
            placeholder="06 00 00 00 00"
            keyboardType="phone-pad"
            optional
          />
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="contact@monpro.fr"
          />

          <Pressable
            onPress={() => setConsent((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            accessibilityLabel="J'accepte que mes données soient utilisées pour gérer mon compte professionnel"
            style={({ pressed }) => [styles.consentRow, pressed && { opacity: 0.8 }]}
            hitSlop={6}
          >
            <View style={[styles.checkbox, consent && styles.checkboxOn]}>
              {consent ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.consentText}>
              J'accepte que mes données soient utilisées pour gérer mon compte professionnel
              (consentement RGPD requis).
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Legal', {})}
            hitSlop={6}
          >
            <Text style={{ color: colors.primary, textDecorationLine: 'underline', fontSize: 13 }}>
              CGU · Politique de confidentialité · Règlement du programme
            </Text>
          </Pressable>

          {error ? (
            <View
              accessibilityRole="alert"
              style={{
                backgroundColor: '#FDECEC',
                borderRadius: radius.md,
                padding: spacing.md,
                borderWidth: 1,
                borderColor: '#F3B4B4',
              }}
            >
              <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
        <View style={{ paddingBottom: spacing.lg }}>
          <Button
            title="Envoyer la demande"
            onPress={submit}
            disabled={!valid || loading}
            loading={loading}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  optional?: boolean;
  hint?: string;
}> = ({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  optional,
  hint,
}) => (
  <View style={{ gap: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {optional ? <Text style={styles.optional}>(facultatif)</Text> : null}
    </View>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      placeholderTextColor={colors.textMuted}
      style={styles.input}
    />
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  h1: { ...typography.h1, color: colors.text, marginTop: spacing.md },
  sub: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  optional: { ...typography.small, color: colors.textMuted, fontStyle: 'italic' },
  hint: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  consentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  consentText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 18 },
});
