# mdtools GUI (MD trajectory) の tritium plugin 化

Status: **実装済み** (`tritium/react-gui/src/plugins/mdtools/`)。
関連: [tritium plugin](../architecture/tritium_plugin/_index.md)、
[MD Trajectory Open Dialog](../architecture/md-trajectory-open-dialog.md)、
[MD Trajectory Bottom Pane](../architecture/md-trajectory-bottom-pane.md)。

## 背景

`src/modules/mdtools/` (C++) に対応する react-gui の GUI -- File > Open MD Trajectory...
ダイアログ、Trajectory bottom tab (再生 / seek / block 編集)、その worker service 群 --
は core の閉じたテーブル (`CmdId`/`CommandMap`、`APP_MENU`/`MENU_ACTION_MAP`/`IPC`、
`BUILTIN_BOTTOM_TABS`、`DialogContext`、`ServiceMap`、`AsyncCueMol`) に直接配線されていた。

これを既存の plugin host に載せ、`src/plugins/mdtools/` 1 ディレクトリに閉じた built-in
plugin (既定オフ) にする。**C++ 側は変更しない**。`mdtools::init()` は
`libcuemol2_api/loader.cpp` で常時ロードされ、`Trajectory` クラスと reader は plugin の
有効/無効に関係なく存在する -- JS/TS レーンだけの plugin 化という割り切り。

`mdtools` は「専用の C++ クラスを持つ機能」を plugin 化した最初の例で、既存 4 つ
(getpdb / sequence / catalog / agent) の選定基準 (専用 C++ クラスを持たない) の例外。

## 決定事項

- plugin id は **`mdtools`** (表示名 "MD Tools")。`mdtraj` は同名の python package と
  紛らわしいので採らない。既存の下位ディレクトリ `mdtraj/` も `renderer/track/` に改名した
  (CSS クラス `.mdtraj-*` とトークン `--mdtraj-*` は外部に見えない内部識別子なので据え置き)
- **worker service も含めて全部 plugin へ移す**。core に trajectory 固有コードを残さない
- `defaultEnabled: false` (Settings > Plugins で opt-in)

## 実装の要点

### plugin 側 (`src/plugins/mdtools/`)

```
index.ts / manifest.ts        command + File メニュー行 + bottom tab の宣言、CSS import
calls.ts                      MdtoolsCalls (7 本) / MDTOOLS_KEYS / mdtoolsServices
renderer/  MdtoolsRoot.tsx    dialog provider の内側で command 登録
           useOpenMdTrajCommand.ts / OpenMdTrajDialog(.Provider) / trajPathHistory.ts
           TrajectoryPanel.tsx / useTrajectory.ts / useTrajPlayback.ts / md-traj-panel.css
           track/             TrajTransport / TrajTrack / TrajBlockStrip / trackGeometry
worker/    mdtools.service.ts loadTrajectory / getTrajectoryRendererInfo / trajectory.ts
```

- service 呼び出しは `cm.invokeService(name, args)` から
  `mdtoolsServices.invoke(cm, name, args)` へ (wire 名は `plugin.mdtools.<name>`)
- `TrajectoryPanel` は `BottomTabComponent` として型付け

### core 側で外したもの

| ファイル | 変更 |
|---|---|
| `shell/BottomPanel.tsx` | built-in `trajectory` タブと `case` を削除 |
| `contexts/DialogContext.tsx` | `OpenMdTrajDialogProvider` を削除 (plugin Root が mount) |
| `commands/{ids,CommandMap,useSceneCommands}.ts` | `UiOpenTrajDialog` と handler を削除 |
| `shared/{menuTemplate,menuActionMap,ipcChannels}.ts` | `open-traj` 行 / `MENU_OPEN_TRAJ` を削除 |
| `worker/server/services/traj/` | `morph/` にリネーム。`traj.service.ts` -> `morph.service.ts` (morph 5 本のみ) |
| `worker/shared/calls/traj.ts` | `morph.ts` (`MorphCalls` / `MORPH_KEYS`) に。`file.ts` の `loadTrajectory` 行も削除 |
| `worker/client/AsyncCueMol.ts`, `apis/fileApi.ts` | `loadTrajectory` / `getTrajectoryRendererInfo` を削除 |
| `h3-kit/ObjectSelect.tsx` | `objectFilters.trajectory` を削除 (panel がローカル述語を持つ) |
| `app.css` / `styles/_dialog.css` | CSS import と `.omt-traj-sections` を plugin の CSS へ移動 |

