# Umbreon GI 時の照明エネルギー配分

umbreon の in-process レンダリングで GI を有効にしたときの照明配分
(key light / headlight / GI が gather する ambient エネルギー) を決めた記録 (2026-09-03)。
あわせて、この配分を POV backend と同じ 3 つの property として umbreon exporter に露出し、
既定値の置き場所を tritium 側に移した。

Related: [umbreon pt2 integrator](umbreon-pt2-integrator.md),
[ADR-0042 umbreon quality presets](../migration/adr/ADR-0042-umbreon-quality-presets.md)。

## Context

render window で GI を有効にすると、GL view や POV-Ray (radiosity なし) より白っぽく
陰影の弱い絵になっていた。`UmbreonDisplayContext.cpp` は GI 時に POV radiosity 用の配分
(`_light_inten=1.6 / _amb_frac=0.5 / _flash_frac=0.5`) をそのまま採用していたが、
umbreon の GI は POV の radiosity と ambient の受け方が違う。

- GI off: flat ambient 項 = `material.ambient (default 0.2) * pigment * ambientColor (1.0)`。
- GI on: umbreon は flat ambient 項を捨て、gather した ambient を
  `giIntensity * material.diffuse (default 0.8) * pigment * E` で受ける
  (`umbreon/src/umbreon/shading/hit_shader.hpp`)。開放面では `E == ambientColor`
  (cos 加重平均、1/pi なし)。

つまり ambient エネルギーの受け係数が 0.2 から 0.8 へ 4 倍になるのに、cuemol2 側は
ambientColor に 0.8 (= 1.6 × 0.5) を載せていた。default 材質・gray 0.8 での概算:

| 面の向き | GI off (spec .52 / flash .78 / amb .2) | GI on 旧配分 (spec .4 / flash .4 / amb .8) |
|---|---|---|
| カメラ正面 | 1.06 | 1.15 |
| 横向き (key のみ) | 0.44 | 0.83 |
| key の裏側 | 0.20 | 0.64 |

向き依存の明暗比が 2.4 倍から 1.4 倍に潰れていたのが「平坦・白い」の正体。
`giIntensity` / `giEnvIntensity` は間接光項を縮めることしかできず、key light を戻すことも
headlight を減らすこともできないので、配分側を直す。両 knob の既定 1.0 は umbreon にとって
中立な値なので触らない。

参考の見た目:

- GL view (`src/sysdep/ogl_core/lighting_inc.glsl`): ambient 床 0.4·color、diffuse 0.8·N·L、headlight なし
- POV 非 radiosity (`PovDisplayContext.cpp`): spec 0.50 / flash 0.80 / 材質 ambient 0.2

## Decision

### 配分 (parity 制約)

目標は「GI on の絵 = GI off の絵 + 遮蔽を考慮した ambient」。

- key light (spec) は GI off と同じ 0.52 に固定する (方向性の陰影の源)。
- カメラ正面の開放面輝度を GI off と一致させる (default 材質):
  `0.8*(0.577*0.52 + flash) + 0.8*amb = 0.8*(0.577*0.52 + 0.78) + 0.2`
  → `flash + amb = 1.03`、総光量 `li = 0.52 + flash + amb = 1.55` (amb によらず一定)。
- 自由度は ambient エネルギー `amb` だけで、headlight (flash) と trade する。
  headlight は視線方向・影なしで平坦化の最大要因、ambient は遮蔽情報を運ぶ唯一の項。

| amb | flash | li | af | ff | ambient 床 (×pigment) | 位置づけ |
|---|---|---|---|---|---|---|
| **0.25** | **0.78** | **1.55** | **0.16** | **0.60** | **0.20** | **採用。直接光も sky 項も GI off と一致** |
| 0.40 | 0.63 | 1.55 | 0.26 | 0.55 | 0.32 | 試行。床は GI off (0.20) と GL (0.40) の間 |
| 0.50 | 0.53 | 1.55 | 0.32 | 0.50 | 0.40 | GL の床相当 (遮蔽は強いが横向き面が明るい) |

この parity 線は step 0 (raytrace 一致点) を決めるためのもの。GI lighting axis の上の段は
別の制約 (平均輝度一定、後述) で決めている。

目視確認の経緯: まず amb 0.40 を試したところ、白い材質 (pigment 1.0) のチューブや stick で
側面まで持ち上がり、正面が clip しているため陰影のない真っ白な塊になった。sky 項は向きに
依存しない一様な fill なので、raytrace の flat ambient (0.2) を超えた分だけ headlight の
cos 減衰による円筒の陰影を埋める。`giEnvIntensity` 0.6 で陰影は戻るが headlight を減らした
ままなので全体が暗くなる。parity 線上で amb 0.25 に下げると直接光が GI off と完全に一致し、
side の fill も env 0.6 相当になり、raytrace とほぼ同じ絵に GI の遮蔽とバウンスだけが
乗る状態になった (ユーザー確認済み)。

