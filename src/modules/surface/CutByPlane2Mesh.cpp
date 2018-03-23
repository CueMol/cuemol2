// -*-Mode: C++;-*-
//
// Cut molecular surface by a plane ver. 2 (using CGAL)
//

#include <common.h>
#include "CutByPlane2.hpp"

//#define CGAL_NO_AUTOLINK
#define CGAL_LIB_DIAGNOSTIC
#define CGAL_HAS_NO_THREADS
#define CGAL_DISABLE_ROUNDING_MATH_CHECK
#include <CGAL/basic.h>
#include <CGAL/exceptions.h>

#include <CGAL/Exact_predicates_inexact_constructions_kernel.h>
#include <CGAL/Constrained_Delaunay_triangulation_2.h>
#include <CGAL/Delaunay_mesher_2.h>
#include <CGAL/Delaunay_mesh_face_base_2.h>
#include <CGAL/Delaunay_mesh_size_criteria_2.h>

#include <CGAL/Triangulation_vertex_base_with_info_2.h>

/*#include <CGAL/version.h>
#ifdef WIN32
#if (CGAL_VERSION_NR/10000000%100)>3
#pragma comment(lib, "libgmp-10.lib")
#endif
#endif*/

struct VertInfo
{
  VertInfo() : id(0), bperi(false) {}
  int id;
  bool bperi;
};

typedef CGAL::Exact_predicates_inexact_constructions_kernel K;
//typedef CGAL::Triangulation_vertex_base_2<K> Vb;
typedef CGAL::Delaunay_mesh_face_base_2<K> Fb;
typedef CGAL::Triangulation_vertex_base_with_info_2<VertInfo, K> Vb;
//typedef CGAL::Delaunay_mesh_face_base_with_info_2<int, K> Fb;

typedef CGAL::Triangulation_data_structure_2<Vb, Fb> Tds;
typedef CGAL::Constrained_Delaunay_triangulation_2<K, Tds> CDT;
typedef CGAL::Delaunay_mesh_size_criteria_2<CDT> Criteria;
typedef CGAL::Delaunay_mesher_2<CDT, Criteria> Mesher;

typedef CDT::Vertex_handle Vertex_handle;
typedef CDT::Point Point;


using namespace surface;
using namespace surface::cbp_detail;

inline Vector2D point2Vec2D(const Point &pt)
{
  return Vector2D( pt.x(), pt.y() );
}

void setupCDTRecur(CDT &cdt, const Boundary &outer, CutByPlane2 *pthat, bool bOuter)
{
  int i, j, noutsz = outer.getSize();
  Vector4D v, prev;
  Vector2D v2d;

  std::vector<Vertex_handle> vvh(noutsz);

  for (i=0; i<noutsz; ++i) {
    int sid = outer.getID(i);
    v = pthat->getVert(sid);
    int vid = pthat->addSectVert(v);

    v2d = outer.getVert(i);
    vvh[i] = cdt.insert( Point(v2d.x(), v2d.y()) );
    vvh[i]->info().id = vid;
    vvh[i]->info().bperi = true;
  }

  int nn = bOuter?0:1;
  for (i=0; i<noutsz-nn; ++i) {
    int ni = (i+1)%noutsz;
    //try {
    cdt.insert_constraint(vvh[i], vvh[ni]);
  /*}
    catch (const CGAL::Precondition_exception &e) {
      LString msg = LString::format("insert_constraint failed: %s", e.what());
      LOG_DPRINTLN(msg);
      return
    }*/
  }

  if (outer.getInsetSize()>0) {
    MB_DPRINTLN("Boundary %p has inset hole.", &outer);
    BoundarySet::const_iterator iter = outer.ins_begin();
    BoundarySet::const_iterator iend = outer.ins_end();
    for (; iter!=iend; ++iter) {
      setupCDTRecur(cdt, **iter, pthat, false);
    }
  }

}

