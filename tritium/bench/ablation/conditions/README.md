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

## Result

Measured on the Apple M2 against D (3J3Q and 4V6X coord-morph, 3 runs each); raw results
in `results/ablation-m2-20260925/pbo-F/` and `rgba-pbo/`, GPU-process profiles in
`profiles/`. **RGBA32F and PBO are not adopted.**
