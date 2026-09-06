# umbreon レンダリングが renderer プロセスの降格で数倍遅くなる

tritium で「GI + soft shadow でレンダリングした後、一旦異常に遅くなると設定を
変えても遅いまま。アプリを再起動すると直る」という報告の調査記録と対策。**umbreon 側の
バグではなく**、Electron の renderer プロセスが OS の background 優先度に落とされたまま
戻らないことが原因。umbreon 側で見つかった無関係のバグは
`~/proj64/umbreon/docs/plans/known-issues-render-perf-and-leaks.md` (umbreon リポジトリ側)
を参照。

## 症状

- レンダラ種別 (isosurf/cartoon 等) に依存しない。
- GI なしの通常 ray tracing でも発生する。
- 遅くなった状態でも出力画像は正しく、画質も通常のレイトレース品質と変わらない
  (同じ計算をただ何倍も遅く実行しているだけの挙動)。
- 発生中も GUI 操作 (回転などの OpenGL 表示) は通常速度。
- 再現性が低い。意図的な再現操作 (animation 操作、multi-gradient 操作の再実行)
  では再現しなかった。

レンダリング本体は Electron のメインウィンドウ renderer プロセス内で、umbreon が
起こす `std::thread` + TBB `parallel_for` で実行される (`renderJob.service.ts`
→ `UmbreonBackend.beginInProcess` → C++ `beginRender`)。

## 原因の特定 (2026-08-11, macOS / Apple Silicon 8 threads)

TBB の合成ワークロード (`parallel_for` を繰り返すだけの CPU バウンドなプローブ)
と `taskpolicy` コマンドを使った制御実験:

| 実験 | 結果 |
|---|---|
| 通常状態のプロセスを `taskpolicy -b -p` で darwinbg 化 | **約 6 倍遅化** (460ms -> 2800ms、全スレッド PRI が `31T` -> `4T`)。報告された遅さと同スケール |
| darwinbg を `taskpolicy -B -p` で解除 | **即座に回復**。TBB ワーカーが darwinbg 中に生成された場合でも同じく回復 (スレッド生成タイミングは無関係) |
| darwinbg 状態で**起動**したプロセス (`taskpolicy -b <cmd>`) | `-B` でも回復しない (起動時 clamp)。ただし tritium は通常起動なので該当しない |
| メインスレッドだけ `QOS_CLASS_BACKGROUND` にして TBB ワーカープールを生成 | **遅くならない**。oneTBB ワーカーは親スレッドの pthread QoS を継承しない (PRI `31T` で生成される) |
| プロセス自身が `setpriority(PRIO_DARWIN_PROCESS, 0, 0)` で自己解除 | **効かない** (呼び出しは成功を返すが速度・PRI とも無変化) |

結論: 「スレッド生成時に QoS が継承されて固着する」という説は否定される。
6 倍級の遅化を発生・維持できるのは**プロセスレベルの background 優先度が掛かりっぱなしに
なるケースのみ**。macOS の task policy は external (他プロセスから適用) /
internal (自己申告) の 2 スロットを持ち、外部から掛けられた policy は
自プロセス内から打ち消せない (renderer プロセス自身の対策は原理的に不可能)。

## メカニズムの確認 (2026-09-06, Chromium / Electron / XNU ソース)

上の実験は「external darwinbg」で症状を再現したものだが、Chromium が実際に renderer を
降格する経路は別物だった。ソースで確認した事実:

### 降格の判定 (全 OS 共通)

- browser (= Electron main) プロセスの `RenderProcessHostImpl::UpdateProcessPriority`
  (`content/browser/renderer_host/render_process_host_impl.cc`) が
  `visible = visible_clients_ > 0 || HasSwitch(kDisableRendererBackgrounding)` で判定し、
  visible な RenderWidgetHost が 0 になると `Process::SetPriority(kBestEffort)` を子プロセスに
  適用する (`content/browser/child_process_launcher.cc`)。
