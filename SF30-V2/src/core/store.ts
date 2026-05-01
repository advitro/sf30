/**
 * Centralized State Store — Redux-like immutable store backed by chrome.storage.
 *
 * Design principles:
 * 1. Single source of truth for all extension state
 * 2. All state changes go through dispatch()
 * 3. Reactive subscriptions notify all listeners of changes
 * 4. Automatic persistence to chrome.storage.local
 * 5. Cross-context sync via chrome.storage.onChanged
 */

// ── State Interfaces ──

export interface LicenseState {
  readonly key: string | null;
  readonly tier: 'basic' | 'pro' | null;
  readonly exp: number; // unix timestamp in seconds
  readonly trial: boolean;
  readonly valid: boolean;
  readonly lastVerified: number;
  readonly revoked: boolean;
  readonly hoursLeft?: number; // only present during trial
}

export interface DeviceState {
  readonly fingerprint: string | null;
  readonly fingerprintHash: string | null;
}

export interface SettingsState {
  readonly turbo: boolean;
  readonly hudHidden: boolean;
  readonly dates: readonly string[];
  readonly blacklistDates: readonly string[];
}

export interface TelegramState {
  readonly botToken: string | null;
  readonly chatId: string | null;
  readonly optOut: boolean;
}

export interface RuntimeState {
  readonly nextDue: number | null;
  readonly burstRemaining: number;
  readonly rateLimited: boolean;
  readonly pollCount: number;
  readonly consecutiveErrors: number;
}

export interface AppState {
  readonly enabled: boolean;
  readonly paused: boolean;
  readonly override: boolean;
  readonly license: LicenseState;
  readonly device: DeviceState;
  readonly settings: SettingsState;
  readonly telegram: TelegramState;
  readonly runtime: RuntimeState;
}

// ── Actions ──

export type Action =
  | { readonly type: 'SET_ENABLED'; readonly payload: boolean }
  | { readonly type: 'SET_PAUSED'; readonly payload: boolean }
  | { readonly type: 'SET_OVERRIDE'; readonly payload: boolean }
  | { readonly type: 'SET_LICENSE'; readonly payload: Partial<LicenseState> }
  | { readonly type: 'SET_DEVICE'; readonly payload: Partial<DeviceState> }
  | { readonly type: 'SET_SETTINGS'; readonly payload: Partial<SettingsState> }
  | { readonly type: 'SET_TELEGRAM'; readonly payload: Partial<TelegramState> }
  | { readonly type: 'SET_RUNTIME'; readonly payload: Partial<RuntimeState> }
  | { readonly type: 'RESET_STATE' };

// ── Listener ──

export type Listener = (state: AppState, prevState: AppState) => void;

// ── Storage Key ──

const STORAGE_KEY = 'sg_v2_state';

// ── Default State Factory ──

function createDefaultState(): AppState {
  return {
    enabled: false,
    paused: false,
    override: false,
    license: {
      key: null,
      tier: null,
      exp: 0,
      trial: false,
      valid: false,
      lastVerified: 0,
      revoked: false,
    },
    device: {
      fingerprint: null,
      fingerprintHash: null,
    },
    settings: {
      turbo: false,
      hudHidden: false,
      dates: [],
      blacklistDates: [],
    },
    telegram: {
      botToken: null,
      chatId: null,
      optOut: false,
    },
    runtime: {
      nextDue: null,
      burstRemaining: 0,
      rateLimited: false,
      pollCount: 0,
      consecutiveErrors: 0,
    },
  };
}

// ── Reducer ──

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_ENABLED':
      return { ...state, enabled: action.payload };
    case 'SET_PAUSED':
      return { ...state, paused: action.payload };
    case 'SET_OVERRIDE':
      return { ...state, override: action.payload };
    case 'SET_LICENSE':
      return { ...state, license: { ...state.license, ...action.payload } };
    case 'SET_DEVICE':
      return { ...state, device: { ...state.device, ...action.payload } };
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_TELEGRAM':
      return { ...state, telegram: { ...state.telegram, ...action.payload } };
    case 'SET_RUNTIME':
      return { ...state, runtime: { ...state.runtime, ...action.payload } };
    case 'RESET_STATE':
      return createDefaultState();
    default:
      // Exhaustiveness check — TypeScript ensures we handle all action types
      return state;
  }
}

