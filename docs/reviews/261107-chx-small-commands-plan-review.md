# ChX small commands 計画レビュー（更新版）

対象: [261107-chx-small-commands-plan.md](../plans/261107-chx-small-commands-plan.md)  
レビュー日: 2026-11-07（第 2 回レビュー）

**追加指摘なし。前回の 5 件は計画上で対処されています。** 更新後の全文と変更箇所を確認し、今回、追加で修正を求める実益のある問題は見つかりませんでした。

## 前回指摘の対応確認

| 前回の指摘 | 更新後の計画 | 判定 |
|---|---|---|
| `unitcell` を枠の表示に対応付けている | `unitcell outline` のみ枠に対応付け、コピーを生成する `unitcell` と削除する `unitcell delete` は拒否 | 計画上で解消 |
| `unzone` で境界が解除されない | `bndry_molname` を空にし、`region_mode` を `full` に戻す。テストにも反映 | 計画上で解消 |
| 結晶地図の box の mesh に `step` が効かない | `isosurf` と full の `contour` で受理し、box の `contour` の `step > 1` は書き込み前に拒否。同じ行の `region all` も考慮 | 計画上で解消 |
| Original Look で分子表面が残る | Initial Styles 共通で `chx:surface:*` の `showsel` を `none` にしてからスタイルを適用。テストにも反映 | 計画上で解消 |
| lighting の近似が方針と矛盾し、相違も伝わらない | AO による近似を明示的な例外とし、`soft` / `gentle` / `full` / `flat` と `multiShadow` の警告を規定。Overall Look にも同じ基準を適用 | 計画上で解消 |

## 実装との整合性

表面を隠す `showsel = none` は、既存の [surface.ts](../../tritium/react-gui/src/plugins/chimerax-console/worker/surface.ts) の処理と整合しています。`step` の対応条件も、[MapMeshRenderer.cpp](../../src/modules/xtal/MapMeshRenderer.cpp) と [MapSurfRenderer.cpp](../../src/modules/xtal/MapSurfRenderer.cpp) の描画経路に合っています。

`unzone` の解除方法は [MapRenderer.cpp](../../src/modules/xtal/MapRenderer.cpp) の `setupMolBndry()` と、表示範囲を全体に戻す処理は ChimeraX の `volume_unzone` と整合しています。

lighting の近似を採用する判断は、今回明記された例外として扱います。近似そのものを理由に再度の修正は求めません。

## 確認範囲

計画全文と前回レビューを比較し、変更された対応付けを関連する CueMol・ローカルの ChimeraX ソースと照合した静的レビューです。判定は計画への対応を示し、実装済みを意味しません。tutorial の再実行、外部サーバーへの取得、ビルド、アプリの目視確認は行っていません。計画本文と実装コードは変更していません。
