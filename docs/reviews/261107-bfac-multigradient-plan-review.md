# B-factor multi-gradient 計画レビュー（更新版）

対象: [261107-bfac-multigradient-plan.md](../plans/261107-bfac-multigradient-plan.md)  
レビュー日: 2026-11-07（第 3 回レビュー）

**追加指摘なし。前回までの 6 件は計画上で対処され、将来の抽象化に関する設計コメントも反映されています。** 更新後の全文を確認し、変更された実装順序と C++ の役割分担を関連コードに照合しました。今回、追加で修正を求める実益のある問題は見つかりませんでした。

Phase 2 に coloring 側の gradient を扱う service / op / 記録の拡張が移され、AlphaFold への適用と同じ PR に含まれています。記録の再生で同じ色付けになることも完了条件になり、前回の依存順序の問題は解消しています（§3、140–146 行）。

## 設計コメント: 将来の「スカラー値 → 色」の抽象化との整合性

§2.1「役割の境界」（53–58 行）に、以下の設計コメントの要点が反映されています。

**今回の計画は、gradient を「スカラー値から色を計算する操作」の一実装として将来抽象化する方針と両立します。このプランで抽象クラスの導入やリファクタリングを行う必要はありません。**

既存の `MultiGradient::getColor(double) const` は、原子・分子・renderer を引数に取らず、スカラー値から色を返します。今回の `BfacColoring` でも「原子から B-factor / occupancy / 距離を取得する処理」と「得た値を色に変換する処理」を分け、後者を `MultiGradient::getColor(value)` に委譲すれば、将来の置き換え境界を保てます。B-factor や pLDDT 固有の知識は `MultiGradient` に追加しません。絶対値の node を使う案も、この分担と整合します。

実装時に保つ境界は次の 2 点です。

- **従来の二色に戻す判断は `BfacColoring` 側に置く。** node が空の場合の fallback は既存設定との互換性を維持する方針なので、`MultiGradient` 自体の空の場合の挙動を Bfac 用に変更しません。将来の評価用インターフェースも node 数や node 編集を必須にしなければ、数式や閾値による色付けなど、node を持たない実装を扱えます。
- **色の評価に編集・保存・Undo の処理を混ぜない。** 現状の `MultiGradient` は同じクラスに XML / JSON、変更通知、Undo を持ちますが、`getColor()` の計算処理とは分かれています。今回も評価関数に親 renderer の参照や変更通知を持ち込まなければ、将来、評価部分の切り出しや評価用インターフェースの追加が可能です。

既存の `ScalarColorSupport` も、座標からスカラー値を取得した後、`scalarColor(par, mode)` で三色 ramp と `MultiGradient` を切り替えており、将来の抽象化を適用する候補です。一方、`ColoringScheme` は「原子 → 色」のインターフェースなので、「スカラー値 → 色」とは別の層として扱うのが自然です。

`.qif` の `multi_grad` は具体型 `MultiGradient` を公開しているため、将来の移行では既存の保存形式・スクリプト API との互換性を考慮する必要があります。ただし、この契約は表面・地図にも既に存在します。今回、その公開形式を維持し、内部で `getColor(value)` に委譲することは将来の抽象化を妨げません。

根拠: [MultiGradient.hpp](../../src/qsys/MultiGradient.hpp)、[BfacColoring.cpp](../../src/modules/molstr/BfacColoring.cpp)、[ScalarColorSupport.cpp](../../src/modules/surface/ScalarColorSupport.cpp)、[ColoringScheme.hpp](../../src/modules/molstr/ColoringScheme.hpp)。Bfac の多色対応は未実装なので、既存コードと計画の組み合わせに対する評価です。

## 前回指摘の対応確認

| 前回の指摘 | 更新された計画 | 判定 |
|---|---|---|
| AlphaFold への適用が後続 Phase の op 拡張に依存する | §3 で coloring 側への書き込み・記録の拡張を AlphaFold 対応と同じ Phase 2 に移動し、再生確認を完了条件に追加 | 計画上で解消 |
| renderer 直下と coloring 側の gradient を取り違える | §2.4 で `gradient: 'renderer' / 'coloring'` を明示し、記録にも保存。省略時は既存の renderer 側 | 計画上で解消 |
| 分子 object を選んだ Bfac deck で取得・更新できない | §2.4 で component → service → op に `targetKind` を通し、`resolveColoringTarget` を使用 | 計画上で解消 |
| style の XML 例が読み込み形式と不一致 | §1 / §2.3 / §5.3 を `par` / `col` 形式に修正 | 計画上で解消 |
| 二段の変更通知を React 側が除外する | §2.1 / §2.4 / §5.1 にイベント名の確定と両 hook のフィルタ対応を追加。§4 に Undo / Redo の表示同期確認 | 計画上で解消 |
| node を空に戻した記録が再生できない | §2.4 に空の `nodes` をクリアとして受け付ける契約、§4 に再生確認を追加 | 計画上で解消 |

## 確認範囲

計画全文と、gradient の対象解決、service / op の引数・記録、XML 読み込み、React のイベントフィルタを照合した静的レビューです。判定は計画への対応を示し、実装済みを意味しません。ビルド・アプリ実行・新規テストは行っていません。計画本文と実装コードは変更していません。
