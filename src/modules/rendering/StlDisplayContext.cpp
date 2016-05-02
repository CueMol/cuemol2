// -*-Mode: C++;-*-
//
//  STL (Stereolithography) Display context implementation class
//

#include <common.h>

#include "StlDisplayContext.hpp"
#include "RendIntData.hpp"
#include <qlib/PrintStream.hpp>
#include <qlib/BinStream.hpp>
#include <qlib/Utils.hpp>
#include <gfx/SolidColor.hpp>

using namespace render;

using qlib::PrintStream;
using qlib::BinOutStream;
//using qlib::Matrix4D;
using qlib::Matrix3D;
using qlib::MapPtrTable;

StlDisplayContext::StlDisplayContext()
     : FileDisplayContext()
{
}

StlDisplayContext::~StlDisplayContext()
{
  m_data.clearAndDelete();
}

//////////////////////////////

void StlDisplayContext::init(qlib::OutStream *pStlOut)
{
  clearMatStack();

  pushMatrix();
  loadIdent();
  m_linew = 1.0;
//  m_color = LColor();
  m_nDrawMode = POV_NONE;
  m_fPrevPosValid = false;
  m_nTriIndex = 0;
  m_dZoom = 100;
  m_dViewDist = 100;
  m_dSlabDepth = 100;

  if (m_pIntData!=NULL)
    delete m_pIntData;
  m_pIntData = NULL;

  m_pStlOut = pStlOut;
}

void StlDisplayContext::startRender()
{
  writeHeader();
}

void StlDisplayContext::endRender()
{
  if (m_pStlOut==NULL)
    return;

  qint32 nfaces = 0;

  qlib::MapPtrTable<RendIntData>::iterator iter = m_data.begin();
  qlib::MapPtrTable<RendIntData>::iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    RendIntData *pDat = iter->second;
    pDat->convLines();
    pDat->convDots();
    pDat->convSpheres();
    pDat->convCylinders();
    nfaces += pDat->m_mesh.getFaceSize();
  }
  
  m_pStlOut->write((const char *)&nfaces, 0, sizeof(qint32));

  iter = m_data.begin();
  // eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    RendIntData *pDat = iter->second;
    writeMeshes(pDat);
  }

  m_pStlOut->close();
}

//////////////////////////////

void StlDisplayContext::startSection(const LString &name)
{
  if (m_pIntData!=NULL) {
    MB_THROW(qlib::RuntimeException, "Invalid start section call for StlDisplayContext");
    return ;
  }
  m_pIntData = MB_NEW RendIntData(this);
  m_pIntData->start(name);
}

void StlDisplayContext::endSection()
{
  // End of rendering
  if (m_pIntData==NULL) {
    MB_THROW(qlib::RuntimeException, "Invalid end section call for StlDisplayContext");
    return ;
  }
  m_pIntData->end();
  m_data.forceSet(m_pIntData->m_name, m_pIntData);
  m_pIntData = NULL;
}

//////////////////////////////

void StlDisplayContext::writeHeader()
{
  double fovy = qlib::toDegree(::atan((m_dZoom/2.0)/m_dViewDist))*2.0;

  // 80-byte header
  for (int i=0; i<80; ++i)
    m_pStlOut->write(0);

}

void StlDisplayContext::writeMeshes(RendIntData *pDat)
{
  int i, j;

  const int nverts = pDat->m_mesh.getVertexSize();
  const int nfaces = pDat->m_mesh.getFaceSize();

  if (nverts<=0 || nfaces<=0)
    return;
  
  // Convert mesh list to array
  MeshVert **pmary = new MeshVert *[nverts];
  std::deque<MeshVert *>::iterator iter = pDat->m_mesh.m_verts.begin();
  std::deque<MeshVert *>::iterator eiter = pDat->m_mesh.m_verts.end();
  for (i=0; iter!=eiter; iter++, i++)
    pmary[i] = *iter;

  /////////////////////
  // Write faces

  BinOutStream bos(*m_pStlOut);

  Mesh::FCIter iter2 = pDat->m_mesh.m_faces.begin();
  Mesh::FCIter eiter2 = pDat->m_mesh.m_faces.end();
  for (i=0; iter2!=eiter2; iter2++, i++) {
    int i1 = iter2->iv1;
    int i2 = iter2->iv2;
    int i3 = iter2->iv3;
    
    Vector4D v1 = pmary[i1]->v;
    Vector4D v2 = pmary[i2]->v;
    Vector4D v3 = pmary[i3]->v;

    Vector4D v12 = v2 - v1;
    Vector4D v23 = v3 - v2;
    Vector4D n1 = v12.cross(v23).normalize();
    bos.writeFloat32(n1.x());
    bos.writeFloat32(n1.y());
    bos.writeFloat32(n1.z());

    bos.writeFloat32(v1.x());
    bos.writeFloat32(v1.y());
    bos.writeFloat32(v1.z());

    bos.writeFloat32(v2.x());
    bos.writeFloat32(v2.y());
    bos.writeFloat32(v2.z());

    bos.writeFloat32(v3.x());
    bos.writeFloat32(v3.y());
    bos.writeFloat32(v3.z());

    bos.writeInt16(0);
  }

  // clean up
  delete [] pmary;
}

