// -*-Mode: C++;-*-
//
//    simple molecular renderer (stick model)
//
// $Id: SimpleRenderer.cpp,v 1.20 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>
#include "SimpleRenderer.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "ResiToppar.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>

using namespace molstr;
using qlib::Vector4D;
using gfx::ColorPtr;

SimpleRenderer::SimpleRenderer()
{
  // will be called by RendererFactory
  //resetAllProps();
}

SimpleRenderer::~SimpleRenderer()
{
  MB_DPRINTLN("SimpleRenderer destructed %p", this);
}

namespace {
  Vector4D getNormalVec(MolAtomPtr pAtom1, MolCoordPtr pMol, bool &bOK)
  {
    bOK = false;
    int nbon1 = pAtom1->getBondCount();
    int aid1 = pAtom1->getID();
    Vector4D nv1;
    std::deque<Vector4D> atoms1;
    atoms1.push_back(pAtom1->getPos());
    if (nbon1>=2) {
      MolAtom::BondIter biter = pAtom1->bondBegin();
      MolAtom::BondIter bend = pAtom1->bondEnd();
      for (; biter!=bend; ++biter) {
	MolBond *pBon = *biter;
	MolAtomPtr pBonAtm1 = pMol->getAtom(pBon->getAtom1());
	MolAtomPtr pBonAtm2 = pMol->getAtom(pBon->getAtom2());
	MB_DPRINTLN("Bond %s <--> %s",
		    pBonAtm1->toString().c_str(),
		    pBonAtm2->toString().c_str());
	if (pBon->getAtom1()==aid1)
	  atoms1.push_back(pBonAtm2->getPos());
	else if (pBon->getAtom2()==aid1)
	  atoms1.push_back(pBonAtm1->getPos());
      }

      Vector4D v1 = atoms1[1] - atoms1[0];
      Vector4D v2 = atoms1[2] - atoms1[0];
      nv1 = v1.cross(v2);
      nv1 = nv1.normalize();
      bOK = true;
    }
    MB_DPRINTLN("DblBon nbon=%d, nv=%s", nbon1, nv1.toString().c_str());
    return nv1;
  }
}

void SimpleRenderer::drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                                       int nBondType,
                                       DisplayContext *pdl)
{
  if (pAtom1.isnull() || pAtom2.isnull()) return;

  const Vector4D pos1 = pAtom1->getPos();
  const Vector4D pos2 = pAtom2->getPos();

  ColorPtr pcol1 = ColSchmHolder::getColor(pAtom1);
  ColorPtr pcol2 = ColSchmHolder::getColor(pAtom2);

  if (nBondType==MolBond::DOUBLE ||
      nBondType==MolBond::TRIPLE) {
    MolCoordPtr pMol = getClientMol();

    bool bOK;
    Vector4D nv;
    nv = getNormalVec(pAtom1, pMol, bOK);
    if (!bOK)
      nv = getNormalVec(pAtom2, pMol, bOK);

    Vector4D dv = (pos1-pos2).normalize();
    Vector4D dvd = nv.cross(dv);
    dvd = dvd.normalize();

    pdl->color(pcol1);
    pdl->vertex(pos1);
    pdl->vertex(pos2);

    //pdl->vertex(pos1+nv1.scale(0.5));
    //pdl->vertex(pos2+nv1.scale(0.5));

    pdl->vertex(pos1+dvd.scale(0.1));
    pdl->vertex(pos2+dvd.scale(0.1));
    ++m_nBondDrawn;
    return;
  }

  if ( pcol1->equals(*pcol2.get()) ) {
    pdl->color(pcol1);
    pdl->vertex(pos1);
    pdl->vertex(pos2);
    ++m_nBondDrawn;
    return;
  }

  const Vector4D minpos = (pos1 + pos2).divide(2.0);

  pdl->color(pcol1);
  pdl->vertex(pos1);
  pdl->vertex(minpos);

  pdl->color(pcol2);
  pdl->vertex(pos2);
  pdl->vertex(minpos);

  ++m_nBondDrawn;
  return;

}

void SimpleRenderer::drawAtom(MolAtomPtr pAtom, DisplayContext *pdl)
{
  pdl->color(ColSchmHolder::getColor(pAtom));
  const Vector4D pos = pAtom->getPos();
  const double rad = 0.25;
  pdl->drawAster(pos, rad);
  ++m_nAtomDrawn;
}

void SimpleRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

void SimpleRenderer::beginRend(DisplayContext *pdl)
{
  pdl->setLineWidth(m_lw);
  pdl->startLines();
  m_nAtomDrawn = 0;
  m_nBondDrawn = 0;
}

void SimpleRenderer::endRend(DisplayContext *pdl)
{
  pdl->end();
  pdl->setLineWidth(1.0f);
  // LOG_DPRINTLN("Simple> %d atoms and %d bonds are rendered.", m_nAtomDrawn, m_nBondDrawn);
}

void SimpleRenderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded)
{
  if (!fbonded)
    drawAtom(pAtom, pdl);
}

void SimpleRenderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
  drawInterAtomLine(pAtom1, pAtom2, pMB->getType(), pdl);
}

bool SimpleRenderer::isRendBond() const
{
  return true;
}

//////////////////////////////////////////////////////////////////////
// simple renderer (with simple coloring scheme)

const char *SimpleRenderer::getTypeName() const
{
  return "simple";
}

/*
void SimpleRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("linew")) {
    invalidateDisplayCache();
  }
  else
  if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }
  MolAtomRenderer::propChanged(ev);
}
*/

