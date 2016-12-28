// -*-Mode: C++;-*-
//
// Symmetry operator DB
//
// $Id: SymOpDB.cpp,v 1.2 2010/09/20 16:11:25 rishitani Exp $

#include <common.h>

#include <qlib/Utils.hpp>
#include <qlib/LineStream.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/HashMap.hpp>
//#include <mbsys/MbSysDB.hpp>
//#include <mbsys/SecurityMgr.hpp>
#include <qsys/SysConfig.hpp>

#include "SymOpDB.hpp"
#include "CrystalInfo.hpp"

using namespace symm;
using qsys::SysConfig;

SINGLETON_BASE_IMPL(SymOpDB);

SymOpDB::SymOpDB()
{
  m_psgtab = new SgTab();
}

SymOpDB::~SymOpDB()
{
  cleartabs();
  delete m_psgtab;
}

void SymOpDB::cleartabs()
{
  SgTab &sgtab = *m_psgtab;
  SgTab::iterator iter = sgtab.begin();
  for ( ; iter!=sgtab.end(); iter++) {
    Group *psym = (*iter).second;
    if (psym!=NULL)
      delete psym;
  }
  sgtab.erase(sgtab.begin(), sgtab.end());
  /// m_fname = "";
}

SymOpDB::Group *SymOpDB::getSpaceGroup(int nsg) const
{
  checkAndLoad();

  SgTab &sgtab = *m_psgtab;

  SgTab::const_iterator iter = sgtab.find(nsg);

  if(iter==sgtab.end())
    return NULL;

  Group *psym = (*iter).second;
  MB_ASSERT(psym!=NULL);
  return psym;
}

/** get the number of asymmetric units */
int SymOpDB::getAsymNum(int nsg) const
{
  checkAndLoad();

  Group *psym = getSpaceGroup(nsg);
  if (psym==NULL) return -1;
  return psym->nasym;
}

/** return the full Hermann-Mauguin
      symbol (e.g. P 43 21 2) of nsg.
 */
const char *SymOpDB::getCName(int nsg) const
{
  checkAndLoad();

  Group *psym = getSpaceGroup(nsg);
  if (psym==NULL) return NULL;
  return psym->cname;
}

/** return the abbreviated Hermann-Mauguin
      symbol (e.g. P43212) of nsg.
 */
const char *SymOpDB::getName(int nsg) const
{
  checkAndLoad();

  Group *psym = getSpaceGroup(nsg);
  if (psym==NULL) return NULL;
  return psym->name;
}

int SymOpDB::getXtalSysID(int nsg) const
{
  checkAndLoad();

  Group *psym = getSpaceGroup(nsg);
  if (psym==NULL) return -1;
  return psym->sysid;
}

///
///    Get all symmetry operators for the space group nsg
///
int SymOpDB::getSymOps(int nsg, Matrix4D *&pvec, LString *&popname) const
{
  checkAndLoad();

  int i;

  Group *psym = getSpaceGroup(nsg);
  if (psym==NULL) return -1;

  int nasym = psym->nasym;

  pvec = new Matrix4D[nasym];
  popname = new LString[nasym];

  for (i=0; i<nasym; i++) {
    pvec[i] = psym->pOps[i].mat;
    popname[i] = psym->pOps[i].name;
  }

  return nasym;
}

int SymOpDB::getSgIDByCName(const LString &name) const
{
  checkAndLoad();

  SgTab &sgtab = *m_psgtab;

  SgTab::const_iterator iter = sgtab.begin();
  for ( ; iter!=sgtab.end(); iter++) {
    Group *psym = iter->second;
    MB_ASSERT(psym!=NULL);
    if (name.equals(psym->cname))
      return iter->first;
  }

  return -1;
}

int SymOpDB::getSgIDByName(const LString &name) const
{
  checkAndLoad();

  SgTab &sgtab = *m_psgtab;

  SgTab::const_iterator iter = sgtab.begin();
  for ( ; iter!=sgtab.end(); iter++) {
    Group *psym = iter->second;
    MB_ASSERT(psym!=NULL);
    if (name.equals(psym->name))
      return iter->first;
  }

  return -1;
}

LString SymOpDB::getSgNamesJSON(const LString &lat)
{
  checkAndLoad();
  LString rval;

  int nlatid = CrystalInfo::sysNameToID(lat);
  if (nlatid<0) {
    MB_THROW(qlib::IllegalArgumentException, "Invalid lattice name: "+lat);
    return LString();
  }

  rval += "[";

  SgTab::const_iterator iter = m_psgtab->begin();
  SgTab::const_iterator iend = m_psgtab->end();
  bool bfirst = true;
  for ( ; iter!=iend; ++iter) {
    Group *psym = iter->second;
    MB_ASSERT(psym!=NULL);
    if (nlatid == psym->sysid) {
      if (!bfirst)
	rval += ",";
      rval += "{";
      rval += "\"cname\":\""+psym->cname+"\",";
      rval += LString::format("\"id\":%d", psym->id);
      rval += "}";
      bfirst = false;
    }
  }

  rval += "]";

  return rval;
}

