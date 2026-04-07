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

    FogBlock data = {};
    data.fogEnd      = (float)fog_end;
    data.fogScale    = (float)fog_scl;
    data.fogColor[0] = fog_r;
    data.fogColor[1] = fog_g;
    data.fogColor[2] = fog_b;

    updateFogUBO(&data, sizeof(data));
}

void ShaderObject::setupMat(DisplayContext *pdc)
{
    setupViewport(pdc);

    auto fillMat4 = [](float *dst, const qlib::Matrix4D &m) {
        dst[0]  = (float)m.aij(1,1);  dst[1]  = (float)m.aij(2,1);
        dst[2]  = (float)m.aij(3,1);  dst[3]  = (float)m.aij(4,1);
        dst[4]  = (float)m.aij(1,2);  dst[5]  = (float)m.aij(2,2);
        dst[6]  = (float)m.aij(3,2);  dst[7]  = (float)m.aij(4,2);
        dst[8]  = (float)m.aij(1,3);  dst[9]  = (float)m.aij(2,3);
        dst[10] = (float)m.aij(3,3);  dst[11] = (float)m.aij(4,3);
        dst[12] = (float)m.aij(1,4);  dst[13] = (float)m.aij(2,4);
        dst[14] = (float)m.aij(3,4);  dst[15] = (float)m.aij(4,4);
    };

    auto mvMat  = pdc->getModelViewMat();
    auto prjMat = pdc->getProjMat();
    auto nmMat  = mvMat.getMatrix3D().invert().transpose();

    MatricesBlock data = {};
    fillMat4(data.modelView,  mvMat);
    fillMat4(data.projection, prjMat);

    // mat3 → mat4: fill columns 0-2 with mat3 data, column 3 = (0,0,0,1)
    data.normal[0]  = (float)nmMat.aij(1,1);
    data.normal[1]  = (float)nmMat.aij(2,1);
    data.normal[2]  = (float)nmMat.aij(3,1);
    data.normal[3]  = 0.0f;
    data.normal[4]  = (float)nmMat.aij(1,2);
    data.normal[5]  = (float)nmMat.aij(2,2);
    data.normal[6]  = (float)nmMat.aij(3,2);
    data.normal[7]  = 0.0f;
    data.normal[8]  = (float)nmMat.aij(1,3);
    data.normal[9]  = (float)nmMat.aij(2,3);
    data.normal[10] = (float)nmMat.aij(3,3);
    data.normal[11] = 0.0f;
    data.normal[12] = 0.0f;
    data.normal[13] = 0.0f;
    data.normal[14] = 0.0f;
    data.normal[15] = 1.0f;

    updateMatricesUBO(&data, sizeof(data));
}

}  // namespace gfx
