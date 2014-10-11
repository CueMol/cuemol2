// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: SESArc.cpp,v 1.3 2011/02/12 13:51:19 rishitani Exp $

#include <common.h>
#include "surface.hpp"
#ifdef SURF_BUILDER_TEST

#include "SESArc.hpp"
#include "RSComponent.hpp"
#include "SurfTgSet.hpp"
#include <gfx/DisplayContext.hpp>

using namespace surface;
using gfx::DisplayContext;
using qlib::Matrix3D;

SESArc::SESArc()
     : m_pSnglArc(NULL), m_bRadSngl(false)
{
}

SESArc::~SESArc()
{
  if (m_pSnglArc!=NULL)
    delete m_pSnglArc;
}

/** setup for concave arc */
void SESArc::setup(const Vector4D &rvc, int ridx0, int ridx1, const SurfTgSet &sts)
{
  // m_bRadSngl = false;

  m_vc = rvc;
  m_idx0 = ridx0;
  m_idx1 = ridx1;

  m_v0 = sts.getVertex(m_idx0);
  m_v1 = sts.getVertex(m_idx1);

  Vector4D vc0 = m_v0 - m_vc;
  Vector4D vc1 = m_v1 - m_vc;
  m_norm = ( vc0.cross(vc1) ).normalize();

  m_rad = vc0.length();
  double d1 = vc1.length();

  m_th = ::acos(vc0.dot(vc1) / (m_rad*d1));
}

/** setup for convex arc (this is a partial initialization.) */
void SESArc::setup2(const Vector4D &rvc, int ridx0, int ridx1, const SurfTgSet &sts)
{
  // m_bRadSngl = false;

  m_vc = rvc;
  m_idx0 = ridx0;
  m_idx1 = ridx1;

  m_v0 = sts.getVertex(m_idx0);
  m_v1 = sts.getVertex(m_idx1);

  Vector4D vc0 = m_v0 - m_vc;
  m_rad = vc0.length();

  // Vector4D vc1 = m_v1 - m_vc;
  // m_norm = ( vc0.cross(vc1) ).normalize();

  // double d1 = vc1.length();

  // m_th = ::acos(vc0.dot(vc1) / (m_rad*d1));
}

int SESArc::calcTessLev(double density, int nmindiv) const
{
  const double arclen = qlib::abs(m_th * m_rad);
  int ndiv = (int) ::ceil(arclen * density);
  if (ndiv<nmindiv)
    ndiv = nmindiv;
  return ndiv;
}

void SESArc::makeVertHelper(std::vector<Vector4D> &verts, double den) const
{
  const int ndiv = calcTessLev(den, 5);
  const double dth = m_th/double(ndiv);

  verts.resize(ndiv+1);

  Vector4D vc0 = m_v0 - m_vc;
  Vector4D vc1 = m_v1 - m_vc;
  Vector4D e0 = vc0.scale(1.0/m_rad);
  Vector4D vc2 = vc0.cross(vc1);
  Vector4D e2 = vc2.normalize();
  Vector4D e1 = e2.cross(e0);

  Matrix3D xfm;
  xfm.aij(1,1) = e0.x();
  xfm.aij(2,1) = e0.y();
  xfm.aij(3,1) = e0.z();
  
  xfm.aij(1,2) = e1.x();
  xfm.aij(2,2) = e1.y();
  xfm.aij(3,2) = e1.z();
  
  xfm.aij(1,3) = e2.x();
  xfm.aij(2,3) = e2.y();
  xfm.aij(3,3) = e2.z();

  int i;
  double ith = 0.0;
  for (i=0; i<=ndiv; ++i) {
    Vector4D tv(m_rad*::cos(ith), m_rad*::sin(ith), 0.0);
    xfm.xform(tv);
    tv += m_vc;
    verts[i] = tv;
    ith += dth;
  }

  return;
}

void SESArc::makeVerteces(SurfTgSet &sts, const Vector4D &cen, double den)
{
  int i;

  std::vector<Vector4D> verts;
  makeVertHelper(verts, den);
  int ndiv = verts.size();

  m_verts.resize(ndiv);
  for (i=0; i<ndiv; ++i) {
    m_verts[i] = sts.addVertex(verts[i], (cen-verts[i]).normalize());
  }
}

void SESArc::draw(DisplayContext *pdl, double den) const
{
  std::vector<Vector4D> verts;
  makeVertHelper(verts, den);

  int ndiv = verts.size();
  int i;
  double ith = 0.0;
  pdl->setLighting(false);

  // Radial lines
  pdl->startLineStrip();
  pdl->color(1,0,0);
  pdl->vertex(m_v1);
  pdl->vertex(m_vc);
  pdl->vertex(m_v0);

  // Arc lines
  pdl->color(1,1,1);
  for (i=0; i<ndiv; ++i) {
    pdl->vertex(verts[i]);
  }

  pdl->end();
  pdl->setLighting(true);

  if (m_pSnglArc!=NULL)
    m_pSnglArc->draw(pdl, den);
}

#endif // SURF_BUILDER_TEST

