// -*-Mode: C++;-*-
//
//    Molecular selection renderer (stick model)
//
// $Id: SelectionRenderer.cpp,v 1.14 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>
#include "SelectionRenderer.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "ResiToppar.hpp"

#include "SelCommand.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>
#include <qsys/SceneManager.hpp>

using namespace molstr;

using qlib::Vector4D;
using gfx::ColorPtr;

SelectionRenderer::SelectionRenderer()
{
  m_nMode = MODE_STICK;
  m_pSel = molstr::SelectionPtr(MB_NEW molstr::SelCommand(LString("!*")));
}

SelectionRenderer::~SelectionRenderer()
{
}

const char *SelectionRenderer::getTypeName() const
{
  return "*selection";
}

SelectionPtr SelectionRenderer::getSelection() const
{
  MolCoordPtr pClient = qlib::ensureNotNull( getClientMol() );
  // MB_ASSERT(!pClient.isnull());
  SelectionPtr psel = pClient->getSelection();
  if (psel.isnull())
    return m_pSel;
  if (psel->toString().isEmpty())
    return m_pSel;
  return psel;
}

void SelectionRenderer::propChanged(qlib::LPropEvent &ev)
{
  super_t::propChanged(ev);

  if (ev.getTarget()==this) {
    if (ev.getName().equals("mode") ||
        ev.getName().equals("linew") ||
        ev.getName().equals("dispx") ||
        ev.getName().equals("dispy") ||
        ev.getName().equals("color")
        ) {
      invalidateDisplayCache();
      return;
    }
  }

  /*qlib::LPropSupport *pmol = getClientMol().get();
  if (ev.getTarget()==pmol) {
    if (ev.getName().equals("sel")) {
      invalidateDisplayCache();
    }
  }*/
}

//////////////////////////////////////////////////////////////////////////
// selection drawing

static void drawSelInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                                 DisplayContext *pdl)
{
  if (pAtom1.isnull() || pAtom2.isnull()) return;

  pdl->vertex(pAtom1->getPos());
  pdl->vertex(pAtom2->getPos());
}

static void drawSelAtom(MolAtomPtr pAtom, DisplayContext *pdl)
{
  pdl->drawAster(pAtom->getPos(), 0.25);
}

bool SelectionRenderer::isRendBond() const
{
  if (m_nMode==0)
    return true;
  else
    return false;
}

void SelectionRenderer::beginRend(DisplayContext *pdl)
{
  pdl->color(m_color);
  if (m_nMode==0) {
    pdl->startLines();
  }
  else {
    pdl->setPointSize(m_linew);
    pdl->startPoints();
  }
}

void SelectionRenderer::endRend(DisplayContext *pdl)
{
  if (m_nMode==0) {
    pdl->end();
    pdl->setLineWidth(1.0);
  }
  else {
    pdl->end();
    pdl->setPointSize(1.0);
  }
}

void SelectionRenderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded)
{
  if (m_nMode==0) {
    if (!fbonded)
      drawSelAtom(pAtom, pdl);
  }
  else {
    pdl->vertex(pAtom->getPos());
    //Vector4D pos = pAtom->getPos();
    //pdl->drawPixels(pos, m_boximg, *(m_color.get()));
  }
}

void SelectionRenderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
  if (m_nMode==0) {
    drawSelInterAtomLine(pAtom1, pAtom2, pdl);
  }
  else {
  }
}

void SelectionRenderer::preRender(DisplayContext *pdc)
{
  Vector4D dv;

  double delx = m_dispx, dely = m_dispy;
  if (m_nMode!=0) {
    delx -= m_linew/2.0;
    dely += m_linew/2.0;
  }
  qsys::View *pview = pdc->getTargetView();
  if (pview!=NULL)
    pview->convXYTrans(delx, dely, dv);

  pdc->setLineWidth(m_linew);
  pdc->pushMatrix();
  pdc->translate(dv);
  pdc->setLighting(false);
}

void SelectionRenderer::postRender(DisplayContext *pdc)
{
  pdc->popMatrix();
  pdc->setLineWidth(1.0);
}

void SelectionRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_PROPCHG) {
    if (ev.getDescr().equals("sel")) {
      invalidateDisplayCache();
      //return;
    }
  }

  super_t::objectChanged(ev);
}

bool SelectionRenderer::isTransp() const
{
/*
  if (m_nMode==MODE_STICK &&
      m_color.fa()<1.0)
    return true;
  else
    return false;
  */
  return true;
}

