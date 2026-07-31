# ADR-0043: Movie render output location and temporary-file lifetime

- Status: accepted (host E2E verified 2026-07-29: 設定なしで Start / 設定の復元 /
  stale frame の掃除 / ffmpeg 事前チェック)
- Date: 2026-07-29
- Mapping rows: [`dialog.anim-render`](../mapping/other_dlgs.md)

## Context

静止画レンダリングは設定なしで動く。`renderJob.service.ts` が
`os.tmpdir()/cuemol-render-XXXX` を掘ってそこに `render.png` を書き、ユーザーは
欲しければ Save ボタンでファイルに出す。

一方 movie モードは `MovieSettings.outputDir` が必須で、既定値は空文字だった。
空のまま Start すると worker が `"No output folder is set"` で失敗する。さらに
Rendering window は閉じるたびに破棄されるため、フォルダも base name も frame rate
も format も**毎回入力し直し**になっていた。UXP の `anim-render-dlg.js` は
`cuemol2.ui.animrender.output-path` などの prefs に保存していたので、parity も
落ちていた。

同時に、既存の frame PNG が残ったフォルダにレンダすると結果の movie がおかしく
なる、という報告があった。調査の結果、原因は 2 つある (Decision 5)。

## Decision

**出力先の既定を app 管理の一時フォルダにし、ユーザー指定は任意のオーバーライドに
格下げする。** そのうえで、一時フォルダ内の中間ファイル (frame PNG) と最終ファイル
(movie) に別々の寿命を与え、アプリ起動時にのみ掃除する。実装は
`tritium/react-gui/src/main/movieOutput.ts` と `renderer/hooks/useMovieOutputPrefs.ts`。

### Decision 1: 出力先

`<os.tmpdir()>/cuemol-movies/session-XXXXXX/` を 1 app run につき 1 つ作り
(`getSessionMovieDir()`, mkdtemp + `.cuemol-session.json`)、`IPC.RENDER_MOVIE_TEMPDIR`
で Rendering window に渡す。still の work dir / render history と同じ
`os.tmpdir()` 配下に置くのは、「一時的なもの」という意味づけを揃えるためと、
最悪 OS 側の掃除も効くため。

`MovieSettings` には `useTempDir: boolean` を足すが、**`outputDir` は常に解決済みの
実パス**にする。`useTempDir` は「誰がそのファイルを消してよいか」の所有権フラグで
あって解決ロジックではない。この分離により worker (`startAnimJob` /
`startEncodeOnlyJob`)、`RENDER_FRAMES_CHECK` / `RENDER_FRAMES_CLEANUP` /
`RENDER_FRAME_READ`、snapshot・render history は一切変更せずに済んだ。

### Decision 2: 中間ファイルと最終ファイルの寿命

frame PNG と movie は価値と大きさが桁違いなので、同じ寿命を与えない。frame は
「再エンコード専用の巨大な中間物」、movie は「小さな成果物」。

| | app 実行中 | アプリ終了時 | 次回起動時の sweep |
|---|---|---|---|
| **frame PNG** (一時フォルダ) | 削除しない | 削除しない | 各ファイルの mtime が **24h** 超なら削除 |
| **movie file** (一時フォルダ) | 削除しない | 削除しない | mtime が **30 日**超、または movie を持つ session が **10 件**を超えた分を古い方から session dir ごと削除 |
| movie を持たない session dir | — | — | frame 削除後に残りが 24h 超なら dir ごと削除 |
| **ユーザー指定フォルダ** | 自動削除なし | 自動削除なし | **一切触らない** |

**アプリ終了時に削除しない**のが still の render history
([ADR-0035](ADR-0035-render-window.md) §temp/work-dir) との決定的な違い。still は
数十秒で描き直せるので `will-quit` で全消しして構わないが、animation は数時間かかり
うる。保存し忘れて終了しただけで消えるのは受け入れられない。

寿命の判定は session dir の mtime ではなく**各ファイル自身の mtime**で行う。dir
mtime を使うと、stale frame を消した時点で dir mtime が「今」に更新され、そこに
入っている movie の 30 日タイマーがリセットされてしまうため。

実行中の即時削除手段は既存の **Clean up** ボタン (`RenderPanel.tsx`) がそのまま担う。

### Decision 3: 同時起動インスタンスの保護

sweep は `.cuemol-session.json` の `pid` を読み、`process.kill(pid, 0)` で生きて
いれば **その session dir を丸ごと skip** する (EPERM は「他ユーザー所有で生存」
として alive 扱い)。これがないと、昨日から動かしっぱなしのインスタンス A の
レンダ中の frame を、今日起動したインスタンス B の sweep が消しうる。

