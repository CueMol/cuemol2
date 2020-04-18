// -*-Mode: C++;-*-
//
//  CNS format top/par file reader class
//
//  $Id: CnsParFile.cpp,v 1.13 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>

#include <qlib/Utils.hpp>
#include "CnsParFile.hpp"
#include "TopoDB.hpp"
#include "ParamDB.hpp"

#include "ResiToppar.hpp"
#include "ResiPatch.hpp"

using namespace molstr;

CnsParFile::CnsParFile()
  : m_pParamDB(NULL), m_pTopoDB(NULL),
    m_pCurResid(NULL)
{
}

CnsParFile::~CnsParFile()
{
}

// read one token
bool CnsParFile::readRecord()
{
  char sbuf[256];
  int idx=0;

  while (!feof(m_fp)) {
    char ch = (char) getc(m_fp);
    
    //MB_DPRINT("%c,", ch);

    if (ch==EOF) {
      //MB_DPRINTLN("** EOF reached %d", ch);
      break;
    }

    // check white space
    if (ch==' ' ||
	ch=='=' ||
	ch=='\t' ||
	ch=='\r' ||
	ch=='\n') {
      if (idx==0)
	continue;
      else
	break;
    }

    // check line comment
    if (ch=='!') {
      readToEOL();

      if (idx==0)
	continue;
      else
	break;
    }

    // check region comment
    if (ch=='{') {
      readToEOC();

      if (idx==0)
	continue;
      else
	break;
    }

    // check literal token
    if (('0'<=ch && ch<='9') ||
        ('a'<=ch && ch<='z') ||
        ('A'<=ch && ch<='Z') ||
        ch=='.' || ch=='-' || ch=='+' || ch=='\'') {
      sbuf[idx] = ch;
      idx++;
      continue;
    }

    if (idx==0) {
      sbuf[idx] = ch;
      idx++;
      break;
    }

    ungetc(ch, m_fp);
    break;
  }

  if (idx==0){
    //MB_DPRINTLN("ERR!");
    return false; // no token read !!
  }

  sbuf[idx] = '\0';
  m_recbuf = sbuf;
  m_recupper = m_recbuf.toUpperCase();

  //MB_DPRINTLN("-->[%s]", m_recupper.c_str());
  return true;
}

// consume input to the End Of Line
bool CnsParFile::readToEOL()
{
  for ( ;; ) {
    char ch = getc(m_fp);
    if (ch=='\r' || ch=='\n')
      break;
    if (ch==EOF)
      return false;
  }
  return true;
}

// consume input to the "}" (End Of Comment)
bool CnsParFile::readToEOC()
{
  for ( ;; ) {
    char ch = getc(m_fp);
    if (ch=='}')
      break;
    if (ch==EOF)
      return false;
  }
  return true;
}

// consume input to the "end" keyword
bool CnsParFile::skipToEndToken()
{
  for ( ;; ) {
    if (!readRecord())
      return false;
    if (chkRec("END"))
      return true;
  }

}

////////////////////////////////////////////////////////////////////
// parameter file processing

// process BOND parameter statement
bool CnsParFile::procBondStat()
{
  // read 1 atom type of BOND
  if (!readRecord())
    return false;

  LString atnam1 = m_recupper.c_str();

  // read 2 atom type of BOND
  if (!readRecord())
    return false;

  LString atnam2 = m_recupper.c_str();

  // read energy const. of BOND
  if (!readRecord())
    return false;

  double kf;
  if (!m_recupper.toDouble(&kf))
    return false;

  // read equil. length of BOND
  if (!readRecord())
    return false;

  double r0;
  if (!m_recupper.toDouble(&r0))
    return false;

  /*
  MB_DPRINT("BOND %s - %s : Kf=%f, r0=%f\n",
	 atnam1.c_str(),
	 atnam2.c_str(),
	 kf,r0);
	 */

  return m_pParamDB->addBondPar(atnam1, atnam2,  kf,  r0);
}

