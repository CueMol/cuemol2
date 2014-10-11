// -*-Mode: C++;-*-
//
//  CPK molecular renderer class
//
// $Id: CPKRenderer.cpp,v 1.6 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>
#include "molvis.hpp"

#include "CPKRenderer.hpp"

using namespace molvis;
using namespace molstr;

CPKRenderer::CPKRenderer()
{
  // sig of TIP3P water oxygen
  //  m_probeSig = 2.8509;
}

CPKRenderer::~CPKRenderer()
{
}

const char *CPKRenderer::getTypeName() const
{
  return "cpk";
}

/////////

bool CPKRenderer::isRendBond() const
{
  return false;
}

void CPKRenderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
}

void CPKRenderer::beginRend(DisplayContext *pdl)
{
  //pdl->recordStart();
  m_nDetailOld = pdl->getDetail();
  pdl->setDetail(m_nDetail);
}

void CPKRenderer::endRend(DisplayContext *pdl)
{
  pdl->setDetail(m_nDetailOld);
  //dl->recordEnd();
}

void CPKRenderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
  pdl->color(ColSchmHolder::getColor(pAtom));
  pdl->sphere(getVdWRadius(pAtom), pAtom->getPos());
}

double CPKRenderer::getVdWRadius(MolAtomPtr pAtom)
{

/*
  TopparModule *pTpm = TopparModule::getInstance();

  TagName atomnam = pAtom->getName();
  TagName resnam = pAtom->getResName();

  for ( ;; ) {
    ResiToppar *pTopo = pTpm->getResiToppar(resnam);
    if (pTopo==NULL) {
      MB_DPRINTLN("CPK> Warning: unknown residue \"%s\"", resnam.c_str());
      // vdw = vdw_default;
      break;
    }

    ResiToppar::Atom *p = pTopo->getAtom(atomnam);
    if (p==NULL) {
      MB_DPRINTLN("CPK> Warning: unknown atom \"%s\" in residue \"%s\"",
                  atomnam.c_str(), resnam.c_str());
      // vdw = vdw_default;
      break;
    }

    float eps, sig, eps14, sig14;
    if (!pTpm->searchNonbPar(p->type, eps, sig, eps14, sig14)) {
      MB_DPRINTLN("CPK> Warning: unknown atom type \"%s\"", (p->type).c_str());
      MB_DPRINTLN("CPK>          in atom \"%s\" in residue \"%s\"",
                  atomnam.c_str(), resnam.c_str());
      // vdw = vdw_default;
      break;
    }

    double vdwr = ((sig + (float) m_probeSig)*1.122462f/2.0f)/2.0f;
    // MB_DPRINTLN("CPK> atom %s vdwr %f", (p->type).c_str(), vdwr);
    return vdwr;
  }
  
  // We cannot get VdW radius from parameter set:
  //  guess it from element type...
*/
  
  switch (pAtom->getElement()) {
  case ElemSym::H:
    return m_vdwr_H;

  case ElemSym::C:
    return m_vdwr_C;

  case ElemSym::N:
    return m_vdwr_N;
    
  case ElemSym::O:
    return m_vdwr_O;
    
  case ElemSym::S:
    return m_vdwr_S;
    
  case ElemSym::P:
    return m_vdwr_P;
    
  default:
    return m_vdwr_X;
  }
}

void CPKRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("detail")) {
    invalidateDisplayCache();
  }
  else if (ev.getName().startsWith("vdwr_")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  MolAtomRenderer::propChanged(ev);
}
