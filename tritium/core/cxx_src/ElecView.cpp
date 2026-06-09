#include <common.h>

#include "ElecView.hpp"
#include "ElecDisplayContext.hpp"
#include "ElecViewCap.hpp"

namespace node_jsbr {

ElecView::ElecView()
{
    MB_DPRINTLN("ElecView::ElecView() created %p", this);

    // ViewCap is a process-wide static shared by all views; set it once so
    // View::hasFBO() reports true and the off-screen AO/AA pipeline gate in
    // GUIView::drawScene becomes reachable. ElecViewCap performs no GL calls.
    if (qsys::View::getViewCap() == nullptr) {
        qsys::View::setViewCap(MB_NEW ElecViewCap());
    }

    m_bBound = false;
    setActive(false);
    m_pCtxt = new ElecDisplayContext();
    m_pCtxt->init(this);
}

ElecView::~ElecView() {}

//////////

LString ElecView::toString() const
{
    return LString("ElecView");
}

gfx::DisplayContext *ElecView::getDisplayContext()
{
    return m_pCtxt;
}

void ElecView::swapBuffers() {}

void ElecView::unloading() {}

bool ElecView::attach(Napi::Object peer)
{
    MB_DPRINTLN("ElecView::attach called");
    m_peerObjRef = Napi::Persistent(peer);
    auto env = peer.Env();

    // // Create UBOs
    // createModelMatArrayBuf(env);
    // createProjMatArrayBuf(env);
    // createLightArrayBuf(env);

    m_bBound = true;

    setUpProjMat(-1, -1);

    // setLighting(0.2f, 0.8f, 0.4f, 32.0f);
    // setLightDir(Vector4D(1.0, 1.0, 1.5, 0.0));
    // updateLightingUBO();

    if (useSclFac()) {
        m_pCtxt->setPixSclFac(getSclFacX());
    }

    return true;
}

//////////

void registerViewFactory()
{
    qsys::View::setViewFactory(MB_NEW ElecViewFactory());
}

}  // namespace node_jsbr
