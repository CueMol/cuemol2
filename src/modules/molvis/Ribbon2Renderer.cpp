// -*-Mode: C++;-*-
//
//  Ribbon type2 representation test class
//
//  $Id: Ribbon2Renderer.cpp,v 1.2 2010/11/07 13:10:14 rishitani Exp $

#include <common.h>
#include "molvis.hpp"

#include "Ribbon2Renderer.hpp"
#include "TubeSection.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>

#include <gfx/GradientColor.hpp>
#include <qlib/Matrix3D.hpp>
#include <qlib/parallel.hpp>
#include <qsys/Scene.hpp>

using namespace molvis;
using namespace molvis::detail;
using namespace molstr;
using qlib::Matrix3D;

/////////////////////////////

SecSplDat::SecSplDat(Ribbon2Renderer *pP, int nKind)
     : m_nKind(nKind), m_bCOCached(false), m_pParent(pP)
{
  m_bBnormSpl = false;
  m_bStartExtend = false;
  m_bEndExtend = false;
  m_nResDelta = 0;
  m_bFixStart = false;
  m_bFixEnd = false;
  m_nStartId = 0;
  m_bWsplValid = false;
  m_dWidthAver = 1.0;
}

void SecSplDat::addSheetPoint(SecSplDat *pSheet, double t, double wgt, Vector4D *pvpt)
{
  Vector4D f1;
  pSheet->m_spl.interpolate(t, &f1, pvpt);
  m_posvec.push_back(f1);
  m_posvec.back().w() = wgt;
  m_resvec.push_back(NULL);
  m_srcs.push_back(PtSrc{PtSrc::SHEET, NULL, pSheet, t});
}

void SecSplDat::setLastSrc(const PtSrc &src)
{
  const double wgt = m_posvec.back().w();
  m_srcs.back() = src;
  m_posvec.back() = evalSrc(src);
  m_posvec.back().w() = wgt;
}

Vector4D SecSplDat::evalSrc(const PtSrc &src) const
{
  switch (src.type) {
  case PtSrc::SHEET: {
    Vector4D f1;
    src.pRef->m_spl.interpolate(src.t, &f1);
    return f1;
  }
  case PtSrc::HELIX_JCT:
    return m_pParent->evalHelixJct(src);
  default:
    return src.pAtom->getPos();
  }
}

void SecSplDat::updateGeometry()
{
  const int nsize = m_posvec.size();
  for (int i=0; i<nsize; ++i) {
    const double wgt = m_posvec[i].w();
    m_posvec[i] = evalSrc(m_srcs[i]);
    m_posvec[i].w() = wgt;
  }

  switch (m_nKind) {
  case KIND_HELIX:
    generateHelix(m_pParent->getWidthRho());
    break;
  case KIND_SHEET:
    generateSheet();
    break;
  default:
    generateCoil();
    break;
  }
}

void SecSplDat::cacheCOAtoms()
{
  const std::pair<const MolAtom *, const MolAtom *> none(NULL, NULL);
  m_coatoms.assign(m_resvec.size(), none);
  for (int i=0; i<int(m_resvec.size()); ++i) {
    MolResidue *pres = m_resvec[i];
    if (pres==NULL)
      continue;

    LString sec;
    pres->getPropStr("secondary", sec);
    if (!sec.equals("sheet"))
      continue;

    MolAtomPtr pAC = pres->getAtom("C");
    MolAtomPtr pAO = pres->getAtom("O");
    if (pAC.isnull()||pAO.isnull())
      continue;
    m_coatoms[i] = std::make_pair(pAC.get(), pAO.get());
  }
  m_bCOCached = true;
}

void CartoonGpuElems::clear()
{
  for (std::vector<SecSplDat *> *pv : {&m_cyls, &m_sheets, &m_coils}) {
    std::for_each(pv->begin(), pv->end(), qlib::delete_ptr<SecSplDat*>());
    pv->clear();
  }
  m_chunks.clear();
}

bool SecSplDat::generate()
{
  int nsize = m_posvec.size();

  m_spl.setStartId(m_nStartId);
  m_spl.setSize(nsize);

  for (int i=0; i<nsize; ++i)
    m_spl.setPoint(i+m_nStartId, m_posvec[i]);

  if (!m_spl.generate())
    return false;

  return true;
}

bool SecSplDat::generateHelix(double wrho)
{
  if (!generate())
    return false;

  //////////
  // Generate width interpolator

  int nsize = m_posvec.size();
  m_wspl.setSize(nsize);
  m_wspl.setRho(wrho);
  double wsum = 0.0;
  for (int i=0; i<nsize; ++i) {
    Vector4D orig = m_spl.getPoint(i);
    Vector4D intp;
    m_spl.interpolate(i, &intp);
    double len = (orig-intp).length();
    m_wspl.setValue(i, len);
    wsum += len;
  }

  if (nsize>0)
    m_dWidthAver = wsum/double(nsize);
  else
    m_dWidthAver = 1.0; // XXX

  // The width spline needs at least three points; a shorter helix falls
  // back to the average width in renderHelixTo().
  m_bWsplValid = m_wspl.generate();

  return true;
}

bool SecSplDat::generateSheet()
{
  m_bBnormSpl = false;
  m_bnorm_ave = Vector4D();
  
  m_spl.setUseWeight(true);
  if (!generate())
    return false;

  //////////
  // Generate binormal vector interpolator

  Vector4D prev_bnorm, bnorm_ave;
  int nsize = m_posvec.size();

  int ist = 1, ien = nsize-1;

  if (m_bStartExtend)
    ist += 1;
  if (m_bEndExtend)
    ien -= 1;

  if (ien-ist+1<=0) {
    ist = 1;
    ien = nsize-1;    
  }

  if ( ist<1 || ien>=(nsize-1) )
    return false;

  m_bnspl.setSize(ien-ist+1);

  int ind=0;
  for (int i=ist; i<=ien; ++i) {
    Vector4D bnorm = calcBinormVec(i);
    
    // Preserve consistency of the direction
    if (!prev_bnorm.isZero()) {
      double costh = bnorm.dot(prev_bnorm);
      if (costh<0)
        bnorm = -bnorm;
    }

    //m_bnspl.setPoint(i-1, p1+bnorm);
    m_bnspl.setPoint(ind, bnorm);
    bnorm_ave += bnorm;
    prev_bnorm = bnorm;
    ++ind;
  }

  m_bnorm_ave = bnorm_ave.normalize();

  if (!m_bnspl.generate())
    return false;

  m_bBnormSpl = true;

  return true;
}

bool SecSplDat::calcProtBinormVec(int nres, Vector4D &res)
{
  // check protein case (the C/O atoms of a protein sheet residue)
  if (!m_bCOCached)
    cacheCOAtoms();
  const MolAtom *pAC = m_coatoms[nres].first;
  const MolAtom *pAO = m_coatoms[nres].second;
  if (pAC==NULL||pAO==NULL)
    return false;

  Vector4D v1 = pAO->getPos() - pAC->getPos();
  
  // normalization
  double len = v1.length();
  if (len>=F_EPS4)
    res = v1.scale(1.0/len);
  else
    // singularity case: cannot determine binomal vec.
    return false;

  return true;
}

/// calc binormal vector
Vector4D SecSplDat::calcBinormVec(int i)
{
  Vector4D bnorm;

  // check protein case
  if (calcProtBinormVec(i, bnorm))
    return bnorm;

  // generic case
  if (i-1<0 || i+1>=m_posvec.size()) {
    return Vector4D(1.0, 0.0, 0.0);
  }
  Vector4D p0 = m_posvec[i-1];
  Vector4D p1 = m_posvec[i];
  Vector4D p2 = m_posvec[i+1];

  bnorm = (p1 - p0).cross(p2 - p1);
  
  // normalization
  double len = bnorm.length();
  if (len>=F_EPS4)
    bnorm = bnorm.scale(1.0/len);
  else
    // singularity case: cannot determine binomal vec.
    bnorm = Vector4D(1.0, 0.0, 0.0);

  return bnorm;
}

Vector4D SecSplDat::getBnormVec(double t)
{
  Vector4D rval;

  if (!m_bBnormSpl) {
    if (m_bnorm_ave.isZero3D(F_EPS4)) {
      // singularity case: bnorm vec wasn't determined correctly
      return Vector4D(1,0,0);
    }
    else {
      return m_bnorm_ave;
    }
  }

  double par = t-1;
  if (m_bStartExtend)
    par -= 1;
  m_bnspl.interpolate(par, &rval);
  return rval.normalize();
}

