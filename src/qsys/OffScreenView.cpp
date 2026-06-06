// -*-Mode: C++;-*-
//
// OffScreenView: render into a framebuffer object for off-screen capture
//

#include <common.h>

#include "OffScreenView.hpp"
#include "Scene.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/RenderTarget.hpp>

namespace qsys {

OffScreenView::OffScreenView(gfx::DisplayContext *pParentCtxt, int w, int h, int flags)
    : super_t(), m_pParentCtxt(pParentCtxt), m_pRT(nullptr)
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
    if (m_pRT != nullptr) {
        if (m_pParentCtxt != nullptr) m_pParentCtxt->setCurrent();
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

    m_pRT->bind();

    setFogColorImpl(pdc);
    pdc->setLighting(false);

    setUpProjMat(getWidth(), getHeight());
    setUpModelMat(MM_NORMAL);

    pdc->clearBuffer(pScene->getBgColor());
    pScene->display(pdc);

    m_pRT->unbind();
}

void OffScreenView::readPixels(int x, int y, int width, int height, char *pbuf,
                               int nbufsize, int ncomp)
{
    if (m_pRT == nullptr) return;
    m_pRT->readColor(0, x, y, width, height, ncomp, pbuf);
}

}  // namespace qsys
