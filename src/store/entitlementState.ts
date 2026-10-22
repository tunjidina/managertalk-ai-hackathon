import { create } from 'zustand';
import { Purchases } from '@revenuecat/purchases-js';

import { purchasesConfigured } from '../lib/purchases';

/** Must match the entitlement identifier in the RevenueCat dashboard. */
export const PREMIUM_ENTITLEMENT_ID = 'premium_access';

export interface EntitlementState {
  hasPremium: boolean;
  loadingEntitlements: boolean;

  /**
   * Reads the current customer info and derives hasPremium from it.
   * Never throws: on any failure the user is treated as not entitled,
   * which fails closed rather than handing out premium on a network blip.
   */
  checkEntitlements: () => Promise<void>;

  /** Set directly after a successful purchase, to avoid a second fetch. */
  setHasPremium: (value: boolean) => void;
}

export const useEntitlementState = create<EntitlementState>((set) => ({
  // Starts false, not loading: before configurePurchases() there is
  // nothing in flight, and a spinner with no request behind it never ends.
  hasPremium: false,
  loadingEntitlements: false,

  checkEntitlements: async () => {
    if (!purchasesConfigured()) {
      return;
    }

    set({ loadingEntitlements: true });

    try {
      // The web SDK returns CustomerInfo directly, unlike the Capacitor
      // plugin's { customerInfo } envelope.
      const customerInfo = await Purchases.getSharedInstance().getCustomerInfo();
      set({
        hasPremium:
          customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined,
        loadingEntitlements: false
      });
    } catch (err) {
      console.warn('RevenueCat getCustomerInfo failed', err);
      set({ hasPremium: false, loadingEntitlements: false });
    }
  },

  setHasPremium: (value) => set({ hasPremium: value })
}));
