/**
 * @file h3-kit/form/imeGuard.ts
 * @description Telling an IME's Enter apart from the user's Enter.
 *
 * While an input method is composing -- Japanese kana being converted to
 * kanji, pinyin to hanzi, a Korean syllable being assembled -- Enter means
 * "accept this candidate" and belongs to the IME. A field that treats it as
 * submit sends a half-typed message every time the user converts a word,
 * which makes the field unusable in those languages.
 *
 * Two signals, because one is not enough everywhere:
 *
 *   - `isComposing`, the modern flag. Chromium sets it on the keydown that
 *     confirms a candidate.
 *   - `keyCode === 229`, the sentinel browsers have always reported for a key
 *     the IME swallowed. Kept because it costs nothing and covers hosts that
 *     leave `isComposing` unset.
 *
 * `shell/keybindings/useMenuKeyBindings.ts` makes the same check for
 * accelerators; this is the text-input side of it.
 */

/** Whether this keystroke belongs to an input method rather than the field. */
export function isImeKey(e: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return e.isComposing || e.keyCode === 229
}
