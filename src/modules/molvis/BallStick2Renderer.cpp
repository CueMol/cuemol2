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
#include <modules/molstr/AnimMol.hpp>
#include <modules/molstr/ResidIterator.hpp>

#include <gfx/SphereSet.hpp>
#include <gfx/CylinderSet.hpp>
//#include <gfx/DrawAttrArray.hpp>

using namespace molvis;
using namespace molstr;

using gfx::DisplayContext;
using gfx::ColorPtr;
using qlib::Vector3F;
using qlib::Matrix3F;

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
  
  MolAtomPtr pAtom1, pAtom2;
  ColorPtr pcol1, pcol2;
  
  BOOST_FOREACH (const Atom &s, m_atomdat) {
    pAtom = pCMol->getAtom(s.aid);
    pdl->color(ColSchmHolder::getColor(pAtom));
    pdl->sphere(s.rad, pAtom->getPos());
  }
  
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
  return true;
}

void BallStick2Renderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
  if (m_sphr>0.0) {
    Atom s;
    s.aid = pAtom->getID();
    s.rad = m_sphr;
    m_atomdat.push_back(s);
  }
}

void BallStick2Renderer::rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB)
{
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

void BallStick2Renderer::createData()
{
  m_atomdat.clear();
  m_bonddat.clear();
  m_ringdat.clear();
  if (m_pSphrTmpl!=NULL) {
    delete m_pSphrTmpl;
    m_pSphrTmpl = NULL;
  }
  if (m_pCylTmpl!=NULL) {
    delete m_pCylTmpl;
    m_pCylTmpl = NULL;
  }
  performRend(NULL);
  if ( m_fRing && !qlib::isNear4(m_thickness, 0.0) ) {
    buildRingData();
  }
}

void BallStick2Renderer::estimateRingVBOSize(int &rng_nverts, int &rng_nfaces)
{
  const int nring = m_ringdat.size();
  if (nring>0) {
    BOOST_FOREACH (const Ring &rng, m_ringdat) {
      int natoms = rng.atoms.size();
      rng_nverts += (natoms + 1)*2;
      rng_nfaces += natoms*3*2;
    }
  }
}

void BallStick2Renderer::setupRingVBO(gfx::DrawElemVNCI32 *pVBO, int ivbase, int ifbase3)
{
  int ifbase = ifbase3/3;
  BOOST_FOREACH (const Ring &rng, m_ringdat) {
    int natoms = rng.atoms.size();
    for (int j=0; j<natoms; ++j)
      pVBO->setIndex3(ifbase+j, ivbase, ivbase+j, ivbase+(j+1)%natoms);
    ivbase += (natoms+1);
    ifbase += natoms;
    for (int j=0; j<natoms; ++j)
      pVBO->setIndex3(ifbase+j, ivbase, ivbase+(j+1)%natoms, ivbase+j);
    ivbase += (natoms+1);
    ifbase += natoms;
  }
}

/// Create VBO
void BallStick2Renderer::createVBO()
{
  createData();

  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) {
    MB_DPRINTLN("BS2Renderer::createVBO> Client mol is null");
    return;
  }

  //
  // Convert from AID to array index (for AnimMol)
  // TO DO: move to createData() ??
  //
  AnimMol *pAMol = NULL;
  if (isUseAnim()) {
    pAMol = static_cast<AnimMol *>(pMol.get());
    for (int i=0; i<m_atomdat.size(); ++i) {
      m_atomdat[i].aid = pAMol->getCrdArrayInd(m_atomdat[i].aid);
    }
    for (int i=0; i<m_bonddat.size(); ++i) {
      m_bonddat[i].aid1 = pAMol->getCrdArrayInd(m_bonddat[i].aid1);
      m_bonddat[i].aid2 = pAMol->getCrdArrayInd(m_bonddat[i].aid2);
    }
    BOOST_FOREACH (Ring &rng, m_ringdat) {
      int natoms = rng.atoms.size();
      for (int j=0; j<natoms; ++j)
        rng.atoms[j] = pAMol->getCrdArrayInd(rng.atoms[j]);
    }
  }

  //
  // Estimate sphere VBO size
  //

  const int nsphs = m_atomdat.size();
  if (nsphs>0) {
    gfx::SphereTess<gfx::SingleTessTrait> sphs;

    sphs.create(1, m_nDetail);
    sphs.getData().set(0, Vector4D(0,0,0), 1.0, ColorPtr());

    m_pSphrTmpl = MB_NEW gfx::DrawElemVNCI32();
    sphs.getTrait().setTarget(m_pSphrTmpl);

    int nv, nf;
    sphs.estimateMeshSize(nv, nf);
    m_pSphrTmpl->startIndexTriangles(nv, nf);
    int ivt=0, ifc=0;
    sphs.build(0, ivt, ifc);
  }
  const int sphr_nverts = (m_pSphrTmpl==NULL) ? 0 : m_pSphrTmpl->getSize();
  const int sphr_nfaces = (m_pSphrTmpl==NULL) ? 0 : m_pSphrTmpl->getIndSize();

  //
  // Estimate cylinder VBO size
  //
  const int ncyls = m_bonddat.size() * 2;
  if (ncyls>0) {
    gfx::CylinderTess<gfx::SingleTessTrait> cyls;

    cyls.create(1, m_nDetail);
    cyls.getData().set(0, Vector4D(0, 0, 0), Vector4D(0, 0, 1), 1.0, ColorPtr());

    m_pCylTmpl = MB_NEW gfx::DrawElemVNCI32();
    cyls.getTrait().setTarget(m_pCylTmpl);

    int nv, nf;
    cyls.estimateMeshSize(nv, nf);
    m_pCylTmpl->startIndexTriangles(nv, nf);
    int ivt=0, ifc=0;
    cyls.build(0, ivt, ifc);
  }
  const int cyl_nverts = (m_pCylTmpl==NULL) ? 0 : m_pCylTmpl->getSize();
  const int cyl_nfaces = (m_pCylTmpl==NULL) ? 0 : m_pCylTmpl->getIndSize();

  //
  // Estimate ring VBO size
  //
  int rng_nverts = 0;
  int rng_nfaces = 0;
  estimateRingVBOSize(rng_nverts, rng_nfaces);
  /*
  const int nring = m_ringdat.size();
  if (nring>0) {
    BOOST_FOREACH (const Ring &rng, m_ringdat) {
      int natoms = rng.atoms.size();
      rng_nverts += (natoms + 1)*2;
      rng_nfaces += natoms*3*2;
    }
  }
*/
  m_nCylVertBase = sphr_nverts * nsphs;
  m_nCylFaceBase = sphr_nfaces*nsphs;
  m_nRingVertBase = sphr_nverts * nsphs + cyl_nverts * ncyls;
  m_nRingFaceBase = sphr_nfaces * nsphs + cyl_nfaces * ncyls;

  const int nvtot = sphr_nverts * nsphs + cyl_nverts * ncyls + rng_nverts;
  const int nftot = sphr_nfaces * nsphs + cyl_nfaces * ncyls + rng_nfaces;

  //
  // Create VBO
  //
  
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
    int ivbase = i*cyl_nverts + m_nCylVertBase;
    int ifbase = i*cyl_nfaces + m_nCylFaceBase;
    for (int j=0; j<cyl_nfaces; ++j) {
      m_pVBO->setIndex(j+ifbase, ivbase + m_pCylTmpl->getIndex(j));
      //MB_DPRINTLN("%d: %d", (j+ifbase)/3, ivbase + m_pCylTmpl->getIndex(j));
    }
  }

  //
  // Setup ring VBO
  //
  setupRingVBO(m_pVBO, m_nRingVertBase, m_nRingFaceBase);
}

