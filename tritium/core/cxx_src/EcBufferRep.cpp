#include <common.h>

#include "EcBufferRep.hpp"
#include "ElecView.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/DrawAttrArray.hpp>
#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>

namespace node_jsbr {

EcBufferRep::~EcBufferRep()
{
    // A raw lookup on purpose (see EcRenderTarget::getView): a strong ViewPtr
    // taken from a destructor re-enters ~GUIView when the view itself is the
    // thing being destroyed. A missing view is no problem -- the parent
    // context (and all display lists) may already be gone.
    auto pEView = qlib::ObjectManager::sGetObj<ElecView>(m_nViewID);
    if (pEView != nullptr) {
        deleteBuffer(pEView);
    }
}

void EcBufferRep::deleteBuffer(ElecView *pView)
{
    auto peer = pView->getPeerObj();
    auto env = peer.Env();

    auto method = peer.Get("deleteBuffer").As<Napi::Function>();
    bool result = false;
    try {
        auto rval = method.Call(peer, {Napi::String::New(env, m_bufName)});
        result = rval.As<Napi::Boolean>().Value();
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("deleteBuffer failed: %s", e.Message().c_str());
        return;
    }

    if (!result) {
        MB_THROW(qlib::RuntimeException, "deleteBuffer failed");
    }
}

void EcBufferRep::create(gfx::DisplayContext *pdc, const gfx::AbstDrawAttrs &data)
{
    auto pView = dynamic_cast<ElecView *>(pdc->getTargetView());
    if (pView == nullptr) {
        MB_THROW(qlib::RuntimeException, "target view is not set or not ElecView");
        return;
    }
    m_nViewID = pView->getUID();

    qlib::LString json_str;
    json_str += "[";
    for (size_t i = 0; i < data.getAttrSize(); ++i) {
        if (i > 0) json_str += ",";
        json_str += "{";
        json_str +=
            // LString::format("\"name\": \"%s\",", data.getAttrName(i).c_str());
            LString::format("\"nloc\": \"%d\",", data.getAttrLoc(i));
        json_str += LString::format("\"nelems\": \"%d\",", data.getAttrElemSize(i));
        json_str += LString::format("\"itype\": \"%d\",", data.getAttrTypeID(i));
        json_str += LString::format("\"npos\": \"%d\",", data.getAttrPos(i));
        json_str += LString::format("\"idiv\": \"%d\"", data.getAttrDivisor(i));
        json_str += "}";
    }
    json_str += "]";
    MB_DPRINTLN("buffer info: %s", json_str.c_str());
    const size_t buffer_size = data.getDataSize();
    const size_t nelems = data.getSize();
    m_nElems = nelems;

    auto peer = pView->getPeerObj();
    auto env = peer.Env();

    // Vertex buffer reference.
    // If ElecDisplayContext::allocBuffer pre-allocated a V8 ArrayBuffer,
    // grab that existing Persistent and skip the memcpy. Otherwise fall
    // back to the legacy path of allocating a new ArrayBuffer and copying
    // the C++ heap data into it (memcpy).
    try {
        auto *pVertRef = static_cast<Napi::ObjectReference *>(data.getExtDataHandle());
        if (pVertRef != nullptr) {
            m_arrayBufRef = Napi::Persistent(pVertRef->Value().As<Napi::Object>());
        } else {
            Napi::Object array_buf = createBuffer(env, data.getData(), buffer_size);
            m_arrayBufRef = Napi::Persistent(array_buf);
        }
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("create array buffer failed: %s", e.Message().c_str());
        return;
    }

    // index data
    const size_t nindex_bytes = data.getIndDataSize();
    MB_DPRINTLN("index buffer size: %d bytes = %d * %d", (int)nindex_bytes,
                (int)data.getIndSize(), (int)data.getIndElemSize());
    if (nindex_bytes > 0) {
        auto *pIndRef =
            static_cast<Napi::ObjectReference *>(data.getExtIndDataHandle());
        if (pIndRef != nullptr) {
            m_indexBufRef = Napi::Persistent(pIndRef->Value().As<Napi::Object>());
        } else {
            auto pind = const_cast<void *>(data.getIndData());
            MB_ASSERT(pind != nullptr);
            Napi::Object ind_buf = createBuffer(env, pind, nindex_bytes);
            m_indexBufRef = Napi::Persistent(ind_buf);
        }
        m_nIndexElems = data.getIndSize();
    }

    m_bufName = qlib::LString::format("buf_%p", this);
    MB_DPRINTLN("create buffer: name=%s, size=%d bytes, nelems=%d", m_bufName.c_str(),
                (int)buffer_size, (int)nelems);

    // m_arrayBufRef now holds the initial data; mark dirty so the first
    // draw() triggers the GPU upload.
    // m_bDataUpdated = true;

    auto method = peer.Get("createBuffer").As<Napi::Function>();
    bool result = false;
    try {
        auto pbuf = m_arrayBufRef.Value();
        auto pindbuf = (m_nIndexElems > 0) ? m_indexBufRef.Value() : env.Null();
        MB_DPRINTLN("createBuffer(%s): pbuf=%p, pindbuf=%p", m_bufName.c_str(),
                    (void *)(napi_value)pbuf, (void *)(napi_value)pindbuf);
        auto rval = method.Call(
            peer,
            {Napi::String::New(env, m_bufName), Napi::Number::New(env, buffer_size),
             Napi::Number::New(env, nelems), Napi::Number::New(env, nindex_bytes),
             Napi::String::New(env, json_str), pbuf, pindbuf});
        result = rval.As<Napi::Boolean>().Value();

        // createBuffer succeeded, so the data is now on the GPU. Mark it clean.
        m_bDataUpdated = false;
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("createBuffer failed: %s", e.Message().c_str());
        return;
    }

    if (!result) {
        MB_THROW(qlib::RuntimeException, "createBuffer failed");
        return;
    }
}

void EcBufferRep::bind() {}

void EcBufferRep::update(const gfx::AbstDrawAttrs &ada)
{
    // In-place buffer update path, gated by the check-and-reset dirty flag
    // (mirrors OcBufferRep::update; see fa3909cd). The flag stays false on
    // ordinary frames, so per-frame draws upload nothing; a renderer that
    // rewrites its CPU-side array and calls setUpdated(true) gets exactly one
    // GPU upload on the next draw. This body was disabled while no renderer
    // used the path (3e10ee12: createBuffer now uploads the initial data
    // directly); re-enabled for in-place color updates.
    if (!ada.isUpdated()) {
        m_bDataUpdated = false;
        return;
    }

    // If the storage is externally backed (V8 ArrayBuffer), the renderer's
    // at(i) writes already landed in the same backing store as
    // m_arrayBufRef -- no memcpy needed. Otherwise copy from C++ heap.
    if (ada.getExtDataHandle() == nullptr) {
        const size_t buffer_size = ada.getDataSize();
        copyToBuffer(m_arrayBufRef, ada.getData(), buffer_size);

        const size_t nindex_bytes = ada.getIndDataSize();
        if (nindex_bytes > 0 && m_nIndexElems > 0) {
            copyToBuffer(m_indexBufRef, ada.getIndData(), nindex_bytes);
        }
    }

    ada.setUpdated(false);
    m_bDataUpdated = true;
}

void EcBufferRep::setAttrib(const gfx::AbstDrawAttrs &ada) {}

void EcBufferRep::draw(const gfx::AbstDrawAttrs &ada)
{
    auto pView =
        qlib::ObjectManager::sGetObj<ElecView>(m_nViewID);
    if (pView == nullptr) {
        MB_THROW(qlib::RuntimeException, "target view is not set or not ElecView");
        return;
    }

    auto peer = pView->getPeerObj();
    auto env = peer.Env();

    auto method = peer.Get("drawBuffer").As<Napi::Function>();
    const bool isUpdated = m_bDataUpdated;
    m_bDataUpdated = false;
    const bool bEnableLighting = true;
    const int ninst = ada.getNumInstances();
    m_nDrawMode = ada.getDrawMode();

    try {
        // if (m_nIndexElems > 0) {
        auto pbuf = m_arrayBufRef.Value();
        auto pindbuf = (m_nIndexElems > 0) ? m_indexBufRef.Value() : env.Null();
        MB_DPRINTLN("drawBuffer(%s): pbuf=%p, pindbuf=%p", m_bufName.c_str(),
                    (void *)(napi_value)pbuf, (void *)(napi_value)pindbuf);
        int nelems = (m_nIndexElems > 0) ? m_nIndexElems : m_nElems;
        method.Call(
            peer,
            {Napi::String::New(env, m_bufName), Napi::Number::New(env, m_nDrawMode),
             Napi::Number::New(env, nelems), pbuf, pindbuf,
             Napi::Boolean::New(env, isUpdated), Napi::Number::New(env, ninst)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("drawBuffer failed: %s", e.Message().c_str());
        return;
    }
}

void EcBufferRep::unbind(const gfx::AbstDrawAttrs &ada) {}

// // static
// int EcBufferRep::convDrawMode(int nMode)
// {
//     return 0;
// }

// // static
// int EcBufferRep::convGLConsts(int id)
// {
//     return 0;
// }

// // static
// int EcBufferRep::convGLNorm(int id)
// {
//     return 0;
// }

}  // namespace node_jsbr
