# Extra upload-path conditions (F, G, H)

These three conditions follow the ring x staging ablation. They are
**experiments only**, and live on `bench/ablation` alone: they are not meant
for develop and were not adopted.

Each patch is a delta on top of condition D. D is `ebb4bddb` with
`harness-overlay.patch` applied.

| condition | coordinate texture | upload | patch |
|---|---|---|---|
| D | RGB32F | `texSubImage2D` from client memory | (none) |
| F | RGB32F | through a pixel unpack buffer (PBO), 2-face ring | `F.patch` |
| G | RGBA32F (xyzw, w = 1) | `texSubImage2D` from client memory | `G.patch` |
| H | RGBA32F (xyzw, w = 1) | through a PBO, 2-face ring | `H.patch` |

Patches touch `TextureStore.ts` (F, G, H) and `CoordTexSupport.cpp` (G, H: four
components per atom). The shaders are unchanged, because
`getAtomPos3()` reads `.xyz`. In F and H, `texUpload` spans the
`bufferSubData` into the PBO as well as the `texSubImage2D` that reads it.

To rebuild a condition:

```sh
git worktree add --detach ../abl/X ebb4bddb
cd ../abl/X && git apply --3way ../harness-overlay.patch && git apply -p1 <this dir>/X.patch
```

## Result (Apple M2, 3J3Q coord-morph, 3 runs each)

| | D | F | G | H |
|---|---:|---:|---:|---:|
| update fps | 57.6 | 52.4 | 54.4 | 57.1 |
| texUpload ms | 6.68 | 8.99 | 8.59 | 6.30 |
| bytes per frame | 29.3 MB | 29.3 MB | 39.1 MB | 39.1 MB |
| GPU-process CPU per frame for the upload | ~7.4 ms | ~2.2 ms | ~4.5 ms | ~2.1 ms |

The GPU-process figures are estimates from `sample` profiles:
`results/ablation-m2-20260925/profiles/`.

- **D** runs an ANGLE loop that converts RGB to RGBA, then Metal
  `replaceRegion`, which makes the AGX driver twiddle the data into its tiled
  layout on the CPU.
- **F** removes both from the CPU; ANGLE copies from the PBO on the GPU. It is
  nevertheless slower at the application level.
- **G** removes the conversion and the twiddle: ANGLE copies to a staging
  Metal buffer and blits on the GPU. It sends 33% more bytes.
- **H** has the least hidden work, one linear memcpy into the PBO. At the
  application level it is no faster than D, and it varies more between runs.
  In 4V6X (60 fps in every condition) D has the lowest CPU time.

**Decision: RGBA32F and PBO are not adopted.** They remove copies inside ANGLE
without improving the frame. The remaining limit appears to be the
renderer-to-GPU-process transfer, and that part has not been verified.
