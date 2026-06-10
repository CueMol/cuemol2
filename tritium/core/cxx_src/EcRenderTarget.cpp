// -*-Mode: C++;-*-
//
// React/WebGL off-screen render target (framebuffer object)
//

#include <common.h>

#include "EcRenderTarget.hpp"
#include "ElecView.hpp"

#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

#include <cstring>

namespace node_jsbr {

EcRenderTarget::EcRenderTarget()
    : m_nViewID(0), m_nWidth(0), m_nHeight(0), m_nFlags(0)
{
}

ElecView *EcRenderTarget::getView() const
{
    qsys::ViewPtr rvw = qsys::SceneManager::getViewS(m_nViewID);
    if (rvw.isnull()) return nullptr;
    return dynamic_cast<ElecView *>(rvw.get());
}

bool EcRenderTarget::init(gfx::DisplayContext *pdc, int w, int h, int flags)
{
    auto pView = dynamic_cast<ElecView *>(pdc->getTargetView());
    if (pView == nullptr) {
        MB_THROW(qlib::RuntimeException, "target view is not set or not ElecView");
        return false;
    }
    m_nViewID = pView->getUID();
    m_fboName = qlib::LString::format("fbo_%p", this);
    m_nWidth = w;
    m_nHeight = h;
    m_nFlags = flags;

    auto peer = pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("createFramebuffer").As<Napi::Function>();
    bool result = false;
    try {
        auto rval = method.Call(
            peer, {Napi::String::New(env, m_fboName.c_str()),
                   Napi::Number::New(env, w), Napi::Number::New(env, h),
                   Napi::Number::New(env, flags)});
        result = rval.As<Napi::Boolean>().Value();
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("createFramebuffer failed: %s", e.Message().c_str());
        return false;
    }
    return result;
}

EcRenderTarget::~EcRenderTarget()
{
    auto pView = getView();
    if (pView == nullptr) {
        MB_DPRINTLN("EcRenderTarget> unknown parent view (%d), fbo %s not deleted",
                    m_nViewID, m_fboName.c_str());
        return;
    }
    auto peer = pView->getPeerObj();
    auto env = peer.Env();
    try {
        peer.Get("deleteFramebuffer")
            .As<Napi::Function>()
            .Call(peer, {Napi::String::New(env, m_fboName.c_str())});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("deleteFramebuffer failed: %s", e.Message().c_str());
    }
}

void EcRenderTarget::bind()
{
    auto pView = getView();
    if (pView == nullptr) return;
    auto peer = pView->getPeerObj();
    auto env = peer.Env();
    try {
        peer.Get("bindFramebuffer")
            .As<Napi::Function>()
            .Call(peer, {Napi::String::New(env, m_fboName.c_str())});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("bindFramebuffer failed: %s", e.Message().c_str());
    }
}

void EcRenderTarget::unbind()
{
    auto pView = getView();
    if (pView == nullptr) return;
    auto peer = pView->getPeerObj();
    try {
        peer.Get("bindDefaultFramebuffer").As<Napi::Function>().Call(peer, {});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("bindDefaultFramebuffer failed: %s", e.Message().c_str());
    }
}

void EcRenderTarget::clear(float r, float g, float b, float a)
{
    auto pView = getView();
    if (pView == nullptr) return;
    auto peer = pView->getPeerObj();
    auto env = peer.Env();
    try {
        peer.Get("clearRenderTarget")
            .As<Napi::Function>()
            .Call(peer, {Napi::Number::New(env, r), Napi::Number::New(env, g),
                         Napi::Number::New(env, b), Napi::Number::New(env, a)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("clearRenderTarget failed: %s", e.Message().c_str());
    }
}

void EcRenderTarget::resize(int w, int h)
{
    if (w == m_nWidth && h == m_nHeight) return;
    auto pView = getView();
    if (pView == nullptr) return;
    auto peer = pView->getPeerObj();
    auto env = peer.Env();
    try {
        peer.Get("deleteFramebuffer")
            .As<Napi::Function>()
            .Call(peer, {Napi::String::New(env, m_fboName.c_str())});
        peer.Get("createFramebuffer")
            .As<Napi::Function>()
            .Call(peer, {Napi::String::New(env, m_fboName.c_str()),
                         Napi::Number::New(env, w), Napi::Number::New(env, h),
                         Napi::Number::New(env, m_nFlags)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("resize framebuffer failed: %s", e.Message().c_str());
    }
    m_nWidth = w;
    m_nHeight = h;
}

void EcRenderTarget::bindColorTex(int idx, int texUnit)
{
    auto pView = getView();
    if (pView == nullptr) return;
    // idx 1 selects the MRT normal attachment (when present), idx 0 the color
    // attachment -- mirrors OcRenderTarget::bindColorTex.
    const char *which = (idx == 1 && hasNormal()) ? "normal" : "color";
    auto peer = pView->getPeerObj();
    auto env = peer.Env();
    try {
        peer.Get("bindFBOTexture")
            .As<Napi::Function>()
            .Call(peer, {Napi::String::New(env, m_fboName.c_str()),
                         Napi::String::New(env, which),
                         Napi::Number::New(env, texUnit)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("bindFBOTexture(%s) failed: %s", which, e.Message().c_str());
    }
}

void EcRenderTarget::blitDepthToDefault()
{
    auto pView = getView();
    if (pView == nullptr) return;
    auto peer = pView->getPeerObj();
    auto env = peer.Env();
    try {
        peer.Get("blitDepthToDefault")
            .As<Napi::Function>()
            .Call(peer, {Napi::String::New(env, m_fboName.c_str())});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("blitDepthToDefault failed: %s", e.Message().c_str());
    }
}

void EcRenderTarget::bindDepthTex(int texUnit)
{
    auto pView = getView();
    if (pView == nullptr) return;
    auto peer = pView->getPeerObj();
    auto env = peer.Env();
    try {
        peer.Get("bindFBOTexture")
            .As<Napi::Function>()
            .Call(peer, {Napi::String::New(env, m_fboName.c_str()),
                         Napi::String::New(env, "depth"),
                         Napi::Number::New(env, texUnit)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("bindFBOTexture(depth) failed: %s", e.Message().c_str());
    }
}

void EcRenderTarget::unbindTextures()
{
    auto pView = getView();
    if (pView == nullptr) return;
    auto peer = pView->getPeerObj();
    try {
        peer.Get("unbindTexture").As<Napi::Function>().Call(peer, {});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("unbindTexture failed: %s", e.Message().c_str());
    }
}

void EcRenderTarget::readColor(int idx, int x, int y, int w, int h, int ncomp,
                               void *pbuf)
{
    auto pView = getView();
    if (pView == nullptr) return;
    auto peer = pView->getPeerObj();
    auto env = peer.Env();

    Napi::Value rval;
    try {
        rval = peer.Get("readPixels")
                   .As<Napi::Function>()
                   .Call(peer, {Napi::String::New(env, m_fboName.c_str()),
                                Napi::Number::New(env, x), Napi::Number::New(env, y),
                                Napi::Number::New(env, w), Napi::Number::New(env, h)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("readPixels failed: %s", e.Message().c_str());
        return;
    }

    if (!rval.IsTypedArray()) return;
    Napi::Uint8Array arr = rval.As<Napi::Uint8Array>();
    const uint8_t *src = arr.Data();
    const size_t npix = static_cast<size_t>(w) * static_cast<size_t>(h);
    if (arr.ByteLength() < npix * 4) return;

    auto *dst = static_cast<uint8_t *>(pbuf);
    if (ncomp == 4) {
        memcpy(dst, src, npix * 4);
    } else {
        // RGB: drop the alpha channel.
        for (size_t i = 0; i < npix; ++i) {
            dst[i * 3 + 0] = src[i * 4 + 0];
            dst[i * 3 + 1] = src[i * 4 + 1];
            dst[i * 3 + 2] = src[i * 4 + 2];
        }
    }
}

}  // namespace node_jsbr