// ── Store Class ──

export class Store {
  private state: AppState;
  private readonly listeners = new Set<Listener>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private isLoading = false;

  constructor(initialState?: Partial<AppState>) {
    this.state = createDefaultState();
    if (initialState) {
      this.state = this.mergePartial(this.state, initialState);
    }
  }

  // ── Public API ──

  /** Returns the current state (read-only). */
  getState(): Readonly<AppState> {
    return this.state;
  }

  /** Dispatches an action to update state. Notifies listeners if state changed. */
  dispatch(action: Action): void {
    const prevState = this.state;
    const nextState = reducer(prevState, action);

    // Only notify if state actually changed (shallow comparison of top-level keys)
    if (!this.shallowEqual(prevState, nextState)) {
      this.state = nextState;
      this.notify(prevState);
      this.debouncedPersist();
    }
  }

  /** Subscribes to state changes. Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Loads state from chrome.storage.local. */
  async load(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }
    if (this.isLoading) {return;}
    this.isLoading = true;

    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY] as Partial<AppState> | undefined;
      if (stored) {
        this.state = this.mergePartial(this.state, stored);
      }
    } catch (e) {
      console.error('[Store] Failed to load state:', e);
    } finally {
      this.isLoading = false;
    }
  }

  /** Persists current state to chrome.storage.local immediately. */
  async persist(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.state });
    } catch (e) {
      console.error('[Store] Failed to persist state:', e);
    }
  }

  /** Syncs from external storage change (called by chrome.storage.onChanged listener). */
  syncFromStorage(storedState: Partial<AppState>): void {
    const prevState = this.state;
    this.state = this.mergePartial(this.state, storedState);
    if (!this.shallowEqual(prevState, this.state)) {
      this.notify(prevState);
    }
  }

  // ── Private helpers ──

  private notify(prevState: AppState): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state, prevState);
      } catch (e) {
        console.error('[Store] Listener error:', e);
      }
    }
  }

  /** Debounced persist to avoid excessive storage writes. */
  private debouncedPersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      void this.persist();
      this.persistTimer = null;
    }, 500);
  }

  /** Shallow equality check for top-level AppState keys. */
  private shallowEqual(a: AppState, b: AppState): boolean {
    if (a === b) {return true;}
    const keys = Object.keys(a) as (keyof AppState)[];
    for (const key of keys) {
      const aVal = a[key];
      const bVal = b[key];
      if (typeof aVal === 'object' && aVal !== null && typeof bVal === 'object' && bVal !== null) {
        const nestedKeys = Object.keys(aVal);
        for (const nKey of nestedKeys) {
          if ((aVal as unknown as Record<string, unknown>)[nKey] !== (bVal as unknown as Record<string, unknown>)[nKey]) {
            return false;
          }
        }
      } else if (aVal !== bVal) {
        return false;
      }
    }
    return true;
  }

  /** Safely merges a partial state into the full state. */
  private mergePartial(state: AppState, partial: Partial<AppState>): AppState {
    return {
      ...state,
      ...partial,
      license: partial.license ? { ...state.license, ...partial.license } : state.license,
      device: partial.device ? { ...state.device, ...partial.device } : state.device,
      settings: partial.settings ? { ...state.settings, ...partial.settings } : state.settings,
      telegram: partial.telegram ? { ...state.telegram, ...partial.telegram } : state.telegram,
      runtime: partial.runtime ? { ...state.runtime, ...partial.runtime } : state.runtime,
    };
  }
}

// ── Singleton Export ──

let globalStore: Store | null = null;

/** Gets or creates the global store instance. */
export function getStore(): Store {
  if (!globalStore) {
    globalStore = new Store();
  }
  return globalStore;
}

/** Resets the global store (useful for testing). */
export function resetStore(): void {
  globalStore = null;
}
