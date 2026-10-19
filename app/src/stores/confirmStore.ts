import { create } from 'zustand';

/**
 * Global, imperative confirmation dialog.
 *
 * Replaces window.confirm (which is silently suppressed in PWAs, in-app
 * webviews and some mobile browsers, breaking logout / delete actions).
 * Works identically on web and native.
 *
 *   const okay = await confirm({ title: 'Se déconnecter ?', message: '…' });
 */

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmState = {
  open: boolean;
  options: ConfirmOptions;
  _resolve: ((v: boolean) => void) | null;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  answer: (value: boolean) => void;
};

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: { title: '' },
  _resolve: null,

  confirm(options) {
    // If a dialog is already open, resolve it as cancelled first.
    const prev = get()._resolve;
    if (prev) prev(false);
    return new Promise<boolean>((resolve) => {
      set({ open: true, options, _resolve: resolve });
    });
  },

  answer(value) {
    const resolve = get()._resolve;
    set({ open: false, _resolve: null });
    if (resolve) resolve(value);
  },
}));

// Convenience imperative helper usable outside React components.
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().confirm(options);
}
