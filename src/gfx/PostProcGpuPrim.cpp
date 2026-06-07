// -*-Mode: C++;-*-
//
// PostProcGpuPrim implementation
//

#include <common.h>

#include "PostProcGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "RenderTarget.hpp"
#include "DataTexture.hpp"

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

    return ensureDrawElem(pDC);
}

bool PostProcGpuPrim::ensureDrawElem(DisplayContext *pDC)
{
    if (m_pDrawElem == nullptr) alloc(pDC);
    return m_pDrawElem != nullptr;
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

void PostProcGpuPrim::drawComposite(DisplayContext *pDC, RenderTarget *sceneRT,
                                    RenderTarget *aoRT)
{
    if (sceneRT == nullptr) return;
    if (!ensureDrawElem(pDC)) return;

    if (m_pCompPO == nullptr) {
        m_pCompPO =
            pDC->loadShaderObject("ao_composite",
                                  "%%CONFDIR%%/data/shaders/postproc_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/ao_composite_frag.glsl");
        if (m_pCompPO == nullptr) {
            LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load ao_composite shader.");
            return;
        }
    }

    sceneRT->bindColorTex(0, RT_TU_COLOR);
    if (aoRT != nullptr) aoRT->bindColorTex(0, RT_TU_NORMAL);  // AO term on unit 2

    m_pCompPO->enable();
    m_pCompPO->setUniform("u_colorTex", RT_TU_COLOR);
    m_pCompPO->setUniform("u_aoTex", RT_TU_NORMAL);
    // hasAO lets the shader fall back to a plain copy when no AO is supplied.
    m_pCompPO->setUniform("u_hasAO", (aoRT != nullptr) ? 1 : 0);

    pDC->drawElem(*m_pDrawElem);

    m_pCompPO->disable();

    sceneRT->unbindTextures();
    if (aoRT != nullptr) aoRT->unbindTextures();
}

void PostProcGpuPrim::drawGtao(DisplayContext *pDC, RenderTarget *sceneRT,
                              const AoConstants &consts, int debugMode)
{
    if (sceneRT == nullptr) return;
    if (!ensureDrawElem(pDC)) return;

    if (m_pGtaoPO == nullptr) {
        m_pGtaoPO =
            pDC->loadShaderObject("gtao",
                                  "%%CONFDIR%%/data/shaders/postproc_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/gtao_frag.glsl");
        if (m_pGtaoPO == nullptr) {
            LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load gtao shader.");
            return;
        }
    }

    sceneRT->bindDepthTex(RT_TU_DEPTH);

    // Use the MRT geometry normal when the scene target carries one; otherwise
    // the shader reconstructs the normal from depth (u_hasNormal == 0).
    const bool hasNormal = sceneRT->hasNormal();
    if (hasNormal) sceneRT->bindColorTex(1, RT_TU_NORMAL);

    m_pGtaoPO->enable();
    m_pGtaoPO->setUniform("u_depthTex", RT_TU_DEPTH);
    m_pGtaoPO->setUniform("u_normalTex", RT_TU_NORMAL);
    m_pGtaoPO->setUniform("u_hasNormal", hasNormal ? 1 : 0);
    m_pGtaoPO->setUniformF("u_depthUnpack", consts.depthLinearizeMul,
                           consts.depthLinearizeAdd);
    m_pGtaoPO->setUniformF("u_ndcToViewMul", consts.ndcToViewMul[0],
                           consts.ndcToViewMul[1]);
    m_pGtaoPO->setUniformF("u_ndcToViewAdd", consts.ndcToViewAdd[0],
                           consts.ndcToViewAdd[1]);
    m_pGtaoPO->setUniformF("u_viewportPixelSize", consts.viewportPixelSize[0],
                           consts.viewportPixelSize[1]);
    m_pGtaoPO->setUniformF("u_effectRadius", consts.effectRadius);
    m_pGtaoPO->setUniformF("u_finalValuePower", consts.finalValuePower);
    m_pGtaoPO->setUniform("u_sliceCount", consts.sliceCount);
    m_pGtaoPO->setUniform("u_stepCount", consts.stepsPerSlice);
    m_pGtaoPO->setUniform("u_debugMode", debugMode);
    m_pGtaoPO->setUniformF("u_aoNoiseOffset", consts.aoNoiseOffset);

    pDC->drawElem(*m_pDrawElem);

    m_pGtaoPO->disable();

    sceneRT->unbindTextures();
}

void PostProcGpuPrim::drawDenoise(DisplayContext *pDC, RenderTarget *aoRT,
                                 const AoConstants &consts)
{
    if (aoRT == nullptr) return;
    if (!ensureDrawElem(pDC)) return;

    if (m_pDenoisePO == nullptr) {
        m_pDenoisePO =
            pDC->loadShaderObject("ao_denoise",
                                  "%%CONFDIR%%/data/shaders/postproc_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/ao_denoise_frag.glsl");
        if (m_pDenoisePO == nullptr) {
            LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load ao_denoise shader.");
            return;
        }
    }

    aoRT->bindColorTex(0, RT_TU_COLOR);

    m_pDenoisePO->enable();
    m_pDenoisePO->setUniform("u_aoTex", RT_TU_COLOR);
    m_pDenoisePO->setUniformF("u_viewportPixelSize", consts.viewportPixelSize[0],
                              consts.viewportPixelSize[1]);

    pDC->drawElem(*m_pDrawElem);

    m_pDenoisePO->disable();

    aoRT->unbindTextures();
}

void PostProcGpuPrim::drawFxaa(DisplayContext *pDC, RenderTarget *srcColorRT,
                              const AoConstants &consts)
{
    if (srcColorRT == nullptr) return;
    if (!ensureDrawElem(pDC)) return;

    if (m_pFxaaPO == nullptr) {
        m_pFxaaPO =
            pDC->loadShaderObject("fxaa",
                                  "%%CONFDIR%%/data/shaders/postproc_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/fxaa_frag.glsl");
        if (m_pFxaaPO == nullptr) {
            LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load fxaa shader.");
            return;
        }
    }

    srcColorRT->bindColorTex(0, RT_TU_COLOR);

    m_pFxaaPO->enable();
    m_pFxaaPO->setUniform("u_colorTex", RT_TU_COLOR);
    m_pFxaaPO->setUniformF("u_rcpFrame", consts.viewportPixelSize[0],
                           consts.viewportPixelSize[1]);

    pDC->drawElem(*m_pDrawElem);

    m_pFxaaPO->disable();

    srcColorRT->unbindTextures();
}

bool PostProcGpuPrim::ensureSmaaTextures(DisplayContext *pDC)
{
    if (m_pSmaaAreaTex != nullptr && m_pSmaaSearchTex != nullptr) return true;

    // AreaTex: 160x560 RG8 LINEAR. SearchTex: 66x33 R8 NEAREST. Decoded from
    // Mol*'s SMAA area/search PNGs (see docs / data/textures).
    if (m_pSmaaAreaTex == nullptr) {
        m_pSmaaAreaTex = pDC->createDataTextureFromFile(
            "%%CONFDIR%%/data/textures/smaa_area.dat", 160, 560, 2, true);
    }
    if (m_pSmaaSearchTex == nullptr) {
        m_pSmaaSearchTex = pDC->createDataTextureFromFile(
            "%%CONFDIR%%/data/textures/smaa_search.dat", 66, 33, 1, false);
    }
    if (m_pSmaaAreaTex == nullptr || m_pSmaaSearchTex == nullptr) {
        LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load SMAA lookup textures.");
        return false;
    }
    return true;
}

void PostProcGpuPrim::drawSmaaEdges(DisplayContext *pDC, RenderTarget *srcColorRT,
                                   const AoConstants &consts)
{
    if (srcColorRT == nullptr) return;
    if (!ensureDrawElem(pDC)) return;

    if (m_pSmaaEdgePO == nullptr) {
        m_pSmaaEdgePO =
            pDC->loadShaderObject("smaa_edges",
                                  "%%CONFDIR%%/data/shaders/postproc_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/smaa_edges_frag.glsl");
        if (m_pSmaaEdgePO == nullptr) {
            LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load smaa_edges shader.");
            return;
        }
    }

    srcColorRT->bindColorTex(0, RT_TU_COLOR);

    m_pSmaaEdgePO->enable();
    m_pSmaaEdgePO->setUniform("u_colorTex", RT_TU_COLOR);
    m_pSmaaEdgePO->setUniformF("u_rcpFrame", consts.viewportPixelSize[0],
                               consts.viewportPixelSize[1]);

    pDC->drawElem(*m_pDrawElem);

    m_pSmaaEdgePO->disable();
    srcColorRT->unbindTextures();
}

void PostProcGpuPrim::drawSmaaWeights(DisplayContext *pDC, RenderTarget *edgesRT,
                                     const AoConstants &consts)
{
    if (edgesRT == nullptr) return;
    if (!ensureDrawElem(pDC)) return;
    if (!ensureSmaaTextures(pDC)) return;

    if (m_pSmaaWeightPO == nullptr) {
        m_pSmaaWeightPO =
            pDC->loadShaderObject("smaa_weights",
                                  "%%CONFDIR%%/data/shaders/postproc_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/smaa_weights_frag.glsl");
        if (m_pSmaaWeightPO == nullptr) {
            LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load smaa_weights shader.");
            return;
        }
    }

    edgesRT->bindColorTex(0, RT_TU_COLOR);
    m_pSmaaAreaTex->bind(RT_TU_SMAA_AREA);
    m_pSmaaSearchTex->bind(RT_TU_SMAA_SEARCH);

    m_pSmaaWeightPO->enable();
    m_pSmaaWeightPO->setUniform("u_edgesTex", RT_TU_COLOR);
    m_pSmaaWeightPO->setUniform("u_areaTex", RT_TU_SMAA_AREA);
    m_pSmaaWeightPO->setUniform("u_searchTex", RT_TU_SMAA_SEARCH);
    m_pSmaaWeightPO->setUniformF("u_rcpFrame", consts.viewportPixelSize[0],
                                 consts.viewportPixelSize[1]);

    pDC->drawElem(*m_pDrawElem);

    m_pSmaaWeightPO->disable();
    edgesRT->unbindTextures();
}

void PostProcGpuPrim::drawSmaaBlend(DisplayContext *pDC, RenderTarget *srcColorRT,
                                   RenderTarget *weightsRT, const AoConstants &consts)
{
    if (srcColorRT == nullptr || weightsRT == nullptr) return;
    if (!ensureDrawElem(pDC)) return;

    if (m_pSmaaBlendPO == nullptr) {
        m_pSmaaBlendPO =
            pDC->loadShaderObject("smaa_blend",
                                  "%%CONFDIR%%/data/shaders/postproc_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/smaa_blend_frag.glsl");
        if (m_pSmaaBlendPO == nullptr) {
            LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load smaa_blend shader.");
            return;
        }
    }

    srcColorRT->bindColorTex(0, RT_TU_COLOR);
    weightsRT->bindColorTex(0, RT_TU_NORMAL);  // weights on unit 2

    m_pSmaaBlendPO->enable();
    m_pSmaaBlendPO->setUniform("u_colorTex", RT_TU_COLOR);
    m_pSmaaBlendPO->setUniform("u_weightsTex", RT_TU_NORMAL);
    m_pSmaaBlendPO->setUniformF("u_rcpFrame", consts.viewportPixelSize[0],
                                consts.viewportPixelSize[1]);

    pDC->drawElem(*m_pDrawElem);

    m_pSmaaBlendPO->disable();
    srcColorRT->unbindTextures();
    weightsRT->unbindTextures();
}

void PostProcGpuPrim::drawJitterCompose(DisplayContext *pDC, RenderTarget *srcRT,
                                       float weight)
{
    if (srcRT == nullptr) return;
    if (!ensureDrawElem(pDC)) return;

    if (m_pJitterComposePO == nullptr) {
        m_pJitterComposePO =
            pDC->loadShaderObject("jitter_compose",
                                  "%%CONFDIR%%/data/shaders/postproc_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/jitter_compose_frag.glsl");
        if (m_pJitterComposePO == nullptr) {
            LOG_DPRINTLN("PostProcGpuPrim> ERROR: cannot load jitter_compose shader.");
            return;
        }
    }

    srcRT->bindColorTex(0, RT_TU_COLOR);

    m_pJitterComposePO->enable();
    m_pJitterComposePO->setUniform("u_colorTex", RT_TU_COLOR);
    m_pJitterComposePO->setUniformF("u_weight", weight);

    pDC->drawElem(*m_pDrawElem);

    m_pJitterComposePO->disable();
    srcRT->unbindTextures();
}

void PostProcGpuPrim::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
    // Shader programs are owned by the shader-object cache (loadShaderObject);
    // not deleted here.
    m_pPO = nullptr;
    m_pCompPO = nullptr;
    m_pGtaoPO = nullptr;
    m_pDenoisePO = nullptr;
    m_pFxaaPO = nullptr;
    m_pSmaaEdgePO = nullptr;
    m_pSmaaWeightPO = nullptr;
    m_pSmaaBlendPO = nullptr;
    m_pJitterComposePO = nullptr;

    // SMAA lookup textures are owned here (unlike the cached shader programs).
    if (m_pSmaaAreaTex != nullptr) {
        delete m_pSmaaAreaTex;
        m_pSmaaAreaTex = nullptr;
    }
    if (m_pSmaaSearchTex != nullptr) {
        delete m_pSmaaSearchTex;
        m_pSmaaSearchTex = nullptr;
    }
}