// process ANGLe parameter statement
bool CnsParFile::procAnglStat()
{
  // read 1 atom type of ANGL
  if (!readRecord())
    return false;

  LString atnam1 = m_recupper.c_str();

  // read 2 atom type of ANGL
  if (!readRecord())
    return false;

  LString atnam2 = m_recupper.c_str();

  // read 3 atom type of ANGL
  if (!readRecord())
    return false;

  LString atnam3 = m_recupper.c_str();

  //

  // read energy const. of ANGL
  if (!readRecord())
    return false;

  double kf;
  if (!m_recupper.toDouble(&kf))
    return false;

  // read equil. degree of ANGL
  if (!readRecord())
    return false;

  double r0;
  if (!m_recupper.toDouble(&r0))
    return false;

//   MB_DPRINT("ANGLe %s - %s - %s: Kf=%f, r0=%f\n",
// 	 atnam1.c_str(),
// 	 atnam2.c_str(),
// 	 atnam3.c_str(),
// 	 kf,r0);

  return m_pParamDB->addAnglPar(atnam1, atnam2, atnam3,  kf,  r0);
}

// process DIHEdral/IMPRoper parameter statement
bool CnsParFile::procDiheImprStat()
{
  // read 1 atom type of DIHE/IMPR
  if (!readRecord())
    return false;
  LString atnam1 = m_recupper.c_str();

  // read 2 atom type of DIHE/IMPR
  if (!readRecord())
    return false;
  LString atnam2 = m_recupper.c_str();

  // read 3 atom type of DIHE/IMPR
  if (!readRecord())
    return false;
  LString atnam3 = m_recupper.c_str();

  // read 4 atom type of DIHE/IMPR
  if (!readRecord())
    return false;
  LString atnam4 = m_recupper.c_str();

  //

  // read energy const. of DIHE/IMPR
  if (!readRecord())
    return false;

  double kf;
  if (!m_recupper.toDouble(&kf))
    return false;

  // read periodicity of DIHE/IMPR
  if (!readRecord())
    return false;

  int pe;
  if (!m_recupper.toInt(&pe))
    return false;
  if (pe<0) return false;

  // read phase shift of DIHE/IMPR
  if (!readRecord())
    return false;

  double del;
  if (!m_recupper.toDouble(&del))
    return false;

  //MB_DPRINT("DIHEdral/IMPRoper %s - %s - %s - %s : Kf=%f, per=%d, delta=%f\n",
  //atnam1.c_str(),
  //atnam2.c_str(),
  //atnam3.c_str(),
  //atnam4.c_str(),
  //kf,pe,del);

  bool res = m_pParamDB->addDihePar(atnam1, atnam2, atnam3, atnam4,
				 kf,  pe,  del);
  if (!res)
    return false;

  return true;
}

// process NONB parameter statement
bool CnsParFile::procNonbStat()
{
  // read 1 atom type of NONB
  if (!readRecord())
    return false;
  LString atnam1 = m_recupper;

  //

  // read VdW epsilon energy of NONB
  if (!readRecord())
    return false;
  double eps;
  if (!m_recupper.toDouble(&eps))
    return false;

  // read VdW sigma radius of NONB
  if (!readRecord())
    return false;
  double sig;
  if (!m_recupper.toDouble(&sig))
    return false;

  // read VdW epsilon(1:4) energy of NONB
  if (!readRecord())
    return false;
  double eps14;
  if (!m_recupper.toDouble(&eps14))
    return false;

  // read VdW sigma(1:4) radius of NONB
  if (!readRecord())
    return false;
  double sig14;
  if (!m_recupper.toDouble(&sig14))
    return false;

  //MB_DPRINT("NONBonded %s : eps=%f, sig=%f, eps(1:4)=%f, sig(1:4)=%f\n",
  //atnam1.c_str(),
  //eps,sig,eps14,sig14);

  return m_pParamDB->addNonbPar(atnam1.c_str(),
                                 eps,  sig,  eps14,  sig14);
}

