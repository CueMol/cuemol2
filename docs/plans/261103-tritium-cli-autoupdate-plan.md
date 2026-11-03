# tritium_cli autoupdate 計画 (未着手)

## Context

`tritium_cli autoupdate` で、動いている CueMol3 の updater を CLI から駆動する。
`tritium_cli` の subcommand 拡充 (実装済み: [local-api-server.md](../architecture/local-api-server.md) §5) の一部として設計したが、
GUI の updater との制御権の受け渡し、開始 phase ごとの引き継ぎ、複数 CLI の排他など契約が大きく、
他の subcommand と独立しているため、別 plan に分けて後日に回した。
3 回のレビュー (CLI 駆動中の GUI 自動 restart、開始 phase ごとの引き継ぎと restart の cancel、`--check` が
更新を進めないこと・失敗時の exit code、owner 付き lease による制御権) の指摘を反映済み。実装する時点の updater のコード
(`tritium/updater/src/controller.ts`、`react-gui/src/main/updater/index.ts`、`features/update/UpdateBridge.tsx`)
で再確認すること。

### 形

`tritium_cli autoupdate [--check] [-y]` -- 動いている app の updater (`main/updater/index.ts`) を CLI から駆動する。
npm 版 CLI 自身の更新は `npm i -g @cuemol/tritium-cli` の案内だけ。subcommand 判定 (`tritium/cli/src/args.ts` の `SUBCOMMANDS`) に `autoupdate` を足す。

### app 側 (main、`/app/update`)

- `main/localApi/appEndpoint.ts` に `/app/update` を追加 (console endpoint 所属、main が答える。
  `/app/quit` と同じ理由で relay しない)。body `{ action, owner? }` -> `{ status: UpdateStatus, owned: boolean }`
  (`UpdateStatus` は `shared/types/update.ts` の型をそのまま。wire 型は console-kit に置き、react-gui は
  re-export する既存方式に合わせる)。
- lease の判定 (取得・延長・解除・期限) は Electron 非依存の純 module `main/updater/cliLease.ts` (時刻を注入) に置く。
- 処理は `main/updater/index.ts` に `cliUpdate(action, owner)` を export し、既存 invoke handler と同じ
  controller 呼び出しを共有する (handler 本体を関数に括り出して両方から呼ぶ)。`check` は
  `manualCheck = true` (手動扱いでエラーも見せる)。`restart` は `readyToRestart` のときだけ
  `quitApp(false)` を呼び、結果 (`quit`/`cancelled`) を返す (それ以外の phase では `{ error }` 409)。
