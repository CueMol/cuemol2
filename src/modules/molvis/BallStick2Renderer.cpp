// -*-Mode: C++;-*-
//
//  Ball & Stick model renderer class version 2
//

#include <common.h>
#include "molvis.hpp"

#include "BallStick2Renderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResiToppar.hpp>
//#include <modules/molstr/AtomIterator.hpp>
//#include <modules/molstr/BondIterator.hpp>

#include <modules/molstr/ResidIterator.hpp>

#include <gfx/SphereSet.hpp>
#include <gfx/CylinderSet.hpp>
//#include <gfx/DrawAttrArray.hpp>

using namespace molvis;
using namespace molstr;

using gfx::DisplayContext;
using gfx::ColorPtr;
using qlib::Vector3F;

BallStick2Renderer::BallStick2Renderer()
{
  m_pVBO = NULL;
  m_pSphrTmpl = NULL;
  m_pCylTmpl = NULL;
}

BallStick2Renderer::~BallStick2Renderer()
{
  MB_DPRINTLN("BallStick2Renderer destructed %p", this);
}

const char *BallStick2Renderer::getTypeName() const
{
  return "ballstick2";
}

void BallStick2Renderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(true);
}

void BallStick2Renderer::postRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

////////////

void BallStick2Renderer::beginRend(DisplayContext *pdl)
{
  //if (m_atoms.size()>0)
  //m_atoms.clear();

  pdl->setDetail(m_nDetail);

  m_atomdat.clear();
  m_bonddat.clear();
  m_ringdat.clear();
}

void BallStick2Renderer::endRend(DisplayContext *pdl)
{
  if ( m_fRing && !qlib::isNear4(m_thickness, 0.0) ) {
    buildRingData();
  }

  MolCoordPtr pCMol = getClientMol();
  MolAtomPtr pAtom;
  
  BOOST_FOREACH (const Atom &s, m_atomdat) {
    pAtom = pCMol->getAtom(s.aid);
    pdl->color(ColSchmHolder::getColor(pAtom));
    pdl->sphere(s.rad, pAtom->getPos());
  }

  MolAtomPtr pAtom1, pAtom2;
  ColorPtr pcol1, pcol2;
  
  BOOST_FOREACH (const Bond &c, m_bonddat) {
    pAtom1 = pCMol->getAtom(c.aid1);
    pAtom2 = pCMol->getAtom(c.aid2);

    const Vector4D &pos1 = pAtom1->getPos();
    const Vector4D &pos2 = pAtom2->getPos();
    
    ColorPtr pcol1 = ColSchmHolder::getColor(pAtom1);
    ColorPtr pcol2 = ColSchmHolder::getColor(pAtom2);

    if ( pcol1->equals(*pcol2.get()) ) {
      pdl->color(pcol1);
      pdl->cylinder(c.rad, pos1, pos2);
    }
    else {
      const Vector4D mpos = (pos1 + pos2).divide(2.0);
      pdl->color(pcol1);
      pdl->cylinder(c.rad, pos1, mpos);
      pdl->color(pcol2);
      pdl->cylinder(c.rad, pos2, mpos);
    }
  }

  int i;
  float len;
  Vector3F cen, norm, v1, v2, ntmp;
  MolAtomPtr pPivAtom;
  std::vector<Vector3F> posv;
  BOOST_FOREACH (const Ring &r, m_ringdat) {
    cen = Vector3F();
    const int nmemb = r.atoms.size();
    posv.resize(nmemb);
    for (i=0; i<nmemb; ++i) {
      pAtom = pCMol->getAtom( r.atoms[i] );
      posv[i] = Vector3F(pAtom->getPos().xyz());
      cen += posv[i];
    }
    cen.divideSelf(nmemb);
    
    // calculate the normal vector
    for (i=0; i<nmemb; i++) {
      int ni = (i+1)%nmemb;
      v1 = posv[ni] - posv[i];
      v2 = cen - posv[i];
      ntmp = v1.cross(v2);
      len = ntmp.length();
      if (len<=F_EPS8) {
        LOG_DPRINTLN("BallStick> *****");
        return;
      }
      norm += ntmp.divide(len);
    }
    len = norm.length();
    norm.divideSelf(len);
    Vector3F dv = norm.scale(m_thickness);

    pPivAtom = pCMol->getAtom(r.piv_atom_id);
    ColorPtr col = evalMolColor(m_ringcol, ColSchmHolder::getColor(pPivAtom));

    pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
    pdl->startTriangleFan();
    pdl->normal(norm);
    pdl->color(col);
    pdl->vertex(cen+dv);
    for (i=0; i<=nmemb; i++) {
      pdl->vertex(posv[i%nmemb]+dv);
    }
    pdl->end();
    
    pdl->startTriangleFan();
    pdl->normal(-norm);
    pdl->color(col);
    pdl->vertex(cen-dv);
    for (i=nmemb; i>=0; i--) {
      pdl->vertex(posv[i%nmemb]-dv);
    }
    pdl->end();
    pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);
    
  }

}