### Decision 4: 成果物の取り出し口 (Save movie as...)

既定の出力先を一時フォルダにする以上、成果物を sweep の外へ出す手段が必須になる。
`IPC.RENDER_MOVIE_SAVE` と `RenderResultPane` のボタンを追加した。既存の Save は
PNG (静止画 / frame) 専用で、movie には Open / Reveal しかなかった。frame 側には
同等物を用意しない — frame は成果物ではなく再エンコードの入力だから。

### Decision 5: encode の成否判定と stale frame

報告されたバグの原因は 2 つで、どちらも本 ADR の範囲で潰した。

**(A) encode の成否を誰も確認していなかった。** `pollEncode` は ProcessManager の
状態が QUEUED/RUNNING を抜けた時点で無条件に成功として `complete` を emit していた。
`qlib::LProcMgr` は exit code を公開していない (`src/qlib/LProcMgr.hpp:128` の
`PM_QUEUED / PM_RUNNING / PM_ENDED / PM_UNKNOWN` のみ) ため、ffmpeg が失敗しても
検出できない。同名・同フォーマットの movie が前回レンダの分として残っていると、
`-y` は失敗時にそれを消さないので、UI は成功と表示し Open movie は**前回の古い
動画**を開いていた。

→ 迂回策として **「encode 前に出力先の movie を削除 → タスク終了後に存在確認」**
で成否を判定する (`startEncode` / `pollEncode`)。exit code が取れない以上、
「このレンダが書いたファイルがそこにあるか」が唯一信頼できる証拠になる。still 側が
`fs.accessSync(outputPath)` で成果物を確認しているのと同じ扱い。

**(B) 出力フォルダを開始前に掃除していなかった。** 前回より短い animation を
レンダすると `<base>_frm_NNNN.png` の末尾が古いまま残る。`RENDER_FRAMES_CHECK` は
0 から連続する枚数を数えるだけなので `availFrames` が古い枚数に膨らみ、Re-encode で
新旧の混ざった動画ができる。前回と画像サイズが違えば ffmpeg の image2 demuxer が
サイズ変化で abort し、(A) 経由で古い動画が「成功」として提示される。

→ `startAnimJob` が開始前に `purgeMovieArtifacts()` で当該 base name の frame と
movie を削除する。マッチ規則は `shared/movieFrames.ts` の `frameFileRegExp()` /
`movieFileNames()` に集約し、main 側の `RENDER_FRAMES_CLEANUP` と同一実装を共有する。
ユーザー指定フォルダの場合のみ、Start 前に確認ダイアログを出す (一時フォルダでは
出さない — 毎回聞くのは今回解消したかった設定負担そのもの)。

**(C) ffmpeg の事前チェック。** 従来 `shouldEncode` はパス未設定なら黙って encode を
スキップし、パスが設定済みで実体が無い場合は**全 frame を描き終えた後**に失敗して
いた。`resolveFfmpeg()` を `startAnimJob` の冒頭で呼び、1 frame も描く前に失敗させる
(POV-Ray / blendpng の既存の存在チェックと同じ扱い)。未設定も明示エラーにした —
「frame だけ描いて movie は作らない」は Encode movie スイッチ off が担う。

### Decision 6: レンダは `startcam` を上書きしない

`startAnimJob` は `setupRender` の前に無条件で `animMgr.startcam = "__current"` と
していた。Animation panel の start camera (`animSetStartCam`) で選んだカメラが
**常に無視され**、しかも `startcam` は AnimMgr の scriptable property なので
`writeTo2` 経由で qsc にも書かれる。`AnimMgr::stop()` の `restoreProps()` が戻すのは
PropAnim が保存した対象プロパティだけで `m_startCamName` は対象外なので、一度
レンダすると**ユーザーの設定が `__current` に置き換わったまま残る**。

元々この代入があったのは、`AnimMgr::startImpl()` が start camera 未設定時に
`m_pTgtView` → `pScene->getActiveView()` の順にフォールバックし、オフライン
レンダではどちらも無いために `MB_NEW Camera()` (無意味な既定カメラ) を作って
しまうため (`src/qsys/anim/AnimMgr.cpp:148-164`)。

→ `overrideStartCamForRender()` を導入し、**ユーザーの選択をそのまま使う**。
差し替えるのは (a) 未設定、または (b) 指定カメラが scene に存在しない場合だけで、
その場合も `renderStart` が捕捉した `__current` を一時的に使い、`stopAnim()` で
**元の名前に戻す** (完了・エラー・キャンセルの全経路が `stopAnim` を通る)。
`__current` 自体が作れなかった場合は何も書き換えない — 存在しないカメラ名で
ユーザーの設定を潰さないため。再生側 (`animation.service.ts` の `play` /
`ensureStartCam`) は元から「空のときだけ入れる」で正しかったので変更なし。