void CutByPlane2::makeSectionMesh(Boundary &outer)
{
  int i, j, noutsz = outer.getSize();
  Vector4D v, prev;
  Vector2D v2d;

  //CGAL::set_error_behaviour(CGAL::THROW_EXCEPTION);
  CDT cdt;

  // duplicate the outer boundary verteces
  // setup delaunay triangulation obj
  try {
    setupCDTRecur(cdt, outer, this, true);
  }
  catch (const CGAL::Assertion_exception &e) {
    MB_DPRINTLN("setupCDTRecur failed for boundary size=%d", noutsz);

    for (int i=0; i<outer.getSize(); ++i) {
      v2d = outer.getVert(i);
      MB_DPRINTLN("%d %f %f", i, v2d.x(), v2d.y());
    }

    LString msg = LString::format("CutByPlane2 insert_constraint failed: %s", e.what());
    //MB_THROW(qlib::RuntimeException, msg);
    LOG_DPRINTLN("CutByPlane2 insert_constraint failed: %s --> ignored", e.what());
    return;
  }
  catch (...) {
    MB_THROW(qlib::RuntimeException, "Setup CDT failed by unknown exception");
    //LOG_DPRINTLN("Setup CDT failed by unknown exception --> ignored");
    return;
  }
    

  MB_DPRINTLN("Nr of verts: %d", cdt.number_of_vertices());
  MB_DPRINTLN("Mesh longest: %f", m_cdiv);

  try {
    Mesher mesher(cdt);
    mesher.set_criteria(Criteria(0.0, m_cdiv));
    mesher.refine_mesh();
  }
  catch (const CGAL::Assertion_exception &e) {
    LString msg = LString::format("mesh generation failed: %s", e.what());
    //LOG_DPRINTLN(msg);
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
  catch (...) {
    //LOG_DPRINTLN("Mesh CDT failed");
    MB_THROW(qlib::RuntimeException, "Mesh CDT failed");
    return;
  }

  MB_DPRINTLN("Mesh refined, Nr of verts: %d", cdt.number_of_vertices());

  // generate new mesh vertices
  {
    CDT::Finite_vertices_iterator iter = cdt.finite_vertices_begin();
    CDT::Finite_vertices_iterator iend = cdt.finite_vertices_end();

    for (; iter!=iend; ++iter) {
      int vid = iter->info().id;
      if (vid==0) {
        Vector4D pos(iter->point().x(),
                     iter->point().y(),
                     0,0);
        pos = fromPlane(pos);
        vid = addNewVertex(pos, -m_norm);
        iter->info().id = vid;
        iter->info().bperi = false;
      }
    }
  }

  // generate mesh faces
  {
    CDT::Finite_faces_iterator iter = cdt.finite_faces_begin();
    CDT::Finite_faces_iterator iend = cdt.finite_faces_end();

    Vector2D pos0, pos1, pos2, cen;

    for (; iter!=iend; ++iter) {
      VertInfo &vi0 = iter->vertex(0)->info();
      VertInfo &vi1 = iter->vertex(1)->info();
      VertInfo &vi2 = iter->vertex(2)->info();

      pos0 = point2Vec2D( iter->vertex(0)->point() );
      pos1 = point2Vec2D( iter->vertex(1)->point() );
      pos2 = point2Vec2D( iter->vertex(2)->point() );
      
      cen = (pos0+pos1+pos2).divide(3.0);
      if (!outer.isEnclosing(cen, true))
        continue;
      /*
      if (vi0.bperi&&vi1.bperi) {
        EdgeSet::const_iterator edi = eset.find(Edge(vi1.id, vi0.id));
        if (edi!=eset.end())
          continue;
      }

      if (vi1.bperi&&vi2.bperi) {
        EdgeSet::const_iterator edi = eset.find(Edge(vi2.id, vi1.id));
        if (edi!=eset.end())
          continue;
      }

      if (vi2.bperi&&vi0.bperi) {
        EdgeSet::const_iterator edi = eset.find(Edge(vi0.id, vi2.id));
        if (edi!=eset.end())
          continue;
      }
       */
      addNewFace(vi2.id, vi1.id, vi0.id);
    }    

  }
  
}

