// -*-Mode: C++;-*-
//
// Generate/Render the map contour surface of ScalarObject
//

#include <common.h>

// #define SHOW_NORMAL

#include "MapIpolSurf2Renderer.hpp"
#include "MapSurfRenderer_consts.hpp"
#include "DensityMap.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/Mesh.hpp>

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include "MeshRefinePartMin.hpp"
#include "cgal_remesh_impl.h"

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;
using molstr::AtomIterator;


/// default constructor
MapIpolSurf2Renderer::MapIpolSurf2Renderer()
     : super_t()
{
  m_bPBC = false;
  //m_bAutoUpdate = true;
  //m_bDragUpdate = false;
  m_nDrawMode = MSRDRAW_FILL;
  m_lw = 1.2;
  m_pCMap = NULL;

  m_nOmpThr = -1;

  m_bWorkOK = false;

}

// destructor
MapIpolSurf2Renderer::~MapIpolSurf2Renderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

}

/////////////////////////////////

const char *MapIpolSurf2Renderer::getTypeName() const
{
  return "isosurf_ipol";
}

void MapIpolSurf2Renderer::setSceneID(qlib::uid_t nid)
{
  super_t::setSceneID(nid);
  if (nid!=qlib::invalid_uid) {
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->addViewListener(nid, this);
  }
}

qlib::uid_t MapIpolSurf2Renderer::detachObj()
{
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  return super_t::detachObj();
}  


///////////////////////////////////////////////////////////////

void MapIpolSurf2Renderer::preRender(DisplayContext *pdc)
{

  pdc->color(getColor());

  if (m_nDrawMode==MSRDRAW_POINT) {
    pdc->setLighting(false);
    pdc->setPolygonMode(gfx::DisplayContext::POLY_POINT);
    pdc->setPointSize(m_lw);
  }
  else if (m_nDrawMode==MSRDRAW_LINE) {
    pdc->setLighting(false);
    pdc->setPolygonMode(gfx::DisplayContext::POLY_LINE);
    pdc->setLineWidth(m_lw);
  }
  else {
    pdc->setLighting(true);
    //pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
    // Ridge line generates dot noise on the surface (but this may be bug of marching cubes implementation...)
    pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
  }
  
  if (getEdgeLineType()==gfx::DisplayContext::ELT_NONE) {
    pdc->setCullFace(m_bCullFace);
  }
  else {
    // edge/silhouette line is ON
    //   --> always don't draw backface (cull backface=true) for edge rendering
    pdc->setCullFace(true);
  }

}

void MapIpolSurf2Renderer::postRender(DisplayContext *pdc)
{
  // reset to default drawing options
  pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
  pdc->setPointSize(1.0);
  pdc->setLineWidth(1.0);
  pdc->setCullFace(true);
  pdc->setLighting(false);
}

/// Generate display list
void MapIpolSurf2Renderer::render(DisplayContext *pdl)
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);
  m_pCMap = pMap;

  // check and setup mol boundary data
  setupMolBndry();

  // generate map-range information
  calcMapDispExtent(pMap);

  MB_DPRINTLN("MapIpolSurf2Renderer Rendereing...");

  pdl->pushMatrix();

  renderImpl2(pdl);

/*
  // Setup grid-space (display origin) coord xform 
  setupXform(pdl, pMap, pXtal);

  pdl->startTriangles();
  renderImpl(pdl);
  pdl->end();

#ifdef SHOW_NORMAL
  pdl->startLines();
  BOOST_FOREACH (const Vector4D &elem, m_tmpv) {
    pdl->vertex(elem);
  }
  pdl->end();
  m_tmpv.clear();
#endif
*/
  
  MB_DPRINTLN("MapIpolSurf2Renderer Rendereing OK\n");

  pdl->popMatrix();
  m_pCMap = NULL;
}

Vector3F MapIpolSurf2Renderer::calcNorm(const Vector3F &v) const
{
  Vector3F rval = m_ipol.calcDiffAt(v);
/*
  Vector3F rval2 = m_ipol.calcDscDiffAt(v);
  rval2 -= rval;
  if (rval2.sqlen()>0.001) {
    MB_DPRINTLN("xXx");
  }
*/
  //rval.normalizeSelf();
  return -rval;
}

