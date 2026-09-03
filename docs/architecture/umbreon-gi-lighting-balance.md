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

調整するときは `li = 1.55` を固定し、`af` と `ff` を parity 線上で一緒に動かす。

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
  `1.55 / 0.6 / 0.16`。スクリプトから `useGI` だけを立てても妥当な配分になるための写し。
- `tritium/react-gui/.../UmbreonBackend.ts` の `LIGHT_BALANCE` が**アプリの SSOT**。
  GI on なら `gi`、raytrace / AO / NPR なら `direct` の 3 値を常に明示的に送る。
  既定値の調整は TS を編集して `task build_tritium` するだけで済み、C++ の再ビルドは不要。
- render window には knob を出さない。必要になれば PropDef を足して
  `UmbreonBackend.ts` を `numVal` 参照に変えるだけで載る。

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
- 既定値が C++ (auto) と TS (`LIGHT_BALANCE`) の 2 か所にある。アプリは常に TS の値を送るので
  実害はないが、TS を確定したら C++ の auto も揃えること。

## Notes

- テストは配線の確認だけに留める (明るさの妥当性は目視で確定するもので、輝度を pin すると
  調整のたびに追随が要る):
  - `UmbreonExport.LightBalancePropertiesChangeTheOutput` — 3 つの property をそれぞれ
    単独で変えると出力が変わる (`ambientFraction` は GI on で確認)
  - `umbreonBackend.test.ts` — GI on で `gi`、GI 無しで `direct` の 3 値が exporter に書かれる
- GI off 側の `ff=0.6` と POV exporter の `0.8/1.3 = 0.615` のずれ、`DistantLight::angularRadius`
  の parity は従来どおり deferred ([umbreon pt2 integrator](umbreon-pt2-integrator.md))。
- umbreon 側の根拠: `umbreon/docs/quality_presets.md` (client は `scene.ambientColor` に
  ambient エネルギーを載せ、direct light を対応して下げる)、`umbreon/docs/pt1_tuning.md`
  (`_amb_frac` を通るエネルギーだけが遮蔽情報を運ぶ)、
  `umbreon/src/umbreon/render/render_options.hpp` の `giEnvIntensity` コメント。