- **CLI が駆動している間は GUI が flow を進めない** (review #2)。現行 `UpdateBridge.tsx` は origin に
  関係なく `installing -> readyToRestart` で `send(IPC.UPDATE_RESTART)`、`downloading -> downloaded` で
  (settings 以外なら) `confirmInstall` を呼ぶ。origin は renderer 内の変数なので、CLI の駆動は main が持つ。
- 編集ロック (local-api-server.md §7) とは独立 (更新 flow 専用)。

#### 制御権 (lease) の契約 (review-2 #2)

main は `lease: { owner: string; expiresAt: number } | null` を 1 つだけ持つ。**参照と制御を分ける**:

| action | lease が要るか | 動作 |
|---|---|---|
| `status` (owner 無し) | 不要 | 状態を返すだけ。lease に触れない |
| `acquire` (owner) | -- | lease が無いか期限切れ、または同じ owner なら取得 (5 秒) して `owned: true`。他の owner の有効な lease があれば 409 `{ error: 'busy' }` |
| `renew` (owner) | 現 owner のみ | 現 owner で期限内なら延長して `owned: true`。**それ以外 (GUI に解除された、期限切れ、別 owner が取った) は `owned: false` を返し、取り直さない** |
| `check`/`download`/`install`/`restart`/`cancel` (owner) | 現 owner のみ | 現 owner で期限内なら実行して延長。違えば 409 `{ error: 'not-owner' }` で何もしない |
| `release` (owner) | 現 owner のみ | lease を解除 (正常終了時に CLI が送る) |

- owner は CLI の実行ごとの乱数 ID (`randomUUID()`)。CLI は 500 ms ごとに `renew` で poll し、状態もその
  応答で受け取る。期限切れの lease を旧 owner が `renew` で復活させることはできない。
- **GUI が lease を解除するのはユーザの明示操作だけ**: `UPDATE_CHECK` / `UPDATE_DOWNLOAD` / `UPDATE_CANCEL` /
  `UPDATE_INSTALL` / `UPDATE_RESTART`。`UPDATE_GET_STATUS` (`useUpdateStatus.ts` が mount 時に呼ぶ閲覧)、
  `UPDATE_OPEN_RELEASE`、`UPDATE_DISMISS_RESULT` では解除しない。
- status に `cliDriving: boolean` (有効な lease があるか) と `installRequestedBy: 'gui' | 'cli' | null`
  (`install` の呼び出し元。main が記録) を載せる。lease の取得・解除・期限切れのたびに push する
  (期限切れは timer で検出)。
- `UpdateBridge`: `cliDriving` の間は通知・確認 dialog を出さない (settings origin と同じ扱い。展開中の
  modal 進捗だけは出す)。**自動 restart は `installRequestedBy !== 'cli'` のときだけ**送る。これで CLI が
  restart を送る唯一の担当になる。lease が無くなった後に `readyToRestart` が残っていれば、既存の
  persistent 通知 (Restart to Update) が出る (自動 restart はしない)。
- 古い app (route 無し、404) には「この CueMol は CLI から更新できない」と出す (quit と同じ方式)。
  `CONSOLE_PROTOCOL` を 1 上げる。

### CLI 側 (`src/autoupdate.ts`)

1. `ensureApp` (通常の起動規則) -> `status` (owner 無し)。`supported: false` (dev / Linux) なら理由を出して exit 1。
2. **`--check` はここで処理し、以降の手順には入らない** (review-2 #1)。`--check` は `install` /
   `restart` / `download` を**決して送らない**:
   - phase が `idle`/`upToDate`/`available`/`error` なら、`acquire` -> `check` -> 結果表示 -> `release`。
     `acquire` が busy なら check せず現在の status だけ表示する。
   - それ以外 (`checking`/`downloading`/`downloaded`/`installing`/`readyToRestart`) は lease を取らず、
     現在の phase と版 (例 `Update to Y is downloaded; run tritium_cli autoupdate to install it.`) を表示する。
   - 終了コード (review-3): 状態を取得・確認できたら、更新の有無によらず exit 0。確認の結果が
     `error` phase (controller の `check()` は通信失敗等を throw せず `error` に変える) なら message を
     stderr に出し、`release` して **exit 1**。`supported: false` も exit 1。
3. `acquire`。busy なら「別の `tritium_cli autoupdate` が更新を進めている」と出して exit 1。以後 500 ms ごとの
   `renew` で状態を受け取り、**`owned: false` が返ったら即座に止まる** (「更新の操作は CueMol の window に
   移った」等を出して exit 1。control action は送らない)。正常終了・エラー終了とも最後に `release`。
4. **開始時の phase で分岐** (review #3。controller の `check()` は `idle`/`upToDate`/`available`/`error` 以外では
   何もせず戻るため、それ以外は check を送らない):

   | 開始時の phase | CLI の動作 |
   |---|---|
   | `idle` / `upToDate` / `available` / `error` | `check` を送り、結果で 5 へ |
   | `checking` | 確定するまで poll して待ち、結果で 5 へ |
   | `downloading` | 引き継ぐ: 進捗を表示して `downloaded` まで待ち、6 の確認から続ける |
   | `downloaded` | 6 の確認から続ける |
   | `installing` で `installRequestedBy: 'gui'` | `release` して busy: 「CueMol の window で更新を展開中。window 側が再起動する」と出して exit 1 (GUI の自動 restart に任せる) |
   | `installing` で `installRequestedBy: 'cli'` | 引き継ぐ: 待って `readyToRestart` で 7 へ。lease を取れた = 前の CLI の lease は切れている (3 の busy 判定で保証) |
   | `readyToRestart` (前回の再起動がキャンセルされた等) | 確認 (`Restart CueMol3 to finish updating to Y? [y/N]`) して 7 へ |

5. 最新なら `CueMol3 X is up to date.` exit 0。`canInstall: false` なら release page URL を出して exit 1。
6. 確認: TTY なら `Update CueMol3 X -> Y? [y/N]` (`-y` で省略、非 TTY で `-y` 無しは exit 2、N は exit 1)。
   `download` -> stderr に進捗バー -> `downloaded` で `install` -> step 表示。
7. `readyToRestart` で `restart` を **1 回だけ**送る (保存確認は app 側。既存 `requestQuit` の spinner を流用)。
   - `quit`: 「CueMol3 は Y で再起動します」と出して exit 0。接続が切れた場合は `quitApp` と同じく
     pid の消滅で `quit` とみなす。npm 版 (package.json がある) なら `npm i -g @cuemol/tritium-cli` の案内を 1 行。
   - `cancelled`: 「再起動はキャンセルされた。更新は staged のまま。もう一度 `tritium_cli autoupdate` か
     window の Restart to Update で完了する」と出して `release`、**exit 1**。再送はしない (lease が無くなるので
     GUI に persistent 通知が出る)。
8. Ctrl-C: `downloading` 中なら `cancel` を送る (それ以外の phase は止められないので何も送らない)。`release` して
   exit 130。`error` phase は message を出して `release`、exit 1。

### テスト (最小集合)

- `cli/src/autoupdate.test.ts` (fake の `/app/update`、送られた action を記録): (a) `--check` は開始 phase が
  `downloaded` / `installing` / `readyToRestart` でも `acquire`/`download`/`install`/`restart` を送らず exit 0。
  `--check` の確認結果が `error` なら `release` を送って exit 1。(b) 開始 phase `readyToRestart` なら check を
  送らず restart に進み、`cancelled` で exit 1 かつ restart を再送しない。`renew` が `owned: false` を返したら
  以後 control action を送らずに止まる
- react-gui `main/updater/cliLease.test.ts`: GUI の明示操作で解除された後、および別 owner が期限切れ後に取得した
  後に、旧 owner の `renew` / control action が `owned: false` / not-owner になり復活しない。
  `UPDATE_GET_STATUS` 相当の参照では解除されない
- react-gui `main/localApi/consoleEndpoint.test.ts` に `/app/update` の body 検査と action の dispatch
- react-gui `UpdateBridge`: `installRequestedBy: 'cli'` の `installing -> readyToRestart` では `UPDATE_RESTART` を
  送らず、`cliDriving` 中は `downloaded` で確認 dialog を出さない

### ドキュメント・検証

- `docs/architecture/local-api-server.md` に `/app/update`、`docs/architecture/auto-update.md` §7 に CLI 経路
  (`cliDriving` lease、`installRequestedBy`、開始 phase ごとの動作)。
- 手動確認は packaged build + `CUEMOL_UPDATE_FEED` のローカル feed で (auto-update.md §8): CLI 駆動中に GUI の
  確認 dialog / 自動再起動が出ないこと、保存確認を Cancel したとき CLI が exit 1 で終わり再実行で
  `readyToRestart` から再起動できること、GUI から始めた download 中に CLI を起動すると引き継ぐこと、CLI を kill
  した後 GUI に Restart to Update が出ること、CLI 駆動中に GUI で Check for Updates 等を押すと CLI が止まること、
  2 本目の `autoupdate` が busy で exit 1 になること、展開中・staged で `--check` が何も進めないこと。