void MapIpolSurf2Renderer::renderImpl2(DisplayContext *pdl)
{
  ScalarObject *pMap = m_pCMap;
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  // Setup grid-space (map origin) coord xform 
  setupXform(pdl, pMap, pXtal, false);

  const double siglevel = getSigLevel();
  m_dLevel = pMap->getRmsdDensity() * siglevel;

  int ncol = m_dspSize.x(); //m_nActCol;
  int nrow = m_dspSize.y(); //m_nActRow;
  int nsec = m_dspSize.z(); //m_nActSec;

  const int ixmax = m_mapSize.x();
  const int iymax = m_mapSize.y();
  const int izmax = m_mapSize.z();

  m_nbcol = m_mapStPos.x();
  m_nbrow = m_mapStPos.y();
  m_nbsec = m_mapStPos.z();

  if (m_ipol.m_pBsplCoeff==NULL)
    m_ipol.calcCoeffs(pXtal);

  MapCrossValSolver xsol;
  xsol.m_pipol = &m_ipol;
  xsol.m_isolev = m_dLevel;
  xsol.m_eps = FLT_EPSILON*100.0f;

  /////////////////////
  // Do marching cubes

  // std::deque<surface::MSVert> verts;

  // CGAL Surface_mesh
  Mesh cgm;

  struct CrossID {
    vid_t id[3];
  };

  qlib::Array3D<CrossID> xvertids((ncol+1), (nrow+1), (nsec+1));
  qlib::Array3D<int> flags(ncol, nrow, nsec);
  vid_t vid;

  int i,j,k;

  for (i=0; i<xvertids.size(); i++){
    xvertids[i].id[0] = vid_t(-1);
    xvertids[i].id[1] = vid_t(-1);
    xvertids[i].id[2] = vid_t(-1);
  }

  for (i=0; i<flags.size(); i++){
    flags[i] = 0;
  }

  float val0, val1, y0, y1;
  Vector3F vs;
  int id, iflag;

  for (i=0; i<ncol+1; i++)
    for (j=0; j<nrow+1; j++)
      for (k=0; k<nsec+1; k++) {
        iflag = 0;
        int ix = i + m_nbcol;
        int iy = j + m_nbrow;
        int iz = k + m_nbsec;
        if (!m_bPBC) {
          if (ix<0||iy<0||iz<0 ||
              ix+1>=ixmax|| iy+1>=iymax|| iz+1>=izmax)
            continue;
        }

        val0 = getDen(ix, iy, iz);
        y0 = val0 - m_dLevel;
        if (y0<=0.0f)
          iflag |= 1<<0; // 0,0,0

        val1 = getDen(ix+1, iy, iz);
        y1 = val1 - m_dLevel;

        if (y1<=0.0f)
          iflag |= 1<<1; // 1,0,0

        if (y0*y1<0) {
          if (!xsol.solve(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix+1, iy, iz), vs)) {
            MB_DPRINTLN("NR for %d,%d,%d xdir failed.", i, j, k);
          }
          //id = verts.size();
          //verts.push_back( surface::MSVert(vs, calcNorm(vs)) );
          //xvertids.at(i,j,k).id[0] = id;
          vid = cgm.add_vertex(K::Point_3(vs.x(), vs.y(), vs.z()));
          xvertids.at(i,j,k).id[0] = vid;
        }
        
        val1 = getDen(ix, iy+1, iz);
        y1 = val1 - m_dLevel;

        if (y1<=0.0f)
          iflag |= 1<<3; // 0,1,0

        if (y0*y1<0) {
          if (!xsol.solve(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix, iy+1, iz), vs)) {
            MB_DPRINTLN("NR for %d,%d,%d ydir failed.", i, j, k);
            xsol.solve(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix, iy+1, iz), vs);
          }
          //id = verts.size();
          //verts.push_back( surface::MSVert(vs, calcNorm(vs)) );
          //xvertids.at(i,j,k).id[1] = id;
          vid = cgm.add_vertex(K::Point_3(vs.x(), vs.y(), vs.z()));
          xvertids.at(i,j,k).id[1] = vid;
        }

        val1 = getDen(ix, iy, iz+1);
        y1 = val1 - m_dLevel;

        if (y1<=0.0f)
          iflag |= 1<<4; // 0,0,1

        if (y0*y1<0) {
          if (!xsol.solve(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix, iy, iz+1), vs)) {
            MB_DPRINTLN("NR for %d,%d,%d zdir failed.", i, j, k);
          }
          //id = verts.size();
          //verts.push_back( surface::MSVert(vs, calcNorm(vs)) );
          //xvertids.at(i,j,k).id[2] = id;
          vid = cgm.add_vertex(K::Point_3(vs.x(), vs.y(), vs.z()));
          xvertids.at(i,j,k).id[2] = vid;
        }

        if (i<ncol&&j<nrow&&k<nsec) {
          if (getDen(ix+1, iy+1, iz)-m_dLevel<=0.0f)
            iflag |= 1<<2; // 1,1,0
          if (getDen(ix+1, iy, iz+1)-m_dLevel<=0.0f)
            iflag |= 1<<5; // 1,0,1
          if (getDen(ix+1, iy+1, iz+1)-m_dLevel<=0.0f)
            iflag |= 1<<6; // 1,1,1
          if (getDen(ix, iy+1, iz+1)-m_dLevel<=0.0f)
            iflag |= 1<<7; // 0,1,1
          flags.at(i, j, k) = iflag;
        }

      }


  int iTriangle, iCorner, iVertex;
  bool bOK;
  vid_t iface[3];
  // std::deque<surface::MSFace> faces;
  
  for (i=0; i<ncol; i++)
    for (j=0; j<nrow; j++)
      for (k=0; k<nsec; k++) {
        iflag = flags.at(i, j, k);

        // Draw the triangles that were found.  There can be up to five per cube
        for(iTriangle = 0; iTriangle < 5; iTriangle++) {
          if(a2iTriangleConnectionTable[iflag][3*iTriangle] < 0)
            break;
    
          bOK=true;
          for(iCorner = 0; iCorner < 3; iCorner++) {
            iVertex = a2iTriangleConnectionTable[iflag][3*iTriangle+iCorner];
            
            const int dix = ebuftab[iVertex][0];
            const int diy = ebuftab[iVertex][1];
            const int diz = ebuftab[iVertex][2];
            const int ent = ebuftab[iVertex][3];
            iface[iCorner] = xvertids.at(i+dix, j+diy, k+diz).id[ent];
            if (iface[iCorner]<0) {
              bOK = false;
              break;
            }
            //if (getColorMode()!=MapRenderer::MAPREND_SIMPLE)
            //setVertexColor(pdl, asEdgeVertex[iVertex]);
            
          } // for(iCorner = 0; iCorner < 3; iCorner++)

          if (bOK) {
            //faces.push_back( surface::MSFace(iface[0], iface[1], iface[2]) );
            cgm.add_face(vid_t(iface[0]), vid_t(iface[1]), vid_t(iface[2]));
          }
        } // for(iTriangle = 0; iTriangle < 5; iTriangle++)

      }

  //////////

  //drawMeshLines(pdl, cgm, 1,0,0);

  int nv = cgm.number_of_vertices();
  int nf = cgm.number_of_faces();

  dumpTriStats("mc.txt", cgm, m_ipol);
  dumpEdgeStats("edge_mc.txt", cgm, m_ipol);

  for (i=0; i<3; ++i) {

    {
      ParticleRefine pr;
      pr.m_isolev = m_dLevel;

      pr.refineSetup(&m_ipol, cgm);

      pr.m_bUseAdp = false;
      //pr.m_bUseAdp = true;

      //pr.m_bUseMap = false;
      pr.m_bUseMap = true;

      //pr.m_bUseProj = true;
      pr.m_bUseProj = false;
      pr.setConstBond(1.0);

      pr.m_nMaxIter = 10;
      pr.m_mapscl = 50.0f;
      pr.m_bondscl = 1.0f;
      //pr.refine();
      pr.refineGsl(ParticleRefine::MIN_SD);

      pr.writeResult(cgm);
      dumpTriStats("mcmin1-1.txt", cgm, m_ipol);
      dumpEdgeStats("edge_mcmin1-1.txt", cgm, m_ipol);

      pr.dumpRefineLog("min1_trace.txt");
    }

    if (i<2) {
      PMP::iso_remesh(cgm, 1.0);
      nv = cgm.number_of_vertices();
      nf = cgm.number_of_faces();
      MB_DPRINTLN("Remeshing done, nv=%d, nf=%d", nv, nf);
    }
  }

    {
      ParticleRefine pr;
      pr.m_isolev = m_dLevel;

      pr.refineSetup(&m_ipol, cgm);

      pr.m_bUseAdp = false;
      //pr.m_bUseAdp = true;

      //pr.m_bUseMap = false;
      pr.m_bUseMap = true;

      //pr.m_bUseProj = true;
      pr.m_bUseProj = false;

      pr.m_nBondType = ParticleRefine::BOND_FULL;
      pr.setConstBond(1.0);

      pr.m_nMaxIter = 10;
      pr.m_mapscl = 50.0f;
      //pr.m_bondscl = 1.0f;
      pr.m_bondscl = 0.1f;
      pr.refineGsl(ParticleRefine::MIN_SD);
      //PMP::iso_remesh(cgm, 1.0);

      pr.m_bondscl = 0.2f;
      pr.refineGsl(ParticleRefine::MIN_SD);
      //PMP::iso_remesh(cgm, 1.0);

      pr.m_bondscl = 0.4f;
      pr.refineGsl(ParticleRefine::MIN_SD);
      //PMP::iso_remesh(cgm, 1.0);

      pr.m_nMaxIter = 20;
      pr.m_mapscl = 200.0f;
      pr.m_bondscl = 1.0f;
      pr.refineGsl(ParticleRefine::MIN_SD);
      //PMP::iso_remesh(cgm, 1.0);
      //nv = cgm.number_of_vertices();
      //nf = cgm.number_of_faces();

      pr.writeResult(cgm);
      dumpTriStats("mcmin1-2.txt", cgm, m_ipol);
      dumpEdgeStats("edge_mcmin1-2.txt", cgm, m_ipol);

      //pr.dumpRefineLog("min1_trace.txt");
    }


    {
      /*
      typedef Mesh PM;
      typedef PMP::GetGeomTraits<PM>::type GT;
      
      Incremental_remesher<PM, GT> irm(cgm);
      irm.m_pipol = &m_ipol;
      irm.m_curv_scl = 0.3;
      irm.m_ideall_max = 1.0;
      irm.split_long_edges();
      irm.equalize_valences();
       */
      PMP::adp_remesh(&m_ipol, cgm, 5, 2);
    }
    
    nv = cgm.number_of_vertices();
    nf = cgm.number_of_faces();
    MB_DPRINTLN("Remeshing done, nv=%d, nf=%d", nv, nf);

  for (i=0; i<2; ++i) {
    {
      ParticleRefine pr;
      pr.m_isolev = m_dLevel;
      
      pr.refineSetup(&m_ipol, cgm);
      
      //pr.m_bUseAdp = false;
      pr.m_bUseAdp = true;
      pr.m_curv_scl = 0.4;
      pr.m_ideall_max = 0.8;
      pr.setAdpBond();
      
      //pr.m_bUseMap = false;
      pr.m_bUseMap = true;
      
      //pr.m_bUseProj = true;
      pr.m_bUseProj = false;
      
      //pr.m_nBondType = ParticleRefine::BOND_FULL;
      pr.m_nMaxIter = 10;
      pr.m_mapscl = 50.0f;
      pr.m_bondscl = 1.0f;
      pr.refineGsl(ParticleRefine::MIN_SD);
      
      pr.writeResult(cgm);
    }
  }

  dumpEdgeStats("edge_mcmin2.txt", cgm, m_ipol);



