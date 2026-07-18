// -*-Mode: C++;-*-
//
// React/WebGL immutable data texture implementation.
//

#include <common.h>

#include "EcDataTexture.hpp"
#include "ElecView.hpp"
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

namespace node_jsbr {

bool EcDataTexture::create(gfx::DisplayContext *pdc, int w, int h, int ncomp,
                           bool linear, const void *data)
{
    auto pView = dynamic_cast<ElecView *>(pdc->getTargetView());
    if (pView == nullptr) {
        MB_THROW(qlib::RuntimeException, "target view is not set or not ElecView");
        return false;
    }
    m_nViewID = pView->getUID();
    m_texName = qlib::LString::format("datatex_%p", this);
    m_nWidth = w;
    m_nHeight = h;

    const size_t data_size = size_t(w) * size_t(h) * size_t(ncomp);

    auto peer = pView->getPeerObj();
    auto env = peer.Env();

    bool result = false;
    try {
        // Transient buffer: createDataTexture copies the bytes into the GL
        // texture synchronously during the call, so no persistent ref needed.
        Napi::Object buf = createBuffer(env, data, data_size);
        auto method = peer.Get("createDataTexture").As<Napi::Function>();
        auto rval = method.Call(
            peer,
            {Napi::String::New(env, m_texName), Napi::Number::New(env, w),
             Napi::Number::New(env, h), Napi::Number::New(env, ncomp),
             Napi::Boolean::New(env, linear), buf});
        result = rval.As<Napi::Boolean>().Value();
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcDataTexture::create failed: %s", e.Message().c_str());
        return false;
    }

    MB_DPRINTLN("EcDataTexture::create name=%s (%dx%d ncomp=%d linear=%d) %s",
                m_texName.c_str(), w, h, ncomp, int(linear), result ? "OK" : "FAIL");
    return result;
}

EcDataTexture::~EcDataTexture()
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcDataTexture> unknown parent view (%d), texture %s cannot be deleted",
                    (int)m_nViewID, m_texName.c_str());
        return;
    }

    auto pEView = dynamic_cast<ElecView *>(rvw.get());
    if (pEView == nullptr) return;

    auto peer = pEView->getPeerObj();
    auto env = peer.Env();

    auto method = peer.Get("deleteTexture").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::String::New(env, m_texName)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcDataTexture> deleteTexture failed: %s", e.Message().c_str());
    }
}

void EcDataTexture::bind(int texUnit)
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcDataTexture::bind> unknown parent view (%d)", (int)m_nViewID);
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
        MB_DPRINTLN("EcDataTexture::bind> bindTexture failed: %s", e.Message().c_str());
    }
}

void EcDataTexture::unbind()
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcDataTexture::unbind> unknown parent view (%d)", (int)m_nViewID);
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
        MB_DPRINTLN("EcDataTexture::unbind> unbindTexture failed: %s", e.Message().c_str());
    }
}

}  // namespace node_jsbr