bool BallStick2Renderer::isRendBond() const
{
//  if (m_bDrawRingOnly)
//    return false;

  return true;
}

void BallStick2Renderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
  //checkRing(pAtom->getID());

  //if (m_bDrawRingOnly)
  //return;

  if (m_sphr>0.0) {
    Atom s;
    s.aid = pAtom->getID();
    s.rad = m_sphr;
    m_atomdat.push_back(s);
  }
}

void BallStick2Renderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
//  if (m_bDrawRingOnly)
//    return;

  //if (m_nVBMode==VBMODE_TYPE1)
  //drawVBondType1(pAtom1, pAtom2, pMB, pdl);
  //else
  //drawInterAtomLine(pAtom1, pAtom2);

  if (m_bondw>0.0) {
    Bond c;
    c.aid1 = pAtom1->getID();
    c.aid2 = pAtom2->getID();
    c.rad = m_bondw;
    c.btype = pMB->getType();
    m_bonddat.push_back(c);
  }
}

void BallStick2Renderer::buildRingData()
{
  m_ringdat.clear();

  int i, j;
  MolCoordPtr pMol = getClientMol();
  SelectionPtr pSel = getSelection();
  ResidIterator iter(pMol, pSel);
  MolResiduePtr pRes;
  MolAtomPtr pAtom, pPivAtom;
  for (iter.first(); iter.hasMore(); iter.next()) {
    pRes = iter.get();

    ResiToppar *pTop = pRes->getTopologyObj();
    if (pTop==NULL)
      continue;

    int nrings = pTop->getRingCount();
    for (i=0; i<nrings; i++) {
      const ResiToppar::RingAtomArray *pmembs = pTop->getRing(i);
      std::deque<int> ring_atoms;

      // Completeness flag of the ring
      bool fcompl = true;
      pPivAtom = MolAtomPtr();

      MB_DPRINTLN("Ring in %s", pRes->toString().c_str());
      // Check completeness of the ring
      for (j=0; j<pmembs->size(); j++) {
        LString nm = pmembs->at(j);
	pAtom = pRes->getAtom(nm);

	if (pAtom.isnull() ||
	    !pSel->isSelected(pAtom)) {
          fcompl = false;
          break;
        }

        if (pPivAtom.isnull() && pAtom->getElement()==ElemSym::C)
          pPivAtom = pAtom;

        ring_atoms.push_back(pAtom->getID());
	MB_DPRINTLN("  Atom: %s", pAtom->toString().c_str());
      }

      // Ignore incomplete rings
      if (!fcompl)
	continue;

      if (pPivAtom.isnull())
        pPivAtom = pAtom; // no carbon atom --> last atom becomes pivot

      Ring r;
      r.piv_atom_id = pPivAtom->getID();
      MB_DPRINTLN("  Pivot Atom: %s", pPivAtom->toString().c_str());
      r.atoms.resize(ring_atoms.size());
      std::deque<int>::const_iterator iter = ring_atoms.begin();
      for (j=0; j<ring_atoms.size(); ++j, ++iter) {
	r.atoms[j] = *iter;
      }
      m_ringdat.push_back(r);
    }

  }

}

