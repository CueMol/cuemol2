// -*-Mode: C++;-*-
//
//  Unit-cell renderer class
//
// $Id: UnitCellRenderer.cpp,v 1.4 2011/04/06 13:09:32 rishitani Exp $

#include <common.h>

#include "UnitCellRenderer.hpp"
#include "CrystalInfo.hpp"

#include <gfx/TextRenderManager.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/Object.hpp>
#include <qsys/ScalarObject.hpp>

using namespace symm;

UnitCellRenderer::UnitCellRenderer()
     : super_t()
{
  //m_color = LColor(255, 255, 0);
  //m_labcol = LColor(255, 0, 0);
  m_linew = 1.0;
  // m_dispx = m_dispy = 0.0;
}

UnitCellRenderer::~UnitCellRenderer()
{
}

const char *UnitCellRenderer::getTypeName() const
{
  return "*unitcell";
}

LString UnitCellRenderer::toString() const
{
  return "unitcell";
}

bool UnitCellRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  CrystalInfoPtr pcx = pobj->getExtData("CrystalInfo");
  if (! pcx.isnull())
    return true;

  qsys::ScalarObject *ptest = dynamic_cast<qsys::ScalarObject *>(pobj.get());
  return ptest!=NULL;
}

bool UnitCellRenderer::isHitTestSupported() const
{
  return false;
}

void UnitCellRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

void UnitCellRenderer::postRender(DisplayContext *pdc)
{
}

Vector4D UnitCellRenderer::getCenter() const
{
  qsys::ObjectPtr pobj = getClientObj();
  CrystalInfoPtr pci = pobj->getExtData("CrystalInfo");
  if (!pci.isnull()) {
    Vector4D pt(0.5,0.5,0.5);
    pci->fracToOrth(pt);
    return pt;
  }
  
  qsys::ScalarObject *psca = dynamic_cast<qsys::ScalarObject *>(pobj.get());
  if (psca!=NULL) {
    return psca->getCenter();
  }

  // error !!
  return Vector4D();
}

//////////////////////////////////////////////////////////////////////////
// drawing

void UnitCellRenderer::render(DisplayContext *pdl)
{
  qsys::ObjectPtr pobj = getClientObj();
  CrystalInfoPtr pci = pobj->getExtData("CrystalInfo");
  if (pci.isnull()) {
    qsys::ScalarObject *psca = dynamic_cast<qsys::ScalarObject *>(pobj.get());
    if (psca==NULL)
      return;
    
    pdl->pushMatrix();
    pdl->translate(psca->getOrigin());
    Vector4D scl(psca->getColNo() * psca->getColGridSize(),
                 psca->getRowNo() * psca->getRowGridSize(),
                 psca->getSecNo() * psca->getSecGridSize());
    pdl->scale(scl);
  }
  else {
    pdl->pushMatrix();
    Matrix3D orthmat = pci->getOrthMat();
    pdl->multMatrix(Matrix4D(orthmat));
  }
  
  pdl->color(m_color);
  pdl->setLineWidth(m_linew);

  ////

  pdl->startLineStrip();
  pdl->vertex(0,0,0);
  pdl->vertex(1, 0, 0);
  pdl->vertex(1, 1, 0);
  pdl->vertex(0, 1, 0);
  pdl->vertex(0, 0, 0);
  pdl->end();

  pdl->startLines();
  pdl->vertex(0, 0, 0);
  pdl->vertex(0, 0, 1);

  pdl->vertex(1, 0, 0);
  pdl->vertex(1, 0, 1);

  pdl->vertex(1, 1, 0);
  pdl->vertex(1, 1, 1);

  pdl->vertex(0, 1, 0);
  pdl->vertex(0, 1, 1);
  pdl->end();

  pdl->startLineStrip();
  pdl->vertex(0, 0, 1);
  pdl->vertex(1, 0, 1);
  pdl->vertex(1, 1, 1);
  pdl->vertex(0, 1, 1);
  pdl->vertex(0, 0, 1);
  pdl->end();

  ////

  pdl->color(m_labcol);

  pdl->drawString(Vector4D(0, 0, 0), "O");
  pdl->drawString(Vector4D(1, 0, 0), "X");
  pdl->drawString(Vector4D(0, 1, 0), "Y");
  pdl->drawString(Vector4D(0, 0, 1), "Z");

  pdl->popMatrix();
  // pdl->setLighting(true);
}


