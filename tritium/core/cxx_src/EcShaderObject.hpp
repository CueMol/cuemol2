//
// Electron shader object implementation for Node.js bridge
//

#pragma once

#include <gfx/ShaderObject.hpp>
#include <qlib/MapTable.hpp>

namespace node_jsbr {

class ElecView;

class EcShaderObject : public gfx::ShaderObject
{
private:
    using super_t = gfx::ShaderObject;
    ElecView *m_pView;

    qlib::LString loadFile(const qlib::LString &filename);

public:
    EcShaderObject(ElecView *pView) : m_pView(pView) {}
    virtual ~EcShaderObject();

    virtual bool loadShaders(const qlib::MapTable<qlib::LString> &name) override;

    virtual void enable() override;

    virtual void disable() override;

    // Stub implementations for unused pure virtuals
    virtual void setUniform(const qlib::LString &, int) override;
    virtual void setUniform(const qlib::LString &, int, int) override;
    virtual void setUniform(const qlib::LString &, int, int, int) override;
    virtual void setUniform(const qlib::LString &, int, int, int, int) override;

    virtual void setUniformF(const qlib::LString &, float) override;
    virtual void setUniformF(const qlib::LString &, float, float) override;
    virtual void setUniformF(const qlib::LString &, float, float, float) override;
    virtual void setUniformF(const qlib::LString &, float, float, float, float) override;

    virtual void setMatrix(const qlib::LString &, const qlib::Matrix4D &) override;
    virtual void setMatrix(const qlib::LString &, const qlib::Matrix3D &) override;

    virtual int getAttribLocation(const char *) override;

    virtual void setupViewport(gfx::DisplayContext *pdc) override;
    virtual void updateMatricesUBO(const void *data, size_t size) override;
    virtual void updateFogUBO(const void *data, size_t size) override;
    virtual void initDrawParamsUBO(size_t size) override;
    virtual void updateDrawParamsUBO(const void *data, size_t size) override;
};

}  // namespace node_jsbr
