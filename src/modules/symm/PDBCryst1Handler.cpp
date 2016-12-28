// -*-Mode: C++;-*-
//
// PDB CRYST1 record handler
//
// $Id: PDBCryst1Handler.cpp,v 1.2 2010/09/23 13:49:13 rishitani Exp $

#include <common.h>

#include "PDBCryst1Handler.hpp"
#include "SymOpDB.hpp"
#include <modules/molstr/MolCoord.hpp>

using namespace symm;
using molstr::MolCoord;

const char *PDBCryst1Handler::getRecordName() const
{
  return "CRYST1";
}

namespace {
  inline LString extract(const LString &s, int start, int end) {
    start --; end --;
    if (end >= s.length())
      end = s.length()-1;
    if (start<0)
      start = 0;
    if (start>end)
      start = end;

    return s.substr(start, end-start+1);
  }
}

bool PDBCryst1Handler::read(const LString &record, MolCoord *pMol)
{
  if (record.startsWith("CRYST1    1.000    1.000    1.000  90.00  90.00  90.00 P 1")) {
    // no symm info (i.e. NMR structure)
    return true;
  }

  double a,b,c,alpha,beta,gamma;
  bool bErr = true;

  for (;;) {
    LString sbuf = extract(record, 7,15);
    if (!sbuf.toDouble(&a))
      break;

    sbuf = extract(record, 16,24);
    if (!sbuf.toDouble(&b))
      break;

    sbuf = extract(record, 25,33);
    if (!sbuf.toDouble(&c))
      break;

    sbuf = extract(record, 34,40);
    if (!sbuf.toDouble(&alpha))
      break;

    sbuf = extract(record, 41,47);
    if (!sbuf.toDouble(&beta))
      break;

    sbuf = extract(record, 48,54);
    if (!sbuf.toDouble(&gamma))
      break;

    bErr = false;
    break;
  }
  if (bErr) {
    LOG_DPRINTLN("PDBFileReader> invalid CRYST1 record: %s", record.toUpperCase().c_str());
    return false;
  }
  
  LString cname = extract(record, 56,66).trim(" \t\r\n").toUpperCase();
  SymOpDB *pdb = SymOpDB::getInstance();
  MB_ASSERT(pdb!=NULL);
  int sgid = pdb->getSgIDByCName(cname);
  if (sgid<1) {
    sgid = pdb->getSgIDByName(cname);
    if (sgid<1) {
      LOG_DPRINTLN("PDBFileReader> invalid spacegroup name %s in CRYST1 record", cname.c_str());
      sgid = 1; // default is P1
    }
  }

  MB_DPRINTLN("PDBFileReader> a=%.2f,     b=%.2f,    c=%.2f", a,b,c);
  MB_DPRINTLN("PDBFileReader> alpha=%.2f, beta=%.2f, gamma=%.2f",
              alpha,beta,gamma);
  MB_DPRINTLN("PDBFileReader> sg=%s", cname.c_str());


  CrystalInfoPtr pci = pMol->getCreateExtData("CrystalInfo");
  pci->setCellDimension(a,b,c,alpha,beta,gamma);
  pci->setSG(sgid);

  // fire the changed event
  // CrystalInfo::fireChangedEvent(pMol->getName());
  return true;
}

bool PDBCryst1Handler::write(LString &record, MolCoord *pMol)
{
  qlib::LScrSp<CrystalInfo> pci = qlib::LScrSp<CrystalInfo>(pMol->getExtData("CrystalInfo"));
  //if (pci==NULL)

  if (pci.isnull())
    return false;

  int nsg = pci->getSG();
  SymOpDB *pdb = SymOpDB::getInstance();
  LString hmname = pdb->getCName(nsg);

  record = LString::format(
    "CRYST1"
    "%9.3f"
    "%9.3f"
    "%9.3f"
    "%7.2f"
    "%7.2f"
    "%7.2f"
    " %-10s"
    "    ",
    pci->a(),
    pci->b(),
    pci->c(),
    pci->alpha(),
    pci->beta(),
    pci->gamma(),
    (const char *)hmname);

  return true;
}

PDBCryst1Handler::~PDBCryst1Handler()
{
}

