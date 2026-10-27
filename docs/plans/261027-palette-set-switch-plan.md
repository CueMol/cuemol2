# パレットのセットを GUI から入れ替える

分子の既定の色分けは、scene の style set に複製した `palette_1` .. `palette_7` を名前で参照する
(実装済みの仕様は [`../architecture/default-paint-palette.md`](../architecture/default-paint-palette.md))。
今のパレットは Okabe-Ito だけで、別の配色に替えるには `define_color` で 1 色ずつ書き換える
しかない。これを、パレットのセットとして GUI から選んで入れ替えられるようにする。

## 方針 (案)

- パレットのセットを style として定義する。例: `data/default_style.xml` に
  `type="palette"` の style を置き、子に `<color id="palette_1" value="..."/>` を並べる。
  Okabe-Ito のほか、Paul Tol (bright / vibrant / muted) や ColorBrewer (Set2 / Dark2) を候補にする。
  ユーザーの style ファイルにも同じ形で足せるようにする。
- 入れ替えは「選んだセットの値で、scene の `palette_*` を `setColor` で上書きする」操作にする。
  paint は名前で参照しているので、scene 内の分子はまとめて塗り変わる。undo 1 回で戻せること。
- 新しく読み込む分子が使う既定のセット (全体の `palette_*`) も選べるようにするか検討する。

## 未決の点

- パレットの色数がセットごとに違う場合の扱い (7 色に満たないセット、より多いセット)。
  `PALETTE` の名前一覧を固定 7 個から、セットの色数に合わせる必要がある。
- style から palette 型の style の中身 (色の一覧) を TS で読む API があるか。無ければ C++ に足す。
- GUI の置き場所 (scene tree の Styles、coloring パネル、設定画面のどれか)。
- 修飾子の値 (helix / sheet / coil のずらし量) もセットごとに持たせるか。
