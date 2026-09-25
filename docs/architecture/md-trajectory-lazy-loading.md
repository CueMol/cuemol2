# MD Trajectory の遅延フレーム読み込み (libcuemol2)

DCD / XTC / TRR の trajectory を、開いた時点で全フレームを展開するのではなく、
**表示されたフレームだけをその場で読む**設計の記録。対象は
`src/modules/mdtools/` の `TrajBlockReader` とその 3 つの派生リーダ。

後から入った次の 3 つも、このページで扱う。

| 内容 | PR | 節 |
|---|---|---|
| デコード済みフレームの保持に上限を設け、古いものから解放する | #629 | [フレームキャッシュの上限](#フレームキャッシュの上限-629) |
| XTC のデコードを速くする | #629 | [XTC のデコード](#xtc-のデコード-629) |
| 読み込み時に原子を選ぶ | #630 | [読み込み時の原子の選択](#読み込み時の原子の選択-applyloadsel-630) |
| 次のフレームを先読みする | #631 | [次フレームの先読み](#次フレームの先読み-631) |

どれも、`bench/perf-harness` の `md-playback` を公開 MD データで回して見つけた問題に
対応している (`docs/plans/260919-tritium-perf-benchmark-plan.md`)。

## 背景

`TrajBlock` 側の遅延ロード機構 (`setTrajLoader` / `isLoaded` / `load(ifrm)`) と
`Trajectory::getTrajBlkImpl()` の呼び出しは以前から存在していたが、3 リーダとも
`loadFrm()` が