### core に残したもの (と理由)

- `h3-kit/primitives/appIcons.ts` の `panel.trajectory` -- plugin は独自 icon を持てない
  (`AppIconKey` は閉じた union)。`panel.sequence` と同じ扱い
- `styles/_variables.css` の `--mdtraj-*` -- stylelint `color-no-hex` が `_variables.css`
  以外の全 CSS に効くため、block palette の hex は plugin 側に書けない
- `worker/server/services/props/selContext.ts` の `className === 'Trajectory'` --
  C++ クラス階層の知識であって UI ではない。plugin 無効時も Trajectory object は存在し得る

### メニュー順の維持

`plugins/getpdb/manifest.ts` は `after: 'open-traj'` で built-in 行に anchor していた。
その行が plugin (既定オフ) へ移ると anchor が見つからず Get PDB が File メニュー末尾に
落ちるので、**両方とも `after: 'open-file'`** に変更し、`BUILTIN_PLUGINS` で `mdtools` を
getpdb より後に登録した (`insertItems` は anchor 直後へ順次挿入するので、両方有効なら
`Open File / Open MD Trajectory... / Get PDB / Open Recent` と従来順になる)。

## テスト

新規テストは書かず、既存 5 本を plugin 配下へ移動して契約の宛先だけ直した
(寄与の配線は `plugins/index.test.ts` と host 側テストが pin 済み)。

- `worker/loadTrajectory.test.ts` / `worker/trajectory.test.ts` -- `./mdtools.service` から import
- `renderer/useTrajPlayback.test.tsx` -- mock `cm` を `invokeService` から
  **`invokePluginService`** に。`(pluginId, name, args, opts)` の 4 引数で呼ばれるので、
  assertion は `(name, args)` ペアを読む形に
- `renderer/OpenMdTrajDialog.test.tsx` / `renderer/track/trackGeometry.test.ts` -- path のみ
- `plugins/index.test.ts` に `mdtools: MDTOOLS_KEYS` と切替ポリシーの 2 行を追加
- core 側追随: `calls/index(.test).ts` の morph リネーム、`menuPipelineExhaustiveness.test.ts`
  から `MENU_OPEN_TRAJ` 削除、`pluginMenu.test.ts` の anchor を `open-file` に、
  `sceneCommandsAutoScene` / `sceneMenuCommands` の dead mock 削除

## host に足したもの

`plugin-host/api.ts` に `useShowNewRendererDialog` / `NewRendererDialogArgs` を追加。
object をロードする plugin が共通に必要とする core dialog なので barrel が正しい置き場
(`useShowFileOpenOptionDialog` と同じ扱い)。

## 検証

- `npx tsc -p tsconfig.web.json --noEmit` / `tsconfig.node.json` -- 両方 0 error
- `npm test` -- 414 files / 3813 tests pass
- `pnpm run lint` -- 0 error (警告は移動前から存在するもののみ)、`npm run lint:style` --
  既存 14 件のまま (増減なし)
- `task build_tritium` -- 成功。worker bundle に mdtools service が入っていることを確認
- 目視確認 (E2E): 既定オフで File メニューに項目が無い / Trajectory タブが無い /
  Get PDB が Open File の直後に出ること、Settings > Plugins で ON にすると即座に両方出て
  ロード・再生・block 編集・undo/redo が従来どおり動くこと
