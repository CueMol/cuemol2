// -*-Mode: C++;-*-
//
// Xplor/CHARMM/NAMD DCD binary trajectory file reader
//

#include <common.h>

#include "XTCTrajReader.hpp"
#include "TrajBlock.hpp"
#include "Trajectory.hpp"
#include "FortBinStream.hpp"
#include <qlib/Array.hpp>
#include <qsys/SceneManager.hpp>
#include <modules/molstr/Selection.hpp>

using qlib::Array;
// using qlib::LChar;

using namespace mdtools;

XTCTrajReader::XTCTrajReader()
     : super_t()
{
  // : m_pSel(NULL), m_pSelAtoms(NULL)
  m_nSkip = 1;
}

XTCTrajReader::~XTCTrajReader()
{
}

///////////////////////////////////////////

const char *XTCTrajReader::getName() const
{
  return "xtctraj";
}

/// get file-type description
const char *XTCTrajReader::getTypeDescr() const
{
  return "XTC binary trajectory (*.xtc)";
}

/// get file extension 
const char *XTCTrajReader::getFileExt() const
{
  return "*.xtc";
}

qsys::ObjectPtr XTCTrajReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW TrajBlock());
}

///////////////////////////////////////////

/// read from stream
bool XTCTrajReader::read(qlib::InStream &ins)
{
  if (getTargTrajUID()==qlib::invalid_uid) {
    // Set target trajectory (not trajblock) UID to prop
    TrajectoryPtr pTraj = getTargTraj();
    setTargTrajUID(pTraj->getUID());
  }

  readHeader(ins);
  readBody(ins);

  return true;
}


void XTCTrajReader::readHeader(qlib::InStream &ins)
{
  TrajBlockPtr pTrajBlk( getTarget<TrajBlock>() );
  TrajectoryPtr pTraj = getTargTraj();
}

void XTCTrajReader::readBody(qlib::InStream &ins)
{
  TrajBlockPtr pTB( getTarget<TrajBlock>() );
  TrajectoryPtr pTraj = getTargTraj();
}

void XTCTrajReader::loadFrm(int ifrm, TrajBlock *pTB)
{
  // NOT SUPPORTED??
}