void BallStick2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("bondw") ||
      ev.getName().equals("sphr") ||
      ev.getName().equals("detail") ||
      ev.getName().equals("ring") ||
      ev.getName().equals("thickness") ||
      ev.getName().equals("ringcolor")) {
    invalidateDisplayCache();
  }
  else if (ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  MolAtomRenderer::propChanged(ev);
}

//////////

bool BallStick2Renderer::isUseVer2Iface() const
{
  return true;
}

bool BallStick2Renderer::isCacheAvail() const
{
  return m_pVBO!=NULL;
}

/// Create VBO
void BallStick2Renderer::createVBO()
{
  performRend(NULL);

  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("BS2Renderer::createVBO> Client mol is null");
    return;
  }

  //
  // Build sphere VBO
  //

  const int nsphs = m_atomdat.size();

  gfx::SphereTess<gfx::SingleTessTrait> sphs;

  sphs.create(1, m_nDetail);
  sphs.getData().set(0, Vector4D(0,0,0), 1.0, ColorPtr());

  m_pSphrTmpl = MB_NEW gfx::DrawElemVNCI32();
  sphs.getTrait().setTarget(m_pSphrTmpl);
  {
    int nv, nf;
    sphs.estimateMeshSize(nv, nf);
    m_pSphrTmpl->startIndexTriangles(nv, nf);
    int ivt, ifc;
    sphs.build(0, ivt, ifc);
  }
  //m_pSphrTmpl = sphs.getTrait().buildDrawElem(&sphs);

  int sphr_nverts = m_pSphrTmpl->getSize();
  int sphr_nfaces = m_pSphrTmpl->getIndSize();

  //
  // Build cylinder VBO
  //
  const int ncyls = m_bonddat.size();

  gfx::CylinderTess<gfx::SingleTessTrait> cyls;

  cyls.create(1, m_nDetail);
  cyls.getData().set(0, Vector4D(0, 0, 0), Vector4D(0, 0, 1), 1.0, ColorPtr());

  m_pCylTmpl = MB_NEW gfx::DrawElemVNCI32();
  cyls.getTrait().setTarget(m_pCylTmpl);
  {
    int nv, nf;
    cyls.estimateMeshSize(nv, nf);
    m_pCylTmpl->startIndexTriangles(nv, nf);
    int ivt, ifc;
    cyls.build(0, ivt, ifc);
  }

  int cyl_nverts = m_pCylTmpl->getSize();
  int cyl_nfaces = m_pCylTmpl->getIndSize();

  int nvtot = sphr_nverts * nsphs + cyl_nverts * ncyls;
  int nftot = sphr_nfaces * nsphs + cyl_nfaces * ncyls;

  m_pVBO = MB_NEW gfx::DrawElemVNCI32();
  m_pVBO->setDrawMode(gfx::DrawElem::DRAW_TRIANGLES);
  m_pVBO->alloc(nvtot);
  m_pVBO->allocIndex(nftot);

  //
  // Setup sphere VBO
  //

  int ifc = 0;
  for (int i=0; i<nsphs; ++i) {
    int ivbase = i * sphr_nverts;
    int ifbase = i * sphr_nfaces;
    for (int j=0; j<sphr_nverts; ++j) {
      m_pVBO->normal3f(j+ivbase, m_pSphrTmpl->getNormal(j));
    }
    for (int j=0; j<sphr_nfaces; ++j) {
      m_pVBO->setIndex(j+ifbase, ivbase + m_pSphrTmpl->getIndex(j));
    }
  }

  //
  // Setup cylinder VBO
  //

  for (int i=0; i<ncyls; ++i) {
    int ivbase = i*cyl_nverts + sphr_nverts*nsphs;
    int ifbase = i*cyl_nfaces + sphr_nfaces*nsphs;
    for (int j=0; j<cyl_nverts; ++j) {
      m_pVBO->normal3f(j+ivbase, m_pCylTmpl->getNormal(j));
    }
    for (int j=0; j<cyl_nfaces; ++j) {
      m_pVBO->setIndex(j+ifbase, ivbase + m_pCylTmpl->getIndex(j));
    }
  }

}

