# ChX tutorial syntax 計画レビュー（更新版）

対象: [261107-chx-tutorial-syntax-plan.md](../plans/261107-chx-tutorial-syntax-plan.md)  
レビュー日: 2026-11-07（第 3 回レビュー）

**追加指摘なし。前回残っていた EDS のテスト契約も修正され、これまでの指摘は計画上で対処されています。** 更新後の全文を確認しました。今回、追加で修正を求める実益のある問題は見つかりませんでした。

「テスト（必要最小限）」138–139 行が、`from eds` から `fetch_map_url` に PDBe の `https://www.ebi.ac.uk/pdbe/coordinates/files/<id>.ccp4` を渡す内容に修正されています。A2 の実装方針と一致し、旧経路の `fetch_map` を期待する矛盾は解消しています。既存の [mapOps.ts](../../tritium/react-gui/src/renderer/worker/server/catalog/ops/mapOps.ts) の `fetchMapUrl` の引数・読み込み経路とも整合しています。

## 前回指摘の対応確認

| 前回の指摘 | 更新された計画 | 判定 |
|---|---|---|
| `select zone` の残基展開の順序が違う | A3 で target から near を除外 → 原子単位の距離判定 → extend → 最後に byres の順に修正 | 計画上で解消 |
| `view cofr false` を何もしない成功にする | A4 で false は理由付きで拒否、true は通常の view として実行 | 計画上で解消 |
| 属性色付けの自動 range の母集団が違う | A7 で全対象モデルの spec に一致する原子から共通 range を一度計算 | 計画上で解消 |
| `show ... models only` で指定外モデルが残る | A1 で scene の指定外モデルを非表示にする処理を追加 | 計画上で解消 |
| 核酸に protein ribbon の property を書く | A5 で protein の helix / sheet / coil と nucleic の section を分離 | 計画上で解消 |
| `ballScale` を一定半径に置き換える | A6 は stickRadius のみ対応し、ballScale / atomRadius は理由付きで拒否 | 計画上で解消 |
| EDS の要求を別の取得元・経路に置き換える | A2 で PDBe の CCP4 を fetch_map_url で取得。テストも同じ op と URL を期待するよう修正 | 計画上で解消 |

## 方針判断の確認

A5 の「寸法を数値換算し、対応しない断面形状は書き込み前に断る」、A7 の「paint による段階近似を明示した例外とし、選択対象と自動 range は近似しない」という方針は、前回の判断と整合しています。

A5 の軸方向は計画どおり実装開始時に確認する前提です。今回のレビューで、`width = W / 2` / `tuber = T / W` が protein と nucleic の実際の幅・厚み方向にそのまま対応することまで検証済みとはしていません。

## 確認範囲

計画全文と前回レビューを比較し、今回変更された EDS のテスト契約を地図取得 op と照合した静的レビューです。その他の項目は前回までのコード照合結果を踏まえて確認しています。判定は計画への対応を示し、実装済みを意味しません。tutorial の再実行、外部サーバーへの取得、ビルド、アプリの目視確認は行っていません。計画本文と実装コードは変更していません。
