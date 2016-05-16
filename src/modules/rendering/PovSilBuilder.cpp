// -*-Mode: C++;-*-
//
//  Silhouette extraction for Povray rendering
//
//  $Id: PovDisplayContext.cpp,v 1.17 2011/04/11 11:37:29 rishitani Exp $

#include <common.h>

#include <qlib/Vector2D.hpp>
#include <qlib/Vector4D.hpp>

using qlib::Vector2D;
using qlib::Vector4D;

#include "PovDisplayContext.hpp"
#include "RendIntData.hpp"
#include <qlib/PrintStream.hpp>
#include <qlib/Utils.hpp>
#include <gfx/SolidColor.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/style/StyleMgr.hpp>

using namespace render;

using qlib::PrintStream;
using qlib::Matrix4D;
using qlib::Matrix3D;

//////////////////////////////////////////////////////////////
// Silhouette extraction

namespace {

  // for debug
  void writePointMark(PrintStream &ips,
                      const Vector4D &v1,
                      int flag=0)
  {
    double r=.0,g=.0,b=.0;
    double w = 0.02;
    if (flag==1)
      r=1.0;
    else if (flag==2)
      g=1.0;
    else if (flag==3)
      b=1.0;
    ips.format("sphere{<%f, %f, %f>, ", v1.x(), v1.y(), v1.z());
    ips.format("%f ", w);
    ips.format("texture { pigment { color rgb <%f,%f,%f> }}\n", r, g, b);
    ips.format("}\n");
  }

  // for debug
  void writeLineMark(PrintStream &ips,
                     const Vector4D &v1, const Vector4D &v2,
                     int flag=0)
  {
    if (qlib::isNear4(0.0, (v1-v2).sqlen()))
      return;

    double r=.0,g=.0,b=.0;
    double w = 0.01;
    if (flag==1)
      r=1.0;
    else if (flag==2)
      g=1.0;
    else if (flag==3)
      b=1.0;

    ips.format("cylinder{<%f, %f, %f>, ",
               v1.x(), v1.y(), v1.z());
    ips.format("<%f, %f, %f>, ",
               v2.x(), v2.y(), v2.z());
    ips.format("%f ", w);
    ips.format("texture { pigment { color rgb <%f,%f,%f> }}\n", r, g, b);
    ips.format("}\n");
  }

  // for debug
  void writeTriMark(PrintStream &ips,
                    const Vector4D &v1, const Vector4D &v2, const Vector4D &v3,
                    int flag=0)
  {
    if (qlib::isNear4(0.0, (v1-v2).sqlen()))
      return;

    double r=.0,g=.0,b=.0;
    double w = 0.01;
    if (flag==1)
      r=1.0;
    else if (flag==2)
      g=1.0;
    else if (flag==3)
      b=1.0;

    ips.format("triangle{<%f, %f, %f>, ",
               v1.x(), v1.y(), v1.z());
    ips.format("<%f, %f, %f>, ",
               v2.x(), v2.y(), v2.z());
    ips.format("<%f, %f, %f> ",
               v3.x(), v3.y(), v3.z());
    ips.format("texture { pigment { color rgb <%f,%f,%f> }}\n", r, g, b);
    ips.format("}\n");

    ips.format("triangle{<%f, %f, %f>, ",
               v1.x(), v1.y(), v1.z());
    ips.format("<%f, %f, %f>, ",
               v3.x(), v3.y(), v3.z());
    ips.format("<%f, %f, %f> ",
               v2.x(), v2.y(), v2.z());
    ips.format("texture { pigment { color rgb <%f,%f,%f> }}\n", r, g, b);
    ips.format("}\n");
  }
  
  inline Vector4D calcNorm(const Vector4D &v1, const Vector4D &v2, const Vector4D &v3)
  {
    Vector4D tmp = (v2-v1).cross(v3-v1);
    return tmp.normalize();
  }

  bool checkSilEdge(const Vector4D &vwvec, const Vector4D &n1, const Vector4D &n2, double norm_limit)
  {
    double dot1 = vwvec.dot(n1);
    double dot2 = vwvec.dot(n2);
    if (dot1*dot2<0)
      return true;

    double ang = ::acos( n1.dot(n2) );
    if (std::abs(ang)>norm_limit)
      return true;

    return false;
  }

} // namespace anon

//////////////////////////////////////////////////


