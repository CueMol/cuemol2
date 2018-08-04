// -*-Mode: C++;-*-
//
//  LuxCore Display context implementation class
//

#include <common.h>

#include "LuxCoreDisplayContext.hpp"
#include "LuxCoreSceneExporter.hpp"
#include "RendIntData.hpp"
#include <qlib/PrintStream.hpp>
#include <qlib/BinStream.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/Utils.hpp>
#include <gfx/SolidColor.hpp>
#include <qsys/style/StyleMgr.hpp>
#include <qsys/SceneManager.hpp>

using namespace render;

using qlib::BinOutStream;
//using qlib::Matrix4D;
using qlib::Matrix3D;
using qlib::MapPtrTable;

using qsys::StyleMgr;
using qsys::SceneManager;

LuxCoreDisplayContext::LuxCoreDisplayContext()
     : FileDisplayContext(), m_pOut(NULL), m_pOut2(NULL), m_pParent(NULL)
{
}

LuxCoreDisplayContext::~LuxCoreDisplayContext()
{
  if (m_pOut!=NULL)
    delete m_pOut;
  m_pOut = NULL;

  if (m_pOut2!=NULL)
    delete m_pOut2;
  m_pOut2 = NULL;
}

//////////////////////////////

void LuxCoreDisplayContext::init(LuxCoreSceneExporter *pParent, qlib::OutStream *pOut)
{
  super_t::init();

  m_pParent = pParent;
  m_pOut = pOut;
  
  LString base = m_pParent->m_sAbsOutBase;
  LString secnm = getSecName();
  m_scnName = base + ".scn";
  LOG_DPRINTLN("output scn = %s", m_scnName.c_str());

  qlib::FileOutStream *pOut2 = MB_NEW qlib::FileOutStream();
  pOut2->open(m_scnName);

  m_pOut2 = pOut2;
}

void LuxCoreDisplayContext::startRender()
{
  writeHeader();
}

void LuxCoreDisplayContext::endRender()
{
  if (m_pOut==NULL)
    return;

  writeTailer();

  if (m_pOut!=NULL) {
    m_pOut->close();
    delete m_pOut;
  }
  m_pOut = NULL;

  if (m_pOut2!=NULL) {
    m_pOut2->close();
    delete m_pOut2;
  }
  m_pOut2 = NULL;
}

//////////////////////////////

void LuxCoreDisplayContext::startSection(const LString &name)
{
  if (m_pIntData!=NULL) {
    MB_THROW(qlib::RuntimeException, "Invalid start section call for LuxCoreDisplayContext");
    return ;
  }

  // create RendIntData (m_pIntData), etc.
  super_t::startSection(name);
}

void LuxCoreDisplayContext::endSection()
{
  if (m_pIntData==NULL) {
    MB_THROW(qlib::RuntimeException, "Invalid end section call for LuxCoreDisplayContext");
    return ;
  }
  m_pIntData->end();

  // Write this section's objects
  writeObjects();

  // m_data.forceSet(m_pIntData->m_name, m_pIntData);
  // m_pIntData = NULL;
  
  // cleanup RendIntData
  super_t::endSection();
}

//////////////////////////////

void LuxCoreDisplayContext::writeHeader()
{
  SceneManager *pmod = SceneManager::getInstance();
  LString ver = LString::format("Version %d.%d.%d.%d (build %s)",
                                pmod->getMajorVer(),pmod->getMinorVer(),
                                pmod->getRevision(),pmod->getBuildNo(),
                                pmod->getBuildID().c_str());

  int width = m_pParent->getWidth();
  int height = m_pParent->getHeight();

  double zoomy = m_dZoom;
  double zoomx = zoomy * double(width) / double(height);
  double fovx = qlib::toDegree(::atan((zoomx/2.0)/m_dViewDist))*2.0;
  double fovy = qlib::toDegree(::atan((zoomy/2.0)/m_dViewDist))*2.0;

  double fov;
  if (height<width)
    fov = fovy;
  else
    fov = fovx;

  bool bPerspec = isPerspective();

  if (bPerspec) {
    if (fov<10.0) {
      // fov is too small --> change to orthographic
      bPerspec = false;
    }
  }

  PrintStream ps(*m_pOut);
  
  ps.format("# CueMol %s LuxCore exporter output\n", ver.c_str());
  ps.format("\n");

  StyleMgr *pSM = StyleMgr::getInstance();

  //LString preamble = pSM->getConfig("luxcore", "preamble").trim(" \r\t\n");
  //if (!preamble.isEmpty())
  //ps.println(preamble);

  PrintStream ps2(*m_pOut2);
  
  // write film cfg
  ps.format("\n");
  //ps.format("Film \"fleximage\"\n");
  ps.format("film.height = %d\n", width);
  ps.format("film.width = %d\n", height);
  ps.format("image.filename = %s.png\n", m_pParent->m_sRelOutBase.c_str());

  //ps.format("     \"bool premultiplyalpha\" [\"true\"]\n");
  //ps.format("     \"bool write_png\" [\"true\"]\n");
  //ps.format("     \"bool write_exr\" [\"true\"]\n");
  //ps.format("     \"string write_png_channels\" [\"RGBA\"]\n");
  //ps.format("     \"integer displayinterval\" [1]\n");
  //ps.format("     \"integer writeinterval\" [60]\n");
  


  // write camera
  LString scmt_pers, scmt_orth;
  if (bPerspec)  {
    scmt_pers = "";
    scmt_orth = "# ";
  }
  else {
    scmt_orth = "";
    scmt_pers = "# ";
  }
  
  ps2.println("scene.camera.up = 0 1 0");
  ps2.println("scene.camera.lookat.target = 0 0 0");
  
  // perspective mode
  ps2.println(scmt_pers+"scene.camera.type = \"perspective\"");
  ps2.format(scmt_pers+"scene.camera.lookat.orig = 0 0 %f\n", m_dViewDist);
  ps2.format(scmt_pers+"scene.camera.fieldofview = %f\n", fov);
  //ps2.format(scmt_pers+"scene.camera.hither = %f\n", m_dViewDist-m_dSlabDepth/2.0);
  
  // orthographic mode
  ps2.println(scmt_orth+"scene.camera.type = \"orthographic\"");
  ps2.format(scmt_orth+"scene.camera.lookat.orig = 0 0 %f\n", m_dSlabDepth/2.0);
  ps2.format(scmt_orth+"scene.camera.screenwindow = %f %f %f %f\n",
             -zoomx/2.0, zoomx/2.0, -zoomy/2.0, zoomy/2.0);


  // overwrite perspec flag
  setPerspective(bPerspec);
}

