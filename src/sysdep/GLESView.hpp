// -*-Mode: C++;-*-
//
// OpenGLES View common implementation
//

#ifndef OPENGL_ES_VIEW_HPP_INCLUDE_
#define OPENGL_ES_VIEW_HPP_INCLUDE_

#include "sysdep.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/LQuat.hpp>
#include <qsys/View.hpp>
#include <gfx/Hittest.hpp>
#include "TouchEventHandler.hpp"

namespace gfx {
  class DisplayContext;
}

namespace sysdep {
  using qlib::LReal;

  class GLES1DisplayContext;

  /// Hittest data structure for OpenGL ES 1/2
  class SYSDEP_API GLESHitData : public gfx::RawHitData
  {
  public:
    qlib::uid_t m_nRendID;
    int m_nNID;

  public:
    virtual ~GLESHitData();
    virtual int getDataSize(qlib::uid_t rend_id) const;
    virtual int getDataAt(qlib::uid_t rend_id, int ii, int subii) const;
  };

  /// OpenGLES view common implementation
  class SYSDEP_API GLESView : public qsys::View
  {
  private:
    GLESView(const GLESView &r);

  public:

    GLESView();

    virtual ~GLESView();

    ///////////////

    virtual void swapBuffers();

    ///////////////
    // Hit test operations
    
    virtual LString hitTest(int x, int y);

    ///////////////
    // Touch events

    void panStart(int numtch, float x, float y);
    void panMove(int numtch, float x, float y);
    void panEnd(int numtch, float x, float y, float vx, float vy);
    
  private:
    void setupTouchEvent(qsys::InDevEvent &ev, int numtch, float x, float y);
    TouchEventHandler m_meh;

  };

}

#endif
