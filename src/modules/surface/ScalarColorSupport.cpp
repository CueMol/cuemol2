// -*-Mode: C++;-*-
//
// Scalar-field colouring shared by the surface renderers
//

#include <common.h>

#include "ScalarColorSupport.hpp"

#include <gfx/GradientColor.hpp>
#include <qlib/Utils.hpp>
#include <qsys/Object.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/Scene.hpp>

using namespace surface;

ScalarColorSupport::ScalarColorSupport()
    : m_dParLow(-10.0), m_dParMid(0.0), m_dParHigh(10.0),
      m_colLow(gfx::SolidColor::createRGB(1.0, 0.0, 0.0)),
      m_colMid(gfx::SolidColor::createRGB(1.0, 1.0, 1.0)),
      m_colHigh(gfx::SolidColor::createRGB(0.0, 0.0, 1.0)),
      m_bRampAbove(false), m_dRampVal(1.4),
      m_pGrad(MB_NEW qsys::MultiGradient())
{
}

ScalarColorSupport::~ScalarColorSupport()
{
}

LString ScalarColorSupport::getScalarTargetName(ScalarMode mode) const
{
  switch (mode) {
  case SCM_RAMP:
    return m_sTgtElePot;
  case SCM_MULTIGRAD:
    return m_sColorMap;
  default:
    return LString();
  }
}

qsys::ScalarObject *ScalarColorSupport::resolveScalarObj(const qsys::ScenePtr &pScene,
                                                         ScalarMode mode) const
{
  if (mode==SCM_NONE || pScene.isnull())
    return NULL;
  const LString name = getScalarTargetName(mode);
  if (name.isEmpty())
    return NULL;
  qsys::ObjectPtr pobj = pScene->getObjectByName(name);
  return dynamic_cast<qsys::ScalarObject *>(pobj.get());
}

qsys::ObjectPtr ScalarColorSupport::getColorMapObjImpl(const qsys::ScenePtr &pScene) const
{
  if (pScene.isnull() || m_sColorMap.isEmpty())
    return qsys::ObjectPtr();
  return pScene->getObjectByName(m_sColorMap);
}

ColorPtr ScalarColorSupport::rampColor(double par) const
{
  if (par<m_dParLow)
    return m_colLow;
  if (par>m_dParHigh)
    return m_colHigh;

  if (par>m_dParMid) {
    // high<-->mid
    double ratio;
    if (qlib::Util::isNear(m_dParHigh, m_dParMid))
      ratio = 1.0;
    else
      ratio = (par-m_dParMid)/(m_dParHigh-m_dParMid);
    return ColorPtr(MB_NEW gfx::GradientColor(m_colHigh, m_colMid, ratio));
  }

  // mid<-->low
  double ratio;
  if (qlib::Util::isNear(m_dParMid, m_dParLow))
    ratio = 1.0;
  else
    ratio = (par-m_dParLow)/(m_dParMid-m_dParLow);
  return ColorPtr(MB_NEW gfx::GradientColor(m_colMid, m_colLow, ratio));
}

ColorPtr ScalarColorSupport::scalarColor(double par, ScalarMode mode) const
{
  switch (mode) {
  case SCM_RAMP:
    return rampColor(par);
  case SCM_MULTIGRAD:
    if (m_pGrad.isnull())
      return ColorPtr();
    return m_pGrad->getColor(par);
  default:
    return ColorPtr();
  }
}

Vector4D ScalarColorSupport::samplePos(const Vector4D &pos, const Vector4D &norm) const
{
  if (m_bRampAbove)
    return pos + norm.scale(m_dRampVal);
  return pos;
}

bool ScalarColorSupport::getScalarColor(const qsys::ScalarObject *pSca,
                                        const Vector4D &pos, const Vector4D &norm,
                                        ScalarMode mode, ColorPtr &rcol) const
{
  if (pSca==NULL || mode==SCM_NONE)
    return false;
  const double par = pSca->getValueAt(samplePos(pos, norm));
  rcol = scalarColor(par, mode);
  return !rcol.isnull();
}