- 再適用は `priority_` が変化したときだけ。復帰側 (`kUserBlocking`) の適用が何らかの理由で
  失敗すると Chromium から二度と掛け直されない = 「固着」の説明になる。
- Electron (macOS) がウィンドウの occlusion を hidden 扱いにする経路:
  `electron_ns_window_delegate.mm windowDidChangeOcclusionState` → `NotifyWindowHide` →
  `BrowserWindow::OnWindowHide` → `web_contents()->WasOccluded()`。トリガーは「他ウィンドウで
  完全に覆われる」「ディスプレイスリープ」「別 Space のフルスクリーンアプリへ切替」「最小化」など。

### プラットフォーム別の降格の実体

| OS | `Process::SetPriority(kBestEffort)` の実体 (Chromium `base/process/`) | occlusion → hidden の経路 | 備考 |
|---|---|---|---|
| macOS (`process_mac.cc`) | browser が子の task port に `TASK_CATEGORY_POLICY` role=`TASK_BACKGROUND_APPLICATION` と `TASK_SUPPRESSION_POLICY` {active, lowpri_cpu, timer_throttle=TIER_5, disk_throttle, suppressed_cpu, background_sockets} (App Nap と同じ効果を模倣) | Electron の `WasOccluded()` (上記) | XNU `osfmk/kern/task_policy.c`: `trp_sup_lowpri_cpu` → `tep_lowpri_cpu` → スレッド優先度 `MAXPRI_THROTTLE` (= 4)。**観測される `4T` は darwinbg でも suppression policy でも同じ見え方** |
| Windows (`process_win.cc`) | `SetPriorityClass(IDLE_PRIORITY_CLASS)` + EcoQoS (`SetProcessEcoQoSState`、feature `kUseEcoQoSForBackgroundProcess` 既定 ON。Win11 では効率コア / 低電力に固定) | Chromium 自身の `NativeWindowOcclusionTrackerWin` (`kCalculateNativeWinOcclusion` 既定 ON) → `RenderWidgetHostViewAura::HideImpl`。最小化も hidden | IDLE class は他の通常プロセスが動くと CPU をほぼ貰えないので、macOS より影響が大きい可能性がある |
| Linux (`process_linux.cc`, `base/posix/can_lower_nice_to.cc`) | `setpriority(PRIO_PROCESS, pid, 5)`。ただし `CanSetPriority()` = `CanLowerNiceTo(0)` で、root か `RLIMIT_NICE` の緩和がないと **false = 降格自体を行わない** | (該当なし) | 通常のデスクトップでは no-op |

### 当初の対策案 2・3 の訂正

- `taskpolicy -B -p <pid>` の実体 (`bsd/kern/kern_resource.c do_background_proc`) は
  `setpriority(PRIO_DARWIN_PROCESS, pid, 0)` = external `DARWIN_BG` ビットの解除のみ。
  `trp_sup_*` (suppression policy) には触らない。**Chromium が掛けた suppression policy は
  `taskpolicy -B` では解除できない** (上の実験で効いたのは `-b` が同じビットしか立てないため)。
  したがって「main から `taskpolicy -B` を実行する回復策」は、原因が別由来の external
  darwinbg だった場合にしか効かない保険であり、実装しない。
- `powerSaveBlocker.start('prevent-app-suspension')` の実体
  (`services/device/wake_lock/power_save_blocker/`): macOS は
  `IOPMAssertionCreateWithName(kIOPMAssertionTypeNoIdleSleep)`、Windows は
  `PowerCreateRequest(PowerRequestExecutionRequired)`、Linux は D-Bus の `Inhibit`
  (GNOME SessionManager suspend / org.freedesktop.PowerManagement)。**いずれもシステムの
  アイドルスリープ抑止であり、App Nap / task policy には作用しない**。長時間 GI レンダ中に
  マシンがスリープしない価値は独立にあるので、意味を訂正して実装した (ディスプレイは消えてよい)。
