// -*-Mode: C++;-*-
//
//  AGL display context implementation
//
//  $Id: AglDisplayContext.hpp,v 1.4 2009/08/22 08:11:40 rishitani Exp $

#ifndef GFX_AGL_DISPLAY_CONTEXT_HPP_
#define GFX_AGL_DISPLAY_CONTEXT_HPP_

#include "OglDisplayContext.hpp"
#include "AglView.hpp"

namespace sysdep {

  class AglDisplayContext : public OglDisplayContext
  {
  private:
    //WindowRef m_win;
    //CGrafPtr m_grafptr;

    AGLContext m_glcx;

    AglView *m_pTargetView;

  public:
    AglDisplayContext(int sceneid, AglView *pView);

    virtual ~AglDisplayContext();

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    virtual qsys::View *getTargetView() const {
      return m_pTargetView;
    }

    ///////////////
    // System dependent impl.

    bool attach(AGLContext cx);
    AGLContext getAGLContext() const { return m_glcx; }
  };

}

#endif