////////////////////////////////////////////////////////////////////////
//   read symop file

namespace {

bool procSgLine(const LString &sline,
                int &rnsg, int &rnasu,
                LString &hmname, LString &cname, int &rnsysid)
{
  LString sbuf;
  LString hd = sline.substr(1);
  std::list<LString> sep;
  hd.split(',', sep);
  
  // read sgnum
  if (sep.size()==0) {
    MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", hd.c_str());
    return false;
  }
  sbuf = sep.front();
  sep.pop_front();
  int nsg;
  if (sbuf.isEmpty() || !sbuf.toInt(&nsg) || nsg<=0) {
    MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", hd.c_str());
    return false;
  }
  rnsg = nsg;
    
  // read ASU num
  if (sep.size()==0) {
    MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", hd.c_str());
    return false;
  }
  sbuf = sep.front();
  sep.pop_front();
  int nasu;
  if (sbuf.isEmpty() || !sbuf.toInt(&nasu) || nasu<=0) {
    MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", hd.c_str());
    return false;
  }
  rnasu = nasu;
  
  // read HMname
  if (sep.size()==0) {
    MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", hd.c_str());
    return false;
  }
  hmname = sep.front();
  sep.pop_front();
  if (hmname.length()<=0) {
    MB_DPRINTLN("SymOpLib Loader: invalid HM name: %s", hmname.c_str());
    return false;
  }

  // read canonical HMname
  if (sep.size()==0) {
    MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", hd.c_str());
    return false;
  }
  cname = sep.front();
  sep.pop_front();
  if (cname.length()<=0) {
    MB_DPRINTLN("SymOpLib Loader: invalid HM fullname: %s", cname.c_str());
    return false;
  }
    
  // read crystal system name
  if (sep.size()==0) {
    MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", hd.c_str());
    return false;
  }
  LString sysname = sep.front();
  sep.pop_front();
  rnsysid = CrystalInfo::sysNameToID(sysname);
  if (rnsysid<1) {
    MB_DPRINTLN("SymOpLib Loader: invalid crystal system name: %s", sysname.c_str());
    return false;
  }

  return true;
}

bool readSymOp(qlib::LineStream &lis, Matrix4D &mat)
{
  int i, j;
  LString sbuf;
  double m[4][4];

  for (i=0; i<3; ) {
    if (!lis.ready())
      return false;
    sbuf = lis.readLine();
    std::list<LString> sep;
    sbuf.split(',', sep);
    
    int ntmp[5];
    for (j=0; j<5; ++j) {
      if (sep.size()==0) {
        MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", sbuf.c_str());
        return false;
      }
      sbuf = sep.front();
      sep.pop_front();
      if (sbuf.isEmpty() || !sbuf.toInt(&ntmp[j])) {
        MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", sbuf.c_str());
        return false;
      }
    }

    m[i][0] = (double)ntmp[0];
    m[i][1] = (double)ntmp[1];
    m[i][2] = (double)ntmp[2];
    m[i][3] = (double)ntmp[3]/(double)ntmp[4];
    i++;
  }

  mat.aij(1, 1) = m[0][0];
  mat.aij(1, 2) = m[0][1];
  mat.aij(1, 3) = m[0][2];
  mat.aij(1, 4) = m[0][3];

  mat.aij(2, 1) = m[1][0];
  mat.aij(2, 2) = m[1][1];
  mat.aij(2, 3) = m[1][2];
  mat.aij(2, 4) = m[1][3];

  mat.aij(3, 1) = m[2][0];
  mat.aij(3, 2) = m[2][1];
  mat.aij(3, 3) = m[2][2];
  mat.aij(3, 4) = m[2][3];

  mat.aij(4, 1) = 0.0;
  mat.aij(4, 2) = 0.0;
  mat.aij(4, 3) = 0.0;
  mat.aij(4, 4) = 1.0;

  return true;
}

} // namespace

