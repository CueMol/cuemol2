/**
 * @file shared/types/secrets.ts
 * @description The renderer <-> main contract for a stored credential.
 *
 * A namespaced key-value store backed by Electron's `safeStorage`, so an API
 * key reaches the OS keychain instead of the preferences file. Generic on
 * purpose: main is told the namespace and key by the caller and never learns
 * what they mean, the same way it is told a plugin's menu rows without seeing
 * the registry that produced them.
 *
 * The namespace is the owning plugin's id, filled in by the plugin host
 * rather than written by the plugin, so one plugin cannot address another's
 * entry.
 *
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

/** Where a resolved value came from. */
export type SecretSource =
  /** Decrypted from this installation's store. */
  | 'stored'
  /** Read from the environment variable the caller named. */
  | 'env'
  /** Nothing is set. */
  | 'none'

/** Addresses one entry. */
export interface SecretRef {
  /** Owning namespace; the plugin id for a plugin-contributed secret. */
  namespace: string
  /** Key within the namespace. */
  key: string
  /**
   * Environment variable to fall back to when nothing is stored. Omitted
   * means no fallback: the entry then resolves to `none`.
   */
  envVar?: string
}

/** Store a value, or clear the entry when `value` is empty. */
export interface SecretSetReq extends SecretRef {
  value: string
}

/** The value itself. Never logged, never persisted outside the store. */
export interface SecretGetRes {
  value: string | null
  source: SecretSource
}

/** Whether the write landed. `error` is safe to show; it never quotes the value. */
export interface SecretSetRes {
  ok: boolean
  error?: string
}

/** Enough to describe the entry in a settings row without revealing it. */
export interface SecretStatusRes {
  source: SecretSource
  /** Last four characters, for recognising which key is stored. Null when unset. */
  last4: string | null
  /**
   * Whether this OS can encrypt at all. False means storing is refused and
   * the environment variable is the only way to supply a value.
   */
  encryptionAvailable: boolean
}
