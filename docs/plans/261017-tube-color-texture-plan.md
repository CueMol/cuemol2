# tube 系 renderer の残基ごとの色 texture (将来案)

**未実装 / 今後実装する案。** 導入の判断基準は「色の更新 (CPU での再計算と VBO 全体の送信) が
ボトルネックになっているかどうか」。

## 現状

`TubeGpuSupport` は色を頂点ごとの rgba8 (`TrigGpuPrim::TrigVertAttr`) で持つ。色が変わると
traversal を Update(UPD_COLOR) モードで回し、軸方向の点ごとに `calcColor` (`GradientColor` を
new する) を呼んで頂点の色を書き換え、VBO 全体を `glBufferSubData` で送る。

## 案

- 頂点には静的な **色キー** を持たせる: (残基 index i, rho, variant)
  - variant = main / helix の裏面色 (`RibbonRenderer::m_pHelixBackCol`) / sheet の側面色 (`m_pSheetSideCol`)
- 色は **残基ごとの table** を `gfx::FloatDataTexture` に置く (行 = variant)
- shader で `mix(col[i], col[i+1], rho)` (smooth color)、または rho>0.5 で選択 (非 smooth)
- seg-end fade の alpha 係数は静的な頂点属性にする
- `TrigGpuPrim` に「色を texture から引く」モードを追加し、edge / silhouette / pick / lighting の実装を再利用する
  (新しい GpuPrim は作らない)

## 効果

- 色変更のコストが残基数のオーダーになる: 色スキームの評価は残基ごとに 1 回、upload は N 残基 x 4 byte 程度
- VBO には触らない。座標と色が同時に変わっても、VBO の subdata と texture の update は独立

## 着手時の確認事項

- `MainChainRenderer::calcColor(rho, bSmoCol, r1, r2)` (`GradientColor`) の補間空間 (RGB 線形か) と、
  devcode 変換 (color profile) の順序が shader の `mix` と一致するか
- 半透明 (残基ごとの transparency) の扱い
- ファイル出力と fallback は従来どおり CPU で色を計算する (builder の direct モード)
