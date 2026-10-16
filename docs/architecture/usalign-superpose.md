# US-align による構造重ね合わせ

`molanl::MolAnlManager` の重ね合わせ手法に、SSM / LSQ に加えて US-align (TM-align) を入れた。
SSM はタンパク質専用だが、US-align はタンパク質と核酸 (RNA/DNA) の両方を扱え、SSE グラフの
照合が失敗しやすい構造でも結果を返すので、**既定の重ね合わせ手法は US-align** とする。
SSM と LSQ は API ごとそのまま残す。

tritium でも、Superpose ダイアログ・catalog op `superpose`・PyMOL 方言の `align` / `super` の既定を
US-align にした (後述「tritium」)。

## Vendoring

- ソースは `src/modules/molanl/usalign/` にある。上流は https://github.com/pylelab/USalign で、
  commit は `usalign/README.md` に記録した。単量体の TM-align 経路 (`TMalign_main`) が使うヘッダだけを
  取り込み、CLI の `USalign.cpp`、MM-align、flexible、SOI のコードは入れていない
- 上流のヘッダは inline でない関数定義と `using namespace std;` を含む。そのため include するのは
  `USalignImpl.cpp` の 1 TU だけにし、`namespace usalign_vendor` で包んだ。外へは `USalignImpl.hpp` の
  素のデータ型 (`usalign::Chain` / `usalign::Result`) しか出さない
- ローカルパッチは 2 点だけで、どちらも `basic_fun.h` にある (`README.md` に列挙した)
  - `PrintErrorAndQuit()` は `exit(1)` をやめて `std::runtime_error` を投げる。
    `MolAnlManager` はそれを `qlib::RuntimeException` に変える
  - POSIX 専用の `pstream.h` を `pstream_stub.h` に差し替えた。gzip / bz2 のファイル読み込みでしか
    使わず、CueMol はそこを呼ばない
- CMake では `USalignImpl.cpp` にだけ警告抑制 (`-w` / `/w`) をかける。`winbuild/` の VC プロジェクトは
  更新していない

## Pivot atom と分子種の判定

US-align は 1 残基を 1 原子で代表させる。この原子を `pivot` 引数で選ぶ。

| `pivot` | 使う原子 |
|---|---|
| `""` / `"auto"` | アミノ酸は `CA`、ヌクレオチドは `C3'` (US-align CLI の既定と同じ) |
| 原子名 (`"P"`, `"C4'"`, `"CB"` など) | すべての残基でその原子 |

- ヌクレオチドかどうかは、まずトポロジーの型 (`TopparManager::isNuclAcid`) で判定する。トポロジーで
  決まらない残基は、`CA` を持たずに `C3'` か `C4'` を持てばヌクレオチドとみなす。標準の `A`/`G` は
  トポロジー DB の名前で引けないことがあり、修飾塩基 (PSU, 2MG など) はトポロジーに載らないことが
  あるため、後者の構造による判定が要る。この判定では修飾塩基も RNA の残基として数える
  (上流 CLI は、CA を探しにいくのでそれらを落とす)
- 分子種は、US-align の `mol_vec` と同じく「ヌクレオチド +1、アミノ酸 -1」を両構造で足し、
  正なら核酸として採点する (RNA 用の d0 と RNA の二次構造割り当て)。RNA の二次構造割り当ては
  距離の閾値が原子ごとに違うので、指定された pivot 名を 4 桁の PDB 形式 (`" P  "`) にして渡す
- altloc は SSM の `copySelected` と同じく、空か `A` だけを使う。pivot を持つ残基が 3 未満なら
  `IllegalArgumentException` を投げる
- 座標は `MolAtom::getPos()` (xformMat を適用した後の値) を使う

## API (`MolAnlManager.qif`)

```
object<Matrix> superposeUSalign1(MolCoord$ ref, MolSelection$ refSel, MolCoord$ mov, MolSelection$ movSel, string pivot, boolean useprop);
void superposeUSalign2(integer refId, string refSel, integer movId, string movSel, string pivot);
string superposeUSalignJSON(MolCoord$ ref, MolSelection$ refSel, MolCoord$ mov, MolSelection$ movSel, string pivot, boolean bshowlog);
```