void PovDisplayContext::writeEdgeLineImpl(PrintStream &ips, int xa1, int xa2,
                                          const Vector4D &x1, const Vector4D &n1,
                                          const Vector4D &x2, const Vector4D &n2)
{
  double r=.0,g=.0,b=.0;
  ColorPtr pcol = getEdgeLineColor();
  if (!pcol.isnull()) {
    r = pcol->fr();
    g = pcol->fg();
    b = pcol->fb();
  }

  const double w = getEdgeLineWidth();
  const double rise = w/2.0;
  LString secname = getSecName();

  if (xa1==255 && xa2==255) {
    // solid lines
    ips.format("edge_line(<%f, %f, %f>, <%f,%f,%f>, <%f, %f, %f>, <%f,%f,%f>, %s_sl_rise*%f,",
               x1.x(), x1.y(), x1.z(),
               n1.x(), n1.y(), n1.z(),
               x2.x(), x2.y(), x2.z(),
               n2.x(), n2.y(), n2.z(),
               secname.c_str(), rise);
    ips.format("%f*%s_sl_scl, ", w, secname.c_str());
    ips.format("%s_sl_tex, <%f,%f,%f>)\n",secname.c_str(), r, g, b);

  }
  else {
    // semi-transparent lines
    ips.format("edge_line2(<%f, %f, %f>, <%f,%f,%f>, %f, <%f, %f, %f>, <%f,%f,%f>, %f, %s_sl_rise*%f,",
               x1.x(), x1.y(), x1.z(),
               n1.x(), n1.y(), n1.z(),
               1.0-xa1/255.0,
               x2.x(), x2.y(), x2.z(),
               n2.x(), n2.y(), n2.z(),
               1.0-xa2/255.0,
               secname.c_str(), rise);
    ips.format("%f*%s_sl_scl, ", w, secname.c_str());
    ips.format("%s_sl_tex, <%f,%f,%f>)\n",secname.c_str(), r, g, b);

  }
}

void PovDisplayContext::writePointImpl(PrintStream &ips,
                                       const Vector4D &v1,
                                       const Vector4D &n1,
                                       int alpha)
{
  double r=.0,g=.0,b=.0;
  ColorPtr pcol = getEdgeLineColor();
  if (!pcol.isnull()) {
    r = pcol->fr();
    g = pcol->fg();
    b = pcol->fb();
  }
  const double w = getEdgeLineWidth();
  const double rise = w/2.0;
  LString secname = getSecName();

  ips.format("sphere{<%f, %f, %f> + %s_sl_rise*%f*<%f,%f,%f>, ",
             v1.x(), v1.y(), v1.z(),
             secname.c_str(), rise,
             n1.x(), n1.y(), n1.z());
  ips.format("%f*%s_sl_scl ", w, secname.c_str());
  if (alpha==255) {
    ips.format("texture { %s_sl_tex pigment { color rgb <%f,%f,%f> }}\n",
               secname.c_str(), r, g, b);
  }
  
  ips.format("}\n");
}



//////////////////////////////
// main routine

void PovDisplayContext::writeSilEdges2()
{

  {
    const int nverts = m_pIntData->m_mesh.getVertexSize();
    const int nfaces = m_pIntData->m_mesh.getFaceSize();
    
    if (nverts<=0 || nfaces<=0)
      return;
  }
  
  PrintStream ps(*m_pPovOut);
  PrintStream ips(*m_pIncOut);

  ps.format("#declare %s_sl_scl = 1.00;\n", getSecName().c_str());
  ps.format("#declare %s_sl_rise = %f;\n", getSecName().c_str(), m_dEdgeRise);
  ps.format("#declare %s_sl_tex = \n", getSecName().c_str());
  ps.format("  texture{finish{ambient 1.0 diffuse 0 specular 0}};\n");

  if (getEdgeLineType()==ELT_SILHOUETTE)
    m_pIntData->setSilhMode(true);
  else
    m_pIntData->setSilhMode(false);

  m_pIntData->calcSilEdgeLines(m_dViewDist, m_dCreaseLimit);

  if (getEdgeLineType()==ELT_SILHOUETTE) {
    m_pIntData->buildAABBTree(-1);
    m_pIntData->calcSilhIntrsec(getEdgeLineWidth()/2.0);
    m_pIntData->writeSilhLines(ips);
  }
  else {
    // in the edge mode,
    // only calculate intersections for cyl and sph meshes 
    m_pIntData->buildAABBTree(MFMOD_MESH);
    m_pIntData->calcEdgeIntrsec();
    m_pIntData->writeEdgeLines(ips);
  }
  
  if (m_nEdgeCornerType!=ECT_NONE)
    m_pIntData->writeCornerPoints(ips);
  //writeCornerPoints2(ips);

  m_pIntData->cleanupSilEdgeLines();
}


#if 0

