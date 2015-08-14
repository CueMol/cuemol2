// -*-Mode: C++;-*-
//
//  display context implementation
//

#include <common.h>

#include "LWRendDisplayContext.hpp"
#include "LWRenderer.hpp"
#include "LWObject.hpp"

#include <qlib/PrintStream.hpp>
#include <qlib/Utils.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/DrawElem.hpp>
#include <gfx/TextRenderManager.hpp>
#include <gfx/PixelBuffer.hpp>
#include <qsys/SceneManager.hpp>

#include <modules/molstr/MolAtom.hpp>

using namespace lwview;

using render::RendIntData;
using qlib::PrintStream;
using qlib::Matrix4D;
using qlib::Matrix3D;
using gfx::ColorPtr;
using gfx::DrawElem;

LWRendDisplayContext::LWRendDisplayContext()
     : FileDisplayContext(), m_pRend(NULL)
{
}

LWRendDisplayContext::~LWRendDisplayContext()
{
  m_data.clearAndDelete();
}

bool LWRendDisplayContext::isFile() const
{
  return false;
}

//////////////////////////////

void LWRendDisplayContext::startSection(const LString &section_name)
{
  super_t::startSection(section_name);
  RendIntData *pIntData = super_t::getIntData();
  if (pIntData!=NULL)
    pIntData->m_name = section_name;
}

void LWRendDisplayContext::endSection()
{
  // End of rendering
  RendIntData *pIntData = super_t::getIntData();
  if (pIntData==NULL) {
    MB_THROW(qlib::RuntimeException, "Invalid end section call for LWRendDisplayContext");
    return ;
  }
  pIntData->end();
  m_data.forceSet(pIntData->m_name, pIntData);

  super_t::resetIntData();
}

//////////////////////////////

void LWRendDisplayContext::init(LWRenderer *pRend, LWObject *pObj)
{
  m_pRend = pRend;
  m_pObj = pObj;
  super_t::init();
}

void LWRendDisplayContext::startRender()
{
}

void LWRendDisplayContext::endRender()
{
  IntDataMap::const_iterator iter;

  for (iter = m_data.begin(); iter!=m_data.end(); ++iter) {
    RendIntData *pDat = iter->second;
    pDat->convSpheres();
    pDat->convCylinders();
  }

  for (iter = m_data.begin(); iter!=m_data.end(); ++iter)
    writeObject(iter->second);

  writePixelData();

  const int nelems = m_deList.size();
  m_pRend->allocData(nelems);
  int i=0;
  BOOST_FOREACH (DrawElem *pElem, m_deList) {
    m_pRend->setDrawElem(i, pElem);
    ++i;
  }
  
  m_deList.clear();
}

//////////////////////////////

void LWRendDisplayContext::startHit(qlib::uid_t rend_uid)
{
  qsys::RendererPtr pHitRend = qsys::SceneManager::getRendererS(rend_uid);
  molstr::MolCoordPtr pMol(pHitRend->getClientObj(), qlib::no_throw_tag());
  m_pMol = pMol.get();

  m_hitIndices.clear();
}

void LWRendDisplayContext::drawPointHit(int nid, const Vector4D &pos)
{
  if (m_pMol==NULL) return;
  molstr::MolAtomPtr pAtom = m_pMol->getAtom(nid);
  if (pAtom.isnull()) return;
  LString msg = pAtom->formatMsg();

  int index = m_pObj->addPointHit(nid, pos, msg);
  m_hitIndices.push_back(index);
  // MB_DPRINTLN("(%d, %s) => %d", nid, msg.c_str(), index);
}

void LWRendDisplayContext::endHit()
{
  // make hitdata index array for renderer
  m_pRend->setHitIndexSize(m_hitIndices.size());
  int i=0;
  //MB_DPRINTLN("LWRendDispCtxt> hitind for rend %d:", m_pRend->getUID());
  BOOST_FOREACH (int elem, m_hitIndices) {
    m_pRend->setHitIndex(i, elem);
    ++i;
    // MB_DPRINT("%d,", elem);
  }
  // MB_DPRINTLN("");
  m_hitIndices.clear();

  m_pMol = NULL;
}

//////////////////////////////

void LWRendDisplayContext::writeObject(RendIntData *pDat)
{
  writeDots(pDat);
  writeLines(pDat);
  writeMeshes(pDat);
}