/// update VBO positions (using CrdArray)
void BallStick2Renderer::updateDynamicVBO()
{
  updateDynamicSphereVBO();
  updateDynamicCylinderVBO();
  updateDynamicRingVBO(m_pVBO, m_nRingVertBase);

  m_pVBO->setUpdated(true);
}

/// Setup spheres VBO
void BallStick2Renderer::updateDynamicSphereVBO()
{
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
  
  qfloat32 *crd = pAMol->getAtomCrdArray();

  const int nsphs = m_atomdat.size();
  const int sphr_nverts = (m_pSphrTmpl==NULL) ? 0 : m_pSphrTmpl->getSize();
  const int sphr_nfaces = (m_pSphrTmpl==NULL) ? 0 : m_pSphrTmpl->getIndSize();

  Vector3F pos;
  int ivbase, icrd, i, j;
  float rad;
  for (i=0; i<nsphs; ++i) {
    ivbase = i * sphr_nverts;
    icrd = m_atomdat[i].aid*3;
    pos.set(&crd[icrd]);
    rad = m_atomdat[i].rad;
    for (j=0; j<sphr_nverts; ++j) {
      m_pVBO->vertex3f(j+ivbase, pos + m_pSphrTmpl->getVertex(j).scale(rad));
    }
  }
}

