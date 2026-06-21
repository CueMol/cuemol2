#pragma once

#include <cstddef>

namespace raytrace {

// Result of the umbreon smoke render: enough to assert the renderer ran and
// produced a non-empty frame. This is a build-system integration smoke; the real
// cuemol scene -> umbreon::Scene conversion will grow in this module later.
struct UmbreonSmokeResult
{
    int width = 0;
    int height = 0;
    double renderSeconds = 0.0;
    std::size_t nonBackgroundPixels = 0;
};

// Build a trivial scene (one lit quad on a black background) and render it
// through umbreon::render(). Used by the integration smoke test to prove that
// umbreon links into libcuemol2 and produces output via the deplibs-bundled
// Embree/TBB.
UmbreonSmokeResult renderUmbreonSmoke();

}  // namespace raytrace
