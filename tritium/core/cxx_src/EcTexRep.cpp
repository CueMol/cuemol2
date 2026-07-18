// -*-Mode: C++;-*-
//
// React/WebGL texture representation for pixel buffer drawing
//

#include <common.h>

#include "EcTexRep.hpp"
#include "ElecView.hpp"
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

namespace node_jsbr {

void EcTexRep::create(gfx::DisplayContext *pdc, const gfx::PixelBuffer &pixbuf)
{
    auto pView = dynamic_cast<ElecView *>(pdc->getTargetView());
    if (pView == nullptr) {
        MB_THROW(qlib::RuntimeException, "target view is not set or not ElecView");
        return;
    }
    m_nViewID = pView->getUID();
    m_texName = qlib::LString::format("tex_%p", this);

    const int width = pixbuf.getWidth();
    const int height = pixbuf.getHeight();
    const size_t data_size = pixbuf.size();

    auto peer = pView->getPeerObj();
    auto env = peer.Env();

    try {
        Napi::Object pix_buf = createBuffer(env, pixbuf.data(), data_size);
        m_pixBufRef = Napi::Persistent(pix_buf);
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("create pixel buffer failed: %s", e.Message().c_str());
        return;
    }

    MB_DPRINTLN("create texture: name=%s, size=(%d, %d)", m_texName.c_str(), width, height);

    auto method = peer.Get("createTexture").As<Napi::Function>();
    bool result = false;
    try {
        auto rval = method.Call(
            peer,
            {Napi::String::New(env, m_texName), Napi::Number::New(env, width),
             Napi::Number::New(env, height), m_pixBufRef.Value()});
        result = rval.As<Napi::Boolean>().Value();
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("createTexture failed: %s", e.Message().c_str());
        return;
    }

    if (!result) {
        MB_THROW(qlib::RuntimeException, "createTexture failed");
    }
}

EcTexRep::~EcTexRep()
{
    MB_DPRINTLN("EcTexRep::~EcTexRep view=%d, tex=%s", (int)m_nViewID, m_texName.c_str());

    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcTexRep> unknown parent view (%d), texture %s cannot be deleted",
                    (int)m_nViewID, m_texName.c_str());
        return;
    }

    auto pEView = dynamic_cast<ElecView *>(rvw.get());
    if (pEView != nullptr) {
        deleteTexture(pEView);
    }
}

void EcTexRep::deleteTexture(ElecView *pView)
{
    auto peer = pView->getPeerObj();
    auto env = peer.Env();

    auto method = peer.Get("deleteTexture").As<Napi::Function>();
    bool result = false;
    try {
        auto rval = method.Call(peer, {Napi::String::New(env, m_texName)});
        result = rval.As<Napi::Boolean>().Value();
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("deleteTexture failed: %s", e.Message().c_str());
        return;
    }

    if (!result) {
        MB_THROW(qlib::RuntimeException, "deleteTexture failed");
    }
}

void EcTexRep::bind(int texUnit)
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcTexRep::bind> unknown parent view (%d)", (int)m_nViewID);
        return;
    }

    auto pEView = dynamic_cast<ElecView *>(rvw.get());
    if (pEView == nullptr) return;

    auto peer = pEView->getPeerObj();
    auto env = peer.Env();

    auto method = peer.Get("bindTexture").As<Napi::Function>();
    try {
        method.Call(peer,
                    {Napi::String::New(env, m_texName), Napi::Number::New(env, texUnit)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("bindTexture failed: %s", e.Message().c_str());
    }
}

void EcTexRep::unbind()
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcTexRep::unbind> unknown parent view (%d)", (int)m_nViewID);
        return;
    }

    auto pEView = dynamic_cast<ElecView *>(rvw.get());
    if (pEView == nullptr) return;

    auto peer = pEView->getPeerObj();
    auto env = peer.Env();

    auto method = peer.Get("unbindTexture").As<Napi::Function>();
    try {
        method.Call(peer, {});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("unbindTexture failed: %s", e.Message().c_str());
    }
}

}  // namespace node_jsbr
