# Umbreon GI — pt2 integrator を明示 pin

umbreon の indirect GI integrator を libcuemol2 側から明示的に pin する判断の記録
(2026-07-17)。浮動 ref (`UMBREON_GIT_REF=main`) に追従することで絵が黙って変わるのを
防ぐのが目的。

Related: [umbreon group-alpha blend](umbreon-group-alpha-blend.md),
[umbreon の Electron メモリ制約と process 分離設計](umbreon-process-isolation.md)。

## Context

umbreon が indirect integrator の既定を pt1 から **pt2** に変更した (`0a31cab`, 2026-07-17)。
`RenderOptions::giIntegrator` の既定が `1` → `2` になり、同時に pt1 は
「FROZEN as the regression anchor: bit-identical to its 2026-07 behavior forever」と宣言され、
A/B 比較と refactor gating 専用になった。今後の GI 改良は pt2 にしか入らない。

cuemol2 は `UmbreonDisplayContext::buildSceneAndOptions()` で `opt.giIntegrator = 1` と
**pt1 を明示 pin していた**。そのため既定値変更の影響は受けない代わりに、永久凍結された
integrator に固定され続ける状態にあった。

同じ時期に principled BSDF サブセットの material API (`ShadingModel` enum + `Material::Pbr`) も
追加されたが、こちらは**純粋な追加**である。`ShadingModel::Pov = 0` が既定で bit-exact、
リネーム・削除・シグネチャ変更はゼロなので、移行を強制されるものではない。

## Decision

`UmbreonDisplayContext::buildSceneAndOptions()` の GI ブロックで
**`opt.giIntegrator = 2` を明示 pin する**。UI / `.qif` には integrator 選択を露出しない。

「未設定にして umbreon の既定に追従する」案は採らなかった。`build_scripts/deplibs.env` の
`UMBREON_GIT_REF=main` は**浮動 ref** であり、追従すると umbreon が将来 pt3 を既定に昇格した
時点で cuemol2 のレンダリング結果が黙って変わる。明示 pin であれば、integrator の更新は
常に意図的なコミットとして残る。

UI 露出しないのは、選べる相手が frozen anchor である pt1 しかなく、ユーザー向け設定として
提示する価値が薄いため。`.qif` にプロパティを足さないので、生成 TS/Python/xpcjs wrapper の
再生成も tritium 側 (`UmbreonBackend.ts` / `renderBackends.ts`) の変更も発生しない。

## Consequences

**得られるもの**: pt2 は pt1 と同じ gather core の superset で、traced mirror/glossy reflection、
GI 光源としての emissive geometry (+ NEE/MIS)、blue-noise sampler、variance-adaptive spp を追加する。
各拡張はシーンが実際にその material/light を持つ場合のみ動くので、該当しないシーンのコストは pt1 と同じ。

**既定の絵は変わらない**: `RenderOptions::gi = false` が master gate であり、cuemol2 の既定は
GI オフ (`UmbreonSceneExporter::m_bGI = false`)。GI を有効にしたときだけ pt2 が走る。

**GI オン時の metal 材質の見た目が変わる**: `UmbreonDisplayContext.cpp` の `F_MetalA..E` テーブルは
`reflection` 0.10-0.80 と `specular` 0.70-0.80 を併せ持つ。pt2 の `pt2Reflect` / `pt2Glossy`
(いずれも既定 true) が、従来の偽の `reflection * background` 項を実際にトレースした GGX glossy 反射
(`pt2GlossySpp = 8`) に置き換える。`default_style.xml` の `spec_metal` (F_MetalD) / `diff_metal`
(F_MetalA) がこの経路に乗る。背景色ではなく実ジオメトリを映すようになる改善だが、metal 材質を含む
シーンの GI レンダリングは 8 spp 分重くなる。

**`lightRadius` は影響を受けない**: pt2 が per-light `DistantLight::angularRadius` を使うのは
`> 0` のときだけで、cuemol2 は設定していない (既定 0)。`radians(opt.lightRadius)` にフォールバックする。

**ABI**: `Material` が `model` + `Pbr` 分、`RenderOptions` が pt2 フィールド分だけサイズが増えた。
静的リンクで ABI 保証は無いため、umbreon 更新時は libcuemol2 のクリーンリビルドが必要。

## Notes

### 実装ポインタ

- `src/modules/rendering/UmbreonDisplayContext.cpp` — `buildSceneAndOptions()` の `if (prm.giEnabled)` ブロック。
  cuemol2 内で `umbreon::` シンボルに触れるのはこのファイルのみ (pimpl `struct Impl` で型を隠蔽)
- `src/modules/rendering/UmbreonSceneExporter.qif` — `useGI` / `giSamples` / `giIntensity` /
  `giEnvIntensity` / `giDenoise` / `denoiser`。integrator は露出しない