/////////////////////////////////////////////////////////////////
// topology file processing

bool CnsParFile::procMassStat()
{
  // read atom name of Mass
  if (!readRecord())
    return false;
  LString atnam1 = m_recupper;

  // read mass of atom
  if (!readRecord())
    return false;
  double mass;
  if (!m_recupper.toDouble(&mass))
    return false;

  //MB_DPRINT("MASS %s : mass=%f\n",atnam1.c_str(),mass);
  return true;
}

// process RESIdue statement
bool CnsParFile::procResiStat()
{
  // read residue name of RESIdue
  if (!readRecord())
    return false;
  LString resnam = m_recupper.c_str();

  //MB_DPRINT("RESIdue <%s> { \n", resnam.c_str());

  // create new ResiToppar object
  //  and register to the dictionary
  ResiToppar *pToppar = MB_NEW ResiToppar();
  pToppar->setName(resnam.c_str());
  m_pTopoDB->put(pToppar);
  m_pCurResid = pToppar;

  // --- residue level --- //
  for ( ;; ) {
    if (!readRecord())
      return false;

    // check end of residue
    if (chkRec("END")) {
      // TO DO : check AUTOgenerate=angle statement!!
      // m_pCurResid->autoGenAngle(m_pParamDB);
      m_pCurResid = NULL;
      break;
    }

    // ignore group statement
    if (chkRec("GROU"))
      continue;

    // check ATOM statement
    if (chkRec("ATOM")) {
      Atom atm;
      if (!procTopAtom(atm))
	return false;
      pToppar->addAtom(atm.name, atm.type, atm.sig, atm.eps,
                       atm.sig14, atm.eps14);
      continue;
    }

    // check BOND statement
    if (chkRec("BOND")) {
      Bond bnd;
      if (!procTopBond(bnd))
	return false;
      pToppar->addBond(bnd.a1name, bnd.a2name,
		       bnd.kf, bnd.r0);
      continue;
    }

    // check DIHE statement (ignore)
    if (chkRec("DIHE")) {
      Dihe dh;
      if (!procTopDiheImpr(dh, true))
	return false;

      // pToppar->addDihedral(dh.a1name, dh.a2name,
      // dh.a3name, dh.a4name,
      // dh.kf, (int)dh.pe, dh.del);
			   
      continue;
    }

    // check IMPR statement (ignore)
    if (chkRec("IMPR")) {
      Dihe imp;
      if (!procTopDiheImpr(imp, false))
	return false;

      // pToppar->addDihedral(imp.a1name, imp.a2name,
      // imp.a3name, imp.a4name,
      // imp.kf, (int)imp.pe, imp.del);

      continue;
    }

  } // for ( ;; )

  //MB_DPRINT("} RESIdue <%s>\n", resnam.c_str());
  m_pCurResid = NULL;

  return true;
}

bool CnsParFile::procTopAtom(Atom &atm)
{
  // read residue name of ATOM
  if (!readRecord())
    return false;
  LString atmnam = m_recupper;
  LString atmtyp;

  // --- atom level --- //
  for ( ;; ) {
    if (!readRecord())
      return false;

    // check end of atom
    if (chkRec("END"))
      break;

    // check type attribute
    if (chkRec("TYPE")) {
      if (!readRecord())
	return false;
      atmtyp = m_recupper;
      continue;
    }

    // ignore other attributes
  }

  //MB_DPRINT(" --> ATOM name=%s, type=%s\n",atmnam.c_str(),atmtyp.c_str());

  atm.name = atmnam.c_str();
  atm.type = atmtyp.c_str();

  if (!m_pParamDB->searchNonbPar(atm.type,
                                 atm.eps, atm.sig,
                                 atm.eps14, atm.sig14)) {
    // parameter not found !! (ignore)
//MB_DPRINT(" --> ATOM %s has no params!!\n",atmnam.c_str());
    return true;
  }

  return true;
}

