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

#include <modules/molstr/AtomPosMap2.hpp>

#include "MeshRefinePartMin.hpp"
#include "cgal_remesh_impl.h"

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qsys::ScrEventManager;
using molstr::AtomIterator;
using molstr::AtomPosMap2;


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

  m_pMesh = NULL;
  m_dCurvScl = 0.5;
  m_dLMin = 0.1;
  m_dLMax = 1.2;

  m_nMeshMode = MISR_MC;
  m_bProjVert = false;
}

// destructor
MapIpolSurf2Renderer::~MapIpolSurf2Renderer()
{
  // for safety, remove from event manager is needed here...
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  Mesh *pMesh = static_cast<Mesh *>(m_pMesh);
  if (pMesh!=NULL)
    delete pMesh;
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

  pdc->color(xtal::Map3Renderer::getColor());

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
    //pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL_XX);
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

void MapIpolSurf2Renderer::setColor(const ColorPtr &col)
{
  super_t::setColor(col);
  invalidateDisplayCache();
}

void MapIpolSurf2Renderer::setCenter(const Vector4D &v)
{
  Vector4D curpos = getCenter();
  if ( qlib::isNear4(v.x(), curpos.x()) &&
       qlib::isNear4(v.y(), curpos.y()) &&
       qlib::isNear4(v.z(), curpos.z()) )
    return;

  clearMeshData();
  super_t::setCenter(v);
}

void MapIpolSurf2Renderer::setExtent(double value)
{
  if (qlib::isNear4(value,getExtent()))
    return;
  clearMeshData();
  super_t::setExtent(value);
}

void MapIpolSurf2Renderer::setSigLevel(double value)
{
  if (qlib::isNear4(value,getSigLevel()))
    return;
  clearMeshData();
  super_t::setSigLevel(value);
}

void MapIpolSurf2Renderer::clearMeshData()
{
  Mesh *pMesh = static_cast<Mesh *>(m_pMesh);
  if (pMesh!=NULL)
    delete pMesh;
  m_pMesh = NULL;
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

void MapIpolSurf2Renderer::marchCube(void *pMesh)
{
  const int ncol = m_dspSize.x(); //m_nActCol;
  const int nrow = m_dspSize.y(); //m_nActRow;
  const int nsec = m_dspSize.z(); //m_nActSec;

  const int ixmax = m_mapSize.x();
  const int iymax = m_mapSize.y();
  const int izmax = m_mapSize.z();

  Mesh &cgm = *(static_cast<Mesh *>(pMesh));

  MapCrossValSolver xsol;
  xsol.m_pipol = &m_ipol;
  xsol.m_isolev = m_dLevel;
  xsol.m_eps = FLT_EPSILON*100.0f;

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

  bool bUseNsol = true;
  
  if (m_nMeshMode==MISR_MC && !m_bProjVert)
    bUseNsol = false;

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
          if (bUseNsol) {
            if (!xsol.solve(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix+1, iy, iz), vs)) {
              MB_DPRINTLN("NR for %d,%d,%d xdir failed.", i, j, k);
            }
          }
          else {
            xsol.linIpol(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix+1, iy, iz), vs);
          }
          vid = cgm.add_vertex(K::Point_3(vs.x(), vs.y(), vs.z()));
          xvertids.at(i,j,k).id[0] = vid;
        }
        
        val1 = getDen(ix, iy+1, iz);
        y1 = val1 - m_dLevel;

        if (y1<=0.0f)
          iflag |= 1<<3; // 0,1,0

        if (y0*y1<0) {
          if (bUseNsol) {
            if (!xsol.solve(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix, iy+1, iz), vs)) {
              MB_DPRINTLN("NR for %d,%d,%d ydir failed.", i, j, k);
              //xsol.solve(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix, iy+1, iz), vs);
            }
          }
          else {
            xsol.linIpol(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix, iy+1, iz), vs);
          }
          vid = cgm.add_vertex(K::Point_3(vs.x(), vs.y(), vs.z()));
          xvertids.at(i,j,k).id[1] = vid;
        }

        val1 = getDen(ix, iy, iz+1);
        y1 = val1 - m_dLevel;

        if (y1<=0.0f)
          iflag |= 1<<4; // 0,0,1

        if (y0*y1<0) {
          if (bUseNsol) {
            if (!xsol.solve(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix, iy, iz+1), vs)) {
              MB_DPRINTLN("NR for %d,%d,%d zdir failed.", i, j, k);
            }
          }
          else {
            xsol.linIpol(val0, Vector3F(ix, iy, iz), val1, Vector3F(ix, iy, iz+1), vs);
          }
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
  Vector3F v0, v1, v2;
  
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

          if (!bOK)
            continue;
          
          /*
          if (isUseMolBndry()) {
            v0 = convToV3F( cgm.point(iface[0]) );
            v1 = convToV3F( cgm.point(iface[0]) );
            v2 = convToV3F( cgm.point(iface[0]) );
            if (!inMolBndry(m_pCMap, v0.x(), v0.y(), v0.z()) ||
                !inMolBndry(m_pCMap, v1.x(), v1.y(), v1.z()) ||
                !inMolBndry(m_pCMap, v2.x(), v2.y(), v2.z()))
              bOK = false;
          }
            */
          
          if (bOK)
            cgm.add_face(iface[0], iface[1], iface[2]);

        } // for(iTriangle = 0; iTriangle < 5; iTriangle++)

      }

}

