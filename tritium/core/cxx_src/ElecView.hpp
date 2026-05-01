#pragma once

#include <napi.h>

#include <qsys/Scene.hpp>
#include <qsys/qsys.hpp>
#include <qsys/GUIView.hpp>

namespace node_jsbr {

class ElecDisplayContext;

class ElecView : public qsys::GUIView
{
private:
    bool m_bBound;

    ElecDisplayContext *m_pCtxt;

    /// JS-side WebGL display manager
    Napi::ObjectReference m_peerObjRef;

    // ElecView(const ElecView &r);

public:
    using super_t = qsys::GUIView;

    ElecView();

    virtual ~ElecView();

    //////////

public:
    virtual LString toString() const override;

    virtual gfx::DisplayContext *getDisplayContext() override;

    virtual void swapBuffers() override;

    virtual void unloading() override;

    bool attach(Napi::Object peer);

    bool isBound() const
    {
        return m_bBound;
    }

    auto getPeerObj() const
    {
        return m_peerObjRef.Value();
    }
};

class ElecViewFactory : public qsys::ViewFactory
{
public:
    ElecViewFactory() {}
    virtual ~ElecViewFactory() {}
    virtual qsys::View *create() override
    {
        return MB_NEW ElecView();
    }
};

void registerViewFactory();

inline Napi::Object createBuffer(Napi::Env env, const void *src_data,
                                 size_t byte_length)
{
    Napi::ArrayBuffer ab = Napi::ArrayBuffer::New(env, byte_length);
    if (src_data) {
        memcpy(ab.Data(), src_data, byte_length);
    }
    return ab;
}

inline void copyToBuffer(Napi::ObjectReference &obj_ref, const void *src_data,
                         size_t byte_length)
{
    Napi::ArrayBuffer ab = obj_ref.Value().As<Napi::ArrayBuffer>();
    if (ab.ByteLength() < byte_length) {
        throw Napi::Error::New(obj_ref.Env(), "Buffer size is too small");
    }
    memcpy(ab.Data(), src_data, byte_length);
}

}  // namespace node_jsbr