void PovDisplayContext::writeEdgeLine(PrintStream &ips,
                                      const Vector4D &v1, const Vector4D &v2,
                                      const Vector4D &n1, const Vector4D &n2,
                                      int alpha1, int alpha2,
                                      int flag /*=0*/)
{
  // check invalid vertex and normal
  if (!qlib::isFinite(v1.x()) ||
      !qlib::isFinite(v1.y()) ||
      !qlib::isFinite(v1.z()) ||
      !qlib::isFinite(n1.x()) ||
      !qlib::isFinite(n1.y()) ||
      !qlib::isFinite(n1.z())) {
    LOG_DPRINTLN("PovSilBuilder> invalid vertex/normal for edge line ignored");
    return;
  }

  if (!qlib::isFinite(v2.x()) ||
      !qlib::isFinite(v2.y()) ||
      !qlib::isFinite(v2.z()) ||
      !qlib::isFinite(n2.x()) ||
      !qlib::isFinite(n2.y()) ||
      !qlib::isFinite(n2.z())) {
    LOG_DPRINTLN("PovSilBuilder> invalid vertex/normal for edge line ignored");
    return;
  }

  /*
  if (flag==1)
    r=1.0;
  else if (flag==2)
    g=1.0;
  else if (flag==3)
    b=1.0;
  else if (flag==4)
    r=b=1.0;
  */

  Vector4D x1, x2;
  int xa1, xa2;

  // always keep x1.z < x2.z (for Z-plane clipping)
  if (v1.z()>v2.z()) {
    // swap 1 and 2
    x1 = v2;
    x2 = v1;
    xa1 = alpha2;
    xa2 = alpha1;
  }
  else {
    x1 = v1;
    x2 = v2;
    xa1 = alpha1;
    xa2 = alpha2;
  }

  Vector4D nn = x2 - x1;
  double len = nn.length();

  // ignore too-short lines
  if (qlib::isNear4(0.0, len))
    return;
  
  const double clipz = m_pIntData->m_dClipZ;
  if (clipz>=0) {
    // perform clipping by dClipZ
    if (clipz < x1.z())
      return; // completely clipped by z-plane
    
    if (clipz < x2.z()) // partially clipped
      x2 = nn.scale((clipz-x1.z())/(nn.z())) + x1;
  }
  
  writeEdgeLineImpl(ips, xa1, xa2, x1, n1, x2, n2);
}

void PovDisplayContext::writePoint(PrintStream &ips,
                                   const Vector4D &v1, const Vector4D &n1,
                                   int alpha)
{
  // check invalid vertex and normal
  if (!qlib::isFinite(v1.x()) ||
      !qlib::isFinite(v1.y()) ||
      !qlib::isFinite(v1.z()) ||
      !qlib::isFinite(n1.x()) ||
      !qlib::isFinite(n1.y()) ||
      !qlib::isFinite(n1.z())) {
    LOG_DPRINTLN("PovSilBuilder> invalid vertex/normal for edge corner ignored");
    return;
  }

  const double clipz = m_pIntData->m_dClipZ;
  if (clipz>=0) {
    if (clipz < v1.z())
      return; // clipped out by z-plane
  }

  writePointImpl(ips, v1, n1, alpha);
}
#endif
#if 0
void PovDisplayContext::writeEdgeLine2(PrintStream &ips, const SEEdge &elem)
{
  m_pIntData->m_secpts[elem.icp1].nshow ++;
  m_pIntData->m_secpts[elem.icp2].nshow ++;

  MeshVert *pv1 = m_pIntData->m_vertvec[elem.iv1];
  MeshVert *pv2 = m_pIntData->m_vertvec[elem.iv2];

  ColorPtr col1, col2;
  m_pIntData->m_clut.getColor(pv1->c, col1);
  m_pIntData->m_clut.getColor(pv2->c, col2);
  int alpha1 = col1->a();
  int alpha2 = col2->a();

  writeEdgeLine(ips, pv1->v, pv2->v, pv1->n, pv2->n, alpha1, alpha2, 0);
}

