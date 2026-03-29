// -*-Mode: C++;-*-
//
//  ShaderObject base class implementation
//

#include <common.h>
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"

namespace gfx {

void ShaderObject::setupFog(DisplayContext *pdc)
{
    auto fog_end = pdc->getFogEnd();
    auto fog_start = pdc->getFogStart();
    auto fog_scl = 1.0 / (fog_end - fog_start);
    float fog_r = 0.0, fog_g = 0.0, fog_b = 0.0;
    pdc->getDevRGBColor(pdc->getFogColor(), fog_r, fog_g, fog_b);
    setUniformF("u_fogEnd", fog_end);
    setUniformF("u_fogScale", fog_scl);
    setUniformF("u_fogColor", fog_r, fog_g, fog_b);
}

}  // namespace gfx
