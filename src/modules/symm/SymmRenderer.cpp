// -*-Mode: C++;-*-
//
//  Symmetry-related molecule renderer
//
//  $Id: SymmRenderer.cpp,v 1.5 2011/02/14 14:36:59 rishitani Exp $

#include <common.h>

#include "SymmRenderer.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/Hittest.hpp>

#include <qsys/Object.hpp>
#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/MolRenderer.hpp>

#include "CrystalInfo.hpp"
#include "SymOpDB.hpp"
#include "UnitCellRenderer.hpp"

using namespace symm;

using qlib::Vector4D;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using qsys::ObjectPtr;
using qsys::RendererPtr;
using qsys::ScrEventManager;

SymmRenderer::SymmRenderer()
{
  m_nMaxOps = 100;
  m_bShowHiddenRends = false;
  m_bUpdate = true;
}

SymmRenderer::~SymmRenderer()
{
}

//////////////////////////////////////////////////////

const char *SymmRenderer::getTypeName() const
{
  return "*symm";
}

LString SymmRenderer::toString() const
{
  return "symm";
}

bool SymmRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  // CrystalInfoPtr pcx = pobj->getExtData("CrystalInfo");
  // return ! pcx.isnull();

  MolCoordPtr ptest(pobj, qlib::no_throw_tag());
  return !ptest.isnull();
}

bool SymmRenderer::isHitTestSupported() const
{
  return true;
}

Vector4D SymmRenderer::getCenter() const
{
  return m_center;
}

//////////////////////////////////////////////////////

void SymmRenderer::clear()
{
  m_data.erase(m_data.begin(), m_data.end());
}

void SymmRenderer::display(DisplayContext *pdc)
{
  // m_pdc = pdc;
  // m_pdc->setLighting(true);
  if (m_bUpdate) {
    if (m_bUnitCell)
      genByCell();
    else
      genByExtent();

    MB_DPRINTLN("SymmRend> %d operations", m_data.size());
    m_bUpdate = false;
  }
  // m_pdc->setLighting(false);
  // m_pdc = NULL;

  ObjectPtr pObj = getClientObj();
  qsys::Object::RendIter iter = pObj->beginRend();
  qsys::Object::RendIter end = pObj->endRend();
  for (; iter!=end; ++iter) {
    RendererPtr pRend = iter->second;
    rendSymm(pdc, pRend.get());
  }
}

void SymmRenderer::rendSymm(DisplayContext *pdc, Renderer *prend)
{
  // avoid self copy
  if (dynamic_cast<SymmRenderer *>(prend)!=NULL)
    return;
  if (!m_bShowHiddenRends && !prend->isVisible())
    return;

  // TO DO : enable to specify renderers not to adopt SYMOP
  if (dynamic_cast<UnitCellRenderer *>(prend)!=NULL)
    return;

  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator end = m_data.end();
  for ( ; iter!=end; iter++) {
    const Matrix4D &mat = iter->second;
    if (mat.isIdent(F_EPS4))
      continue;
    pdc->pushMatrix();
    pdc->multMatrix(mat);
    prend->display(pdc);
    pdc->popMatrix();
  }
}

//////////////////////////////////////////////////////
// Symop generation routines

