// -*-Mode: C++;-*-
//
// PickBuffer: CPU-side search of the GPU ID-buffer readback window
//

#include <common.h>

#include "PickBuffer.hpp"

#include <algorithm>
#include <vector>

namespace gfx {

bool findNearestPickTexel(const qlib::quint32 *rgba, int w, int h, int cx, int cy,
                          int radius, PickTexel &out)
{
    if (rgba == nullptr || w <= 0 || h <= 0) return false;
    if (radius < 0) radius = 0;

    auto texelAt = [&](int x, int y) -> const qlib::quint32 * {
        if (x < 0 || y < 0 || x >= w || y >= h) return nullptr;
        return rgba + (size_t(y) * size_t(w) + size_t(x)) * 4u;
    };

    // Ring 0: the centre itself.
    if (const qlib::quint32 *p = texelAt(cx, cy)) {
        if (p[0] != 0u) {
            out = PickTexel{p[0], p[1], p[2], 0, 0};
            return true;
        }
    }

    struct Off
    {
        int dx, dy;
    };
    std::vector<Off> ring;
    for (int d = 1; d <= radius; ++d) {
        ring.clear();
        for (int dy = -d; dy <= d; ++dy) {
            for (int dx = -d; dx <= d; ++dx) {
                if (std::max(std::abs(dx), std::abs(dy)) != d) continue;
                ring.push_back(Off{dx, dy});
            }
        }
        std::sort(ring.begin(), ring.end(), [](const Off &a, const Off &b) {
            const int da = a.dx * a.dx + a.dy * a.dy;
            const int db = b.dx * b.dx + b.dy * b.dy;
            if (da != db) return da < db;
            if (a.dy != b.dy) return a.dy < b.dy;
            return a.dx < b.dx;
        });
        for (const Off &o : ring) {
            const qlib::quint32 *p = texelAt(cx + o.dx, cy + o.dy);
            if (p == nullptr || p[0] == 0u) continue;
            out = PickTexel{p[0], p[1], p[2], o.dx, o.dy};
            return true;
        }
    }
    return false;
}

}  // namespace gfx
