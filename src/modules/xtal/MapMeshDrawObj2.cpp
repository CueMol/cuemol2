// -*-Mode: C++;-*-
//
// GPU marching-cubes draw object for density map mesh.
//

#include <common.h>

#include "MapMeshDrawObj2.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/ShaderObject.hpp>

using namespace xtal;

bool MapMeshDrawObj2::init(gfx::DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    // Create a dummy draw element for zero-attribute instanced rendering.
    // The shader uses gl_VertexID (0 or 1) and gl_InstanceID only.
    m_pDrawElem = MB_NEW InstDrawArray();
    m_pDrawElem->setAttrSize(0);   // no vertex attributes
    m_pDrawElem->alloc(2);         // 2 vertices per instance (for DRAW_LINES)
    m_pDrawElem->setDrawMode(gfx::AbstDrawElem::DRAW_LINES);

    m_pPO = pDC->loadShaderObject("gpu_mapmesh",
                                   "%%CONFDIR%%/data/shaders/mapmesh2_vert.glsl",
                                   "%%CONFDIR%%/data/shaders/mapmesh_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("MapMeshDrawObj2> ERROR: cannot load shader.");
        return false;
    }

    m_pPO->enable();

    // Setup the index displacement array
    // X-Y plane
    m_pPO->setUniform("ivdel[0]", 0, 0, 0);
    m_pPO->setUniform("ivdel[1]", 1, 0, 0);
    m_pPO->setUniform("ivdel[2]", 1, 1, 0);
    m_pPO->setUniform("ivdel[3]", 0, 1, 0);

    // Y-Z plane
    m_pPO->setUniform("ivdel[4]", 0, 0, 0);
    m_pPO->setUniform("ivdel[5]", 0, 1, 0);
    m_pPO->setUniform("ivdel[6]", 0, 1, 1);
    m_pPO->setUniform("ivdel[7]", 0, 0, 1);

    // Z-X plane
    m_pPO->setUniform("ivdel[8]", 0, 0, 0);
    m_pPO->setUniform("ivdel[9]", 0, 0, 1);
    m_pPO->setUniform("ivdel[10]", 1, 0, 1);
    m_pPO->setUniform("ivdel[11]", 1, 0, 0);

    // Setup the edge table
    m_pPO->setUniform("edgetab[0]", -1, -1);   // 0000
    m_pPO->setUniform("edgetab[1]", 0, 3);     // 0001
    m_pPO->setUniform("edgetab[2]", 0, 1);     // 0010
    m_pPO->setUniform("edgetab[3]", 1, 3);     // 0011
    m_pPO->setUniform("edgetab[4]", 1, 2);     // 0100
    m_pPO->setUniform("edgetab[5]", 0, 1);     // 0101
    m_pPO->setUniform("edgetab[6]", 0, 2);     // 0110
    m_pPO->setUniform("edgetab[7]", 2, 3);     // 0111
    m_pPO->setUniform("edgetab[8]", 2, 3);     // 1000
    m_pPO->setUniform("edgetab[9]", 0, 2);     // 1001
    m_pPO->setUniform("edgetab[10]", 2, 3);    // 1010
    m_pPO->setUniform("edgetab[11]", 1, 2);    // 1011
    m_pPO->setUniform("edgetab[12]", 1, 3);    // 1100
    m_pPO->setUniform("edgetab[13]", 0, 1);    // 1101
    m_pPO->setUniform("edgetab[14]", 0, 3);    // 1110
    m_pPO->setUniform("edgetab[15]", -1, -1);  // 1111

    m_pPO->disable();
    return true;
}

void MapMeshDrawObj2::draw(gfx::DisplayContext *pDC, const MapMeshDrawParams &params)
{
    if (m_pPO == nullptr) return;
    if (params.pBufTex == nullptr) return;

    params.pBufTex->bind(0);

    m_pPO->enable();

    m_pPO->setUniform("dataFieldTex", 0);
    m_pPO->setUniform("isolevel", params.isolevel);
    m_pPO->setUniform("ncol", params.ncol);
    m_pPO->setUniform("nrow", params.nrow);
    m_pPO->setUniformF("frag_alpha", params.frag_alpha);
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);

    // Update instance count and issue draw via the backend-independent drawElem() path.
    // OcBufferRep::draw() calls glDrawArraysInstanced when numInstances > 0.
    m_pDrawElem->setNumInstances(params.ncol * params.nrow * params.nsec * 3);
    pDC->drawElem(*m_pDrawElem);

    m_pPO->disable();

    params.pBufTex->unbind();
}

void MapMeshDrawObj2::invalidate()
{
    if (m_pDrawElem != nullptr) {
        m_pDrawElem->invalidateCache();
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
    // ShaderObject is owned/cached by DisplayContext; do not delete here.
    m_pPO = nullptr;
}
