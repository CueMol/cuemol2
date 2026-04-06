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

    // std140 FogBlock layout (binding = 1):
    //   float u_fogEnd   (offset 0)
    //   float u_fogScale (offset 4)
    //   float _fog_p1    (offset 8)   padding
    //   float _fog_p2    (offset 12)  padding
    //   vec3  u_fogColor (offset 16)  (r,g,b + 4 bytes implicit padding = 16 bytes)
    //   float _fog_p3    (offset 28)
    struct FogUBO {
        float fogEnd;
        float fogScale;
        float _pad1, _pad2;
        float fogColor[3];
        float _pad3;
    } data;

    data.fogEnd   = (float)fog_end;
    data.fogScale = (float)fog_scl;
    data._pad1 = 0.0f;
    data._pad2 = 0.0f;
    data.fogColor[0] = fog_r;
    data.fogColor[1] = fog_g;
    data.fogColor[2] = fog_b;
    data._pad3 = 0.0f;

    updateFogUBO(&data, sizeof(data));
}

}  // namespace gfx