- `superposeUSalign1` は mov を ref に重ね、その変換行列を返す。適用の仕方は SSM / LSQ と共通の
  `MolAnlManager::applyXform` が担う。mov に既に xformMat があれば座標に焼き込んでから、`useprop` なら
  xformMat property に設定し、そうでなければ座標を変換して `fireAtomsMoved` を出す。
  undo は呼び出し側の txn で包む (SSM と同じ)
- `superposeUSalignJSON` は何も動かさず、統計を JSON で返す:
  `{"tm_ref", "tm_mov", "rmsd", "nalgn", "seqid", "nucleic"}` (`tm_ref` は ref の長さで正規化した TM-score)
- C++ からは `superposeUSalign_impl` が `usalign::Result` (TM-score 2 種, RMSD, 整列長, seqID,
  核酸かどうか, 整列文字列) を返す
- 呼び出しのオプションは CLI の単量体の既定値と同じ (`-i`/`-a`/`-u`/`-d` なし、fast でない、
  TM-score の cutoff なし、`d0_out = 5.0`)。CLI の structure 1 が mov、structure 2 が ref にあたる
- ログには TM-score (両方の正規化)、RMSD、Nalgn、SeqID、pivot と分子種、60 桁ごとの整列を出す。
  整列の各行には、その行の先頭残基の番号を付ける

Python では `cuemol.mol_util.usalign_fit(ref, refSel, mov, movSel, pivot="auto")` を使う。

## tritium

- 手法 id と pivot の候補は `worker/shared/superposeTypes.ts` (`SuperposeAlgo = 'USalign' | 'SSM' | 'LSQ'`,
  `DEFAULT_SUPERPOSE_ALGO = 'USalign'`, `USALIGN_PIVOTS = auto / CA / C3' / C4' / P`) に置く。
  renderer (ダイアログ) と worker の両方から読むので shared 側にある
- worker service `superposeMol` は `algo: 'USalign'` で `superposeUSalign1(..., pivot ?? 'auto', useprop)` を
  呼ぶ。op の記録 (`recordOp`) には US-align のときだけ `pivot` を入れる
- **Superpose ダイアログ** (`dialogs/MolSuperposeDialog.tsx`): Algorithm 欄は `FieldGrid` の 2 行で、
  Method は `SegmentField` (US-align / SSM / LSQ。行の幅いっぱい)、Pivot atom は `SelectField`
  (US-align 以外では disabled)。履歴 (`molSuperposeHistory.ts`) は `pivot` も保存し、既知の値でなければ
  既定 (`USalign` / `auto`) に戻す
- **catalog op `superpose`**: `algo` の既定が USalign になり、`pivot` 引数 (enum) を持つ。既定の selection は
  USalign / SSM が `*`、LSQ が `name CA`
- **PyMOL 方言** `align` / `super`: US-align で重ね、`superposeUSalignJSON` の RMSD・整列残基数・TM-score を
  表示する。`pair_fit` は LSQ のまま
- dialog 内の旧来のボタン寸法規則 (`_dialog.css` の `.bp5-dialog-body .bp5-button`, 26px / `--fs-xl`) は
  `SegmentField` の segment を除外する (`.h3-form-btn` と同じ扱い)。これが無いと dialog の中でだけ
  segment が膨らむ

## 制限

- 単量体モードだけを実装した。選択範囲は 1 本の鎖として扱い、鎖の対応付け (MM-align) はしない。
  複数鎖を選ぶと、選択順に連結した 1 本の鎖として整列する
- TM-align の整列は配列順に依存する (circular permutation のモードは使っていない)

## テスト

`src/tests/modules/molanl/test_usalign_superpose.cpp` (`test_molanl`)。baseline は vendored commit から
ビルドした上流 CLI の出力で、取得コマンドはテストの冒頭に書いた。

- 自分自身への重ね合わせ、既知の変換の逆変換 (t/u から `Matrix4D` への変換と向きを固定する)、
  JSON の形式と mov を動かさないこと、`useprop` の挙動
- タンパク質 (indel あり, `1crn_af2_2.pdb` vs `1CRN.pdb`)、RNA の auto pivot と `P` pivot
  (`3cw5_rna.pdb` vs `1ehz_rna.pdb`) について、TM-score / RMSD / 整列長 / 変換行列が CLI と一致すること。
  RNA のテストデータは各 PDB の chain A の ATOM 行だけにしたもの (修飾塩基は除いた)
