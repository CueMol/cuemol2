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

#include <CGAL/Simple_cartesian.h>
#include <CGAL/Surface_mesh.h>
#include <CGAL/Subdivision_method_3.h>

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
  rval.normalizeSelf();
  return -rval;
}


typedef CGAL::Simple_cartesian<double> K;
typedef CGAL::Surface_mesh<K::Point_3> Mesh;
typedef Mesh::Vertex_index vid_t;
typedef Mesh::Face_index fid_t;

inline Vector3F convToV3F(const K::Point_3 &src) {
  return Vector3F(src.x(), src.y(), src.z());
}

inline K::Point_3 convToCGP3(const Vector3F &src) {
  return K::Point_3(src.x(), src.y(), src.z());
}

inline float radratio(const Vector3F &v0, const Vector3F &v1, const Vector3F &v2) {
  float a = (v0-v1).length();
  float b = (v1-v2).length();
  float c = (v2-v0).length();
  return (b + c - a)*(c + a - b)*(a + b - c) / (a*b*c);
}

inline float angle(const Vector3F &v1, const Vector3F &v2)
{
  const float u = float( v1.dot(v2) );
  const float l = float( v1.length() ) * float( v2.length()  );
  const float res = ::acos( u/l );
  return res;
}

inline float minangl(const Vector3F &v0, const Vector3F &v1, const Vector3F &v2) {
  float a = angle( (v1-v0), (v2-v0) );
  float b = angle( (v0-v1), (v2-v1) );
  float c = angle( (v1-v2), (v0-v2) );
  return qlib::min( qlib::min(a, b), c);
}