/// Generate symmetry operators by unit cell
int SymmRenderer::genByCell()
{
  MolCoordPtr pMol = getClientObj();
  if (pMol.isnull())
    return -1;
      
  CrystalInfoPtr pci = pMol->getExtData("CrystalInfo");
  if (pci.isnull()) {
    // No symmetry info available
    // TO DO: throw exception
    //LOG_DPRINTLN("object <%s>: no crystallographic infomation.", pMol->getName().c_str());
    return -1;
  }
  
  Vector4D vcen;
  vcen = pMol->getCenterPos(false);

  int nsg = pci->getSG();
  SymOpDB *pdb = SymOpDB::getInstance();
  Matrix4D *pmat = NULL;
  LString *pnames = NULL;
  int nasym = pdb->getSymOps(nsg, pmat, pnames);
  if (pmat==NULL) {
    // TO DO: throw exception
    LOG_DPRINTLN("object <%s>: no symm ops for SG %d.",
                 (const char *)pMol->getName(), nsg);
    return -1;
  }

  Matrix4D frac(pci->getFracMat());
  Matrix4D orth(pci->getOrthMat());

  pci->orthToFrac(vcen);
  MB_DPRINTLN("Symm> cent in frac (%f,%f,%f)", vcen.x(), vcen.y(), vcen.z());

  m_data.resize(nasym);
  int i;
  for (i=0; i<nasym; i++) {
    Vector4D ftmp = vcen;
    pmat[i].xform3D(ftmp);

    // Translate, so that the transformed center-of-mass is in the unit cell
    Matrix4D trans = Matrix4D::makeTransMat(Vector4D(-::floor(ftmp.x()), -::floor(ftmp.y()), -::floor(ftmp.z())));

    Matrix4D mat = orth;
    mat.matprod(trans);
    mat.matprod(pmat[i]);
    mat.matprod(frac);

    //addOperator(mat, pnames[i]);
    m_data[i].first = pnames[i];
    m_data[i].second = mat;
  }
  
  // clean-up
  delete [] pmat;
  delete [] pnames;

  return nasym;
}

/// Generate symmetry operators by unit cell
int SymmRenderer::genByExtent()
{
  MolCoordPtr pMol = getClientObj();
  if (pMol.isnull())
    return -1;
      
  CrystalInfoPtr pci = pMol->getExtData("CrystalInfo");
  if (pci.isnull())
    return -1;

  clear();

  //Vector4D vcen, vview;
  m_molcen = pMol->getCenterPos(false);
  m_molcen.w() = 1.0;

  int nsg = pci->getSG();
  SymOpDB *pdb = SymOpDB::getInstance();
  Matrix4D *pmat = NULL;
  LString *pnames = NULL;
  int nasym = pdb->getSymOps(nsg, pmat, pnames);
  if (pmat==NULL) {
    // TO DO: throw exception
    LOG_DPRINTLN("object <%s>: no symm ops for SG %d.",
                 (const char *)pMol->getName(), nsg);
    return -1;
  }

  Matrix4D frac(pci->getFracMat());
  Matrix4D orth(pci->getOrthMat());

  Vector4D fmol = m_molcen;
  Vector4D fview = m_center;
  pci->orthToFrac(fview);
  pci->orthToFrac(fmol);
  MB_DPRINTLN("Symm> molcent in frac (%f,%f,%f)", fmol.x(), fmol.y(), fmol.z());
  MB_DPRINTLN("Symm> viewcent in frac (%f,%f,%f)", fview.x(), fview.y(), fview.z());

  Vector4D nc(::floor(fmol.x()), ::floor(fmol.y()), ::floor(fmol.z()));
  Vector4D nv(::floor(fview.x()), ::floor(fview.y()), ::floor(fview.z()));

  // fmol: Fractional coord of mol center with rounded into 0:1 range
  fmol = fmol - nc;
  // fview: Rendering center, in the same as fmol
  // Vector4D fview = vview - nv;

  m_orthmat = orth;
  // m_fview = fview;
  m_pci = pci;
  int i;
  for (i=0; i<nasym; i++) {
    Vector4D fmolx = pmat[i].mulvec(fmol);
    Vector4D xtr( -::floor(fmolx.x()), -::floor(fmolx.y()), -::floor(fmolx.z()) );


    m_mat = Matrix4D::makeTransMat(xtr);
    m_mat.matprod(pmat[i]);
    m_mat.matprod(Matrix4D::makeTransMat(-nc));
    m_mat.matprod(frac);
    m_matname = pnames[i];

    //Vector4D fmoltmp = fmol;
    //pmat[i].xform(fmoltmp);

    searchX(nv);
  }

  // clean-up
  delete [] pmat;
  delete [] pnames;

  // m_pdc->color(1, 0, 0, 0.5);
  // m_pdc->sphere(m_dExtent, m_center);

  return m_data.size();
}

