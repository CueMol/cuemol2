# ADR-0054: Copy&Paste を OS クリップボードへ — CueMol2 相互運用とインスタンス間対応

- Status: accepted
- Date: 2026-08-23
- Mapping rows: [`panel.workspace.ctxmenu.object`](../mapping/panels.md#panelworkspacectxmenuobject), [`panel.workspace.ctxmenu.renderer`](../mapping/panels.md#panelworkspacectxmenurenderer), [`panel.workspace.ctxmenu.rendgroup`](../mapping/panels.md#panelworkspacectxmenurendgroup), [`panel.workspace.ctxmenu.camera`](../mapping/panels.md#panelworkspacectxmenucamera), [`panel.workspace.ctxmenu.style`](../mapping/panels.md#panelworkspacectxmenustyle), [`panel.workspace.ctxmenu.multi`](../mapping/panels.md#panelworkspacectxmenumulti), [`panel.coloring.deck.paint`](../mapping/panels.md#panelcoloringdeckpaint)
- Supersedes: [ADR-0003](ADR-0003-object-ctxmenu-phases.md) Phase 4a と [ADR-0053](ADR-0053-paint-deck-clipboard.md) の「clipboard スコープ = worker 内 singleton」判断

## Context

tritium の Copy&Paste は 2 つの worker-local singleton で完結していた
(`sceneClipboard.service.ts` の scene ノード、`coloring/paintClipboard.ts` の paint 行)。
これは worker 内で閉じている限り正しく動くが、次の 2 つを構造的に不可能にしていた。

1. **UXP 版 CueMol2 との copy&paste** — ユーザー要望。
2. **tritium 複数インスタンス間の copy&paste** — 現在は `main/index.ts:45` の
   `app.requestSingleInstanceLock()` で複数起動を禁止しているが、これを解除したときに
   備える必要がある。

worker キャッシュを残して OS クリップボードへミラーする hybrid 案は**採らなかった**。
別プロセスがコピーした瞬間にキャッシュが陳腐化し、まさにキャッシュが存在する理由である
ケースで stale な paste を起こすため。OS クリップボードを唯一の真実にし、worker サービスを
ステートレス化するのが両目的を同時に満たす唯一の形である。

### 調査で確定した事実

**macOS では CueMol2 のカスタム flavor が OS ペーストボードに出ていない。**
`uxp_gui/platform/widget/cocoa/nsClipboard.mm:636` — `PasteboardDictFromTransferable` は
text / RTF / HTML / 画像 / ファイル / `application/x-moz-custom-clipdata` しか NSPasteboard
へ書かず、それ以外は *"If it wasn't a type that we recognize as exportable we don't put it
on the system clipboard"* として捨てる。`HasDataMatchingFlavors` / `GetNativeClipboardData`
も同様に Gecko 内の `mTransferable` キャッシュだけを見る。`uxp_diff.patch` は `widget/` を
触っていないので stock UXP の挙動である。**つまり macOS の相互運用は CueMol2 側の変更なしには
原理的に不可能**で、しかも Gecko は任意のカスタム型を *読む* こともできないため、交換チャネルは
text 一択になる。

**Windows / Linux では出ている。** `widget/windows/nsClipboard.cpp:117` の
`RegisterClipboardFormatW(flavor)`、`widget/gtk/nsClipboard.cpp:193` の
`gdk_atom_intern(flavor)` — どちらも flavor 文字列そのものがネイティブ形式名で、
Chromium/Electron の `CustomPlatformType` と同じ規則。

**ペイロードのバイト形式**は `nsPrimitiveHelpers.cpp:128-153` の `ToNewUnicode` = 生 UTF-16LE
(Windows のみ末尾に 2 バイト NUL、長さ外)。中身の JS 文字列は 2 系統で異なる:

- **scenexml**: `XPCCueMol.cpp:368 ConvBAryToStr` が XML バイトを `nsACString` へ 1:1 コピーし、
  XPConnect の `T_CSTRING` 変換 (`js/xpconnect/src/XPCConvert.cpp:305-322`、コメントに
  *"c-strings (binary blobs) are deliberately not converted from UTF-8 to UTF-16"*) が
  **latin1 展開**する。XML の UTF-8 各バイトが 1 code unit で、読めるテキストではない。
- **`qscpaint`**: `JSON.stringify` の結果そのもの = 普通のテキスト。

**object のペイロードは整形式 XML ではない。** `LDOM2Stream.cpp:232-265` が XML の後ろに
`========== End of XML ==========` と xz+base64 データチャンクを追記する。バイト列として
無加工で運ぶ必要がある。schema には version 属性も DTD も無く `SceneXMLReader` に version
チェックも無い (両アプリは同一の `src/` = libcuemol2 をリンクしている)。

## Decision

worker の singleton 2 つを廃止し、**OS クリップボードを唯一の真実**にする。worker サービスは
「bytes を作る / bytes を食う」ステートレス関数になり、クリップボード I/O は main が持つ
(`main/cuemolClipboard.ts`)。renderer は bytes を中継するだけ。

```
copy:  worker(serialize -> Uint8Array) -> renderer -> main(encode + write)
paste: main(read + decode -> Uint8Array) -> renderer -> worker(deserialize + register)
```

XML は `copyToTypedArray` / `copyFromTypedArray` (N-API) でバイト列として worker 境界を
またぐ。C++ ByteArray の参照はこのスレッドの外では無意味なため。

### 交換フォーマット 2 種

**Format A — legacy native.** 形式名は UXP の flavor 文字列そのまま
(`application/x-cuemol2-scenexml-{rend,rend-array,obj,cam,style}` と
`application/x-cuemol2-json-paint`)、ペイロードは上記の UTF-16LE。**出荷済み CueMol2
(2.3.4.477) とバイト互換。**

**Format B — text envelope.** 3 行のプレーンテキスト:

```
CueMolClipboard/1
{"kind":"renderer","form":"rendArray","name":"grp1"}
<base64 of the raw payload bytes>
```

1 行目が magic、2 行目が meta JSON、**3 行目以降すべて**が base64 (全空白を除去してから
デコードするので折り返し・CRLF・末尾改行に耐える)。base64 にするのは object ペイロードが
非整形 XML + バイナリチャンクでテキスト経路の再エンコードに耐えないため。

### 書き分けと読み取り

Electron は 1 回の書き込みで 1 形式しか置けない (`clipboard.writeBuffer` は
`ScopedClipboardWriter` を使うのでクリップボードを置換する)。Gecko にはこの制約が無いので、
**更新後の CueMol2 は 1 つの transferable から A と B の両方**を書き、tritium 側は 1 つ選べばよい。

| | 書き込み | 読み取り |
|---|---|---|
| Windows / Linux | **A** | A を順に probe → 無ければ B |
| macOS | **B** | 同上 (分岐なし) |

読み取りに分岐が無いので、macOS ビルドでも A が現れれば読めるし、Windows ビルドでも
どこで作られた envelope でも読める。

### meta を最小にできた理由

paste 側は既に meta に依存しない構造だった: camera paste は
`camView.name || entry.sourceName`、style paste は `entry.sourceName || setView.name` と
**復元した XML 内の名前を優先**し、rendArray の group 名もペイロード内 (復元配列の要素 0)。
`sourceScopeId` は copy 側ゲート専用だった。したがって envelope の meta は
`{kind, form?, name?}` で足り、**meta を持たない legacy A と B の paste コードパスが完全に
共通**になる (`name` は表示ヒントのみ)。

## Consequences

- **Windows / Linux では CueMol2 を一切更新せずに相互運用が成立する。** macOS は
  CueMol2 側の text 併記 (別 PR) が入って初めて開通する。
- **単一インスタンスロックを外せば、インスタンス間 copy&paste は追加コードなしで動く。**
  同一インスタンス内のクロスシーン paste と完全に同じ経路を通るため。
- **挙動変更**: worker singleton は他アプリのコピー後も生き残っていたが、OS クリップボードでは
  当然上書きされる。他のアプリと同じ正しい挙動だが、ユーザーから見える変化である。
- **クリップボードの上書き**: コピー時にユーザーのテキストクリップボードが消える。
  CueMol2 も `clipboardService.setData` で全置換しているので既存挙動と同じ。
- **Paste ゲートの鮮度**: Electron にクリップボード変更イベントは無い。scene ctxmenu は
  開いた瞬間に PEEK するので常に新鮮。paint deck の Paste ボタンは mount 時と window
  `focus` 時に PEEK する (CueMol2 でコピーして戻ってくる導線をカバーする)。
- **paint Cut の失敗窓**: worker で削除してから clipboard へ書くので、書き込みが失敗すると
  行が消えて clipboard が空になる。**undo 1 回で復元できる**ためエラー表示のみで許容した
  (copy-first にしても逆向きの失敗窓ができるだけで優位性が無い)。
- **X11 の寿命**: clipboard manager の無い環境ではコピー元アプリの終了でクリップボードが
  消える。Linux 一般の挙動なので対処しない。
- **サイズ**: object コピーは xz+base64 のデータチャンクを内包するため数 MB になりうる。
  A の latin1→UTF-16 で一時的に 2 倍、B の base64 で 4/3 倍。上限は設けない。
- **schema skew**: 片方にしか存在しない renderer 型の paste は失敗する。reader に version
  チェックが無いため、これが両アプリのバージョン差による唯一の非互換要因。
- **未実証のリスク**: Chromium の `CustomPlatformType` が Gecko と同じ形式名を使うことは
  コード読解ベースの結論で、Windows/Linux 実機での突き合わせは未実施。ずれていた場合の
  フォールバックは「Win/Linux も B に寄せる」(書き分け表 1 箇所の変更、出荷済み CueMol2 との
  相互運用は断念して更新版のみ対応)。

## Notes

- 実装: `shared/cuemolClipboard.ts` (純粋 codec)、`main/cuemolClipboard.ts` (Electron I/O +
  3 チャネル)、`shared/ipcChannels.ts` / `ipcContract.ts` / `ipcTypes.ts` の契約、
  `WorkerService.ts` の `copyToTypedArray` / `copyFromTypedArray` forwarder、
  `sceneClipboard.service.ts` と `coloring/paintClipboard.ts` のステートレス化、
  `hooks/sceneTree/useSceneTreeNodeOps.ts` / `hooks/sceneContextMenu/buildSceneCtxPayload.ts` /
  `components/panes/ColorPane.tsx` の中継。
- paint 行の wire spelling は UXP の `sel` / `col` (`coloring-panel.js:1110-1113`)。内部 DTO は
  `selStr` / `colorValue` なので codec で詰め替える。
- UXP 参照: `uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/qsc-copipe.js`、
  `base/content/workspace_panel_copipe.js`、`base/content/coloring-panel.js`、
  `components/molwidget/XPCCueMol.cpp` の `ConvBAryToStr` / `CreateBAryFromStr`。
- テスト: `__test__/cuemolClipboardCodec.test.ts` (17 件 — A の latin1 展開と paint の
  テキスト経路の非対称、Windows NUL、アロケータ丸めの防御 decode、B の CRLF / 折り返し耐性と
  破損検出、UXP キー名)、`sceneClipboardService.test.ts` / `paintClipboardService.test.ts` の
  ステートレス round-trip、`colorPaneWire.test.tsx` / `useSceneTree.test.tsx` /
  `buildSceneCtxPayload.test.ts` の中継 wire。
- 残作業: macOS 相互運用 (`qsc-copipe.js` の envelope 併記 + `get`/`check` フォールバック)、
  Windows/Linux 実機での Format A 突き合わせ、単一インスタンスロック解除後の
  インスタンス間 E2E。