inline float calcNormScore(const Vector3F &v0, const Vector3F &v1, const Vector3F &v2,
                           const Vector3F &n0, const Vector3F &n1, const Vector3F &n2)
{
  Vector3F nav = (n0+n1+n2).normalize();
  Vector3F fav = ((v1-v0).cross(v2-v0)).normalize();
  return qlib::abs(nav.dot(fav));
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

  K::Point_3 cgpt;
  Vector3F pt, norm;


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

    Vector3F n00 = calcNorm(v00);
    Vector3F n01 = calcNorm(v01);
    Vector3F n10 = calcNorm(v10);
    Vector3F n11 = calcNorm(v11);

    //float q0 = radratio(v00, v10, v01) + radratio(v00, v10, v11);
    //float q1 = radratio(v01, v11, v00) + radratio(v01, v11, v10);

    //float q0 = qlib::min( minangl(v00, v10, v01), minangl(v00, v10, v11) );
    //float q1 = qlib::min( minangl(v01, v11, v00), minangl(v01, v11, v10) );

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

    if (q0<q1) {
      MB_DPRINTLN("flip tri (q0=%f, q1=%f)", q0, q1);
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


/*
  pdl->color(gfx::SolidColor::createRGB(1.0, 0.0, 0.0));
  pdl->setLineWidth(2.0);
  pdl->startLines();
  for(Mesh::Edge_index ei : cgm.edges()){
    if (cgm.is_border(ei)) {
      vid = cgm.vertex(ei, 0);
      cgpt = cgm.point(vid);
      pt.x() = cgpt.x();
      pt.y() = cgpt.y();
      pt.z() = cgpt.z();
      pdl->vertex(pt);

      vid = cgm.vertex(ei, 1);
      cgpt = cgm.point(vid);
      pt.x() = cgpt.x();
      pt.y() = cgpt.y();
      pt.z() = cgpt.z();
      pdl->vertex(pt);
    }
  }
  pdl->end();
*/
  
  //////////

  gfx::Mesh mesh;
  int nv = cgm.number_of_vertices();
  int nf = cgm.number_of_faces();
  mesh.init(nv, nf);
  mesh.color(getColor());

  for(vid_t vd : cgm.vertices()){
    //std::cout << vd << std::endl;
    cgpt = cgm.point(vd);
    pt.x() = cgpt.x();
    pt.y() = cgpt.y();
    pt.z() = cgpt.z();
    norm = calcNorm(pt);
    mesh.setVertex(int(vd), pt.x(), pt.y(), pt.z(), norm.x(), norm.y(), norm.z());
  }

  int fid[3];
  for(fid_t fd : cgm.faces()){
    i=0;
    BOOST_FOREACH(vid_t vd,vertices_around_face(cgm.halfedge(fd), cgm)){
      MB_ASSERT(i<3);
      fid[i] = int(vd);
      ++i;
    } 
    MB_ASSERT(i==3);
    mesh.setFace(int(fd), fid[0], fid[1], fid[2]);
  }

/*
  gfx::Mesh mesh;
  int nv = verts.size();
  int nf = faces.size();
  mesh.init(nv, nf);
  mesh.color(getColor());
  
  i=0;
  BOOST_FOREACH (const surface::MSVert &elem, verts) {
    mesh.setVertex(i, elem.x, elem.y, elem.z, elem.nx, elem.ny, elem.nz);
    ++i;
  }  

  i=0;
  BOOST_FOREACH (const surface::MSFace &elem, faces) {
    mesh.setFace(i, elem.id1, elem.id2, elem.id3);
    ++i;
  }
*/
  pdl->drawMesh(mesh);
}




void MapIpolSurf2Renderer::renderImpl(DisplayContext *pdl)
{
  /////////////////////
  // setup workarea

  ScalarObject *pMap = m_pCMap;

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

  /////////////////////
  // do marching cubes

  int i,j,k;

  for (i=0; i<ncol; i++)
    for (j=0; j<nrow; j++)
      for (k=0; k<nsec; k++) {

        int ix = i + m_nbcol;
        int iy = j + m_nbrow;
        int iz = k + m_nbsec;
        if (!m_bPBC) {
          if (ix<0||iy<0||iz<0 ||
              ix+1>=ixmax|| iy+1>=iymax|| iz+1>=izmax)
            continue;
        }

        bool bin = false;
        int ii;
        for (ii=0; ii<8; ii++) {
          const int ixx = ix + (vtxoffs[ii][0]);
          const int iyy = iy + (vtxoffs[ii][1]);
          const int izz = iz + (vtxoffs[ii][2]);
          m_values[ii] = getDen(ixx, iyy, izz);
          
          // check mol boundary
          m_bary[ii] = inMolBndry(pMap, ixx, iyy, izz);
          if (m_bary[ii])
            bin = true;
        }

        if (!bin)
          continue;

        marchCube(pdl, i, j, k);
        
        /*
        pdl->startLines();
        pdl->vertex(i,j,k);
        pdl->vertex(i+1,j,k);
        pdl->vertex(i,j,k);
        pdl->vertex(i,j+1,k);
        pdl->vertex(i,j,k);
        pdl->vertex(i,j,k+1);
        pdl->end();*/
      }
        

}


/////////////////////////////////////////////////////////////////////////////////

//fGetOffset finds the approximate point of intersection of the surface
// between two points with the values fValue1 and fValue2
namespace {
  inline float getOffset(float fValue1, float fValue2, float fValueDesired)
  {
    float fDelta = fValue2 - fValue1;
    
    if(fDelta == 0.0f) {
      return 0.5f;
    }
    return (fValueDesired - fValue1)/fDelta;
  }
}

//////////////////////////////////////////


void MapIpolSurf2Renderer::marchCube(DisplayContext *pdl,
                                     int fx, int fy, int fz)
{
  int iCorner, iVertex, iVertexTest, iEdge, iTriangle, iFlagIndex, iEdgeFlags;

  Vector4D asEdgeVertex[12];
  Vector4D asEdgeNorm[12];
  bool edgeBinFlags[12];

  // Find which vertices are inside of the surface and which are outside
  iFlagIndex = 0;
  for(iVertexTest = 0; iVertexTest < 8; iVertexTest++) {
    if(m_values[iVertexTest] <= m_dLevel) 
      iFlagIndex |= 1<<iVertexTest;
  }

  // Find which edges are intersected by the surface
  iEdgeFlags = aiCubeEdgeFlags[iFlagIndex];

  //If the cube is entirely inside or outside of the surface, then there will be no intersections
  if(iEdgeFlags == 0) {
    return;
  }

  {
    for (int ii=0; ii<8; ii++) {
      m_norms[ii].w() = -1.0;
    }
  }
  ScalarObject *pMap = m_pCMap;
  const int ix = fx + m_nbcol;
  const int iy = fy + m_nbrow;
  const int iz = fz + m_nbsec;

  // Find the point of intersection of the surface with each edge
  // Then find the normal to the surface at those points
  for(iEdge = 0; iEdge < 12; iEdge++) {
    //if there is an intersection on this edge
    if(iEdgeFlags & (1<<iEdge)) {
      const int ec0 = a2iEdgeConnection[iEdge][0];
      const int ec1 = a2iEdgeConnection[iEdge][1];
      if (m_bary[ec0]==false || m_bary[ec1]==false) {
        edgeBinFlags[iEdge] = false;
        continue;
      }
      edgeBinFlags[iEdge] = true;
      
      const double fOffset = getOffset(m_values[ ec0 ], 
                                       m_values[ ec1 ], m_dLevel);
      
      asEdgeVertex[iEdge].x() =
        double(fx) +
          (a2fVertexOffset[ec0][0] + fOffset*a2fEdgeDirection[iEdge][0]);
      asEdgeVertex[iEdge].y() =
        double(fy) +
          (a2fVertexOffset[ec0][1] + fOffset*a2fEdgeDirection[iEdge][1]);
      asEdgeVertex[iEdge].z() =
        double(fz) +
          (a2fVertexOffset[ec0][2] + fOffset*a2fEdgeDirection[iEdge][2]);
      asEdgeVertex[iEdge].w() = 0;
      
      Vector4D nv0,nv1;
      if (m_norms[ ec0 ].w()<0.0) {
        const int ixx = ix + (vtxoffs[ec0][0]);
        const int iyy = iy + (vtxoffs[ec0][1]);
        const int izz = iz + (vtxoffs[ec0][2]);
        nv0 = m_norms[ec0] = getGrdNorm2(ixx, iyy, izz);
      }
      else {
        nv0 = m_norms[ec0];
      }
      if (m_norms[ ec1 ].w()<0.0) {
        const int ixx = ix + (vtxoffs[ec1][0]);
        const int iyy = iy + (vtxoffs[ec1][1]);
        const int izz = iz + (vtxoffs[ec1][2]);
        nv1 = m_norms[ec1] = getGrdNorm2(ixx, iyy, izz);
      }
      else {
        nv1 = m_norms[ec1];
      }
      asEdgeNorm[iEdge] = (nv0.scale(1.0-fOffset) + nv1.scale(fOffset)).normalize();
    }
  }

  // Draw the triangles that were found.  There can be up to five per cube
  for(iTriangle = 0; iTriangle < 5; iTriangle++) {
    if(a2iTriangleConnectionTable[iFlagIndex][3*iTriangle] < 0)
      break;
    
    bool bNotDraw = false;
    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = a2iTriangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      if (!edgeBinFlags[iVertex]) {
        bNotDraw = true;
        break;
      }
    }
    if (bNotDraw)
      continue;

    for(iCorner = 0; iCorner < 3; iCorner++) {
      iVertex = a2iTriangleConnectionTable[iFlagIndex][3*iTriangle+iCorner];
      
      // getVertexColor(sColor, asEdgeVertex[iVertex], asEdgeNorm[iVertex]);
      // glColor3f(sColor.x, sColor.y, sColor.z);

      //if (getLevel()<0) {
      if (m_dLevel<0) {
        if (pdl!=NULL) {
          pdl->normal(-asEdgeNorm[iVertex]);
          pdl->vertex(asEdgeVertex[iVertex]);
        }
        else {
          addMSVert(asEdgeVertex[iVertex], -asEdgeNorm[iVertex]);
        }
#ifdef SHOW_NORMAL
        m_tmpv.push_back(asEdgeVertex[iVertex]);
        m_tmpv.push_back(asEdgeVertex[iVertex]-asEdgeNorm[iVertex]);
#endif

      }
      else {
        if (pdl!=NULL) {
          pdl->normal(asEdgeNorm[iVertex]);
          pdl->vertex(asEdgeVertex[iVertex]);
        }
        else {
          addMSVert(asEdgeVertex[iVertex], asEdgeNorm[iVertex]);
        }
        
#ifdef SHOW_NORMAL
        m_tmpv.push_back(asEdgeVertex[iVertex]);
        m_tmpv.push_back(asEdgeVertex[iVertex]+asEdgeNorm[iVertex]);
#endif
      }


    } // for(iCorner = 0; iCorner < 3; iCorner++)

  } // for(iTriangle = 0; iTriangle < 5; iTriangle++)

  return;
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
  renderImpl(NULL);
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
    
