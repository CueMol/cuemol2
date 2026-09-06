// -*-Mode: C++;-*-
//
// PickBuffer: CPU-side search of the GPU ID-buffer readback window
//

#pragma once

#include "gfx.hpp"

#include <qlib/LTypes.hpp>

namespace gfx {

/// One non-empty texel of the pick target (see GUIView::renderPickBuffer):
/// R = 1-based renderer index, G = encoded element name, B = encoded outer
/// name. dx/dy are the offsets from the search centre.
struct PickTexel
{
    qlib::quint32 rend;
    qlib::quint32 name;
    qlib::quint32 outer;
    int dx;
    int dy;
};

/// Nearest-first search of a readback window (w*h texels, 4 uints each,
/// row-major, bottom-left origin, as returned by RenderTarget::readColorUInt).
/// Starting at (cx, cy), the rings d = 0..radius (Chebyshev distance) are
/// scanned; within a ring the texels are ordered by squared Euclidean distance
/// (then dy, dx) so the closest hit wins. Texels outside the window are
/// skipped. Returns false when no texel with rend != 0 is found.
GFX_API bool findNearestPickTexel(const qlib::quint32 *rgba, int w, int h, int cx, int cy,
                                  int radius, PickTexel &out);

}  // namespace gfx