Vector4D SecSplDat::getCoilBnormVec(double t)
{
  Vector4D rval;

  if (!m_bBnormSpl) {
    if (m_bnorm_ave.isZero3D(F_EPS4)) {
      // singularity case: bnorm vec wasn't determined correctly
      return Vector4D(1,0,0);
    }
    else {
      return m_bnorm_ave;
    }
  }

  m_bnspl.interpolate(t, &rval);

/*
XXX: DEBUG
  double dprev = ::floor(t);
  if (qlib::isNear4(dprev, t)) {
    int i = (int) dprev;
    if (0<=i && i<m_resvec.size()) {
      MolResidue *pRes = m_resvec[i];
      if (pRes!=NULL && pRes->getIndex()==102) {
        
        Vector4D curpos, dv;
        m_spl.interpolate(t, &curpos, &dv);
        Vector4D bnorm = rval - curpos;

        LOG_DPRINTLN("Get %s i=%d, curpos=%s, bnorm=%s, point=%s", pRes->toString().c_str(), i,
                     curpos.toString().c_str(), bnorm.toString().c_str(), rval.toString().c_str());
      }
    }
  }
*/
  
  return rval;
}

bool SecSplDat::generateCoil()
{
  m_bBnormSpl = false;
  // m_bnorm_ave = Vector4D();

  int nsize = m_posvec.size();
  m_spl.setSize(nsize);
  m_spl.setUseWeight(true);
  if (m_bFixStart)
    m_spl.setFixStart(m_vStartD1);
  if (m_bFixEnd)
    m_spl.setFixEnd(m_vEndD1);
  
  if (!generate()) {
    LOG_DPRINTLN("Generate coil generate failed!!");
    return false;
  }
  
  //////////
  // Generate binormal vector interpolator

/*
  int ist = 1, ien = nsize-2;
  if (m_bStartExtend)
    ist += 1;
  if (m_bEndExtend)
    ien -= 1;

  if (ien-ist+1<=0) {
    ist = 1;
    ien = nsize-1;    
  }
*/
  
  m_bnspl.setSize(nsize);
  m_bnspl.setRho(-10.0);
  m_bnspl.setStartId(m_nStartId);

  Vector4D prev_dv, prev_bnorm;

  for (int i=0; i<nsize; ++i) {

    int ii = i;
    if (i==0 && nsize>=3)
      ii = 1;
    if (i==nsize-1 && nsize>=3)
      ii = nsize-2;

    Vector4D bnorm = calcBinormVec(ii);
    
    // get curpos and dv/dt(=dv)
    Vector4D curpos, dv;
    if (!m_spl.interpolate(i+m_nStartId, &curpos, &dv)) {
      LOG_DPRINTLN("CalcBnorm> fatal error: cannot interpolate");
      return false;
    }
    dv = dv.normalize();

    // preserve consistency of binormal vector directions
    if (!prev_bnorm.isZero() && !prev_dv.isZero()) {
      Vector4D ax = dv.cross(prev_dv);
      double axlen = ax.length();
      if (axlen>F_EPS4) {
        // align the previous binorm vectors based on the dv (tangential vector)
        ax = ax.scale(1.0/axlen);
        double cosph = prev_dv.dot(dv)/(prev_dv.length()*dv.length());
        double sinph = sqrt(1.0-cosph*cosph);
        Matrix3D rotmat = Matrix3D::makeRotMat(ax, cosph, sinph);
        prev_bnorm = rotmat.mulvec(prev_bnorm);
      }
      double costh = bnorm.dot(prev_bnorm);
      if (costh<0)
        bnorm = -bnorm;
    }

    Vector4D intp = curpos + bnorm;

/*
  XXX: DEBUG
    MolResidue *pRes = m_resvec[i];
    if (pRes!=NULL && pRes->getIndex()==102) {
      LOG_DPRINTLN("%s [%s] i=%d, curpos=%s, bnorm=%s, point=%s",
                   pRes->toString().c_str(),
                   pRes->getPivotAtom()->getPos().toString().c_str(),i,
                   curpos.toString().c_str(), bnorm.toString().c_str(), intp.toString().c_str());
    }
 */
    m_bnspl.setPoint(i+m_nStartId, intp);

    prev_bnorm = bnorm;
    prev_dv = dv;
  }

 // m_bnorm_ave = bnorm_ave.normalize();

  if (!m_bnspl.generate()) {
    LOG_DPRINTLN("Generate coil bnspl generate failed!!");
    return false;
  }
  
  m_bBnormSpl = true;

  return true;
}

//////////////////////////////////////////

void SecStrTab::setSecStr(int ind, const MolResiduePtr &pRes)
{
  LString sec, pfx;
  pRes->getPropStr("secondary2", sec);
  if (sec.length()>=2)
    pfx= sec.substr(1,1);
  
  if (sec.startsWith("H") || sec.startsWith("G") || sec.startsWith("I"))
    m_data[ind*2+0] = 'H';
  else if (sec.startsWith("E"))
    m_data[ind*2+0] = 'E';
  else
    m_data[ind*2+0] = 'C';

  if (pfx.equals("s"))
    m_data[ind*2+1] = 's';
  else if (pfx.equals("e"))
    m_data[ind*2+1] = 'e';
  else
    m_data[ind*2+1] = ' ';
}

LString SecStrTab::getSecStr(int ind)
{
  int char1 = m_data[ind*2+0];
  int char2 = m_data[ind*2+1];

  LString ret(char1);
  if (char2!=' ')
    ret += char2;

  return ret;
}


//////////////////////////////////////////

Ribbon2Renderer::Ribbon2Renderer()
     : super_t(),
       m_ptsCoil(MB_NEW TubeSection()),
       m_ptsHelix(MB_NEW TubeSection()),
       m_ptsSheet(MB_NEW TubeSection()),
       m_pSheetHead(MB_NEW JctTable()),
       m_ptsRibHelix(MB_NEW TubeSection()),
       m_pRibHelixTail(MB_NEW JctTable()),
       m_pRibHelixHead(MB_NEW JctTable())
{

  m_dHelixSmo = 3.0;
  m_dAxExt = 0.5;
  m_dWidthPlus = 0.35;
  m_dWidthRho = 1.0;
  m_nHelixWidthMode = HWIDTH_AVER;
  m_dHelixWidth = 2.3;

  m_dSheetSmo = 2.0;
  m_dSheetWsmo = 5.0;

  m_dCoilSmo = 0.0;

  m_bDumpCurv = false;
  //m_bRibbonHelix = true;
  m_bRibbonHelix = false;

  m_bSegEndFade = false;

  m_bLazyDiffVecs = false;

  // setup sub properties (call LScrObjBase::setupParentData())
  super_t::setupParentData("helix");
  super_t::setupParentData("sheet");
  super_t::setupParentData("coil");
  super_t::setupParentData("sheethead");

  super_t::setupParentData("ribhelix");
  super_t::setupParentData("ribhelix_head");
  super_t::setupParentData("ribhelix_tail");
}

Ribbon2Renderer::~Ribbon2Renderer()
{
  clearHelixData();
  clearSheetData();
  clearCoilData();
}

const char *Ribbon2Renderer::getTypeName() const
{
  return "cartoon";
}

void Ribbon2Renderer::beginRend(DisplayContext *pdl)
{
  tubeGpuBeginRend(pdl);
  if (pdl==NULL && tubeGpuBuilder().getMode()==TubeMeshBuilder::MODE_BUILD) {
    // the elements of the mesh being built (see endSegment())
    m_gpuElems.clear();
  }

  m_diffvecs.clear();
  m_bLazyDiffVecs = false;
  setupSections();
  //super_t::beginRend(pdl);
}

void Ribbon2Renderer::endRend(DisplayContext *pdl)
{
}

