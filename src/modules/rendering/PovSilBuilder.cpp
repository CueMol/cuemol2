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

// #define CGAL_NO_AUTOLINK
#define CGAL_LIB_DIAGNOSTIC
#define CGAL_HAS_NO_THREADS
#define CGAL_DISABLE_ROUNDING_MATH_CHECK
#define CGAL_INTERSECTION_VERSION 1
#include <CGAL/basic.h>

#include <CGAL/AABB_tree.h> // must be inserted before kernel
#include <CGAL/AABB_traits.h>
#include <CGAL/AABB_triangle_primitive.h>

#include <CGAL/Simple_cartesian.h>

#include <CGAL/version.h>
#ifdef WIN32
#if (CGAL_VERSION_NR/10000000%100)>3
#pragma comment(lib, "libgmp-10.lib")
#endif
#endif

typedef CGAL::Simple_cartesian<double> K;
//typedef K::Point_3 Point;
class Point : public K::Point_3
{
  typedef K::Point_3 super_t;
public:
  Point() : super_t() {}
  Point(const Vector4D &av) : super_t(av.x(), av.y(), av.z()) {}
  int id;
};
typedef K::Plane_3 Plane;
typedef K::Vector_3 Vector;
typedef K::Segment_3 Segment;

//typedef K::Triangle_3 Triangle;
class Triangle : public K::Triangle_3
{
  typedef K::Triangle_3 super_t;
public:
  Triangle() : super_t() {}
  
  Triangle(const Vector4D &v1,
           const Vector4D &v2,
           const Vector4D &v3,
           int aiv1, int aiv2, int aiv3)
       : super_t(Point(v1),Point(v2),Point(v3)),
         iv1(aiv1), iv2(aiv2), iv3(aiv3) {}

  int iv1, iv2, iv3;
};

typedef std::vector<Triangle> FaceVec;
typedef FaceVec::iterator FaceVecIterator;
typedef CGAL::AABB_triangle_primitive<K, FaceVecIterator> Primitive;

typedef CGAL::AABB_traits<K, Primitive> AABB_triangle_traits;
typedef CGAL::AABB_tree<AABB_triangle_traits> Tree;
typedef boost::optional< Tree::Object_and_primitive_id > Segment_intrsec;
typedef std::list<Tree::Object_and_primitive_id>  IntrsecList;


#include "PovDisplayContext.hpp"
#include "RendIntData.hpp"
#include <qlib/PrintStream.hpp>
#include <qlib/Utils.hpp>
#include <gfx/SolidColor.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/style/StyleMgr.hpp>

#include <qlib/BSPTree.hpp>

using namespace render;

using qlib::PrintStream;
using qlib::Matrix4D;
using qlib::Matrix3D;

//////////////////////////////////////////////////////////////
// Silhouette extraction

namespace {

  class Face
  {
  public:
    // int ind;
    int iv1, iv2, iv3;
    int nmode;
    Vector4D n;

  };

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
    double w = 0.05;
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

  bool contains_id(int iv1, int iv2,
                   int if1, int if2, int if3)
  {
    if (iv1==if1 ||
        iv1==if2 ||
        iv1==if3)
      return true;

    if (iv2==if1 ||
        iv2==if2 ||
        iv2==if3)
      return true;

    return false;
  }

  bool checkVertVis(Tree &tree,
		    const Vector4D &vcam,
		    const Vector4D &vert,
		    int iv)
  {
    // check vert visibility from vcam
    K::Point_3 pcam(vcam.x(), vcam.y(), vcam.z());
    K::Point_3 pvert(vert.x(), vert.y(), vert.z());

    Segment segq(pcam, pvert);

    IntrsecList ilst;
    tree.all_intersections(segq, std::back_inserter(ilst));

    BOOST_FOREACH (const IntrsecList::value_type &isec, ilst) {
      FaceVecIterator fiter = isec.second;
      if (iv == fiter->iv1 ||
	  iv == fiter->iv2 ||
	  iv == fiter->iv3)
        continue;
      return false;
    }
    
    return true;
  }