> Seek-based lazy loading is not implemented (develop's InStream has no portable seek)

という理由で例外を投げるスタブのままだった。この前提は
`docs/plans/260718-md-trajectory-phase2-plan.md` §「lazy loading」に由来するが、
**現在は成立しない**。`qlib::InStream` に `isSeekable()` / `tell()` / `seekTo(qint64)`
があり (`src/qlib/LStream.hpp`)、`PosixFileStream` が `ftello` / `fseeko` で 64bit
実装している (`src/qlib/PosixFileStream.cpp`)。`src/tests/qlib/test_seekable_stream.cpp`
が挙動を pin している。

実害の例: 396,918 atoms × 501 frames (746 MB) の xtc は、開いた瞬間に 746 MB を
同期展開し、その間 worker が固まり、約 2.39 GB を常駐させていた。

## 何が変わって、何は変わらないか

**変わること**

- 開くのが即座になる。索引作成はフレームあたり数バイトから数十バイトの読み取りで済む。
- 見ていないフレームは一度も展開されない。`qlib::Array::resize()` は
  `new qfloat32[n]` で trivial 型を default-initialize するだけ = **一度も書き込まない**
  ので、確保はアドレス空間の予約に留まり、物理ページは触ったフレーム分だけ載る。

- 保持するフレームに上限がある (#629)。lazy なブロックはフレームの領域を先に確保せず、
  デコードしたときに確保する。上限を超えたら、最も古く表示したフレームを解放する。
  詳しくは [フレームキャッシュの上限](#フレームキャッシュの上限-629)。
  当初この設計は「遅延 fill であって遅延 allocate ではない」もので、全フレーム分の
  `PosArray` を先に確保し、デコードしたフレームを保持し続けていた。

**変わらないこと**

- AMBER NetCDF は対象外。フレームに `Netcdf3InStream` 経由で到達しており、その層を
  任意のレコード位置から再入できるかを確認していない。`loadFrm()` はスタブのまま。

## 適用条件 (`TrajBlockReader::canLazyLoad`)

判定は `read()` の冒頭 1 箇所。**false なら従来どおり全フレームを展開する**ので、
挙動の後退は無く eager 経路も生き続ける。

| 条件 | 理由 |
|---|---|
| `isLazyLoad()` | `lazy_load` property (既定 `true`)。スクリプトからの明示的な opt-out |
| `ins.isSeekable()` | デコーダ (gzip / base64) を挟むと一方通行になる。非ファイル源も同様 |
| `getPath()` が非空 | `loadFrm()` は `createInStream()` で**開き直す**。`read()` に渡された stream は `ObjReader::read()` が直後に破棄する |
| 圧縮なし / base64 なし | `ObjReader::read2()` がデコーダを噛ませる経路を除外 |
| `getSpRefCounter() != NULL` | 下記 |

### なぜ smart pointer の所有を確認するのか

ブロックは `TrajBlock::setTrajLoader(TrajBlockReaderPtr(this))` でリーダを**共同所有**する。
`qlib::LSupScrSp` の参照カウンタはオブジェクト自身が持つ (`LScriptable::m_pRefCounter`) ので、
既に `LScrSp` が所有しているオブジェクトから `LScrSp(this)` を作るのは安全 — カウンタが
再利用される。しかし**まだ誰も所有していない**オブジェクトから作ると、そこで所有権を
新規に発生させてしまう。該当するのは 2 つ:

- gtest のスタック上のリーダ
- `Object::readFromStream()` (`src/qsys/Object.cpp`) の `createReaderPtr()` + `delete pRdr`
  — **`.qsc` 復元経路**

どちらも dangling と二重解放になる。`getSpRefCounter()` が NULL ならこの状態なので、
eager に落とす。結果として **`.qsc` から復元した trajectory は常に eager** になる
(この経路は `setPath()` も呼ばないので、どのみち条件を満たさない)。

## 索引の作り方 (フォーマット別)

索引は `TrajBlockReader::setFrameOffsets()` が持つ `std::vector<qint64>` で、
**保持するフレームだけ**を入れる (`nevery` 間引きを畳み込むので、entry i が
block frame i)。これは組合せで壊れやすい箇所なので、gtest で pin している。

| | 方法 | フレームあたりの I/O |
|---|---|---|
| **DCD** | ヘッダ直後の位置 + `i * nevery * framebytes` の算術のみ。レコード固定長 (`cell? + X/Y/Z`、各々 Fortran の長さマーカー付き) | 0 (走査しない) |
| **XTC** | 各フレーム先頭で magic と natoms を検証し、`XTC_HEADER_SIZE` (88) の位置にある圧縮ブロック長を読んで次の位置を出す (chemfiles `determine_frame_offsets()` と同方式)。natoms <= 9 の非圧縮フレームは長さ固定 | seek + 8〜12 バイト |
| **TRR** | 各フレームのヘッダを解析 (version 文字列が可変長なので長さは `tell()` から取る)、宣言された全ブロックサイズの和を足して次の位置を出す | seek + 数十バイト |

### 途中で切れたファイル

索引の走査はフレームのデータ本体を読まないので、MD run が書き込み中に落ちて
**最後のフレームのヘッダだけが揃っている**ファイルを見抜けない。放置すると
再生が末尾に達したときに初めて失敗する。`checkIndexedRange()` が索引確定時に
最終バイトへ `seekTo` して 1 バイト読み、欠けていれば `FileFormatException` を投げる
— eager 経路が truncated file で throw するのと同じ契約に揃えている。

## 実行時の流れ

```
read(ins)
  canLazyLoad(ins) ?
    yes -> indexFrames()  : 走査して offsets を作る
              -> TrajBlock::allocateOnDemand(natom, nkept)   (全フレーム未ロード、領域も未確保)
              -> TrajBlock::setTrajUID(traj->getUID())
              -> TrajBlock::setTrajLoader(this)
    no  -> readAllFrames() : 従来どおり全フレーム展開

(表示時)
Trajectory::getTrajBlkImpl(ifrm)
  -> TrajBlock::load(ifrm)          (毎回呼ぶ。使用順の記録を兼ねる)
      ロード済みなら: prefetchAfter(ifrm) だけして戻る
      -> evictFor(ifrm)             : 上限を超えるなら最も古く使ったフレームを解放
      -> takePrefetched(ifrm) ?     : 先読み済みならそれを使う (実行中なら完了を待つ)
         no -> TrajBlockReader::loadFrm(ifrm, pTB)
                 -> openAtFrame(ifrm)     : createInStream() + seekTo(offset)
                 -> 1 フレームだけ読む
                 -> scatterCoords(...) -> pTB->getCrdArray(ifrm) / getCellArray(ifrm)
                    (getCrdArray が未確保のフレームの領域をここで確保する)
      -> ロード済みにする
      -> prefetchAfter(ifrm)        : 再生方向の次のフレームを先読みに出す
      -> 全フレームがロード済みで、上限内に全フレームが収まるなら m_pReader を解放
```

`Trajectory::getTrajBlkImpl()` は、以前は未ロードのときだけ `load()` を呼んでいた。
今は毎回呼ぶ。ロード済みのフレームでも使用順を更新し、先読みを続けさせるためである。

`Trajectory::append()` は frame 0 を prime する (`primeInitialFrame()`) ので、
append 直後にロード済みなのは frame 0 だけになる。

`loadFrm()` 時点でリーダは detach 済みなので `getTargTraj()` の
「attach 中のブロックから辿る」fallback は使えない。代わりに
`getTargTrajOf(pTB)` がリーダの `targTrajUID`、無ければブロックの `getTrajUID()` から
解決する (後者は `setupLazyBlock()` が入れる。`Trajectory::append()` は
`setTrajUID` を呼ばない)。

## フレームキャッシュの上限 (#629)

**問題**: lazy なブロックは、表示したフレームをデコードしたまま保持し続けていた。
全フレーム分の `PosArray` も先に確保していた。長いトラジェクトリを再生すると、
メモリが際限なく増える。3,940,938 原子の系では 1 フレームが 47 MB なので、
2,530 フレームを再生すると理論上 119 GB になる。

**仕組み** (`TrajBlock`):

- `allocateOnDemand(natom, nsize)` は、フレームの領域を確保しない。
  `getCrdArray(ifrm)` が、未確保のフレームに初めて書くときに確保する。
  eager 読込の `allocate()` は従来どおり全フレームを先に確保する。
- `load()` はフレームごとに最終使用の刻み (`m_lastUse`) を更新する。
  デコード済みのフレームが上限に達していたら、`evictFor()` が最も古い
  フレームを解放してから、新しいフレームをデコードする。解放したフレームは、
  次に表示されるときに再びデコードされる。
- 上限は `TrajBlock::setCacheLimitBytes()`。既定は **1 ブロックあたり 2 GiB** で、
  最低 2 フレームは保持する。1 つ目は置き換えられる側、2 つ目は置き換える側で、
  フレーム平均 (`frame_aver_size`) の窓も 1 フレームずつ読むので、2 フレームで足りる。
  10 万原子で 1,000 フレーム程度のトラジェクトリなら、以前と同じく全フレームが収まる。
- 上限の対象は `allocateOnDemand()` で作ったブロックだけ。eager に読んだブロックは
  解放しない (解放すると読み直せないため)。
- リーダの解放条件も変わった。以前は全フレームがロード済みになった時点で解放していた。
  今は、それに加えて「上限内に全フレームが収まる」ことを条件にしている。
  解放したフレームを後でまたデコードする可能性がある間は、リーダを手放さない。

## XTC のデコード (#629)

アプリ内の計測で、lazy 再生の初回表示のコストの大半は XTC の展開だった。YiiP (111,815 原子) では、
1 フレームの更新 3.3 ms のうち、展開 (`decodeints` / `nextByte` / `readCompressedCoords`) が 73%、
フレームごとの一時バッファの確保とゼロ埋めが 7% を占めていた。

- **バッファの使い回し**: `loadFrm()` はフレームごとに `XdrInStream` を作り直すが、
  圧縮ブロック・整数の中間バッファ・座標のバッファはリーダが持ち回す
  (`XdrInStream::swapScratch()` で貸し出す)。eager 経路は、以前から 1 組を使い回していた。
- **`BitReader`**: 圧縮ビット列を 64 bit のアキュムレータで読む。
  - 圧縮ブロックの末尾に 128 バイトの余白 (`kReadPad`) を足しておくことで、
    バイトごとの境界チェックをやめ、原子 1 つごとの `checkInBounds()` にまとめた。
    余白は、1 原子が読み得る最大量 (96 bit の三つ組、6 bit の run ヘッダ、最大 10 組 × 72 bit) を上回る。
  - 三つ組の整数部分は、最大 4 バイトずつまとめて読み、バイト順を反転して組み立てる。
  - ビット順と演算は元の実装 (chemfiles 由来) と同じ。
- 結果: YiiP、mcv448 (161,188 原子)、3.9M 原子の 3 系で、全フレームの全座標の
  チェックサムが変更前と一致する。lazy に 1 フレームずつ連続でデコードしたときの時間は、
  YiiP 1.30 → 0.86 ms、mcv448 1.92 → 1.24 ms、3.9M 原子 53〜55 → 34〜39 ms。

## 読み込み時の原子の選択 (`applyLoadSel`, #630)

**問題**: 大きな溶媒和系は、普通は水を隠して表示する。しかし `Trajectory` は、全原子の
座標を保持し、コピーし、描画側へ渡していた。3.9M 原子のうち 91% が水の系では、
1 フレーム 47 MB を保持し、`fillCrdArray` が毎フレーム 47 MB をコピーしていた。
フレームキャッシュに入るのも約 45 フレームだけだった。

**API**: `Trajectory::applyLoadSel(sel)`。スクリプトからも呼べる (`Trajectory.qif`)。

- topology を読んだあと、**最初のブロックを追加する前**に呼ぶ。ブロックの追加後に
  呼ぶと例外になる。
- 選択されなかった原子を取り除き、それらに張られた結合も外す (`removeNonpersBonds()`)。
  結合と二次構造は、最初のフレームを表示するときに `primeInitialFrame()` が、
  残した原子で作り直す。
- 残した原子それぞれについて、データファイルの中で何番目の原子かを記録する
  (`setupSel()` → `getSelIndexArray()`)。原子は ID 順に並べるが、どの topology reader でも
  ID 順はファイルの順と一致する。`setup()` も同じ前提に立っている。
  - DCD、XTC、TRR、AMBER NetCDF の各リーダは、以前からこの対応表を使って
    座標を書き込む (`scatterCoords()`)。リーダ側の変更は要らない。
  - `setupSel()` 自体は Trajectory の移植時からあったが、呼び出し元が無かった。
    部分読み込みは `docs/plans/260718-md-trajectory-phase2-plan.md` で後回しにしていた項目である。
- データファイルは全原子のまま読む。XTC の 1 フレームは 1 つの圧縮ストリームなので、
  選択外の原子も展開は必要になる。減るのは、保持・コピー・描画する原子の数である。
- 選択が null なら全原子を読み込む (`setup()` と同じ)。

**.qsc**: 選択は `loadsel` 属性として `Trajectory` の要素に保存する (`writeTo2`)。

- .qsc の復元では、`Trajectory` の要素とそのブロックが topology より先に読まれる。
  そのため、`readFrom2()` は選択を保留にしておき、topology のリーダが detach したとき
  (`readerDetached()`) に適用する。
- 保留中に作られたブロックは、ファイルの全原子の幅で索引されている。
  これらは適用時に `TrajBlock::selectAtoms()` で、残した原子の幅に詰め直す。
  上の「適用条件」の節のとおり、.qsc から復元した trajectory は eager なので、
  ロード済みのフレームの中身も詰め直す。

**原子の一括削除** (`MolCoord::removeAtoms()`、molstr):

- `MolChain::removeResidue()` は残基を探すたびに鎖の deque を先頭から探す。
  そのため、長い鎖からほとんどの残基を 1 つずつ取り除くと、2 乗のコストになる。
  GRO には鎖が無く、全原子が鎖 A に入る。3.9M 原子 (120 万残基) の系から水を除くと、
  load 150 s のうち約 2 分がここで消えていた。
- `removeAtoms()` は、1 原子ずつの処理を `removeAtom()` と共有する
  (`removeAtomFromResidue()`。altconf の扱いも同じ)。空になった残基は鎖ごとに集め、
  `MolChain::removeResidues()` で 1 回の走査で取り除く。空になった鎖も取り除く。
- `removeAtom()` の挙動は変えていない。同じ系の load は 21 s になった。

## 次フレームの先読み (#631)

**問題**: lazy なフレームは、初めて表示したときにワーカースレッドでデコードしていた。
3.9M 原子で 34 ms かかり、水を読み込まない表示 (GPU 9 ms) でも、これだけで 30 fps に抑えられていた。
一方、各フレームは索引済みのオフセットから独立にデコードできる。oneTBB のスレッドで
並列にデコードすると、M2 ではほぼ線形に伸びた (1 スレッド 33.9 ms、4 スレッド 9.5 ms/frame。出力は同一)。

**仕組み**:

- `TrajBlock::load()` は、フレームを用意したあと `prefetchAfter()` を呼ぶ。
  再生方向 (直前に読んだフレームとの前後関係で判定) の次のフレームを、
  最大 `TrajBlock::setPrefetchDepth()` 枚 (既定 4) だけデコードに出す。
  キャッシュの上限を超えないよう、先読みの枚数は「保持できるフレーム数 − 1」以下に抑える。
- タスクは `qlib::TaskGroup` で実行する (`src/qlib/parallel.hpp`、`tbb::task_group` の薄いラッパー)。
  oneTBB が無いビルドや、`CUEMOL_TBB_THREADS=1` のときは `available()` が false になり、先読みしない。
- `load()` は、先読み済みのフレームなら結果を取り込むだけにする。実行中なら完了を待つ。
  同じフレームを 2 回デコードすることはない。先読みが失敗した場合は、その場で
  `loadFrm()` を呼び直す。エラーは、そこで呼び出し側に上がる。
  選択が変わって原子数が合わなくなった先読みの結果も、捨ててデコードし直す。
- 再生方向が変わった、あるいは飛んだために遠くなった完了済みの先読みは、捨てる。
- ブロックを破棄するとき (`clear()`) は、実行中の先読みの完了を待つ。

**スレッド安全性**: 先読みのタスクは `TrajBlockReader::makeDetachedDecode()` が作る。

- これは読み込み側のスレッドで呼ばれ、パス・オフセット・原子数・選択の対応表のコピーなど、
  ただのデータだけを取り込んだ関数を返す。
- タスクは、リーダ、ブロック、trajectory、qlib のスマートポインタのどれにも触らない。
  自分の結果の置き場 (`PrefetchSlot`) に書くだけである。
- `m_prefetch` などの先読みの管理は、読み込み側のスレッドからしか触らない。
- **XTC だけが対応している** (`XtcTrajReader`。展開と書き込みは `loadFrm()` と同じ処理)。
  それ以外のリーダは空の関数を返し、従来どおり表示時にデコードする。
- ThreadSanitizer での検証はしていない。

**効果** (Apple M2、3.9M 原子の A4 portal-tail、水を読み込まない、最初の 1 周):
30 fps から 60 fps に上がり、初回表示の更新は 32.5 ms から 1.1 ms に下がった。
11〜16 万原子の系でも、初回表示の更新は再表示と同程度になった
(2.8〜3.3 ms → 0.6 ms)。

## `lazy_load` property

3 リーダとも `lazy_load` (boolean, 既定 `true`) を公開する。DCD には以前から
宣言だけあって**無視されていた** property で、既定は `false` だった。既定を
`true` に変え、実際に効くようにした。`false` にすると常に eager になる。

`nopersist` ではないので `.qsc` の `<ropts>` に載るが、復元経路は上記のとおり
どのみち eager なので影響しない。

## テスト

`src/tests/modules/importers/test_trajio.cpp`:

- `{Xtc,Dcd,Trr}LazyMatchesEagerAndDefersFrames` — 3 形式で索引の作り方が違うので
  1 件ずつ。`read()` 直後は frame 0 のみロード済み、**逆順を含む任意順**で取り出した
  座標が eager 読みと完全一致 (同じデコーダを通るので `EXPECT_DOUBLE_EQ`)、最後に
  `isAllLoaded()`。XTC では cell も比較する。
- `XtcLazyHonoursNeverySkip` — block frame i がファイル上 `i * nevery` 番目。
- `XtcLazyTruncatedFileThrows` — 末尾を削ったファイルが open 時点で throw。
- `XtcWithoutPathIsReadEagerly` — path の無い seekable stream (= `.qsc` 復元と同じ形)
  が eager に落ちること。
- `XtcLazyCacheLimitReleasesLeastRecentFrames` — 常駐フレームが上限を超えず、
  最も古く表示したものから解放され、解放したフレームを再表示すると eager 読みと
  ビット単位で一致する。
- `XtcLazyPrefetchFollowsPlaybackDirection` — 前向き・後ろ向きとも、再生方向の次の
  フレームが先読みに入り、取り込まれたフレームが eager 読みと一致する。
  oneTBB が無い、またはスレッドが 1 本のときは skip する。
- `LoadSelKeepsSelectedAtomsBitForBit` — eager と lazy の両方で、選択して残した原子の座標が、
  全原子で読んだ trajectory の対応する原子とビット単位で一致する。
- `LoadSelGivenBeforeTopologyAppliesOnDetach` — .qsc と同じ順序で、選択が topology を待ち、
  対応表が正しく、全幅のブロックが詰め直される。

`src/tests/modules/molstr/test_molcoord_altconf_remove.cpp`:

- `MolCoordRemoveAtom.RemoveAtomsPurgesEmptiedResiduesInOnePass` — 空になった残基と鎖が消え、
  残りの順序は保たれ、altconf の原子もプールから消える。

テストは実ファイルと smart pointer 保持のリーダを要するため
(`canLazyLoad` の条件)、`::testing::TempDir()` に書き出して `FileInStream` で読む。
no-arg の `ObjReader::read()` は使わない — そちらは reader property を serialize し、
この test binary は `mdtools::init()` を呼ばないのでクラス未登録で落ちるため。

## 関連

- 以前の前提と経緯: [`../plans/260718-md-trajectory-phase2-plan.md`](../plans/260718-md-trajectory-phase2-plan.md)
- 計測と、上限・選択・先読みに至った経緯: [`../plans/260919-tritium-perf-benchmark-plan.md`](../plans/260919-tritium-perf-benchmark-plan.md)
  (数値の出典は `bench/perf-harness` ブランチの `tritium/bench/`)
- GUI 側の開く導線: [`md-trajectory-open-dialog.md`](md-trajectory-open-dialog.md)
- 再生 UI: [`md-trajectory-bottom-pane.md`](md-trajectory-bottom-pane.md)