void Ribbon2Renderer::setupSections()
{
  // The tables depend only on the section properties (a change of them
  // rebuilds the mesh), so a chunked update reuses them
  if (!m_bRibbonHelix) {
    m_ptsHelix->setWidth(1.0);
    m_ptsHelix->setupSectionTable();
    m_ptsSheet->setupSectionTable();
    m_pSheetHead->setup(getAxialDetail()+1, m_ptsSheet.get(), m_ptsCoil.get(), true);
    m_ptsCoil->setupSectionTable();
  }
  else {
    m_ptsSheet->setupSectionTable();
    m_pSheetHead->setup(getAxialDetail()+1, m_ptsSheet.get(), m_ptsCoil.get(), true);
    m_ptsCoil->setupSectionTable();
    m_ptsRibHelix->setupSectionTable();
    m_pRibHelixHead->setup(getAxialDetail()+1, m_ptsRibHelix.get(), m_ptsCoil.get(), true);
    m_pRibHelixTail->setup(getAxialDetail()+1, m_ptsCoil.get(), m_ptsRibHelix.get());
  }
}

//////////

void Ribbon2Renderer::beginSegment(DisplayContext *pdl, MolResiduePtr pRes)
{
  m_resvec.clear();
}

void Ribbon2Renderer::rendResid(DisplayContext *pdl, MolResiduePtr pRes)
{
  m_resvec.push_back(pRes);
}

void Ribbon2Renderer::endSegment(DisplayContext *pdl, MolResiduePtr pEndRes)
{
  m_indvec.resize( m_resvec.size() );
  m_sstab.setSize( m_resvec.size() );
  int i=0;
  BOOST_FOREACH (const MolResiduePtr &elem, m_resvec) {
    m_sstab.setSecStr(i, elem);
    ++i;
  }

  if (!m_bRibbonHelix) {
    // Cylinder-shaped helix mode
    buildHelixData();
  }
  else {
    // ribbon-shaped helix mode (the helices are drawn as parts of the coils)
    clearHelixData();
  }
  buildSheetData();
  buildCoilData();

  if (m_bRibbonHelix) {
    BOOST_FOREACH (SecSplDat *pElem, m_coils) {
      pElem->m_hctab = makeHCTab(pElem);
    }
  }

  // Building the GPU mesh: record each element as one chunk and keep the
  // elements, so that a coordinate update redraws them concurrently
  TubeMeshBuilder &mb = tubeGpuBuilder();
  const bool bRecord = (pdl==NULL && mb.getMode()==TubeMeshBuilder::MODE_BUILD);

  // helices, sheets, then coils
  for (std::deque<SecSplDat *> *pList : {&m_cylinders, &m_sheets, &m_coils}) {
    BOOST_FOREACH (SecSplDat *pElem, *pList) {
      if (bRecord) {
        mb.beginChunk();
        m_gpuElems.m_chunks.push_back(pElem);
      }
      renderElemTo(&mb, pElem);
      if (bRecord)
        mb.endChunk();
    }
  }

  if (m_bDumpCurv)
    curvature();
  
  // update diffvecs table
  updateDiffVecs();

  if (bRecord) {
    // the GPU mesh owns the elements from here on
    m_gpuElems.m_cyls.insert(m_gpuElems.m_cyls.end(), m_cylinders.begin(), m_cylinders.end());
    m_gpuElems.m_sheets.insert(m_gpuElems.m_sheets.end(), m_sheets.begin(), m_sheets.end());
    m_gpuElems.m_coils.insert(m_gpuElems.m_coils.end(), m_coils.begin(), m_coils.end());
    for (std::deque<SecSplDat *> *pList : {&m_cylinders, &m_sheets, &m_coils}) {
      // (the update recomputes the geometry concurrently: no lazy lookup there)
      BOOST_FOREACH (SecSplDat *pElem, *pList) {
        if (!pElem->m_bCOCached)
          pElem->cacheCOAtoms();
      }
      pList->clear();
    }
  }

  m_indvec.clear();
  m_resvec.clear();
}

void Ribbon2Renderer::renderElemTo(TubeMeshBuilder *pmb, SecSplDat *pC)
{
  switch (pC->m_nKind) {
  case SecSplDat::KIND_HELIX:
    renderHelixTo(pmb, pC);
    break;
  case SecSplDat::KIND_SHEET:
    renderSheetTo(pmb, pC);
    break;
  default:
    if (m_bRibbonHelix)
      renderHelixCoilTo(pmb, pC);
    else
      renderCoilTo(pmb, pC);
    break;
  }
}

void Ribbon2Renderer::tubeGpuPrepareChunkUpdate()
{
  // The coils take points from the splines of the neighbouring helices and
  // sheets (junctions): recompute those first, then the coils
  const std::vector<SecSplDat *> &cyls = m_gpuElems.m_cyls;
  const std::vector<SecSplDat *> &sheets = m_gpuElems.m_sheets;
  const std::vector<SecSplDat *> &coils = m_gpuElems.m_coils;
  const std::size_t ncyls = cyls.size();
  qlib::parallel_for(0, ncyls+sheets.size(), [&](std::size_t i) {
    (i<ncyls ? cyls[i] : sheets[i-ncyls])->updateGeometry();
  });
  qlib::parallel_for(0, coils.size(), [&](std::size_t i) {
    coils[i]->updateGeometry();
  });

  // getDiffVec() rebuilds the differential vectors from the new geometry
  m_diffvecs.clear();
  m_bLazyDiffVecs = true;
}

void Ribbon2Renderer::tubeGpuUpdateChunk(int i, TubeMeshBuilder *pmb)
{
  renderElemTo(pmb, m_gpuElems.m_chunks[i]);
}

/////////////////////////////////////////////////////////////////
// Helix rendering routines

static inline bool isHelix(const LString &sec)
{
  return sec.startsWith("H") || sec.startsWith("G") || sec.startsWith("I");
}

static inline bool isSheet(const LString &sec)
{
  return sec.startsWith("E");
}

static inline bool isCoil(const LString &sec, bool bCylHlx)
{
  //return !sec.equals("E") &&
  //!sec.equals("H") && !sec.equals("G") && !sec.equals("I");

  if (bCylHlx)
    return !isSheet(sec) && !isHelix(sec);
  else
    return !isSheet(sec);
}

void Ribbon2Renderer::clearHelixData()
{
  std::for_each(m_cylinders.begin(),
                m_cylinders.end(),
                qlib::delete_ptr<SecSplDat*>());
  m_cylinders.clear();
}

void Ribbon2Renderer::buildHelixData()
{
  clearHelixData();

  int nCylInd = 0;
  int nresvec = m_resvec.size();
  SecSplDat *pCyl = NULL;

  for (int i=0; i<nresvec; ++i) {
    MolResiduePtr pRes = m_resvec[i];
    MolResiduePtr pPrevRes, pNextRes;
    if (i>=1) pPrevRes = m_resvec[i-1];
    if (i<=nresvec-2) pNextRes = m_resvec[i+1];
    LString sec, pfx;
    //pRes->getPropStr("secondary2", sec);
    sec = m_sstab.getSecStr(i);
    if (sec.length()>=2)
      pfx= sec.substr(1,1);

    if ( !(isHelix(sec)) )
      continue;

    MB_DPRINTLN("BuildHelix> %s %s", pRes->getStrIndex().c_str(), sec.c_str());
    m_indvec[i] = nCylInd;

    // Default: along the way of helix
    int nsw = 0;

    if (pfx.equals("s")) {
      // start of helix
      nsw = 1;
    }
    else if (pfx.equals("e")) {
      if (pCyl==NULL) {
        // singular helix (truncated case)
        // --> ignore
        continue;
      }
      // end of helix
      nsw = 2;
    }
    else if (pCyl==NULL)
      nsw = 1; // Truncated helix (by selection?)

    if (nsw==1) {
      // start
      MB_ASSERT(pCyl==NULL);
      pCyl = MB_NEW SecSplDat(this, SecSplDat::KIND_HELIX);
      pCyl->m_spl.setRho(m_dHelixSmo);
      pCyl->m_nResDelta = i;
      if (!pPrevRes.isnull()) {
        pCyl->m_bStartExtend = true;
        pCyl->addPoint( this, pPrevRes );
        pCyl->m_nResDelta = i-1;
      }
      pCyl->addPoint( this, pRes );
    }
    else if (nsw==2) {
      // end
      MB_ASSERT(pCyl!=NULL);
      pCyl->addPoint( this, pRes );
      if (!pNextRes.isnull()) {
        pCyl->m_bEndExtend = true;
        pCyl->addPoint( this, pNextRes );
      }
      bool res = pCyl->generateHelix(m_dWidthRho);
      m_cylinders.push_back(pCyl);
      pCyl = NULL;
      ++nCylInd;
    }
    else {
      if (pCyl!=NULL)
        pCyl->addPoint( this, pRes );
    }

  } // for

  if (pCyl!=NULL) {
    // truncated helix (by selection?)
    pCyl->generateHelix(m_dWidthRho);
    m_cylinders.push_back(pCyl);
  }

}

