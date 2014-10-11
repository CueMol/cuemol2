// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: SESTgBuilder.cpp,v 1.1 2011/02/11 06:55:18 rishitani Exp $

#include <common.h>

#include "surface.hpp"
#ifdef SURF_BUILDER_TEST

#include "MolSurfBuilder.hpp"
#include "SESTgBuilder.hpp"
#include "TgConcSphere.hpp"
#include "TgSphere.hpp"
#include "TgTorus.hpp"
#include "RSComponent.hpp"

#include <gfx/DisplayContext.hpp>

using namespace surface;

SESTgBuilder::SESTgBuilder(MolSurfBuilder *pmsb, RSComponent *prscom)
     : m_dden(5.0), m_pmsb(pmsb), m_prscom(prscom)
{
  m_pdl = pmsb->getDC();
  m_rprobe = m_pmsb->m_rprobe;
}

SESTgBuilder::~SESTgBuilder()
{
}

/**
 Build toric faces without singularities
*/
void SESTgBuilder::toricFaces()
{
  RSEdgeList::iterator eiter = m_prscom->m_edges.begin();
  for (; eiter!=m_prscom->m_edges.end(); ++eiter) {
    RSEdge *pE = *eiter;
    //MB_DPRINTLN("Edge: (%d, %d)", pE->idx[0], pE->idx[1]);
    TgTorus ttor(this, pE, m_dden);
    ttor.calc();
  }
}

/**
  Build reentrant faces without singularities
*/
void SESTgBuilder::reentSphFaces()
{
  TgSphere concs(m_rprobe, m_dden);
  //TgSphereGen concs(m_rprobe, 5);
  concs.m_pdl = m_pdl;
  concs.buildVerteces(false);
  //concs.buildVertIco(false);
  // concs.checkConvexHull(NULL);
  
  RSFaceSet::const_iterator iter = m_prscom->m_faceset.begin();
  for (int ii=0; iter!=m_prscom->m_faceset.end(); ++iter, ++ii) {
    const RSFace *pF = *iter;
    
    TgConcSphere tcs(this, pF, &concs);
    tcs.calc();
    
      /*
      m_pdl->pushMatrix();
      m_pdl->translate_v(pF->param.Pijk);
      // concs.checkConvexHull(m_pdl);
      m_pdl->setLighting(false);
      //m_pdl->setPolygonMode(DisplayContext::POLY_FILL);
      m_pdl->setPolygonMode(DisplayContext::POLY_LINE);
      m_pdl->startTriangles();
      m_pdl->color_3d(0.9, 0.9, 0.7);
      concs.drawSphere(m_pdl, false);
      m_pdl->end();
      m_pdl->setLighting(false);
      m_pdl->setPolygonMode(DisplayContext::POLY_FILL);
      m_pdl->popMatrix();
       */
  }
}

/**
  Build convex faces without singularities
 */

void SESTgBuilder::convSphFaces()
{
  TgSphere ctmpl(1.5, m_dden);
  ctmpl.m_pdl = m_pdl;
  ctmpl.buildVerteces(true);

  const MSAtomArray &atoms = m_pmsb->getAtomArray();
  RSVertList::const_iterator iter = m_prscom->m_verts.begin();
  for (int ii=0; iter!=m_prscom->m_verts.end(); ++iter, ++ii) {
    const RSVert *pV = *iter;
    int idx = pV->idx;

    if (qlib::isNear4(1.5, atoms[idx].rad)) {
      TgCnvxSphere tcs(this, pV, &ctmpl);
      tcs.calc();
    }
    else {
      // TO DO: XXX reuse sphere with the same radii
      TgSphere concs(atoms[idx].rad, m_dden);
      concs.m_pdl = m_pdl;
      concs.buildVerteces(true);
      TgCnvxSphere tcs(this, pV, &concs);
      tcs.calc();
    }

    /*
      RSEdgeList::const_iterator jter = pV->m_edges.begin();
      for (; jter!=pV->m_edges.end(); ++jter) {
        RSEdge *pE = *jter;
        MB_DPRINTLN("Edge: (%d, %d)", pE->idx[0], pE->idx[1]);
      }
      MB_DPRINTLN("");
     */
  }
}
  


void SESTgBuilder::build()
{

  toricFaces();

  reentSphFaces();
  
  convSphFaces();

/*  {
    SESArcList::iterator it2 = m_prscom->m_arcs.begin();
    for (; it2!=m_prscom->m_arcs.end(); ++it2) {
      SESArc *pArc = *it2;
      //pArc->draw(m_pdl, 10);
      if (pArc->m_pSnglArc)
        pArc->m_pSnglArc->draw(m_pdl, 10);
      //RSFaceComp::tuple tp(pF);
      //tp.canonicalize();
      // MB_DPRINTLN(" < (%d,%d,%d)", tp.i, tp.j, tp.k);
    }
  }*/
  

  m_pdl->setLighting(false);
  m_pdl->setLineWidth(0.5);
  m_pdl->color(1, 1, 0.8);
  m_pdl->setPolygonMode(DisplayContext::POLY_LINE);
  m_pmsb->m_tgset.draw(m_pdl);
  m_pdl->setLighting(false);
  m_pdl->setLineWidth(1.0);

  m_pdl->setLighting(true);
  m_pdl->setPolygonMode(DisplayContext::POLY_FILL);
  m_pdl->color(0.1, 0.3, 0.1);
  m_pmsb->m_tgset.draw(m_pdl);
  m_pdl->setLighting(false);

}

#endif