/*
  for (i=0; i<1; ++i) {
    {
      double target_edge_length = 0.5;
      unsigned int nb_iter = 1;
      unsigned int rel_iter = 0;
      PMP::my_isotropic_remeshing(
        faces(cgm),
        target_edge_length,
        cgm,
        PMP::parameters::number_of_iterations(nb_iter).number_of_relaxation_steps(rel_iter));
      
      nv = cgm.number_of_vertices();
      nf = cgm.number_of_faces();
      MB_DPRINTLN("Remeshing done, nv=%d, nf=%d", nv, nf);
    }

    {
      ParticleRefine pr;
      pr.m_isolev = m_dLevel;

      pr.refineSetup(&m_ipol, cgm);

      pr.m_bUseAdp = false;
      //pr.m_bUseAdp = true;

      //pr.m_bUseMap = false;
      pr.m_bUseMap = true;

      //pr.m_bUseProj = true;
      pr.m_bUseProj = false;

      pr.m_nMaxIter = 20;
      pr.m_mapscl = 50.0f;
      pr.m_bondscl = 1.0f;
      //pr.refine();
      pr.refineGsl();

      pr.writeResult(cgm);
      dumpTriStats("mcmin2.txt", cgm, m_ipol);
      dumpEdgeStats("edge_mcmin2.txt", cgm, m_ipol);

      pr.dumpRefineLog("min2_trace.txt");
    }
  }
*/
  
  {
    MB_DPRINTLN("Projecting vertices to surf");
    float del;
    FindProjSurf sol;
    sol.m_pipol = &m_ipol;
    sol.m_isolev = m_dLevel;
    sol.m_eps = FLT_EPSILON*100.0f;
    bool bSol;
    
    for(vid_t vd : cgm.vertices()){
      Vector3F v00 = convToV3F( cgm.point( vd ) );
      sol.setup(v00);
      if (sol.solve(del)) {
        Vector3F vnew = sol.getV(del);
        cgm.point(vd) = convToCGP3(vnew);
      }
      else {
        MB_DPRINTLN("proj failed.");
      }
    }
    MB_DPRINTLN("done");
  }

  drawMeshLines(pdl, cgm, 0,0,0);

  dumpTriStats("mcminrem.txt", cgm, m_ipol);

  K::Point_3 cgpt;
  Vector3F pt, norm;

