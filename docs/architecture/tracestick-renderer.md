# Ball & stick trace renderer (`tracestick`)

主鎖の pivot atom (タンパク質は CA、核酸は P。`pivotatom` 空欄時は残基 topology の既定)
を **sphere + cylinder** で結んで描く renderer (`molvis::TraceStickRenderer`)。
`simple` (線) に対する `ballstick` と同じ関係を `trace` (線) に対して与える。

移行項目ではない (UXP に同等の renderer は無い)。

## 構成

- `src/modules/molvis/TraceStickRenderer.{hpp,cpp,qif}`
- `molstr::MainChainRenderer` + `molstr::CoordTexSupport` を継承。
  `MainChainRenderer::render()` の残基 traversal と segment 判定 (`isNewSegment`: chain 境界、
  `MolResidue::isLinkedTo` が偽、pivot atom の無い残基で切れる) をそのまま使うので、
  **stick の切れ目は `trace` の線の切れ目と一致する**。
- `pivotatom` / `coloring` / selection などは MainChainRenderer / MolRenderer 由来。
  `MainChainRenderer` 派生なので disorder renderer の target にもなれる。

## Properties

| property | default | 意味 |
|---|---|---|
| `bondw` | 0.25 | cylinder 半径 (0 で stick 無し) |
| `sphr` | 0.25 | pivot atom 上の sphere 半径 (0 で sphere 無し) |
| `detail` | 3 | tessellation (display-list / file 出力で使用) |

## 描画経路

1. **coordinate texture 経路 (GL の通常経路)**: `collectTopology()` で render() を collect モード
   (DisplayContext を触らない) で走らせ、pivot atom 列と連続 pivot 対を集める。pivot atom 毎に
   `gfx::SphereIdxGpuPrim`、pivot 対毎に `gfx::CylinderIdxGpuPrim` を 1 本
   (両端の残基色が違えば t=0.5 で 2 本に分割、`ballstick` と同じ) 作る。
   `atomsMoved` では座標 texture の再送だけを行う (MD 再生の追従)。
2. **display-list 経路 (file 出力 = POV-Ray 等、shader 不可時の fallback)**: 同じ traversal で
   `DisplayContext::sphere` / `cylinder` を直接発行する。

hit name は pivot atom の AID で、picking / hover は残基単位 (`MainChainRenderer::interpHit`)。

## Styles (`data/default_style.xml`)

style ID は GUI の Style メニューが `<type_name>$/i` で拾うので `...TraceStick` で終える。

| id | desc | bondw / sphr |
|---|---|---|
| `DefaultTraceStick` | Default | 0.25 / 0.25 (stick) |
| `ThickTraceStick` | Thick | 0.5 / 0.5 (stick) |
| `BallTraceStick` | Ball & stick | 0.2 / 0.4 |
| `ThickBallTraceStick` | Thick ball & stick | 0.35 / 0.7 |

tritium で新規作成した renderer の既定 style は `DefaultTraceStick,DefaultHSCPaint`
(`getDefaultStyleName.ts`)。Inspector は `schema/tracestick.ts` (`ballstick` の
`sphereStickRows` を共用、ring 行は無し)。