bool CnsParFile::procTopBond(Bond &bnd)
{
  // read 1 atom type of BOND
  if (!readRecord())
    return false;

  LString atnam1 = m_recupper;

  // read 2 atom type of BOND
  if (!readRecord())
    return false;

  LString atnam2 = m_recupper;

  bnd.a1name = atnam1.c_str();
  bnd.a2name = atnam2.c_str();
  bnd.kf = -1.0; // sign for param not defined

  // MB_ASSERT(m_pCurResid!=NULL);
  if (m_pCurResid==NULL)
    return true;

  TopAtom *pa1 = m_pCurResid->getAtom(bnd.a1name);
  TopAtom *pa2 = m_pCurResid->getAtom(bnd.a2name);
  if (pa1==NULL || pa2==NULL) {
    // topology is broken !! (ignore)
    return true;
  }

  LString a1typ = pa1->type;
  LString a2typ = pa2->type;

  if (!m_pParamDB->searchBondPar(a1typ, a2typ, bnd.kf, bnd.r0)) {
    // parameter not found !! (ignore)
    //MB_DPRINT(" --> BOND %s-%s no params!!\n",
    //atnam1.c_str(), atnam2.c_str());
    return true;
  }

  //MB_DPRINT(" --> BOND %s-%s kf=%f, r0=%f\n",
  //atnam1.c_str(),atnam2.c_str(),
  //bnd.kf, bnd.r0);

  return true;
}

bool CnsParFile::procTopAngl(Angl &ang)
{
  // read 1 atom type of ANGL
  if (!readRecord())
    return false;

  LString atnam1 = m_recupper;

  // read 2 atom type of ANGL
  if (!readRecord())
    return false;

  LString atnam2 = m_recupper;

  // read 3 atom type of ANGL
  if (!readRecord())
    return false;

  LString atnam3 = m_recupper;

  ang.a1name = atnam1.c_str();
  ang.a2name = atnam2.c_str();
  ang.a3name = atnam3.c_str();
  ang.kf = -1.0; // sign for param not defined

  // MB_ASSERT(m_pCurResid!=NULL);
  if (m_pCurResid==NULL)
    return true;

  TopAtom *pa1 = m_pCurResid->getAtom(ang.a1name);
  TopAtom *pa2 = m_pCurResid->getAtom(ang.a2name);
  TopAtom *pa3 = m_pCurResid->getAtom(ang.a3name);
  if (pa1==NULL || pa2==NULL || pa3==NULL) {
    // topology is broken !! (ignore)
    return true;
  }

  LString a1typ = pa1->type;
  LString a2typ = pa2->type;
  LString a3typ = pa3->type;

  if (!m_pParamDB->searchAnglPar(a1typ, a2typ, a3typ,
				 ang.kf, ang.th0)) {
    // parameter not found !! (ignore)
    //MB_DPRINT(" --> ANGL %s-%s-%s no params!!\n",
    //atnam1.c_str(),
    //atnam2.c_str(),
    //atnam3.c_str());
    return true;
  }

  //MB_DPRINT(" --> BOND %s-%s kf=%f, r0=%f\n",
  //atnam1.c_str(),atnam2.c_str(),
  //bnd.kf, bnd.r0);

  return true;
}