void MapIpolSurf2Renderer::buildMeshData(DisplayContext *pdl)
{
  Mesh *pMesh = static_cast<Mesh *>(m_pMesh);

  if (pMesh!=NULL)
    delete pMesh;

  pMesh = MB_NEW Mesh;
  m_pMesh = pMesh;

  /////////////////////
  // Do marching cubes

  marchCube(pMesh);

  if (m_nMeshMode==MISR_MC)
    return;

  /////////////////////

  Mesh &cgm = *pMesh;

  int i,j,k;

  m_ipol.m_curv_scl = m_dCurvScl;
  m_ipol.m_lmin = m_dLMin; //0.1;
  m_ipol.m_lmax = m_dLMax; //1.2;

  double isoL;// = m_dLMax;
  if (m_nMeshMode==MISR_ISOMESH)
    isoL = m_dLMax;
  else
    isoL = 1.0;
  
  //drawMeshLines(pdl, cgm, 1,0,0);

  int nv = cgm.number_of_vertices();
  int nf = cgm.number_of_faces();

  dumpTriStats("mc.txt", cgm, m_ipol);
  dumpEdgeStats("edge_mc.txt", cgm, m_ipol);

  int nIsoRefi = 5;
  if (m_nMeshMode==MISR_ADAMESH)
    nIsoRefi = 2;

  for (i=0; i<nIsoRefi; ++i) {
    LOG_DPRINTLN("Regular (L=%f) refine step %d", isoL, i);

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
      pr.setConstBond(isoL);

      pr.m_nMaxIter = 50;
      pr.m_mapscl = 50.0f;
      pr.m_bondscl = 0.1f;
      //pr.refine();
      pr.refineGsl(ParticleRefine::MIN_SD);

      pr.writeResult(cgm);

      pr.dumpRefineLog("min1_trace.txt");
    }

    if (i<nIsoRefi-1) {
      PMP::iso_remesh(&m_ipol, cgm, isoL, 1, 2);
      nv = cgm.number_of_vertices();
      nf = cgm.number_of_faces();
      LOG_DPRINTLN("Remeshing done, nv=%d, nf=%d", nv, nf);
    }

    dumpTriStats("mcmin1-1.txt", cgm, m_ipol);
    dumpEdgeStats("edge_mcmin1-1.txt", cgm, m_ipol);
  }

  /*if (!m_bUseAdp) {
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

dumpTriStats(LString(), cgm, m_ipol);

      pr.m_bondscl = 0.2f;
      pr.refineGsl(ParticleRefine::MIN_SD);

dumpTriStats(LString(), cgm, m_ipol);

      pr.m_bondscl = 0.4f;
      pr.refineGsl(ParticleRefine::MIN_SD);

dumpTriStats(LString(), cgm, m_ipol);

      pr.m_nMaxIter = 20;
      pr.m_mapscl = 200.0f;
      pr.m_bondscl = 1.0f;
      pr.refineGsl(ParticleRefine::MIN_SD);

      pr.writeResult(cgm);
      dumpTriStats("mcmin1-2.txt", cgm, m_ipol);
      dumpEdgeStats("edge_mcmin1-2.txt", cgm, m_ipol);

      //pr.dumpRefineLog("min1_trace.txt");
  }*/

  if (m_nMeshMode==MISR_ADAMESH) {
    for (i=0; i<10; ++i) {
      LOG_DPRINTLN("Adaptive refine step %d", i);

      PMP::adp_remesh(&m_ipol, cgm, 1, 1);

      nv = cgm.number_of_vertices();
      nf = cgm.number_of_faces();
      LOG_DPRINTLN("Remeshing done, nv=%d, nf=%d", nv, nf);

      ParticleRefine pr;
      pr.m_isolev = m_dLevel;

      pr.refineSetup(&m_ipol, cgm);

      //pr.m_bUseAdp = false;
      pr.m_bUseAdp = true;
      pr.setAdpBond();

      pr.m_bUseMap = true;

      pr.m_bUseProj = false;

      //pr.m_nBondType = ParticleRefine::BOND_FULL;
      pr.m_nMaxIter = 10;
      pr.m_mapscl = 50.0f;
      pr.m_bondscl = 0.1f;
      pr.refineGsl(ParticleRefine::MIN_SD);

      pr.writeResult(cgm);

      dumpTriStats(LString(), cgm, m_ipol);
      dumpEdgeStats(LString(), cgm, m_ipol);
    }
  }

  if (m_bProjVert) {
    LOG_DPRINTLN("Projecting vertices to surf");
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

  //drawMeshLines2(pdl, cgm, m_ipol);
  
  dumpTriStats("mcminrem.txt", cgm, m_ipol);
  dumpEdgeStats("edge_mcmin2.txt", cgm, m_ipol);
  // checkMeshNorm1(pdl, cgm, m_ipol);

}

