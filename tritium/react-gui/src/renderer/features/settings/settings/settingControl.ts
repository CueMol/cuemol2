/**
 * @file features/settings/settings/settingControl.ts
 * @description The widget kinds a settings row can be drawn as.
 *
 * Its own module rather than part of `settingsConfig.ts` because the plugin
 * host declares against it: a plugin contributes settings rows, and
 * `plugin-host/types.ts` needs this type without pulling in `settingsConfig`,
 * which imports app contexts and worker DTOs.
 *
 * `SettingRow` draws each kind; adding a kind means adding a case there.
 */

/** How one setting is edited. */
export type SettingControl =
  | { kind: 'select'; options: string[]; renderInOwnFont?: boolean }
  | { kind: 'number'; min: number; max: number; step: number; unit?: string }
  | { kind: 'toggle' }
  | { kind: 'color' }
  | { kind: 'path'; directory?: boolean }
  /** Free text. Persisted per keystroke, like the path rows. */
  | { kind: 'text'; placeholder?: string; mono?: boolean }
  /**
   * A credential. Never stored with the other settings: the value lives in
   * the OS keychain behind the secret IPC channels, addressed by
   * `namespace` + the row's key, and only its status is ever read back.
   *
   * `envVar` names an environment variable to fall back to when nothing is
   * stored -- how a developer or a CI run supplies the value without typing
   * it into the app.
   */
  | { kind: 'secret'; namespace: string; envVar?: string }

/**
 * What a plugin writes in `contributes.settings`.
 *
 * Same kinds, except that a `secret` names no namespace: the host fills that
 * in with the plugin id, so one plugin can never address another's secret.
 */
export type PluginSettingControl =
  | Exclude<SettingControl, { kind: 'secret' }>
  | { kind: 'secret'; envVar?: string }
