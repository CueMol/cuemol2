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

using namespace molstr;
using qlib::Vector4D;
using gfx::ColorPtr;

SimpleRenderer::SimpleRenderer()
{
  // will be called by RendererFactory
  //resetAllProps();

  m_bValBond = true;
  m_dCvScl1 = -0.05;
  m_dCvScl2 = 0.05;

  m_pBondVBO = NULL;
}

SimpleRenderer::~SimpleRenderer()
{
  MB_DPRINTLN("SimpleRenderer destructed %p", this);
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

    /*
    bool bOK;
    Vector4D nv;
    nv = getNormalVec(pAtom1, pMol, bOK);
    if (!bOK)
      nv = getNormalVec(pAtom2, pMol, bOK);

    Vector4D dv = (pos1-pos2).normalize();
    Vector4D dvd = nv.cross(dv);
    dvd = dvd.normalize();
*/
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

//////////////////////////////////////////////////////////////////////

void SimpleRenderer::display(DisplayContext *pdc)
{

  if (pdc->isFile() || !pdc->isDrawElemSupported()) {
    // case of the file (non-ogl) rendering
    // always use the old version.
    super_t::display(pdc);
    return;
  }

  // new rendering routine using VBO (DrawElem)

  if (m_pBondVBO==NULL) {
    renderVBO();
    if (m_pBondVBO==NULL)
      return; // Error, Cannot draw anything (ignore)
  }
  
  preRender(pdc);
  m_pBondVBO->setLineWidth(m_lw);
  pdc->drawElem(*m_pBondVBO);
  postRender(pdc);
}


//////////

void SimpleRenderer::renderVBO()
{
  quint32 i, j;
  quint32 nbons = 0, natoms = 0, nmbons = 0, nva = 0;
  MolCoordPtr pMol = getClientMol();

  std::deque<int> isolated_atoms;
  
  IntBondArray sbonds;
  IntMBondArray mbonds;
  IntAtomArray atoms;
  
  {
    // build bond data structure/estimate VBO size

    std::set<int> bonded_atoms;
    BondIterator biter(pMol, getSelection());

    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      int aid1 = pMB->getAtom1();
      int aid2 = pMB->getAtom2();

      bonded_atoms.insert(aid1);
      bonded_atoms.insert(aid2);

      MolAtomPtr pA1 = pMol->getAtom(aid1);
      MolAtomPtr pA2 = pMol->getAtom(aid2);

      if (pA1.isnull() || pA2.isnull())
        continue; // skip invalid bonds

      int nBondType = pMB->getType();
      if (m_bValBond &&
          (nBondType==MolBond::DOUBLE ||
           nBondType==MolBond::TRIPLE)) {
        ++nmbons;
      }
      else {
        ++nbons;
      }
    }

    sbonds.resize(nbons);
    mbonds.resize(nmbons);

    i=0;
    j=0;
    int iva = 0;
    for (biter.first(); biter.hasMore(); biter.next()) {
      MolBond *pMB = biter.getBond();
      int aid1 = pMB->getAtom1();
      int aid2 = pMB->getAtom2();

      MolAtomPtr pA1 = pMol->getAtom(aid1);
      MolAtomPtr pA2 = pMol->getAtom(aid2);

      if (pA1.isnull() || pA2.isnull())
        continue; // skip invalid bonds
      
      ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
      ColorPtr pcol2 = ColSchmHolder::getColor(pA2);

      int nBondType = pMB->getType();
      bool bSameCol = (pcol1->equals(*pcol2.get()))?true:false;

      if (m_bValBond &&
          (nBondType==MolBond::DOUBLE ||
           nBondType==MolBond::TRIPLE)) {

        Vector4D dvd = pMB->getDblBondDir(pMol);
        
        mbonds[j].aid1 = aid1;
        mbonds[j].aid2 = aid2;
        mbonds[j].vaind = iva;
        mbonds[j].nx = (qfloat32) dvd.x();
        mbonds[j].ny = (qfloat32) dvd.y();
        mbonds[j].nz = (qfloat32) dvd.z();

        if (nBondType==MolBond::DOUBLE) {
          // double bond
          if ( bSameCol ) {
            // same color --> one double bond
            iva+=2*2;
            mbonds[j].itype = IBON_1C_2V;
            mbonds[j].nelems = 2*2;
          }
          else {
            // different color --> two double bonds
            iva+=4*2;
            mbonds[j].itype = IBON_2C_2V;
            mbonds[j].nelems = 4*2;
          }
        }
        else {
          // triple bond
          if ( bSameCol ) {
            // same color --> one triple bond
            iva+=2*3;
            mbonds[j].itype = IBON_1C_3V;
            mbonds[j].nelems = 2*3;
          }
          else {
            // different color --> two triple bonds
            iva+=4*3;
            mbonds[j].itype = IBON_2C_3V;
            mbonds[j].nelems = 4*3;
          }
        }
        ++j;
      }
      else {
        // single bond / valbond disabled
        sbonds[i].aid1 = aid1;
        sbonds[i].aid2 = aid2;
        sbonds[i].vaind = iva;

        if ( bSameCol ) {
          // same color --> one bond
          iva+=2;
          sbonds[i].itype = IBON_1C_1V;
          sbonds[i].nelems = 2;
        }
        else {
          // different color --> two bonds
          iva+=4;
          sbonds[i].itype = IBON_2C_1V;
          sbonds[i].nelems = 4;
        }
        ++i;
      }
    }

    // calculate isolated atoms
    AtomIterator aiter(pMol, getSelection());
    for (aiter.first(); aiter.hasMore(); aiter.next()) {
      int aid = aiter.getID();
      MolAtomPtr pAtom = pMol->getAtom(aid);
      if (pAtom.isnull()) continue; // ignore errors
      if (bonded_atoms.find(aid)!=bonded_atoms.end())
        continue; // already bonded
      isolated_atoms.push_back(aid);
    }
    natoms = isolated_atoms.size();
    atoms.resize(natoms);
    for (i=0; i<natoms; ++i) {
      atoms[i].aid1 = isolated_atoms[i];
      atoms[i].vaind = iva;
      iva += 2*3;
    }

    nva = iva;
  }
    
  if (m_pBondVBO!=NULL)
    delete m_pBondVBO;
    
  m_pBondVBO = MB_NEW gfx::DrawElemVC();
  m_pBondVBO->alloc(nva);
  m_pBondVBO->setDrawMode(gfx::DrawElemVC::DRAW_LINES);
  MB_DPRINTLN("SimpleRenderer> %d elems VBO created", nva);
  
  // Single bonds
  j = 0;
  for (i=0; i<nbons; ++i) {
    quint32 aid1 = sbonds[i].aid1;
    quint32 aid2 = sbonds[i].aid2;
    quint32 j = sbonds[i].vaind;

    MolAtomPtr pA1 = pMol->getAtom(aid1);
    MolAtomPtr pA2 = pMol->getAtom(aid2);
    
    ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
    quint32 cc1 = pcol1->getCode();

    Vector4D pos1 = pA1->getPos();
    Vector4D pos2 = pA2->getPos();

    switch (sbonds[i].itype) {
    case IBON_1C_1V:
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1);
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos2);
      ++j;
      break;

    case IBON_2C_1V: {
      ColorPtr pcol2 = ColSchmHolder::getColor(pA2);
      quint32 cc2 = pcol2->getCode();
      Vector4D midpos = (pos1+pos2).divide(2.0);
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1);
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, midpos);
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, pos2);
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, midpos);
      ++j;
      break;
    }
      
    default:
      break;
    }
  }

  // Double/triple bonds
  for (i=0; i<nmbons; ++i) {
    quint32 aid1 = mbonds[i].aid1;
    quint32 aid2 = mbonds[i].aid2;
    quint32 j = mbonds[i].vaind;

    MolAtomPtr pA1 = pMol->getAtom(aid1);
    MolAtomPtr pA2 = pMol->getAtom(aid2);
    
    ColorPtr pcol1 = ColSchmHolder::getColor(pA1);

    quint32 cc1 = pcol1->getCode();

    Vector4D pos1 = pA1->getPos();
    Vector4D pos2 = pA2->getPos();
    Vector4D dvd(mbonds[i].nx, mbonds[i].ny, mbonds[i].nz);

    switch (mbonds[i].itype) {
    case IBON_1C_2V: {
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1 + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos2 + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1 + dvd.scale(m_dCvScl2));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos2 + dvd.scale(m_dCvScl2));
      ++j;
      break;
    }
    case IBON_2C_2V: {
      ColorPtr pcol2 = ColSchmHolder::getColor(pA2);
      quint32 cc2 = pcol2->getCode();
      Vector4D midpos = (pos1+pos2).divide(2.0);

      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1 + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, midpos + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1 + dvd.scale(m_dCvScl2));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, midpos + dvd.scale(m_dCvScl2));
      ++j;

      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, pos2 + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, midpos + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, pos2 + dvd.scale(m_dCvScl2));
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, midpos + dvd.scale(m_dCvScl2));
      ++j;

      break;
    }

    case IBON_1C_3V: {
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1);
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos2);
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1 + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos2 + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1 + dvd.scale(-m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos2 + dvd.scale(-m_dCvScl1));
      ++j;
      break;
    }
    case IBON_2C_3V: {
      ColorPtr pcol2 = ColSchmHolder::getColor(pA2);
      quint32 cc2 = pcol2->getCode();
      Vector4D midpos = (pos1+pos2).divide(2.0);

      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1);
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, midpos);
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1 + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, midpos + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, pos1 + dvd.scale(-m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc1);
      m_pBondVBO->vertex(j, midpos + dvd.scale(-m_dCvScl1));
      ++j;

      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, pos2);
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, midpos);
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, pos2 + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, midpos + dvd.scale(m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, pos2 + dvd.scale(-m_dCvScl1));
      ++j;
      m_pBondVBO->color(j, cc2);
      m_pBondVBO->vertex(j, midpos + dvd.scale(-m_dCvScl1));
      ++j;

      break;
    }
    default:
      break;
    }
  }

  // Isolated atoms
  
  // size of the star
  const double rad = 0.25;
  const Vector4D xdel(rad,0,0);
  const Vector4D ydel(0,rad,0);
  const Vector4D zdel(0,0,rad);

  for (i=0; i<natoms; ++i) {
    quint32 aid1 = atoms[i].aid1;
    quint32 j = atoms[i].vaind;

    MolAtomPtr pA1 = pMol->getAtom(aid1);
    ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
    quint32 cc1 = pcol1->getCode();
    Vector4D pos1 = pA1->getPos();

    m_pBondVBO->color(j, cc1);
    m_pBondVBO->vertex(j, pos1-xdel);
    ++j;

    m_pBondVBO->color(j, cc1);
    m_pBondVBO->vertex(j, pos1+xdel);
    ++j;

    m_pBondVBO->color(j, cc1);
    m_pBondVBO->vertex(j, pos1-ydel);
    ++j;

    m_pBondVBO->color(j, cc1);
    m_pBondVBO->vertex(j, pos1+ydel);
    ++j;
    
    m_pBondVBO->color(j, cc1);
    m_pBondVBO->vertex(j, pos1-zdel);
    ++j;

    m_pBondVBO->color(j, cc1);
    m_pBondVBO->vertex(j, pos1+zdel);
    ++j;
  }
  
}

void SimpleRenderer::invalidateDisplayCache()
{
  if (m_pBondVBO!=NULL) {
    delete m_pBondVBO;
    m_pBondVBO = NULL;
  }

  super_t::invalidateDisplayCache();
}

