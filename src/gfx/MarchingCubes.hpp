// -*-Mode: C++;-*-
//
//  Shared marching-cubes cell helpers
//
//  Small inline helpers encoding the per-cell marching-cubes contract shared
//  by the scalar-field MC implementations (xtal MapSurfRenderer and surface
//  DistMapMarchingCubes): the corner inside-mask convention
//  (value <= isolevel), the edge interpolation rule (0.5 on a flat edge),
//  and the triangle-table iteration. The value/level types are templated so
//  each caller keeps its existing floating-point comparison semantics
//  bit-for-bit.
//
//  Grid traversal, vertex welding, PBC, binning, and masking policies stay
//  in the callers; only the per-cell table logic lives here.
//

#ifndef GFX_MARCHING_CUBES_HPP_INCLUDED
#define GFX_MARCHING_CUBES_HPP_INCLUDED

#include "MarchingCubesTables.hpp"

namespace gfx {
namespace mc {

  /// 8-bit corner inside-mask: bit c is set when values[c] <= level.
  template <typename ValT, typename LevT>
  inline int cornerFlags(const ValT values[8], LevT level)
  {
    int flags = 0;
    for (int c = 0; c < 8; ++c) {
      if (values[c] <= level)
        flags |= (1 << c);
    }
    return flags;
  }

  /// Edge intersection flags for a corner inside-mask.
  inline int edgeFlags(int flagIndex)
  {
    return mctables::cubeEdgeFlags[flagIndex];
  }

  /// Interpolation parameter of the isosurface crossing on an edge with
  /// endpoint values v0/v1; returns 0.5 when the edge is flat (v1 == v0).
  template <typename Float>
  inline Float edgeOffset(Float v0, Float v1, Float level)
  {
    const Float d = v1 - v0;
    if (d == Float(0))
      return Float(0.5);
    return (level - v0) / d;
  }

  /// Call fn(e0, e1, e2) for each triangle (as edge indices) of the cell's
  /// corner inside-mask, in table order, stopping at the -1 terminator.
  template <typename Fn>
  inline void forEachTriangle(int flagIndex, Fn &&fn)
  {
    const int *tri = mctables::triangleConnectionTable[flagIndex];
    for (int t = 0; tri[t] != -1; t += 3)
      fn(tri[t], tri[t + 1], tri[t + 2]);
  }

}  // namespace mc
}  // namespace gfx

#endif  // GFX_MARCHING_CUBES_HPP_INCLUDED