void BallStick2Renderer::setCylVerts(int ivb, const Vector3F &pos1, const Vector3F &pos2, float rad)
{
  const int cyl_nverts = m_pCylTmpl->getSize();

  Matrix3F xfm = gfx::CylinderTess<gfx::SingleTessTrait,Vector3F>::calcRotMat(pos1, pos2, rad);
  xfm = xfm.mul( gfx::CylinderTess<gfx::SingleTessTrait,Vector3F>::calcSclMat(pos1, pos2, rad) );

  Vector3F vv, nn;

  for (int j=0; j<cyl_nverts; ++j) {
    vv = m_pCylTmpl->getVertex(j);
    nn = m_pCylTmpl->getNormal(j);
    nn = xfm.mulvec(nn);
    vv = xfm.mulvec(vv);
    vv += pos1;
    m_pVBO->normal3f(j+ivb, nn);
    m_pVBO->vertex3f(j+ivb, vv);
  }
}

void BallStick2Renderer::updateDynamicCylinderVBO()
{
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
  
  qfloat32 *crd = pAMol->getAtomCrdArray();

  int icrd1, icrd2;
  MolAtomPtr pA1, pA2;

  const int nbond = m_bonddat.size();
  const int cyl_nverts = (m_pCylTmpl==NULL) ? 0 : m_pCylTmpl->getSize();
  const int cyl_nfaces = (m_pCylTmpl==NULL) ? 0 : m_pCylTmpl->getIndSize();
  
  const int cyl_ivb = m_nCylVertBase;

  Vector3F pos1, pos2, mpos, vv, nn;
  Matrix3F xfm;
  float rad;
  for (int i=0; i<nbond; ++i) {
    icrd1 = m_bonddat[i].aid1 * 3;
    icrd2 = m_bonddat[i].aid2 * 3;
    pos1.set(&crd[icrd1]);
    pos2.set(&crd[icrd2]);
    mpos = (pos1+pos2).divide(2);
    rad = m_bonddat[i].rad;

    setCylVerts(i*2*cyl_nverts + cyl_ivb, pos1, mpos, rad);
    setCylVerts((i*2+1)*cyl_nverts + cyl_ivb, mpos, pos2, rad);
  }
}

void BallStick2Renderer::setRingVerts(gfx::DrawElemVNCI32 *pVBO, int natoms, int &rng_ivb, const std::vector<Vector3F> &posv, const Vector3F &cen)
{
  int j;

  Vector3F norm;
  Vector3F v1, v2, dv;

  for (j=0; j<natoms; ++j) {
    v1 = posv[(j+1)%natoms] - posv[j];
    v2 = cen - posv[j];
    norm += v1.cross(v2).normalize();
  }
  norm.normalizeSelf();
  dv = norm.scale(m_thickness);
  
  // plus plate
  pVBO->vertex3f(rng_ivb, cen+dv);
  pVBO->normal3f(rng_ivb, norm);
  for (int j=0; j<natoms; ++j) {
    pVBO->vertex3f(rng_ivb + j, posv[j]+dv);
    pVBO->normal3f(rng_ivb + j, norm);
  }
  rng_ivb += (natoms+1);
  
  // minus plate
  pVBO->vertex3f(rng_ivb, cen-dv);
  pVBO->normal3f(rng_ivb, -norm);
  for (int j=0; j<natoms; ++j) {
    pVBO->vertex3f(rng_ivb + j, posv[j]-dv);
    pVBO->normal3f(rng_ivb + j, -norm);
  }
  rng_ivb += (natoms+1);
}

void BallStick2Renderer::updateDynamicRingVBO(gfx::DrawElemVNCI32 *pVBO, int ivbase)
{
  MolCoordPtr pCMol = getClientMol();
  AnimMol *pAMol = static_cast<AnimMol *>(pCMol.get());
  
  qfloat32 *crd = pAMol->getAtomCrdArray();

  const int nring = m_ringdat.size();
  int rng_ivb = ivbase;
  Vector3F cen, norm, v1, v2, dv;
  std::vector<Vector3F> posv;
  int natoms, icrd;
  BOOST_FOREACH (const Ring &rng, m_ringdat) {
    natoms = rng.atoms.size();
    posv.resize(natoms);
    cen = Vector3F();
    for (int j=0; j<natoms; ++j) {
      icrd = rng.atoms[j]*3;
      posv[j].set(&crd[icrd]);
      cen += posv[j];
    }
    cen.divideSelf(natoms);

    setRingVerts(pVBO, natoms, rng_ivb, posv, cen);
  }
}

