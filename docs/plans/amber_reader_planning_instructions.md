# CueMol AMBER リーダー実装 — Planning 指示書

## 0. このドキュメントの役割

CueMol に AMBER MD のトポロジ／座標を読み込む機能を実装する。本ドキュメントは
**実装ではなく "実装計画(plan)" を立てるための指示**である。フォーマット仕様・参考実装・
ライセンス制約・既知の落とし穴はここに与えてあるので再調査は不要。これらを前提に、
**CueMol 側の繋ぎこみ方を調査し、実装計画を出力すること**。

---

## 1. スコープ(今回の最小構成)

実装するのは次の **2 本のリーダーのみ**。

1. **prmtop / parm7 リーダー** — トポロジを読み、`MolCoord` を新規生成する。
2. **inpcrd/restrt + mdcrd リーダー** — 座標を読み、**既存の `MolCoord` に適用**する。
   - **単一スナップショット(inpcrd/restrt = ASCII restart 形式)**
   - **複数フレーム(mdcrd = ASCII trajectory 形式)**
   - フレーム管理を含む。
   - 重要: この 2 形式は「フレーム数の違い」ではなく**構造の異なる別フォーマット**であり、
     内部は **2 つの独立したパース経路**になる(詳細は §3, §6)。

3. prmtop / parm7 ReaderをメインのObjReader本体とし、座標crd系は、副ストリームとして実装。
メインと副ストリームについては、NAMDCoorReaderと副ストリームのPSFReaderの関係を参考にする。
（ただし、NAMDCoorReaderの実装では、座標とparamの関係が逆になっている点に注意）

### フォーマットバージョンのスコープ

- **prmtop は Amber 7 以降の「新」フォーマット(`%VERSION` / `%FLAG` / `%FORMAT` 形式)のみ対象**。
- **pre-Amber 7 の「旧」フォーマット(ラベル無し・固定順序)はスコープ外**。
  旧フォーマットは現代のツールでは生成されず無視してよいが、**検出はする**
  (誤パースせず明確なエラーで拒否。§6 参照)。
- 座標側で対象とするのは **ASCII の restart(inpcrd/restrt/rst7)**。
  **NetCDF restart(.ncrst、バイナリ)はスコープ外**。

### スコープ外(今回はやらない)

- NetCDF(`.nc` / `.ncrst`)、binpos などのバイナリ座標形式
- GROMACS / NAMD 形式(xtc, trr, dcd, psf, gro, tpr など)
- 書き出し(writer)、トポロジ生成、力場パラメータの利用
- pre-Amber 7 旧フォーマット(検出して拒否するのみ)
- prmtop のうち可視化に不要なセクション(LJ 係数、二面角パラメータ等)

将来これらを足せる拡張性は意識してよいが、今回は実装しない。

---

## 2. アーキテクチャの要点(必ず踏襲)

AMBER はトポロジと座標が完全分離しており、座標ファイルには原子名・残基・結合が一切無い。
したがって 2 本のリーダーは性質が異なる。

- **prmtop リーダー = オブジェクト生成側**。`PDBFileReader` と同じ立ち位置で `MolCoord` を作る。
  ただし座標は持たないので、トポロジ単独ロードは「位置未確定の構造」になる。
- **座標リーダー = 既存オブジェクト更新側**。新規オブジェクトを作らず、
  対象 `MolCoord` の原子座標を上書きする "coordinate applier" として設計する。
  内部に **restart パスと mdcrd パスの 2 経路**を持つ(§3)。
- **対応付けはインデックスのみ**。prmtop と座標ファイルは原子順序が厳密に一致する
  (prmtop の i 番目 = 座標ファイルの i 番目)。トポロジ読み込み時に
  `index → MolAtom(AID)` の配列を保持しておき、座標適用時にそのまま流し込む。
- **フレーム管理**は座標リーダー側の責務。`MolCoord` に「カレントフレーム」概念を持たせ、
  切替時に原子座標を差し替え、再描画イベントを発火する設計を検討すること。

---

## 3. フォーマット仕様(一次情報)

これらを根拠に実装する。固定幅 FORTRAN フォーマット指定子に従ったパースが必須。

### 3.1 prmtop / parm7(トポロジ、Amber 7+ 新フォーマット)
- 概説: https://ambermd.org/FileFormats.php#topology
- **詳細仕様(決定版)**: https://ambermd.org/prmtop.pdf
  (Jason Swails による。各 `%FLAG` セクションの意味とサイズが網羅されている)

新フォーマットの構造: 先頭に `%VERSION` 行、以降 `%FLAG <名前>` と `%FORMAT(<指定子>)` の
ペアでセクションが続く。可視化に必要な FLAG は限定的:
`POINTERS`(NATOM 等のカウント) / `ATOM_NAME` / `RESIDUE_LABEL` / `RESIDUE_POINTER` /
`ATOMIC_NUMBER`(無ければ `MASS` か `AMBER_ATOM_TYPE` から元素推定) /
`BONDS_INC_HYDROGEN` / `BONDS_WITHOUT_HYDROGEN`。これ以外は読み飛ばしてよい。