gfx::ColorPtr Ribbon2Renderer::calcColor(double at, SecSplDat *pCyl)
{
  double t = at;
  const double tend = pCyl->m_spl.getPoints()-1.0;

  if (pCyl->m_bStartExtend && at<1.0)
    t = 1.0;
  else if (pCyl->m_bEndExtend && at>tend-1.0)
    t = tend-1.0;

  int nprev = int(::floor(t));
  int nnext = int(::ceil(t));
  double rho = t - double(nprev);

  nprev += pCyl->m_nResDelta;
  nnext += pCyl->m_nResDelta;

  MolResiduePtr pPrev = getResByIndex(nprev);
  MolResiduePtr pNext = getResByIndex(nnext);

  return super_t::calcColor(rho, isSmoothColor(), pPrev, pNext);
}

int Ribbon2Renderer::calcHitName(double at, SecSplDat *pCyl) const
{
  double t = at;
  const double tend = pCyl->m_spl.getPoints()-1.0;

  if (pCyl->m_bStartExtend && at<1.0)
    t = 1.0;
  else if (pCyl->m_bEndExtend && at>tend-1.0)
    t = tend-1.0;

  int nprev = int(::floor(t));
  int nnext = int(::ceil(t));
  double rho = t - double(nprev);

  nprev += pCyl->m_nResDelta;
  nnext += pCyl->m_nResDelta;

  MolResiduePtr pPrev = getResByIndex(nprev);
  MolResiduePtr pNext = getResByIndex(nnext);

  return super_t::calcHitName(rho, pPrev, pNext);
}

void Ribbon2Renderer::renderHelixTo(TubeMeshBuilder *pmb, SecSplDat *pC)
{
  const int naxdet = getAxialDetail();
  const TubeSection *pTS = m_ptsHelix.get();

  double tstart=0.0;
  if (pC->m_bStartExtend)
    tstart = 1.0-m_dAxExt;

  double tend = pC->m_spl.getPoints()-1.0;
  if (pC->m_bEndExtend)
    tend -= 1.0-m_dAxExt;

  int ndelta = (int) ::floor( (tend-tstart)* naxdet );
  if (ndelta<=0) {
    // degenerated (single point)
    // TO DO: impl
    return;
  }
  const double fdelta = (tend-tstart)/double(ndelta);

  Vector4D p0 = pC->m_spl.getPoint( pC->m_bStartExtend?1:0 );
  Vector4D e11, e12;

  Vector4D f1, f2, vpt;
  Vector4D bnorm_base;

  // Color objects used in the axial-loop
  ColorPtr pCol;

  double width, dwidth;

  TubeSection::TessState ts;
  pTS->startTess(ts);

  // axial step loop
  for (int j=0; j<=ndelta; ++j) {
    double t = tstart + double(j)*fdelta; ///double(naxdet);
    // The geometry-only update skips the color/name computation
    if (pmb->wantColor())
      pCol = calcColor(t, pC);
    if (pmb->wantName())
      pmb->loadName(calcHitName(t, pC));
    pC->m_spl.interpolate(t, &f1, &vpt);
    width = calcHelixWidth(pC, t, dwidth);
    if (j==0) {
      bnorm_base = f1-p0;
    }

    e11 = bnorm_base.cross(vpt).normalize().scale(width);
    e12 = ( vpt.cross(e11) ).normalize().scale(width);

    if (j==0) {
      // make the tube cap.
      pmb->color(pCol);
      m_ptsHelix->makeCap(pmb, true, getStartCapType(), f1, vpt, e11, e12);
    }

    pTS->doTess(ts, pmb, f1, pCol, isSmoothColor(), e11, e12, vpt.scale(-dwidth));

    if (j==ndelta) {
      // make cap at the end point.
      pmb->color(pCol);
      m_ptsHelix->makeCap(pmb, false, getEndCapType(), f1, vpt, e11, e12);
    }

    bnorm_base = e12;
  }
}

double Ribbon2Renderer::calcHelixWidth(SecSplDat *pC, double t, double &dwidth) const
{
  double width;
  if (m_nHelixWidthMode==HWIDTH_WAVY && pC->m_bWsplValid) {
    pC->m_wspl.interpolate(t, &width, &dwidth);
  }
  else if (m_nHelixWidthMode==HWIDTH_AVER || m_nHelixWidthMode==HWIDTH_WAVY) {
    // average width (also the fallback for a wavy helix too short for its spline)
    width = pC->m_dWidthAver;
    dwidth = 0.0;
  }
  else {
    // HWIDTH_CONST
    width = m_dHelixWidth;
    dwidth = 0.0;
  }
  return width + m_dWidthPlus;
}

PtSrc Ribbon2Renderer::findHelixJct(int ires)
{
  MolResiduePtr pRes = m_resvec[ires];
  PtSrc src{PtSrc::HELIX_JCT, ensureNotNull(getPivotAtom(pRes)).get(), NULL, 0.0};

  // Find the cylinder that holds this residue (m_indvec is shared with the
  // sheets and may be stale, so check the residue identity as well)
  const int icyl = m_indvec[ires];
  if (icyl<0 || icyl>=int(m_cylinders.size()))
    return src;
  SecSplDat *pC = m_cylinders[icyl];
  const int ipt = ires - pC->m_nResDelta;
  if (ipt<0 || ipt>=int(pC->m_resvec.size()) || pC->m_resvec[ipt]!=pRes.get())
    return src;

  // Skip the degenerated cylinder that renderHelixTo() does not draw
  double tstart = pC->m_bStartExtend ? 1.0-m_dAxExt : 0.0;
  double tend = pC->m_spl.getPoints()-1.0;
  if (pC->m_bEndExtend)
    tend -= 1.0-m_dAxExt;
  if (int(::floor((tend-tstart)*getAxialDetail()))<=0)
    return src;

  src.pRef = pC;
  src.t = double(ipt);
  return src;
}

Vector4D Ribbon2Renderer::evalHelixJct(const PtSrc &src) const
{
  const Vector4D pos = src.pAtom->getPos();
  SecSplDat *pC = src.pRef;
  if (pC==NULL)
    return pos;

  const double t = src.t;
  Vector4D axpos;
  pC->m_spl.interpolate(t, &axpos);
  double dwidth;
  const double lim = qlib::max(0.0, calcHelixWidth(pC, t, dwidth) - m_ptsCoil->getWidth());

  // Pull the pivot radially toward the axis so that the coil tube stays
  // inside the cylinder (the pivot inside the cylinder is left untouched)
  Vector4D dv = pos - axpos;
  dv.w() = 0.0;
  const double len = dv.length();
  if (len<=lim)
    return pos;
  Vector4D res = axpos + dv.scale(lim/len);
  res.w() = pos.w();
  return res;
}

////////////////////////////////////////////////////////////////////////////////
// Sheet routines

double Ribbon2Renderer::getAnchorWgt(MolResiduePtr pRes) const
{
  if (m_pAnchorSel.isnull()||m_pAnchorSel->toString().isEmpty())
    return 1.0;
  MolAtomPtr pAtom = getPivotAtom(pRes);
  if (m_pAnchorSel->isSelected(pAtom))
    return m_dAnchorWgt;
  return 1.0;
}

void Ribbon2Renderer::clearSheetData()
{
  std::for_each(m_sheets.begin(),
                m_sheets.end(),
                qlib::delete_ptr<SecSplDat*>());
  m_sheets.clear();
}

