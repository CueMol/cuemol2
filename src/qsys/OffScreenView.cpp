// -*-Mode: C++;-*-
//
// OffScreenView: render into a framebuffer object for off-screen capture
//

#include <common.h>

#include "OffScreenView.hpp"
#include "Scene.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/RenderTarget.hpp>
#include <gfx/PostProcGpuPrim.hpp>
#include <gfx/JitterSamples.hpp>

namespace qsys {

OffScreenView::OffScreenView(gfx::DisplayContext *pParentCtxt, int w, int h, int flags)
    : super_t(),
      m_pParentCtxt(pParentCtxt),
      m_pRT(nullptr),
      m_pDepthVisRT(nullptr),
      m_pPostProc(nullptr),
      m_pReadRT(nullptr),
      m_pAccumRT(nullptr),
      m_bBgTransparent(false),
      m_bDepthMode(false),
      m_nSuperSample(5)
{
    // Off-screen pixels map 1:1 to the requested size (no HiDPI scaling).
    unsetSclFac();
    setViewSize(w, h);

    if (m_pParentCtxt != nullptr) {
        m_pParentCtxt->setCurrent();
        m_pRT = m_pParentCtxt->createRenderTarget(w, h, flags);
    }
}

OffScreenView::~OffScreenView()
{
    if (m_pParentCtxt != nullptr &&
        (m_pRT != nullptr || m_pDepthVisRT != nullptr || m_pPostProc != nullptr ||
         m_pAccumRT != nullptr)) {
        m_pParentCtxt->setCurrent();
    }
    if (m_pAccumRT != nullptr) {
        delete m_pAccumRT;
        m_pAccumRT = nullptr;
    }
    if (m_pPostProc != nullptr) {
        m_pPostProc->invalidate();
        delete m_pPostProc;
        m_pPostProc = nullptr;
    }
    if (m_pDepthVisRT != nullptr) {
        delete m_pDepthVisRT;
        m_pDepthVisRT = nullptr;
    }
    if (m_pRT != nullptr) {
        delete m_pRT;
        m_pRT = nullptr;
    }
}

void OffScreenView::drawScene()
{
    if (m_pRT == nullptr) return;

    ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("OffScreenView::drawScene: invalid scene %d", getSceneID());
        return;
    }

    gfx::DisplayContext *pdc = m_pParentCtxt;

    // NOTE: do NOT call safeSetCurrent() here -- it would re-target the shared
    // display context to this view and force the scene renderers to allocate a
    // fresh per-view VBO set. Keeping the parent's target view lets the export
    // reuse the on-screen geometry buffers; only the matrices and the bound
    // framebuffer differ.
    if (!pdc->setCurrent()) return;

    setFogColorImpl(pdc);
    pdc->setLighting(false);

    // Depth-visualization capture: render the plain scene into m_pRT (its depth
    // attachment feeds the depth pass) without AO/jitter.
    if (m_bDepthMode) {
        gfx::ColorPtr bgcol = pScene->getBgColor();
        const float bg_a = m_bBgTransparent ? 0.0f : 1.0f;
        setJitterOffsetPx(0.0, 0.0);
        m_pRT->bind();
        setUpProjMat(getWidth(), getHeight());
        setUpModelMat(MM_NORMAL);
        m_pRT->clear(float(bgcol->fr()), float(bgcol->fg()), float(bgcol->fb()),
                     bg_a);
        pScene->display(pdc);
        m_pRT->unbind();
        m_pReadRT = m_pRT;
        drawDepthVis(pdc);
        return;
    }

    const int level = m_nSuperSample;
    const int nSamp = gfx::jitterSampleCount(level);

    // No supersampling: a single un-jittered color frame (scene AO applied).
    if (level <= 0 || nSamp <= 1) {
        setJitterOffsetPx(0.0, 0.0);
        setUpProjMat(getWidth(), getHeight());
        renderAOColorFrame(pdc, pScene, m_pRT, m_bBgTransparent);
        m_pReadRT = m_pRT;
        return;
    }