**バージョン差は 2 軸あることに注意**:
- (a) 構造的な旧/新: 本実装は新のみ対象。旧(ラベル無し)は検出して拒否(§6)。
- (b) 新フォーマット内の進化: 例として `ATOMIC_NUMBER` は Amber 12 で追加。Amber 7〜11 には
  無いので、**FLAG は「在れば使う／無ければフォールバック」**で扱い、未知 FLAG は無視する。

### 3.2 座標リーダーの 2 経路(構造が異なる別フォーマット)

同じ「ASCII 座標」でも restart と mdcrd は**カラム幅・精度・ヘッダ・box 表現・速度有無が
すべて異なる**。1 本のリーダーが両形式を受けてよいが、内部実装は別経路にする。

**(A) restart 系(inpcrd / restrt / rst7) — 単一構造・高精度**
- タイトル行 → `FORMAT(I5,5E15.7) NATOM, TIME`(原子数と時刻の行。大規模系は I6 等)
- 座標 `FORMAT(6F12.7)` = 1 行 6 値・各 12 桁・小数 7 桁
- (動力学なら)速度 `FORMAT(6F12.7)`(可視化には不要)
- (定圧/定積なら)box `FORMAT(6F12.7)` = **辺長 3 + 角度 3**
- 速度/box の有無はファイルに明示フラグが無く、**値ブロック数を数えて判定**する。

**(B) mdcrd(ASCII trajectory) — 複数フレーム・低精度**
- 先頭にタイトル行 1 行のみ `FORMAT(20A4)`
- 各フレーム: 座標 `FORMAT(10F8.3)` = 1 行 10 値・各 8 桁・小数 3 桁。
  全原子の x,y,z を平坦に並べ 10 値ごと改行。1 フレーム = `ceil(3×NATOM/10)` 行。
- **周期境界がある場合のみ**、各フレーム座標の直後に box 行(辺長 3 のみ、直方体と仮定)
- NATOM 行は無い → **prmtop から原子数を得て初めてフレーム境界が決まる**
- 時刻情報は無い → dt は既定 1 ps と仮定(またはユーザ指定)
- 仕様: https://ambermd.org/FileFormats.php

---

## 4. 参考実装

### 移植してよい(寛容ライセンス) — これを手本にする
- **VMD molfile plugins**(C / University of Illinois-NCSA Open Source License。MIT 互換)
  - `parm7plugin`(prmtop トポロジ。Amber 7〜11 = 新フォーマット):
    https://www.ks.uiuc.edu/Research/vmd/plugins/molfile/parm7plugin.html
  - `crdplugin`(AMBER CRD = inpcrd/mdcrd の ASCII 座標)
  - ソース閲覧: https://www.ks.uiuc.edu/Research/vmd/plugins/doxygen/
  - 最も枯れた正準実装。これを第一の手本とする。
- **chemfiles**(C++ / 3-clause BSD。MIT 互換)
  - リーダーのクラス設計(`Format` の read / read_step / nsteps)の参考。
  - GitHub: https://github.com/chemfiles/chemfiles (src/formats/ 配下)
  - 注: prmtop は molfile 経由で読む。ASCII 座標ロジックよりは
    「クラス構造・フレームのランダムアクセス設計」の参考として見る。
  - chemfilesは、~/ext/chemfilesにrepository cloneがある。
  
### 読解専用(GPL/コピーレフト) — コードは移植しない、ロジック理解のみ
- **MDAnalysis**(Python / GPL): `MDAnalysis/topology/TOPParser.py`,
  `MDAnalysis/coordinates/TRJ.py`。パースロジックが最も可読。
- **cpptraj**(C++ / GPL): エッジケースの最終確認。
- **ParmEd**(Python): `%FLAG`/`%FORMAT` 生パースの参考(`Rst7` / `AmberMdcrd` クラス)。

---

## 5. ライセンス制約(厳守)

- **CueMol(develop)は MIT**。実装結果は MIT に収まらねばならない。
- **コードを移植・翻案してよいのは寛容ライセンスのみ**:
  molfile(NCSA)・chemfiles(BSD)。著作権・ライセンス表示を保持すること。
- **GPL 系(MDAnalysis, cpptraj)・ライセンス未確認のもの**は、
  **読んで理解するだけ**。1 行たりともコピー・翻案しない。
- 最もクリーンなのは「仕様(§3)＋寛容ライセンス実装(§4)を参照し、CueMol のスタイルで
  新規に書き起こす」運用。判断に迷うコードは移植せず仕様から書く。

---

## 6. 既知の落とし穴(実装前に必ず確認)

### prmtop
1. **結合インデックスの変換**: `BONDS_*` の原子インデックスは
   「座標配列オフセット = atom_index × 3」で格納。実際の原子番号に戻すには
   **3 で割る(0-based)/ 3 で割って +1(1-based)**。最頻のバグ要因。