bool CnsParFile::procTopDiheImpr(Dihe &dhe, bool fdihe)
{
  // read 1 atom type of DIHE/IMPR
  if (!readRecord())
    return false;
  LString atnam1 = m_recupper;

  // read 2 atom type of DIHE/IMPR
  if (!readRecord())
    return false;
  LString atnam2 = m_recupper;

  // read 3 atom type of DIHE/IMPR
  if (!readRecord())
    return false;
  LString atnam3 = m_recupper;

  // read 4 atom type of DIHE/IMPR
  if (!readRecord())
    return false;
  LString atnam4 = m_recupper;

  dhe.a1name = atnam1.c_str();
  dhe.a2name = atnam2.c_str();
  dhe.a3name = atnam3.c_str();
  dhe.a4name = atnam4.c_str();
  dhe.kf = -1.0; // sign for param not defined

  // MB_ASSERT(m_pCurResid!=NULL);
  if (m_pCurResid==NULL)
    return true;

  TopAtom *pa1 = m_pCurResid->getAtom(dhe.a1name);
  TopAtom *pa2 = m_pCurResid->getAtom(dhe.a2name);
  TopAtom *pa3 = m_pCurResid->getAtom(dhe.a3name);
  TopAtom *pa4 = m_pCurResid->getAtom(dhe.a4name);
  if (pa1==NULL || pa2==NULL || pa3==NULL || pa4==NULL) {
    // topology is broken !! (ignore)
    return true;
  }

  LString a1typ = pa1->type;
  LString a2typ = pa2->type;
  LString a3typ = pa3->type;
  LString a4typ = pa4->type;

  if (fdihe) {
    if (!m_pParamDB->searchDihePar(a1typ, a2typ, a3typ, a4typ,
				   dhe.kf, dhe.pe, dhe.del)) {
      // parameter not found !! (ignore)
      //MB_DPRINT(" --> DIHE %s-%s-%s-%s no params!!\n",
      //atnam1.c_str(), atnam2.c_str(),
      //atnam3.c_str(), atnam4.c_str());
      return true;
    }
    
    //MB_DPRINT(" --> DIHE %s-%s-%s-%s kf=%f, pe=%d, del=%f\n",
    //atnam1.c_str(), atnam2.c_str(),
    //atnam3.c_str(), atnam4.c_str(),
    //dhe.kf, (int)dhe.pe, dhe.del);
    return true;
  }

  // improper case
  if (!m_pParamDB->searchImprPar(a1typ, a2typ, a3typ, a4typ,
				 dhe.kf, dhe.pe, dhe.del)) {
    // parameter not found !! (ignore)
    //MB_DPRINT(" --> IMPR %s-%s-%s-%s no params!!\n",
    //atnam1.c_str(), atnam2.c_str(),
    //atnam3.c_str(), atnam4.c_str());
    return true;
  }
  

  //MB_DPRINT(" --> IMPR %s-%s-%s-%s kf=%f, pe=%d, del=%f\n",
  //atnam1.c_str(), atnam2.c_str(),
  //atnam3.c_str(), atnam4.c_str(),
  //dhe.kf, (int)dhe.pe, dhe.del);
  
  return true;
}