void LWRendDisplayContext::writeDots(RendIntData *pDat)
{
  const int ndots = pDat->m_dots.size();
  if (ndots==0)
    return;
  
  // check color variability
  ColorPtr pcol;
  int i=0;
  quint32 prev_code;
  bool bEqual=true;
  BOOST_FOREACH (RendIntData::Sph *p, pDat->m_dots) {
    // Get color
    pDat->m_clut.getColor(p->col, pcol);
    quint32 code = pcol->getCode();
    if (i>0) {
      if (prev_code!=code) {
        bEqual = false;
        break;
      }
    }
    prev_code = code;
    ++i;
  }  

  DrawElem *pVary;
  if (bEqual) {
    pVary = new gfx::DrawElemV();
    pVary->setDefColor(prev_code);
  }
  else {
    pVary = new gfx::DrawElemVC();
  }

  pVary->startPoints(ndots);

  int calpha = int(getAlpha()* 255.0 + 0.5);

  const int nverts = pDat->m_dots.size();
  LOG_DPRINTLN("QSLWriter> Dot(%s) vertex size = %d", pDat->m_name.c_str(), nverts);
  if (nverts>65535) {
    // LOG_DPRINTLN("QSL generation error> Dot vertex size (%d) exceeds 16bit limit", nverts);
    LOG_DPRINTLN("QSLWriter> Warning: Dot(%s) vertex size %d exceeds 16bit limit",
                 pDat->m_name.c_str(), nverts);
  }

  i=0;
  BOOST_FOREACH (RendIntData::Sph *p, pDat->m_dots) {
    if (i==0)
      pVary->setLineWidth((float) p->r);

    // Get color
    pDat->m_clut.getColor(p->col, pcol);
    quint32 cc = pcol->getCode();

    pVary->vertex(i, p->v1);
    pVary->color(i, mulAlpha(cc, calpha));
    ++i;

    delete p;
  }  
  pDat->m_dots.erase(pDat->m_dots.begin(), pDat->m_dots.end());

  appendDrawElem(pVary);
}

void LWRendDisplayContext::writeLines(RendIntData *pDat)
{
  const int nlines = pDat->m_lines.size();
  if (nlines==0)
    return;
  
  // check color variability
  ColorPtr pcol;
  int i=0;
  quint32 prev_code;
  bool bEqual=true;
  BOOST_FOREACH (RendIntData::Line *p, pDat->m_lines) {
    // Get color
    pDat->m_clut.getColor(p->col, pcol);
    quint32 code = pcol->getCode();
    if (i>0) {
      if (prev_code!=code) {
        bEqual = false;
        break;
      }
    }
    prev_code = code;
    ++i;
  }  

  DrawElem *pVary;
  if (bEqual) {
    pVary = new gfx::DrawElemV();
    pVary->setDefColor(prev_code);
  }
  else {
    pVary = new gfx::DrawElemVC();
  }

  pVary->startLines(nlines*2);

  int calpha = int(getAlpha()* 255.0 + 0.5);

  const int nverts = pDat->m_lines.size() * 2;
  LOG_DPRINTLN("QSLWriter> Line(%s) vertex size = %d", pDat->m_name.c_str(), nverts);
  if (nverts>65535) {
    LOG_DPRINTLN("QSLWriter> Warning: Line(%s) vertex size %d exceeds 16bit limit",
                 pDat->m_name.c_str(), nverts);
  }

  i=0;
  BOOST_FOREACH (RendIntData::Line *p, pDat->m_lines) {
    if (i==0)
      pVary->setLineWidth((float) p->w);

    // Get color
    pDat->m_clut.getColor(p->col, pcol);
    quint32 cc = pcol->getCode();

    pVary->vertex(i, p->v1);
    pVary->color(i, mulAlpha(cc, calpha));
    ++i;
    pVary->vertex(i, p->v2);
    pVary->color(i, mulAlpha(cc, calpha));
    ++i;

    delete p;
  }  
  pDat->m_lines.erase(pDat->m_lines.begin(), pDat->m_lines.end());

  appendDrawElem(pVary);
}

void LWRendDisplayContext::writeMesh(RendIntData *pDat, render::Mesh &mesh)
{
  int i, j;
  ColorPtr pcol;
//  RendIntData *pDat = mesh.m_pPar;

  const int nverts = mesh.getVertexSize();
  const int nfaces = mesh.getFaceSize();

  gfx::DrawElemVNCI *pVary = MB_NEW gfx::DrawElemVNCI();
  pVary->startIndexTriangles(nverts, nfaces);

  int calpha = int(getAlpha()* 255.0 + 0.5);

  render::Mesh::VCIter iter = mesh.m_verts.begin();
  render::Mesh::VCIter eiter = mesh.m_verts.end();
  for (i=0; iter!=eiter; iter++, i++) {
    render::MeshVert *pp = *iter;
    pDat->m_clut.getColor(pp->c, pcol);
    quint32 cc = pcol->getCode();
    pVary->color(i, mulAlpha(cc, calpha));
    pVary->normal(i, pp->n);
    pVary->vertex(i, pp->v);
  }
  
  // write face_indices
  render::Mesh::FCIter iter2 = mesh.m_faces.begin();
  render::Mesh::FCIter eiter2 = mesh.m_faces.end();
  for (i=0; iter2!=eiter2;) {
    quint32 n1 = quint32(iter2->iv1);
    quint32 n2 = quint32(iter2->iv2);
    quint32 n3 = quint32(iter2->iv3);
    ++iter2;

    pVary->setIndex3(i, n1, n2, n3);
    ++i;
    //if (ui1==ui2 || ui2==ui3 || ui1==ui3)
    //continue;
  }

  MB_DPRINTLN("written nverts=%d", nverts);
  MB_DPRINTLN("written nfaces=%d", nfaces);

  appendDrawElem(pVary);
}