/*
  pdl->color(gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
  pdl->setLineWidth(2.0);
  pdl->startLines();
  for(Mesh::Edge_index ei : cgm.edges()){
    if (cgm.is_border(ei)) {
      pdl->vertex(convToV3F(cgm.point(cgm.vertex(ei, 0))));
      pdl->vertex(convToV3F(cgm.point(cgm.vertex(ei, 1))));
    }
  }
  pdl->end();
*/
  
  //////////

  {
    pdl->color(1,0,0);
    pdl->setLineWidth(4.0);
    pdl->startLines();

    int i, j;
    Vector3F v[3], g[3], vn;
    float minang, maxang, rr, ns;

    i=0;
    for(fid_t fd : cgm.faces()){
      
      j=0;
      BOOST_FOREACH(vid_t vd,vertices_around_face(cgm.halfedge(fd), cgm)){
        MB_ASSERT(j<3);
        v[j] = convToV3F( cgm.point(vd) );
        g[j] = -(m_ipol.calcDiffAt(v[j])).normalize();
        ++j;
      }
      MB_ASSERT(j==3);
      
      //minang = minangl(v[0], v[1], v[2]);
      //maxang = minangl(v[0], v[1], v[2], true);
      //rr = radratio(v[0], v[1], v[2]);

      vn = ::calcNorm(v[0], v[1], v[2]).normalize();
      ns = (vn.dot(g[0]) + vn.dot(g[1]) + vn.dot(g[2]))/3.0f;
      
      if (ns<0.5) {
        pdl->vertex(v[0]);
        pdl->vertex(v[1]);

        pdl->vertex(v[1]);
        pdl->vertex(v[2]);

        pdl->vertex(v[2]);
        pdl->vertex(v[0]);
      }
      ++i;
    }
    pdl->end();
  }

  //////////

  {
    gfx::Mesh mesh;
    mesh.init(nv, nf);
    mesh.color(getColor());
    std::unordered_map<int,int> vidmap;

    //pdl->startLines();
    i=0;
    for(vid_t vd : cgm.vertices()){
      pt = convToV3F( cgm.point(vd) );
      norm = calcNorm(pt);
      //pdl->vertex(pt);
      //pdl->vertex(pt+norm.scale(0.5));
      mesh.setVertex(i, pt.x(), pt.y(), pt.z(), norm.x(), norm.y(), norm.z());
      vidmap.insert(std::pair<int,int>(int(vd), i));
      ++i;
    }
    //pdl->end();

    int vid[3];
    i=0;
    for(fid_t fd : cgm.faces()){
      j=0;
      BOOST_FOREACH(vid_t vd,vertices_around_face(cgm.halfedge(fd), cgm)){
        MB_ASSERT(j<3);
        vid[j] = int(vd);
        ++j;
      }
      MB_ASSERT(j==3);

      mesh.setFace(i, vidmap[vid[0]], vidmap[vid[1]], vidmap[vid[2]]);
      ++i;
    }
    pdl->drawMesh(mesh);
  }
  
}


