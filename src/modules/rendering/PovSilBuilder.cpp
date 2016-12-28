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
    ips.format("edge_line(");
    ips.format("<%f, %f, %f>, ", x1.x(), x1.y(), x1.z());
    ips.format("<%f, %f, %f>, ", n1.x(), n1.y(), n1.z());
    ips.format("<%f, %f, %f>, ", x2.x(), x2.y(), x2.z());
    ips.format("<%f, %f, %f>, ", n2.x(), n2.y(), n2.z());
    ips.format("%s_sl_rise*%f,", secname.c_str(), rise);
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


