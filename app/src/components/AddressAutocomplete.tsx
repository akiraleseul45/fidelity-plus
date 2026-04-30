import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

export type AddressSuggestion = {
  display_name: string;
  lat: number;
  lon: number;
  // Nominatim address parts
  road?: string;
  postcode?: string;
  city?: string;
};

type Props = {
  value: string;
  onChange: (text: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  /** Bias geocoding around a city. Default: Orléans, France. */
  viewbox?: string;
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * Address typeahead backed by OpenStreetMap Nominatim. Free, no API key,
 * but rate-limited (1 req/s) — we debounce 350ms and only fire after 4
 * characters to stay polite.
 */
export const AddressAutocomplete: React.FC<Props> = ({
  value,
  onChange,
  onSelect,
  placeholder = '12 rue Bannier, 45000 Orléans',
  viewbox = '1.80,47.95,2.00,47.85', // Orléans bounding box (W,N,E,S)
}) => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef<string>('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = value.trim();
    if (q.length < 4) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    if (q === lastQueryRef.current) return;

    debounceRef.current = setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      try {
        const url = `${NOMINATIM_URL}?format=json&addressdetails=1&limit=5&countrycodes=fr&viewbox=${viewbox}&bounded=0&q=${encodeURIComponent(
          q,
        )}`;
        const res = await fetch(url, {
          headers: { 'Accept-Language': 'fr', Accept: 'application/json' },
        });
        const data = (await res.json()) as Array<{
          display_name: string;
          lat: string;
          lon: string;
          address?: { road?: string; postcode?: string; city?: string; town?: string; village?: string };
        }>;
        if (lastQueryRef.current !== q) return; // a newer query happened
        setSuggestions(
          data.map((r) => ({
            display_name: r.display_name,
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
            road: r.address?.road,
            postcode: r.address?.postcode,
            city: r.address?.city || r.address?.town || r.address?.village,
          })),
        );
      } catch (err) {
        console.warn('[AddressAutocomplete] fetch failed', err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, viewbox]);

  const pick = (s: AddressSuggestion) => {
    onSelect(s);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <View>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={(t) => {
            onChange(t);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="sentences"
          style={styles.input}
        />
        {loading ? (
          <View style={styles.spinner}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        ) : null}
      </View>

      {open && suggestions.length > 0 ? (
        <View style={styles.dropdown}>
          {suggestions.map((s, i) => (
            <Pressable
              key={`${s.lat}-${s.lon}-${i}`}
              onPress={() => pick(s)}
              style={({ pressed }) => [
                styles.row,
                i < suggestions.length - 1 && styles.rowBorder,
                pressed && { backgroundColor: colors.surface },
              ]}
            >
              <Text style={styles.pin}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.primary} numberOfLines={1}>
                  {s.road || s.display_name.split(',')[0]}
                </Text>
                <Text style={styles.secondary} numberOfLines={1}>
                  {[s.postcode, s.city].filter(Boolean).join(' ') || s.display_name}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  inputWrap: { position: 'relative' },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: 36,
  },
  spinner: {
    position: 'absolute',
    right: spacing.sm,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  dropdown: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pin: { fontSize: 16 },
  primary: { ...typography.body, color: colors.text, fontWeight: '600' },
  secondary: { ...typography.small, color: colors.textMuted, marginTop: 2 },
});
