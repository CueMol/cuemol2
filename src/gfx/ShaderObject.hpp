//
//
//

#pragma once

#include "gfx.hpp"
#include <qlib/MapTable.hpp>

namespace gfx {

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
};

}  // namespace gfx
