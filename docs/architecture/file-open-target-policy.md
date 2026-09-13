# ファイルを開く先 (アクティブシーン / 新しいシーン) の方針

tritium の「開いたファイルをどのシーンに読むか」の仕様。UXP には無かった
**ユーザー設定**を足したので、移植判断ではなく architecture 側に置く。

## UXP (CueMol2) の挙動 — 調査結果

きっかけは「drag&drop はシーンに追加されるが、Explorer/Finder から開くと新規シーンが
作られる」という報告だった。UXP のソースを追った結果、**そうはなっていない**:

| ファイル種別 | 挙動 | 実装 |
|---|---|---|
| オブジェクト (.pdb/.cif/.mtz/map) | **常にアクティブシーン** | `fileopen.js:111-113` `fileOpenHelper1` が `currentSceneW` に `addObject` |
| シーンファイル (.qsc/.qsl) | アクティブが `Scene::isJustCreated()` (未変更・0 object・0 camera) なら in-place、そうでなければ新規タブ | `fileopen.js:371-414` `openSceneImpl` |

drag&drop (`dragdropopen.js:74` `onDrop`) も shell open (`:272` `openFromShell`) も
同じ `openNsFileImpl` (`:167-215`) に合流する。オブジェクト経路に `createScene` /
`addMolViewTab` は存在しない (どちらも `openSceneImpl` 内の 400/413 行のみ)。
`openFromShell` の直前のコメントが `/// Request open new tab from OS/Shell` となっていて
実装と食い違っており、これが誤解の出どころと思われる。

既存インスタンスへの受け渡しは 3 OS とも有効で、`-no-remote` の指定もどこにも無い:

| OS | 起動済み | 未起動 | 機構 |
|---|---|---|---|
| Windows | アクティブシーン | 新規シーン | `cuemol2MessageWindow` + `WM_COPYDATA` → `STATE_REMOTE_AUTO` |
| Linux (X11) | アクティブシーン | 新規シーン | XRemote (`MOZ_ENABLE_XREMOTE`、X11 限定) |
| macOS | アクティブシーン | 新規シーン | LaunchServices → `application:openFile:` → `STATE_REMOTE_EXPLICIT` |

「未起動」列が新規シーンになるのは、新ウィンドウの `onLoad` で `onNewScene(null)`
(`cuemol2.js:209`) が走り、**その 1 tick 後**に `openFromShell` (`:222`) が走るため。
空シーンが先に作られ、そこに読み込まれる。

つまり**報告された挙動は仕様ではなく起動状態の副作用**だった。真の OS 差は 2 点のみ:

- **Linux の Wayland**: `MOZ_ENABLE_XREMOTE` は X11 限定なので受け渡しが起きず、常に第 2 プロセス = 常に新規シーン
- **Windows の起動直後レース**: 既存インスタンスが起動中 (`mCanHandleRequests == false`) の間、オープンは無言で捨てられる

補足: Windows では `.pdb` の関連付け自体が無い (`.qsc`/`.qsl` のみ、しかも
`winbuild/installer/cuemol2.iss` = 2018 年・CI 非経由の XULRunner 世代)。`.pdb` は
「プログラムから開く」経由になるため、閉じた状態から起動しやすい導線になっている。

## 決定

**既定は UXP と同じ**まま、入口ごとに opt-in で切り替えられるようにする。

1. **設定は 2 つ** (`UiState.dropOpenTarget` / `shellOpenTarget`、どちらも `'active' | 'new'`、
   既定 `'active'`)。drag&drop と shell open (Finder/Explorer・コマンドライン・second-instance)
   では期待が違いうるので独立させた。
2. **アプリ内の File > Open / 最近使ったファイル は常にアクティブ**。設定を持たない。
   ユーザーがメニューを選んでいる = 作業中のシーンが見えている状態で、意外性が無い。
   実装上も `openTarget` を省略すると `'active'` になるので分岐が要らない。
3. **対象はオブジェクトファイルのみ**。`.qsc` は設定に関わらず `isJustCreated` ルールを維持する。
   `.qsc` を既存シーンに「読む」のは `loadScene(path, sceneId)` = 中身の置換で、未保存の作業を
   黙って捨てる。設定が増やせる挙動はその破壊的な側だけなので対象にしない。