/** load symlib.dat file */
void SymOpDB::loadSymLibFile()
{
  // // check security policy
  //  SecurityMgr *pSecMgr = MbSysDB::getInstance()->getSecurityMgr();
  // if (!pSecMgr->permitLocalFileReadAccess()) {
  // MB_THROW(qlib::SecurityException, "cannot access local file");
  // return;
  // }

  qlib::FileInStream fis;
  fis.open(m_fname);
  qlib::LineStream lis(fis);

  Group *pCurSg = NULL;
  int ii=0;

  //for ( ;; ) {
  while (lis.ready()) {
    LString sline = lis.readLine();
    sline = sline.trim("\r\n");
    if (sline.startsWith(">")) {
      if (pCurSg!=NULL) {
        // register curSg
        appendSg(pCurSg);
      }

      pCurSg = NULL;
      ii=0;

      int nsg, nasu, nsysid;
      LString hmname, cname;
      if (!procSgLine(sline, nsg, nasu, hmname, cname, nsysid))
        continue;

      if (m_psgtab->find(nsg)!=m_psgtab->end()) {
        MB_DPRINTLN("SymOpLib Loader: sg %d already exists (ignored)", nsg);
      }
      // m_nMaxSgID = qlib::max<int>(m_nMaxSgID, nsg);

      pCurSg = new Group(nasu);
      pCurSg->id = nsg;
      pCurSg->sysid = nsysid;
      pCurSg->name = hmname;
      pCurSg->cname = cname;
    }
    else if (!sline.isEmpty()){
      if (pCurSg==NULL || ii>pCurSg->nasym) {
        MB_DPRINTLN("SymOpLib Loader: invalid input line: %s", sline.c_str());
        continue;
      }
      pCurSg->pOps[ii].name = sline;
      if (!readSymOp(lis, pCurSg->pOps[ii].mat))
        continue;
      ++ii;
    }
  }

  if (pCurSg!=NULL) {
    // register last curSg
    appendSg(pCurSg);
  }

  MB_DPRINTLN("LoadSymLib> read %d s.g.s successfully.", m_psgtab->size());
  return;
}

void SymOpDB::appendSg(Group *psg)
{
  m_psgtab->insert(SgTab::value_type(psg->id, psg));
}

void SymOpDB::load()
{
  LString path;

  SysConfig *pconf = SysConfig::getInstance();
  SysConfig::Section *pSec = pconf->getSection("symm_file");
  if (pSec!=NULL)
    path = pSec->getStringData();

  if (path.isEmpty()) {
    path = LString("%%CONFDIR%%")+MB_PATH_SEPARATOR+"symop.dat";
  }
  // translate path name
  path = pconf->convPathName(path);

  MB_DPRINTLN("SymOPDB> loading symop data file: %s", path.c_str());
  try {
    setSymLibFile(path);
  }
  catch (const qlib::LException &e) {
    LOG_DPRINTLN("SymmModule> initialization failed in reading symop file \"%s\" (reason: %s)",
		 path.c_str(),
		 e.getMsg().c_str());
  }
}

#include <qsys/UndoManager.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/ObjectEvent.hpp>
#include "SymmEditInfo.hpp"
using qsys::UndoManager;
using qsys::SceneManager;

void SymOpDB::changeXtalInfo(qlib::uid_t nObjID,
                             double a, double b, double c,
                             double alp, double bet, double gam, int nsg)
{
  qsys::ObjectPtr pObj = SceneManager::getObjectS(nObjID);
  ensureNotNull(pObj);
  qsys::ScenePtr cursc = pObj->getScene();

  CrystalInfo old_xi;
  bool bHasOld = false;
  CrystalInfoPtr pXI = pObj->getExtData("CrystalInfo");
  if (!pXI.isnull()) {
    bHasOld = true;
    old_xi = *( pXI.get() );
  }
  
  CrystalInfo new_xi(a,b,c,alp,bet,gam,nsg);
  bool bHasNew = true;

  changeXIImpl(nObjID, &new_xi);

  if (!cursc.isnull()) {
    UndoManager *pUM = cursc->getUndoMgr();
    if (pUM->isOK()) {
      // record property changed undo/redo info
      SymmEditInfo *pPEI = MB_NEW SymmEditInfo();
      pPEI->saveInfo(nObjID, bHasOld, old_xi, bHasNew, new_xi);
      pUM->addEditInfo(pPEI);
    }
  }

  // object becomes modified
  pObj->setModifiedFlag(true);
}

bool SymOpDB::changeXIImpl(qlib::uid_t nObjID, CrystalInfo *pXI)
{
  qsys::ObjectPtr pObj = SceneManager::getObjectS(nObjID);
  ensureNotNull(pObj);

  if (pXI!=NULL) {
    qsys::ObjExtDataPtr pci( MB_NEW CrystalInfo(*pXI) );
    pObj->setExtData(pci);
  }
  else {
    // remove XI
    pObj->removeExtData("CrystalInfo");
  }

  // fire event!!
  // notify update of structure
  qsys::ObjectEvent obe;
  obe.setType(qsys::ObjectEvent::OBE_CHANGED);
  obe.setTarget(pObj->getUID());
  obe.setDescr("crystalinfo");
  pObj->fireObjectEvent(obe);

  return true;
}