    // Jitter supersampling: render nSamp sub-pixel-jittered color frames (each
    // with the scene's AO) into m_pRT and average them into the float buffer.
    if (m_pAccumRT == nullptr) {
        m_pAccumRT = pdc->createRenderTarget(getWidth(), getHeight(),
                                             gfx::RT_COLOR_RGBA16F);
    }
    if (m_pPostProc == nullptr) {
        m_pPostProc = MB_NEW gfx::PostProcGpuPrim();
        if (!m_pPostProc->init(pdc)) {
            delete m_pPostProc;
            m_pPostProc = nullptr;
        }
    }
    if (m_pAccumRT == nullptr || m_pPostProc == nullptr) {
        // Fallback: single frame.
        setJitterOffsetPx(0.0, 0.0);
        setUpProjMat(getWidth(), getHeight());
        renderAOColorFrame(pdc, pScene, m_pRT, m_bBgTransparent);
        m_pReadRT = m_pRT;
        return;
    }

    const float invN = 1.0f / float(nSamp);
    m_pAccumRT->bind();
    m_pAccumRT->clear(0.0f, 0.0f, 0.0f, 0.0f);
    m_pAccumRT->unbind();

    for (int i = 0; i < nSamp; ++i) {
        double jpx = 0.0, jpy = 0.0;
        gfx::jitterOffset(level, i, jpx, jpy);
        setJitterOffsetPx(jpx, jpy);
        setUpProjMat(getWidth(), getHeight());  // jittered frustum
        renderAOColorFrame(pdc, pScene, m_pRT, m_bBgTransparent);

        // Additive accumulate m_pRT * (1/N) into the float buffer.
        m_pAccumRT->bind();
        pdc->setDepthTestEnabled(false);
        pdc->setBlendEnabled(true);
        pdc->setBlendModeAdd(true);
        m_pPostProc->drawJitterCompose(pdc, m_pRT, invN);
        pdc->setBlendModeAdd(false);
        pdc->setBlendEnabled(true);
        pdc->setDepthTestEnabled(true);
        m_pAccumRT->unbind();
    }
    setJitterOffsetPx(0.0, 0.0);

    MB_DPRINTLN("OffScreenView> jitter SS export (level=%d, %d samples)", level,
                nSamp);
    m_pReadRT = m_pAccumRT;
}

void OffScreenView::drawDepthVis(gfx::DisplayContext *pdc)
{
    // Render a fullscreen pass that samples the scene depth texture into a
    // separate color-only target (avoids a feedback loop on the depth texture)
    // and read that target back instead of the scene color.
    if (m_pDepthVisRT == nullptr) {
        m_pDepthVisRT = pdc->createRenderTarget(getWidth(), getHeight(),
                                                gfx::RT_COLOR_RGBA8);
    }
    if (m_pPostProc == nullptr) {
        m_pPostProc = MB_NEW gfx::PostProcGpuPrim();
        if (!m_pPostProc->init(pdc)) {
            delete m_pPostProc;
            m_pPostProc = nullptr;
        }
    }
    if (m_pDepthVisRT == nullptr || m_pPostProc == nullptr) {
        MB_DPRINTLN("OffScreenView::drawDepthVis> depth pass unavailable "
                    "(rt=%p, postproc=%p) -- falling back to color",
                    (void *)m_pDepthVisRT, (void *)m_pPostProc);
        return;
    }

    // Camera slab planes, matching setUpProjMat's near/far derivation.
    double dist = getViewDist();
    double slabdepth = getSlabDepth();
    if (slabdepth <= 0.1) slabdepth = 0.1;
    double slabnear = dist - slabdepth / 2.0;
    if (slabnear < 0.1) slabnear = 0.1;
    double slabfar = dist + slabdepth;

    m_pDepthVisRT->bind();
    m_pPostProc->drawDepthVis(pdc, m_pRT, float(slabnear), float(slabfar));
    m_pDepthVisRT->unbind();

    m_pReadRT = m_pDepthVisRT;
}

void OffScreenView::readPixels(int x, int y, int width, int height, char *pbuf,
                               int nbufsize, int ncomp)
{
    gfx::RenderTarget *prt = (m_pReadRT != nullptr) ? m_pReadRT : m_pRT;
    if (prt == nullptr) return;
    prt->readColor(0, x, y, width, height, ncomp, pbuf);
}

}  // namespace qsys