//#define NVERTS_MAX 1024
#define NVERTS_MAX 0xFFFF

void LWRendDisplayContext::writeMeshes(RendIntData *pDat)
{
  {
    const int nverts = pDat->m_mesh.getVertexSize();
    const int nfaces = pDat->m_mesh.getFaceSize();
    if (nverts<=0 || nfaces<=0)
      return;
  }

  const bool bLite = pDat->m_mesh.m_bLighting;
  render::Mesh *pMesh = pDat->simplifyMesh( &pDat->m_mesh );
  const int nverts = pMesh->getVertexSize();
  const int nfaces = pMesh->getFaceSize();

  int i, j;

  LOG_DPRINTLN("QSLWriter> Mesh(%s) nverts=%d, nfaces=%d", pDat->m_name.c_str(), nverts, nfaces);

  if (nverts>=NVERTS_MAX) {
    LOG_DPRINTLN("QSLWriter> Warning: Mesh(%s) vertex size %d exceeds limit(%d)",
                 pDat->m_name.c_str(), nverts, NVERTS_MAX);
    // Divide mesh
    int nvorig = pMesh->getVertexSize();
    std::vector<int> vidmap(nvorig);

    for (i=0; i<nvorig; ++i)
      vidmap[i] = -1;

    render::Mesh *pNewMsh = MB_NEW render::Mesh;
    pNewMsh->m_bLighting = bLite;
    int ndiv = 1;
    
    render::Mesh::FCIter iter2 = pMesh->m_faces.begin();
    render::Mesh::FCIter eiter2 = pMesh->m_faces.end();

    for (i=0; iter2!=eiter2;) {
      if (pNewMsh->getVertexSize()>=NVERTS_MAX-3) {
        // write full mesh
        writeMesh(pDat, *pNewMsh);
        delete pNewMsh;
        // alloc new mesh
        pNewMsh = MB_NEW render::Mesh;
        pNewMsh->m_bLighting = bLite;
        // clear vidmap
        for (i=0; i<nvorig; ++i)
          vidmap[i] = -1;
        ++ndiv;
      }

      int id1 = iter2->iv1;
      int id2 = iter2->iv2;
      int id3 = iter2->iv3;
      ++iter2;    
      
      if (vidmap[id1]<0)
        vidmap[id1] = pNewMsh->copyVertex(pMesh->m_verts[id1]);
      if (vidmap[id2]<0)
        vidmap[id2] = pNewMsh->copyVertex(pMesh->m_verts[id2]);
      if (vidmap[id3]<0)
        vidmap[id3] = pNewMsh->copyVertex(pMesh->m_verts[id3]);

      pNewMsh->addFace(vidmap[id1], vidmap[id2], vidmap[id3]);
    }

    // write remaining mesh
    writeMesh(pDat, *pNewMsh);
    delete pNewMsh;

    LOG_DPRINTLN("QSLWriter> Mesh divided into %d vbos", ndiv);
  }
  else {
    //writeMesh(pDat, pDat->m_mesh);
    writeMesh(pDat, *pMesh);
  }

  delete pMesh;
  pDat->m_mesh.clear();
}

/////////
// drawPixel support

void LWRendDisplayContext::drawPixels(const Vector4D &pos,
                                      const gfx::PixelBuffer &pxdata,
                                      const gfx::ColorPtr &col)
{
  gfx::DrawElemPix *pDat = MB_NEW gfx::DrawElemPix();
  quint32 cc = 0;
  if (col.isnull()) {
    gfx::ColorPtr pDefCol = getCurrentColor();
    if (!pDefCol.isnull())
      cc = pDefCol->getCode();
  }
  else
    cc = col->getCode();

  pDat->setup(pxdata, pos, cc);
  appendDrawElem(pDat);
}

void LWRendDisplayContext::drawString(const Vector4D &pos,
                                      const qlib::LString &str)
{
  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  if (pTRM==NULL) return;

  gfx::PixelBuffer pixbuf;
  if (!pTRM->renderText(str, pixbuf))
    return;

  //gfx::SolidColor col(m_color);
  drawPixels(pos, pixbuf, gfx::ColorPtr());
}

void LWRendDisplayContext::writePixelData()
{
/*
  BOOST_FOREACH (PixelData &elem, m_pixdat) {
    // TO DO: impl
    if (elem.pPixBuf!=NULL)
      delete elem.pPixBuf;
  }    

  m_pixdat.clear();
*/
}

