# ChX console: ChimeraX の tutorial の書き方に対応する (提案 A)

ChimeraX の公式 tutorial 16 本 (と ChimeraX のソースにある binding-sites) のコマンド 845 行を ChX console に
流して調べた (調べ方と全体の結果は [261107-chx-tutorial-survey-plan.md](261107-chx-tutorial-survey-plan.md))。
この plan は、そのうち **既に ChX にあるコマンドの、tutorial で使われていて通らない書き方** を通す。新しい
コマンド (`volume`、`lighting`、`hbonds` など) は対象外 (survey の方で別に検討する)。

方針は今の ChX と同じ: ChimeraX と意味が一致するものだけを移し、近似で違う結果になるものは理由を言って断る。
書き込みはすべて op (`runOp`)。ChimeraX のソースは `~/ext/ChimeraX/src/bundles/`。

この方針の**合意した例外**は 1 つだけ: A7 の `color bfactor` の色を、値を段に分けた paint で近似すること
(後から部分的に `color` で塗り直す操作と両立させるため)。選ぶ原子と値の範囲は近似しない。

---

## A1. `show` / `hide` の対象の並び、`only`、`selAtoms` (tutorial で 17 行が失敗)

ChimeraX (`std_commands/show.py`): 対象は `ListOf(EnumOf(atoms, bonds, pseudobonds, pbonds, cartoons, ribbons,
surfaces, models))`。カンマ区切り (`hide atoms,ribbon`、`show #1 model,cartoon`) で、前方一致の省略も効く。
`only` は値を取らない keyword (指定した分子の中で、指定したもの以外を隠す)。

- **不具合**: ChX も `ListOf(EnumOf(WHAT))` だが、`EnumOf` がカンマを含めて 1 語 (`atoms,ribbon`) として読むので、
  並びが一度も通らない (`hide ribbon` のような 1 つだけは通る)。`ListOf` の中の値の型は、カンマで区切られた
  1 つ分だけを読むようにする (`cli/argTypes.ts`。他の `ListOf` の利用箇所にも効く)。
