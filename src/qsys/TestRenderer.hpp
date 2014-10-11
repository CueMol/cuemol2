// -*-Mode: C++;-*-
//
//  Test renderer
//
//  $Id: TestRenderer.hpp,v 1.10 2011/01/08 18:28:29 rishitani Exp $

#ifndef TEST_RENDERER_HPP_
#define TEST_RENDERER_HPP_

#include "qsys.hpp"

#include <gfx/SolidColor.hpp>
#include "Renderer.hpp"

namespace qsys {

  class QSYS_API TestRenderer : public Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef qsys::Renderer super_t;

  public:

    gfx::ColorPtr m_col1;
    

    TestRenderer();
    TestRenderer(const TestRenderer &r) : Renderer(r) {}
    virtual ~TestRenderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual void display(DisplayContext *pdc);
    virtual const char *getTypeName() const;
    virtual LString toString() const;
    virtual qlib::Vector4D getCenter() const;

    virtual bool isCompatibleObj(ObjectPtr pobj) const
    {
      return false;
    }

    virtual void unloading() {}

    virtual bool isHitTestSupported() const { return true; }
    virtual void displayHit(DisplayContext *pdc);
    virtual LString interpHit(const gfx::RawHitData &rhit);

  };

}

#endif