### property として露出し、既定値は tritium 側に置く

POV backend では同じ 3 値が `_light_inten / _flash_frac / _amb_frac` として `Declare=` で
渡され、C++ 側はフォールバックしか持たない (`PovrayBackend.ts`)。umbreon だけが C++ 定数
だったので同じ構造に揃えた。

- `UmbreonSceneExporter.qif`: `lightIntensity` / `flashFraction` / `ambientFraction`。
  意味は POV と同じ。`spec = li*(1-af)*(1-ff)`, `flash = li*(1-af)*ff`,
  GI on では `ambientColor = li*af`、GI off では ambientColor は 1.0 のままで af は直接光を
  減らすだけ (POV 非 radiosity と同じ)。**負値 = auto**。
- `UmbreonDisplayContext.cpp`: auto は GI off で `1.3 / 0.6 / 0` (従来どおり)、GI on で
  app の既定 (GI lighting step 4 = `1.2 / 0.05 / 0.4`、勾配 sky on)。スクリプトから `useGI`
  だけを立てても app と同じ絵になるための写し。
- `tritium/react-gui/.../UmbreonBackend.ts` は 3 値を常に明示的に送る。`lightIntensity` /
  `flashFraction` は Lights グループの値、`ambientFraction` は GI on のときだけ GI グループの
  値で、GI off では `LIGHT_DEFAULTS` の 0.16 に固定する (GI off では直接光を減らすだけの
  knob なので、GI 側で動かした値が隠れたまま raytrace を暗くしないため)。
  `LIGHT_DEFAULTS` (1.55 / 0.6 / 0.16) は GI lighting axis の step 0 と同じ値。
- `giSkyGradient` / `giGroundColor` (`pt1SkyMode` 1 と `aoGroundColor`): 天頂白・地面色の
  勾配 sky。カメラ正面の面は sky と地面を半分ずつ見るので gather する ambient が
  `(1 + 地面輝度) / 2` 倍に落ちる。C++ 側で ambientColor を `2 / (1 + 地面輝度)` 倍して
  打ち消し、勾配は「向きによる陰影」だけを変え全体の明るさを変えないようにした。

### render window の knob

当初は knob を出さない予定だったが、実験で「headlight を弱めるほど奥行きが出る」
「勾配 sky + ambient 増は raytrace では得られない見た目になる」ことが確認できたので露出した。

- **Lights** グループ (全 lighting method 共通、NPR 含む): `Light intensity` (総光量、明るさの
  knob) と `Flash fraction` (直接光のうち headlight の割合)。raytrace / AO でも効く。
- **Global Illumination** グループ: `Ambient fraction`、`Sky gradient` (既定 on)、`Ground color`。
  `GI intensity` / `GI environment` は UI から外した (Ambient fraction と重複。qif には残る)。
  Sky gradient を既定 on にしたのは、既定の step 4 ではエネルギーの 40% が sky を通り、一様な
  sky だとその fill が向きに無関係になるため。勾配は ladder には入れず独立の knob のままにする
  (軸がカメラの上方向なので構図に依存するスタイルであり、配分の段とは性質が違う)。
- **GI lighting axis** (5 段、GI 選択時のみ): 他の quality axis と違い**絵を変えるための axis**。
  headlight (ff) を 0.60 → 0.05 まで等間隔に減らし、そのエネルギーを key light と GI の
  ambient に配りつつ、総光量 (li) を 1.55 → 1.2 まで線形に下げる。axis は 3 値すべてを
  持つので、どれかを手で編集すると Custom になる。

| step | li | ff | af | key | headlight | ambient | 位置づけ |
|---|---|---|---|---|---|---|---|
| 0 | 1.55 | 0.60 | 0.16 | 0.52 | 0.78 | 0.25 | raytrace 一致 |
| 1 | 1.46 | 0.46 | 0.23 | 0.61 | 0.52 | 0.34 | |
| 2 | 1.38 | 0.32 | 0.30 | 0.66 | 0.31 | 0.41 | |
| 3 | 1.29 | 0.18 | 0.35 | 0.69 | 0.15 | 0.45 | |
| 4 | 1.20 | 0.05 | 0.40 | 0.68 | 0.04 | 0.48 | headlight ほぼ無し (**既定**) |

  既定は step 4。GI が既定の depth cue である理由がこの見た目なので、step 0 は raytrace の絵に
  戻すための逃げ道と位置づける。

  **li を下げる理由**: li 1.55 のままだと step 4 で key light が 0.88 になり、白い材質の
  key 側 (右上) が `0.8*0.88 + 0.8*0.62 = 1.2` で clip する。目視で 1.1〜1.2 が最も立体感が
  出たので、端点を 1.2 にして線形に刻んだ。結果として段を上げるほど絵は少し暗くなるが、
  key light は 0.6〜0.7 でほぼ一定に保たれ、headlight の flat な fill が GI の遮蔽付き
  ambient に置き換わっていく。
