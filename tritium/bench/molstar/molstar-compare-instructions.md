# 作業指示: Mol* との比較ベンチマーク(MD トラジェクトリ再生)

## 目的

論文の 5.6 節で使うデータを取る。**同じ MD トラジェクトリを、同じ機体、同じ Chromium、同じ描画条件で CueMol3 と Mol\* に再生させ**、次の 3 点を比べる。

1. **再生性能**:update fps(新しいトラジェクトリのフレームが画面に出た回数/秒)、render fps、フレーム時間の p95
2. **読み込み**:ディスク上のファイルから最初の描画までの時間
3. **メモリ**:トラジェクトリの長さに対するメモリの伸び方と、読み込めなくなる点

論文での主張は「Mol\* は全フレームを JS のメモリに展開するので、メモリがトラジェクトリの長さに比例する。CueMol3 は遅延デコードとキャッシュの上限で一定に保つ」。3 の結果がこの主張の中心になる。

Mol\* を不利に見せる設定を探す作業ではない。Mol\* 側は、ユーザーが普通に得られる最良の条件で動かすこと。迷ったら Mol\* に有利なほうを選び、その選択を記録する。

---

## 0. 事前に分かっていること(コードで確認済み、molstar master `89038ea`、v5.11.0)

- **読み込み**:`loadTrajectory`(`src/extensions/plugin/loaders.ts`)は、トポロジと座標ファイルを読み、`TrajectoryFromModelAndCoordinates` でトラジェクトリを作る。
  - 対応形式:GRO と PDB(トポロジ)、XTC、DCD、TRR(座標)
- **XTC**:`src/mol-io/reader/xtc/parser.ts` は、ファイル全体をデコードし、全フレームを `Float32Array` として保持する。
- **DCD**:ファイル全体をメモリに載せ、フレームごとのビューを作る。
- **フレームを切り替えると幾何を作り直す**:`src/mol-repr/structure/units-visual.ts` で、`Unit.areConformationsEqual` が偽になると `updateState.createGeometry = true` になる(169 行付近)。フレームごとに JS で幾何を作り直して GPU に送り直す、という仮説になる。§5 のプロファイルで大きさを確かめる。
- **再生**:`AnimateModelIndex`(`src/mol-plugin-state/animation/trajectory.ts`)の `duration: 'sequential'` は 1 回の適用で 1 フレーム進める(`maxFps` は最大 60)。`mode: 'palindrome'` で往復する。CueMol の md-playback(表示 1 フレームごとに 1 フレーム進み、往復する)に最も近い。
- **描画の通知**:`canvas3d.didDraw`(描画ごとに発行)と `canvas3d.commited` がある。

作業の始めに、使う Mol\* のバージョンで上の各点がまだ成り立つことを確認し、報告に書くこと。

---

## 1. 比べる対象と条件

### 1.1 環境をそろえる

| 項目 | 方針 |
|---|---|
| 機体 | Apple M2(これまでと同じ機体) |
| Chromium | **CueMol3 と同じ Electron バージョン**で Mol\* を動かす。`tritium/react-gui/package.json` からバージョンを読み、同じものを入れる |
| Mol\* | npm の `molstar@5.11.0`(または作業時点の最新の安定版)。バージョンを固定して記録する |
| GPU の経路 | 両方とも ANGLE-Metal。CueMol の main が設定している Chromium のコマンドラインスイッチ(ANGLE、GPU 関連)を調べ、Mol\* 側の Electron にも同じものを渡す。結果に `UNMASKED_RENDERER_WEBGL` を記録し、両者で一致することを確認する |
| ウィンドウとキャンバス | CueMol の結果 JSON にあるキャンバスの実寸(デバイスピクセル、1832x1010)に、Mol\* の `gl.drawingBufferWidth/Height` を合わせる。Mol\* の UI パネルは全部閉じ、ビューポートだけにする。Mol\* の `pixelScale` などで解像度が下げられていないことを実測値で確認する |
| 入力 | どちらもマウスやキーの入力が描画に入らないようにする。Mol\* 側は canvas に `pointer-events: none` を付ける(ホバー時のハイライト描画を防ぐ) |
| プロセス | 1 セル 1 プロセス。セルごとに Electron を起動し直す |
| 実行順 | 繰り返しの回ごとに、ツールとセルの順番をシャッフルする |
| 繰り返し | 3 回 |

### 1.2 描画をそろえる

