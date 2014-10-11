// -*-Mode: C++;-*-
//
//    backbone trace molecular renderer
//
// $Id: TraceRenderer.cpp,v 1.11 2011/03/06 16:27:15 rishitani Exp $

#include <common.h>
#include "TraceRenderer.hpp"

//#include "MolSelection.hpp"
//#include "AtomSel.h"
#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "ResiToppar.hpp"

#include <gfx/DisplayContext.hpp>

using namespace molstr;

TraceRenderer::TraceRenderer()
{
  //resetAllProps();
}

TraceRenderer::~TraceRenderer()
{
}


void TraceRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

void TraceRenderer::beginRend(DisplayContext *pdl)
{
//  pdl->recordStart();
  pdl->setLineWidth(m_lw);
}

void TraceRenderer::beginSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  pdl->startLineStrip();
}

void TraceRenderer::rendResid(DisplayContext *pdl, MolResiduePtr pRes)
{
  MolAtomPtr pAtom1 = getPivotAtom(pRes);
  pdl->color(ColSchmHolder::getColor(pRes));

  Vector4D curpt = pAtom1->getPos();
  pdl->vertex(curpt);
}

void TraceRenderer::endSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  pdl->end();
}

void TraceRenderer::endRend(DisplayContext *pdl)
{
  pdl->setLineWidth(1.0f);
//  pdl->recordEnd();
}

const char *TraceRenderer::getTypeName() const
{
  return "trace";
}

/*void TraceRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("linew")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  MainChainRenderer::propChanged(ev);
}*/

