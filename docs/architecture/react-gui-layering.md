# react-gui のレイヤと import 規則 (日本語)

`tritium/react-gui` は 3 つのプロセス/スレッド (Electron main / renderer /
Web Worker) にまたがる約 1,000 ファイルのコードベースで、どのモジュールが
どこで動くかは **import が越えてよい境界** でしか表現できない。この文書は
その境界を定義し、`eslint.config.mjs` の `no-restricted-imports` が何を
守っているかを説明する。

規則の実体は ESLint 側にある。**この文書と config が食い違ったら config が正**
であり、規則を変えるときは両方を同じ PR で直す。

---

## なぜ機械的に守るのか

境界違反は「動くが間違っている」形で入る。実際に出荷まで到達した 2 件:

- `Ccp4MapOptionsPane.tsx` (renderer UI) が `probeMapHeader.service.ts`
  (worker) を**実行時** import していた。worker bundle だけが `fs` / `os` を
  external に持つ設定なので、service 側がそれらに触れた瞬間に renderer
  bundle が壊れる。
- `coloring/applyColoring.ts` (worker) が `components/multigrad/`
  (renderer UI) を実行時 import していた。当時たまたま React を含まない
  モジュールだったので動いていただけで、React を 1 行足せば worker が落ちる。

どちらもレビューでは見落とされ、型検査も通る。だから ESLint で落とす。

---

## プロセス/スレッド境界

```
src/
  main/       Electron main process
  preload/    contextBridge
  shared/     main <-> renderer の契約 (どちらの実装も import しない)
  renderer/
    worker/
      server/   Web Worker で動く。C++ addon を呼ぶ唯一の場所
      shared/   両スレッドが load する wire DTO と純関数
      client/   renderer スレッド側の transport facade
    (それ以外)  renderer スレッドの UI
```

| from \ to | `shared/` | `worker/shared/` | `worker/server/` | `worker/client/` | UI | `main/` |
|---|---|---|---|---|---|---|
| `main/`, `preload/` | OK | x | x | x | x | OK |
| `shared/` | OK | x | x | x | x | x |
| `worker/server/` | OK | OK | OK | x | x | x |
| `worker/shared/` | OK | OK | 型のみ | 型のみ | x | x |
| `worker/client/` | OK | OK | 型のみ | OK | x | x |
| UI (renderer) | OK | OK | **型のみ** | OK | OK | x |

要点:

- **`worker/server` は React / Blueprint / UI を一切 import しない**。
  逆に UI から `worker/server/*` を**値**として import するのも禁止
  (`import type` は許可)。DTO が要るなら `worker/shared/` へ置く。
  service を呼びたいなら `cm.invokeService()` を使う。
- **`worker/shared` は両スレッドが load する**ので `@cuemol/core`・React・
  `electron` を持てない。wire DTO と純関数だけ。
- **renderer は main を直接 import しない**。`window.electronAPI` 経由のみ。
- 相対 import で 3 階層以上 (`../../../`) 登るのは禁止。`@renderer/` /
  `@shared/` / `@main/` の alias を使う。
- `@/*` は `@cuemol/core` 自身の alias (core の `src/` を指す)。react-gui の
  コードでは使わない。

---

## `h3-kit/` — デザインシステム

`h3-kit/` は「pane を組み立てる部品」であり、**どの pane が使うかを知らずに
読み書きできる**ことが存在意義。したがって:

> **h3-kit はアプリケーションコードを import しない。**

禁止するのは `components/` `contexts/` `state/` `shell/` `commands/`
`dialogs/` `data/` `features/` `crash/` `App` `types` と `@main/` `electron`。

許可するのは React・アイコンライブラリ・Blueprint・他の h3-kit モジュール・
`worker/client` + `worker/shared`・`hooks/cuemol/`・`utils/` の純ヘルパ。

### 「CueMol 非依存」ではない

kit を 2 層として理解する:

| 層 | 中身 | 依存 |
|---|---|---|
| pure | `primitives/` `form/` `list/` `gradient/` | React + Blueprint + Phosphor のみ (`form/ColorField` だけが下の層の colour picker を使う) |
| CueMol 結合 | `colorpicker/` `MolSelList/` `selection/` `ObjectSelect` | 上記 + `worker/client` (scene の色表・選択のヒット数などを読む) |

下の層は「特定の pane を知らない再利用可能ウィジェット」なので kit に残す。
`MultiGradSection` のように renderer の coloring を書き換えるものは kit の外。

この 2 層は ESLint では区別していない (`form/ColorField` の 1 件が壁を
またぐため)。将来 colour picker を注入形にできれば pure 層に
`worker/**` 禁止を足せる。

### barrel 経由でのみ触る

kit の外から `@renderer/h3-kit/<sub>/<module>` と名指しするのは禁止。
`@renderer/h3-kit/form` などの sub-barrel か、ルートの `@renderer/h3-kit`
を使う。

理由: 内部のファイル配置は kit が自由に変えられるべきであり、名指しは
それを固定する。実際に同じウィジェットが `SliderField` と
`SliderNumericField` の 2 つの名前でカタログに載る事故が起きた。

例外は **kit 内部の相対 import** と **テスト**。内部ヘルパ (`numericMath` の
`quantize` など) の unit test は実装モジュールを名指ししてよい —
barrel は公開面であり、そこに無いものを試すのがその test の目的だから。

---

## `hooks/` の配置規則

`lib/` という置き場は作らない (「feature でも kit でも worker でもない残り」
という否定でしか定義できず、解体対象の `hooks/` と同じ catch-all になる)。

| 置き場 | 規則 |
|---|---|
| feature / component の直下 | **単一 component が所有する** hook。所有者と同居させる |
| `hooks/react/` | **React にしか依存しない**。CueMol・IPC・`@shared`・`@main`・feature の import は ESLint で error |
| `hooks/cuemol/` | `worker/client` への React binding (`useCueMol`, `useCueMolEventListener`, `useLiveFetch`, `useMolEditCommit`) |
| `state/` `shell/` `dialogs/` | アプリ状態 / chrome / ダイアログ機構。`hooks/` には置かない |
| `utils/` | hook でない汎用ヘルパで、誰も所有しないもの |

`hooks/` 直下への新規追加は禁止。所有者か上記グループを選ぶ。

---

## flat config の落とし穴 (実際に踏んだ)

ESLint flat config は、**後のブロックが同じ rule の options を merge せず
上書きする**。`no-restricted-imports` を層ごとにブロックで積むと、最後に
マッチしたブロックだけが効く。

このため config では:

- `restrict(...)` ヘルパでパターンを合成し、**1 ファイルにつき
  `no-restricted-imports` のエントリは 1 つ**にする。
- 広いブロック (`src/renderer/**`) は、より狭いブロックを持つディレクトリ
  (`h3-kit/**`, `worker/**`, `hooks/react/**`) を `ignores` で除外する。
  除外を忘れると狭い方のルールが**無言で消える**。

新しい層ルールを足したら、**わざと違反を書いて error が出ることを確認する**
こと。上記の理由で「書いたのに効いていない」が起こりうる。

---

## テストの配置

テストは対象の隣に置く (`Foo.test.ts` を `Foo.ts` の隣に)。
`src/renderer/__test__/` は移行途中の名残で、順次解消する。

テストからは全レイヤに触れてよい (`no-restricted-imports` は off)。
逆に **production コードからテストヘルパを import するのは禁止**
(`__test__/**`, `testHarness*`, `worker/testing/**`)。
