# MD Trajectory Open Dialog (tritium)

MD simulation trajectory を tritium/react-gui から開くための UI・worker service・IPC
設計記録。C++ 側の block-centric `Trajectory`(`AnimMol : MolCoord`) 読み込み機能
(`src/modules/mdtools/`) は Phase 2 MVP まで実装済みだが、それを開くための GUI が無く
`.qsc` 経由でしか読めなかった。本ドキュメントはその GUI を新規追加した際の設計判断を残す。

これは UXP からの migration ではない新規機能のため、`docs/migration/` の mapping/ADR には
載せない (migration ADR は migration 専用に保つ)。

## 背景: なぜ通常の "Open File" と別扱いか

libcuemol2 には 2 つのロードモデルが併存する。

- **単一 reader モデル** (通常の PDB/mmCIF や Amber prmtop / NAMD coor): 1 つの `ObjReader`
  が `MolCoord` を生成する。tritium の `loadObject.service.ts` はこれ専用。
- **block-centric Trajectory モデル** (今回): topology reader が `Trajectory` を作り、各
  trajectory file を `TrajBlock` として読んで `Trajectory::append()` で連結する。1 file =
  1 block、複数 file で複数 block をフレーム連番で連結できる。原子数は topology で決まり、
  `append` が `getAtomSize()*3 == block coord size` を検証する。

trajectory は入力が「topology 1 個 + 順序付き trajectory 複数個」という**集合**であり、
単一ネイティブファイルピッカーでは表現できない。よって専用フロー・専用 worker service に分ける。

C++ 検証の結論: **worker から既存 scriptable wrapper API だけで Trajectory 一括ロードが完結し、
C++ の新規追加は不要**。正典の手順は `src/tests/modules/importers/test_trajio.cpp` の
`makeWaterTrajectory()` / `appendDCD()`。制約は (a) 要ビルド (mdtools の 8 qif から TS wrapper
自動生成)、(b) scriptable な `ObjReader::read()` は `setPath()` 経由のパスベースのみ (in-memory
stream read は非公開)、(c) `Trajectory::setup()` は非公開だが最初の block read 中に lazy 実行
されるため明示呼び出し不要。

## フロー: 2 段 (deferred load)

renderer dialog を cancel したとき「他の object load と同じく全 transaction がキャンセル
(= 何もロードされない)」にするため、**実 C++ ロードは renderer 選択の確定後まで遅延**させる。
既存 `OpenObjByPath` が load を dialog 確定後に走らせるのと同じ構造。

```
File > Open MD Trajectory...  (CmdId.UiOpenTrajDialog, useSceneCommands.ts)
  1. OpenMdTrajDialog          : topology + trajectory files を「収集」のみ。cancel -> 中止
  2. ensureActiveScene()       : ロード先 scene 確保 (既存フローと同じ。cancel でタブは残す)
  3. getTrajectoryRendererInfo : 空の Trajectory を probe して互換 renderer 型を取得
                                 (ファイル未読・scene 非追加、cheap)
  4. NewRendererDialog (再利用) : initial renderer を選び rendOpts を得る。cancel -> 中止
  5. cm.loadTrajectory(...)     : ここで初めて createObj -> topology read -> append ->
                                 setupRenderer を 1 undo txn で実行
```

renderer dialog (手順 4) を cancel した時点で手順 1 は何もロードしていないため、
「巨大 trajectory を読んでから undo で捨てる」無駄が発生せず、既存の object-open の cancel
セマンティクスに一致する。initial renderer 選択は既存 `NewRendererDialog` +
`useRendererOptions` をそのまま再利用する (post-load 用の `getNewRendererOptions` /
`createRendererOnObject` は**使わない** — ロード前に出すため args を自前で合成する)。

## worker service

### `loadTrajectory.service.ts`

`withUndoTxn(scene, 'Open MD trajectory', ...)` の中で block-centric 組み立てを実行:

```
traj = ctx.svc.createObj('Trajectory')
gro  = ctx.strMgr.createHandler('gro', OBJREADER_CATEGORY)
gro.attach(traj); gro.setPath(topologyPath); gro.read(); gro.detach()   // topology を Trajectory に読む
traj.name = renderer.objectName || stem(topologyPath)
scene.addObject(traj)                                    // uid を getObjectS で解決可能にする
for (p of trajPaths):
  r = ctx.strMgr.createHandler(TRAJ_READER_BY_EXT[ext(p)], OBJREADER_CATEGORY)
  r.targTrajUID = traj.uid                               // block reader が親 Trajectory を UID で解決
  if (nevery > 1) r.nevery = nevery                      // 間引き (全 file 共通)
  blk = r.createDefaultObj(); r.attach(blk); r.setPath(p); r.read(); r.detach()
  traj.append(blk)                                        // フレーム連番で連結。原子数不一致で throw
setupRenderer(ctx, traj, renderer)                        // Trajectory は MolCoord 派生、無改変で再利用
```

- **topology reader は事前生成した Trajectory に attach する** (`createDefaultObj` の MolCoord には
  attach しない)。`GROFileReader::read()` は `getTarget<MolCoord>()` で書くため、Trajectory
  (MolCoord 派生) に原子が載る。
- **順序が意味を持つ**。`trajPaths` の順に append され、frame がグローバル連番になる。
- 原子数不一致は `Trajectory::append` が throw -> `withUndoTxn` が rollback -> command 側で
  error dialog。事前検証はしない (MVP)。
- reader nickname (C++ 確認済み): topology `gro`、trajectory `dcdtraj` / `xtctraj` / `trrtraj`。

