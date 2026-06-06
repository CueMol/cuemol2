// -*-Mode: C++;-*-
//
// PostProcGpuPrim implementation
//

#include <common.h>

#include "PostProcGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "RenderTarget.hpp"

#include <qlib/LTypes.hpp>

using namespace gfx;

bool PostProcGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("depthvis",
                                  "%%CONFDIR%%/data/shaders/postproc_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/depthvis_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load depthvis shader.");
        return false;
    }

    alloc(pDC);
    return true;
}

void PostProcGpuPrim::alloc(DisplayContext *pDC)
{
    MB_ASSERT(pDC != nullptr);

    m_pDrawElem = MB_NEW TriArray();
    TriArray &data = *m_pDrawElem;

    data.setAttrSize(1);
    data.setAttrInfo(0, ATTRLOC_VERTEX, 2, qlib::type_consts::QTC_FLOAT32,
                     offsetof(Elem, x));

    pDC->allocBuffer(data, 3, 0);
    data.setDrawMode(AbstDrawElem::DRAW_TRIANGLES);

    // Oversized triangle that covers the whole NDC viewport.
    data.at(0) = {-1.0f, -1.0f};
    data.at(1) = {3.0f, -1.0f};
    data.at(2) = {-1.0f, 3.0f};
}

void PostProcGpuPrim::drawDepthVis(DisplayContext *pDC, RenderTarget *prt,
                                   float vnear, float vfar)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(m_pDrawElem != nullptr);
    if (prt == nullptr) return;

    prt->bindDepthTex(RT_TU_DEPTH);

    m_pPO->enable();
    m_pPO->setUniform("u_depthTex", RT_TU_DEPTH);
    m_pPO->setUniformF("u_near", vnear);
    m_pPO->setUniformF("u_far", vfar);

    pDC->drawElem(*m_pDrawElem);

    m_pPO->disable();

    prt->unbindTextures();
}

void PostProcGpuPrim::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
    // m_pPO is owned by the shader-object cache (loadShaderObject); not deleted here.
    m_pPO = nullptr;
}