4. **`'new'` でもアクティブが空ならそこに読む** (`isSceneJustCreated`)。起動直後の Untitled や
   New Tab 直後に空タブと読み込みタブが 2 枚並ぶのを防ぐ。`.qsc` が既に使っているルール。
5. **一緒に開いたファイルは 1 シーンを共有**。ファイルごとに別シーンにするニーズは無い。

## 実装

決定は**入口が行い、下流に渡す**。コマンド側は設定を読まない。

```
useFileDrop        --(dropTarget)-----┐
                                      ├→ useOpenFilePaths.openPaths(paths, { policy, openTarget })
useShellOpenFiles  --(getShellTarget())┘     └→ dispatch(OpenObjByPath, { ..., openTarget, targetSceneId })

useElectronIpc (File > Open) ──────────→ dispatch(OpenObjByPath, { ... })   // openTarget 無し = 'active'
useMenuDispatch (Open Recent) ─────────→ dispatch(OpenObjByPath, { ... })   // 同上
```

| 要素 | 場所 |
|---|---|
| 設定値・ラベル・正規化 | `renderer/data/openFileTarget.ts` |
| provider | `renderer/contexts/FileOpenPrefsContext.tsx` |
| 解決 (plan/commit) | `renderer/hooks/useEnsureActiveScene.ts` `makeResolveOpenTarget` |
| 分岐の適用 | `renderer/commands/useSceneCommands.ts` `OpenObjByPath` |
| バッチ固定 | `renderer/features/file-io/useOpenFilePaths.ts` |
| Settings 行 | `features/settings/settings/settingsConfig.ts` (General > Files) |

### plan / commit 分割

`makeResolveOpenTarget` は `{ previewSceneId, commit }` を返し、`commit()` が呼ばれて
初めてシーンを作る。`OpenObjByPath` は

```
読める確認 → resolve → preset 取得 → option dialog → commit() → loadObject
```

の順に進むので、**キャンセルしてもタブが残らない**。従来はシーン解決が dialog の前に
あり、既存テストの題名が "(scene may exist)" と弱点を認めていた。今回その契約を強めた。

`previewSceneId` は「これから新しいシーンを作る」または「まだシーンが無い」場合 `0`。
`FileOpenOptionDialogProvider` が既に `sceneId ?? 0` と正規化しており、名前提案サービスも
scene 未検出時に bare prefix を返す (= 空の新シーンで正しい名前)。
併せて `getNewRendererOptions.ts` の `collectRendPresetTypes` が `sceneId === 0` で
グローバルスコープを二重取得し preset 行が重複するバグを修正した。

### バッチ

`useOpenFilePaths` が `batchSceneId` を持ち、**最初に確定したシーン**に以降を固定する
(後続が別のシーンを報告しても pin は動かさない)。「アクティブを使え」ではなく uid を渡すのは、
`getActiveSceneInfo()` が読む `stateRef.current` がレンダー時に代入されるため、
`await newScene()` の直後はまだ新タブが見えていない可能性があるから。
混在バッチ `[a.qsc, b.pdb]` も決定的になる (b.pdb が a.qsc のシーンに入る)。

### 起動レース

`getShellTarget()` だけ awaitable にしてある。`useShellOpenFiles` の drain は
`cueMolReady && initialSceneSettled` だけをゲートにしており `UI_LOAD` の往復と順序関係が
無いため、React state を読むと**起動時 shell open で既定値にフォールバックする** —
設定が最も効いてほしい経路で黙って壊れる。読み込み失敗時も必ず resolve する
(`readyRef` を `finally` で解決) ので、ファイルが取り残されることはない。

## 既知の制約

- `main/fileOpen.ts` は `properties: ['openFile']` なので File > Open は今のところ 1 件ずつ。
  将来複数選択を足すなら、各パスが個別の push で届くため `useOpenFilePaths` を経由させないと
  バッチ共有が効かない。
- Get PDB プラグインと agent プラグインは従来どおり `useEnsureActiveScene` のまま
  (アプリ内操作 / 作業中シーンの継続なので決定 2 と同じ扱い)。この据え置きを安全にするため、
  `makeResolveOpenTarget` は既存関数を書き換えず**追加**してある。