/// update VBO positions (using CrdArray)
void BallStick2Renderer::updateDynamicVBO()
{
}

/// update VBO positions (using MolAtom)
void BallStick2Renderer::updateStaticVBO()
{
  MolCoordPtr pCMol = getClientMol();

  const int nsphs = m_atomdat.size();
  const int sphr_nverts = m_pSphrTmpl->getSize();
  const int sphr_nfaces = m_pSphrTmpl->getIndSize();

  MolAtomPtr pA1;
  Vector3F pos, del;
  for (int i=0; i<nsphs; ++i) {
    int ivbase = i * sphr_nverts;
    int aid = m_atomdat[i].aid;
    pA1 = pCMol->getAtom(aid);
    pos = Vector3F( pA1->getPos().xyz() );
    float rad = m_atomdat[i].rad;
    for (int j=0; j<sphr_nverts; ++j) {
      m_pVBO->vertex3f(j+ivbase, pos + m_pSphrTmpl->getVertex(j).scale(rad));
    }
  }

  /////

  const int ncyls = m_bonddat.size();
  const int cyl_nverts = m_pCylTmpl->getSize();
  const int cyl_nfaces = m_pCylTmpl->getIndSize();
  
  MolAtomPtr pA2;
  Vector3F pos1, pos2;
  for (int i=0; i<ncyls; ++i) {
    int ivb = i*sphr_nverts + sphr_nverts*nsphs;
    int ifb = i*sphr_nfaces + sphr_nfaces*nsphs;

    int aid1 = m_bonddat[i].aid1;
    int aid2 = m_bonddat[i].aid2;
    pA1 = pCMol->getAtom(aid1);
    pA2 = pCMol->getAtom(aid2);
    pos1 = Vector3F( pA1->getPos().xyz() );
    pos2 = Vector3F( pA2->getPos().xyz() );
    float rad = m_bonddat[i].rad;
    for (int j=0; j<sphr_nverts; ++j) {
      m_pVBO->vertex3f(j+ivb, pos + m_pSphrTmpl->getVertex(j).scale(rad));
    }
  }

}

/// update VBO colors
void BallStick2Renderer::updateVBOColor()
{
  MolCoordPtr pMol = getClientMol();
  qlib::uid_t nSceneID = pMol->getSceneID();

  const int nsphs = m_atomdat.size();
  const int sphr_nverts = m_pSphrTmpl->getSize();
  const int sphr_nfaces = m_pSphrTmpl->getIndSize();

  MolAtomPtr pA1;
  quint32 cc1;

  // initialize the coloring scheme
  startColorCalc(pMol);

  for (int i=0; i<nsphs; ++i) {
    int ivbase = i * sphr_nverts;
    int aid = m_atomdat[i].aid;
    pA1 = pMol->getAtom(aid);

    //cc1 = ColSchmHolder::getColor(pA1)->getCode();
    cc1 = ColSchmHolder::getColor(pA1)->getDevCode(nSceneID);

    for (int j=0; j<sphr_nverts; ++j) {
      m_pVBO->color(j+ivbase, cc1);
    }
  }

  // finalize the coloring scheme
  endColorCalc(pMol);
}

/// Rendering using VBO
void BallStick2Renderer::renderVBO(DisplayContext *pdc)
{
  pdc->drawElem(*m_pVBO);
}

/// cleanup VBO
void BallStick2Renderer::invalidateDisplayCache()
{
  super_t::invalidateDisplayCache();

  if (m_pSphrTmpl!=NULL) {
    delete m_pSphrTmpl;
    m_pSphrTmpl = NULL;
  }

  if (m_pVBO!=NULL) {
    delete m_pVBO;
    m_pVBO = NULL;
  }
}