bool SymmRenderer::checkPos(const Vector4D &trn)
{
  Matrix4D mat(m_orthmat);
  mat.matprod(Matrix4D::makeTransMat(trn));
  mat.matprod(m_mat);

  // double r = m_pci->fracDist(m_fmolx+trn, m_fview);
  // Vector4D fx = m_fmolx+trn;
  // fx = m_orthmat.mulvec(fx);
  Vector4D fx = mat.mulvec(m_molcen);
  double r = (fx-m_center).length();

  //MB_DPRINTLN("tr=(%.0f, %.0f, %.0f) mol=(%.2f,%.2f,%.2f) view=(%.2f,%.2f,%.2f) dist=%.2f",
  //trn.x(), trn.y(), trn.z(),
  //fx.x(), fx.y(), fx.z(),
  //m_center.x(), m_center.y(), m_center.z(),
  //r);


  if (r>m_dExtent) {
    // m_pdc->color(0, 0, 1);
    // m_pdc->sphere(1.0, fx);

    return false;
  }
  
  // m_pdc->color(0, 1, 0);
  // m_pdc->sphere(1.0, fx);

  if (mat.isIdent(F_EPS4)) {
    MB_DPRINTLN("--> ident matrix (ignored).");
    return true;
  }

  MB_DPRINTLN(" --> OK");
  mat.dump();

  //addOperator(mat, m_matname);
  m_data.push_back(data_t::value_type(m_matname, mat));
  return true;
}

int SymmRenderer::searchZ(const Vector4D &trn)
{
  int iz = 0;
  int nok = 0;
  for ( ;; iz++) {
    Vector4D trn_plus(trn);
    trn_plus.z() += (double)iz;
    int dnok = 0;

    bool fp = checkPos(trn_plus);
    if (fp)
      dnok++;

    if (iz!=0) {
      Vector4D trn_minus(trn);
      trn_minus.z() -= (double)iz;

      bool fm = checkPos(trn_minus);
      if (fm)
        dnok++;
    }

    nok += dnok;
    if (dnok==0 && iz>=2)
      break;
  }

  return nok;
}

int SymmRenderer::searchY(const Vector4D &trn)
{
  int nok = 0;
  int iy = 0;

  for ( ;; iy++) {
    Vector4D trn_plus(trn);
    trn_plus.y() += double(iy);
    int dnok = 0;

    dnok += searchZ(trn_plus);

    if (iy!=0) {
      Vector4D trn_minus(trn);
      trn_minus.y() -= double(iy);
      
      dnok += searchZ(trn_minus);
    }

    nok += dnok;
    if (dnok==0 && iy>=2)
      break;
  }

  return nok;
}

int SymmRenderer::searchX(const Vector4D &trn)
{
  int nok = 0;
  int ix = 0;

  for ( ;; ix++) {
    Vector4D trn_plus(trn);
    trn_plus.x() += double(ix);
    int dnok = 0;

    dnok += searchY(trn_plus);

    if (ix!=0) {
      Vector4D trn_minus(trn);
      trn_minus.x() -= double(ix);

      dnok += searchY(trn_minus);
    }

    nok += dnok;
    if (dnok==0 && ix>=2)
      break;
  }

  return nok;
}

//////////////////////////////////////////////////////

void SymmRenderer::setSceneID(qlib::uid_t nid)
{
  super_t::setSceneID(nid);
  if (nid!=qlib::invalid_uid) {
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->addViewListener(nid, this);
  }
}

qlib::uid_t SymmRenderer::detachObj()
{
  ScrEventManager *pSEM = ScrEventManager::getInstance();
  pSEM->removeViewListener(this);

  return super_t::detachObj();
}  

