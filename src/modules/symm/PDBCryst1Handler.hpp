// -*-Mode: C++;-*-
//
// PDB CRYST1 record handler
//

#ifndef XTAL_PDBCRYST1HANDLER_HPP_INCLUDED
#define XTAL_PDBCRYST1HANDLER_HPP_INCLUDED

#include "symm.hpp"

#include "CrystalInfo.hpp"
#include <modules/molstr/PDBFileReader.hpp>

namespace symm {

using molstr::PDBFileReader;
using molstr::MolCoord;

/**
   crystallographic information loader for PDBFileReader
 */

class PDBCryst1Handler : public PDBFileReader::RecordHandler
{
public:
  virtual ~PDBCryst1Handler();
  virtual const char *getRecordName() const;
  virtual bool read(const LString &record, MolCoord *pMol);
  virtual bool write(LString &record, MolCoord *pMol);
};

}

#endif // XTAL_INFO_MGR_HPP_INCLUDED_

