// -*-Mode: C++;-*-
//
// React/WebGL mutable float data texture implementation.
//

#include <common.h>

#include "EcFloatDataTexture.hpp"
// Benchmark harness (bench/perf-harness branch only).
#include "BenchStats.hpp"
#include "ElecView.hpp"
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

namespace node_jsbr {

bool EcFloatDataTexture::create(int w, int h, int ncomp)
{
    if (m_pdc == nullptr) return false;

    auto pView = dynamic_cast<ElecView *>(m_pdc->getTargetView());
    if (pView == nullptr) {
        MB_THROW(qlib::RuntimeException, "target view is not set or not ElecView");
        return false;
    }
    m_nViewID = pView->getUID();
    m_texName = qlib::LString::format("fdatatex_%p", this);
    m_nWidth = w;
    m_nHeight = h;
    m_nComp = ncomp;

    auto peer = pView->getPeerObj();
    auto env = peer.Env();

    bool result = false;
    try {
        auto method = peer.Get("createFloatDataTexture").As<Napi::Function>();
        auto rval = method.Call(
            peer,
            {Napi::String::New(env, m_texName), Napi::Number::New(env, w),
             Napi::Number::New(env, h), Napi::Number::New(env, ncomp)});
        result = rval.As<Napi::Boolean>().Value();
        if (result) {
            // Zero-filled by V8, so the padding texels past the last atom
            // stay defined without the caller writing them.
            const size_t data_size =
                size_t(w) * size_t(h) * size_t(ncomp) * sizeof(float);
            Napi::ArrayBuffer ab = Napi::ArrayBuffer::New(env, data_size);
            m_stagingRef = Napi::Persistent(ab.As<Napi::Object>());
            m_pStaging = ab.Data();
        }
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcFloatDataTexture::create failed: %s", e.Message().c_str());
        return false;
    }

    MB_DPRINTLN("EcFloatDataTexture::create name=%s (%dx%d ncomp=%d) %s",
                m_texName.c_str(), w, h, ncomp, result ? "OK" : "FAIL");
    return result;
}

void EcFloatDataTexture::update(const void *data)
{
    BenchScope bench__(g_benchStats.coordTexUpdate);
    if (m_pStaging == nullptr) return;
    if (data != m_pStaging) {
        memcpy(m_pStaging, data,
               size_t(m_nWidth) * size_t(m_nHeight) * size_t(m_nComp) * sizeof(float));
    }
    upload();
}

void EcFloatDataTexture::updateFromStaging()
{
    BenchScope bench__(g_benchStats.coordTexUpdate);
    if (m_pStaging == nullptr) return;
    upload();
}

void EcFloatDataTexture::upload()
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcFloatDataTexture::update> unknown parent view (%d)",
                    (int)m_nViewID);
        return;
    }

    auto pEView = dynamic_cast<ElecView *>(rvw.get());
    if (pEView == nullptr) return;

    auto peer = pEView->getPeerObj();
    auto env = peer.Env();

    try {
        // updateFloatDataTexture copies into the GL texture synchronously
        // during the call, so the same buffer can be refilled for the next one.
        auto method = peer.Get("updateFloatDataTexture").As<Napi::Function>();
        method.Call(peer, {Napi::String::New(env, m_texName), m_stagingRef.Value()});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcFloatDataTexture::update failed: %s", e.Message().c_str());
    }
}

EcFloatDataTexture::~EcFloatDataTexture()
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcFloatDataTexture> unknown parent view (%d), texture %s cannot be deleted",
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
        MB_DPRINTLN("EcFloatDataTexture> deleteTexture failed: %s", e.Message().c_str());
    }
}

void EcFloatDataTexture::bind(int texUnit)
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcFloatDataTexture::bind> unknown parent view (%d)", (int)m_nViewID);
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
        MB_DPRINTLN("EcFloatDataTexture::bind> bindTexture failed: %s", e.Message().c_str());
    }
}

void EcFloatDataTexture::unbind()
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) {
        MB_DPRINTLN("EcFloatDataTexture::unbind> unknown parent view (%d)", (int)m_nViewID);
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
        MB_DPRINTLN("EcFloatDataTexture::unbind> unbindTexture failed: %s", e.Message().c_str());
    }
}

}  // namespace node_jsbr
