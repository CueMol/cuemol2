// -*-Mode: C++;-*-
//
// OpenGL ES2 View implementation
//

#ifndef OPENGL_ES2_VIEW_HPP_INCLUDE_
#define OPENGL_ES2_VIEW_HPP_INCLUDE_

#include "sysdep.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/LQuat.hpp>
#include <gfx/Hittest.hpp>
#include "GLESView.hpp"

namespace gfx {
  class DisplayContext;
}

namespace sysdep {

  class GLES2DisplayContext;

  /// OpenGLES2 view implementation
  class SYSDEP_API GLES2View : public GLESView
  {
  private:
    GLES2View(const GLES2View &r);

  public:

    GLES2View();

    virtual ~GLES2View();

    ///////////////

    /// Setup the projection matrix for stereo (View interface)
    virtual void setUpModelMat(int nid);
    
    /// Setup projection matrix (View interface)
    virtual void setUpProjMat(int w, int h);
    
    /// Draw current scene (View interface)
    virtual void drawScene();

    virtual gfx::DisplayContext *getDisplayContext();

    virtual void unloading();

    ///////////////

    /// common setup for GLES2
    void setup();

  private:

    GLES2DisplayContext *m_pCtxt;

    void setFogColorImpl();

    void setUpLightColor();
  };

}

#endif