void PovDisplayContext::writeEdgeLine3(PrintStream &ips, const SEEdge &elem, double fsec1, double fsec2)
{
  MeshVert *pv1 = m_pIntData->m_vertvec[elem.iv1];
  MeshVert *pv2 = m_pIntData->m_vertvec[elem.iv2];
  ColorPtr col1, col2;
  m_pIntData->m_clut.getColor(pv1->c, col1);
  m_pIntData->m_clut.getColor(pv2->c, col2);
  int alpha1 = col1->a();
  int alpha2 = col2->a();

  if (qlib::isNear4(fsec1, 0.0))
    m_pIntData->m_secpts[elem.icp1].nshow ++;
  
  if (qlib::isNear4(fsec2, 1.0))
    m_pIntData->m_secpts[elem.icp2].nshow ++;

  Vector4D v12 = pv2->v - pv1->v;

  Vector4D vs1 = pv1->v + v12.scale(fsec1);
  Vector4D vs2 = pv1->v + v12.scale(fsec2);

  bool bs1 = (fsec1<0.5);
  bool bs2 = (fsec2<0.5);

  writeEdgeLine(ips, vs1, vs2,
                bs1?(pv1->n):(pv2->n),
                bs2?(pv1->n):(pv2->n),
                bs1?alpha1:alpha2,
                bs2?alpha1:alpha2,
                0);
}

void PovDisplayContext::writeCornerPoints2(PrintStream &ips)
{
  MeshVert *pv1;

  // write corner points
  BOOST_FOREACH (const SEVertex &elem, m_pIntData->m_secpts) {
    /*
    pv1 = m_pIntData->m_vertvec[elem.iv];
    if (elem.bvis)
      writePointMark(ips, pv1->v, 1);
    else
      writePointMark(ips, pv1->v, 2);
      */

    if (elem.nshow<=1)
      continue;
    
    pv1 = m_pIntData->m_vertvec[elem.iv];

    ColorPtr col1;
    m_pIntData->m_clut.getColor(pv1->c, col1);
    int alpha = col1->a();
    writePoint(ips, pv1->v, pv1->n, alpha);
  }

  return;
}

void PovDisplayContext::writeEdgeLines(PrintStream &ips)
{
  m_pIntData->calcEdgeIntrsec();
  
  BOOST_FOREACH (const SEEdge &elem, m_pIntData->m_silEdges) {
    const int iv1 = elem.iv1;
    const int iv2 = elem.iv2;
    MeshVert *pv1 = m_pIntData->m_vertvec[iv1];
    MeshVert *pv2 = m_pIntData->m_vertvec[iv2];
    Vector4D v1 = pv1->v;
    Vector4D v2 = pv2->v;
    const int icp1 = elem.icp1;
    const int icp2 = elem.icp2;
    
    if (elem.bForceShow ||
        m_pIntData->m_secpts[icp1].bvis ||
        m_pIntData->m_secpts[icp2].bvis) {
      writeEdgeLine2(ips, elem);
      //writeLineMark(ips, pv1->v, pv2->v, 0);
    }
  }
}

void PovDisplayContext::writeSilhLines(PrintStream &ips)
{
  int j;
  
  m_pIntData->calcSilhIntrsec(getEdgeLineWidth()/2.0);
  BOOST_FOREACH (const SEEdge &elem, m_pIntData->m_silEdges) {
    const int iv1 = elem.iv1;
    const int iv2 = elem.iv2;
    MeshVert *pv1 = m_pIntData->m_vertvec[iv1];
    MeshVert *pv2 = m_pIntData->m_vertvec[iv2];
    Vector4D v1 = pv1->v;
    Vector4D v2 = pv2->v;
    const int icp1 = elem.icp1;
    const int icp2 = elem.icp2;


    if (elem.getIsecSize()==0) {

      // no intersections
      //   --> edges with invisible verteces are invisible
      if (!m_pIntData->m_secpts[icp1].bvis)
        continue;
      if (!m_pIntData->m_secpts[icp2].bvis)
        continue;

      writeEdgeLine2(ips, elem);
      // writeLineMark(ips, pv1->v, pv2->v, 0);
    }
    else {

      std::deque< std::pair<double,double> > icvals;
      elem.getIsecValues(m_pIntData->m_secpts[icp1].bvis,
                         icvals);
      const int nvals = icvals.size();
      for (j=0; j<nvals; ++j) {
        writeEdgeLine3(ips, elem, icvals[j].first, icvals[j].second);
      }

      /*
        std::deque<Vector4D> icpts;
        elem.calcIsecPoints(v1, v2, icpts);

        bool bprev = m_pIntData->m_secpts[icp1].bvis;
        Vector4D vprev = pv1->v;

        for (j=0; j<=icpts.size(); ++j) {
          Vector4D vc;
          if (j<icpts.size()) {
            vc = icpts[j];
          else {
            vc = pv2->v;
          }

          if (bprev) {
            writeLineMark(ips, vprev, vc, 1);
          }
          else {
            writeLineMark(ips, vprev, vc, 2);
          }

          bprev = !bprev;
          vprev = vc;
        } // for
       */

    }
  }
}

#endif
