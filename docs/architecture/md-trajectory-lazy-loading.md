# MD Trajectory の遅延フレーム読み込み (libcuemol2)

DCD / XTC / TRR の trajectory を、開いた時点で全フレームを展開するのではなく、
**表示されたフレームだけをその場で読む**設計の記録。対象は
`src/modules/mdtools/` の `TrajBlockReader` とその 3 つの派生リーダ。

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

**変わらないこと**

- **予約サイズは減らない**。`TrajBlock::allocate()` が全フレーム分の `PosArray` を
  先に確保する設計は据え置きなので、ここでの lazy は「**遅延 fill** であって
  遅延 allocate ではない」。メモリに硬い上限を掛けるにはフレーム eviction
  (必要時確保 + LRU 破棄) が要り、`isAllLoaded()` がリーダを解放する現在の前提とも
  衝突する。未実装。
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
              -> TrajBlock::allocate(natom, nkept)   (全フレーム未ロード)
              -> TrajBlock::setTrajUID(traj->getUID())
              -> TrajBlock::setTrajLoader(this)
    no  -> readAllFrames() : 従来どおり全フレーム展開

(表示時)
Trajectory::getTrajBlkImpl(ifrm)
  -> TrajBlock::load(ifrm)          (!isLoaded なら)
      -> TrajBlockReader::loadFrm(ifrm, pTB)
           -> openAtFrame(ifrm)     : createInStream() + seekTo(offset)
           -> 1 フレームだけ読む
           -> scatterCoords(...) -> pTB->getCrdArray(ifrm) / getCellArray(ifrm)
      -> setLoaded(ifrm, true)
      -> isAllLoaded() なら m_pReader を解放
```

`Trajectory::append()` は frame 0 を prime する (`primeInitialFrame()`) ので、
append 直後にロード済みなのは frame 0 だけになる。

`loadFrm()` 時点でリーダは detach 済みなので `getTargTraj()` の
「attach 中のブロックから辿る」fallback は使えない。代わりに
`getTargTrajOf(pTB)` がリーダの `targTrajUID`、無ければブロックの `getTrajUID()` から
解決する (後者は `setupLazyBlock()` が入れる。`Trajectory::append()` は
`setTrajUID` を呼ばない)。

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

テストは実ファイルと smart pointer 保持のリーダを要するため
(`canLazyLoad` の条件)、`::testing::TempDir()` に書き出して `FileInStream` で読む。
no-arg の `ObjReader::read()` は使わない — そちらは reader property を serialize し、
この test binary は `mdtools::init()` を呼ばないのでクラス未登録で落ちるため。

## 関連

- 以前の前提と経緯: [`../plans/260718-md-trajectory-phase2-plan.md`](../plans/260718-md-trajectory-phase2-plan.md)
- GUI 側の開く導線: [`md-trajectory-open-dialog.md`](md-trajectory-open-dialog.md)
- 再生 UI: [`md-trajectory-bottom-pane.md`](md-trajectory-bottom-pane.md)
