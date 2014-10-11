// -*-Mode: C++;-*-
//
//  Build a triangulated sphere
//
// $Id: TgSphere.hpp,v 1.1 2011/02/11 06:55:18 rishitani Exp $

#ifndef TG_SPHERE_BUILDER_HPP_INCLUDED__
#define TG_SPHERE_BUILDER_HPP_INCLUDED__

#include "MolSurfObj.hpp"

namespace gfx {
  class DisplayContext;
}

namespace surface {

using gfx::DisplayContext;


class TgSphere
{
public:
  DisplayContext *m_pdl;

  double m_dmax;
  double m_rad;
  
  std::deque<MSVert> m_verts;
  std::deque<MSFace> m_faces;

  bool m_bdir;

  ////////////////////////////////
  
  TgSphere(double rad)
       : m_pdl(NULL), m_dmax(0.15), m_rad(rad)
    {
    }

  TgSphere(double rad, double den)
       : m_pdl(NULL), m_dmax(1.0/den), m_rad(rad)
    {
    }

  void buildVerteces(bool bdir=true);

  void checkConvexHull();

  void drawSphere(DisplayContext *pdl, bool bdir=true);

  ////////////////////////////////

  void buildVertIco(bool bdir=true);
  
  void icoSphSubdiv(int iv1, int iv2, int iv3,
                    int depth);

  ////////////////////////////////
  
private:

  int selectTrig(int j, int k, int j1, int k1);

  int putVert(const Vector4D &pos)
  {
    Vector4D norm = pos.normalize();
    int idx = m_verts.size();
    m_verts.push_back(MSVert(pos, m_bdir?(norm):(-norm)));
    return idx;
  }

  int putFace(int iv1, int iv2, int iv3)
  {
    int i = m_faces.size();
    if (m_bdir)
      m_faces.push_back(MSFace(iv1, iv2, iv3));
    else
      m_faces.push_back(MSFace(iv1, iv3, iv2));
    return i;
  }

  double angle(const Vector4D &v1, const Vector4D &v2)
  {
    const double l1 = v1.length();
    const double l2 = v2.length();
    const double costh = v1.dot(v2)/(l1*l2);
    //return ::acos(costh);
    return -costh;
  }

  double angmax(const Vector4D &v1, const Vector4D &v2, const Vector4D &v3)
  {
    double a1, a2, a3;
    a1 = angle((v2-v1), (v3-v1));
    a2 = angle((v1-v2), (v3-v2));
    a3 = angle((v1-v3), (v2-v3));
    //a3 = M_PI - a1 - a2;

    return qlib::max(a1, qlib::max(a2, a3));
  }

};

} // namespace surface

#endif