void SymmRenderer::viewChanged(qsys::ViewEvent &ev)
{
  if (!m_bAutoUpdate) return;
  if (m_bUnitCell) return;

  if (!(ev.getType()==qsys::ViewEvent::VWE_PROPCHG
        //||ev.getType()==qsys::ViewEvent::VWE_PROPCHG_DRG
        ))
    return;
  if (!ev.getDescr().equals("center"))
    return;

  qsys::View *pView = ev.getTargetPtr();
  if (pView==NULL) return;

  Vector4D c = pView->getViewCenter();
  setCenter(c);
  //invalidateDisplayCache();
}


//////////////////////////////////////////////////////
// hit test support

/// Render Hittest object
void SymmRenderer::displayHit(DisplayContext *pdc)
{
  if (m_bUpdate) {
    if (m_bUnitCell)
      genByCell();
    else
      genByExtent();

    MB_DPRINTLN("SymmRend> %d operations", m_data.size());
    m_bUpdate = false;
  }

  ObjectPtr pObj = getClientObj();
  qsys::Object::RendIter iter = pObj->beginRend();
  qsys::Object::RendIter end = pObj->endRend();
  for (; iter!=end; ++iter) {
    RendererPtr pRend = iter->second;
    rendHitSymm(pdc, pRend.get());
  }

}

void SymmRenderer::rendHitSymm(DisplayContext *pdc, Renderer *prend)
{
  if (!prend->isHitTestSupported())
    return;

  // avoid self copy
  if (dynamic_cast<SymmRenderer *>(prend)!=NULL)
    return;
  if (!m_bShowHiddenRends && !prend->isVisible())
    return;

  // TO DO : enable to specify renderers not to adopt SYMOP
  if (dynamic_cast<UnitCellRenderer *>(prend)!=NULL)
    return;

  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator end = m_data.end();
  int i;
  for (i=0; iter!=end; iter++, i++) {
    const Matrix4D &mat = iter->second;
    if (mat.isIdent(F_EPS4))
      continue;

    // set vector index as a name
    pdc->loadName(i);
    pdc->pushName(-1);

    pdc->pushMatrix();
    pdc->multMatrix(mat);
    prend->displayHit(pdc);
    pdc->popMatrix();

    // pop operator ID
    pdc->popName();
  }

}


/// Hittest result interpretation
LString SymmRenderer::interpHit(const gfx::RawHitData &hdat)
{
  int nsize = hdat.getDataSize(getUID());

  // symm renderer now doesn't support multi-hittest (rectsel)
  if (nsize<=0 || nsize>1)
    return LString();

  LString rval;

  rval += "\"objtype\": \"MolCoord\", \n";
  // rval += LString::format("\"size\": %d, ", nsize);
  rval += "\"size\": 1, \n";

  int ii=0;
  // for (int ii=0; ii<nsize; ++ii) {

  int sym_id = hdat.getDataAt(getUID(), ii, 0);
  int atom_id = hdat.getDataAt(getUID(), ii, 1);

  if (sym_id<0 || atom_id<0) {
    MB_DPRINTLN("Symm.interHit> internal error.");
    return LString();
  }
  
  MolCoordPtr pMol = getClientObj();
  MolAtomPtr pAtom = pMol->getAtom(atom_id);
  rval += molstr::MolRenderer::interpHitAidImpl(pAtom);

  LString symm_name = m_data[sym_id].first;

  //if (ii>0)
  //rval += ",";
  rval += LString::format("\"symm_id\": %d, \n", sym_id);
  rval += "\"symm_name\": \""+symm_name+"\", \n";

  return rval;

}

Matrix4D SymmRenderer::getXformMatrix(int symid) const
{
  const SymmElem &elm = m_data.at(symid);
  const Matrix4D &mat = elm.second;
  return mat;
}

void SymmRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED &&
      ev.getDescr().equals("crystalinfo"))
    m_bUpdate = true;

  super_t::objectChanged(ev);
}