| 項目 | CueMol3 | Mol\* |
|---|---|---|
| 表現 | cpk(全原子) | spacefill(全原子)を 1 つだけ。**既定のプリセットは使わない**。大きい構造では自動で point 表示や低品質に切り替わり、水は別の表現になるため |
| 描画する原子 | ファイルの全原子(水素と水を含む) | 同じ。`ignoreHydrogens: false`、水も同じ spacefill に入れる |
| 品質 | 既定 | `quality` を固定する(`'auto'` にしない)。impostor が使われているかを記録する |
| 後処理 | AO なし、jitter なし、AA なし(ハーネスで固定済み) | 全部切る:occlusion、outline、shadow、antialiasing、multiSample(temporal)、illumination。どれかが残ると、何も変わらないときにも描画が続く |
| カメラ | 構造に fit させ、静止(md-playback は視点を動かさない) | 構造全体に fit させて(`managers.camera.reset()` など)静止させる |
| 色 | 既定 | element-symbol(色の違いは性能にほぼ影響しないが、記録する) |

**描画内容の確認**:各データセットのフレーム 0 で、両ツールのスクリーンショットを保存し、並べた画像を作る(SI に載せる)。描画した原子数も両ツールから取り出して比べる(Mol\* は structure の elementCount、CueMol は描画インスタンス数)。

**idle の自己検査**:Mol\* 側にも idle セル(読み込んだ後に何もしない)を作り、描画が 0 回であることを確かめる。後処理が残っていないことの確認になる。

### 1.3 データセット

MD データセット(`md-corpus.json`)をそのまま使う。**両ツールは SHA-256 の一致した同じファイルを読む。**

| セル | 原子数 | 形式 | 用途 |
|---|---:|---|---|
| ifabp | 12,445 | PDB + DCD(little-endian に変換した版) | 小規模 |
| yiip | 111,815 | GRO + XTC、900 フレーム | 中規模。長さを変える掃引にも使う |
| mcv448 | 161,188 | PDB + XTC、300 フレーム | 中規模 |
| a4tail-all | 3,940,938 | GRO + XTC、100 フレーム | 大規模、全原子 |
| **a4tail-nosol** | 348,642 | **水を除いて書き出したファイル**(新規に作る) | 大規模。描画の負荷をそろえて比べる |

**a4tail-nosol を作る**(§2.1):

Mol\* には読み込み時に原子を選ぶ機能がない。そこで、水(SOL)を除いた GRO と XTC を前処理で作り、**両ツールに同じファイルを読ませる**。これでエンジン同士を、同じデータ量で比べられる。

- CueMol の `loadSelection`(元のファイルから水を除いて読む)は、この比較とは別に、CueMol だけのセルとして残す。論文では「Mol\* ではファイルの前処理が要る操作を、CueMol は読み込み時に行える」として別に扱う。

### 1.4 CueMol3 側の条件

- **lazy(既定、ユーザーが得る状態)**:既存の md-playback のスペックを使う。
- **eager(`lazy: false`)**:全フレームを最初にデコードする。Mol\* と同じ戦略なので、読み込み方式の差とエンジンの差を切り分けるのに使う。yiip と a4tail-nosol だけでよい。
- CueMol のコミットは、`bench/perf-harness` の現在の HEAD(`6ab2e9d8` 以降)に固定し、SHA を記録する。

### 1.5 Mol\* 側の再生方法

主条件は、Mol\* の組み込みの再生方法を使う。ユーザーが得るものに一番近いので。

```ts
plugin.managers.animation.play(AnimateModelIndex, {
  mode: { name: 'palindrome', params: {} },
  duration: { name: 'sequential', params: { maxFps: 60 } },
});
```

- **update fps**:`ModelFromTrajectory` のセルの `modelIndex` が変わり、かつその後に `didDraw` が発行された回数 ÷ 経過秒。適用されたが描画されなかったフレームは数えない。
- **render fps とフレーム時間**:`didDraw` の間隔から求める。
- **warmup と計測時間**:CueMol と同じ(2 s + 6 s)。
- CueMol は「1 回目の表示」と「再表示」を分けて報告している。Mol\* は全フレームを読み込み時にデコードするので、区別はない。比べるときは、CueMol の値として cold(1 回目の表示だけ)と全体の両方を載せる。

---

## 2. 準備

### 2.1 派生ファイルを作る

`fetch-md.py` と `md-corpus.json` の仕組み(`derived` と SHA-256)に沿って追加する。

