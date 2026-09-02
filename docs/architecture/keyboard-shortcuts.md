# メニューショートカットの所有者を OS ごとに 1 つにする (tritium)

- Status: accepted
- Date: 2026-09-02
- Related: [focus-aware Edit shortcuts](focus-aware-edit-shortcuts.md) (キーが届いた後の振り分け)、
  [`menu.cuemol2.edit`](../migration/mapping/menus.md#menucuemol2edit)

UXP からの移植判断ではない (UXP にキーボード copy&paste は無い) ため `docs/migration/adr/`
ではなくここに置く。

## Context

Windows で scene tree のノードを選んで Ctrl+C / Ctrl+V を押しても何も起きない。macOS では
Cmd+C / Cmd+V が動く。

Edit メニューの Cut / Copy / Paste / Select All は `shared/menuTemplate.ts` で Electron `role`
ではなく **custom `ipcChannel` 項目 + `accelerator: 'CmdOrCtrl+X/C/V/A'`** として宣言されており
([focus-aware Edit shortcuts](focus-aware-edit-shortcuts.md))、キーの経路は

```
native menu accelerator -> main/menu.ts click handler -> MENU_GENERIC push
  -> renderer useElectronIpc -> dispatchMenuChannel -> CmdId.Edit*
  -> utils/editClipboard.ts (focus で振り分け) -> scene tree / paint deck / native edit
```

だった。つまり**入口は native menu の accelerator だけ**で、renderer に Ctrl+C/V を拾う keydown
ハンドラは無かった。この前提は macOS でしか成立しない:

- **macOS**: NSMenu の key equivalent が web content より先にキーを取る。accelerator は必ず fire。
- **Windows / Linux**: キーは**まず renderer (Blink) に渡り、renderer が「未処理」で返したものだけ**
  が browser process のメニュー accelerator に届く。Blink は Ctrl+X/C/V/A を editing command
  (Cut/Copy/Paste/SelectAll) として扱い、**編集不可要素にフォーカスがあってもコマンドを実行して
  "handled" を返す** (`copy` / `paste` DOM イベントを dispatch する必要があるため。Web アプリが
  `document.addEventListener('paste')` で画像を受け取れるのはこの挙動のおかげ)。結果 accelerator は
  一度も fire しない。

副次的に、Windows/Linux では native menu bar 自体が非表示 (`windowChrome.ts` の `titleBarStyle:
'hidden'` + `autoHideMenuBar`) で、ユーザーが見ている React `MenuBar` はマウス専用だった。
「見えないが accelerator を持つメニュー」と「見えるがキーを持たないメニュー」が並存し、
どちらもキーを届けられない状態だった。

なお `role` 項目だった頃も Windows で accelerator は fire していなかったはずだが、Blink 自身が
テキスト欄へ native paste するため問題が見えなかった。scene tree へのルーティングは新規機能なので、
Windows では最初から動いていなかった。

## Decision

**ショートカットの所有者を OS ごとに 1 つに決め、両者を renderer の `dispatchMenuChannel` に
合流させる** (VS Code と同じ構成: 入口だけ OS で違い、コマンド解決は共通)。

| OS | キーの所有者 | 入口 |
|----|-------------|------|
| macOS | native menu (key equivalent) — 従来どおり | `main/menu.ts` click handler -> `MENU_GENERIC` |
| Windows / Linux | **renderer の keybinding dispatcher** (`renderer/shell/keybindings/useMenuKeyBindings.ts`) | `window` の keydown (capture) |

1. **Windows / Linux では native menu に accelerator を登録しない** (`main/menu.ts` の `buildItem`
   が `accelerator` を mac のみ設定)。所有者が 1 つになり、二重発火や「Blink が飲むキーだけ届かない」
   非対称が消える。表示は React `MenuBar` が template の文字列を `formatAccelerator` で描くので影響なし。
   `role` 項目 (Quit / DevTools / Zoom / Fullscreen / Reload) は Electron 既定の accelerator を持ち
   Blink に飲まれないので native のまま。
2. **renderer dispatcher は `ipcChannel && accelerator` を持つ全項目を所有**する (New Tab / Open /
   Open Scene / Reload Scene / Save / Save As / Close Tab / Undo / Redo / Cut / Copy / Paste /
   Select All / Options)。accelerator 文字列は `APP_MENU` が単一ソースで、`shared/menuAccel.ts` の
   `parseAccelerator` / `acceleratorMatchesKey` が `KeyboardEvent` と突き合わせる。修飾キー 4 つは
   完全一致 (Ctrl+Shift+V は Ctrl+V に一致しない)。
3. **有効 / 無効は React MenuBar と同じ判定を再利用**する。`resolveAppMenuNodes()` を同じ live state
   (`shell/menu/useMenuBarState.ts`) で通し、`MenuNode.enabled` が false ならキーを無視する
   (native の disabled 項目が accelerator を fire しないのと同じ)。MenuBar もこの hook を使うので、
   ショートカットとメニュー行の enabled が食い違わない。
4. **modal 中は `TEXT_EDIT_MENU_IDS` だけ通す**。`main/menuBlock.ts` が macOS で行っている
   「ダイアログ表示中はメニューを無効化、ただしテキスト編集 6 項目は残す」と同じ規則。集合は
   `shared/menuTemplate.ts` に移し、main と renderer が同じものを読む。modal 状態は
   `ModalOpenCounterProvider` -> `editClipboard.ts` (`isEditModalOpen`) 経由。
5. **テキスト編集 6 項目は editable にフォーカスがあっても dispatcher が拾う**。`preventDefault` して
   Blink の native paste を止め、`editClipboard.ts` が `isEditableFocused()` -> `IPC.TEXT_CTX_ACTION`
   -> `webContents.paste()` で native 実行する。macOS がメニュー経由で今も通っている経路と同一で、
   OS 間で「テキスト欄の Ctrl+V」の実装が 1 本になる。
6. `e.isComposing` (IME 変換中) は無視。`e.repeat` は native accelerator と同様に通す。

## 採らなかった案

- **main の `before-input-event` で横取り**: Electron 公式の手段で macOS の「メニューが先取り」を
  Windows に再現できるが、renderer 側 keydown のほうがアプリ的 UI では一般的 (VS Code 等) であり、
  有効/無効・modal の判定材料が renderer にある (`resolveAppMenuNodes` / `ModalOpenCounterProvider`)
  ため renderer 側を選んだ。
- **全 OS で renderer が所有** (macOS の項目に `registerAccelerator: false`): 統一度は最高だが、
  AppKit ではメニューの key equivalent 無しに Cmd+C/V がテキスト欄で動かないため、Rendering window
  のテキスト欄用に別ハンドラが要り、DevTools 内の Cmd+C/V も効かなくなる。macOS はメニュー所有の
  ままとした。
- **テキスト編集 6 項目だけ renderer で拾う**: 変更は最小だが、Windows で「一部は隠しメニュー、
  一部は renderer」の二重所有が残る。

## Consequences

- Windows / Linux で scene tree / paint deck の Ctrl+X / C / V、log パネルの選択コピー、
  Ctrl+A の scope 選択が動く。Ctrl+O / T / S / Shift+S / Shift+O / R / W / K は従来と同じ動作を
  renderer 経由で行う。
- macOS は無変更 (dispatcher は登録されず、native menu が accelerator を持ったまま)。
- Windows の隠し native menu は accelerator を持たなくなったので、`main/menu.ts` の focusRouted
  handler (Rendering window / DevTools へのフォーカス時に native edit へ落とす) は macOS 専用の経路
  になった。Windows の Rendering window / DevTools のテキスト欄は Blink native がそのまま処理する
  (従来も Blink が消費していたので挙動は変わらない)。
- View > Reload (`role: 'reload'`, Electron 既定 Ctrl+R) と File > Reload Scene (Ctrl+R) は
  以前から同じキーを持っていた。Windows では renderer が Reload Scene を `preventDefault` で取るため
  Reload Scene が確定して勝つ (従来は native menu 内でどちらが勝つか不定)。
- 新しいメニュー項目に accelerator を付けるときは template に書くだけでよく、Windows/Linux では
  自動的に dispatcher が拾う。`role` 無しで Blink が消費するキー (例: Ctrl+Insert) を使いたい場合も
  同じ経路で動く。

## Notes

- 実装: `shared/menuAccel.ts` (parse / match)、`shared/menuTemplate.ts` (`TEXT_EDIT_MENU_IDS`)、
  `main/menu.ts` (accelerator を mac のみ)、`main/menuBlock.ts` (集合を re-export)、
  `renderer/shell/keybindings/useMenuKeyBindings.ts` (新規)、`renderer/shell/menu/useMenuBarState.ts`
  (新規、MenuBar から抽出)、`renderer/shell/AppBoot.tsx` (mount)、`renderer/utils/editClipboard.ts`
  (`isEditModalOpen`)。
- Electron の一般的な選択肢は 3 つ: メニュー accelerator (基本だが Windows/Linux では renderer が
  処理したキーに届かない)、renderer 側 keydown (アプリ的 UI の主流)、main の `before-input-event`
  (`electron-localshortcut` の実装でもある)。本判断は 1 と 2 を OS で使い分ける形。
