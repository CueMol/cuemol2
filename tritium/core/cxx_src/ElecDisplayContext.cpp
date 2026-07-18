#include <common.h>

#include "ElecDisplayContext.hpp"
#include "EcShaderObject.hpp"
#include "ElecView.hpp"
#include "EcBufferRep.hpp"
#include "EcTexRep.hpp"
#include "EcRenderTarget.hpp"
#include "EcDataTexture.hpp"
#include "EcFloatDataTexture.hpp"

#include <gfx/AbstDrawAttrs.hpp>
#include <gfx/RenderTarget.hpp>
#include <gfx/DataTexture.hpp>

#include <qlib/FileStream.hpp>
#include <qsys/SysConfig.hpp>

namespace node_jsbr {

ElecDisplayContext::~ElecDisplayContext() {}

void ElecDisplayContext::init(ElecView *pView)
{
    m_pView = pView;
    setTargetView(pView);
}

void ElecDisplayContext::enableDepthTest(bool) {}

void ElecDisplayContext::setDepthTestEnabled(bool b)
{
    if (!m_pView || !m_pView->isBound()) return;
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setDepthTestEnabled").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::Boolean::New(env, b)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("ElecDisplayContext::setDepthTestEnabled> Error: %s",
                    e.Message().c_str());
    }
}

void ElecDisplayContext::setBlendEnabled(bool b)
{
    if (!m_pView || !m_pView->isBound()) return;
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setBlendEnabled").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::Boolean::New(env, b)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("ElecDisplayContext::setBlendEnabled> Error: %s",
                    e.Message().c_str());
    }
}

void ElecDisplayContext::setBlendModeAdd(bool b)
{
    if (!m_pView || !m_pView->isBound()) return;
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setBlendModeAdd").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::Boolean::New(env, b)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("ElecDisplayContext::setBlendModeAdd> Error: %s",
                    e.Message().c_str());
    }
}

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

gfx::RenderTarget *ElecDisplayContext::createRenderTarget(int w, int h, int flags)
{
    auto *pRT = MB_NEW EcRenderTarget();
    if (!pRT->init(this, w, h, flags)) {
        delete pRT;
        return nullptr;
    }
    return pRT;
}

gfx::DataTexture *ElecDisplayContext::createDataTexture(int w, int h, int ncomp,
                                                        bool linear, const void *data)
{
    auto *pTex = MB_NEW EcDataTexture();
    if (!pTex->create(this, w, h, ncomp, linear, data)) {
        delete pTex;
        return nullptr;
    }
    return pTex;
}

gfx::FloatDataTexture *ElecDisplayContext::createFloatDataTexture()
{
    // The texture is allocated later via FloatDataTexture::create(w, h, ncomp);
    // pass this context so it can resolve the target view at that point.
    return MB_NEW EcFloatDataTexture(this);
}

gfx::DataTexture *ElecDisplayContext::createDataTextureFromFile(const LString &path,
                                                               int w, int h, int ncomp,
                                                               bool linear)
{
    const size_t expect = size_t(w) * size_t(h) * size_t(ncomp);

    // Resolve the %%CONFDIR%% path the same way shader files are loaded.
    qsys::SysConfig *pconf = qsys::SysConfig::getInstance();
    LString fnam = pconf->convPathName(path);

    std::vector<quint8> buf;
    buf.reserve(expect);
    try {
        qlib::FileInStream fis;
        fis.open(fnam);
        char tmp[4096];
        while (fis.ready()) {
            int n = fis.read(tmp, 0, sizeof tmp);
            if (n <= 0) break;
            buf.insert(buf.end(), tmp, tmp + n);
        }
    } catch (...) {
        LOG_DPRINTLN("ElecDisplayContext> cannot read data texture: %s", fnam.c_str());
        return nullptr;
    }

    if (buf.size() != expect) {
        LOG_DPRINTLN("ElecDisplayContext> data texture %s size mismatch (%zu != %zu)",
                     fnam.c_str(), buf.size(), expect);
        return nullptr;
    }

    return createDataTexture(w, h, ncomp, linear, buf.data());
}

void ElecDisplayContext::bindRenderTarget(gfx::RenderTarget *prt)
{
    if (prt != nullptr)
        prt->bind();
    else
        bindDefaultFramebuffer();
}

void ElecDisplayContext::bindDefaultFramebuffer()
{
    if (!m_pView || !m_pView->isBound()) return;
    auto peer = m_pView->getPeerObj();
    try {
        peer.Get("bindDefaultFramebuffer").As<Napi::Function>().Call(peer, {});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("bindDefaultFramebuffer> Error: %s", e.Message().c_str());
    }
}

void ElecDisplayContext::allocBuffer(gfx::AbstDrawAttrs &ada, int nvert, int nind)
{
    if (m_pView == nullptr || !m_pView->isBound()) {
        // Fallback: behave like the default impl when no peer is available.
        ada.allocOwnedData(nvert);
        if (nind > 0) ada.allocOwnedIndData(nind);
        return;
    }

    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();

    // Vertex buffer: allocate the V8 ArrayBuffer and refer the C++ side
    // (m_data via DrawAttrArray::setDataRef) at the same backing store.
    const size_t vert_bytes = static_cast<size_t>(nvert) * ada.getElemSize();
    Napi::ArrayBuffer vert_ab = Napi::ArrayBuffer::New(env, vert_bytes);
    auto *pVertRef = new Napi::ObjectReference();
    pVertRef->Reset(vert_ab, 1);  // strong ref; AbstDrawAttrs finalizer resets it
    ada.setDataRef(vert_ab.Data(), nvert);
    ada.setExtDataHandle(pVertRef);
    ada.setDataFinalizer([pVertRef]() {
        pVertRef->Reset();
        delete pVertRef;
    });

    if (nind > 0) {
        const size_t ind_bytes = static_cast<size_t>(nind) * ada.getIndElemSize();
        Napi::ArrayBuffer ind_ab = Napi::ArrayBuffer::New(env, ind_bytes);
        auto *pIndRef = new Napi::ObjectReference();
        pIndRef->Reset(ind_ab, 1);
        ada.setIndDataRef(ind_ab.Data(), nind);
        ada.setExtIndDataHandle(pIndRef);
        ada.setIndDataFinalizer([pIndRef]() {
            pIndRef->Reset();
            delete pIndRef;
        });
    }
}

}  // namespace node_jsbr
