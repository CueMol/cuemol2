// -*-Mode: C++;-*-
//
// Level-of-detail helpers for the map renderers (pure functions, testable
// without a scene). The stride selection follows ChimeraX's limit_voxels:
// an isotropic power-of-two step chosen so the marched region stays under
// a cell budget, with the sample nodes aligned to multiples of the step
// relative to the map block start so that regions moved by panning keep
// sampling the same grid nodes.
//

#ifndef XTAL_MAP_LOD_HPP_INCLUDED
#define XTAL_MAP_LOD_HPP_INCLUDED

#include <algorithm>

namespace xtal {

  /// Number of marching-cubes cells spanned by a node region of
  /// (nx, ny, nz) nodes sampled at stride s (a cell needs both of its end
  /// nodes inside the region).
  inline long long lodCellCount(long long nx, long long ny, long long nz,
                                int s)
  {
    const long long cx = (nx > 0) ? (nx - 1) / s : 0;
    const long long cy = (ny > 0) ? (ny - 1) / s : 0;
    const long long cz = (nz > 0) ? (nz - 1) / s : 0;
    return cx * cy * cz;
  }

  /// Smallest isotropic power-of-two stride whose cell count over the
  /// (nx, ny, nz)-node region does not exceed budgetCells. Capped at 64.
  inline int lodStepForBudget(long long nx, long long ny, long long nz,
                              long long budgetCells)
  {
    int s = 1;
    while (lodCellCount(nx, ny, nz, s) > budgetCells && s < 64)
      s *= 2;
    return s;
  }

  /// Aligned node range on one axis: start is an absolute cell-grid node
  /// index, span is the node span (a multiple of the stride); the marched
  /// cells are [start + i*s, start + (i+1)*s] for i*s < span.
  struct LodRange {
    int start;
    int span;
  };

  /// Align the closed node range [lo, hi] (absolute cell-grid indices) to
  /// stride s within the map block that starts at node `start` and has `n`
  /// nodes: the range is clamped to the block, its low end is rounded down
  /// and its high end rounded up to block-relative multiples of s, and the
  /// high end never passes the last aligned node of the block (so no cell
  /// reads past the block). An empty range yields span 0.
  inline LodRange lodAlignRange(int lo, int hi, int start, int n, int s)
  {
    LodRange r;
    r.start = start;
    r.span = 0;
    if (n <= 0 || s <= 0)
      return r;

    lo = std::max(lo, start);
    hi = std::min(hi, start + n - 1);
    if (lo > hi)
      return r;

    const int rlo = ((lo - start) / s) * s;
    int rhi = ((hi - start + s - 1) / s) * s;
    const int last = ((n - 1) / s) * s;
    if (rhi > last)
      rhi = last;
    if (rhi < rlo)
      rhi = rlo;

    r.start = start + rlo;
    r.span = rhi - rlo;
    return r;
  }

}

#endif
