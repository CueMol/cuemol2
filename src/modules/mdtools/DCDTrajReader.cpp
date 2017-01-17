// -*-Mode: C++;-*-
//
// Xplor/CHARMM/NAMD DCD binary trajectory file reader
//

#include <common.h>

#include "DCDTrajReader.hpp"
#include "TrajBlock.hpp"
#include "Trajectory.hpp"
#include "FortBinStream.hpp"
#include <qlib/Array.hpp>
#include <qsys/SceneManager.hpp>
#include <modules/molstr/Selection.hpp>

using qlib::Array;
// using qlib::LChar;

using namespace mdtools;

DCDTrajReader::DCDTrajReader()
     : super_t()
{
  // : m_pSel(NULL), m_pSelAtoms(NULL)
  m_nSkip = 1;
  m_nTrajUID = qlib::invalid_uid;
  m_nHeadPos = 0;
  m_pIn = NULL;
}

DCDTrajReader::~DCDTrajReader()
{
  MB_DPRINTLN("DCDTrajReader destructed.");
  if (m_pIn!=NULL)
    delete m_pIn;
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

TrajectoryPtr DCDTrajReader::getTargTraj() const
{
  TrajectoryPtr pTraj;
  if (m_nTrajUID!=qlib::invalid_uid) {
    pTraj = qsys::SceneManager::getObjectS(m_nTrajUID);
  }
  else {
    TrajBlockPtr pTrajBlk( getTarget<TrajBlock>() );
    qlib::uid_t nTrajUID = pTrajBlk->getTrajUID();
    pTraj = qsys::SceneManager::getObjectS(nTrajUID);
  }
  return pTraj;
}

void DCDTrajReader::readHeader(qlib::InStream &ins)
{
  TrajBlockPtr pTrajBlk( getTarget<TrajBlock>() );
  TrajectoryPtr pTraj = getTargTraj();

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
  LOG_DPRINTLN("DCDTraj> NATOM: %d", natom);

  m_natom = natom;
  m_nfile = nfile;
  m_fcell = fcell?true:false;
  
  // check consistency with m_pTraj
  if (natom!=pTraj->getAllAtomSize()) {
    LString msg =
      LString::format("DCD: Inconsistent NATOM with param %d!=%d",
		      natom, pTraj->getAllAtomSize());
    LOG_DPRINTLN("%s ",msg.c_str());
    return;
  }

}

void DCDTrajReader::readBody(qlib::InStream &ins)
{
  TrajBlockPtr pTB( getTarget<TrajBlock>() );
  TrajectoryPtr pTraj = getTargTraj();
  
  FortBinInStream fbis(ins);

  int nread = m_nfile/m_nSkip;
  LOG_DPRINTLN("DCDTraj> Read %d frames (skip=%d)", nread, m_nSkip);
  double dmem = double(m_natom*3*sizeof(qfloat32)*nread)/1024.0/1024.0;

  quint32 nReadAtoms = pTraj->getAtomSize();

  try {
    pTB->allocate(nReadAtoms, nread);
  }
  catch (std::exception &e) {
    LOG_DPRINTLN("DCDTraj> Mem alloc %f Mbytes failed: %s", dmem, e.what());
    throw e;
  }
  LOG_DPRINTLN("DCDTraj> Alloc %f Mbytes", dmem);

  if (isLazyLoad()) {
    if (ins.isSeekable()) {
      pTB->setTrajLoader(TrajBlockReaderPtr(this));
      m_nHeadPos = ins.getFilePos();
      return;
    }
    else {
      LOG_DPRINTLN("DCDTraj> WARNING: Lazy loading is requested, but the input stream is not seekable.");
    }
  }

  int jj, istep, nrlen;
  std::vector<float> tmpv(m_natom * 3);
  
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
      pcoord = pTB->getCrdArray(nInd);
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
    fbis.readRecord(&tmpv[0], sizeof(float)*m_natom);
    
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
    fbis.readRecord(&tmpv[m_natom], sizeof(float)*m_natom);
    
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
    fbis.readRecord(&tmpv[m_natom*2], sizeof(float)*m_natom);
    
    // copy to coord buffer
    if (pcoord!=NULL) {
      const quint32 *psia = pTraj->getSelIndexArray();
      for (jj=0; jj<nReadAtoms; ++jj) {
        const int k = psia[jj];
        pcoord[jj*3+0] = tmpv[k+m_natom*0];
        pcoord[jj*3+1] = tmpv[k+m_natom*1];
        pcoord[jj*3+2] = tmpv[k+m_natom*2];
      }
	  pTB->setLoaded(nInd, true);
	  nInd++;
    }

  }

  //pTraj->append(pTB);
}

void DCDTrajReader::loadFrm(int ifrm, TrajBlock *pTB)
{
  int istep = ifrm * m_nSkip;

  if (istep<0 || m_nfile<=istep) {
    // MB_THROW
    return;
  }

  if (m_pIn==NULL)
    m_pIn = createInStream();

  int jj, nrlen;
  std::vector<float> tmpv(m_natom * 3);
  
  qfloat32 *pcoord = NULL;
  
  int nfrmsz = (4 + m_natom*4 + 4)*3;
  if (m_fcell)
    nfrmsz += (4 + 6*8 + 4);

  qint64 npos = m_nHeadPos + nfrmsz * istep;
  m_pIn->setFilePos(npos);

  pcoord = pTB->getCrdArray(ifrm);
  FortBinInStream fbis(*m_pIn);

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
    
  // Read X coordinates record
  nrlen = fbis.getRecordSize_throw();
  // MB_DPRINTLN("X record size: %d ", nrlen);
  if (nrlen != sizeof(float)*m_natom) {
    LString msg = LString::format("DCD: Invalid X record length (%d!=%d)",
                                  nrlen, sizeof(float)*m_natom);
    LOG_DPRINTLN("%s ",msg.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  fbis.readRecord(&tmpv[0], sizeof(float)*m_natom);
  
  // Read Y coordinates record
  nrlen = fbis.getRecordSize_throw();
  // MB_DPRINTLN("Y record size: %d ", nrlen);
  if (nrlen != sizeof(float)*m_natom) {
    LString msg = LString::format("DCD: Invalid Y record length (%d!=%d)",
                                  nrlen, sizeof(float)*m_natom);
    LOG_DPRINTLN("%s ",msg.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  fbis.readRecord(&tmpv[m_natom], sizeof(float)*m_natom);
  
  // Read Z coordinates record
  nrlen = fbis.getRecordSize_throw();
  // MB_DPRINTLN("Z record size: %d ", nrlen);
  if (nrlen != sizeof(float)*m_natom) {
    LString msg = LString::format("DCD: Invalid Z record length (%d!=%d)",
                                  nrlen, sizeof(float)*m_natom);
    LOG_DPRINTLN("%s ",msg.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  fbis.readRecord(&tmpv[m_natom*2], sizeof(float)*m_natom);
  
  // Copy to coord buffer
  TrajectoryPtr pTraj = getTargTraj();
  quint32 nReadAtoms = pTraj->getAtomSize();
  const quint32 *psia = pTraj->getSelIndexArray();
  for (jj=0; jj<nReadAtoms; ++jj) {
    const int k = psia[jj];
    pcoord[jj*3+0] = tmpv[k+m_natom*0];
    pcoord[jj*3+1] = tmpv[k+m_natom*1];
    pcoord[jj*3+2] = tmpv[k+m_natom*2];
  }
  pTB->setLoaded(ifrm, true);

  if (pTB->isAllLoaded()) {
    m_pIn->close();
    delete m_pIn;
    m_pIn = NULL;
  }

}

