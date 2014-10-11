
#include <common.h>

#include "TestRenderer.hpp"
#include <gfx/SolidColor.hpp>
#include <gfx/DisplayContext.hpp>
#include <gfx/Hittest.hpp>

using namespace qsys;
using gfx::SolidColor;
using gfx::DisplayContext;

TestRenderer::TestRenderer()
     : Renderer()
{
  resetAllProps();
}

TestRenderer::~TestRenderer()
{
  LOG_DPRINTLN("TestRenderer(%p) destructed\n", this);
}

LString TestRenderer::toString() const
{
  return LString::format("TestRenderer(name=%s)", getName().c_str());
}

////////////////////////////////////////////

const char *TestRenderer::getTypeName() const
{
  return "test";
}


void TestRenderer::display(DisplayContext *pdc)
{
  // MB_DPRINTLN("TestRenderer %p(%d) display()", this, getUID());

  double d = 5;

  pdc->setLighting(true);
  //pdc->setLighting(false);

  pdc->pushName(0);
  pdc->startPolygon();
  pdc->normal(Vector4D(0,0,1));

  pdc->color(m_col1);
  pdc->vertex(Vector4D(d,d,d));

  //pdc->color(SolidColor("blue"));
  pdc->color(SolidColor::createRGB(0,0,255));
  pdc->vertex(Vector4D(-d,d,d));

  //pdc->color(SolidColor("green"));
  pdc->color(SolidColor::createRGB(0,255,0));
  pdc->vertex(Vector4D(-d,-d,d));

  //pdc->color(SolidColor("cyan"));
  pdc->color(SolidColor::createRGB(0,255,255));
  pdc->vertex(Vector4D(d,-d,d));
  pdc->end();
      

  pdc->loadName(1);
  pdc->startPolygon();
  pdc->normal(Vector4D(0,0,-1));

  pdc->color(1.0, 1.0, 0.0);
  pdc->vertex(Vector4D(-d,d,-d));

  pdc->color(1.0, 0.0, 0.0);
  pdc->vertex(Vector4D(d,d,-d));

  pdc->color(0.0, 0.0, 1.0);
  pdc->vertex(Vector4D(d,-d,-d));

  pdc->color(m_col1);
  pdc->vertex(Vector4D(-d,-d,-d));
  pdc->end();

  //

  pdc->loadName(2);
  pdc->startPolygon();
  pdc->normal(Vector4D(1,0,0));

  pdc->color(1.0, 0.0, 0.0);
  pdc->vertex(Vector4D(d,d,d));

  pdc->color(1.0, 1.0, 0.0);
  pdc->vertex(Vector4D(d,-d,d));

  pdc->color(m_col1);
  pdc->vertex(Vector4D(d,-d,-d));

  pdc->color(0.0, 0.0, 1.0);
  pdc->vertex(Vector4D(d,d,-d));
  pdc->end();


  pdc->loadName(3);
  pdc->startPolygon();
  pdc->normal(Vector4D(-1,0,0));

  pdc->color(1.0, 0.0, 0.0);
  pdc->vertex(Vector4D(-d,d,-d));

  pdc->color(m_col1);
  pdc->vertex(Vector4D(-d,-d,-d));

  pdc->color(1.0, 1.0, 0.0);
  pdc->vertex(Vector4D(-d,-d,d));

  pdc->color(0.0, 0.0, 1.0);
  pdc->vertex(Vector4D(-d,d,d));
  pdc->end();

  //

  pdc->loadName(4);
  pdc->startPolygon();
  pdc->normal(Vector4D(0,1,0));

  pdc->color(m_col1);
  pdc->vertex(Vector4D(d,d,d));

  pdc->color(1.0, 1.0, 0.0);
  pdc->vertex(Vector4D(d,d,-d));

  pdc->color(1.0, 0.0, 0.0);
  pdc->vertex(Vector4D(-d,d,-d));

  pdc->color(0.0, 0.0, 1.0);
  pdc->vertex(Vector4D(-d,d,d));
  pdc->end();

  pdc->loadName(5);
  pdc->startPolygon();
  pdc->normal(Vector4D(0,-1,0));

  pdc->color(1.0, 0.0, 0.0);
  pdc->vertex(Vector4D(-d,-d,d));

  pdc->color(1.0, 1.0, 0.0);
  pdc->vertex(Vector4D(-d,-d,-d));

  pdc->color(0.0, 0.0, 1.0);
  pdc->vertex(Vector4D(d,-d,-d));

  pdc->color(m_col1);
  pdc->vertex(Vector4D(d,-d,d));
  pdc->end();

  pdc->popName();
}

void TestRenderer::displayHit(DisplayContext *pdc)
{
  display(pdc);
}

LString TestRenderer::interpHit(const gfx::RawHitData &rhit)
{
  LString rval;
  int nface;
  if (rhit.getData(4, nface)) {
    rval += LString::format("\"faceid\": %d,\n", nface);
  }
  rval += "\"objtype\": \"Test\",\n";
  return rval;
}

Vector4D TestRenderer::getCenter() const
{
  return Vector4D(0,0,0);
}