void Ribbon2Renderer::buildSheetData()
{
  clearSheetData();

  int nCylInd = 0;
  int nresvec = m_resvec.size();
  LString prev_ss;
  SecSplDat *pSh = NULL;
  MolResiduePtr pPrevRes;

  for (int i=0; i<nresvec; ++i) {
    MolResiduePtr pRes = m_resvec[i];

    LString sec;
    //pRes->getPropStr("secondary2", sec);
    sec = m_sstab.getSecStr(i);
    //MB_DPRINTLN("Cart.buildSh> %s %s", pRes->getStrIndex().c_str(), sec.c_str());

    if (!isSheet(sec)) {
      if (isSheet(prev_ss)) {
        // end of sheet (E x)
        MB_ASSERT(pSh!=NULL);
        pSh->addPoint( this, pRes, getAnchorWgt(pRes) );
        pSh->m_bEndExtend = true;

        bool res = pSh->generateSheet();
        m_sheets.push_back(pSh);
        pSh = NULL;
        ++nCylInd;
      }
    }
    else {

      // set sheet index
      m_indvec[i] = nCylInd;

      if (!isSheet(prev_ss)) {
        // start of sheet (x E) or (. E)

        MB_ASSERT(pSh==NULL);
        pSh = MB_NEW SecSplDat(this, SecSplDat::KIND_SHEET);
        pSh->m_spl.setRho(m_dSheetSmo);
        pSh->m_bnspl.setRho(m_dSheetWsmo);
        pSh->m_nResDelta = i;
        if (!pPrevRes.isnull()) {
          pSh->m_bStartExtend = true;
          pSh->addPoint( this, pPrevRes, getAnchorWgt(pRes) );
          pSh->m_nResDelta = i-1;
        }
        pSh->addPoint( this, pRes, getAnchorWgt(pRes) );
      }
      else {
        // mid of sheet (E E)
        if (pSh!=NULL)
          pSh->addPoint( this, pRes, getAnchorWgt(pRes) );
      }
    }

    prev_ss = sec;
    pPrevRes = pRes;
  } // for

  if (pSh!=NULL) {
    // the last residue is sheet (E E .)
    // --> build the last sheet
    bool res = pSh->generateSheet();
    m_sheets.push_back(pSh);
    pSh = NULL;
  }

}

void Ribbon2Renderer::renderSheetTo(TubeMeshBuilder *pmb, detail::SecSplDat *pC)
{
  Vector4D zerovec(0,0,0);
  const TubeSection *pTS = m_ptsSheet.get();
  const JctTable *pHead = m_pSheetHead.get();
  TubeSection::TessState ts;

  const int naxdet = getAxialDetail();
  double tstart=0.0;
  const double ext = 0.5;
  if (pC->m_bStartExtend)
    tstart = 1.0-ext;
  
  double tend = pC->m_spl.getPoints()-1.0;
  if (pC->m_bEndExtend)
    tend -= 1.0-ext;
  
  int ndelta = (int) ::floor( ((tend-1.0)-tstart)* naxdet );
  if (ndelta<=0) {
    // degenerated (single point)
    // TO DO: impl
    //continue;
    return;
  }
  const double fdelta = ((tend-1.0)-tstart)/double(ndelta);
  
  Vector4D e11, e12, bntmp;
  Vector4D f1, f2, vpt;
  
  // Color objects used in the axial-loop
  ColorPtr pCol;
  
  //MB_DPRINTLN("Sheet %d (t: %f->%f)", i, tstart, tend);
  
  // Draw sheet body

  pmb->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
  //pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);
  pTS->startTess(ts);
  
  // axial step loop
  for (int j=0; j<=ndelta; ++j) {
    const double t = tstart + double(j)*fdelta; // /double(naxdet);
    if (pmb->wantColor())
      pCol = calcColor(t, pC);
    if (pmb->wantName())
      pmb->loadName(calcHitName(t, pC));
    pC->m_spl.interpolate(t, &f1, &vpt);
    vpt = vpt.normalize();
    
    bntmp = pC->getBnormVec(t);
    if (qlib::isNear4(bntmp.length(), 0.0)) {
      MB_DPRINTLN("bntmp zero error!!");
    }
    e11 = bntmp.cross(vpt).normalize();
    e12 = vpt.cross(e11);
    
    if (j==0) {
      // make the tube cap.
      pmb->color(pCol);
      m_ptsSheet->makeCap(pmb, true, getStartCapType(), f1, vpt, e11, e12);
    }
    
    pTS->doTess(ts, pmb, f1, pCol, isSmoothColor(), e11, e12, zerovec );
    
    if (j==ndelta) {
      // update the tstart for head drawing
      tstart = t;
    }
  }
  
    
  /////////////////////////////////////////////

  // Draw arrow head
  ndelta = pHead->getSize();

  Vector4D escl, prev_escl, xe11, xe12;
  double dpar;
  double prev_dpar = -1.0;

  // initialize previous E scale
  pHead->get(0, dpar, prev_escl);

  pmb->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
  pTS->startTess(ts);

  for (int i=0; i<ndelta; i++) {
    // Get E-scale value
    pHead->get(i, dpar, escl);
    const double t = tstart + dpar;

    if (pmb->wantColor())
      pCol = calcColor(t, pC);
    if (pmb->wantName())
      pmb->loadName(calcHitName(t, pC));
    pC->m_spl.interpolate(t, &f1, &vpt);
    const Vector4D ev = vpt.normalize();
    
    bntmp = pC->getBnormVec(t);
    e11 = bntmp.cross(ev).normalize();
    e12 = ev.cross(e11);

    xe11 = e11.scale(escl.x());
    xe12 = e12.scale(escl.y());

    if ( qlib::isNear4(dpar,prev_dpar) ) {
      // uncontinuous point of arrow head
      // make partition polygons
      
      pmb->color(pCol);
      m_ptsSheet->makeDisconJct(pmb, f1, ev, e11, e12, prev_escl, escl);
      pmb->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
      pTS->startTess(ts);
    }
    
    pTS->doTess(ts, pmb, f1, pCol, isSmoothColor(),
                       e11, e12,
                       escl, vpt);

    ////////////////

    prev_escl = escl;
    prev_dpar = dpar;
  }

    pmb->setPolygonMode(gfx::DisplayContext::POLY_FILL);

  // make cap at the end point.
  pmb->color(pCol);
  m_ptsSheet->makeCap(pmb, false, getEndCapType(), f1, vpt, xe11, xe12);

}

////////////////////////////////////////////////////////////////////////////////
// Coil routines

double Ribbon2Renderer::getAnchorWgt2(MolResiduePtr pRes, const LString &sstr) const
{
  if (m_bRibbonHelix && isHelix(sstr))
    return 10.0; // strong weight for stick to the Ca position in ribbon helix
  return getAnchorWgt(pRes);
}

void Ribbon2Renderer::getCoilResids(double at, SecSplDat *pCyl,
                                    MolResiduePtr &pResPrev,
                                    MolResiduePtr &pResNext,
                                    double &resrho, int *piPrev/*=NULL*/)
{
  double t = at;
  double tstart = 0.0;
  double tend = pCyl->m_nRealSize;

  if (pCyl->m_bStartExtend)
    tstart += 1.0;
  if (pCyl->m_bEndExtend)
    tend -= 1.0;

  // MB_DPRINTLN("getCoilRes> t=%f, tst=%f, ten-1=%f", t, tstart, tend-1.0);
  // truncate between tstart ~ tend-1.0
  t = qlib::trunc(t, tstart, tend-1.0);
  
  int nprev = int(::floor(t));
  int nnext = nprev+1; //int(::ceil(t));
  resrho = t - double(nprev);

  nprev += pCyl->m_nResDelta;
  nnext += pCyl->m_nResDelta;

  pResPrev = getResByIndex(nprev);
  pResNext = getResByIndex(nnext);

  if (piPrev!=NULL)
    *piPrev = nprev;
}

gfx::ColorPtr Ribbon2Renderer::calcCoilColor(double at, SecSplDat *pCyl)
{
  double rho;
  MolResiduePtr pPrev;
  MolResiduePtr pNext;
  getCoilResids(at, pCyl, pPrev, pNext, rho);
  return super_t::calcColor(rho, isSmoothColor(), pPrev, pNext);
}

int Ribbon2Renderer::calcCoilHitName(double at, SecSplDat *pCyl)
{
  double rho;
  MolResiduePtr pPrev;
  MolResiduePtr pNext;
  getCoilResids(at, pCyl, pPrev, pNext, rho);
  return super_t::calcHitName(rho, pPrev, pNext);
}

void Ribbon2Renderer::clearCoilData()
{
  std::for_each(m_coils.begin(),
                m_coils.end(),
                qlib::delete_ptr<SecSplDat*>());
  m_coils.clear();
}