// process PRESidue statement
bool CnsParFile::procPresStat()
{
  // read residue name of PRESidue
  if (!readRecord())
    return false;
  LString resnam = (const char *)m_recupper;
  int nCurMod = -1;

  //MB_DPRINT("PRESidue <%s> { \n", resnam.c_str());
  ResiPatch *pPatch = MB_NEW ResiPatch();
  pPatch->setName(resnam);
  m_pTopoDB->patchPut(pPatch);

  // --- presidue level --- //
  for ( ;; ) {
    if (!readRecord())
      return false;

    // check end of residue
    if (chkRec("END"))
      break;

    // ignore group statement
    if (chkRec("GROU")) {
      // reset modifier
      nCurMod = -1; 
      continue;
    }

    // check modifiers
    if (chkRec("ADD")) {
      nCurMod = ResiPatch::PATCH_ADD;
      continue;
    }
    if (chkRec("DELE")) {
      nCurMod = ResiPatch::PATCH_DELETE;
      continue;
    }
    if (chkRec("MODI")) {
      nCurMod = ResiPatch::PATCH_MODIFY;
      continue;
    }
    
    // check ATOM statement
    if (chkRec("ATOM")) {
      Atom atm;
      if (!procTopAtom(atm))
	return false;
      if (!atm.name.isEmpty() &&
          !atm.type.isEmpty())
        pPatch->addAtom(atm.name, atm.type, nCurMod);
      continue;
    }

    // check BOND statement
    if (chkRec("BOND")) {
      Bond bnd;
      if (!procTopBond(bnd))
	return false;
      pPatch->addBond(bnd.a1name, bnd.a2name, nCurMod);
      continue;
    }

    // check ANGL statement
    if (chkRec("ANGL")) {
      Angl ang;
      if (!procTopAngl(ang))
	return false;
      // pPatch->addAngle(ang.a1name, ang.a2name,
      // ang.a3name, nCurMod);
      continue;
    }

    // check DIHE statement
    if (chkRec("DIHE")) {
      Dihe dhe;
      if (!procTopDiheImpr(dhe, true))
	return false;
      // pPatch->addTors(dhe.a1name, dhe.a2name,
      // dhe.a3name, dhe.a4name, nCurMod, true);
      continue;
    }

    // check IMPR statement
    if (chkRec("IMPR")) {
      Dihe imp;
      if (!procTopDiheImpr(imp, false))
	return false;
      // pPatch->addTors(imp.a1name, imp.a2name,
      // imp.a3name, imp.a4name, nCurMod, false);
      continue;
    }

    ////////////////////
    // CueMol extension !!

    if (chkRec("LINKDIST")) {
      double dl = -1.0;
      if (readRecord()) {
        m_recupper.toDouble(&dl);
      }
      if (dl>0.0)
        pPatch->setLinkDist(dl);
      MB_DPRINTLN("PATCH %s LINKDIST %lf", pPatch->getName().c_str(), dl);
      continue;
    }

  } // for ( ;; )

  if (pPatch->checkLinkObj()) {
    //MB_DPRINT("} LINK <%s>\n", resnam.c_str());
    m_pTopoDB->patchRemove(pPatch->getName());
    LString origname((const char *)pPatch->getName());
    LString plus  = '+' + origname;
    LString minus = '-' + origname;

    pPatch->setName((const char *)plus);
    m_pTopoDB->patchPut(pPatch);

    // register the reversed linkage
    ResiPatch *pRev = MB_NEW ResiPatch(*pPatch);
    pRev->reverse();
    pRev->setName((const char *)minus);
    m_pTopoDB->patchPut(pRev);
  }
  else {
    //MB_DPRINT("} PRESidue <%s>\n", resnam.c_str());
  }

  return true;
}

/////////////////////////////////////////////////////////////////

// processing of the linkage statements

bool CnsParFile::procLinkStat()
{
  // read presidue name of LINK
  if (!readRecord())
    return false;
  LString presnam = m_recupper;

  // read "HEAD" token
  if (!readRecord())
    return false;
  if (!chkRec("HEAD"))
    return false;

  // read patch char
  if (!readRecord())
    return false;
  char prev_ch = m_recupper[0];

  // read reference
  if (!readRecord())
    return false;
  LString prev_resi = m_recupper;


  // read "TAIL" token
  if (!readRecord())
    return false;
  if (!chkRec("TAIL"))
    return false;

  // read patch char
  if (!readRecord())
    return false;
  char next_ch = m_recupper[0];

  // read reference
  if (!readRecord())
    return false;
  LString next_resi = m_recupper;


  // read "END" token
  if (!readRecord())
    return false;
  if (!chkRec("END"))
    return false;

  //MB_DPRINT("LINKAGE %s(%c) --> %s(%c) : %s\n",
  //prev_resi.c_str(), prev_ch,
  //next_resi.c_str(), next_ch,
  //presnam.c_str());

  return m_pTopoDB->addLinkByName(prev_resi.c_str(), prev_ch,
                                    next_resi.c_str(), next_ch,
                                    presnam.c_str());
}

/////////////////////////////////////////////////////////////////

