#include <common.h>

#include "EcBufferRep.hpp"
#include "ElecView.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/DrawAttrArray.hpp>
#include <qsys/SceneManager.hpp>

namespace node_jsbr {

EcBufferRep::~EcBufferRep()
{
    qsys::ViewPtr pView = qsys::SceneManager::getViewS(m_nViewID);
    if (pView.isnull()) {
        // If any views aren't found, it is no problem,
        // because the parent context (and also all DLs) may be already destructed.
        return;
    }
    auto pEView = dynamic_cast<ElecView *>(pView.get());
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

    try {
        Napi::Object array_buf = createBuffer(env, data.getData(), buffer_size);
        m_arrayBufRef = Napi::Persistent(array_buf);
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("create array buffer failed: %s", e.Message().c_str());
        return;
    }

    // index data
    const size_t nindex_bytes = data.getIndDataSize();
    MB_DPRINTLN("index buffer size: %d bytes = %d * %d",
                nindex_bytes, data.getIndSize(), data.getIndElemSize());
    if (nindex_bytes > 0) {
        auto pind = const_cast<void *>(data.getIndData());
        MB_ASSERT(pind != nullptr);
        Napi::Object ind_buf = createBuffer(env, pind, nindex_bytes);
        m_indexBufRef = Napi::Persistent(ind_buf);
        m_nIndexElems = data.getIndSize();
    }

    m_bufName = qlib::LString::format("buf_%p", this);
    MB_DPRINTLN("create buffer: name=%s, size=%d bytes, nelems=%d", m_bufName.c_str(),
                buffer_size, nelems);

    auto method = peer.Get("createBuffer").As<Napi::Function>();
    bool result = false;
    try {
        auto rval = method.Call(
            peer,
            {Napi::String::New(env, m_bufName), Napi::Number::New(env, buffer_size),
             Napi::Number::New(env, nelems), Napi::Number::New(env, nindex_bytes),
             Napi::String::New(env, json_str)});
        result = rval.As<Napi::Boolean>().Value();
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
    if (!ada.isUpdated()) {
        m_bDataUpdated = false;
        return;
    }

    const size_t buffer_size = ada.getDataSize();
    copyToBuffer(m_arrayBufRef, ada.getData(), buffer_size);

    const size_t nindex_bytes = ada.getIndDataSize();
    if (nindex_bytes > 0 && m_nIndexElems > 0) {
        copyToBuffer(m_indexBufRef, ada.getIndData(), nindex_bytes);
    }

    ada.setUpdated(false);
    m_bDataUpdated = true;
}

void EcBufferRep::setAttrib(const gfx::AbstDrawAttrs &ada) {}

void EcBufferRep::draw(const gfx::AbstDrawAttrs &ada)
{
    auto pView =
        dynamic_cast<ElecView *>(qsys::SceneManager::getViewS(m_nViewID).get());
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
        if (m_nIndexElems > 0) {
            method.Call(
                peer,
                {Napi::String::New(env, m_bufName), Napi::Number::New(env, m_nDrawMode),
                 Napi::Number::New(env, m_nIndexElems), m_arrayBufRef.Value(),
                 m_indexBufRef.Value(), Napi::Boolean::New(env, isUpdated),
                 Napi::Number::New(env, ninst)});
        } else {
            method.Call(
                peer,
                {Napi::String::New(env, m_bufName), Napi::Number::New(env, m_nDrawMode),
                 Napi::Number::New(env, m_nElems), m_arrayBufRef.Value(), env.Null(),
                 Napi::Boolean::New(env, isUpdated), Napi::Number::New(env, ninst)});
        }
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
