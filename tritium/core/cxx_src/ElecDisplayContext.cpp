#include <common.h>

#include "ElecDisplayContext.hpp"
#include "EcShaderObject.hpp"
#include "ElecView.hpp"
#include "EcBufferRep.hpp"
#include "EcTexRep.hpp"

namespace node_jsbr {

ElecDisplayContext::~ElecDisplayContext() {}

void ElecDisplayContext::init(ElecView *pView)
{
    m_pView = pView;
    setTargetView(pView);
}

void ElecDisplayContext::enableDepthTest(bool) {}

void ElecDisplayContext::setCullFace(bool f)
{
    if (!m_pView || !m_pView->isBound()) return;
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setCullFace").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::Boolean::New(env, f)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("ElecDisplayContext::setCullFace> Error: %s", e.Message().c_str());
    }
}

void ElecDisplayContext::setInvertColorBlend(bool bInv)
{
    if (!m_pView || !m_pView->isBound()) return;
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setInvertColorBlend").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::Boolean::New(env, bInv)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("ElecDisplayContext::setInvertColorBlend> Error: %s", e.Message().c_str());
    }
}

void ElecDisplayContext::setFrontFace(bool bCCW)
{
    if (!m_pView || !m_pView->isBound()) return;
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setFrontFace").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::Boolean::New(env, bCCW)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("ElecDisplayContext::setFrontFace> Error: %s", e.Message().c_str());
    }
}

void ElecDisplayContext::clearBuffer(const gfx::ColorPtr &col)
{
    if (!m_pView || !m_pView->isBound()) {
        LOG_DPRINTLN("ElecDisplayContext::clearBuffer> ElecView is not bound.");
        return;
    }

    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("clear").As<Napi::Function>();
    try {
        method.Call(peer,
                    {Napi::Number::New(env, col->fr()), Napi::Number::New(env, col->fg()),
                     Napi::Number::New(env, col->fb())});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("ElecDisplayContext::clearBuffer> Error calling clear: %s", e.Message().c_str());
    }
}

bool ElecDisplayContext::setCurrent()
{
    return m_pView != nullptr && m_pView->isBound();
}

bool ElecDisplayContext::isCurrent() const
{
    return true;
}

gfx::ShaderObject *ElecDisplayContext::createShaderObject(const LString &name,
                                                          const LString &vert_path,
                                                          const LString &frag_path)
{
    auto *pPO = new EcShaderObject(m_pView);
    pPO->setName(name);

    try {
        qlib::MapTable<qlib::LString> file_names;
        file_names.set("vertex", vert_path);
        file_names.set("fragment", frag_path);
        pPO->loadShaders(file_names);
    } catch (...) {
        LOG_DPRINTLN("OcDisplayContext> FATAL ERROR: loadShader(%s) failed!!", name.c_str());
        delete pPO;
        return nullptr;
    }

    MB_DPRINTLN("createShaderObject> OK: pPO=%p", pPO);
    return pPO;
}

gfx::BufTexRep *ElecDisplayContext::createBufTexRep()
{
    MB_DPRINTLN("createBufTexRep called");
    return nullptr;
}

gfx::VBORep *ElecDisplayContext::createVBORep(const gfx::AbstDrawAttrs &da)
{
    MB_DPRINTLN("createVBORep called");
    auto pRep = MB_NEW EcBufferRep();
    pRep->create(this, da);
    return pRep;
}

gfx::PixRep *ElecDisplayContext::createPixRep(const gfx::PixelBuffer &pb)
{
    MB_DPRINTLN("createPixRep called");
    auto pRep = MB_NEW EcTexRep();
    pRep->create(this, pb);
    return pRep;
}

}  // namespace node_jsbr