/// Process RING statement
bool CnsParFile::procRingStat()
{
  std::list<LString> rmemb;
  
  for ( ;; ) {
    if (!readRecord()) {
      LOG_DPRINTLN("RING read arguments record error!!");
      return false;
    }
    if (m_recupper.equals("END"))
      break;
    LString atnam = m_recupper.c_str();
    rmemb.push_back(atnam);
  }

  if (rmemb.size()>0)
    m_pCurResid->addRing(rmemb);
  
  return true;
}

/// Process MainCh/SideCh statement
bool CnsParFile::procSMChStat(bool bSide)
{
  std::list<LString> rmemb;
  
  for ( ;; ) {
    if (!readRecord()) {
      LOG_DPRINTLN("RING read arguments record error!!");
      return false;
    }
    if (m_recupper.equals("END"))
      break;
    LString atnam = m_recupper.c_str();
    rmemb.push_back(atnam);
  }

  if (rmemb.size()>0) {
    if (bSide)
      m_pCurResid->addSideCh(rmemb);
    else
      m_pCurResid->addMainCh(rmemb);
  }
    
  return true;
}

// process PROPResidue statement
bool CnsParFile::procPropResiStat()
{
  // read residue name of PROP
  if (!readRecord()) {
    LOG_DPRINTLN("PROP: error no residue name");
    return false;
  }
  LString resnam = m_recupper.c_str();

  // MB_DPRINT("PROP <%s> { \n", resnam.c_str());

  ResiToppar *pToppar = m_pTopoDB->get(resnam);

  if (pToppar==NULL) {
    // MB_DPRINT("Warning: Residue <%s> not found !!\n", resnam.c_str());
    pToppar = MB_NEW ResiToppar();
    pToppar->setName(resnam);
    m_pTopoDB->put(pToppar);
  }
  m_pCurResid = pToppar;

  // --- prop level --- //
  for ( ;; ) {
    if (!readRecord()) {
      LOG_DPRINTLN("PROP: error no record");
      return false;
    }

    // check end of residue
    if (chkRec("END")) {
      m_pCurResid = NULL;
      break;
    }

    if (chkRec("PIVOT")) {
      if (!readRecord()) {
	LOG_DPRINTLN("PROP: error no PIVOT argment");
        return false;
      }
      LString pivnam = m_recupper.c_str();
      pToppar->addPivotAtom(pivnam);
      // MB_DPRINTLN("Pivot %s", pivnam.c_str());
      continue;
    }

    if (chkRec("RING")) {
      if (!procRingStat()) {
	LOG_DPRINTLN("PROP: error no RING argment");
        return false;
      }
      continue;
    }

    // Side-chain atom defs
    if (chkRec("SIDECH")) {
      if (!procSMChStat(true)) {
	LOG_DPRINTLN("PROP: error no SIDECH argment");
        return false;
      }
      continue;
    }
    
    // Main-chain atom defs
    if (chkRec("MAINCH")) {
      if (!procSMChStat(false)) {
        LOG_DPRINTLN("PROP: error no MAINCH argment");
        return false;
      }
      continue;
    }

    if (chkRec("ALIAS")) {
      if (!readRecord()) {
        LOG_DPRINTLN("ALIAS: error no ALIAS argment");
        return false;
      }
      LString alias = m_recupper;
      MB_DPRINTLN("Alias %s for %s", alias.c_str(), resnam.c_str());

      m_pTopoDB->putAliasName(alias, resnam);
      continue;
    }

    if (chkRec("PROP")) {
      if (!readRecord()) {
        LOG_DPRINTLN("PROP: error no PROP argment (key)");
        return false;
      }
      LString key = m_recbuf.toLowerCase();

      if (!readRecord()) {
        LOG_DPRINTLN("PROP: error no PROP argment (value)");
        return false;
      }
      LString value = m_recbuf.toLowerCase();

      // TO DO: handle types other than string
      pToppar->setPropStr(key, value);
      continue;
    }

  } // for ( ;; )

  // MB_DPRINT("} PROP <%s>\n", resnam.c_str());
  m_pCurResid = NULL;

  return true;
}

