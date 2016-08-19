// -*-Mode: C++;-*-
//
// Xplor/CHARMM/NAMD DCD binary trajectory file reader
//

#include <common.h>

#include "DCDTrajReader.hpp"
#include "TrajBlock.hpp"
#include "FortBinStream.hpp"
#include <qlib/Array.hpp>

// #include <modules/molstr/MolSelection.hpp>

using qlib::Array;
// using qlib::LChar;

using namespace mdtools;

DCDTrajReader::DCDTrajReader()
{
  // : m_pSel(NULL), m_pSelAtoms(NULL)
  m_nSkip = 1;
}

DCDTrajReader::~DCDTrajReader()
{
  //if (m_pSel!=NULL)
  //delete m_pSel;
  //if (m_pSelAtoms!=NULL)
  //delete m_pSelAtoms;
}

///////////////////////////////////////////

const char *DCDTrajReader::getName() const
{
  return "dcdtraj";
}

/// get file-type description
const char *DCDTrajReader::getTypeDescr() const
{
  return "DCD binary trajectory (*.dcd)";
}

/// get file extension 
const char *DCDTrajReader::getFileExt() const
{
  return "*.dcd";
}

qsys::ObjectPtr DCDTrajReader::createDefaultObj() const
{
  //return qsys::ObjectPtr();
  return qsys::ObjectPtr(MB_NEW TrajBlock());
}

///////////////////////////////////////////

/// read from stream
bool DCDTrajReader::read(qlib::InStream &ins)
{
  readHeader(ins);
  readBody(ins);

  return true;

}