- **照明方式切り替え時の Lights の既定**: Lights グループは全方式で共有なので、GI の段で
  下げた li / ff が raytrace / AO に持ち越されないよう、`RenderLightingOption.defaults`
  (方式の判定には使わない look 既定) に raytrace / AO の `1.55 / 0.6 / 0.16` を持たせ、方式を
  選んだときに書き戻す。この値は GI lighting の step 0 と同じなので、GI を離れると GI lighting
  は step 0 に戻る (段は共有 prop の値から導出されるため、書き戻しをまたいで残せない)。
  GI は axis が段を書き戻すので defaults を持たない。

  **af の決め方 (平均輝度一定)**: 最初は「カメラ正面の開放面の輝度一定」(key 0.52 固定、
  `flash + amb = 1.03`) で af を出したが、ff 0.05 で af 0.65 となり全体が明るすぎた。
  headlight は視線との cos で横向きの面をほとんど照らさないのに、一様 sky は向きに関係なく
  足すので、正面を揃えると横向きの面 (画面の大半) が明るくなる。そこで制約を
  「カメラから見える球の平均輝度が step 0 と同じ」に変えた。可視円板上の平均は headlight が
  強度の 2/3、key light (1,1,1 方向) が 0.44、sky が 1 なので、
  `0.8*(0.44*key + 0.667*flash) + 0.8*amb = 0.80` を af について解く。ff 0.05 で af 0.35 と
  なり、目視で良かった 0.40 とほぼ一致した (実シーンでは遮蔽で gather が amb より減るぶん
  少し多め)。端点は観察値 0.40 を採り、中間は同じ曲線の形で刻んでいる。余った
  エネルギーは key light に行くので、段を上げると方向性の陰影も強くなる。

  照明方式を GI に切り替えると axis が選択中の step を書き戻すので、GI の既定配分は
  自動的に揃う。手で fraction を編集すると Custom になる (他の axis と同じ)。

## Consequences

- GI on の開放面の明るさと向き依存の陰影が GI off と同等になり、ポケット・接触部だけが
  GI で暗くなる。直接光は 0.8 から GI off と同じ 1.3 (key 0.52 / headlight 0.78) に戻る。
- 白が密集した領域では隣接面からのバウンスで側面がやや持ち上がる。これは sky 項ではなく
  間接光全体の話なので、配分ではなく `giIntensity` で調整する。
- **トレードオフ**: amb を下げるほど、直接光で照らされた隣接面からのバウンス
  (≈ 0.8·pigment·直接光) が sky 項より明るくなり、浅い接触部は暗くならず color bleeding が
  目立つ。深いポケットは隣接面自体が暗いので遮蔽の暗さは残る。旧配分の amb=0.8 は
  バウンスの最大値と sky が釣り合う点で、ポケットは最も暗くなるが平坦になる。
- ambientColor は scene で 1 値なので default 材質基準で合わせている。matte (ambient 0.3) や
  diff_metal (ambient 0.35 / diffuse 0.30) は GI on で GI off よりやや暗くなる。
- 既定値が C++ (auto) と TS (`LIGHT_DEFAULTS` = GI lighting axis の step 0) の 2 か所にある。
  アプリは常に TS の値を送るので実害はないが、step 0 を変えたら C++ の auto も揃えること。
- 勾配 sky は上を向いた面を明るく、下を向いた面を暗くする。輝度補正で正面の明るさは保つが、
  下向きの面は一様 sky より暗くなる。

## Notes

- テストは配線の確認だけに留める (明るさの妥当性は目視で確定するもので、輝度を pin すると
  調整のたびに追随が要る):
  - `UmbreonExport.LightBalancePropertiesChangeTheOutput` — 3 つの property と勾配 sky を
    それぞれ単独で変えると出力が変わる (`ambientFraction` / 勾配 sky は GI on で確認)
  - `umbreonBackend.test.ts` — Lights の 2 値と GI の ambient fraction / sky が exporter に
    書かれ、GI off では ambient fraction が 0.16 に固定される
  - `useRenderSettings.test.ts` — GI lighting axis が ff / af を書き、`lightIntensity` の編集は
    axis を Custom にしない
- GI off 側の `ff=0.6` と POV exporter の `0.8/1.3 = 0.615` のずれ、`DistantLight::angularRadius`
  の parity は従来どおり deferred ([umbreon pt2 integrator](umbreon-pt2-integrator.md))。
- umbreon 側の根拠: `umbreon/docs/quality_presets.md` (client は `scene.ambientColor` に
  ambient エネルギーを載せ、direct light を対応して下げる)、`umbreon/docs/pt1_tuning.md`
  (`_amb_frac` を通るエネルギーだけが遮蔽情報を運ぶ)、
  `umbreon/src/umbreon/render/render_options.hpp` の `giEnvIntensity` コメント。
