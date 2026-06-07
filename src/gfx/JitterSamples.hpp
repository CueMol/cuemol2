// -*-Mode: C++;-*-
//
//  Sub-pixel jitter sample offsets for temporal / multi-sample supersampling.
//

#pragma once

namespace gfx {

// Sub-pixel jitter offsets (in 1/16 pixel units) per supersampling level, taken
// from Mol* (mol-canvas3d/passes/multi-sample.ts JitterVectors). Level 1..5 ->
// 2/4/8/16/32 samples; level 0 is "off" (single, un-jittered sample).

/// Number of samples for the given level (0 = off -> 1).
inline int jitterSampleCount(int level)
{
    if (level <= 0) return 1;
    if (level > 5) level = 5;
    return 1 << level;
}

/// Sub-pixel offset (in pixels) for (level, sample index). Returns (0,0) for an
/// out-of-range level or index.
inline void jitterOffset(int level, int idx, double &px, double &py)
{
    static const signed char JV2[2][2] = {{0, 0}, {-4, -4}};
    static const signed char JV4[4][2] = {{0, 0}, {6, -2}, {-6, 2}, {2, 6}};
    static const signed char JV8[8][2] = {{0, 0}, {-1, 3},  {5, 1},  {-3, -5},
                                          {-5, 5}, {-7, -1}, {3, 7},  {7, -7}};
    static const signed char JV16[16][2] = {
        {0, 0},  {-1, -3}, {-3, 2},  {4, -1}, {-5, -2}, {2, 5},  {5, 3},  {3, -5},
        {-2, 6}, {0, -7},  {-4, -6}, {-6, 4}, {-8, 0},  {7, -4}, {6, 7},  {-7, -8}};
    static const signed char JV32[32][2] = {
        {0, 0},  {-7, -5}, {-3, -5}, {-5, -4}, {-1, -4}, {-2, -2}, {-6, -1}, {-4, 0},
        {-7, 1}, {-1, 2},  {-6, 3},  {-3, 3},  {-7, 6},  {-3, 6},  {-5, 7},  {-1, 7},
        {5, -7}, {1, -6},  {6, -5},  {4, -4},  {2, -3},  {7, -2},  {1, -1},  {4, -1},
        {2, 1},  {6, 2},   {0, 4},   {4, 4},   {2, 5},   {7, 5},   {5, 6},   {3, 7}};

    const signed char(*tbl)[2] = nullptr;
    int n = 0;
    switch (level) {
        case 1: tbl = JV2;  n = 2;  break;
        case 2: tbl = JV4;  n = 4;  break;
        case 3: tbl = JV8;  n = 8;  break;
        case 4: tbl = JV16; n = 16; break;
        case 5: tbl = JV32; n = 32; break;
        default: px = py = 0.0; return;
    }
    if (idx < 0 || idx >= n) {
        px = py = 0.0;
        return;
    }
    px = double(tbl[idx][0]) / 16.0;
    py = double(tbl[idx][1]) / 16.0;
}

}  // namespace gfx