void Ribbon2Renderer::extendSheetCoil(detail::SecSplDat *pCoil, int nPrevInd)
{
  int isheet = m_indvec[nPrevInd];
  SecSplDat *pPrevSheet = m_sheets[isheet];
  double tend = pPrevSheet->m_spl.getPoints()-1.0;
  //if (pPrevSheet->m_bEndExtend)
  //tend -= 1.0; //-m_dAxExt;

  Vector4D vpt;

  pCoil->addSheetPoint( pPrevSheet, tend-1.5, m_dAnchorWgt, &vpt );

  pCoil->setStart();

  pCoil->addSheetPoint( pPrevSheet, tend-0.5, m_dAnchorWgt, &vpt );

  //pCoil->m_bFixStart = true;
  pCoil->m_bFixStart = false;
  pCoil->m_vStartD1 = vpt;
}

void Ribbon2Renderer::extendCoilSheet(detail::SecSplDat *pCoil, int nNextInd)
{
  int isheet = m_indvec[nNextInd];
  SecSplDat *pNextSheet = m_sheets[isheet];
  // double tstart = 0.0;
  Vector4D vpt;

  pCoil->addSheetPoint( pNextSheet, 0.5, m_dAnchorWgt, &vpt );

  pCoil->setEnd();

  pCoil->addSheetPoint( pNextSheet, 1.5, m_dAnchorWgt, &vpt );

  //pCoil->m_bFixEnd = true;
  pCoil->m_bFixEnd = false;
  pCoil->m_vEndD1 = vpt;
}

void Ribbon2Renderer::buildCoilData()
{
  clearCoilData();

  int nresvec = m_resvec.size();
  LString prev_ss = "E"; // dummy for starting coil

  SecSplDat *pCoil = NULL;
  MolResiduePtr pPrevRes;
  for (int i=0; i<nresvec; ++i) {
    MolResiduePtr pRes = m_resvec[i];

    LString sec;
    //pRes->getPropStr("secondary2", sec);
    sec = m_sstab.getSecStr(i);
    sec = sec.substr(0,1);
    MB_DPRINTLN("%d sec=%s, prev=%s", i, sec.c_str(), prev_ss.c_str());

    if ( isCoil(sec, !m_bRibbonHelix) ) {
      if ( !isCoil(prev_ss, !m_bRibbonHelix) ) {
        // Start of coil (x C) or (. C)
        MB_ASSERT(pCoil==NULL);
        pCoil = MB_NEW SecSplDat(this, SecSplDat::KIND_COIL);
        pCoil->m_spl.setRho(m_dCoilSmo);
        pCoil->m_nResDelta = i;
        if (pPrevRes.isnull()) {
          // No previous residue (may be N-terminus; i.e. [. C])
          //  --> no extension
          pCoil->setStart(); // nstart should be zero...
          pCoil->addPoint( this, pRes, getAnchorWgt2(pRes, sec) );
        }
        else {
          if (isSheet(prev_ss)) {
            // Prev res is sheet (E C)
            extendSheetCoil(pCoil, i-1);
            pCoil->addPoint( this, pRes, 1.0);
          }
          else {
            // Prev res is helix (H C)
            pCoil->setStart();
            pCoil->addPoint( this, pPrevRes, m_dAnchorWgt);
            if (!m_bRibbonHelix)
              pCoil->setLastSrc( findHelixJct(i-1) );
            pCoil->addPoint( this, pRes, m_dAnchorWgt);
          }
          pCoil->m_bStartExtend = true;
          pCoil->m_nResDelta = i-1;
        }
      }
      else {
        // mid of coil (C C)
        if (pCoil!=NULL) {
          const double wgt = getAnchorWgt2(pRes, sec);
          pCoil->addPoint( this, pRes, wgt);
        }
      }

    }
    else {
      // non-coil
      if ( isCoil(prev_ss, !m_bRibbonHelix) ) {
        // end of coil (C x)
        MB_ASSERT(pCoil!=NULL);
        if (isSheet(sec)) {
          // coil-sheet junction (C E)
          extendCoilSheet(pCoil, i);
        }
        else {
          // coil-helix junction (C H)
          pCoil->m_posvec.back().w() = m_dAnchorWgt;
          pCoil->addPoint( this, pRes, m_dAnchorWgt);
          if (!m_bRibbonHelix)
            pCoil->setLastSrc( findHelixJct(i) );
          pCoil->setEnd();
        }
        pCoil->m_bEndExtend = true;
        if (!pCoil->generateCoil()) {
          LOG_DPRINTLN("ERROR!!! GenerateCoil failed");
        }
          
        m_coils.push_back(pCoil);
        pCoil = NULL;
      }
    }

    prev_ss = sec;
    pPrevRes = pRes;
  } // for

  if (pCoil!=NULL) {
    // the last residue is coil (C C .)
    // --> build the last coil
    if (pCoil->m_posvec.size()>0)
      pCoil->m_posvec.back().w() = m_dAnchorWgt;
    pCoil->setEnd();
    if (!pCoil->generateCoil()) {
      LOG_DPRINTLN("ERROR!!! GenerateCoil failed");
    }
    m_coils.push_back(pCoil);
    pCoil = NULL;
  }

}

void Ribbon2Renderer::renderCoilTo(TubeMeshBuilder *pmb, detail::SecSplDat *pC)
{
  Vector4D zerovec(0,0,0);
  const TubeSection *pTS = m_ptsCoil.get();
  TubeSection::TessState ts;

  const int naxdet = getAxialDetail();
  const double tstart = 0.0;
  const double tend = pC->m_nRealSize -1.0;
  
  int ndelta = (pC->m_nRealSize -1.0) * naxdet;
  if (ndelta<=0) {
    // degenerated (single point)
    // TO DO: impl
    return;
  }

  const double fdelta = tend/double(ndelta);
  
  Vector4D bntmp;
  Vector4D e11, e12, e21, e22;
  Vector4D f1, f2, vpt;
  
  // Color objects used in the axial-loop
  ColorPtr pCol;
  
  //MB_DPRINTLN("Sheet %d (t: %f->%f)", i, tstart, tend);
  
  pTS->startTess(ts);
  
  // axial step loop
  for (int j=0; j<=ndelta; ++j) {
    double t = tstart + double(j) * fdelta; // /double(naxdet);
    //double col_t = t;
    if (pmb->wantColor())
      pCol = calcCoilColor(t, pC);
    if (pmb->wantName())
      pmb->loadName(calcCoilHitName(t, pC));
    pC->m_spl.interpolate(t, &f1, &vpt);
    //vpt = vpt.normalize();
    
    if (j==0) {
      bntmp = Vector4D(1,0,0);
    }
    
    Vector4D e11 = bntmp.cross(vpt).normalize();
    Vector4D e12 = vpt.cross(e11).normalize();
    
    if (j==0) {
      // make the tube cap.
      pmb->color(pCol);
      m_ptsCoil->makeCap(pmb, true, getStartCapType(), f1, vpt, e11, e12);
    }
    
    pTS->doTess(ts, pmb, f1, pCol, isSmoothColor(), e11, e12, zerovec );

    if (j==ndelta) {
      // make cap at the end point.
      pmb->color(pCol);
      m_ptsCoil->makeCap(pmb, false, getEndCapType(), f1, vpt, e11, e12);
      }
    
    bntmp = e12;
  }
  
}

#define HC_COIL 0
#define HC_HELIX 1
#define HC_HELIX_TAIL 2
#define HC_HELIX_HEAD 3

