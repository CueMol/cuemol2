// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: TgConcSphere.hpp,v 1.1 2011/02/11 06:55:18 rishitani Exp $

#ifndef TG_CONC_SPHERE_HPP_INCLUDED__
#define TG_CONC_SPHERE_HPP_INCLUDED__

#include <qlib/Vector4D.hpp>

namespace gfx {
  class DisplayContext;
}

namespace surface {

  using qlib::Vector4D;
  using gfx::DisplayContext;


class SESArc;
class SESTgBuilder;
class RSFace;
class RSVert;
class TgSphere;
class VgEdgeList;

  //
  //
  //
class TgSpherePadSuper
{
public:
  /** ID mapping (sphere->glob) */
  std::vector<int> m_vidmap;
  std::vector<bool> m_vflag;

  SESTgBuilder *m_pParent;

  const TgSphere *m_pOrigMesh;

  int m_nvmax;
  int m_nfmax;

  /** center of the concave/convex sphere */
  Vector4D m_vcen;

  std::vector<SESArc *> m_arcs;

public:
  TgSpherePadSuper(SESTgBuilder *pprnt, const TgSphere *pmesh)
       : m_pParent(pprnt), m_pOrigMesh(pmesh)
  {}


  // Vector4D calcPlaneNorm(const SESArc *parc);

  void sliceSphere(const Vector4D &norm, const Vector4D &vcen);

  void showVertID(DisplayContext *pdl, int id);

  double distance(int i, int j);
  //double calcCircScrR(int id0, int id1, int id2);
  bool chkConvHull(int id0, int id1, int id2, const std::list<int> &vlst);
  int chkConvHull2(int id0, int id1, int id2, const std::list<int> &vlst);
  // bool chkConvHull(int id0, int id1, int id2, int idt);

  void makeInEdges(VgEdgeList &inedges, const std::list<int> &vlst, bool bdir);
  int searchCHVert(int id0, int id1, const std::list<int> &inner);
  bool chkArcEats(const Vector4D &v0, const Vector4D &v1);

};

/////////////////////////////////////////////

class TgConcSphere : public TgSpherePadSuper
{
public:

  const RSFace *m_pFace;

public:
  TgConcSphere(SESTgBuilder *pprnt, const RSFace *pF, const TgSphere *pmesh)
       : TgSpherePadSuper(pprnt, pmesh), m_pFace(pF)
    {}

  ~TgConcSphere() {}

  void calc();

private:
  

};

////////////////////////////////////////////////////////

class TgCnvxSphere : public TgSpherePadSuper
{
public:
  const RSVert *m_pVert;
  int m_vidx;

public:
  TgCnvxSphere(SESTgBuilder *pprnt, const RSVert *pV, const TgSphere *pmesh)
       : TgSpherePadSuper(pprnt, pmesh), m_pVert(pV)
    {}

  ~TgCnvxSphere() {}

  void calc();

private:

  bool sliceSphereCnvx(int indv);

};

}

#endif

