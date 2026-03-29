//
//
//

#pragma once

#include "gfx.hpp"
#include <qlib/MapTable.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/Matrix3D.hpp>

namespace gfx {

class DisplayContext;

class GFX_API ShaderObject
{
private:
    qlib::LString m_shaderObjName;

public:
    virtual ~ShaderObject() = default;

    virtual bool loadShaders(const qlib::MapTable<qlib::LString> &name) = 0;

    virtual void enable() = 0;

    virtual void disable() = 0;

    inline void setName(const qlib::LString &name)
    {
        m_shaderObjName = name;
    }

    inline qlib::LString getName() const
    {
        return m_shaderObjName;
    }

    // int uniform (1-4 components)
    virtual void setUniform(const qlib::LString &name, int v0) = 0;
    virtual void setUniform(const qlib::LString &name, int v0, int v1) = 0;
    virtual void setUniform(const qlib::LString &name, int v0, int v1, int v2) = 0;
    virtual void setUniform(const qlib::LString &name, int v0, int v1, int v2, int v3) = 0;

    // float uniform (1-4 components)
    virtual void setUniformF(const qlib::LString &name, float v0) = 0;
    virtual void setUniformF(const qlib::LString &name, float v0, float v1) = 0;
    virtual void setUniformF(const qlib::LString &name, float v0, float v1, float v2) = 0;
    virtual void setUniformF(const qlib::LString &name, float v0, float v1, float v2, float v3) = 0;

    // matrix (platform-independent types)
    virtual void setMatrix(const qlib::LString &name, const qlib::Matrix4D &mat) = 0;
    virtual void setMatrix(const qlib::LString &name, const qlib::Matrix3D &mat) = 0;

    // attribute location
    virtual int getAttribLocation(const char *name) = 0;

    // convenience functions
    virtual void setupFog(DisplayContext *pdc);
    virtual void setupMat(DisplayContext *pdc) = 0;
};

}  // namespace gfx
