// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: MS2TestRenderer.cpp,v 1.1 2011/02/11 06:54:22 rishitani Exp $

#include <common.h>

#include "MS2TestRenderer.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/Mesh.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include "BALL/common.h"
#include "BALL/STRUCTURE/reducedSurface.h"
#include "BALL/STRUCTURE/solventExcludedSurface.h"
#include "BALL/STRUCTURE/solventAccessibleSurface.h"
#include "BALL/STRUCTURE/triangulatedSES.h"
#include "BALL/STRUCTURE/triangulatedSAS.h"

using namespace surface;
using gfx::DisplayContext;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::AtomIterator;

using namespace BALL;

MS2TestRenderer::MS2TestRenderer()
{
}

MS2TestRenderer::~MS2TestRenderer()
{
}

const char *MS2TestRenderer::getTypeName() const
{
  return "ms2test";
}

void MS2TestRenderer::render(DisplayContext *pdl)
{
  MolCoordPtr pmol = getClientMol();

  AtomIterator aiter(pmol);
  int i, natoms=0;

  // count atom number
  for (aiter.first(); aiter.hasMore(); aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    MB_ASSERT(!pAtom.isnull());
    ++natoms;
  }

  std::vector< BALL::TSphere3<double> > spheres(natoms);

  // copy to the m_data
  Vector4D pos;
  for (i=0,aiter.first(); aiter.hasMore()&&i<natoms; aiter.next(),++i)
  {
    MolAtomPtr pAtom = aiter.get();
    pos = pAtom->getPos();

    spheres.at(i) = BALL::TSphere3<double>(BALL::TVector3<double>(pos.x(), pos.y(), pos.z()), 1.5);
  }

/*
  std::vector< BALL::TSphere3<double> > spheres;
spheres.push_back(TSphere3<double>(TVector3<double>(53.952, 23.770,  8.582),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(54.149, 23.313,  7.290),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(55.381, 22.525,  7.042),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(53.208, 23.591,  6.311),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(53.383, 23.136,  5.091),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(52.041, 24.374,  6.639),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(51.010, 24.602,  5.592),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(51.877, 24.805,  7.966),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(52.856, 24.510,  8.901),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(50.715, 25.648,  8.405),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(49.543, 24.772,  8.593),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(48.110, 25.444,  8.994),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(47.733, 26.353,  7.865),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(48.327, 26.200, 10.296),1.3));
spheres.push_back(TSphere3<double>(TVector3<double>(47.246, 24.206,  9.175),1.3));
*/
  
  double probe_radius = 1.5;
  BALL::ReducedSurface rs(spheres, probe_radius);
  rs.compute();
  // std::cerr<<rs << std::endl;
  
  const double density = 5;

  SolventAccessibleSurface sas(&rs);
  sas.compute();
  TriangulatedSAS surface(&sas, density);
  surface.compute();

#if 0  
  BALL::SolventExcludedSurface ses(&rs);
  ses.compute();
  if (!ses.check()) {
    //std::cout << "ses check failed" << std::endl;
    LOG_DPRINTLN("MS2TestRend> SES check failed.");
    return;
  }

  /*
  double diff = (probe_radius < 1.5 ? 0.01 : -0.01);
  Size i = 0;
  bool ok = false;
  while (!ok && (i < 10)) {
    i++;
    ok = ses->check();
    if (!ok) {
      delete ses;
      delete reduced_surface;
      probe_radius_ += diff;
      reduced_surface = new ReducedSurface(spheres_, probe_radius_);
      reduced_surface->compute();
      ses = new SolventExcludedSurface(reduced_surface);
      ses->compute();
    }
  }
  */

  BALL::TriangulatedSES surface(&ses, density);
  surface.compute();
#endif

  int nverts = surface.getNumberOfPoints();
  int nfaces = surface.getNumberOfTriangles();


  gfx::Mesh mesh;
//  mesh.setDefaultAlpha(getDefaultAlpha());
  mesh.init(nverts, nfaces);
  mesh.color(getDefaultColor());

  {
    BALL::TriangulatedSES::ConstPointIterator iter = surface.beginPoint();
    BALL::TriangulatedSES::ConstPointIterator eiter = surface.endPoint();
    int i = 0;
    for (;iter != eiter; ++iter) {
      BALL::TrianglePoint& tri_point = **iter;

      mesh.normal(Vector4D(tri_point.normal_.x,tri_point.normal_.y,tri_point.normal_.z));
      mesh.setVertex(i, Vector4D(tri_point.point_.x,tri_point.point_.y,tri_point.point_.z));

      tri_point.setIndex(i);
      i++;
    }
  }

  {
    BALL::TriangulatedSES::ConstTriangleIterator iter = surface.beginTriangle();
    BALL::TriangulatedSES::ConstTriangleIterator eiter = surface.endTriangle();
    int i=0;
    for (; iter!=eiter; ++iter, ++i) {
      //std::cout << (**iter) << std::endl;
      int v1 = (*iter)->getVertex(0)->getIndex();
      int v2 = (*iter)->getVertex(1)->getIndex();
      int v3 = (*iter)->getVertex(2)->getIndex();
      //printf("%6d %6d %6d\n", v1, v2, v3);
      mesh.setFace(i, v1, v2, v3);
    }
  }

  pdl->setLighting(true);
  pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);

  // do it!!
  pdl->drawMesh(mesh);

  pdl->setLighting(false);

/*
  MolSurfBuilder msb;
  msb.init(pmol);

  pdl->setLighting(true);
  int nDetailOld = pdl->getDetail();
  pdl->setDetail(10);

  msb.setDC(pdl);
  msb.build();

  pdl->setDetail(nDetailOld);
  pdl->setLighting(false);
*/
}

qlib::Vector4D MS2TestRenderer::getCenter() const
{
  return Vector4D();
}

// Hittest implementation
bool MS2TestRenderer::isHitTestSupported() const
{
  return false;
}

void MS2TestRenderer::renderHit(DisplayContext *phl)
{
}

