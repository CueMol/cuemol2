// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: SurfTgSet.hpp,v 1.1 2011/02/11 06:55:18 rishitani Exp $

#ifndef SURF_TG_SET_HPP_INCLUDED_
#define SURF_TG_SET_HPP_INCLUDED_

#include <qlib/Vector4D.hpp>
#include "MolSurfObj.hpp"

namespace gfx {
  class DisplayContext;
}

namespace surface {

  using qlib::Vector4D;
  using gfx::DisplayContext;

class SurfTgSet
{
public:
  SurfTgSet() {}

  ~SurfTgSet() {}
  
  std::deque<MSVert> m_verteces;
  std::deque<MSFace> m_faces;

public:

  int addVertex(const MSVert &msv)
  {
    int i = m_verteces.size();
    m_verteces.push_back(msv);
    return i;
  }

  int addVertex(const Vector4D &pos, const Vector4D &nrm)
  {
    int i = m_verteces.size();
    m_verteces.push_back(MSVert(pos, nrm));
    return i;
  }

  int addVertex(const Vector4D &pos)
  {
    int i = m_verteces.size();
    m_verteces.push_back(MSVert(pos));
    return i;
  }
  
  int addFace(int iv1, int iv2, int iv3)
  {
    int i = m_faces.size();
    m_faces.push_back(MSFace(iv1, iv2, iv3));
    return i;
  }

  Vector4D getVertex(int i) const
  {
    return m_verteces[i].v3d();
  }
  
  Vector4D getNorm(int i) const
  {
    return m_verteces[i].n3d();
  }
  
  void setNorm(int i, const Vector4D &n)
  {
    m_verteces[i].nx = (float) n.x();
    m_verteces[i].ny = (float) n.y();
    m_verteces[i].nz = (float) n.z();
  }
  
  void draw(DisplayContext *pdl);
  void drawIndex(DisplayContext *pdl, int iv, int ishow);
};

}

#endif // SURF_TG_SET_HPP_INCLUDED_