### `getTrajectoryRendererInfo.service.ts`

deferred フローでは renderer 選択がロード前に走るので、ロード済みオブジェクトを probe できない。
代わりに **空の `Trajectory` を 1 個作って `searchCompatibleRendererNames()` を呼ぶ**
(互換 renderer 集合はクラスだけで決まる。ファイル未読・scene 非追加で cheap)。`*` 始まりの
内部 renderer と test type (`ms2test`/`symm`) を除外する (`getCompatibleRendererNames` と同じ filter)。

## IPC 拡張: 複数ファイル選択

trajectory の複数 file を一括で追加できるよう、`DIALOG_PICK_PATH` を後方互換で拡張:

- `shared/ipcContract.ts`: req に `multi?: boolean`、res に `filePaths?: string[]` を追加。
  既存の単一 `filePath` は残す (single-select の後方互換)。
- `main/handlers/fileDialogs.ts` `handlePickPathDialog`: `multi && !directory` のとき
  `properties` に `'multiSelections'` を混ぜ、res に `filePaths` を含める。

topology の Browse は従来どおり single、trajectory の Add のみ `multi: true`。

## ダイアログ (OpenMdTrajDialog)

`DialogShell` + form-kit (`h3-kit/form/`) + list-kit (`h3-kit/list/`) で構成 (width rung `2xl`)。

- **Topology**: `FieldSection` + `ComboBoxField` (パス履歴) + `FormButton "Browse..."`
  (`DIALOG_PICK_PATH` single, filter=gro)。
- **Trajectory files**: `FieldSection` + `Listbox`/`ListRow` の**順序付きリスト** +
  `ButtonRow` の Add/Remove/Up/Down (add/delete/move ロジックは `ApplyRendStyleDialog` に倣う) +
  `NumericField` (間引き nevery)。Add は `DIALOG_PICK_PATH` (`multi: true`, filter=dcd/xtc/trr)
  で `filePaths` を末尾追記。
- Footer は `Open` (topology 設定済み && trajectory>=1 で活性) / `Cancel`。確定で
  `{ topologyPath, trajPaths, nevery }` を resolve、cancel で null。
- Provider は `createConfirmCancelDialog` で生成し `DialogContext` の `composeProviders` に登録。
- パス履歴は `trajPathHistory.ts` (`createStringPref`、topology / trajectory の last-dir を保持)。

## 主要ファイル

| 層 | ファイル |
|---|---|
| worker service | `worker/server/services/loadTrajectory.service.ts`, `getTrajectoryRendererInfo.service.ts` |
| worker 登録 | `worker/shared/calls/` (ServiceMap), `worker/client/apis/fileApi.ts`, `worker/client/AsyncCueMol.ts` |
| main IPC | `shared/ipcContract.ts`, `main/handlers/fileDialogs.ts` |
| dialog | `components/dialogs/OpenMdTrajDialog.tsx` (+ Provider), `trajPathHistory.ts`, `contexts/DialogContext.tsx` |
| command / menu | `commands/ids.ts`, `commands/CommandMap.ts`, `commands/useSceneCommands.ts`, `shared/ipcChannels.ts`, `shared/menuTemplate.ts`, `shared/menuActionMap.ts` |
| 再利用 (renderer) | `components/dialogs/NewRendererDialog.tsx`, `useRendererOptions`, `setupRenderer.service.ts` |

## テスト

- `__test__/loadTrajectoryService.test.ts`: `loadTrajectory` の wrapper 呼び出し順序を pin
  (createObj -> topology read -> 各 file の targTrajUID + createDefaultObj + attach + setPath +
  read + detach + append -> setupRenderer -> commit)。append 失敗で rollback + rethrow、
  未対応拡張子で rollback、空 trajPaths で `ok:false`。`getTrajectoryRendererInfo` の filter も検証。
- `__test__/openMdTrajDialog.test.tsx`: Open の活性ゲート (topology + traj>=1)、Add が
  `multi:true` + trajectory filter で picker を開き `filePaths` を末尾追記、確定 payload、cancel。
- C++ 下層の block 連結は `test_trajio.cpp` (`MultipleDcdBlocksSpanFrames` 等) が既に担保。

## スコープと既知の制約

- **topology は gro のみ**。trajectory は dcd/xtc/trr。
  - `prmtop` は同一機構 (topology reader を Trajectory に attach) で動作する見込みだが未検証。
  - `psf` は専用 `PsfTrajReader` が未実装 (Phase 2 で保留) のため未対応。
  - AMBER NetCDF (`.nc`) reader は develop 未マージ (`feature/md-trajectory-amber-netcdf`)。
- **再生 UI (frame スライダー / transport) は本作業のスコープ外**。ロード済み `Trajectory` は
  `frame` / `nframe` / `dynframe` / `frame_aver_size` を公開しており、既存 `AnimationPanel` /
  `AnimTransport` への配線は別タスク (Phase 2d/2e 相当)。
- **MRU 非対応**。topology + trajectory のセットを単一パスで表現できないため、`addRecent` は呼ばない。
- per-file 間引き・frame averaging (`frame_aver_size`)・追加時の原子数事前検証は未実装。

## 関連

- 実装計画: `docs/plans/260718-md-trajectory-phase2-plan.md` (C++ 側 Phase 2 の phase 分けと逸脱事項)。
- reader 実装ブリーフ: `docs/plans/gro_reader_planning_brief.md`,
  `docs/plans/amber_reader_planning_instructions.md`。
