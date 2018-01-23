// -*-Mode: C++;-*-
//
//  Triangle mesh object
//  $Id: Mesh.cpp,v 1.3 2011/04/07 07:56:47 rishitani Exp $
//

#include <common.h>

#include "Mesh.hpp"

using namespace gfx;
using qlib::Vector4D;

Mesh::~Mesh()
{
}

void Mesh::init(int nverts, int nfaces)
{
  m_nVerts = nverts;
  m_nFaces = nfaces;
  m_verts = std::vector<float>(nverts*3);
  m_norms = std::vector<float>(nverts*3);
  m_colptrs = std::vector<ColorPtr>(nverts*3);
  m_faces = std::vector<int>(nfaces*3);
}

bool Mesh::reduce(int nverts, int nfaces)
{
  if (m_nVerts<nverts || m_nFaces<nfaces)
    return false;
  m_nVerts = nverts;
  m_nFaces = nfaces;
  return true;
}

void Mesh::setVertex(int i, const Vector4D &v)
{
  //MB_ASSERT(m_pVerts!=NULL);
  MB_ASSERT(i*3+3<=m_verts.size());
  MB_ASSERT(i<m_nVerts);
  m_verts[i*3+0] = (float) v.x();
  m_verts[i*3+1] = (float) v.y();
  m_verts[i*3+2] = (float) v.z();
  
  m_norms[i*3+0] = (float) m_curNorm.x();
  m_norms[i*3+1] = (float) m_curNorm.y();
  m_norms[i*3+2] = (float) m_curNorm.z();
  
  m_colptrs[i] = m_pCurCol;
  
  //m_pCols[i].cid2 = m_curCol.cid2;
  //m_pCols[i].rho = m_curCol.rho;
}

void Mesh::color(const ColorPtr &c)
{
  m_pCurCol = c;
  //m_curCol = m_clut.newColor(c, c->getMaterial());
}

/*void Mesh::color(const ColorPtr &c, const LString &mtr)
{
  m_curCol = m_clut.newColor(c, mtr);
}*/

bool Mesh::getCol(ColorPtr &rc, int iv) const
{
  if (iv>m_nVerts)
    return false;

  rc = m_colptrs[iv];
  return true;
  //const IntColor &id = m_pCols[iv];
  //return m_clut.getColor(id, rc);
}

bool Mesh::convRGBAByteCols(quint8 *pcols, int nsize, int defalpha/*=255*/, qlib::uid_t nSceneID) const
{
  int i;
  quint32 ccode;
  ColorPtr pcol;

  if (nsize<m_nVerts*4)
    return false;

  for (i=0; i<m_nVerts; ++i) {
    pcol = m_colptrs[i];
    if (nSceneID!=qlib::invalid_uid)
      ccode = pcol->getDevCode(nSceneID);
    else
      ccode = pcol->getCode();

    quint8 *pelem = &pcols[i*4];
    pelem[0] = getRCode(ccode);
    pelem[1] = getGCode(ccode);
    pelem[2] = getBCode(ccode);
    pelem[3] = getACode(ccode);

    /*
    const IntColor &id = m_pCols[i];
    bool res = m_clut.getRGBAByteColor(id, pelem);
    if (!res)
      return false;
     */

    if (defalpha!=255) {
      int blended = (int(pelem[3]) * defalpha)/255;
      if (blended>255) blended = 255;
      if (blended<0) blended = 0;
      pelem[3] = (quint8)(blended);
    }

  }

  return true;
}