void markAroundVert(Mesh &cgm, vid_t vd, int id, std::unordered_map<int,int> &conmap,
                    std::deque<vid_t> &trav)
{
  BOOST_FOREACH(Mesh::halfedge_index hi,
                halfedges_around_target(cgm.halfedge(vd), cgm)) {
    vid_t vd2 = cgm.source(hi);
    auto iter = conmap.find(int(vd2));
    if (iter==conmap.end()) {
      conmap[int(vd2)] = id;
      //markAroundVert(cgm, vd2, id, conmap);
      trav.push_back(vd2);
    }
  }

/*
  if (!cgm.is_valid(vd)) {
    MB_DPRINTLN("vd %d is invalid", int(vd));
    return;
  }

  Mesh::halfedge_index hi_start = cgm.halfedge(vd);
  if (!cgm.is_valid(hi_start)) {
    MB_DPRINTLN("vd %d has no valid halfedge", int(vd));
    return;
  }
  
  auto hi = hi_start;

  for (;;) {
    vid_t vd2 = cgm.source(hi);
    
    auto iter = conmap.find(int(vd2));
    if (iter==conmap.end()) {
      conmap[int(vd2)] = id;
      markAroundVert(cgm, vd2, id, conmap);
    }
    
    hi = cgm.next_around_target(hi);
    if (hi==hi_start)
      break;
  }*/
}

