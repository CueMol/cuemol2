// -*-Mode: C++;-*-
//
//  CGL display context implementation
//
//  $Id: CglDisplayContext.hpp,v 1.2 2010/09/05 14:29:20 rishitani Exp $

#ifndef GFX_CGL_DISPLAY_CONTEXT_HPP_
#define GFX_CGL_DISPLAY_CONTEXT_HPP_

#include "OglDisplayContext.hpp"
#include "CglView.hpp"

namespace sysdep {

  class SYSDEP_API CglDisplayContext : public OglDisplayContext
  {
  private:

    CGLContextObj m_glcx;

    // ptr to the NSOpenGLContext (objC) associated with m_glcx
    void *m_pnsc;

    // CglView *m_pTargetView;
    
  public:
    //CglDisplayContext(int sceneid, CglView *pView);
    CglDisplayContext();

    virtual ~CglDisplayContext();

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    ///////////////
    // System dependent impl.

    bool attach(void *pnsc, CGLContextObj cx);
    CGLContextObj getCGLContext() const { return m_glcx; }
    void *getNSGLContext() const { return m_pnsc; }
  };

}

#endif
