// -*-Mode: C++;-*-
//
// OpenGL View capability info implementation
//

#ifndef OPENGL_VIEW_CAP_HPP_INCLUDE_
#define OPENGL_VIEW_CAP_HPP_INCLUDE_

#include "sysdep.hpp"
#include <qsys/ViewCap.hpp>

namespace sysdep {

  class QSYS_API OglViewCap : public qsys::ViewCap
  {
  private:
    bool m_bHasVBO;
    bool m_bHasFBO;

    bool m_bHasVS;
    bool m_bHasGS;
    bool m_bHasFS;
    
    LString m_sGLSLVer;

  public:
    OglViewCap()
    {
      // Check FBO
      if (GLEW_ARB_framebuffer_object) {
        m_bHasFBO = true;
      }
      else {
        m_bHasFBO = false;
        LOG_DPRINTLN("OglCap> Warning: Framebuffer Object not supported!!");
      }

      // Check VBO
      if (GLEW_ARB_vertex_buffer_object) {
        m_bHasVBO = true;
      }
      else {
        m_bHasVBO = false;
        LOG_DPRINTLN("OglCap> Warning: Vertex Buffer Object not supported!!");
      }
      
      // Check VS/FS
      if ( GLEW_ARB_vertex_shader && GLEW_ARB_fragment_shader ) {
        m_bHasVS = true;
        m_bHasFS = true;
      }
      else {
        m_bHasVS = false;
        m_bHasFS = false;
        LOG_DPRINTLN("OglCap> Warning: Vertex/Fragment Shader not supported!!");
      }
      
      // Check GS
      if ( GLEW_EXT_geometry_shader4 ) {
        m_bHasGS = true;
      }
      else {
        m_bHasGS = false;
        LOG_DPRINTLN("OglCap> Warning: Geometry Shader not supported!!");
      }

      // Check integer attrib, etc.
      if ( GLEW_EXT_gpu_shader4 ) {
        LOG_DPRINTLN("OglCap> gpu_shader4 support OK");
      }
      else {
        LOG_DPRINTLN("OglCap> gpu_shader4 not supported");
      }

      // Check TBO
      if ( GLEW_ARB_texture_buffer_object || GLEW_EXT_texture_buffer_object ) {
        LOG_DPRINTLN("OglCap> TBO support OK");
      }
      else {
        LOG_DPRINTLN("OglCap> TBO not supported");
      }

      // Check VAO
      if (GLEW_ARB_vertex_array_object) {
        LOG_DPRINTLN("OglCap> VAO support OK.");
      }
      else if (GLEW_APPLE_vertex_array_object) {
	LOG_DPRINTLN("OglCap> APPLE VAO support OK.");
      }
      else {
        LOG_DPRINTLN("OglCap> VAO not supported");
      }
      

      // show device info
      LOG_DPRINTLN("--- OpenGL Info ---");
      LOG_DPRINTLN("Vendor:   %s", glGetString(GL_VENDOR));
      LOG_DPRINTLN("Renderer: %s", glGetString(GL_RENDERER));
      LOG_DPRINTLN("Version:");
      LOG_DPRINTLN("  OpenGL %s", glGetString(GL_VERSION));
#ifdef HAVE_GLEW
      LOG_DPRINTLN("  GLEW %s", glewGetString(GLEW_VERSION));
      const char *pstr = (const char *) glGetString(GL_SHADING_LANGUAGE_VERSION);
      if (pstr) {
        LOG_DPRINTLN("  GLSL %s", pstr);
	m_sGLSLVer = pstr;
      }
#endif
      LOG_DPRINTLN("-------------------");

      /*
    MB_DPRINTLN("--- Extensions ---",);
    std::list<LString> ls;
    exts.split(' ', ls);
    BOOST_FOREACH(const LString & i, ls) {
      MB_DPRINTLN(" %s", i.c_str());
    }
       */
    }

    void disableShader()
    {
      m_bHasVS = false;
      m_bHasFS = false;
      m_bHasGS = false;
    }

    virtual ~OglViewCap() {}

    /// vertex buffer object
    virtual bool hasVBO() const { return m_bHasVBO; }
    /// framebuffer object
    virtual bool hasFBO() const { return m_bHasFBO; }

    /// vertex shader
    virtual bool hasVertShader() const { return m_bHasVS; }
    /// fragment shader
    virtual bool hasFragShader() const { return m_bHasFS; }
    /// geoetry shader
    virtual bool hasGeomShader() const { return m_bHasGS; }
    
    virtual LString getSLVersion() const { return m_sGLSLVer; }

  };

}

#endif