1. **a4tail-nosol**:a4tail の GRO と XTC から、残基名 SOL を除いたファイルを作る。
   - MDAnalysis か mdtraj を使う。XTC の精度は元のファイルと同じにする。
   - 原子数が 348,642 になることを確認する。CueMol の `loadSelection` の結果と一致するはず。
   - イオン(NA、CL)を残すかどうかは、CueMol の `loadSelection` のスペックと同じ選択にそろえる。
2. **長さを変えた版**(§4 のメモリ掃引用):
   - yiip:先頭の 100 / 300 / 900 フレーム
   - a4tail-nosol:先頭の 25 / 50 / 100 フレーム
   - 可能なら、元の a4tail から 200 / 400 フレームを追加で取得する(`fetch-md.py` の `xtcFrames` で指定する)。ディスクを 3〜6 GB 使う。Mol\* の限界を測るのに使う(§4)。
3. 全派生ファイルの SHA-256 を `md-corpus.json` の `derived` に記録する。作成スクリプトもリポジトリに入れる。

### 2.2 Mol\* 側のハーネスを作る

`bench/perf-harness` から切ったブランチ `bench/molstar-compare` に、`tritium/bench/molstar/` として作る。

- **最小の Electron アプリ**:1 ウィンドウに Mol\* の viewer を読み込む(npm パッケージのビルド済みバンドル)。
- **ファイルの渡し方**:Electron の `protocol.handle` で独自スキーム(例 `bench://`)を作り、ローカルファイルを返す。Mol\* からは URL として読む(`model-url` / `coordinates-url`)。ネットワークは介さない。
- **スペック**:CueMol のスペックと同じ JSON を読み、セルを 1 つ実行して結果を書き出して終了する(CueMol の `--bench` と同じ流れ)。
- **結果**:CueMol と同じ列名にそろえた JSON/CSV。`tool` 列で区別する。
- **実行**:`run.js` を拡張するか、同じ形の `run-molstar.js` を作る。ツールの間でセルの順番をシャッフルできるようにする。

---

## 3. 計測項目(両ツール共通)

| 指標 | 定義 | 取り方 |
|---|---|---|
| `load_ms` | 読み込みを始めてから、最初のフレームが描画されるまで | CueMol は既存の値。Mol\* は `loadTrajectory` を呼ぶ直前から、表現の commit 後の最初の `didDraw` まで |
| `update_fps` | 新しいトラジェクトリのフレームが画面に出た回数/秒 | §1.5 |
| `render_fps`、フレーム時間の平均と p95 | 描画の間隔 | CueMol は既存の値、Mol\* は `didDraw` の間隔 |
| **メモリ** | 全プロセスの RSS の合計と、プロセス種別ごとの内訳(browser / renderer / GPU) | **両ツールとも main プロセスで `app.getAppMetrics()` を使う**。読み込み直後と計測中の最大値を記録する |
| JS ヒープ | renderer の JS ヒープ | CDP の `Runtime.getHeapUsage`(`webContents.debugger`)。TypedArray の実体はヒープの外にあるので、取れる項目(外部メモリなど)があれば一緒に記録し、何を測っているかを REPORT に明記する |
| 失敗 | クラッシュ、メモリ不足、タイムアウト | `render-process-gone` の理由、エラーメッセージ、そこまでの時間を記録する。読み込みのタイムアウトは 10 分とする |

**使わない指標**:内部の時間(CueMol の update ms、Mol\* の state update の時間)は、測っている範囲が違うので、ツールの間では比べない。§5 のプロファイルでだけ使う。

---

## 4. 実行する組み合わせ

### 4.1 再生性能と読み込み(主表)

| セル | CueMol lazy | CueMol eager | Mol\* |
|---|:-:|:-:|:-:|
| ifabp | ✓ | – | ✓ |
| yiip | ✓ | ✓ | ✓ |
| mcv448 | ✓ | – | ✓ |
| a4tail-nosol | ✓ | ✓ | ✓ |
| a4tail-all | ✓ | – | ✓ |
| a4tail + loadSelection(元のファイル) | ✓ | – | (該当なし) |
| idle(yiip で) | ✓ | – | ✓ |

3 回ずつ繰り返す。

### 4.2 メモリとトラジェクトリの長さ(論文の中心)

長さを変えたファイル(§2.1)で、`load_ms`、RSS の最大値、update fps を取る。

| データセット | フレーム数 | CueMol lazy | Mol\* |
|---|---|:-:|:-:|
| yiip | 100 / 300 / 900 | ✓ | ✓ |
| a4tail-nosol | 25 / 50 / 100 | ✓ | ✓ |
| a4tail(元、全原子) | 100 / 200 / 400(取得できた分) | ✓ | ✓ |