#if 0
  pdl->setLineWidth(2.0);
  pdl->setLighting(false);
  pdl->startLines();

  for(Mesh::Edge_index ei : cgm.edges()){
    if (cgm.is_border(ei))
      continue;

    Mesh::Halfedge_index h0 = cgm.halfedge(ei, 0);
    Vector3F v00 = convToV3F( cgm.point( cgm.target(h0) ) );
    h0 = cgm.next(h0);
    Vector3F v01 = convToV3F( cgm.point( cgm.target(h0) ) );

    Mesh::Halfedge_index h1 = cgm.halfedge(ei, 1);
    Vector3F v10 = convToV3F( cgm.point( cgm.target(h1) ) );
    h1 = cgm.next(h1);
    Vector3F v11 = convToV3F( cgm.point( cgm.target(h1) ) );

    //float q0 = radratio(v00, v10, v01) + radratio(v00, v10, v11);
    //float q1 = radratio(v01, v11, v00) + radratio(v01, v11, v10);

    //float q0 = qlib::min( minangl(v00, v10, v01), minangl(v00, v10, v11) );
    //float q1 = qlib::min( minangl(v01, v11, v00), minangl(v01, v11, v10) );

    /*
    Vector3F n00 = calcNorm(v00);
    Vector3F n01 = calcNorm(v01);
    Vector3F n10 = calcNorm(v10);
    Vector3F n11 = calcNorm(v11);

    float q0 =
      calcNormScore(v00, v10, v01,
                    n00, n10, n01) +
        calcNormScore(v00, v10, v11,
                      n00, n10, n11);
    float q1 =
      calcNormScore(v01, v11, v00,
                    n01, n11, n00) +
        calcNormScore(v01, v11, v10,
                      n01, n11, n10);
     */

    Vector3F vcom = (v00+v01+v10+v11).scale(0.25f);

    if (checkSide(v00, v01, v10, vcom)) {

      //if (q0<q1) {
      //MB_DPRINTLN("flip tri (q0=%f, q1=%f)", q0, q1);
      //cgm.remove_edge();
      //cgm.add_edge();
      pdl->color(1.0, 0.0, 0.0);
      pdl->vertex(v00);
      pdl->vertex(v10);
      pdl->color(0.0, 1.0, 0.0);
      pdl->vertex(v01);
      pdl->vertex(v11);

      pdl->color(0.0, 0.0, 1.0);
      pdl->vertex(v10);
      pdl->vertex(v01);
      pdl->vertex(v01);
      pdl->vertex(v00);
      pdl->vertex(v00);
      pdl->vertex(v11);
      pdl->vertex(v11);
      pdl->vertex(v10);
    }
  }

  pdl->end();
  pdl->setLighting(true);
  return;
