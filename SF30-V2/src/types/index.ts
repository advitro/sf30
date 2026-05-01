/**
 * Global Type Definitions — Shared types used across all extension contexts.
 */

// ── Message Payload Types ──

export interface VerifyLicensePayload {
  readonly key: string;
}

export interface SetEnabledPayload {
  readonly value: boolean;
}

export interface SetPausedPayload {
  readonly value: boolean;
}

export interface SetOverridePayload {
  readonly value: boolean;
}

export interface SetSettingsPayload {
  readonly turbo?: boolean;
  readonly hudHidden?: boolean;
  readonly dates?: string[];
  readonly blacklistDates?: string[];
}

export interface SetTelegramPayload {
  readonly botToken?: string;
  readonly chatId?: string;
  readonly optOut?: boolean;
}

export interface ClaimResultPayload {
  readonly oppId: string;
  readonly success: boolean;
  readonly shift?: {
    readonly start: string;
    readonly end: string;
    readonly duration: number;
    readonly site: string;
  };
  readonly error?: string;
  readonly attempt: number;
}

export interface EidFoundPayload {
  readonly eid: string;
}

export interface RateLimitedPayload {
  readonly limited: boolean;
  readonly retryAfter?: number;
}

// ── GraphQL Types ──

export interface GraphQLResponse<T = unknown> {
  readonly data?: T;
  readonly errors?: readonly GraphQLError[];
}

export interface GraphQLError {
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly extensions?: Record<string, unknown>;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

export interface ShiftOpportunity {
  readonly id: string;
  readonly type: string;
  readonly shift: {
    readonly id: string;
    readonly timeRange: {
      readonly start: string;
      readonly end: string;
    };
    readonly duration: {
      readonly value: number;
    };
    readonly site: {
      readonly name: string;
    };
  };
}

export interface PollShiftsData {
  readonly shiftOpportunities: {
    readonly opportunities: readonly ShiftOpportunity[];
  };
}

// ── License Server API Types ──

export interface LicenseActivationRequest {
  readonly key: string;
  readonly fingerprint: string;
  readonly fingerprintHash: string;
}

export interface LicenseActivationResponse {
  readonly ok: boolean;
  readonly tier?: 'basic' | 'pro';
  readonly exp?: number;
  readonly trial?: boolean;
  readonly hoursLeft?: number;
  readonly error?: string;
}

export interface LicenseValidationRequest {
  readonly key: string;
  readonly fingerprintHash: string;
}

export interface LicenseValidationResponse {
  readonly ok: boolean;
  readonly tier?: 'basic' | 'pro';
  readonly exp?: number;
  readonly revoked?: boolean;
  readonly error?: string;
}

export interface TrialRequest {
  readonly fingerprintHash: string;
}

export interface TrialResponse {
  readonly ok: boolean;
  readonly hoursLeft?: number;
  readonly alreadyUsed?: boolean;
  readonly error?: string;
}

export interface RevocationListResponse {
  readonly revokedKeys: readonly string[];
  readonly lastUpdated: number;
  readonly etag: string;
}

// ── Telegram Types ──

export interface TelegramMessage {
  readonly userKey: string;
  readonly date: string;
  readonly time: string;
  readonly status: 'claimed' | 'error';
}

// ── Device Fingerprint Types ──

export interface FingerprintComponents {
  readonly userAgent: string;
  readonly screen: string;
  readonly language: string;
  readonly timezone: number;
  readonly hardwareConcurrency: number;
  readonly deviceMemory?: number;
  readonly platform: string;
  readonly canvas: string;
  readonly webgl?: string;
  readonly fonts?: string;
  readonly audio?: string;
}

// ── Build Metadata ──

export interface BuildMetadata {
  readonly version: string;
  readonly buildTime: string;
  readonly gitCommit?: string;
  readonly integrityHashes: Record<string, string>;
}