void MapIpolSurf2Renderer::renderMeshImpl1(DisplayContext *pdl)
{
  int i,j,k,l,ind;
  int ii, jj, kk;

  const int ncol = m_dspSize.x();
  const int nrow = m_dspSize.y();
  const int nsec = m_dspSize.z();

  Vector3F pt, norm;

  Mesh &cgm = *(static_cast<Mesh *>(m_pMesh));
  const int nv = cgm.number_of_vertices();
  const int nf = cgm.number_of_faces();

  gfx::Mesh mesh;
  mesh.init(nv, nf);
  mesh.color(xtal::Map3Renderer::getColor());

  MolCoordPtr pMol = getBndryMol();
  molstr::ColoringSchemePtr pCS;
  if (!pMol.isnull()) {
    pCS = getColSchm();
    if (!pCS.isnull())
      pCS->start(pMol, this);
  }
  
  AtomPosMap2 amap;
  auto pSel = getBndrySel();
  if (!pMol.isnull()) {
    amap.setTarget(pMol);
    //amap.generate(pSel);
    amap.generate();
  }

  std::unordered_map<int,int> conmap;
  i=0;
  for (vid_t vd : cgm.vertices()){
    auto iter = conmap.find(int(vd));
    if (iter!=conmap.end())
      continue;

    conmap[int(vd)] = i;
    std::deque<vid_t> trav;
    markAroundVert(cgm, vd, i, conmap, trav);
    while (!trav.empty()) {
      vid_t vd2 = trav.front();
      trav.pop_front();
      markAroundVert(cgm, vd2, i, conmap, trav);
    }

    ++i;
  }
  MB_DPRINTLN("ConMap> segmented to %d regions", i);

  //pdl->startLines();

  std::unordered_map<int,int> vidmap;
  i=0;
  Vector4D pos;
  gfx::ColorPtr pCol;
  for (vid_t vd : cgm.vertices()){
    pt = convToV3F( cgm.point(vd) );

    //pdl->vertex(pt);
    //pdl->vertex(pt+norm.scale(0.5));

    pos = m_pCMap->convToOrth(Vector4D(pt));
    int aid = amap.searchNearestAtom(pos);
    molstr::MolAtomPtr pa = pMol->getAtom(aid);
    if (pa.isnull() || !pSel->isSelected(pa))
      continue;

    pCol = molstr::ColSchmHolder::getColor(pa);

    if (!pCol.isnull())
      mesh.color(pCol);
    else
      mesh.color(xtal::Map3Renderer::getColor());

    //int imark = conmap[int(vd)];
    //mesh.color(gfx::SolidColor::createHSB(float(imark)*0.1, 1, 1));

    norm = calcNorm(pt);
    mesh.setVertex(i, pt.x(), pt.y(), pt.z(), norm.x(), norm.y(), norm.z());
    vidmap.insert(std::pair<int,int>(int(vd), i));
    ++i;
  }
  //pdl->end();

  if (!pCS.isnull())
    pCS->end();

  int vid[3];
  Vector3F v[3];
  int nOK;

  i=0;
  for(fid_t fd : cgm.faces()){

    j=0;
    BOOST_FOREACH(vid_t vd,vertices_around_face(cgm.halfedge(fd), cgm)){
      MB_ASSERT(j<3);
      auto iter = vidmap.find(int(vd));
      if (iter==vidmap.end()) {
        break;
      }
      vid[j] = iter->second;
      //v[j] = convToV3F( cgm.point(vd) );
      ++j;
    }

    if (j<3) continue;
    
    /*
    MB_ASSERT(j==3);

    for (k=0; k<3; ++k)
      v[k] = convToV3F( cgm.point(vid_t(vid[k])) );

    if (isUseMolBndry()) {
      if (!inMolBndry(m_pCMap, v[0].x(), v[0].y(), v[0].z()) ||
          !inMolBndry(m_pCMap, v[1].x(), v[1].y(), v[1].z()) ||
          !inMolBndry(m_pCMap, v[2].x(), v[2].y(), v[2].z()))
        continue;
    }
     */

    //mesh.setFace(i, vidmap[vid[0]], vidmap[vid[1]], vidmap[vid[2]]);
    mesh.setFace(i, vid[0], vid[1], vid[2]);
    ++i;
  }

//pdl->setCullFace(false);
//pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);
  pdl->drawMesh(mesh);

  if (m_nDrawMode==MSRDRAW_FILL_LINE) {
    pdl->setLineWidth(m_lw);
    pdl->startLines();
    pdl->color(getEdgeLineColor());

    for(Mesh::Edge_index ei : cgm.edges()){
      Mesh::Halfedge_index h0 = cgm.halfedge(ei, 0);
      v[0] = convToV3F( cgm.point( cgm.target(h0) ) );
      
      Mesh::Halfedge_index h1 = cgm.halfedge(ei, 1);
      v[1] = convToV3F( cgm.point( cgm.target(h1) ) );
      
      /*
      if (isUseMolBndry()) {
        if (!inMolBndry(m_pCMap, v[0].x(), v[0].y(), v[0].z()) ||
            !inMolBndry(m_pCMap, v[1].x(), v[1].y(), v[1].z()))
          continue;
      }
*/
      pdl->vertex(v[0]);
      pdl->vertex(v[1]);
    }
    pdl->end();
  }
}