/// update VBO positions (using MolAtom)
void BallStick2Renderer::updateStaticVBO()
{
  updateStaticSphereVBO();
  updateStaticCylinderVBO();
  updateStaticRingVBO(m_pVBO, m_nRingVertBase);

  //m_pVBO->setUpdated(true);
}


/// Setup spheres VBO
void BallStick2Renderer::updateStaticSphereVBO()
{
  MolCoordPtr pCMol = getClientMol();
  int aid1, aid2;
  MolAtomPtr pA1, pA2;

  const int nsphs = m_atomdat.size();
  const int sphr_nverts = (m_pSphrTmpl==NULL) ? 0 : m_pSphrTmpl->getSize();
  const int sphr_nfaces = (m_pSphrTmpl==NULL) ? 0 : m_pSphrTmpl->getIndSize();

  Vector3F pos, del;
  for (int i=0; i<nsphs; ++i) {
    int ivbase = i * sphr_nverts;
    aid1 = m_atomdat[i].aid;
    pA1 = pCMol->getAtom(aid1);
    pos = Vector3F( pA1->getPos().xyz() );
    float rad = m_atomdat[i].rad;
    for (int j=0; j<sphr_nverts; ++j) {
      m_pVBO->vertex3f(j+ivbase, pos + m_pSphrTmpl->getVertex(j).scale(rad));
    }
  }
}

/////////////////////////
// Setup cylinders VBO
void BallStick2Renderer::updateStaticCylinderVBO()
{
  MolCoordPtr pCMol = getClientMol();
  int aid1, aid2;
  MolAtomPtr pA1, pA2;

  const int nbond = m_bonddat.size();
  const int cyl_nverts = (m_pCylTmpl==NULL) ? 0 : m_pCylTmpl->getSize();
  const int cyl_nfaces = (m_pCylTmpl==NULL) ? 0 : m_pCylTmpl->getIndSize();
  
  const int cyl_ivb = m_nCylVertBase;
  //const int cyl_ifb = m_nCylFaceBase;

  Vector3F pos1, pos2, mpos;

  for (int i=0; i<nbond; ++i) {
    aid1 = m_bonddat[i].aid1;
    aid2 = m_bonddat[i].aid2;
    pA1 = pCMol->getAtom(aid1);
    pA2 = pCMol->getAtom(aid2);
    pos1 = Vector3F( pA1->getPos().xyz() );
    pos2 = Vector3F( pA2->getPos().xyz() );
    mpos = (pos1+pos2).divide(2);
    float rad = m_bonddat[i].rad;

    setCylVerts(i*2*cyl_nverts + cyl_ivb, pos1, mpos, rad);
    setCylVerts((i*2+1)*cyl_nverts + cyl_ivb, mpos, pos2, rad);
  }
}


// Setup rings VBO
void BallStick2Renderer::updateStaticRingVBO(gfx::DrawElemVNCI32 *pVBO, int rng_ivb)
{
  MolCoordPtr pCMol = getClientMol();
  int aid1, aid2;
  MolAtomPtr pA1, pA2;

  const int nring = m_ringdat.size();
  //int rng_ivb = m_nRingVertBase;
  Vector3F cen, norm, v1, v2, dv;
  std::vector<Vector3F> posv;
  BOOST_FOREACH (const Ring &rng, m_ringdat) {
    int natoms = rng.atoms.size();
    posv.resize(natoms);
    cen = Vector3F();
    for (int j=0; j<natoms; ++j) {
      aid1 = rng.atoms[j];
      pA1 = pCMol->getAtom(aid1);
      posv[j] = Vector3F( pA1->getPos().xyz() );
      cen += posv[j];
    }
    cen.divideSelf(natoms);

    setRingVerts(pVBO, natoms, rng_ivb, posv, cen);
    
  }
}

