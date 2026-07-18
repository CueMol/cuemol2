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

    ~OcViewCap() override {}

    /// vertex buffer object
    bool hasVBO() const override
    {
        return true;
    }
    /// framebuffer object
    bool hasFBO() const override
    {
        return true;
    }

    /// vertex shader
    bool hasVertShader() const override
    {
        return true;
    }
    /// fragment shader
    bool hasFragShader() const override
    {
        return true;
    }
    /// geoetry shader
    bool hasGeomShader() const override
    {
        return true;
    }
};

}  // namespace sysdep