- Mol\* が落ちる、または 10 分以内に読み込みが終わらない長さが出たら、それより長い条件は Mol\* では実行しない。**落ちた点そのものが結果である。**
- 空きメモリが減るとシステム全体が不安定になりうるので、大きいセルの前後で 30 s 休ませ、スワップの使用量も記録する。

---

## 5. Mol\* のフレーム切り替えのプロファイル

yiip と a4tail-nosol について、再生中に CDP の `Profiler`(または Tracing)で 5 秒程度プロファイルを取る。自己時間を次の分類で集計する。

- 幾何の作り直し:`createGeometry`、spacefill/sphere の builder など
- 構造の作り直し:Model、Structure、Unit の生成
- GPU へのアップロード:`bufferData`、`bufferSubData`、`texImage2D`、`texSubImage2D` の呼び出し回数とバイト数。WebGL の呼び出しに薄いラッパーを被せて数えてよい。**CueMol の glProxy と同じ数え方にする**
- 描画
- GC

同じ条件の CueMol 側の値(worker の CPU ms、crdSend、texUpload)と並べて、1 フレームあたりに GPU へ送るバイト数を比べる。

- CueMol:座標だけを送る(348,642 原子 × 12 B = 約 4.2 MB)
- Mol\*:予想では、幾何全体を送り直している

プロファイルを取ったセルの数値は主表に使わない(計測のオーバーヘッドが入るため)。

---

## 6. 確認事項

### 6.1 必須(満たさなければ比較が成り立たない。外れたら止めて報告する)

1. **同じファイルを読んでいる**:両ツールが読んだファイルの SHA-256 が一致する。
2. **同じ描画条件である**:
   - キャンバスの実寸が一致する
   - 描画した原子数が一致する
   - Mol\* の後処理が全部切れている(idle で描画が 0 回)
   - `UNMASKED_RENDERER_WEBGL` が一致する
3. **バージョンが固定されている**:Electron、Mol\*、CueMol のコミットを記録している。

### 6.2 診断(止めない。値と考えられる原因を REPORT に書く)

- CueMol 側の値と、既存の MD-RESULTS.md の値との差。環境が違うので一致しなくてよいが、20% を超えるずれがあれば、温度・電源・バックグラウンド処理を確認する。
- 繰り返しのばらつき(平均と SD を表に出す)
- 描画内容の比較画像での見た目の差(球の大きさ、色)。性能に効きそうな差があれば書く。

---

## 7. 成果物

1. `tritium/bench/results/molstar-compare-m2-<date>/`
   - 全セルの生の JSON/CSV
   - `summary.csv`:ツール × セル × 条件の平均と SD
2. `tritium/bench/molstar/`:Mol\* のハーネス、派生ファイルの作成スクリプト、実行スクリプト
3. 図(matplotlib、PDF と PNG、白背景、sans-serif 8〜9pt 相当)
   - **Fig A**:update fps と原子数の関係(x は log)。CueMol lazy は実線、CueMol eager は破線、Mol\* は別の色。失敗したセルは × で示す。60 fps の線を入れる。
   - **Fig B**:load_ms と原子数の関係(同じ凡例)
   - **Fig C(中心の図)**:RSS の最大値とフレーム数の関係。yiip、a4tail-nosol、a4tail-all のパネルを並べる。Mol\* が落ちた点を明示する。
   - **Fig D**:1 フレームあたりに GPU へ送るバイト数と、JS の処理時間の内訳(§5)
   - **SI**:フレーム 0 の描画比較画像
4. `tritium/bench/molstar/REPORT.md`
   - バージョンと設定の一覧(Mol\* の canvas3d の props と表現の params は全部書き出す)
   - §0 の確認結果
   - §6.1 と §6.2 の結果
   - 主表、図、失敗したセルの詳細
   - Mol\* 側で「有利なほう」を選んだ判断の一覧

---

## 8. やってはいけないこと

- Mol\* の既定のプリセットや自動の品質調整のまま比べること(描画する原子や表現が変わってしまう)
- Mol\* を Electron とは別のブラウザで主条件として測ること(参考として Chrome 安定版で 1 回測るのは可。その場合は別の表にする)
- 1 つのプロセスの中で、ツールやデータセットを切り替えて計測すること
- CueMol の製品コードや Mol\* のソースを変更すること(ハーネス側のフックは可。Mol\* には公開 API で触る)
- 失敗したセルを表から除外すること
- develop へのマージや push

判断に迷ったら、推測で進めずに止めて質問すること。