  bool checkVertVis2(Tree &tree,
		    const Vector4D &vcam,
		    const Vector4D &vert,
		    int iv)
  {
    // check vert visibility from vcam
    K::Point_3 pcam(vcam.x(), vcam.y(), vcam.z());
    K::Point_3 pvert(vert.x(), vert.y(), vert.z());

    K::Ray_3 rayq(pcam, pvert);

    IntrsecList ilst;
    tree.all_intersections(rayq, std::back_inserter(ilst));

    BOOST_FOREACH (const IntrsecList::value_type &isec, ilst) {
      FaceVecIterator fiter = isec.second;
      if (iv == fiter->iv1 ||
	  iv == fiter->iv2 ||
	  iv == fiter->iv3)
        continue;
      return false;
    }
    
    return true;
  }
  
  bool checkVertVis3(Tree &tree,
                     const Vector4D &vcam,
                     const Vector4D &vert,
                     int iv1, int iv2)
  {
    // check vert visibility from vcam
    K::Point_3 pcam(vcam.x(), vcam.y(), vcam.z());
    K::Point_3 pvert(vert.x(), vert.y(), vert.z());

    K::Ray_3 rayq(pcam, pvert);

    IntrsecList ilst;
    tree.all_intersections(rayq, std::back_inserter(ilst));

    BOOST_FOREACH (const IntrsecList::value_type &isec, ilst) {
      FaceVecIterator fiter = isec.second;
      if (contains_id(iv1, iv2,
                      fiter->iv1, fiter->iv2, fiter->iv3))
        continue;
      return false;
    }
    
    return true;
  }
  
  bool checkVertVis4(Tree &tree,
                     double dcam,
                     std::vector<MeshVert*> &vertvec,
                     int iv1, int iv2,
                     PrintStream &ips)
  {
    const Vector4D &v1 = vertvec[iv1]->v;
    const Vector4D &v2 = vertvec[iv2]->v;

    // check vert visibility from vcam
    K::Point_3 pcam(0.0, 0.0, dcam);
    const double zmax = -10000.0;
    const double tc = (zmax-dcam);
    
    const double tm1 = (v1.z()-dcam);
    //K::Point_3 pv1(v1.x()*tc/tm1, v1.y()*tc/tm1, zmax);
    K::Point_3 pv1(v1.x(), v1.y(), v1.z());

    const double tm2 = (v2.z()-dcam);
    //K::Point_3 pv2(v2.x()*tc/tm2, v2.y()*tc/tm2, zmax);
    K::Point_3 pv2(v2.x(), v2.y(), v2.z());

    //K::Triangle_3 triq(pcam, pv1, pv2);
    K::Ray_3 rayq(pcam, pv1);
    
    IntrsecList ilst;
    tree.all_intersections(rayq, std::back_inserter(ilst));
    
    BOOST_FOREACH (const IntrsecList::value_type &isec, ilst) {
      FaceVecIterator fiter = isec.second;
      const int fv1 = fiter->iv1;
      const int fv2 = fiter->iv2;
      const int fv3 = fiter->iv3;
      if (contains_id(iv1, iv2,
                      fv1, fv2, fv3))
        continue;
      writeTriMark(ips, vertvec[fv1]->v, vertvec[fv2]->v, vertvec[fv3]->v, 2);
      //return false;
    }
    
    return true;
  }

} // namespace anon

//////////////////////////////////////////////////

void PovDisplayContext::writeEdgeLine(PrintStream &ips, const Edge &elem, int flag/*=0*/)
{
  std::pair<VertSet::iterator,bool> ret;  

  ret = m_silVertSet.insert(VertSet::value_type(elem.iv1,1));
  if (!ret.second)
    ++ (ret.first->second);

  ret = m_silVertSet.insert(VertSet::value_type(elem.iv2,1));
  if (!ret.second)
    ++ (ret.first->second);

  MeshVert *pv1 = m_vertvec[elem.iv1];
  MeshVert *pv2 = m_vertvec[elem.iv2];
  writeEdgeLine(ips, pv1->v, pv2->v, pv1->n, pv2->n, flag);
}