void DCDTrajReader::readHeader(qlib::InStream &ins)
{
  int i;
  int nrlen;

  FortBinInStream fbis(ins);

  // Read 84-byte header 
  int nheader = fbis.getRecordSize_throw();
  if (nheader!=84) {
    LString msg =
      LString::format("DCD: Invalid header length (%d!=84)", nheader);
    LOG_DPRINTLN("%s ",msg.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  
  char ptmp[95];
  fbis.readRecord(ptmp, sizeof ptmp);

  LString mark(ptmp, 4);
  if (!mark.equals("CORD")) {
    LString msg =
      LString::format("DCD: Invalid mark (%s)", mark.c_str());
    LOG_DPRINTLN("%s ",msg.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  int *phdr = (int *)ptmp;
  phdr++;

  int nfile = phdr[0];
  LOG_DPRINTLN("DCDTraj> NFILE=%d", phdr[0]);
  phdr++;

  int npriv = phdr[0];
  LOG_DPRINTLN("DCDTraj> NPRIV=%d", npriv);
  phdr++;

  int nsavc = phdr[0];
  LOG_DPRINTLN("DCDTraj> NSAVC=%d", nsavc);
  phdr++;

  int nstep = phdr[0];
  LOG_DPRINTLN("DCDTraj> NSTEP=%d", nstep);
  phdr++;

  MB_DPRINTLN("=%d", phdr[0]);
  phdr++;
  MB_DPRINTLN("=%d", phdr[0]);
  phdr++;
  MB_DPRINTLN("=%d", phdr[0]);
  phdr++;
  MB_DPRINTLN("=%d", phdr[0]);
  phdr++;
  MB_DPRINTLN("=%d", phdr[0]);
  phdr++;

  // int namnf = ((int *)phdr)[0];
  // LOG_DPRINTLN("NAMNF=%d", namnf);
  // phdr ++;

  float deltat = ((float *)phdr)[0];
  LOG_DPRINTLN("DCDTraj> DT=%e", deltat);
  phdr++;

  int fcell = phdr[0];
  LOG_DPRINTLN("DCDTraj> FCELL=%d", fcell);
  phdr++;

  //////////

  nrlen = fbis.getRecordSize_throw();
  LOG_DPRINTLN("DCDTraj> Next record size: %d ", nrlen);
  fbis.readRecord(NULL, 1);

  //////////

  nrlen = fbis.getRecordSize_throw();
  if (nrlen!=4) {
    LString msg =
      LString::format("DCD: Invalid NATOM length (%d!=4)", nheader);
    LOG_DPRINTLN("%s ",msg.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  int natom;
  fbis.readRecord(&natom, 4);
  LOG_DPRINTLN("DCDTraj> NATOM: %d ", natom);

  m_natom = natom;
  m_nfile = nfile;
  m_fcell = fcell?true:false;
  
/*
  // check consistency with m_pTraj
  if (natom!=pTraj->getAllAtomNo()) {
    LString msg =
      LString::format("DCD: Inconsistent NATOM with param %d!=%d",
		      natom, m_pTraj->getAllAtomNo());
    LOG_DPRINTLN("%s ",msg.c_str());
    return false;
  }
*/
}

void DCDTrajReader::readBody(qlib::InStream &ins)
{
  TrajBlockPtr pTraj( getTarget<TrajBlock>() );
  
  FortBinInStream fbis(ins);

  int nread = m_nfile/m_nSkip;
  LOG_DPRINTLN("DCDTraj> Read %d frames (skip=%d)", nread, m_nSkip);
  
  pTraj->allocate(m_natom, nread);

  int jj, istep, nrlen;
  std::vector<float> tmpv(m_natom);
  
  std::vector<double> *pEng[6];
  /*
  for (int i=0; i<6; ++i) {
    if (fcell) {
      LString propname = LString::format("CELL_%d", i);
      pEng[i] = m_pTraj->getProp<double>(propname);
      if (pEng[i]==NULL)
	pEng[i] = m_pTraj->makeProp<double>(propname);
    }
    else
      pEng[i] = NULL;
  }
   */
  
  int nInd = 0;
  qfloat32 *pcoord = NULL;
  
  for (istep=0; istep<m_nfile; ++istep) {
    // MB_DPRINTLN("reading %d/%d", istep, nfile);
    if (istep%m_nSkip==0)
      pcoord = pTraj->getCrdArray(nInd);
    else
      pcoord = NULL;

    //
    // Read cell geometry
    //

    double dcell[6];
    if (m_fcell) {
      nrlen = fbis.getRecordSize_throw();
      if (nrlen!=48) {
	LString msg = LString::format("DCD: Invalid CELL record length (%d!=4)", nrlen);
	LOG_DPRINTLN("%s ",msg.c_str());
        MB_THROW(qlib::FileFormatException, msg);
	return;
      }
      
      fbis.readRecord(dcell, 48);
      //LOG_DPRINTLN("CELL: (%f), (%f,%f) (%f,%f,%f)",
      //dcell[0], dcell[1], dcell[2],
      //dcell[3], dcell[4], dcell[5]);

      // for (i=0; i<6; ++i)
      // pEng[i]->at(nTotalInd) = dcell[i];
    }
    
    //
    // Read X coordinates record
    //

    nrlen = fbis.getRecordSize_throw();
    // MB_DPRINTLN("X record size: %d ", nrlen);
    if (nrlen != sizeof(float)*m_natom) {
      LString msg = LString::format("DCD: Invalid X record length (%d!=%d)",
				    nrlen, sizeof(float)*m_natom);
      LOG_DPRINTLN("%s ",msg.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return;
    }
    fbis.readRecord(&tmpv[0], //const_cast<float *>(pTmp->data()),
                    sizeof(float)*m_natom);
    
    if (pcoord!=NULL)
      for (jj=0; jj<m_natom; ++jj)
        pcoord[jj*3+0] = tmpv[jj];
    
    //
    // Read Y coordinates record
    //
    
    nrlen = fbis.getRecordSize_throw();
    // MB_DPRINTLN("Y record size: %d ", nrlen);
    if (nrlen != sizeof(float)*m_natom) {
      LString msg = LString::format("DCD: Invalid Y record length (%d!=%d)",
				    nrlen, sizeof(float)*m_natom);
      LOG_DPRINTLN("%s ",msg.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return;
    }
    fbis.readRecord(&tmpv[0], //const_cast<float *>(pTmp->data()),
		    sizeof(float)*m_natom);
    
    if (pcoord!=NULL)
      for (jj=0; jj<m_natom; ++jj)
        pcoord[jj*3+1] = tmpv[jj];
    
    //
    // Read Z coordinates record
    //
    
    nrlen = fbis.getRecordSize_throw();
    // MB_DPRINTLN("Z record size: %d ", nrlen);
    if (nrlen != sizeof(float)*m_natom) {
      LString msg = LString::format("DCD: Invalid Z record length (%d!=%d)",
				    nrlen, sizeof(float)*m_natom);
      LOG_DPRINTLN("%s ",msg.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return;
    }
    fbis.readRecord(&tmpv[0], //const_cast<float *>(pTmp->data()),
		    sizeof(float)*m_natom);
    
    if (pcoord!=NULL)
      for (jj=0; jj<m_natom; ++jj)
        pcoord[jj*3+2] = tmpv[jj];
    
    if (pcoord!=NULL)
      nInd ++;
  }
}

