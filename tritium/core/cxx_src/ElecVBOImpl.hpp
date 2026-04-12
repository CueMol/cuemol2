#pragma once

#include <gfx/DrawAttrArray.hpp>

#include "ElecView.hpp"

namespace node_jsbr {

class ElecVBOImpl : public gfx::VBORep
{
private:
    qlib::uid_t m_nViewID;
    qlib::LString m_bufName;
    size_t m_nElems;
    Napi::ObjectReference m_arrayBufRef;
    int m_nDrawMode;

    // index data
    Napi::ObjectReference m_indexBufRef;
    size_t m_nIndexElems;

    // material/lighting
    bool m_bEnableLighting;

public:
    ElecVBOImpl(ElecView *pView, const qlib::LString &name,
                const gfx::AbstDrawAttrs &data)
        : m_nViewID(pView->getUID()),
          m_bufName(name),
          m_nElems(data.getSize()),
          m_nDrawMode(data.getDrawMode()),
          m_nIndexElems(0),
          m_bEnableLighting(false)
    {
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
            json_str += LString::format("\"npos\": \"%d\"", data.getAttrPos(i));
            json_str += "}";
        }
        json_str += "]";
        printf("buffer info: %s\n", json_str.c_str());
        const size_t buffer_size = data.getDataSize();
        const size_t nelems = data.getSize();

        auto peer = pView->getPeerObj();
        auto env = peer.Env();

        // auto pbuf = const_cast<void *>(data.getData());
        // Napi::Object array_buf = Napi::ArrayBuffer::New(
        //     env, pbuf, buffer_size, [](Napi::Env, void *finalizeData) {
        //         printf("finalizer called for %p\n", finalizeData);
        //         // delete [] static_cast<float*>(finalizeData);
        //     });
        Napi::Object array_buf = createBuffer(env, data.getData(), buffer_size);
        m_arrayBufRef = Napi::Persistent(array_buf);

        // index data
        const size_t nindex_bytes = data.getIndDataSize();
        if (nindex_bytes > 0) {
            auto pind = const_cast<void *>(data.getIndData());
            MB_ASSERT(pind != nullptr);
            // Napi::Object ind_buf = Napi::ArrayBuffer::New(
            //     env, pind, nindex_bytes, [](Napi::Env, void *finalizeData) {
            //         printf("IndexBufferfinalizer called for %p\n", finalizeData);
            //         // delete [] static_cast<float*>(finalizeData);
            //     });
            Napi::Object ind_buf = createBuffer(env, pind, nindex_bytes);
            m_indexBufRef = Napi::Persistent(ind_buf);
            m_nIndexElems = data.getIndSize();
        }

        auto method = peer.Get("createBuffer").As<Napi::Function>();
        auto rval = method.Call(
            peer,
            {Napi::String::New(env, m_bufName), Napi::Number::New(env, buffer_size),
             Napi::Number::New(env, nelems), Napi::Number::New(env, nindex_bytes),
             Napi::String::New(env, json_str)});

        bool result = rval.As<Napi::Boolean>().Value();
        if (!result) {
            MB_THROW(qlib::RuntimeException, "createBuffer failed");
            return;
        }
    }

    void setLighting(bool b) { m_bEnableLighting = b; }

    void drawBuffer(ElecView *pView, bool isUpdated)
    {
        auto peer = pView->getPeerObj();
        auto env = peer.Env();

        auto method = peer.Get("drawBuffer").As<Napi::Function>();

        if (m_nIndexElems > 0) {
            method.Call(
                peer,
                {Napi::String::New(env, m_bufName), Napi::Number::New(env, m_nDrawMode),
                 Napi::Number::New(env, m_nIndexElems), m_arrayBufRef.Value(),
                 m_indexBufRef.Value(), Napi::Boolean::New(env, isUpdated),
                 Napi::Boolean::New(env, m_bEnableLighting)});
        } else {
            method.Call(peer, {Napi::String::New(env, m_bufName),
                               Napi::Number::New(env, m_nDrawMode),
                               Napi::Number::New(env, m_nElems), m_arrayBufRef.Value(),
                               env.Null(), Napi::Boolean::New(env, isUpdated),
                               Napi::Boolean::New(env, m_bEnableLighting)});
        }
    }

    void deleteBuffer(ElecView *pView)
    {
        auto peer = pView->getPeerObj();
        auto env = peer.Env();

        auto method = peer.Get("deleteBuffer").As<Napi::Function>();
        auto rval = method.Call(peer, {Napi::String::New(env, m_bufName)});
        bool result = rval.As<Napi::Boolean>().Value();
        if (!result) {
            MB_THROW(qlib::RuntimeException, "deleteBuffer failed");
        }
    }

    virtual ~ElecVBOImpl()
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
};

}  // namespace node_jsbr
