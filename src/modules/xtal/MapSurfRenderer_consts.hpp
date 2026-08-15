// -*-Mode: C++;-*-
//
//  Border-cap tables for MapSurfRenderer::generateSurfObj()
//
//  Tables used to close the isosurface at the display-extent boundary when
//  generating a MolSurfObj (the pdl==NULL path). The core marching-cubes
//  tables live in gfx/MarchingCubesTables.hpp; only the xtal-specific
//  border-cap tables remain here.
//

#ifndef XTAL_MAP_SURF_RENDERER_CONSTS_HPP_INCLUDED
#define XTAL_MAP_SURF_RENDERER_CONSTS_HPP_INCLUDED

static const int border_plane[12][3] =
{
  {0, 0, 0},
  {0, 0, 1},
  {0, 1, 0},

  {0, 1, 1},
  {0, 1, 0},
  {0, 0, 1},

  {0, 0, 0},
  {0, 1, 0},
  {0, 0, 1},

  {0, 1, 1},
  {0, 0, 1},
  {0, 1, 0},
};

static const int border_normal[6][3] =
{
  {-1,0,0},
  { 1,0,0},
  {0,-1,0},
  {0, 1,0},
  {0, 0,-1},
  {0, 0, 1},
};

static const int bdr_verts[6][8] =
{
  // X
  {0, 4, 7, 3,
    8+8, 7+8, 11+8, 3+8},
  {1, 2, 6, 5,
    1+8, 10+8, 5+8, 9+8},

  // Y
  {0, 1, 5, 4,
    0+8, 9+8, 4+8, 8+8},
  {3, 7, 6, 2,
    11+8, 6+8, 10+8, 2+8},

  // Z
  {0, 3, 2, 1,
    3+8, 2+8, 1+8, 0+8},
  {4, 5, 6, 7,
    4+8, 5+8, 6+8, 7+8},
};

/// Border triangles table
/// +4 means edge ptr that crosses the iso-surface
/// (rows 5 and 10 -- the ambiguous saddle cases -- are unimplemented and
/// intentionally emit no cap triangles)
static const int bdr_tris[16][3*3] =
{
  // 0 (0000 = 2-tri)
  {0, 1, 3,  1, 2, 3,  -1, -1, -1},

  // 1 (0001 = 3-tri)
  {2, 3+4, 0+4,  2, 0+4, 1,  2, 3, 3+4},

  // 2 (0010 = 3-tri)
  {3, 0+4, 1+4,  3, 1+4, 2,  3, 0, 0+4},

  // 3 (0011 = 2-tri)
  {2, 3, 1+4,  3, 3+4, 1+4,  -1, -1, -1},

  // 4 (0100 = 3-tri)
  {0, 1+4, 2+4,  0, 2+4, 3,  0, 1, 1+4},

  // 5 XXX
  {-1, -1, -1,  -1, -1, -1,  -1, -1, -1},

  // 6 (0110 = 2-tri)
  {3, 0, 2+4,  0, 0+4, 2+4,  -1, -1, -1},

  // 7 (0111 = 1-tri)
  {3, 3+4, 2+4,  -1, -1, -1,  -1, -1, -1},

  // 8 (1000 = 3-tri)
  {1, 2+4, 3+4,  1, 3+4, 0,  1, 2, 2+4},

  // 9 (1001 = 2-tri)
  {1, 2, 0+4,  2, 2+4, 0+4,  -1, -1, -1},

  // 10 XXX
  {-1, -1, -1,  -1, -1, -1,  -1, -1, -1},

  // 11 (1011 = 1-tri)
  {2, 2+4, 1+4,  -1, -1, -1,  -1, -1, -1},

  // 12 (1100 = 2-tri)
  {0, 1, 3+4,  1, 1+4, 3+4,  -1, -1, -1},

  // 13 (1101 = 1-tri)
  {1, 1+4, 0+4,  -1, -1, -1,  -1, -1, -1},

  // 14 (1110 = 1-tri)
  {0, 0+4, 3+4,  -1, -1, -1,  -1, -1, -1},

  // 15 (0-tri)
  {-1, -1, -1,  -1, -1, -1,  -1, -1, -1},
};

#endif  // XTAL_MAP_SURF_RENDERER_CONSTS_HPP_INCLUDED