/// update VBO colors
void BallStick2Renderer::updateVBOColor()
{
  MolCoordPtr pMol = getClientMol();
  qlib::uid_t nSceneID = pMol->getSceneID();
  AnimMol *pAMol = NULL;
  if (isUseAnim())
    pAMol = static_cast<AnimMol *>(pMol.get());

  const int nsphs = m_atomdat.size();
  const int sphr_nverts = (m_pSphrTmpl==NULL) ? 0 : m_pSphrTmpl->getSize();
  const int sphr_nfaces = (m_pSphrTmpl==NULL) ? 0 : m_pSphrTmpl->getIndSize();

  MolAtomPtr pA1;
  quint32 cc1;

  // initialize the coloring scheme
  startColorCalc(pMol);

  for (int i=0; i<nsphs; ++i) {
    int ivbase = i * sphr_nverts;
    int aid = m_atomdat[i].aid;
    if (pAMol!=NULL){
      // dynamic update mode
      aid = pAMol->getAtomIDByArrayInd( aid );
    }
    pA1 = pMol->getAtom(aid);

    //cc1 = ColSchmHolder::getColor(pA1)->getCode();
    cc1 = ColSchmHolder::getColor(pA1)->getDevCode(nSceneID);

    for (int j=0; j<sphr_nverts; ++j)
      m_pVBO->color(j+ivbase, cc1);
  }

  const int nbond = m_bonddat.size();
  const int cyl_nverts = (m_pCylTmpl==NULL) ? 0 : m_pCylTmpl->getSize();
  const int cyl_nfaces = (m_pCylTmpl==NULL) ? 0 : m_pCylTmpl->getIndSize();

  const int cyl_ivb = sphr_nverts*nsphs;
  const int cyl_ifb = sphr_nfaces*nsphs;

  int ivb;
  quint32 aid1, aid2;
  MolAtomPtr pA2;
  quint32 cc2;
  for (int i=0; i<nbond; ++i) {
    aid1 = m_bonddat[i].aid1;
    if (pAMol!=NULL){
      // dynamic update mode
      aid1 = pAMol->getAtomIDByArrayInd( aid1 );
    }

    pA1 = pMol->getAtom(aid1);
    cc1 = ColSchmHolder::getColor(pA1)->getDevCode(nSceneID);

    int ivb = (i*2)*cyl_nverts + cyl_ivb;
    for (int j=0; j<cyl_nverts; ++j)
      m_pVBO->color(j+ivb, cc1);

    aid2 = m_bonddat[i].aid2;
    if (pAMol!=NULL){
      // dynamic update mode
      aid2 = pAMol->getAtomIDByArrayInd( aid2 );
    }
    pA2 = pMol->getAtom(aid2);
    cc2 = ColSchmHolder::getColor(pA2)->getDevCode(nSceneID);

    ivb = (i*2+1)*cyl_nverts + cyl_ivb;
    for (int j=0; j<cyl_nverts; ++j)
      m_pVBO->color(j+ivb, cc2);

  }

  setRingCols(m_pVBO, m_nRingVertBase);
  /*
  const int nring = m_ringdat.size();
  int rng_ivb = sphr_nverts*nsphs + cyl_nverts*nbond*2;
  BOOST_FOREACH (const Ring &rng, m_ringdat) {
    int natoms = rng.atoms.size();
    aid1 = rng.piv_atom_id;
    if (pAMol!=NULL){
      // dynamic update mode
      aid1 = pAMol->getAtomIDByArrayInd( aid1 );
    }
    pA1 = pMol->getAtom(aid1);
    cc1 = ColSchmHolder::getColor(pA1)->getDevCode(nSceneID);

    for (int j=0; j<natoms; ++j)
      m_pVBO->color(j+rng_ivb, cc1);
    rng_ivb += (natoms+1);
    for (int j=0; j<natoms; ++j)
      m_pVBO->color(j+rng_ivb, cc1);
    rng_ivb += (natoms+1);
  }
   */

  // finalize the coloring scheme
  endColorCalc(pMol);
}

void BallStick2Renderer::setRingCols(gfx::DrawElemVNCI32 *pVBO, int ibase)
{
  MolCoordPtr pMol = getClientMol();
  qlib::uid_t nSceneID = pMol->getSceneID();
  AnimMol *pAMol = NULL;
  if (isUseAnim())
    pAMol = static_cast<AnimMol *>(pMol.get());

  int aid1;
  int rng_ivb = ibase;
  MolAtomPtr pA1;
  quint32 cc1;

  BOOST_FOREACH (const Ring &rng, m_ringdat) {
    int natoms = rng.atoms.size();
    aid1 = rng.piv_atom_id;
    if (pAMol!=NULL){
      // dynamic update mode
      aid1 = pAMol->getAtomIDByArrayInd( aid1 );
    }
    pA1 = pMol->getAtom(aid1);
    cc1 = ColSchmHolder::getColor(pA1)->getDevCode(nSceneID);

    for (int j=0; j<natoms; ++j)
      pVBO->color(j+rng_ivb, cc1);
    rng_ivb += (natoms+1);
    for (int j=0; j<natoms; ++j)
      pVBO->color(j+rng_ivb, cc1);
    rng_ivb += (natoms+1);
  }
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


