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

#include "BondIterator.hpp"
#include "AtomIterator.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>
#include <qsys/Scene.hpp>

#ifdef USE_OPENGL
#include <gfx/DrawAttrArray.hpp>
#include <sysdep/OglDisplayContext.hpp>
#include <sysdep/OglProgramObject.hpp>
#include <sysdep/ogl_core/GLSLLineHelper2.hpp>
#endif

using namespace molstr;
using qlib::Vector4D;
using gfx::ColorPtr;

SimpleRenderer::SimpleRenderer()
{
  m_bValBond = true;
  m_dCvScl1 = -0.05;
  m_dCvScl2 = 0.05;

#ifdef USE_OPENGL
  m_pGlslLine = MB_NEW sysdep::GLSLLineHelper();
#endif
}

SimpleRenderer::~SimpleRenderer()
{
#ifdef USE_OPENGL
    delete m_pGlslLine;
#endif
    // MB_DPRINTLN("SimpleRenderer destructed %p", this);
}

const char *SimpleRenderer::getTypeName() const
{
  return "simple";
}

/////////////////////////

void SimpleRenderer::drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                                       MolBond *pMB,
                                       DisplayContext *pdl)
{
  if (pAtom1.isnull() || pAtom2.isnull()) return;

  const Vector4D pos1 = pAtom1->getPos();
  const Vector4D pos2 = pAtom2->getPos();

  ColorPtr pcol1 = ColSchmHolder::getColor(pAtom1);
  ColorPtr pcol2 = ColSchmHolder::getColor(pAtom2);

  int nBondType = pMB->getType();
  if (m_bValBond &&
      (nBondType==MolBond::DOUBLE ||
       nBondType==MolBond::TRIPLE)) {
    MolCoordPtr pMol = getClientMol();

    Vector4D dvd = pMB->getDblBondDir(pMol);
    
    if (nBondType==MolBond::DOUBLE) {
      // double bond
      if ( pcol1->equals(*pcol2.get()) ) {
        pdl->color(pcol1);
        pdl->vertex(pos1 + dvd.scale(m_dCvScl1));
        pdl->vertex(pos2 + dvd.scale(m_dCvScl1));
        pdl->vertex(pos1 + dvd.scale(m_dCvScl2));
        pdl->vertex(pos2 + dvd.scale(m_dCvScl2));
      }
      else {
        const Vector4D minpos = (pos1 + pos2).divide(2.0);
        
        pdl->color(pcol1);
        pdl->vertex(pos1 + dvd.scale(m_dCvScl1));
        pdl->vertex(minpos + dvd.scale(m_dCvScl1));
        pdl->vertex(pos1 + dvd.scale(m_dCvScl2));
        pdl->vertex(minpos + dvd.scale(m_dCvScl2));
        
        pdl->color(pcol2);
        pdl->vertex(pos2 + dvd.scale(m_dCvScl1));
        pdl->vertex(minpos + dvd.scale(m_dCvScl1));
        pdl->vertex(pos2 + dvd.scale(m_dCvScl2));
        pdl->vertex(minpos + dvd.scale(m_dCvScl2));
      }
    }
    else {
      // triple bond
      if ( pcol1->equals(*pcol2.get()) ) {
        pdl->color(pcol1);
        pdl->vertex(pos1);
        pdl->vertex(pos2);
        pdl->vertex(pos1 + dvd.scale(m_dCvScl1));
        pdl->vertex(pos2 + dvd.scale(m_dCvScl1));
        pdl->vertex(pos1 + dvd.scale(-m_dCvScl1));
        pdl->vertex(pos2 + dvd.scale(-m_dCvScl1));
      }
      else {
        const Vector4D minpos = (pos1 + pos2).divide(2.0);
        
        pdl->color(pcol1);
        pdl->vertex(pos1);
        pdl->vertex(minpos);
        pdl->vertex(pos1 + dvd.scale(m_dCvScl1));
        pdl->vertex(minpos + dvd.scale(m_dCvScl1));
        pdl->vertex(pos1 + dvd.scale(-m_dCvScl1));
        pdl->vertex(minpos + dvd.scale(-m_dCvScl1));
        
        pdl->color(pcol2);
        pdl->vertex(pos2);
        pdl->vertex(minpos);
        pdl->vertex(pos2 + dvd.scale(m_dCvScl1));
        pdl->vertex(minpos + dvd.scale(m_dCvScl1));
        pdl->vertex(pos2 + dvd.scale(-m_dCvScl1));
        pdl->vertex(minpos + dvd.scale(-m_dCvScl1));
      }
    }
    
    ++m_nBondDrawn;
    return;
  }

  if ( pcol1->equals(*pcol2.get()) ) {
    pdl->color(pcol1);
    pdl->vertex(pos1);
    pdl->vertex(pos2);
  }
  else {
    const Vector4D minpos = (pos1 + pos2).divide(2.0);
    
    pdl->color(pcol1);
    pdl->vertex(pos1);
    pdl->vertex(minpos);

    pdl->color(pcol2);
    pdl->vertex(pos2);
    pdl->vertex(minpos);
  }
  
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
    MB_DPRINTLN("SimpleRenderer::beginRend setLineWidth %f", m_lw);
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
  drawInterAtomLine(pAtom1, pAtom2, pMB, pdl);
}

bool SimpleRenderer::isRendBond() const
{
  return true;
}