void PovDisplayContext::writeEdgeLine(PrintStream &ips,
                                      const Vector4D &v1, const Vector4D &v2,
                                      const Vector4D &n1, const Vector4D &n2,
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

  LString secname = getSecName();

  double w = getEdgeLineWidth();
  double rise = w/2.0;
  
  double r=.0,g=.0,b=.0;
  if (!m_egLineCol.isnull()) {
    r = m_egLineCol->fr();
    g = m_egLineCol->fg();
    b = m_egLineCol->fb();
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

  // always keep x1.z < x2.z
  if (v1.z()>v2.z()) {
    x1 = v2;
    x2 = v1;
  }
  else {
    x1 = v1;
    x2 = v2;
  }

  Vector4D nn = x2 - x1;
  double len = nn.length();

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
  
  ips.format("cylinder{<%f, %f, %f> + %s_sl_rise*%f*<%f,%f,%f>, ",
             x1.x(), x1.y(), x1.z(),
             secname.c_str(), rise,
             n1.x(), n1.y(), n1.z());
  
  ips.format("<%f, %f, %f> + %s_sl_rise*%f*<%f,%f,%f>, ",
             x2.x(), x2.y(), x2.z(),
             secname.c_str(), rise,
             n1.x(), n1.y(), n1.z());
  
  ips.format("%f*%s_sl_scl ", w, secname.c_str());
  ips.format("texture { %s_sl_tex pigment { color rgb <%f,%f,%f> }}\n",
             secname.c_str(), r, g, b);
  ips.format("}\n");
}

void PovDisplayContext::writePoint(PrintStream &ips,
                                   const Vector4D &v1, const Vector4D &n1,
                                   int flag /*=0*/)
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

  LString secname = getSecName();

  double w = getEdgeLineWidth();
  double rise = w/2.0;
  
  double r=.0,g=.0,b=.0;
  if (!m_egLineCol.isnull()) {
    r = m_egLineCol->fr();
    g = m_egLineCol->fg();
    b = m_egLineCol->fb();
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

  const double clipz = m_pIntData->m_dClipZ;
  if (clipz>=0) {
    if (clipz < v1.z())
      return; // clipped out by z-plane
  }

  ips.format("sphere{<%f, %f, %f> + %s_sl_rise*%f*<%f,%f,%f>, ",
             v1.x(), v1.y(), v1.z(),
             secname.c_str(), rise,
             n1.x(), n1.y(), n1.z());
  ips.format("%f*%s_sl_scl ", w, secname.c_str());
  ips.format("texture { %s_sl_tex pigment { color rgb <%f,%f,%f> }}\n",
             secname.c_str(), r, g, b);
  ips.format("}\n");
}

void PovDisplayContext::writeAllEdges(PrintStream &ips)
{
  // write edge lines
  BOOST_FOREACH (const Edge &elem, m_silEdges) {
    writeEdgeLine(ips, elem);
  }

  MB_DPRINTLN("Silhouette edges done.");
}

void PovDisplayContext::writeCornerPoints(PrintStream &ips)
{
  if (m_nEdgeCornerType==ECT_NONE)
    return;

  MeshVert *pv1;

  //int e1 = 0;
  //int e2 = 0;
  //int e3 = 0;
  //int e4 = 0;
  //int e5 = 0;

  // write corner points
  BOOST_FOREACH (const VertSet::value_type &elem, m_silVertSet) {
    if (m_nEdgeCornerType==ECT_JOINT)
      if (elem.second<2)
        continue;
    /*
    if (elem.second==1)
      ++e1;
    else if (elem.second==2)
      ++e2;
    else if (elem.second==3)
      ++e3;
    else if (elem.second==4)
      ++e4;
    else
      ++e5;
     */

    pv1 = m_vertvec[elem.first];
    writePoint(ips, pv1->v, pv1->n, 0);
  }

  MB_DPRINTLN("Write corner points OK");
  /*MB_DPRINTLN("E1 = %d", e1);
  MB_DPRINTLN("E2 = %d", e2);
  MB_DPRINTLN("E3 = %d", e3);
  MB_DPRINTLN("E4 = %d", e4);
  MB_DPRINTLN("E>4 = %d", e5);*/

  return;
}


void PovDisplayContext::buildVertVisList(std::vector<char> &vvl, void *pTree)
{
  Vector4D vcam(0,0,m_dViewDist);

  MeshVert *pv1;
  MeshVert *pv2;
//  MeshVert *pv3;

  Tree &tree = *static_cast<Tree *>(pTree);

  BOOST_FOREACH (const Edge &elem, m_silEdges) {
    const int iv1 = elem.iv1;
    const int iv2 = elem.iv2;
    pv1 = m_vertvec[iv1];
    pv2 = m_vertvec[iv2];
    
    IntrsecList ilst;
    
    // check V1 visibility
    if (vvl[iv1]<0) {
      if (checkVertVis(tree, vcam, pv1->v, iv1))
        vvl[iv1] = 1;
      else
        vvl[iv1] = 0;
    }
    
    // check V2 visibility
    if (vvl[iv2]<0) {
      if (checkVertVis(tree, vcam, pv2->v, iv2))
        vvl[iv2] = 1;
      else
        vvl[iv2] = 0;
    }
    
  }
  
  MB_DPRINTLN("Vertex visibility list generated.");
}

void PovDisplayContext::checkAndWriteEdges(PrintStream &ips, std::vector<char> &vvl,
                                           void *pTree, void *pFaceVec)
{
  MeshVert *pv1;
  MeshVert *pv2;
//  MeshVert *pv3;

  Tree &tree = *static_cast<Tree *>(pTree);
  std::vector<Face> &fvec = *static_cast<std::vector<Face> *>(pFaceVec);

  Segment segq;

  BOOST_FOREACH (const Edge &elem, m_silEdges) {
    pv1 = m_vertvec[elem.iv1];
    pv2 = m_vertvec[elem.iv2];

    int nmode = MFMOD_MESH;
    if (elem.if1>0)
      nmode = fvec[elem.if1].nmode;
    else if (elem.if2>0)
      nmode = fvec[elem.if2].nmode;

    if (nmode==MFMOD_MESH ||
        nmode==MFMOD_OPNCYL ||
        nmode==MFMOD_CLSCYL) {
      //writeEdgeLine(ips, pv1->v, pv2->v, pv1->n, pv2->n, 0);
      writeEdgeLine(ips, elem);
      continue;
    }

    // only handle sphere's edges

    MB_ASSERT (vvl[elem.iv1]>=0 && vvl[elem.iv2]>=0);
    if (!vvl[elem.iv1] && !vvl[elem.iv2]) {
      // hidden edge line
      continue;
    }

    segq = Segment(Point(pv1->v),
                   Point(pv2->v));

    IntrsecList ilst;
    tree.all_intersections(segq, std::back_inserter(ilst));

    // if (ilst.empty())
    // continue;

    MB_DPRINTLN("Edge: %d,%d", elem.iv1, elem.iv2);
    int nisec = 0;

    K::Point_3 psec;
    BOOST_FOREACH (const IntrsecList::value_type &isec, ilst) {
      FaceVecIterator fiter = isec.second;

      if (contains_id(elem.iv1, elem.iv2,
                      fiter->iv1,fiter->iv2,fiter->iv3))
        continue;

      //MB_DPRINTLN("");
      MB_DPRINTLN("  Isec face: %d,%d,%d",fiter->iv1,fiter->iv2,fiter->iv3);

      //psec = isec.first;
      CGAL::Object obj = isec.first;
      if (!CGAL::assign(psec, obj))
        MB_DPRINTLN("ERROR assign to pointer failed!!");
      ++nisec;
      // break;
    }
    MB_DPRINTLN(" nisec = %d", nisec);

    if (nisec==0) {
      // if (vvl[elem.iv1] && vvl[elem.iv2])
      //writeEdgeLine(ips, pv1->v, pv2->v, pv1->n, pv2->n, 0);
      writeEdgeLine(ips, elem, 0);
    }
    else if (nisec==1) {
      // show the truncated edge line
      Vector4D vsec(psec.x(), psec.y(), psec.z());
      if (vvl[elem.iv1] && !vvl[elem.iv2]) {
        writeEdgeLine(ips, pv1->v, vsec, pv1->n, pv2->n, 1);
        //writeEdgeLine(ips, pv1->v, pv2->v, pv1->n, pv2->n, 1);
      }
      else if (!vvl[elem.iv1] && vvl[elem.iv2]) {
        writeEdgeLine(ips, vsec, pv2->v, pv1->n, pv2->n, 2);
        //writeEdgeLine(ips, pv1->v, pv2->v, pv1->n, pv2->n, 2);
      }
      else {
        //writeEdgeLine(ips, pv1->v, pv2->v, pv1->n, pv2->n, 3);
        writeEdgeLine(ips, elem, 3);
      }
    }
    else {
      //writeEdgeLine(ips, pv1->v, pv2->v, pv1->n, pv2->n, 4);
      writeEdgeLine(ips, elem, 4);
    }
  }
}


void PovDisplayContext::writeSilOnly(PrintStream &ips, void *pfvec)
{
  const std::vector<Face> &fvec = * static_cast<std::vector<Face> *>(pfvec);
  int i;

  const int nfaces = fvec.size();
  const int nverts = m_vertvec.size();
  FaceVec faces;
  
  MeshVert *pv1;
  MeshVert *pv2;
  MeshVert *pv3;
  
  for (i=0; i<nfaces; ++i) {
    const Face &ff = fvec[i];
    if (ff.iv1<0 || ff.iv2<0 || ff.iv3<0)
      continue;
    pv1 = m_vertvec[ff.iv1];
    pv2 = m_vertvec[ff.iv2];
    pv3 = m_vertvec[ff.iv3];
    
    faces.push_back(Triangle(pv1->v,pv2->v,pv3->v,
                             ff.iv1, ff.iv2, ff.iv3));
  }

  m_silVertSet.clear();

  if (faces.empty()) {
    writeAllEdges(ips);
    writeCornerPoints(ips);
    return;
  }

  MB_DPRINTLN("AABB Tree constructing...");
  Tree tree(faces.begin(), faces.end());
  MB_DPRINTLN("Done.");
  
  // construct vertex visibility list;
  Vector4D vcam(0,0,m_dViewDist);
  // K::Ray_3 ray_query(K::Point_3(0.0, 0.0, m_dViewDist), K::Point_3(0.0, 1.0, 0.0));

  std::vector<char> vvl(nverts, -1);
  //buildVertVisList(vvl, &tree);
  
  BOOST_FOREACH (const Edge &elem, m_silEdges) {
    const int iv1 = elem.iv1;
    const int iv2 = elem.iv2;
    pv1 = m_vertvec[iv1];
    pv2 = m_vertvec[iv2];
    
    IntrsecList ilst;
/*    
    if (checkVertVis4(tree, m_dViewDist, m_vertvec, iv1, iv2, ips)) {
      MB_DPRINTLN("siledge %d - %d visible (chkvv4)", iv1, iv2);
      writeLineMark(ips, pv1->v, pv2->v, 0);
    }
    else {
      MB_DPRINTLN("siledge %d - %d occluded (chkvv4)", iv1, iv2);
      writeLineMark(ips, pv1->v, pv2->v, 1);
    }
*/

    // check V1 visibility
    if (vvl[iv1]<0) {
      if (checkVertVis2(tree, vcam, pv1->v, iv1))
        vvl[iv1] = 1;
      else
        vvl[iv1] = 0;
    }
    
    // check V2 visibility
    if (vvl[iv2]<0) {
      if (checkVertVis2(tree, vcam, pv2->v, iv2))
        vvl[iv2] = 1;
      else
        vvl[iv2] = 0;
    }

  }

  BOOST_FOREACH (const Edge &elem, m_silEdges) {
    pv1 = m_vertvec[elem.iv1];
    pv2 = m_vertvec[elem.iv2];
    MB_ASSERT (vvl[elem.iv1]>=0 && vvl[elem.iv2]>=0);

    Vector4D pv12 = pv2->v - pv1->v;
    const double length = pv12.length();
    if (qlib::isNear4(length, 0.0))
      continue;
    Vector4D e12 = pv12.divide(length);
    const double sinth = ::sqrt( 1.0 - e12.z()*e12.z() );
    const double w = getEdgeLineWidth();

    int ndiv = int( ::floor( (length*sinth)/w ) );
    if (ndiv>0)
      MB_DPRINTLN("Edge %d,%d ndiv=%d", elem.iv1, elem.iv2, ndiv);

    std::vector<bool> bvvis(ndiv+2);
    std::vector<Vector4D> vins(ndiv+2);
    std::vector<Vector4D> nvins(ndiv+2);

    // pv1
    bvvis[0] = vvl[elem.iv1];
    vins[0] = pv1->v;
    nvins[0] = pv1->n;

    // pv2
    bvvis[ndiv+1] = vvl[elem.iv2];
    vins[ndiv+1] = pv2->v;
    nvins[ndiv+1] = pv2->n;

    // check internal points
    for (i=1; i<ndiv+1; ++i) {
      const double rho = double(i)/double(ndiv+1);
      Vector4D vintr = pv1->v.scale(rho) + pv2->v.scale(1.0-rho);
      bvvis[i] = checkVertVis3(tree, vcam, vintr, elem.iv1, elem.iv2);

      vins[i] = vintr;

      Vector4D nvintr = pv1->n.scale(rho) + pv2->n.scale(1.0-rho);
      nvins[i] = nvintr.normalize();
    }

    // write the visible devided edges
    for (i=0; i<ndiv+1; ++i) {
      if (bvvis[i] || bvvis[i+1]) {
        writeEdgeLine(ips, vins[i], vins[i+1], nvins[i], nvins[i+1], 0);
      }
    }
  }
  
  writeCornerPoints(ips);
}

//////////////////////////////
// main routine

void PovDisplayContext::writeSilEdges()
{
  int i, j;
  Vector4D v;

  const char *nm = getSecName().c_str();
  const double clipz = m_pIntData->m_dClipZ;

  {
    const int nverts = m_pIntData->m_mesh.getVertexSize();
    const int nfaces = m_pIntData->m_mesh.getFaceSize();
    
    if (nverts<=0 || nfaces<=0)
      return;
  }
  
  PrintStream ps(*m_pPovOut);
  PrintStream ips(*m_pIncOut);

  //////////

  LOG_DPRINTLN("Start edge generation, rise=%f", m_dEdgeRise);

  ps.format("#declare %s_sl_scl = 1.00;\n", getSecName().c_str());
  ps.format("#declare %s_sl_rise = %f;\n", getSecName().c_str(), m_dEdgeRise);
  ps.format("#declare %s_sl_tex = \n", getSecName().c_str());
  ps.format("  texture{finish{ambient 1.0 diffuse 0 specular 0}};\n");
  
  //////////

  // simplify degenerated verteces
  Mesh *pMesh = m_pIntData->simplifyMesh(&m_pIntData->m_mesh, 0);
  const int nverts = pMesh->getVertexSize();
  const int nfaces = pMesh->getFaceSize();

  // convert vertex list to array
  m_vertvec.resize(nverts);
  
  std::copy(pMesh->m_verts.begin(), pMesh->m_verts.end(), m_vertvec.begin());

  // convert face list to array (and calc face norms)
  // make edge set
  EdgeSet eset;
  std::vector<Face> fvec(nfaces);

  {
    Mesh::FCIter iter2 = pMesh->m_faces.begin();
    Mesh::FCIter iend2 = pMesh->m_faces.end();
    Face ff;
    for (int fid=0; iter2!=iend2; iter2++, fid++) {
      int ia1 = iter2->iv1;
      int ia2 = iter2->iv2;
      int ia3 = iter2->iv3;

      ff.nmode = iter2->nmode;
      ff.iv1 = ia1;
      ff.iv2 = ia2;
      ff.iv3 = ia3;
      ff.n = calcNorm(m_vertvec[ia1]->v,m_vertvec[ia2]->v,m_vertvec[ia3]->v);

      fvec[fid] = ff;
      // MB_DPRINTLN(" (%d,%d,%d)", ia1, ia2, ia3);

      eset.insertEdge(ia1, ia2, fid);
      eset.insertEdge(ia2, ia3, fid);
      eset.insertEdge(ia3, ia1, fid);
    }
  }

  MB_DPRINTLN("Build triedges done");

  // current view point
  Vector4D vcam(0,0,m_dViewDist);

  // Limit angle of normals for creating crease lines
  const double dnangl = m_dCreaseLimit;

  Vector4D v1, v2, n1, n2;

  // Select crease & silhouette lines (m_silEdges) from mesh edges (eset)
  BOOST_FOREACH (const Edge &elem, eset) {
    // MB_DPRINTLN("edge <%d, %d> f=(%d,%d)", elem.iv1, elem.iv2, elem.if1, elem.if2);

    v1 = m_vertvec[elem.iv1]->v;
    v2 = m_vertvec[elem.iv2]->v;

    if (elem.if1<0 || elem.if2<0) {
      // edge is ridge
      MB_DPRINTLN("Ridge <%d, %d> f=(%d,%d)", elem.iv1, elem.iv2, elem.if1, elem.if2);
      int nmode = MFMOD_MESH;
      if (elem.if1>=0)
        nmode = fvec[elem.if1].nmode;
      else if (elem.if2>=0)
        nmode = fvec[elem.if2].nmode;

      // nmode==1 --> ridge triangle without silhouette line
      if (nmode!=MFMOD_OPNCYL) {
        m_silEdges.insert(elem);
      }
    }
    else if (checkSilEdge(v1-vcam, fvec[elem.if1].n, fvec[elem.if2].n, dnangl) ||
             checkSilEdge(v2-vcam, fvec[elem.if1].n, fvec[elem.if2].n, dnangl)) {
      // edge is silhouette line
      m_silEdges.insert(elem);
    }

  }

  MB_DPRINTLN("Silhouette extraction done.");

  ///////////////////////////////////////
  // Write results to the inc file

  if (m_nEdgeLineType==ELT_SILHOUETTE ||
      m_nEdgeLineType==ELT_OPQ_SILHOUETTE) {
    // write silhouette only
    writeSilOnly(ips, &fvec);
  }
  else {

    MeshVert *pv1;
    MeshVert *pv2;
    MeshVert *pv3;

    // create mesh face array of cylinders and spheres
    FaceVec faces;
    for (i=0; i<nfaces; ++i) {
      const Face &ff = fvec[i];
      if (ff.iv1<0 || ff.iv2<0 || ff.iv3<0)
        continue;
      // only handle cyl and sph meshes
      if (ff.nmode==MFMOD_MESH)
	continue;
      pv1 = m_vertvec[ff.iv1];
      pv2 = m_vertvec[ff.iv2];
      pv3 = m_vertvec[ff.iv3];

      faces.push_back(Triangle(pv1->v,pv2->v,pv3->v,
                               ff.iv1, ff.iv2, ff.iv3));
    }

    m_silVertSet.clear();

    if (faces.empty()) {
      // no cyls and sphs --> write all edges
      writeAllEdges(ips);
    }
    else {
      // find occluded verteces by cyls or sphs
      // --> write only the visible edges
      MB_DPRINTLN("AABB Tree constructing...");
      Tree tree(faces.begin(), faces.end());
      MB_DPRINTLN("Done.");
      
      // construct vertex visibility list;
      std::vector<char> vvl(nverts, -1);
      buildVertVisList(vvl, &tree);
      
      checkAndWriteEdges(ips, vvl, &tree, &fvec);
    }
    writeCornerPoints(ips);
  }

  m_silEdges.clear();
  m_vertvec.clear();
  m_silVertSet.clear();
  delete pMesh;

  MB_DPRINTLN("Silhouette edges done.");
}