- `--disable-backgrounding-occluded-windows` (`kDisableBackgroundingOccludedWindowsForTesting`)
  は `WebContentsImpl` で OCCLUDED を VISIBLE に読み替えるだけ (page visibility 側) で、
  最小化 / Cmd+H (`WasHidden`) は覆わない。プロセス優先度は下記の switch だけで覆えるので使わない。

### 「VS Code や Slack の定番設定」の検証

GitHub code search (microsoft/vscode, Signal-Desktop, element-desktop, hyper, joplin,
bitwarden/clients, logseq, Rocket.Chat.Electron, jitsi-meet-electron, zulip-desktop, insomnia,
desktop/desktop, ferdium ほか 18 repo) で `disable-renderer-backgrounding` を使う OSS アプリは
**0 件** (ヒットは electron の docs のみ)。VS Code の `src/main.ts` `SUPPORTED_ELECTRON_SWITCHES`
にも無い。VS Code が使うのは:

- `webPreferences.backgroundThrottling: false` を**特定ウィンドウだけ**に (sessions / agents
  window: `windowImpl.ts` 「keep agents window responsive when in background」、
  `noBackgroundThrottling` 付き auxiliary window、content tracing window)。
- **処理中だけ** `webContents.setBackgroundThrottling(false)` にする job-scoped toggle
  (`chat.contribution.ts`: chat request 実行中は `setBackgroundThrottling(!running)`、
  main 側 `nativeHostMainService.ts`)。
- bitwarden / insomnia / Rocket.Chat も per-window `backgroundThrottling` のみ。Slack / Discord は
  closed source で確認不能 (Discord では利用者側の回避策として `--disable-renderer-backgrounding`
  が使われている報告がある程度)。

`backgroundThrottling: false` / `setBackgroundThrottling(false)` の実体は Electron の Chromium
patch `patches/chromium/disable_hidden.patch`: `RenderWidgetHostImpl::WasHidden()` (Win/Linux は
`RenderWidgetHostViewAura::HideImpl` も) を `disable_hidden_` で早期 return させ、RWH を hidden に
しない。結果 `visible_clients_` が減らず**プロセス優先度も下がらない**が、同時に page visibility /
rAF / timer throttling も止まる (occluded でも compositing が続く)。つまり VS Code 方式も
「RWH を hidden にしない」ことで間接的に同じ経路を塞いでいる。

### 方式の比較と選択

| | (A) `--disable-renderer-backgrounding` (採用) | (B) VS Code 方式: job 中だけ `setBackgroundThrottling(false)` |
|---|---|---|
| 塞ぐ経路 | `UpdateProcessPriority` の visible 判定 (プロセス優先度のみ) | RWH を hidden にしない (プロセス優先度 + page visibility / rAF / timer) |
| カバー範囲 | 常時 (idle 中の occlusion で降格 → 固着、も起きない)。全ウィンドウ・全 OS | job 実行中のみ。job 開始前に固着していた場合、Chromium が visible と思ったまま OS 側だけ固着していれば回復しない |
| 副作用 | hidden / 最小化中も renderer のプロセス優先度が通常のまま (page は hidden になるので rAF / timer は止まり、idle コストは零) | job 中は occluded でも compositing が続く。toggle は Electron 側で DelegatedFrameHost 周りの修正が続いている箇所 |

今回の症状はプロセス優先度そのもの (page は visible のまま、GUI は通常速度) なので、
その経路だけを常時塞ぐ (A) を採用した。(B) は render job guard (下記) に 1 行ずつ足せば
追加できる。

## 対策 (実装済み)

renderer プロセス内 (libcuemol2 / umbreon) からの自己修復は原理的に不可能なので、
対策は Electron の **main プロセス側**に置く。

1. **予防 (根本、全 OS)**: `tritium/react-gui/src/main/index.ts` が ready 前に
   `app.commandLine.appendSwitch('disable-renderer-backgrounding')` を掛ける。
   環境変数 `CUEMOL_RENDERER_BACKGROUNDING=1` を付けて起動すると Chromium の既定に戻る
   (A/B 検証・再現用。`[Main] CUEMOL_RENDERER_BACKGROUNDING set` とログに出る)。