## Consequences

**得られるもの**

- movie レンダが still と同じく「開いて Start」で動く。設定は任意になった。
- 設定 (folder / base name / fps / format / bitrate / temp フラグ) が `UiState.movieRender`
  に永続化され、UXP の prefs parity が回復した。
- 数時間のレンダ成果がアプリ終了で消えない。
- ffmpeg 失敗が「成功」として報告されなくなり、古い movie が新しい結果に化ける経路が
  消えた。
- ffmpeg 不在が全 frame 描画後ではなく開始前に分かる。
- Animation panel で選んだ start camera がレンダに効くようになり、レンダが scene の
  `startcam` を書き換えて (qsc にまで) 残すこともなくなった。

**代償・制約**

- アプリ再起動を挟んで 24h 経つと一時フォルダの frame が消え、Re-encode できなく
  なる (movie は残る)。frame を長期保持したければ Custom フォルダを選ぶ。
- 一時フォルダは Finder から見つけにくい場所にある。Reveal / Save movie as... が
  その導線。
- macOS の `/var/folders` は OS 自身も古いファイルを掃除しうるので、一時フォルダの
  movie が 30 日より早く消える可能性はある。「一時」と明示しているので許容する。
- Stop したレンダは部分列を残す。次回 Start 時の purge と (custom フォルダなら)
  確認ダイアログでカバーされるが、cancel 時に掃除するかは未決。
- 起動時の sweep は `readdir` + ファイルごとの `stat` を行う。session 数は 10 件
  程度に抑えられるので実測上の負荷はないが、無制限ではない点は認識しておく。

## Notes

- 実装
  - `tritium/react-gui/src/main/movieOutput.ts` — `getSessionMovieDir()` /
    `sweepMovieSessions(root, now)` / `sweepMovieOutputs()`、TTL 定数
  - `tritium/react-gui/src/main/index.ts` — `app.whenReady()` 内で
    `sweepMovieOutputs()`。`will-quit` には**足していない** (Decision 2)
  - `tritium/react-gui/src/main/renderWindowIpc.ts` — `RENDER_MOVIE_TEMPDIR` /
    `RENDER_MOVIE_SAVE` handler、cleanup の matcher を shared helper に置換
  - `tritium/react-gui/src/shared/movieFrames.ts` — `resolveMovieBaseName()` /
    `frameFileRegExp()` / `movieFileNames()` / `ANY_FRAME_FILE_RE`
  - `tritium/react-gui/src/renderer/hooks/useMovieOutputPrefs.ts` — 解決と永続化
  - `tritium/react-gui/src/renderer/components/panels/MovieSettingsPanel.tsx` —
    Location の `RadioField` + 一時フォルダの注記 (`SegmentField` だと pane 内に
    Image/Render タブがもう 1 段あるように読め、`SwitchField` だと二択ではなく
    on/off に読めるため、設定としての「二者択一」= radio にした)
  - `tritium/react-gui/src/renderer/worker/server/services/renderJob.service.ts` —
    `purgeMovieArtifacts()` / `resolveFfmpeg()` / `startEncode` / `pollEncode` /
    `overrideStartCamForRender()` + `stopAnim()` の restore
- テスト
  - `__test__/mainMovieOutput.test.ts` — 寿命ルール、pid 保護、root 外不干渉
  - `__test__/useMovieOutputPrefs.test.ts` — 既定解決と永続化の payload 形状
  - `__test__/renderJobAnimation.test.ts` — stale frame purge、encode 失敗検出、
    ffmpeg 事前チェック、start camera の尊重と復元 (完了 / cancel / setup 失敗)
  - `__test__/renderSettingsPane.test.tsx` — Location radio、
    一時 / 指定フォルダの readOnly と invalid
- UXP 参照: `uxp_gui/cuemol2/base/content/anim/anim-render-dlg.js:14-17`
  (prefs キー)、`:66-82` (復元)、`:261` / `:686` (保存)
- 関連 ADR: [ADR-0035](ADR-0035-render-window.md) (Rendering window と
  render history の temp 設計)、[ADR-0040](ADR-0040-animation-rendering.md)
  (animation rendering 本体)
- 積み残し: POV-Ray の per-frame 中間物 (`workDir/fNNNNN/{render.pov,render.inc,
  render-layer*.png}`) は job 終了まで消えない。UXP は task 完了ごとに消していた
  (`anim-render-dlg.js:384-392`)。900 frame では /tmp を大きく圧迫するので別途対応。