#endif



qsys::ObjectPtr MapIpolSurf2Renderer::generateSurfObj()
{
  ScalarObject *pMap = static_cast<ScalarObject *>(getClientObj().get());
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);
  m_pCMap = pMap;

  // generate map-range information
  // makerange();
  calcMapDispExtent(pMap);

  m_xform = calcXformMat(pMap, pXtal);

  surface::MolSurfObj *pSurfObj = new surface::MolSurfObj();
  m_msverts.clear();
  //renderImpl(NULL);
  int nverts = m_msverts.size();
  int nfaces = nverts/3;
  pSurfObj->setVertSize(nverts);
  for (int i=0; i<nverts; ++i)
    pSurfObj->setVertex(i, m_msverts[i]);
  pSurfObj->setFaceSize(nfaces);
  for (int i=0; i<nfaces; ++i)
    pSurfObj->setFace(i, i*3, i*3+1, i*3+2);
  m_msverts.clear();

  qsys::ObjectPtr rval = qsys::ObjectPtr(pSurfObj);
  return rval;
}

bool MapIpolSurf2Renderer::isUseVer2Iface() const
{
  return false;
  return true;
}

void MapIpolSurf2Renderer::invalidateDisplayCache()
{
  m_bWorkOK = false;
  super_t::invalidateDisplayCache();
}
    