- `src/tests/modules/rendering/test_umbreon_export.cpp`:
  - `GlobalIlluminationAffectsOutput` — スモークテスト (GI 有無で出力が異なることのみ)。
    デフォルト材質しか使わないため pt2 化の影響を受けず、そのまま pass する。
    **pt1/pt2 の切替は検出できない**
  - `ReflectiveMaterialMirrorsSceneGeometryUnderGI` — 本 ADR で追加。integrator の定数ではなく
    **観測される仕様「反射材が背景色でなく実ジオメトリを映す」** を pin する。45 度傾けた
    `spec_metal` パネルの鏡面方向 (-X) に、視錐台外かつカメラから edge-on の赤い `matte` パネルを置き、
    metal 中心画素の R-B を見る。実測値: **pt2 = 119 / pt1 = 2** (閾値 40)。
    切替を pt1 に戻すと確実に fail することを確認済み

  > 反射させる面に `nolighting` を使うと機能しない。`diffuse = 0` のため `diffuseWeight()` が 0 になり、
  > gather に一切ラディアンスを供給しない (ambient-only の見た目はカメラから見える自己照明限定)。

### umbreon 側の SSOT

`umbreon/docs/api/libumbreon.md` は**内容が古く、そのまま信用してはいけない**:

- GI を「なし（設計上スコープ外）」「single-bounce」と記述 (§1, §8) — pt2 以降は虚偽
- §4.6 の「全フィールド」表が約 50 フィールド欠落 (`gi`, `giIntegrator`, 全 `pt1*` / `pt2*` / `denoise*` / `env*` など)
- §4.4.1 の sphere anisotropy pole を `world-z` と記述 — 実際は `world +Y` (`292d28c` で修正済み)
- `render_options.hpp` の `gi` フィールドのコメント自体にも「gi==on は gi==off と同じ色を出す」という
  cache 時代の古い注記が残っている

**ヘッダー実物を SSOT として扱うこと** (`umbreon/src/umbreon/{umbreon,scene}.hpp`,
`umbreon/src/umbreon/render/*.hpp`)。

### 追従した既定値変更 (cuemol2 が明示設定していないもの)

`4f9b18b` (2026-07-16) で `pt1Ld` が `false` → `true`、`pt1GatherDiv` が `0` → `-1` に変更された。
cuemol2 はどちらも設定していないので、これらは既に暗黙に吸収されている。浮動 ref 追従の
リスクを示す具体例であり、`giIntegrator` を明示 pin する判断の裏付けでもある。

なお `pt1Spp` / `pt1Denoise` は pt1 命名のまま **pt2 にも適用される** (umbreon が両者で
gather core を共有しているため)。cuemol2 の `giSamples` / `giDenoise` は変更不要。

### Deferred: principled BSDF material

`ShadingModel::Principled` + `Material::Pbr` (`pbr.metallic` / `pbr.roughness` / `pbr.specular` /
`pbr.anisotropy` / `pbr.anisotropyRotation`) の採用は見送った。参考実装は
`umbreon/src/bench/material_convert.cpp` (94 行) だが **bench 専用でインストールされない**ため、
採用するなら cuemol2 側への移植になる。

見送りの理由:

- 変換は明示的にロッシー — bitwise 一致が保証されるのは diffuse-only 材 (specular=0, phong=0,
  reflection=0, brilliance=1) のみ
- reflection + highlight → `pbr.metallic` の写像は umbreon 側が自ら "FLAGGED HEURISTIC" と注記
- toon 材 (`toon1` / `toon2` / `nolighting`) は `Material::toonLike()` により Pov 維持が必須
- base color は Material のフィールドではなく既存の pigment (`Mesh::colors` / `Sphere::color`)
- IOR / transmission / coat / sheen / subsurface は umbreon 側で意図的に**不採用** (`principled_design.md` §2)

`spec_metal` / `diff_metal` を本物の GGX メタルにできる価値はあるが、絵の変化が広範囲になるため別 PR とする。

### 関連ドキュメント

- [ADR-0035](../migration/adr/ADR-0035-render-window.md) — GI 設定を載せている render window
- [ADR-0037](../migration/adr/ADR-0037-scene-export-capability-gate.md) — `HAVE_UMBREON` の capability gate

### その他の deferred 事項

- **quality presets**: `umbreon/docs/quality_presets.md` が client 側実装として low/medium/high/reference を提案。
  ライブラリに preset API は無く (`--quality` は bench CLI 限定)、品質軸 (`pt1Spp` / `pt1GatherDiv`) と
  見た目軸 (`giBounces` / `giIntensity`) を分離し `giBounces` は段間で固定すべき、という設計指針を含む
- **`aoDistance` の既定値**: C++ は `1e20` (実質無限)、UI は `100`。docs は bbox 対角の 0.5-0.85 倍を
  client が計算することを要求している
- **`DistantLight::angularRadius` のパリティ**: umbreon の POV reader は SpecLighting に
  `atan(spread/40)` を設定するが、cuemol2 の in-process 経路は 0 のまま。pt2 のみが読む per-light soft shadow
