// -*-Mode: C++;-*-
//
//  CPK molecular renderer class
//
//  $Id: CPKRenderer.hpp,v 1.6 2011/03/29 11:03:44 rishitani Exp $

#ifndef CPK_RENDERER_HPP_INCLUDED
#define CPK_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include <modules/molstr/MolAtomRenderer.hpp>

// namespace molstr { class MolCoord; }

class CPKRenderer_wrap;

namespace molvis {

using namespace molstr;
using gfx::DisplayContext;

class MOLVIS_API CPKRenderer : public MolAtomRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  friend class ::CPKRenderer_wrap;

private:

  double m_vdwr_H;
  double m_vdwr_C;
  double m_vdwr_N;
  double m_vdwr_O;
  double m_vdwr_S;
  double m_vdwr_P;
  double m_vdwr_X;

  /// Detail of mesh rendering
  int m_nDetail;

  int m_nDetailOld;

public:
  CPKRenderer();
  virtual ~CPKRenderer();

  virtual const char *getTypeName() const;

  //////////////////////////////////////////////////////

  virtual bool isRendBond() const;
  
  virtual void beginRend(DisplayContext *pdl);
  virtual void endRend(DisplayContext *pdl);

  virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded);
  virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB);

  //////////////////////////////////////////////////////
  // properties

  virtual void propChanged(qlib::LPropEvent &ev);

  int getDetail() const { return m_nDetail; }
  void setDetail(int n) { m_nDetail = n; }

private:
  double getVdWRadius(MolAtomPtr pAtom);
};

}

#endif

