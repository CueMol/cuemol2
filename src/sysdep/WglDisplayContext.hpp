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
    HDC m_hDC;

  public:
    WglDisplayContext();

    virtual ~WglDisplayContext();

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    ///////////////
    // system dependent methods

    //bool setup(HDC hdc, DisplayContext *pShareCtxt);
    bool attach(HDC hdc, HGLRC hGL);
    HGLRC getHGLRC() const { return m_hGlrc; }
  };

}

#endif
