// -*-Mode: C++;-*-
//
//  Triangle mesh object
//  $Id: Mesh.cpp,v 1.3 2011/04/07 07:56:47 rishitani Exp $
//

#include <common.h>

#include "Mesh.hpp"
#include "GradientColor.hpp"

using namespace gfx;
using qlib::Vector4D;

namespace {
  const Mesh::VertCol NO_VERTCOL = { Mesh::NO_COLOR, Mesh::NO_COLOR, 0.0 };
}

Mesh::Mesh()
     : m_nVerts(0), m_nFaces(0),
       m_curCol(NO_VERTCOL),
       m_lastCid1(NO_COLOR), m_lastCid2(NO_COLOR)
{
  m_palMats.push_back(LString());
}

Mesh::~Mesh()
{
}

void Mesh::init(int nverts, int nfaces)
{
  m_nVerts = nverts;
  m_nFaces = nfaces;
  m_verts = std::vector<float>(nverts*3);
  m_norms = std::vector<float>(nverts*3);
  // One record per vertex, marked "never coloured" until setVertex() runs.
  // The palette is left alone: color() may legitimately precede init().
  m_vcols.assign(nverts, NO_VERTCOL);
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
  MB_ASSERT(i*3+3<=m_verts.size());
  MB_ASSERT(i<m_nVerts);
  m_verts[i*3+0] = (float) v.x();
  m_verts[i*3+1] = (float) v.y();
  m_verts[i*3+2] = (float) v.z();
  
  m_norms[i*3+0] = (float) m_curNorm.x();
  m_norms[i*3+1] = (float) m_curNorm.y();
  m_norms[i*3+2] = (float) m_curNorm.z();
  
  m_vcols[i] = m_curCol;
}

quint32 Mesh::palIndex(const ColorPtr &pc)
{
  // The object itself is already in the palette: renderers hand the same
  // colour objects in again and again (per atom, per ramp stop).
  const AbstractColor *praw = pc.get();
  auto pi = m_palPtrIndex.find(praw);
  if (pi!=m_palPtrIndex.end())
    return pi->second;

  // Otherwise look it up by value, so a colour created afresh for every
  // vertex (a modified molecule colour, for instance) still collapses into
  // one entry. This is the same identity the exporters' colour table uses.
  const quint32 code = pc->getCode();
  const LString mat = pc->getMaterial();
  quint32 imat = 0;
  if (!mat.isEmpty()) {
    imat = NO_COLOR;
    for (size_t k=1; k<m_palMats.size(); ++k) {
      if (m_palMats[k].equals(mat)) {
        imat = (quint32) k;
        break;
      }
    }
    if (imat==NO_COLOR) {
      imat = (quint32) m_palMats.size();
      m_palMats.push_back(mat);
    }
  }
  const quint64 key = (quint64(imat) << 32) | quint64(code);
  auto vi = m_palIndex.find(key);
  if (vi!=m_palIndex.end()) {
    // Equal in value but a different object. It is not retained, so its
    // address must not be indexed: once freed, a new object could reuse it.
    return vi->second;
  }

  const quint32 idx = (quint32) m_palette.size();
  m_palette.push_back(pc);
  m_palIndex.emplace(key, idx);
  m_palPtrIndex.emplace(praw, idx);
  return idx;
}

void Mesh::color(const ColorPtr &c)
{
  if (c.isnull()) {
    m_pCurCol = ColorPtr();
    m_curCol = NO_VERTCOL;
    return;
  }

  // m_pCurCol retains the previous object, so an equal address here really
  // is the same object.
  if (!m_pCurCol.isnull() && c.get()==m_pCurCol.get())
    return;
  m_pCurCol = c;

  qlib::LScrSp<GradientColor> pGrad(c, qlib::no_throw_tag());
  if (pGrad.isnull()) {
    m_curCol.cid1 = palIndex(c);
    m_curCol.cid2 = NO_COLOR;
    m_curCol.rho = 0.0;
    return;
  }

  const ColorPtr pc1 = pGrad->getGradColor1();
  const ColorPtr pc2 = pGrad->getGradColor2();
  if (pc1.isnull() || pc2.isnull()) {
    // A gradient without components has no colour (getCode() would throw).
    m_curCol = NO_VERTCOL;
    return;
  }

  // m_pLastC1/C2 retain the previous components, so comparing addresses is
  // safe here too. A ramp resolves every interior vertex through this.
  if (m_pLastC1.isnull() ||
      pc1.get()!=m_pLastC1.get() || pc2.get()!=m_pLastC2.get()) {
    m_lastCid1 = palIndex(pc1);
    m_lastCid2 = palIndex(pc2);
    m_pLastC1 = pc1;
    m_pLastC2 = pc2;
  }
  m_curCol.cid1 = m_lastCid1;
  m_curCol.cid2 = m_lastCid2;
  m_curCol.rho = pGrad->getGradParam();
}

bool Mesh::getCol(ColorPtr &rc, int iv) const
{
  if (iv<0 || iv>=m_nVerts)
    return false;

  const VertCol &vc = m_vcols[iv];
  if (vc.cid1==NO_COLOR)
    return false;

  if (vc.cid2==NO_COLOR) {
    rc = m_palette[vc.cid1];
    return true;
  }

  // Same components, same parameter: getCode(), getDevCode() and
  // getMaterial() of this object match the one color() was given.
  rc = ColorPtr(MB_NEW GradientColor(m_palette[vc.cid1], m_palette[vc.cid2], vc.rho));
  return true;
}
