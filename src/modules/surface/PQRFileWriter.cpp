// -*-Mode: C++;-*-
//
// PQR coordinate writer
//
// $Id: PQRFileWriter.cpp,v 1.4 2011/04/16 14:32:28 rishitani Exp $
//

#include <common.h>

#include "PQRFileWriter.hpp"

#include <qlib/PrintStream.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/TopparManager.hpp>

using namespace molstr;
using namespace surface;

// MC_DYNCLASS_IMPL(PQRFileWriter, PQRFileWriter, qlib::LSpecificClass<PQRFileWriter>);

PQRFileWriter::PQRFileWriter()
     : m_pMol(NULL)
{
  m_bUseH = false;
}

PQRFileWriter::~PQRFileWriter()
{
}

// attach MolCoord obj to this I/O obj
void PQRFileWriter::attach(qsys::ObjectPtr pMol)
{
  if (!canHandle(pMol)) {
    MB_THROW(qlib::InvalidCastException, "PQRFileWriter");
    return;
  }
  super_t::attach(pMol);
}

/// get file-type description
const char *PQRFileWriter::getTypeDescr() const
{
  return "PQR coordinates(*.pqr)";
}

/// get file extension
const char *PQRFileWriter::getFileExt() const
{
  return "*.pqr";
}

/// get nickname for scripting
const char *PQRFileWriter::getName() const
{
  return "pqr";
}

bool PQRFileWriter::canHandle(qsys::ObjectPtr pobj) const
{
  return (dynamic_cast<MolCoord *>(pobj.get())!=NULL);
}

/////////

// write PQR file to stream
bool PQRFileWriter::write(qlib::OutStream &outs)
{
  const float water_rad = 1.6f;
  const float vdw_default = 2.0f;

  m_pMol = super_t::getTarget<MolCoord>();
  if (m_pMol==NULL) {
    LOG_DPRINTLN("PQRWriter> MolCoord is not attached !!");
    return false;
  }

  TopparManager *pTM = TopparManager::getInstance();

  MolCoordPtr pMol(m_pMol);
  qlib::PrintStream prs(outs);
  AtomIterator iter(pMol);
  if (!m_pSel.isnull())
    iter.setSelection(m_pSel);

  int index = 0;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolAtomPtr pAtom = iter.get();
    MB_ASSERT(!pAtom.isnull());

    // ignore altenate conf
    char confid = pAtom->getConfID();
    if (confid!='\0' && confid!='A')
      continue;

    // ignore hydrogens if m_bUseH==false
    if (m_bUseH==false && pAtom->getElement()==ElemSym::H)
      continue;

    LString atomnam = pAtom->getName();
    LString resnam = pAtom->getResName();
    
    double vdw = pTM->getVdwRadius(pAtom, m_bUseH);
    if (vdw<0)
      vdw = vdw_default;
    
    LString cname = pAtom->getChainName();
    int resid = pAtom->getResIndex().toInt();
    double chg = 0.0;

    LString aprops = LString::format("%4s %3s %s %4d",
				     atomnam.c_str(), resnam.c_str(), cname.c_str(), resid);
    if (!pTM->getCharge(pAtom, m_bUseH, m_sNameSpace, chg)) {
      MB_DPRINTLN("PQR> Charge is unknown for atom %s", aprops.c_str());
    }

    prs.format("ATOM %6d %s "
               "%7.3f "
               "%7.3f "
               "%7.3f "
               "%11.8f %7.3f\n",
               index, aprops.c_str(),
               pAtom->getPos().x(), pAtom->getPos().y(), pAtom->getPos().z(), chg, vdw);
    ++index;
  }

  return true;
}
