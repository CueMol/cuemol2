// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: RSCompBuilder.hpp,v 1.2 2011/02/11 06:54:22 rishitani Exp $

#ifndef RS_COMPONENT_BUILDER_HPP_INCLUDED_
#define RS_COMPONENT_BUILDER_HPP_INCLUDED_

#include "surface.hpp"

#ifdef SURF_BUILDER_TEST

#include "MolSurfBuilder.hpp"
#include "RSComponent.hpp"

namespace surface {

  using gfx::DisplayContext;

class RSCompBuilder
{
public:
  
  RSComponent m_rscomp;

private:
  // workarea

  double m_rmax, m_rprobe;

  DisplayContext *m_pdl;
  
  int m_nTrtEdg;
  int m_nRecLev;

  //////////////

  int m_nbx;
  std::vector<int> m_ibuf;
  // index buffer for collision check
  std::vector<int> m_ibufcol;

  MolSurfBuilder *m_pmsb;

public:
  RSCompBuilder(MolSurfBuilder *pmsb);
  ~RSCompBuilder();

  void build();

private:
  RSFace *findFirstFace();
  bool findSecondVertex(int ind_1st, int axisid, TorusParam &rtprm2);

  //bool prepareFindTorus(int ind1, int ind2);
  //int findAroundTorus(int ind1, int ind2);

  bool findThirdVertex(const TorusParam &tprm_12, ConcSphParam &rcsprm123);

  bool collCheckProbePartial(const std::vector<int> &ibuf, int nlen, const Vector4D &prpos,
                             int, int, int);

  void treatFace(RSFace *pFace);
  RSFace *treatEdge(RSFace *pFace, int nord);

  void setupFaceArcs(RSFace *pFace);
  void setupEdgeArcs(RSEdge *pEdge);

  void chkEdgeEaten();

  ///////////////////////////
  // Debug tools
  
  void drawPlane(const ConcSphParam &cs123, DisplayContext *pdl);
  void drawPlane(int i, int j, int k, DisplayContext *pdl);

  void drawRSCompFaces(DisplayContext *pdl);
};

}

#endif // SURF_BUILDER_TEST

#endif // RS_COMPONENT_BUILDER_HPP_INCLUDED_


