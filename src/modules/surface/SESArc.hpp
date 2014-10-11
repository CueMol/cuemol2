// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: SESArc.hpp,v 1.1 2011/02/10 14:17:43 rishitani Exp $

#ifndef SES_ARC_HPP_INCLUDED_
#define SES_ARC_HPP_INCLUDED_

#include <gfx/DisplayContext.hpp>

namespace surface {

  class SurfTgSet;
  using gfx::DisplayContext;


/**
  Arc segment of the solvent excluded surface
 */
class SESArc
{
public:
  /** radius of the arc */
  double m_rad;

  /** angle of the arc /i.e. angle((v0-vc).(v1-vc)) */
  double m_th;
  
  /** center of the arc (vc)*/
  Vector4D m_vc;

  /** position of one end (v0)*/
  Vector4D m_v0;

  /** position of the other end (v1)*/
  Vector4D m_v1;

  /** normal vector of the arc */
  Vector4D m_norm;

  /** vertex ID of one end (v0)*/
  int m_idx0;

  /** vertex ID of the other end (v1)*/
  int m_idx1;

  bool m_bRadSngl;
  SESArc *m_pSnglArc;
  int m_nSngSpi;

  //////////////////////

  /** tesselled vertex set */
  std::vector<int> m_verts;

public:
  SESArc();
  ~SESArc();

  /** setup the data structure (other than the m_verts) */
  void setup(const Vector4D &vc, int idx0, int idx1, const SurfTgSet &sts);
  void setup2(const Vector4D &vc, int idx0, int idx1, const SurfTgSet &sts);

  int calcTessLev(double density, int nmindiv) const;
  void makeVerteces(SurfTgSet &sts, const Vector4D &cen, double den);

  /** for debug */
  void draw(DisplayContext *pdl, double den) const;

private:
  void makeVertHelper(std::vector<Vector4D> &verts, double den) const;
  
};

typedef std::deque<SESArc *> SESArcList;

}

#endif // SES_ARC_HPP_INCLUDED_

