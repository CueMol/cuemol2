// -*-Mode: C++;-*-
//
// MacOS X CoreGL View implementation
//
// $Id: CglView.hpp,v 1.3 2010/09/05 14:29:20 rishitani Exp $
//

#ifndef CGL_VIEW_HPP_INCLUDE_
#define CGL_VIEW_HPP_INCLUDE_

#include "OglView.hpp"

namespace sysdep {

  class CglDisplayContext;
  using gfx::DisplayContext;

  class SYSDEP_API CglView : public OglView
  {
    typedef OglView super_t;

  private:

    CglDisplayContext *m_pCtxt;

  public:

    CglView();

    virtual ~CglView();
  
    //////////
  
  public:
    virtual LString toString() const;

    virtual DisplayContext *getDisplayContext();

    virtual void swapBuffers();

    virtual void unloading();

    ////
    // framebuffer operations
    
    // void readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize);
    
    // /** setup the projection matrix for hit-testing */
    // void setUpHitProjMat(int x, int y);
    
    // virtual void readObj(qlib::ObjInStream &dis);
    
    //virtual LString hitTest(int x, int y);
    //virtual LString hitTestRect(int x, int y, int w, int h, bool bNearest);
    
    ///////////////////////////////
    // System dependent implementations

    bool attach(void *pnsctxt, CGLContextObj ctx);

  };

}

#endif