std::vector<HCTab> Ribbon2Renderer::makeHCTab(detail::SecSplDat *pC)
{
  const int naxdet = getAxialDetail();
  double tstart = 0.0;
  double tend = pC->m_nRealSize -1.0;
  
  int ndelta = (int) ::floor( (tend-tstart)* naxdet );
  if (ndelta<=0) {
    // degenerated (single point): nothing is drawn
    return std::vector<HCTab>();
  }
  const double fdelta = (tend-tstart)/double(ndelta);
  
  ////////////////////////////////////////
  // make helix-coil table

  MB_DPRINTLN("start extend=%d", pC->m_bStartExtend);
  MB_DPRINTLN("end extend=%d", pC->m_bEndExtend);
  std::vector<HCTab> hstabs;
  LString sec_prev="E";
  HCTab hstelem;
  int j;
  for (j=0; j<=ndelta; ++j) {
    double t = tstart + double(j) * fdelta; // /double(naxdet);

    MolResiduePtr pResPrev;
    MolResiduePtr pResNext;
    double rho;
    int iprev;
    getCoilResids(t, pC, pResPrev, pResNext, rho, &iprev);

    LString sec;
    //pResPrev->getPropStr("secondary2", sec);
    sec = m_sstab.getSecStr(iprev);
    //MB_DPRINTLN("%d [%s] sec=<%s> t=%f", j, pResPrev->toString().c_str(), sec.c_str(), t);

    if (j==0 || !sec.equals(sec_prev)) {
      if (j>0) {
        // push the previous segment
        hstelem.jen = j;
        hstabs.push_back(hstelem);
      }
      // setup the start of the next segment
      int flag = HC_COIL;
      LString pfx;
      if (sec.length()>=2)
        pfx= sec.substr(1,1);
      
      if (sec.startsWith("H")||sec.startsWith("G")||sec.startsWith("I")) {
        if (pfx.equals("s"))
          flag = HC_HELIX_TAIL;
        else if (pfx.equals("e"))
          flag = HC_HELIX_HEAD;
        else
          flag = HC_HELIX;
      }
      
      hstelem.jst = j;
      hstelem.flag = flag;
    }

    sec_prev = sec;
  }
  
  // push the previous (last) segment
  hstelem.jen = j-1;
  hstabs.push_back(hstelem);
  
  ////////////////////////////////////////
  
  {
    // Perform adjustment for the helix-coil table
    // 1. shift 0.5 residues so that the junction comes to the middle of the Calpha(or pivot) atoms
    // 2. adjust head/tail segments (head and tail segments should have a length of 1.0 (in nresid unit))
    MB_DPRINTLN("Axial detail = %d", naxdet);
    int ielem=0, nelem = hstabs.size();
    int isft = naxdet/2;
    std::vector<HCTab>::iterator iter = hstabs.begin();
    const std::vector<HCTab>::iterator eiter = hstabs.end();
    for (; iter!=eiter; ++iter) {
      HCTab &elem = *iter;
      int jstart = elem.jst;
      int jend = elem.jen;
      if (ielem==0 && nelem==1) {
        // single element --> no shift
        MB_DPRINTLN("ielem=0 nelem=1, shift=0");
      }
      else if (ielem==0) {
        jend -= isft;
        MB_DPRINTLN("ielem=0, shift=-%d", isft);
      }
      else if (ielem==nelem-1) {
        jstart -= isft;
        MB_DPRINTLN("ielem=%d(end), shift=-%d", ielem, isft);
      }
      else {
        MB_DPRINTLN("ielem=%d, shift=-%d", ielem, isft);
        jstart -= isft;
        jend -= isft;
      }
      
      MB_DPRINTLN("HST elem %d type=%d, jst=%d(%d), jen=%d(%d)", ielem, elem.flag, elem.jst, jstart, elem.jen, jend);
      elem.jst = jstart;
      elem.jen = jend;
      ++ielem;
    }

    // ielem = 0;
    iter = hstabs.begin();
    for (; iter!=eiter; ++iter) {
      HCTab &elem = *iter;
      int jstart = elem.jst;
      int jend = elem.jen;
      if (elem.flag==HC_HELIX_TAIL) {
        if (jend-jstart>naxdet) {
          MB_DPRINTLN("*** HST elem %d type=%d, jst=%d, jen=%d>naxdet", ielem, elem.flag, elem.jst, elem.jen);
          elem.jen = elem.jst + naxdet;
          std::vector<HCTab>::iterator jj = iter;
          ++jj;
          if (jj!=eiter) {
            MB_DPRINTLN("overwrite jst=%d to %d", jj->jst, elem.jen);
            jj->jst = elem.jen;
          }
          
        }
      }
      if (elem.flag==HC_HELIX_HEAD) {
        if (jend-jstart>naxdet) {
          LOG_DPRINTLN("*** HST elem %d type=%d, jst=%d, jen=%d>naxdet", ielem, elem.flag, elem.jst, elem.jen);
          LOG_DPRINTLN("Rendering of cartoon may become incorrect!!");
        }
      }
    }
  }

  return hstabs;
}

void Ribbon2Renderer::renderHelixCoilTo(TubeMeshBuilder *pmb, detail::SecSplDat *pC)
{
  Vector4D zerovec(0,0,0);

  const int naxdet = getAxialDetail();
  double tstart = 0.0;
  double tend = pC->m_nRealSize -1.0;
  
  int ndelta = (int) ::floor( (tend-tstart)* naxdet );
  if (ndelta<=0) {
    // degenerated (single point)
    // TO DO: impl
    return;
  }
  const double fdelta = (tend-tstart)/double(ndelta);
  
  Vector4D bntmp;
  Vector4D e11, e12, e21, e22;
  Vector4D f1, f2, vpt;
  
  // Color objects used in the axial-loop
  ColorPtr pCol;
  
  ////////////////////////////////////////

  const TubeSection *pTS = NULL;
  TubeSection::TessState ts;
  BOOST_FOREACH (const HCTab &elem, pC->m_hctab) {
    int jstart = elem.jst;
    int jend = elem.jen;

    switch (elem.flag) {
    case HC_COIL:
    case HC_HELIX: {
      if (elem.flag==HC_COIL)
        pTS = m_ptsCoil.get();
      else
        pTS = m_ptsRibHelix.get();

      pTS->startTess(ts);
      // axial step loop
      for (int j=jstart; j<=jend; ++j) {
        double t = tstart + double(j) * fdelta;

        if (pmb->wantColor())
          pCol = calcCoilColor(t, pC);
        if (pmb->wantName())
          pmb->loadName(calcCoilHitName(t, pC));
        pC->m_spl.interpolate(t, &f1, &vpt);
        vpt = vpt.normalize();
        
        bntmp = pC->getCoilBnormVec(t);
        e12 = (bntmp - f1).normalize();
        e11 = e12.cross(vpt);

        if (j==jstart && elem.flag==HC_COIL) {
          // make the tube cap.
          pmb->color(pCol);
          pTS->makeCap(pmb, true, getStartCapType(), f1, vpt, e11, e12);
        }
        
        pTS->doTess(ts, pmb, f1, pCol, isSmoothColor(), e11, e12, zerovec );
        
        if (j==jend && elem.flag==HC_COIL) {
          // make cap at the end point.
          pmb->color(pCol);
          pTS->makeCap(pmb, false, getEndCapType(), f1, vpt, e11, e12);
        }
        
        /*
        pdl->setLineWidth(3.0);
        pdl->startLines();
        pdl->color(1,0,0,1);
        pdl->vertex(f1);
        pdl->vertex(bntmp);
        pdl->end();
         */
      }
      break;
    }

    case HC_HELIX_HEAD:
    case HC_HELIX_TAIL: {
      const JctTable *pJCT;
      if (elem.flag == HC_HELIX_HEAD)
        pJCT = m_pRibHelixHead.get();
      else
        pJCT = m_pRibHelixTail.get();
      
      double tbase = double(jstart) * fdelta;
      ndelta = pJCT->getSize();
      
      Vector4D escl, prev_escl, xe11, xe12;
      double dpar;
      double prev_dpar = -1.0;
      
      // initialize previous E scale
      pJCT->get(0, dpar, prev_escl);
      
      pTS = m_ptsRibHelix.get();
      // pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
      pTS->startTess(ts);
      
      for (int i=0; i<ndelta; i++) {
        // Get E-scale value
        pJCT->get(i, dpar, escl);
        const double t = tbase + dpar;
        
        if (pmb->wantColor())
          pCol = calcCoilColor(t, pC);
        if (pmb->wantName())
          pmb->loadName(calcCoilHitName(t, pC));
        pC->m_spl.interpolate(t, &f1, &vpt);
        const Vector4D ev = vpt.normalize();
        
        bntmp = pC->getCoilBnormVec(t);
        e12 = (bntmp - f1).normalize();
        e11 = e12.cross(ev);
        //e11 = bntmp.cross(ev).normalize();
        //e12 = ev.cross(e11);
        
        xe11 = e11.scale(escl.x());
        xe12 = e12.scale(escl.y());
        //te11 = e11.scale(escl.y());
        //te12 = e12.scale(escl.x());
        
        if ( qlib::isNear4(dpar,prev_dpar) ) {
          // uncontinuous point of arrow head
          // make partition polygons
          pmb->color(pCol);
          pTS->makeDisconJct(pmb, f1, ev, e11, e12, prev_escl, escl);
          //pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL_NORGLN);
          pTS->startTess(ts);
        }
        

        if (i==0 && elem.flag==HC_HELIX_TAIL) {
          // make the tube cap.
          pmb->color(pCol);
          pTS->makeCap(pmb, true, getStartCapType(), f1, vpt, xe11, xe12);
        }
        
        pTS->doTess(ts, pmb, f1, pCol, isSmoothColor(),
                    e11, e12,
                    escl, vpt);
        
        if (i==ndelta-1 && elem.flag==HC_HELIX_HEAD) {
          // make cap at the end point.
          pmb->color(pCol);
          pTS->makeCap(pmb, false, getEndCapType(), f1, vpt, xe11, xe12);
        }

        ////////////////
        
        prev_escl = escl;
        prev_dpar = dpar;

        /*
        pdl->setLineWidth(3.0);
        pdl->startLines();
        pdl->color(1,0,0,1);
        pdl->vertex(f1);
        pdl->vertex(bntmp);
        pdl->end();
         */
      }
      
      // pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);

    }
    }

  }

}

