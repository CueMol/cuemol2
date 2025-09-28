// -*-Mode: C++;-*-
//
// OpenGL View capability info implementation
//

#pragma once

#include "sysdep.hpp"
#include <qsys/ViewCap.hpp>

namespace sysdep {

class SYSDEP_API OcViewCap : public qsys::ViewCap
{
public:
    OcViewCap()
    {
        // show device info
        LOG_DPRINTLN("--- OpenGL Info ---");
        LOG_DPRINTLN("Vendor:   %s", glGetString(GL_VENDOR));
        LOG_DPRINTLN("Renderer: %s", glGetString(GL_RENDERER));
        LOG_DPRINTLN("Version:");
        LOG_DPRINTLN("  OpenGL %s", glGetString(GL_VERSION));
#ifdef HAVE_GLEW
        LOG_DPRINTLN("  GLEW %s", glewGetString(GLEW_VERSION));
        const char *pstr = (const char *)glGetString(GL_SHADING_LANGUAGE_VERSION);
        if (pstr) LOG_DPRINTLN("  GLSL %s", pstr);
#endif
        LOG_DPRINTLN("-------------------");
    }

    // void disableShader()
    // {
    //     m_bHasVS = false;
    //     m_bHasFS = false;
    //     m_bHasGS = false;
    // }

    virtual ~OcViewCap() {}

    /// vertex buffer object
    virtual bool hasVBO() const
    {
        return true;
    }
    /// framebuffer object
    virtual bool hasFBO() const
    {
        return true;
    }

    /// vertex shader
    virtual bool hasVertShader() const
    {
        return true;
    }
    /// fragment shader
    virtual bool hasFragShader() const
    {
        return true;
    }
    /// geoetry shader
    virtual bool hasGeomShader() const
    {
        return true;
    }
};

}  // namespace sysdep
