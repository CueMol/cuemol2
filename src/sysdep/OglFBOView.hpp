// -*-Mode: C++;-*-
//
// OpenGL implementation for off-screen image rendering using FBO
//

#ifndef OGL_FBO_VIEW_HPP_INCLUDE_
#define OGL_FBO_VIEW_HPP_INCLUDE_

#include "OglView.hpp"

namespace sysdep {

  class OglDisplayContext;
  using gfx::DisplayContext;

  class SYSDEP_API OglFBOView : public OglView
  {
  private:
    typedef OglView super_t;

    /// Parent view for this off-screen view
    OglView *m_pParView;

    /// Frame buffer ID
    GLuint m_nFrameBufID;

    /// Renderer buffer ID (RGBA color)
    GLuint m_nRendBufID;

    /// Renderer buffer ID (depth component)
    GLuint m_nDepthBufID;

    OglFBOView(const OglFBOView &) {}

  public:

    OglFBOView();

    virtual ~OglFBOView();
  
    //////////
  
  public:
    virtual LString toString() const;

    // virtual void unloading();

    virtual DisplayContext *getDisplayContext();

    virtual void drawScene();

    // virtual void swapBuffers();

    ////
    // framebuffer operations
    
    virtual void readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize, int ncomp);

    ///////////////////////////////
    // FBO dependent implementations

    /// attach to the parent view and create fbo
    bool attach(OglView *pParView, int width, int height);

    /// detach from the parent view and perform cleanup
    void detach();

  private:
  };

}

#endif