void LuxCoreDisplayContext::writeTailer()
{
}

/// Write light sources, etc
void LuxCoreDisplayContext::writeLights(PrintStream &ps)
{
}

void LuxCoreDisplayContext::writeObjects()
{
  PrintStream ps(*m_pOut);

  // write material/texture section
  writeMaterials(ps);

  //ps.format("AttributeBegin # Object %s\n", getSecName().c_str());

  // write lines
  writeLines(ps);

  // convert sphere to mesh
  m_pIntData->convSpheres();
  // convert cylinder to mesh
  m_pIntData->convCylinders();
  // write meshes
  writeMeshes(ps);

}

void LuxCoreDisplayContext::writeMaterials(PrintStream &ps)
{
}

bool LuxCoreDisplayContext::writeCylXform(PrintStream &ps,
					  const Vector4D &v1, const Vector4D &v2,
					  double &rlen)
{
  return true;
}

void LuxCoreDisplayContext::writeSpheres(PrintStream &ps)
{
}

void LuxCoreDisplayContext::writeCyls(PrintStream &ps)
{
}

void LuxCoreDisplayContext::writeMeshes(PrintStream &ps)
{
  Mesh *pMesh = &m_pIntData->m_mesh;
  int i;
  int nverts = pMesh->getVertexSize();
  int nfaces = pMesh->getFaceSize();

  LOG_DPRINTLN("verts=%d, faces=%d", nverts, nfaces);

  if (nverts<=0 || nfaces<=0)
    return;

  LString base = m_pParent->m_sAbsOutBase;
  LString secnm = getSecName();
  LString ply_name = base + secnm + ".ply";
  LOG_DPRINTLN("Mesh output ply = %s", ply_name.c_str());

  qlib::FileOutStream out2;
  out2.open(ply_name);
  PrintStream ps2(out2);

  ps2.println("ply");
  ps2.println("format ascii 1.0");
  ps2.println("comment Created by XXX");

  ps2.format("element vertex %d\n", nverts);
  ps2.println("property float x");
  ps2.println("property float y");
  ps2.println("property float z");
  ps2.println("property float nx");
  ps2.println("property float ny");
  ps2.println("property float nz");
  ps2.println("property uchar red");
  ps2.println("property uchar green");
  ps2.println("property uchar blue");

  ps2.format("element face %d\n", nfaces);
  ps2.println("property list uchar uint vertex_indices");
  ps2.println("end_header");

  //for (i=0; i<nverts; i++) {
  BOOST_FOREACH (MeshVert *p, pMesh->m_verts) {
    // Vertex
    if (!qlib::isFinite(p->v.x()) ||
        !qlib::isFinite(p->v.y()) ||
        !qlib::isFinite(p->v.z())) {
      LOG_DPRINTLN("LuxCoreDisplayContext> ERROR: invalid mesh vertex");
      ps2.print("0 0 0 ");
    }
    else {
      ps2.format("%f %f %f ", p->v.x(), p->v.y(), p->v.z());
    }
    
    // Normal
    if (!qlib::isFinite(p->n.x()) ||
        !qlib::isFinite(p->n.y()) ||
        !qlib::isFinite(p->n.z())) {
      LOG_DPRINTLN("LuxCoreDisplayContext> ERROR: invalid mesh vertex");
      ps2.print("1 0 0 ");
    }
    else {
      ps2.format("%f %f %f ", p->n.x(), p->n.y(), p->n.z());
    }

    // Color
    ps2.print("255 255 255\n");
  }

  //for (i=0; i<nfaces; i++) {
  BOOST_FOREACH (const MeshFace &p, pMesh->m_faces) {
    ps2.format("3 %d %d %d\n", p.iv1, p.iv2, p.iv3);
  }

  out2.close();

}

void LuxCoreDisplayContext::writeLines(PrintStream &ps)
{
}

/////////////////////////////////////////////////////////////

void LuxCoreDisplayContext::writeSilEdges(PrintStream &ps)
{
}

void LuxCoreDisplayContext::writeEdgeLineImpl(PrintStream &ps, int xa1, int xa2,
					     const Vector4D &x1, const Vector4D &n1,
					     const Vector4D &x2, const Vector4D &n2)
{
}

void LuxCoreDisplayContext::writePointImpl(PrintStream &ps,
					   const Vector4D &x1,
					   const Vector4D &n1,
					   int alpha)
{
}