/////////////////////////////////////////////////////////////////

// attach ParamDB obj to this I/O obj
void CnsParFile::attach(ParamDB *pdic,
			TopoDB *ptpdic)
{
  m_pParamDB = pdic;
  m_pTopoDB = ptpdic;
}

// detach ParamDB obj from this I/O obj
void CnsParFile::detach()
{
  m_pParamDB = NULL;
  m_pTopoDB = NULL;
}

// read CNS format parameter file from "filename"
bool CnsParFile::read(const char *filename)
{
  if (m_pParamDB==NULL ||
      m_pTopoDB==NULL) {
    LOG_DPRINTLN("CNSParFile> Error: CnsParFile:read() : dictionary not attached !!");
    return false;
  }

  //FILE *fp = qlib::fopen_utf8(filename, "r");
  FILE *fp = ::fopen(filename, "r");

  if (fp==NULL) {
    LOG_DPRINTLN("CNSParFile> Error: cannot open file %s",filename);
    return false;
  }

  MB_DPRINTLN("CnsParFile> reading CNS top/par file %s", filename);

  bool retval = read(fp);

  fclose(fp);

  return retval;
}

// read CNS format parameter from stream fp
bool CnsParFile::read(FILE *fp)
{
  if (m_pParamDB==NULL ||
      m_pTopoDB==NULL) {
    LOG_DPRINTLN("CNSParFile> Error: dictionary not attached !!");
    return false;
  }

  m_fp = fp;

  for ( ;; ) {
    if (!readRecord())
      break;

    if (chkRec("REMARK")) {
      char sbuf[256];
      // read to the end of line
      fgets(sbuf, sizeof sbuf, m_fp);
MB_DPRINT("CnsParFile > REMARK:%s", sbuf);
      continue;
    }

    if (chkRec("SET")) {
      // ignore set statement
      if (!skipToEndToken())
	return false;
      continue;
    }

    if (chkRec("NBON")) {
      // ignore NBONds statement
      if (!skipToEndToken())
	return false;
      continue;
    }

    if (chkRec("AUTOGEN")) {
      // ignore autogenerate statement
      if (!skipToEndToken())
	return false;
      continue;
    }

    if (chkRec("CHECKVER")) {
      if (!readRecord())
	return false;
MB_DPRINTLN("CnsParFile > FILE VERSION:%s", m_recbuf.c_str());
      continue;
    }

    if (chkRec("BOND")) {
      if (!procBondStat())
	return false;
      continue;
    }

    if (chkRec("ANGL")) {
      if (!procAnglStat())
	return false;
      continue;
    }

    if (chkRec("DIHE")) {
      if (!procDiheImprStat())
	return false;
      continue;
    }

    if (chkRec("IMPR")) {
      if (!procDiheImprStat())
	return false;
      continue;
    }

    if (chkRec("NONB")) {
      if (!procNonbStat())
	return false;
      continue;
    }

    if (chkRec("MASS")) {
      if (!procMassStat())
	return false;
      continue;
    }

    if (chkRec("RESI")) {
      if (!procResiStat())
	return false;
      continue;
    }

    if (chkRec("PRES")) {
      if (!procPresStat())
	return false;
      continue;
    }

    if (chkRec("LINK")) {
      if (!procLinkStat())
	return false;
      continue;
    }

    if (chkRec("FIRST")) {
      // ignore FIRST statement
      // TO DO : process FIRST as a patch
      if (!skipToEndToken())
	return false;
      continue;
    }

    if (chkRec("LAST")) {
      // ignore LAST statement
      // TO DO : process LAST as a patch
      if (!skipToEndToken())
	return false;
      continue;
    }

    // check the Que's extension commands
    if (chkRec("PROP")) {
      if (!procPropResiStat())
	return false;
      continue;
    }

    //MB_DPRINT("unknown record : <%s>\n", m_recbuf.c_str());
  }

  return true;
}