2. **元素の割り当て**: `ATOMIC_NUMBER` があればそれを使う。無い旧版(Amber 7〜11)では
   `MASS` または `AMBER_ATOM_TYPE` から推定する。
3. **固定幅フォーマットの尊重**: `%FORMAT` の指定子(例 `5E16.8`, `20a4`, `10I8`)に
   従ってパースする。空白区切りトークン分割は破綻しうる。
4. **フォーマットバージョン検出**: 先頭の `%VERSION` / `%FLAG` の有無で新旧を判定し、
   **旧フォーマット(ラベル無し・固定順序)を検出したら、黙って誤パースせず明確なエラーで拒否**。
   バージョン差は 2 軸ある(構造的な旧/新、新フォーマット内の FLAG 進化。§3.1)。

### 座標(共通／restart／mdcrd)
5. **restart と mdcrd は別パーサ**: カラム幅・精度・ヘッダ・box・速度有無が異なる
   (§3.2)。フレーム数違いと誤解しないこと。
6. **restart の速度/box 検出**: 明示フラグが無いので、natom 個分の値ブロックが
   何個あるかを数えて velocities / box の有無を判定する。
7. **box 表現の差**: restart は **辺長 3 + 角度 3**、mdcrd は **辺長 3 のみ(直方体仮定)**。
8. **mdcrd の box 行の有無は判別困難**: trajectory 単体から確実に判定できない。
   prmtop の `IFBOX`(POINTERS)か、明示指定で決める。
9. **原子数の整合**: 座標リーダーは natom を確定し(restart はヘッダ、mdcrd は prmtop から)、
   適用先 `MolCoord` の原子数と一致するか検証する。
10. **`.crd` 拡張子の曖昧性**: AMBER mdcrd は `.crd` でも保存されるが CHARMM CRD と衝突。
    拡張子だけで自動判別しない。フォーマット明示できる設計にする。
11. **単位・時刻**: 座標は Å(CueMol と同じ)。restart の時刻は ps、mdcrd は時刻情報なし
    (dt 既定 1 ps)。速度単位は AMBER 独自(Å / (1/20.455 ps))だが可視化には不要。
12. **REMD トラジェクトリの癖**: 先頭に空行が無い別出力になることがある(対応するなら別途考慮)。
13. **トポロジ単独ロード**: prmtop だけでは座標が無く位置未確定。UI/挙動として許容するか決める。
14. **フレーム長可変性(mdcrd)**: box 行の有無でフレームのバイト長が変わる。任意フレームへの
    ランダムアクセス(スクラブ)を行うなら、一度走査してフレーム先頭オフセット索引を作る。
15. **再描画**: 座標更新後は `MolCoord` の変更通知(イベント)を発火し、レンダラを再描画させる。

---

## 7. CueMol 側で調査・決定すべき事項(Claude Code が詰める)

実コードのクラス名・API はバージョンで動くので、**まず現行コードを読んで合わせること**。

- `src/modules/molstr/PDBFileReader.{hpp,cpp}` を読み、`MolCoord` を生成する ObjReader の
  雛形・基底クラス・必須メソッドを把握する。
- データモデル: `MolCoord` / chain / `MolResidue` / `MolAtom` / `MolBond` の構築 API、
  原子位置の型(Vector4D 等)を確認する。
- リーダー登録の仕組み: `StreamManager` 経由の登録、各モジュールの `*.qif`(スクリプト
  インターフェイス定義)、起動時の登録コードを確認する。
- 座標リーダーを CueMol のリーダー枠組みにどう載せるか(「対象 MolCoord を指定して座標
  ファイルを読む」形をどう表現するか)を設計する。
- フレーム管理は今回は考えない。trajectoryではなく、snapshotだけ読み込む実装
- メインと副ストリームについては、NAMDCoorReaderと副ストリームのPSFReaderの関係を参考にする。
（ただし、NAMDCoorReaderの実装では、座標とparamの関係が逆になっている点に注意）

---

## 8. 出力してほしい Plan の形式

以下を含む実装計画を Markdown で出力すること。**この段階ではコードを書かない**。

1. **CueMol アーキテクチャ調査結果**: PDBFileReader の構造、リーダー登録手順、MolCoord の
   構築 API、座標更新 API の要点(該当ファイル/クラス/メソッド名つき)。
2. **2 リーダーの設計**: それぞれの責務、クラス構成、CueMol の既存枠組みへの載せ方。
   座標リーダーは restart / mdcrd の 2 パース経路をどう構成するかを含める。
3. **フレーム管理の設計判断**: 採用方式と理由。
4. **作業のシーケンス**: 着手順序(推奨は prmtop → restart 単一フレーム → mdcrd 複数フレーム)。
   各ステップの完了条件。
5. **未決事項・要確認点**: 仕様・CueMol 実装で曖昧なまま残る点と、確認方法。
6. **テスト方針**: 検証に使う小さな prmtop + restart/mdcrd の入手・自作方針、確認観点
   (原子数・残基・結合・座標・複数フレーム切替・box 有無・旧フォーマット拒否)。

実装はこの Plan のレビュー後に着手する。
