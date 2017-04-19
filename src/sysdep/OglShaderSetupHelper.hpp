// -*-Mode: C++;-*-
//
//  OpenGL shader helper class
//

#ifndef __OGL_SHADER_SETUP_HELPER_HPP__
#define __OGL_SHADER_SETUP_HELPER_HPP__

#if defined(HAVE_GLEW) || defined(USE_GLES2)

#include "sysdep.hpp"

#if HAVE_GLEW
#  include <GL/glew.h>
#endif

#ifdef USE_GLES2
#include <OpenGLES/ES2/gl.h>
#include <OpenGLES/ES2/glext.h>
#endif

#include "OglProgramObject.hpp"
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include "OglDisplayContext.hpp"

namespace sysdep {

  template <class _ClientType>
  class OglShaderSetupHelper
  {
  private:
    _ClientType *m_pCli;
    
    SOMacroDefs m_defs;

  public:
    OglShaderSetupHelper(_ClientType *pCli)
         : m_pCli(pCli)
    {
    }

    ~OglShaderSetupHelper() {}

    //////////////////////////////
    // Check environment

    bool checkEnvVS() const
    {
      if (!qsys::View::hasVBO() || !qsys::View::hasVS()) {
        return false;
      }
      return true;
    }

    bool checkEnvGS() const
    {
      if (!qsys::View::hasVBO() || !qsys::View::hasGS()) {
        return false;
      }
      return true;
    }

    //////////////////////////////
    // Macro definitions

    void setMacroDefs(const SOMacroDefs &defs) {
      m_defs = defs;
    }

    void defineMacro(const LString &nm, const LString &val) {
      m_defs.insert(SOMacroDefs::value_type(nm, val));
    }

    void clearMacros() {
      m_defs.clear();
    }

    //////////////////////////////
    // Include paths

    std::vector<LString> m_incPaths;

    int addIncludePath(const LString& path)
    {
      m_includePaths.push_back(path);
      return (int)m_includePaths.size();
    }

    void clearIncludePaths()
    {
      m_includePaths.clear();
    }

    //////////////////////////////
    //

    OglProgramObject *createProgObj(const LString &name,
                                    const LString &vert_path,
                                    const LString &frag_path)
    {
      OglDisplayContext *pOglDC = getContext();
      
      if (pOglDC==NULL)
        return NULL;
      
      // setup shaders
      OglProgramObject *pPO = pOglDC->getProgramObject(name);
      if (pPO==NULL) {
        pPO = pOglDC->createProgramObject(name);
        if (pPO==NULL) {
          LOG_DPRINTLN("ShaderSetupHelper> ERROR: cannot create progobj <%s>.", name.c_str());
          return NULL;
        }
        
        try {
          if (m_defs.empty()) {
            pPO->loadShader("vert", vert_path, GL_VERTEX_SHADER);
            pPO->loadShader("frag", frag_path, GL_FRAGMENT_SHADER);
          }
          else {
            pPO->loadShader("vert", vert_path, GL_VERTEX_SHADER, &m_defs);
            pPO->loadShader("frag", frag_path, GL_FRAGMENT_SHADER, &m_defs);
          }
          pPO->link();
        }
        catch (...) {
          LOG_DPRINTLN("FATAL ERROR: loadShader(%s) failed!!", name.c_str());
          return NULL;
        }
      }
      
      return pPO;
    }

    /////

    OglProgramObject *createProgObj(const LString &name,
                                    const LString &vert_path,
                                    const LString &frag_path,
                                    const LString &geom_path,
                                    GLint in_type, GLint out_type, GLint out_count)
    {
      OglDisplayContext *pOglDC = getContext();
      
      if (pOglDC==NULL)
        return NULL;
      
      // setup shaders
      OglProgramObject *pPO = pOglDC->getProgramObject(name);
      if (pPO==NULL) {
        pPO = pOglDC->createProgramObject(name);
        if (pPO==NULL) {
          LOG_DPRINTLN("ShaderSetupHelper> ERROR: cannot create progobj <%s>.", name.c_str());
          return NULL;
        }
        
        try {
          if (m_defs.empty()) {
            pPO->loadShader("vert", vert_path, GL_VERTEX_SHADER);
            pPO->loadShader("frag", frag_path, GL_FRAGMENT_SHADER);
            pPO->loadShader("geom", geom_path, GL_GEOMETRY_SHADER);
          }
          else {
            pPO->loadShader("vert", vert_path, GL_VERTEX_SHADER, &m_defs);
            pPO->loadShader("frag", frag_path, GL_FRAGMENT_SHADER, &m_defs);
            pPO->loadShader("geom", geom_path, GL_GEOMETRY_SHADER, &m_defs);
          }
          pPO->setProgParam(GL_GEOMETRY_INPUT_TYPE_EXT, in_type);
          pPO->setProgParam(GL_GEOMETRY_OUTPUT_TYPE_EXT, out_type);
          pPO->setProgParam(GL_GEOMETRY_VERTICES_OUT_EXT, out_count);
          pPO->link();
        }
        catch (...) {
          LOG_DPRINTLN("FATAL ERROR: loadShader(%s) failed!!", name.c_str());
          return NULL;
        }
      }
      
      return pPO;
    }
    

  private:

    // utility methods
    
    OglDisplayContext *getContext()
    {
      OglDisplayContext *pOglDC = NULL;
      qsys::ScenePtr pScene = m_pCli->getScene();
      qsys::Scene::ViewIter vi = pScene->beginView();
      qsys::Scene::ViewIter vie = pScene->endView();
      for (; vi!=vie; ++vi) {
        qsys::ViewPtr pView = vi->second;
        gfx::DisplayContext *pDC = pView->getDisplayContext();
        //pDC->setCurrent();
        pOglDC = dynamic_cast<sysdep::OglDisplayContext *>(pDC);
        if (pOglDC!=NULL)
          break;
      }
      return pOglDC;
    }


  };

}

#endif
#endif

