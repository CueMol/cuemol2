// -*-Mode: C++;-*-
//
//  Triangle mesh object
//  $Id: Mesh.cpp,v 1.3 2011/04/07 07:56:47 rishitani Exp $
//

#include <common.h>

#include "Mesh.hpp"

using namespace gfx;
using qlib::Vector4D;

void Mesh::setVertex(int i, const Vector4D &v)
{
  MB_ASSERT(m_pVerts!=NULL);
  MB_ASSERT(i<m_nVerts);
  m_pVerts[i*3+0] = (float) v.x();
  m_pVerts[i*3+1] = (float) v.y();
  m_pVerts[i*3+2] = (float) v.z();
  
  m_pNorms[i*3+0] = (float) m_curNorm.x();
  m_pNorms[i*3+1] = (float) m_curNorm.y();
  m_pNorms[i*3+2] = (float) m_curNorm.z();
  
  m_pCols[i].cid1 = m_curCol.cid1;
  m_pCols[i].cid2 = m_curCol.cid2;
  m_pCols[i].rho = m_curCol.rho;
}

void Mesh::color(const ColorPtr &c)
{
  m_curCol = m_clut.newColor(c, c->getMaterial());
}

void Mesh::color(const ColorPtr &c, const LString &mtr)
{
  m_curCol = m_clut.newColor(c, mtr);
}

bool Mesh::getCol(ColorPtr &rc, int iv) const
{
  if (iv>m_nVerts)
    return false;

  const IntColor &id = m_pCols[iv];
  return m_clut.getColor(id, rc);
}

bool Mesh::convRGBAByteCols(unsigned char *pcols, int nsize, int defalpha/*=255*/) const
{
  int i;

  if (nsize<m_nVerts*4)
    return false;

  for (i=0; i<m_nVerts; ++i) {

    const IntColor &id = m_pCols[i];
    unsigned char *pelem = &pcols[i*4];
    bool res = m_clut.getRGBAByteColor(id, pelem);
    if (!res)
      return false;

    if (defalpha!=255) {
      int blended = (int(pelem[3]) * defalpha)/255;
      if (blended>255) blended = 255;
      if (blended<0) blended = 0;
      pelem[3] = (unsigned char)(blended);
    }
  }

  return true;
}

