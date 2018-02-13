// -*-Mode: C++;-*-
//
//  OpenGL Display list implementation class
//
//  $Id: OglDisplayList.hpp,v 1.5 2009/08/22 07:10:36 rishitani Exp $

#ifndef OGL_DISPLAY_LIST_H__
#define OGL_DISPLAY_LIST_H__

#include "OglDisplayContext.hpp"

namespace sysdep {

  class OglDisplayList : public OglDisplayContext
  {
  private:
    /// Display List ID
    GLuint m_nID;

    bool m_fValid;

    // /** parent display context */
    //OglDisplayContext *m_pParent;

  public:
    OglDisplayList();
    virtual ~OglDisplayList();

    ///////////////////////////////

    virtual bool setCurrent() { return true; }
    virtual bool isCurrent() const { return true; }

    ///////////////////////////////
    // Display List support

    virtual gfx::DisplayContext *createDisplayList();
    virtual bool canCreateDL() const;

    virtual bool isDisplayList() const;
  
    //////////////////////////////
    // DisplayList impl.

    virtual bool isValid() const { return m_fValid; }

    virtual bool recordStart();
    virtual void recordEnd();

    //////////////////////////////
    // OpenGL implementation

    void invalidate() { m_fValid = false; }

    GLuint getID() {
      return m_nID;
    }

	virtual qsys::View *getTargetView() const { return NULL; }
    
    // OglDisplayContext *getParentContext() const { return m_pParent; }

    // static void setTransRot(const Vector3D &pos, const Vector3D &vec);
  };

}


#endif