2. **補助 (システムスリープ抑止 + 診断ログ)**: `tritium/react-gui/src/main/renderActivity.ts`。
   main window が `IPC.RENDER_WINDOW_STATE` で push する job 状態 (`context` 更新) を唯一の
   source of truth にし、job が active (`exporting` / `running` / `blending`、判定は
   `shared/renderJobStatus.ts`) になった立ち上がりで `powerSaveBlocker.start('prevent-app-suspension')`
   と `[Main] render job active: renderer pid=NNNN powerSaveBlocker=K` のログ、立ち下がり
   (`done` / `error` / `cancelled` / `job: null` / main window の reload・close) で `stop()` と
   `[Main] render job idle` のログ。movie の progress tick では再武装しない。
3. **回復 (`taskpolicy -B`)**: 取り下げ (上記「訂正」参照)。次回発生時の手動切り分け手順に残す。

## 次回発生時の確認・切り分け (sudo 不要)

`taskinfo` は root 必須、`launchctl procinfo` は policy を出さないので、以下で切り分ける。

```sh
# 1. renderer の PID は main のログ ([Main] render job active: renderer pid=NNNN)。
#    無ければ Activity Monitor で CPU を食っている "Electron Helper (Renderer)"。

# 2. スレッド優先度を確認: PRI が 4T なら throttle 確定 (正常は 31T)
ps -M -p <pid> | head -5

# 3. switch あり (既定) で 4T なら Chromium の可視性経路以外が原因。
#    external darwinbg かどうかは taskpolicy -B で切り分けられる:
taskpolicy -B -p <pid>
#    -> 戻れば別由来の external DARWIN_BG。
#    -> 戻らなければ suppression policy (Activity Monitor > Energy タブの「App Nap」列が
#       Yes) か、メモリ圧 / スワップ (footprint <pid> / vm_stat)。

# 4. A/B: CUEMOL_RENDERER_BACKGROUNDING=1 で起動し、レンダ中にウィンドウを完全に覆う
#    (または最小化 / ディスプレイスリープ) と 4T に落ち、露出で 31T に戻るのが Chromium の既定。
#    戻らなければ固着の再現。

# 5. render job 中の powerSaveBlocker は pmset で見える (job 中だけ tritium のエントリが出る)
pmset -g assertions | grep -A1 PreventUserIdleSystemSleep
```

Windows はタスクマネージャー「詳細」の基本優先度 (Idle) と「効率モード」(EcoQoS) で同等の
確認ができる。Electron の major bump 後は switch が静かに無効化されていないか、手順 4 の A/B を
再実行して確認する。

## 参照したソース

- Chromium `base/process/process_mac.cc` / `process_win.cc` / `process_linux.cc`,
  `base/posix/can_lower_nice_to.cc`
- Chromium `content/browser/renderer_host/render_process_host_impl.cc`,
  `content/browser/child_process_launcher.cc`, `child_process_launcher_helper_mac.cc`,
  `content/browser/web_contents/web_contents_impl.cc`, `ui/base/ui_base_features.cc`
- Chromium `services/device/wake_lock/power_save_blocker/power_save_blocker_{mac,win,linux}.cc`
- Electron `shell/browser/api/electron_api_browser_window.cc`, `electron_api_web_contents.cc`,
  `shell/browser/ui/cocoa/electron_ns_window_delegate.mm`, `shell/browser/native_window_views.cc`,
  `patches/chromium/disable_hidden.patch`
- XNU `osfmk/kern/task_policy.c`, `bsd/kern/kern_resource.c`
- VS Code `src/main.ts`, `src/vs/platform/windows/electron-main/windows.ts` / `windowImpl.ts`,
  `src/vs/platform/native/electron-main/nativeHostMainService.ts`,
  `src/vs/workbench/contrib/chat/electron-browser/chat.contribution.ts`
- Electron docs: command-line-switches, BrowserWindow `backgroundThrottling`,
  `webContents.setBackgroundThrottling`, powerSaveBlocker; https://ss64.com/mac/taskpolicy.html