//////////////////////////////////////////////////

//virtual
void Ribbon2Renderer::setAxialDetail(int nlev)
{
  m_nAxialDetail = nlev;
  invalidateSplineCoeffs();
}

void Ribbon2Renderer::propChanged(qlib::LPropEvent &ev)
{
  if (isColoringProp(ev)) {
    // color-only update (TubeGpuRenderer); a coloring property may also be
    // named helix/sheet/coil
    super_t::propChanged(ev);
    return;
  }
  else if (ev.getName().startsWith("helix") ||
           ev.getName().startsWith("sheet") ||
           ev.getName().startsWith("coil")) {
    invalidateSplineCoeffs();
    invalidateDisplayCache();
  }
  else if (ev.getParentName().startsWith("helix") ||
           ev.getParentName().startsWith("sheet") ||
           ev.getParentName().startsWith("coil") ||
           ev.getParentName().startsWith("ribhelix")) {
    invalidateSplineCoeffs();
    invalidateDisplayCache();
  }
  
  super_t::propChanged(ev);
}

void Ribbon2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  // Positions changed but topology/colors did not: the vertices are
  // rewritten in place on the next display() (before the OBE_CHANGED
  // handling below, which drops everything)
  if (tubeGpuHandleAtomsMoved(ev))
    return;

  int ntyp = ev.getType();

  // Drop the cached spline coeffs when the atom positions move.
  // Fall through to the super class so that the display and the hittest
  // caches are invalidated as well (the hittest cache holds a copy of the
  // atom world coords, so a stale one picks atoms at their old positions).
  if (ntyp==qsys::ObjectEvent::OBE_CHANGED) {
    invalidateSplineCoeffs();
  }
  else if (ntyp==qsys::ObjectEvent::OBE_PROPCHG) {
    qlib::LPropEvent *pPE = ev.getPropEvent();
    if (pPE && pPE->getName().equals("xformMat")) {
      invalidateSplineCoeffs();
    }
  }

  super_t::objectChanged(ev);
}

void Ribbon2Renderer::invalidateSplineCoeffs()
{
  // m_scs.cleanup();
  invalidateDisplayCache();
  m_diffvecs.clear();
  m_bLazyDiffVecs = false;
  m_gpuElems.clear();
}

void Ribbon2Renderer::dumpCyls(SecSplDat *pC)
{
  Vector4D f1, vpt, cuv;

  double tstart=0.0;
  //if (pC->m_bStartExtend)
  //tstart = 1.0-m_dAxExt;
  
  double tend = pC->m_spl.getPoints()-1.0;
  //if (pC->m_bEndExtend)
  //tend -= 1.0-m_dAxExt;
  
  int ndelta = (int) ::floor( (tend-tstart)* 1 );
  if (ndelta<=0) {
    MB_DPRINTLN("Degen helix");
    return;
  }
  const double fdelta = (tend-tstart)/double(ndelta);
  
  for (int j=0; j<=ndelta; ++j) {
    double t = tstart + double(j)*fdelta;
    pC->m_spl.interpolate(t, &f1, &vpt, &cuv);

    int nres = int(::floor(t));
    nres += pC->m_nResDelta;

    MolResiduePtr pRes = getResByIndex(nres);
    if (!pRes.isnull())
      LOG_DPRINT("%s ", pRes->toString().c_str());
    
    LOG_DPRINTLN("nres=%d t=%f cv=%f", nres, t, cuv.length());
  }
}

void Ribbon2Renderer::curvature()
{
  MB_DPRINTLN("Rib2Rend> curvature() called");

  try {
    int ncyls = m_cylinders.size();
    LOG_DPRINTLN("=== cyls : %d ===", ncyls);
    for (int i=0; i<ncyls; ++i) {
      SecSplDat *pC = m_cylinders[i];
      LOG_DPRINTLN("elem %d", i);
      dumpCyls(pC);
      LOG_DPRINTLN("elem %d END", i);
    }
    
    ncyls = m_sheets.size();
    LOG_DPRINTLN("=== sheets : %d ===", ncyls);
    for (int i=0; i<ncyls; ++i) {
      SecSplDat *pC = m_sheets[i];
      LOG_DPRINTLN("elem %d", i);
      dumpCyls(pC);
      LOG_DPRINTLN("elem %d END", i);
    }

    /*
    ncyls = m_coils.size();
    MB_DPRINTLN("=== coils : %d ===", ncyls);
    for (int i=0; i<ncyls; ++i) {
      SecSplDat *pC = m_coils[i];
      dumpCyls(pC);
    }
    */
  }
  catch (...) {
    MB_DPRINTLN("*** exception occured");
    throw;
  }
}

void Ribbon2Renderer::setupDiffRes(SecSplDat *pC)
{
  pC->m_diffres.clear();

  const double tend = pC->m_spl.getPoints()-1.0;
  const int ndelta = (int) ::floor(tend);
  if (ndelta<=0) {
    MB_DPRINTLN("Degenerated");
    return;
  }
  const double fdelta = tend/double(ndelta);

  for (int j=0; j<=ndelta; ++j) {
    const double t = double(j)*fdelta;
    const int nres = int(::floor(t)) + pC->m_nResDelta;
    MolResidue *pRes = NULL;
    if (0<=nres && nres<int(m_resvec.size()))
      pRes = m_resvec[nres].get();
    pC->m_diffres.push_back(pRes);
  }
}

void Ribbon2Renderer::updateDiffVecsImpl(SecSplDat *pC)
{
  const int nres = pC->m_diffres.size();
  if (nres==0)
    return;

  // (the parameters of setupDiffRes())
  const double tend = pC->m_spl.getPoints()-1.0;
  const double fdelta = tend/double(nres-1);

  Vector4D f1, vpt;
  for (int j=0; j<nres; ++j) {
    MolResidue *pRes = pC->m_diffres[j];
    if (pRes==NULL)
      continue;
    pC->m_spl.interpolate(double(j)*fdelta, &f1, &vpt);
    m_diffvecs.insert(DiffVecMap::value_type(pRes, DiffVecMap::mapped_type(f1, vpt)));
  }
}

void Ribbon2Renderer::updateDiffVecs()
{
  // (the first entry of a residue is kept: coils, helices, then sheets)
  for (std::deque<SecSplDat *> *pList : {&m_coils, &m_cylinders, &m_sheets}) {
    BOOST_FOREACH (SecSplDat *pElem, *pList) {
      setupDiffRes(pElem);
      updateDiffVecsImpl(pElem);
    }
  }
}

bool Ribbon2Renderer::getDiffVec(MolResiduePtr pRes, Vector4D &rpos, Vector4D &rvec)
{
  if (m_bLazyDiffVecs) {
    // the elements' geometry was recomputed by a chunked update
    m_bLazyDiffVecs = false;
    m_diffvecs.clear();
    for (std::vector<SecSplDat *> *pList :
           {&m_gpuElems.m_coils, &m_gpuElems.m_cyls, &m_gpuElems.m_sheets}) {
      BOOST_FOREACH (SecSplDat *pElem, *pList) {
        updateDiffVecsImpl(pElem);
      }
    }
  }

  if (m_diffvecs.empty()) {
    return false;
  }

  DiffVecMap::const_iterator iter = m_diffvecs.find(pRes.get());
  if (iter==m_diffvecs.end())
    return false;

  rpos = iter->second.first;
  rvec = iter->second.second;
  return true;
}
