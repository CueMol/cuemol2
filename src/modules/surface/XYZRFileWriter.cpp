// -*-Mode: C++;-*-
//
// XYZR coordinate writer
//
// $Id: XYZRFileWriter.cpp,v 1.3 2011/04/03 08:08:46 rishitani Exp $
//

#include <common.h>

#include "XYZRFileWriter.hpp"

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

// MC_DYNCLASS_IMPL(XYZRFileWriter, XYZRFileWriter, qlib::LSpecificClass<XYZRFileWriter>);

XYZRFileWriter::XYZRFileWriter()
     : m_pMol(NULL)
{
}

XYZRFileWriter::~XYZRFileWriter()
{
}

// attach MolCoord obj to this I/O obj
void XYZRFileWriter::attach(qsys::ObjectPtr pMol)
{
  if (!canHandle(pMol)) {
    MB_THROW(qlib::InvalidCastException, "XYZRFileWriter");
    return;
  }
  super_t::attach(pMol);
}

/// get file-type description
const char *XYZRFileWriter::getTypeDescr() const
{
  return "XYZR coordinates(*.xyzr)";
}

/// get file extension
const char *XYZRFileWriter::getFileExt() const
{
  return "*.xyzr";
}

/// get nickname for scripting
const char *XYZRFileWriter::getName() const
{
  return "xyzr";
}

bool XYZRFileWriter::canHandle(qsys::ObjectPtr pobj) const
{
  return (dynamic_cast<MolCoord *>(pobj.get())!=NULL);
}

/////////

// write XYZR file to stream
bool XYZRFileWriter::write(qlib::OutStream &outs)
{
  // const float water_rad = 1.6f;
  const float vdw_default = 2.0f;

  m_pMol = super_t::getTarget<MolCoord>();
  if (m_pMol==NULL) {
    LOG_DPRINTLN("XYZRWriter> MolCoord is not attached !!");
    return false;
  }

  TopparManager *pTM = TopparManager::getInstance();

  MolCoordPtr pMol(m_pMol);
  qlib::PrintStream prs(outs);
  AtomIterator iter(pMol);
  if (!m_pSel.isnull())
    iter.setSelection(m_pSel);

  for (iter.first(); iter.hasMore(); iter.next()) {
    MolAtomPtr pAtom = iter.get();
    MB_ASSERT(!pAtom.isnull());

    // ignore altenate conf
    char confid = pAtom->getConfID();
    if (confid!='\0' && confid!='A')
      continue;

    LString atomnam = pAtom->getName();
    LString resnam = pAtom->getResName();
    
    double vdw = pTM->getVdwRadius(pAtom, false);
    if (vdw<0)
      vdw = vdw_default;
    
    prs.format("%8.3f "
               "%8.3f "
               "%8.3f "
               "%4.2f\n",
               pAtom->getPos().x(), pAtom->getPos().y(), pAtom->getPos().z(), vdw);
  }

  return true;
}