- `show <spec> <what> only`: atoms / cartoons は、ChX の表示状態 (`chx:` renderer の selection) で、指定した分子の
  同じ種類の表示を spec 以外から引いてから、spec を足す (指定した分子の中に限る)。`models` を含むときは、
  ChimeraX の `show_models` と同じく、指定した model を表示し、**scene の指定外の model を `set_visible` で隠す**
  (`show #1 models only` で #2 が残らないように)。
- `selAtoms` (ChimeraX の `shortcuts.py`: 選択している原子、無ければ全原子): selector として足す。選択が無いときは
  全原子 (`*`)、あるときは `sel` と同じ式。
- `show #1 model,cartoon` の `model` / `models` は今の `set_visible` の経路のまま。

## A2. `open` の複数の名前、`from eds`、`close session` (13 行)

- **複数の名前** (`open 7kkj 7kkl`、ChimeraX の `OpenFileNamesArg`): 空白で区切った名前を順に開き、それぞれ
  `Opened <name> as #N` と言う。1 つでも失敗したらそこで止める。名前ごとの解釈 (ファイル・`db:id`・URL・PDB ID) は
  今の `openTarget` をそのまま使う。`name` keyword は名前が 1 つのときだけ (複数なら断る)。
- **`from eds` / `fromDatabase eds`** (ChimeraX `map/eds_fetch.py`): ChimeraX は PDBe の CCP4 の地図
  `https://www.ebi.ac.uk/pdbe/coordinates/files/<id>.ccp4` (2Fo-Fc) を開く。同じファイルを読むために、既存の op
  `fetch_map_url` (地図の URL を開き、読んだ種類で描く) でこの URL を開く。`fetch_map` は使わない (取得元を省くと
  RCSB の validation report の係数から地図を作り、`EBI_MTZ` でも PDBe の係数から作り直す別の経路で、同じファイルでは
  ない)。2026-11-07 に、この URL が今も配布されていることを確かめた。`eds:1a0m` の接頭辞の形も同じ扱い。取得元の表
  (`worker/shared/dbSources.ts`) に EDS の地図の URL を足す。
- **`close session`**: ChimeraX では全部を閉じて設定も戻す。ChX は全 object を閉じる (`close` と同じ)。設定は
  戻さないことを `close` の説明に書く (CueMol に session の設定という単位が無い)。
- `open ... from rcsb_bio maxAssemblies 1` (生物学的会合体) と `from pdb_nmr` は、この plan では扱わない
  (survey の方に残す)。

## A3. `select zone`、`select up` / `down` (11 行)

- **`select zone <near> <distance> [<target>] [residues true] [extend true]`** (ChimeraX `std_commands/zonesel.py` の
  `zone_items`): 順序が意味を決めるので、ChimeraX と同じ順に組む。
  1. 対象の原子 = `target` (省略時は全部) から `near` を除いたもの。
  2. そのうち `near` から `distance` 以内の原子 (原子単位の zone、`@<`) を選ぶ: `S = (target - near) & (near @< d)`。
  3. `extend` なら `S | near`。
  4. 最後に `residues` なら残基全体に広げる (`byres`)。
  `residues` を `:<` (残基単位の zone) に置き換えてから `target` との積を取ると、`target` が残基の一部 (`@CB` など)
  のとき CB しか残らず、ChimeraX (距離内の CB を含む残基の全原子) と違う。また広げた結果には `near` の原子が
  戻ることがある (ChimeraX と同じ)。ChX の zone の翻訳 (`spec/emit.ts` の `zoneExpr`) を使って 2 を作り、
  1・3・4 は CueMol の式 (`not`、`or`、`byres`) で組む。
- **`select up` / `down`** (ChimeraX `session.selection.promote` / `demote`): up は今の選択を一段広げる
  (原子 -> 残基 -> chain -> model)。down は up の前に戻す (up の履歴が無ければ何もしない)。ChX は今の選択
  (分子ごとの `sel`) を読み、`byres` / chain / model 全体に広げた式で選び直す。down 用に、scene ごとの up の履歴を
  worker のメモリに持つ (model 番号の表と同じく、scene の状態ではない補助)。選択が他の経路で変わったら履歴は
  捨てる (今の選択と履歴の最後が一致しなければ down は何もしない)。

## A4. `view` の残りの書き方 (11 行)

- `view [spec] cofr true|false`: ChimeraX の `cofr` は「回転の中心を対象に合わせ直すか」で、どちらでも対象を
  画面に収める (`view_all` は `if cofr` の外)。`true` は ChimeraX の既定なので、今の `view` と同じに動かす。
  `false` (画面に収めるが回転の中心は保つ) は、CueMol が常に view の中心まわりに回るため、画面に収め直すと回転の
  中心も動いてしまい再現できない。そこで理由を言って断る (何もしない成功にも、keyword だけ無視して中心を動かす
  ことにもしない)。
- `view <名前> <frames>` (名前付きの view へ frames をかけて動く): CueMol に camera を補間して動かす経路が無いので、
  すぐに切り替え、frames は無視すると warn する。
- `view initial [models]` (ChimeraX: model を最初の位置に戻す): CueMol の object は位置を持たず動かないので、
  何もしないことを 1 行で言って成功にする。

## A5. `cartoon style` (4 行)

ChimeraX (`std_commands/cartoon.py` の `cartoon style`): `[spec] [width w] [thickness t] [xsection oval|rectangle|
barbell|round|piping] [modeHelix ...]`、`protein` / `nucleic` で対象を絞る。

- 書き込み先は renderer で分ける: protein は `chx:cartoon` (`ribbon`) の `helix` / `sheet` / `coil` の TubeSection、
  nucleic は `chx:nucl` (`nucl`、`TubeRenderer` を継承) の `section`。両方に同じ property を書くと核酸の側で失敗し、
  混在した分子では protein だけ変わった後で失敗する経路になる。未対応の断面の形は、どこにも書く前に判定して断る。
- 寸法は数値で換算する (近い値に丸めない): ChimeraX の `width` / `thickness` は断面の全幅・全厚 (Å)。CueMol の
  楕円・矩形の断面の 2 軸の全寸法は `2 x width` と `2 x width x tuber` なので、`width = W / 2`、`tuber = T / W` に
  なる (軸の向きは実装の最初に確かめる)。片方だけ指定されたら、もう一方の寸法 (全幅か全厚) を保つように換算する。
  coil は ChimeraX では `width` ではなく `thickness` で円の寸法を変えるので、その対応もこの換算に含める。
- `xsection`: CueMol の断面の型 (`type`) に同じ形があるものだけを写す (`oval` / `round` / `rectangle` を確かめる)。
  無い形 (`barbell`、`piping` など) を見た目の近い別の形に置き換えず、理由を言って断る。
- spec で対象を絞る形 (`cartoon style :10-20 ...`) は、CueMol の section が renderer 全体の設定なので断る。
- `modeHelix tube` など、ここに無い option は今までどおり「not supported yet」で warn。

## A6. 小さな別名と keyword (数行ずつ)

- `size [spec] stickRadius r` (ChimeraX `std_commands/size.py`): stick の太さ (Å) なので、`chx:stick` (と
  `chx:ball` の棒) の `bondw` に写す。spec で一部だけを変える形は、renderer 全体の設定なので断る (分子全体か省略の
  ときだけ)。tutorial で使われていたのはこれだけ (3 行)。
- `ballScale` と `atomRadius` は断る: `ballScale` は「原子の半径に掛ける倍率」(既定 0.3) だが、CueMol の ball の
  `sphr` は元素によらない一定の半径 (Å) で、倍率を表せない。`atomRadius` は原子ごとの半径の設定で、CueMol の sphere
  (元素ごとの `vdwr_*`) や ball との関係を決めないと写せない。
- `alphafold fetch <UniProt> [pae true]`: `open alphafold:<UniProt>` と同じ (pLDDT の色も同じ)。`pae` は warn して無視。
- `colour` (英綴り。ChimeraX の別名): `color` の別名として登録する。

## A7. `color bfactor` / `color byattribute bfactor|occupancy` (4 本)

ChimeraX (`std_commands/color.py` `color_by_attr`、`color bfactor` は `color byattribute bfactor` の別名):
選んだ原子の値を、palette (既定 `blue-white-red`) で、range (既定は**選んだ原子の値**の最小 -> 最大、`range lo,hi` で
固定) に沿って塗る。原子は原子ごと、cartoon は残基ごとの平均。

- ChX は今の色の仕組み (`chx:` renderer の paint) を崩さないため、AlphaFold の pLDDT と同じく、値の範囲を段に
  分けた paint entry (`bfac > t`) で近似する (`colorSchemes.ts` の `plddtEntries` を palette と range を受ける形に
  一般化する)。後から `color /A red` と一部を塗り直しても、paint なのでそのまま重なる。
- palette は ChX の `rainbow` が読む形 (`readPalette`) を使う。
- range の既定は、**全対象の model の spec に当たる原子をまとめて**最小・最大を 1 回求め、全 model に同じ range を
  使う (ChimeraX の `_value_colors` は渡された原子全体の値から求める)。分子全体から求めると、`color bfactor /A` で
  chain A だけが palette の一部の色になり、model ごとに求めると同じ値が model で別の色になる。これは近似の対象では
  ない (段に分けるのは色だけ)。
- cartoon は、paint の selection が原子で決まるので、残基の代表原子の値で塗られる (ChimeraX の残基平均と違う)。
  違うことを warn する。
- 属性は `bfactor` / `occupancy` だけ。他 (`seq_conservation` など) は今までどおり断る。

## 確認

- 調査で使った再生の仕組み (tutorial のコマンドを順に ChX に流して分類する) で、A1-A7 の行が通ることと、
  他の行の結果が悪くならないことを確かめる。
- アプリで目視: `hide atoms,ribbon`、`show ... only`、`select zone ligand 5 residues true`、`select up` / `down`、
  `cartoon style width ...`、`color bfactor`。

## テスト (必要最小限)

- `ListOf(EnumOf(...))` がカンマ区切りを読む (A1 の不具合の再発防止)。
- `select zone` の組み立ての順序: `target` が残基の一部 (`@CB`) で `residues true` のとき、距離内の CB を含む残基の
  全原子になる (`:<` に置き換えると CB だけになる)。`extend` の有無で near が入るか。
- `select up` -> `down` で元の選択に戻り、途中で選択が変わったら down が何もしない。
- `open` の複数の名前が順に開かれ、`from eds` が `fetch_map_url` に PDBe の
  `https://www.ebi.ac.uk/pdbe/coordinates/files/<id>.ccp4` を渡す (`fetch_map` の別の経路にならない)。
- `color bfactor` の paint entry が range と palette に沿い、range の既定が全対象の model の spec に当たる原子
  全体から 1 回求めたものになる。
- `show #1 models only` が scene の他の model を隠す。

## review で決めたこと

1. A5 (`cartoon style`): 数値で換算できる寸法だけを写し (`width = W / 2`、`tuber = T / W`、片方だけなら他方の寸法を
   保つ、coil は `thickness`)、CueMol に無い断面の形は断る。
2. A7 (`color bfactor`): paint の段で近似する (合意した例外。冒頭の方針に記載)。選ぶ原子と値の範囲は近似しない。
   cartoon が残基の代表原子の値で塗られる (ChimeraX は残基の平均) ことは warn する。
