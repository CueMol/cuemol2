// -*-Mode: C++;-*-
//
//  WGL display context implementation
//
//  $Id: WglDisplayContext.hpp,v 1.9 2009/08/22 08:11:40 rishitani Exp $

#ifndef GFX_WGL_DISPLAY_CONTEXT_HPP_
#define GFX_WGL_DISPLAY_CONTEXT_HPP_

#include "OglDisplayContext.hpp"
#include "WglView.hpp"

namespace sysdep {

  class WglDisplayContext : public OglDisplayContext
  {
  private:
    HGLRC m_hGlrc;

    // HDC m_hDC;
    // WglView *m_pTargetView;

  public:
    //WglDisplayContext(int sceneid, WglView *pView);
    WglDisplayContext(int sceneid) : OglDisplayContext(sceneid), m_hGlrc(NULL)
    {
    }


    virtual ~WglDisplayContext();

    virtual bool setCurrent();
    virtual bool isCurrent() const;
    
    // virtual qsys::View *getTargetView() const {
    // return m_pTargetView;
    // }

    ///////////////
    // system dependent methods

    void setHGLRC(HGLRC hGL) { m_hGlrc = hGL; }

    HGLRC getHGLRC() const { return m_hGlrc; }
  };

}

#endif
