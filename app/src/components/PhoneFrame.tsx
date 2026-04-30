import React, { useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

type Props = { children: React.ReactNode };

const PHONE_WIDTH = 420;
const PHONE_HEIGHT = 880;
const FRAME_BREAKPOINT = 768; // below this, render full-bleed (real phone / narrow window)

/**
 * On desktop / wide viewports, wraps the app in a phone-shaped container so
 * the experience always feels mobile-first. On narrow viewports (real
 * phones, Chrome dev-tools mobile mode), renders children at full size.
 */
export const PhoneFrame: React.FC<Props> = ({ children }) => {
  const { width: vw, height: vh } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const showFrame = isWeb && vw >= FRAME_BREAKPOINT;

  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return;
    const bg = showFrame ? '#1F2937' : '#FFFFFF';
    document.body.style.background = bg;
    document.body.style.margin = '0';
    document.documentElement.style.background = bg;
    return () => {
      document.body.style.background = '';
      document.documentElement.style.background = '';
    };
  }, [isWeb, showFrame]);

  if (!showFrame) return <>{children}</>;

  // Cap height so the phone doesn't overflow tall windows.
  const frameHeight = Math.min(PHONE_HEIGHT, vh - 64);

  return (
    <View style={styles.outer}>
      <View
        style={[
          styles.frame,
          {
            width: PHONE_WIDTH,
            height: frameHeight,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    padding: 16,
  },
  frame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 8,
    borderColor: '#0B1220',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
  },
});
