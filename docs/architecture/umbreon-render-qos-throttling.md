# umbreon レンダリングが renderer プロセスの darwinbg 降格で数倍遅くなる (macOS)

tritium で「GI + soft shadow でレンダリングした後、一旦異常に遅くなると設定を
変えても遅いまま。アプリを再起動すると直る」という報告の調査記録。**umbreon 側の
バグではなく**、Electron の renderer プロセスが macOS の背景タスクポリシー
(darwinbg)に落とされたまま戻らないことが原因と特定した。umbreon 側で見つかった
無関係のバグは `~/proj64/umbreon/docs/plans/known-issues-render-perf-and-leaks.md`
(umbreon リポジトリ側)を参照。

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
6 倍級の遅化を発生・維持できるのは**プロセスレベルの darwinbg が掛かりっぱなしに
なるケースのみ**。macOS の task policy は external (他プロセスから適用) /
internal (自己申告) の 2 スロットを持ち、外部から掛けられた darwinbg は
自プロセス内から打ち消せない (renderer プロセス自身の対策は原理的に不可能)。

Chromium は renderer プロセスの task policy を occlusion / App Nap と連動して
上下させる。「何らかのきっかけで darwinbg に落ち、解除ロジックが働かないまま
残る」と仮定すると、症状 (プロセス内で固着・レンダラ/設定に無関係・再起動で
回復・再現条件が絞り込めない低頻度) と完全に一致する。

## 次回発生時の確認・その場での回復 (sudo 不要)

```sh
# 1. レンダリング中に CPU を使っている renderer プロセスの PID を特定
#    (Activity Monitor で "Electron Helper (Renderer)" のうち CPU を食っているもの)

# 2. スレッド優先度を確認: PRI が 4T なら darwinbg 確定 (正常は 31T)
ps -M <pid> | head -5

# 3. 外部から task policy を解除 -- 速度が戻れば原因確定、かつその場で回復できる
taskpolicy -B -p <pid>

# 4. 戻らなければ原因は darwinbg ではない (メモリ圧/スワップ側を疑う: footprint <pid> / vm_stat)
```

## 対策 (未実装。優先度順)

renderer プロセス内 (libcuemol2/umbreon) からの自己修復は上記の通り原理的に
不可能なので、対策は Electron の **main プロセス側**に置く。

1. **予防 (最有力)**: main の起動時に Chromium の renderer 降格そのものを止める。
   ```ts
   app.commandLine.appendSwitch('disable-renderer-backgrounding')
   app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
   ```
   VSCode や Slack など、renderer で重い処理を行う Electron アプリの定番設定。
2. **予防 (補助)**: レンダリングジョブの実行中だけ
   `powerSaveBlocker.start('prevent-app-suspension')` で App Nap を抑止し、
   ジョブ終了時に `stop()` する。
3. **回復 (保険)**: main プロセスがレンダリング開始時に
   `taskpolicy -B -p <renderer pid>` を実行する。pid は
   `webContents.getOSProcessId()`。main は renderer とは別プロセスなので
   external スロットを解除できる (上記実験で実証済み)。darwinbg 検知ログを
   兼ねられる。

1 の効果を実機 (Electron renderer, 実際の umbreon レンダリング) で検証していない
点に注意。次に着手する場合はまずここから。
