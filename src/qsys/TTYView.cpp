// -*-Mode: C++;-*-
//
// TTY dummy View implementation
//

#include <common.h>

#include "TTYView.hpp"

#include <gfx/DisplayContext.hpp>

namespace qsys {

class TTYDisplayContext : public gfx::DisplayContext
{
private:
    typedef gfx::DisplayContext super_t;

public:
    TTYDisplayContext() {}
    ~TTYDisplayContext() override {}

    bool setCurrent() override
    {
        return true;
    }
    bool isCurrent() const override
    {
        return true;
    }
    bool isFile() const override
    {
        return true;
    }

    void vertex(const qlib::Vector4D &) override {}
    void normal(const qlib::Vector4D &) override {}
    void color(const gfx::ColorPtr &c) override {}

    void pushMatrix() override {}
    void popMatrix() override {}
    void multMatrix(const qlib::Matrix4D &mat) override {}
    void loadMatrix(const qlib::Matrix4D &mat) override {}

    void setPolygonMode(int id) override {}
    void startPoints() override {}
    void startPolygon() override {}
    void startLines() override {}
    void startLineStrip() override {}
    void startTriangles() override {}
    void startTriangleStrip() override {}
    void startTriangleFan() override {}
    void startQuadStrip() override {}
    void startQuads() override {}
    void end() override {}
};
}  // namespace qsys

using namespace qsys;

TTYView::TTYView() : m_pCtxt(new TTYDisplayContext()) {}

TTYView::TTYView(const TTYView &r) {}

TTYView::~TTYView() {}

//////////

LString TTYView::toString() const
{
    return LString("TTYView");
}

/// Setup the projection matrix for stereo (View interface)
void TTYView::setUpModelMat(int nid) {}

/// Setup projection matrix (View interface)
void TTYView::setUpProjMat(int w, int h) {}

/// Draw current scene
void TTYView::drawScene()
{
    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("DrawScene: invalid scene %d !!", (int)getSceneID());
        return;
    }

    gfx::DisplayContext *pdc = getDisplayContext();
    pdc->setCurrent();
    pScene->display(pdc);
}

gfx::DisplayContext *TTYView::getDisplayContext()
{
    return m_pCtxt;
}

// namespace qsys {
//   //static
//   qsys::View *View::createView()
//   {
//     qsys::View *pret = MB_NEW TTYView();
//     MB_DPRINTLN("TTYView created (%p, ID=%d)", pret, pret->getUID());
//     return pret;
//   }
// }
