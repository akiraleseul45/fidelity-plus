import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Restaurant } from '../types';
import { colors, radius, spacing, typography } from '../theme/theme';

type Props = {
  restaurants: Restaurant[];
  onPressMarker?: (id: string) => void;
  height?: number;
};

const ORLEANS: [number, number] = [47.9027, 1.909];
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(
      `script[src="${LEAFLET_JS}"]`,
    ) as HTMLScriptElement | null;
    if (existing && (existing as any)._loaded && w.L) {
      resolve(w.L);
      return;
    }
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = LEAFLET_JS;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => {
      (script as any)._loaded = true;
      if (w.L) resolve(w.L);
      else reject(new Error('Leaflet did not expose window.L'));
    });
    script.addEventListener('error', () => reject(new Error('Leaflet failed to load')));
  });
  return leafletPromise;
}

export const PartnerMap: React.FC<Props> = ({ restaurants, onPressMarker, height = 240 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Initialise the map once the container is mounted.
  useEffect(() => {
    let disposed = false;

    loadLeaflet()
      .then((L) => {
        if (disposed) return;
        const el = containerRef.current;
        if (!el) {
          // Container not yet rendered. Retry next tick.
          requestAnimationFrame(() => setStatus((s) => (s === 'loading' ? 'loading' : s)));
          return;
        }
        if (!mapRef.current) {
          mapRef.current = L.map(el, {
            center: ORLEANS,
            zoom: 13,
            scrollWheelZoom: false,
            zoomControl: true,
          });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19,
          }).addTo(mapRef.current);
        }
        setStatus('ready');
      })
      .catch((err) => {
        console.warn('[PartnerMap] leaflet load failed:', err);
        if (!disposed) setStatus('error');
      });

    return () => {
      disposed = true;
    };
  }, []);

  // Refresh markers whenever the restaurant list changes (and map is ready).
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return;
    const w = window as any;
    const L = w.L;
    if (!L) return;

    markersRef.current.forEach((m) => mapRef.current.removeLayer(m));
    markersRef.current = [];

    if (restaurants.length === 0) return;

    const pinIcon = L.divIcon({
      className: 'fp-pin',
      html: `
        <div style="position:relative;width:30px;height:42px;transform:translate(-50%,-100%);">
          <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="fp-shadow" x="-20%" y="-10%" width="140%" height="130%">
                <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="rgba(0,0,0,0.4)"/>
              </filter>
            </defs>
            <path d="M15 0C6.7 0 0 6.7 0 15c0 11.25 15 27 15 27s15-15.75 15-27C30 6.7 23.3 0 15 0z"
                  fill="#EA4335" stroke="#B31412" stroke-width="1" filter="url(#fp-shadow)"/>
            <circle cx="15" cy="15" r="5" fill="#FFFFFF"/>
          </svg>
        </div>`,
      iconSize: [30, 42],
      iconAnchor: [15, 42],
      popupAnchor: [0, -38],
    });

    restaurants.forEach((r) => {
      if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return;
      const ownerLine = r.ownerName
        ? `<br/><span style="font-size:12px;color:#0B1220;font-weight:600">${escapeHtml(
            r.ownerName,
          )}</span>`
        : '';
      const phoneLine =
        r.phoneMobile || r.phoneFixed
          ? `<br/><span style="font-size:12px;color:#5B6472">${
              r.phoneMobile
                ? `📱 ${escapeHtml(r.phoneMobile)}`
                : `☎️ ${escapeHtml(r.phoneFixed!)}`
            }</span>`
          : '';
      const marker = L.marker([r.lat, r.lng], { icon: pinIcon })
        .addTo(mapRef.current)
        .bindPopup(
          `<div style="font-family:-apple-system,sans-serif;min-width:180px"><strong style="font-size:14px;color:#0B1220">${escapeHtml(
            r.name,
          )}</strong>${ownerLine}${
            r.address
              ? `<br/><span style="font-size:12px;color:#5B6472">${escapeHtml(r.address)}</span>`
              : ''
          }${phoneLine}</div>`,
        );
      if (onPressMarker) marker.on('click', () => onPressMarker(r.id));
      markersRef.current.push(marker);
    });

    if (markersRef.current.length > 0) {
      try {
        const group = L.featureGroup(markersRef.current);
        mapRef.current.fitBounds(group.getBounds().pad(0.3), { maxZoom: 15 });
      } catch (err) {
        console.warn('[PartnerMap] fitBounds failed:', err);
      }
    }
  }, [restaurants, onPressMarker, status]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <View style={[styles.wrap, { height }]}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', borderRadius: radius.md }}
      />
      {status === 'loading' ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.overlayText}>Chargement de la carte…</Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayText}>Carte indisponible</Text>
          <Text style={styles.overlaySub}>
            {restaurants.length} partenaire{restaurants.length > 1 ? 's' : ''} référencé
            {restaurants.length > 1 ? 's' : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  overlayText: { ...typography.body, color: colors.textMuted },
  overlaySub: { ...typography.small, color: colors.textMuted },
});
