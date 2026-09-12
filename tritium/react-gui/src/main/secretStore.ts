/**
 * @file main/secretStore.ts
 * @description Credentials, kept out of the preferences file.
 *
 * A value handed here is encrypted with Electron's `safeStorage` (the OS
 * keychain on macOS, DPAPI on Windows, the desktop keyring on Linux) and only
 * the ciphertext is written to electron-store. Nothing else in the app
 * persists a credential, and the plaintext is never logged: the renderer asks
 * for it at the moment it makes the call and keeps it no longer.
 *
 * When the OS cannot encrypt -- a Linux session with no keyring, mostly --
 * storing is REFUSED rather than falling back to plaintext, and the caller is
 * told to use the environment variable instead.
 *
 * Entries are addressed by namespace and key so the file can hold several
 * owners' credentials without one being able to name another's.
 */

import { safeStorage } from 'electron';
import type {
  SecretGetRes, SecretRef, SecretSetReq, SecretSetRes, SecretStatusRes,
} from '@shared/types/secrets';
import { loadSecretEnc, saveSecretEnc } from './stateStore';

/** The store key an entry lives under. */
export function secretId(ref: Pick<SecretRef, 'namespace' | 'key'>): string {
  return `${ref.namespace}.${ref.key}`;
}

/**
 * Which of the two possible sources answers.
 *
 * Pure, so the precedence is testable without a keychain: what is stored on
 * this installation wins over the environment, because the user typing a key
 * into Settings is the more specific statement of intent. An empty string
 * counts as absent on both sides.
 */
export function resolveSecret(sources: { stored: string | null; env: string | null }): SecretGetRes {
  if (sources.stored) return { value: sources.stored, source: 'stored' };
  if (sources.env) return { value: sources.env, source: 'env' };
  return { value: null, source: 'none' };
}

/** The environment value `ref` names, or null when it names none or it is empty. */
function envValue(ref: SecretRef): string | null {
  if (!ref.envVar) return null;
  return process.env[ref.envVar] || null;
}

/** Ciphertext for `plain`, or null when this OS cannot encrypt. */
export function encryptSecret(plain: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(plain).toString('base64');
}

/**
 * Plaintext for `b64`, or null when it cannot be read back.
 *
 * A stored entry becomes undecryptable after an OS keychain reset or a copy
 * to another machine. That is not an error to report: the entry simply stops
 * answering, and the caller falls through to the environment.
 */
export function decryptSecret(b64: string): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(b64, 'base64'));
  } catch {
    return null;
  }
}

/** The value for `ref`: what is stored, else the environment, else nothing. */
export function getSecret(ref: SecretRef): SecretGetRes {
  const enc = loadSecretEnc(secretId(ref));
  const stored = enc ? decryptSecret(enc) : null;
  return resolveSecret({ stored, env: envValue(ref) });
}

/**
 * Store `req.value`, or clear the entry when it is empty.
 *
 * @returns `ok: false` with a message the caller may show when this OS cannot
 *   encrypt. The value is never echoed back in it.
 */
export function setSecret(req: SecretSetReq): SecretSetRes {
  const id = secretId(req);
  if (req.value === '') {
    saveSecretEnc(id, null);
    return { ok: true };
  }
  const enc = encryptSecret(req.value);
  if (enc === null) {
    return {
      ok: false,
      error: req.envVar
        ? `Encryption is not available on this system. Set the ${req.envVar} environment variable instead.`
        : 'Encryption is not available on this system, so the value cannot be stored.',
    };
  }
  saveSecretEnc(id, enc);
  return { ok: true };
}

/** What a settings row may show about `ref` without revealing the value. */
export function secretStatus(ref: SecretRef): SecretStatusRes {
  const resolved = getSecret(ref);
  return {
    source: resolved.source,
    last4: resolved.value ? resolved.value.slice(-4) : null,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  };
}