static const int adjvox[26][3] =
{
  {1, 0, 0},{-1, 0, 0},{0, 1, 0},{0, -1, 0},{0, 0, 1},{0, 0, -1},
  {1, 1, 0},{-1, 1, 0},{1, -1, 0},{-1, -1, 0},
  {1, 0, 1},{-1, 0, 1},{1, 0, -1},{-1, 0, -1},
  {0, 1, 1},{0, -1, 1},{0, 1, -1},{0, -1, -1},
  {1, 1, 1},
  {1, 1, -1},{1, -1, 1},{-1, 1, 1},
  {1, -1, -1},{-1, -1, 1},{-1, 1, -1},
  {-1, -1, -1}
};

void MapIpolSurf2Renderer::renderMeshImpl2(DisplayContext *pdl)
{
  // //XXX
  // return;

  int i,j,k,l,ind;
  int ii, jj, kk;

  const int ncol = m_dspSize.x();
  const int nrow = m_dspSize.y();
  const int nsec = m_dspSize.z();

  int nbin = m_nWatShedBin;

  const int nidcol = m_dspSize.x() * nbin;
  const int nidrow = m_dspSize.y() * nbin;
  const int nidsec = m_dspSize.z() * nbin;

  std::set<int> ind_inc;
  qlib::Array3D<int> indmap(nidcol, nidrow, nidsec);

  AtomPosMap2 amap;
  MolCoordPtr pMol = getBndryMol();
  if (!pMol.isnull()) {
    amap.setTarget(pMol);
    amap.generate(getBndrySel());
    //amap.generate();
  }

  if (isUseMolBndry()) {

//pdl->setLighting(false);
//pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);

    struct Elem {
      float val;
      int i, j, k;
    };
    Elem elm2;

    //std::vector<Elem> map0(ncol*nrow*nsec);
    std::deque<Elem> map0; //(ncol*nrow*nsec);
    for (i=0; i<nidcol; i++)
      for (j=0; j<nidrow; j++)
        for (k=0; k<nidsec; k++) {
          float ix = float(i)/float(nbin) + float(m_nbcol);
          float iy = float(j)/float(nbin) + float(m_nbrow);
          float iz = float(k)/float(nbin) + float(m_nbsec);
          //float val = getDen(ix, iy, iz);
          float val = m_ipol.calcAt(Vector3F(ix,iy,iz));

          if (val<m_dLevel) {
            bool bOK = false;
            for (l=0; l<26; l++) {
              float ix = float(i+adjvox[l][0])/float(nbin) + float(m_nbcol);
              float iy = float(j+adjvox[l][1])/float(nbin) + float(m_nbrow);
              float iz = float(k+adjvox[l][2])/float(nbin) + float(m_nbsec);
              float val2 = m_ipol.calcAt(Vector3F(ix,iy,iz));
              //float val2 = getDen(ii, jj, kk);
              if (val2>=m_dLevel) {
                bOK = true;
                break;
              }
            }

            if (!bOK)
              continue;
          }

          //const int idx = i + (j + k*nrow)*ncol;
          elm2.val = val;
          elm2.i = i;
          elm2.j = j;
          elm2.k = k;
          map0.push_back(elm2);

        }

/*
pdl->startLines();
          // draw grid lines
          pdl->vertex(m_nbcol, j + m_nbrow, k + m_nbsec);
          pdl->vertex(ncol + m_nbcol, j + m_nbrow, k + m_nbsec);
          
          pdl->vertex(i + m_nbcol, m_nbrow, k + m_nbsec);
          pdl->vertex(i + m_nbcol, nrow + m_nbrow, k + m_nbsec);
          
          pdl->vertex(i + m_nbcol, j + m_nbrow, m_nbsec);
          pdl->vertex(i + m_nbcol, j + m_nbrow, nsec + m_nbsec);
pdl->end();
*/
    LOG_DPRINTLN("WatShed> sorting %d elems...", map0.size());
    std::sort(map0.begin(), map0.end(),
              [](const Elem &x, const Elem &y) -> bool {
                return x.val>y.val;
              });

    for (i=0; i<indmap.size(); ++i)
      indmap.at(i) = -1;

    int iadj, nadj;
    std::vector<Elem> adjmap;
    float val, maxval;
    int maxind;
    int imark = 0;

    typedef std::map<int, Vector3F> PosMap;
    PosMap posmap;

    for (const Elem &elem: map0) {
      i = elem.i;
      j = elem.j;
      k = elem.k;

      maxval = -1.0e10;
      maxind = -1;
      
      // Find voxel having max value
      for (l=0; l<26; l++) {
      //for (l=0; l<6; l++) {
        ii = i + adjvox[l][0];
        jj = j + adjvox[l][1];
        kk = k + adjvox[l][2];

        if (0<=ii && ii<nidcol &&
            0<=jj && jj<nidrow &&
            0<=kk && kk<nidsec) {
          iadj = indmap.at(ii, jj, kk);
          if (iadj>=0) {
            //val = getDen(ii+m_nbcol, jj+m_nbrow, kk+m_nbsec);

            float ix = float(ii)/float(nbin) + float(m_nbcol);
            float iy = float(jj)/float(nbin) + float(m_nbrow);
            float iz = float(kk)/float(nbin) + float(m_nbsec);
            float val = m_ipol.calcAt(Vector3F(ix,iy,iz));

            if (val>maxval) {
              maxind = iadj;
            }
          }
        }
      }

      if (maxind<0) {
        // Voxel with max value not found --> assign new index
        indmap.at(i, j, k) = imark;
        posmap.insert(PosMap::value_type(imark, Vector3F(float(i)/float(nbin) + float(m_nbcol),
                                                         float(j)/float(nbin) + float(m_nbrow),
                                                         float(k)/float(nbin) + float(m_nbsec))));
        ++imark;
        //pdl->color(gfx::SolidColor::createHSB(float(imark-1)*0.1, 1, 1));
        //pdl->sphere(0.3, Vector4D(i+m_nbcol, j+m_nbrow, k+m_nbsec));
      }
      else {
        indmap.at(i, j, k) = maxind;
      }

    } // for (const Elem &elem: map0)

    LOG_DPRINTLN("WatShed> segmented to %d regions", imark);


    // Dump grid IDs
/*    for (i=0; i<nidcol; i++)
      for (j=0; j<nidrow; j++)
        for (k=0; k<nidsec; k++) {
          int imk = indmap.at(i, j, k);
          if (imk<0) continue;
          pdl->color(gfx::SolidColor::createHSB(float(imk)*0.1, 1, 1));
          float ix = float(i)/float(nbin) + float(m_nbcol);
          float iy = float(j)/float(nbin) + float(m_nbrow);
          float iz = float(k)/float(nbin) + float(m_nbsec);
          pdl->sphere(0.1, Vector4D(ix, iy, iz));
        }
*/

    Vector4D pos;
    molstr::MolAtomPtr pAtom;

    for (const PosMap::value_type &elem: posmap) {
      int imk = elem.first;
      Vector4D gpos = Vector4D(elem.second);

      pos = m_pCMap->convToOrth(gpos);
      int aid = amap.searchNearestAtom(pos);
      pAtom = pMol->getAtom(aid);
      if (pAtom.isnull())
        continue;
      if ( (pos-pAtom->getPos()).length() < m_dBndryRng2 ) {
        ind_inc.insert( imk );
      }
    }
    
/*
    for (i=0; i<nidcol; i++)
      for (j=0; j<nidrow; j++)
        for (k=0; k<nidsec; k++) {
          int imk = indmap.at(i, j, k);
          if (imk<0)
            continue;

          float ix = float(i)/float(nbin) + float(m_nbcol);
          float iy = float(j)/float(nbin) + float(m_nbrow);
          float iz = float(k)/float(nbin) + float(m_nbsec);

          pos = m_pCMap->convToOrth(Vector4D(ix, iy, iz));
          int aid = amap.searchNearestAtom(pos);
          pAtom = pMol->getAtom(aid);
          if (pAtom.isnull())
            continue;
          if ( (pos-pAtom->getPos()).length() < 0.5 ) {
            ind_inc.insert( imk );
            //pdl->color(gfx::SolidColor::createHSB(float(imk)*0.1, 1, 1));
            //pdl->sphere(0.1, Vector4D(i+m_nbcol, j+m_nbrow, k+m_nbsec));
          }
        }    
*/
    
    /*
    AtomIterator aiter(getBndryMol(), getBndrySel());
    for (aiter.first();
         aiter.hasMore();
         aiter.next()) {
      pos = aiter.get()->getPos();
      pos = m_pCMap->convToGrid(pos);
      i = int( std::round( pos.x() ) ) - m_nbcol;
      j = int( std::round( pos.y() ) ) - m_nbrow;
      k = int( std::round( pos.z() ) ) - m_nbsec;
      if (0<=i && i<ncol &&
          0<=j && j<nrow &&
          0<=k && k<nsec) {
        int imk = indmap.at(i, j, k);
        ind_inc.insert( imk );
        //pdl->color(gfx::SolidColor::createHSB(float(imk)*0.1, 1, 1));
        //pdl->sphere(0.1, Vector4D(i+m_nbcol, j+m_nbrow, k+m_nbsec));
      }
    }
     */

    for (int ind: ind_inc) {
      MB_DPRINTLN("WatShed> show: %d", ind);
    }
  }
  
  //K::Point_3 cgpt;
  Vector3F pt, norm;

  Mesh &cgm = *(static_cast<Mesh *>(m_pMesh));
  const int nv = cgm.number_of_vertices();
  const int nf = cgm.number_of_faces();

  gfx::Mesh mesh;
  mesh.init(nv, nf);
  mesh.color(xtal::Map3Renderer::getColor());
  std::unordered_map<int,int> vidmap;

  molstr::ColoringSchemePtr pCS;
  // MolCoordPtr pMol = getBndryMol();
  if (!pMol.isnull()) {
    pCS = getColSchm();
    if (!pCS.isnull())
      pCS->start(pMol, this);
  }
  
  //pdl->startLines();
  i=0;
  Vector4D pos;
  for (vid_t vd : cgm.vertices()){
    pt = convToV3F( cgm.point(vd) );
    norm = calcNorm(pt);
    //pdl->vertex(pt);
    //pdl->vertex(pt+norm.scale(0.5));

    pos = m_pCMap->convToOrth(Vector4D(pt));
    int aid = amap.searchNearestAtom(pos);
    molstr::MolAtomPtr pa = pMol->getAtom(aid);
    if (!pa.isnull()) {
      mesh.color(molstr::ColSchmHolder::getColor(pa));
    }
    else {
      mesh.color(xtal::Map3Renderer::getColor());
    }
      
    /*
    ii = int(std::round( (pt.x()- float(m_nbcol)) * float(nbin) ));
    jj = int(std::round( (pt.y()- float(m_nbrow)) * float(nbin) ));
    kk = int(std::round( (pt.z()- float(m_nbsec)) * float(nbin) ));
    int ind;
    if (0<=ii && ii<nidcol &&
        0<=jj && jj<nidrow &&
        0<=kk && kk<nidsec &&
        (ind = indmap.at(ii, jj, kk))>=0) {
      mesh.color(gfx::SolidColor::createHSB(float(ind)*0.1, 1, 1));
    }
    else {
      mesh.color(getColor());
    }
     */

    mesh.setVertex(i, pt.x(), pt.y(), pt.z(), norm.x(), norm.y(), norm.z());
    vidmap.insert(std::pair<int,int>(int(vd), i));
    ++i;
  }
  //pdl->end();

  if (!pCS.isnull())
    pCS->end();


  int vid[3];
  Vector3F v[3];
  int nOK;

  i=0;
  for(fid_t fd : cgm.faces()){

    j=0;
    BOOST_FOREACH(vid_t vd,vertices_around_face(cgm.halfedge(fd), cgm)){
      MB_ASSERT(j<3);
      vid[j] = int(vd);
      ++j;
    }
    MB_ASSERT(j==3);

    if (isUseMolBndry()) {
      nOK = 0;
      for (k=0; k<3; ++k) {
        v[k] = convToV3F( cgm.point(vid_t(vid[k])) );

        ii = int(std::round( (v[k].x()- float(m_nbcol)) * float(nbin) ));
        jj = int(std::round( (v[k].y()- float(m_nbrow)) * float(nbin) ));
        kk = int(std::round( (v[k].z()- float(m_nbsec)) * float(nbin) ));

        if (0<=ii && ii<nidcol &&
            0<=jj && jj<nidrow &&
            0<=kk && kk<nidsec &&
            (ind = indmap.at(ii, jj, kk))>=0) {
          if (ind_inc.find(ind)!=ind_inc.end())
            nOK += 1;
        }
      }

      if (nOK<3)
        continue;

      //if (nOK<2)
      //continue;
      //if (nOK<1)
      //continue;

      /*
      if (!inMolBndry(m_pCMap, v0.x(), v0.y(), v0.z()) ||
          !inMolBndry(m_pCMap, v1.x(), v1.y(), v1.z()) ||
          !inMolBndry(m_pCMap, v2.x(), v2.y(), v2.z()))
        continue;
       */
    }

    mesh.setFace(i, vidmap[vid[0]], vidmap[vid[1]], vidmap[vid[2]]);
    ++i;
  }

//pdl->setCullFace(false);
//pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);
  pdl->drawMesh(mesh);

  if (m_nDrawMode==MSRDRAW_FILL_LINE) {
    pdl->setLineWidth(m_lw);
    pdl->startLines();
    pdl->color(getEdgeLineColor());

    //ColorPtr col[2];

    for(Mesh::Edge_index ei : cgm.edges()){
      Mesh::Halfedge_index h0 = cgm.halfedge(ei, 0);
      v[0] = convToV3F( cgm.point( cgm.target(h0) ) );
      
      Mesh::Halfedge_index h1 = cgm.halfedge(ei, 1);
      v[1] = convToV3F( cgm.point( cgm.target(h1) ) );
      
      if (isUseMolBndry()) {
        nOK = 0;
        for (k=0; k<2; ++k) {
          ii = int(std::round( (v[k].x()- float(m_nbcol)) * float(nbin) ));
          jj = int(std::round( (v[k].y()- float(m_nbrow)) * float(nbin) ));
          kk = int(std::round( (v[k].z()- float(m_nbsec)) * float(nbin) ));
          if (0<=ii && ii<nidcol &&
              0<=jj && jj<nidrow &&
              0<=kk && kk<nidsec &&
              (ind = indmap.at(ii, jj, kk))>=0) {
            if (ind_inc.find(ind)!=ind_inc.end())
              nOK += 1;
          }

          /*
          pos = m_pCMap->convToOrth(Vector4D(v[k]));
          int aid = amap.searchNearestAtom(pos);
          molstr::MolAtomPtr pa = pMol->getAtom(aid);
          if (!pa.isnull())
            col[k] = molstr::ColSchmHolder::getColor(pa);
          else
            col[k] = ColorPtr();
           */
        }

        if (nOK<2)
          continue;
        /*
        if (!inMolBndry(m_pCMap, v0.x(), v0.y(), v0.z()) ||
            !inMolBndry(m_pCMap, v1.x(), v1.y(), v1.z()))
          continue;
         */


      }

      //if (!col[0].isnull())
      //pdl->color(col[0]);
      pdl->vertex(v[0]);
      //if (!col[1].isnull())
      //pdl->color(col[1]);
      pdl->vertex(v[1]);
    }
    pdl->end();
  }
}

void MapIpolSurf2Renderer::renderImpl2(DisplayContext *pdl)
{
  ScalarObject *pMap = m_pCMap;
  DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

  // Setup grid-space (map origin) coord xform 
  setupXform(pdl, pMap, pXtal, false);

  const double siglevel = getSigLevel();
  m_dLevel = pMap->getRmsdDensity() * siglevel;

  m_nbcol = m_mapStPos.x();
  m_nbrow = m_mapStPos.y();
  m_nbsec = m_mapStPos.z();

  if (m_ipol.m_pBsplCoeff==NULL) {
    m_ipol.calcCoeffs(pXtal);
  }
  
  if (m_pMesh==NULL) {
    buildMeshData(pdl);
  }

  renderMeshImpl1(pdl);
}

void MapIpolSurf2Renderer::setBndryRng2(double d)
{
  if (d<0.0)
    MB_THROW(qlib::RuntimeException, "xxx");

  if (qlib::isNear4(d, m_dBndryRng2))
    return;

  m_dBndryRng2 = d;

  invalidateDisplayCache();
}

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
  super_t::invalidateDisplayCache();
}
    
