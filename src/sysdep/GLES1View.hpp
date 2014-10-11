// -*-Mode: C++;-*-
//
// OpenGL ES1 View implementation
//

#ifndef OPENGL_ES1_VIEW_HPP_INCLUDE_
#define OPENGL_ES1_VIEW_HPP_INCLUDE_

#include "sysdep.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/LQuat.hpp>
#include <gfx/Hittest.hpp>
#include "GLESView.hpp"

namespace gfx {
  class DisplayContext;
}

namespace sysdep {

  class GLES1DisplayContext;

  /// OpenGLES1.1 view implementation
  class SYSDEP_API GLES1View : public GLESView
  {
  private:
    GLES1View(const GLES1View &r);

  public:

    GLES1View();

    virtual ~GLES1View();

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

    /// common setup for GLES1.1
    void setup();

  private:

    GLES1DisplayContext *m_pCtxt;

    void setFogColorImpl();

    void setUpLightColor();
  };

}

#endif
