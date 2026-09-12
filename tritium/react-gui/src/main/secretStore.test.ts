/**
 * @file main/secretStore.test.ts
 * @description Where a credential comes from, and what happens when the OS
 * cannot keep one.
 *
 * Two rules that are invisible in use and expensive to get wrong: a key typed
 * into Settings has to beat one left in the environment (otherwise clearing
 * it appears to do nothing), and a system that cannot encrypt has to refuse
 * the write rather than quietly fall back to plaintext on disk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const isEncryptionAvailable = vi.fn(() => true)
const encryptString = vi.fn((s: string) => Buffer.from(`enc:${s}`))
const decryptString = vi.fn((b: Buffer) => b.toString().replace(/^enc:/, ''))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => isEncryptionAvailable(),
    encryptString: (s: string) => encryptString(s),
    decryptString: (b: Buffer) => decryptString(b),
  },
}))

const store = new Map<string, string>()
vi.mock('./stateStore', () => ({
  loadSecretEnc: (id: string) => store.get(id),
  saveSecretEnc: (id: string, enc: string | null) => {
    if (enc === null) store.delete(id)
    else store.set(id, enc)
  },
}))

import { getSecret, resolveSecret, setSecret } from './secretStore'

const REF = { namespace: 'demo', key: 'apiKey', envVar: 'DEMO_KEY' }

describe('resolving a credential', () => {
  it.each([
    ['prefers what this installation stored', 'stored-key', 'env-key', 'stored-key', 'stored'],
    ['falls back to the environment', null, 'env-key', 'env-key', 'env'],
    ['reports nothing when neither is set', null, null, null, 'none'],
    ['treats an empty stored value as unset', '', 'env-key', 'env-key', 'env'],
  ])('%s', (_label, stored, env, value, source) => {
    expect(resolveSecret({ stored, env })).toEqual({ value, source })
  })
})

describe('storing a credential', () => {
  beforeEach(() => {
    store.clear()
    isEncryptionAvailable.mockReturnValue(true)
    delete process.env.DEMO_KEY
  })

  it('round-trips through the store, and an empty value clears it', () => {
    expect(setSecret({ ...REF, value: 'sk-123' }).ok).toBe(true)
    expect(getSecret(REF)).toEqual({ value: 'sk-123', source: 'stored' })

    expect(setSecret({ ...REF, value: '' }).ok).toBe(true)
    expect(getSecret(REF)).toEqual({ value: null, source: 'none' })
  })

  it('refuses to store when the system cannot encrypt, naming the way out', () => {
    isEncryptionAvailable.mockReturnValue(false)
    const result = setSecret({ ...REF, value: 'sk-123' })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('DEMO_KEY')
    // Nothing written: a plaintext fallback is what this refusal avoids.
    expect(store.size).toBe(0)
  })
})
