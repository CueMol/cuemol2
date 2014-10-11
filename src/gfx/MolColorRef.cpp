// -*-Mode: C++;-*-
//
//  Special color object for molcolor reference impl.
//

#include <common.h>

#include "MolColorRef.hpp"
#include "SolidColor.hpp"
#include <qlib/Utils.hpp>
#include <qlib/Vector4D.hpp>

using namespace gfx;

bool MolColorRef::equals(const AbstractColor &c) const
{
  if (dynamic_cast<const MolColorRef *>(&c))
    return true;
  else
    return false;
}

LString MolColorRef::toString() const
{
  LString rval("$molcol");

  LString modif = makeModifFromProps();
  if (!modif.isEmpty())
    rval += "{" + modif + "}";

  return rval;
}

bool MolColorRef::isAlphaSet() const
{
  if (m_alpha<-0.01)
    return false;
  else
    return true;
}
    
bool MolColorRef::isModSet() const
{
  if (qlib::isNear4(m_dModHue, 0.0) &&
      qlib::isNear4(m_dModSat, 0.0) &&
      qlib::isNear4(m_dModBri, 0.0))
    return false;
  return true;
}

ColorPtr MolColorRef::modifyColor(const ColorPtr &pCol) const
{
  qlib::LScrSp<SolidColor> pRval;
  LString origmat = pCol->getMaterial();
  LString newmat;
  bool bAlpha = isAlphaSet();

  if (!m_material.isEmpty())
    newmat = m_material;
  else if (!origmat.isEmpty())
    newmat = origmat;

  if (isModSet()) {
    double hue, bri, sat;
    AbstractColor::RGBtoHSB(pCol->r(), pCol->g(), pCol->b(),
                            hue, sat, bri);
    hue += m_dModHue/360.0;
    sat += m_dModSat;
    bri += m_dModBri;

    pRval = SolidColor::createHSB(hue, sat, bri, pCol->fa());
    pRval->setMaterial(newmat);

    if (!bAlpha)
      return pRval;
  }
  else {
    if (!bAlpha && newmat.isEmpty())
      return pCol;

    //pRval = SolidColor::createRGB(pCol->r(), pCol->g(), pCol->b());
    pRval = qlib::LScrSp<SolidColor>(new SolidColor(pCol->getCode()));
    pRval->setMaterial(newmat);
  }

  if (bAlpha)
    // alpha is set
    pRval->setAlpha(m_alpha);

  return pRval;
}

