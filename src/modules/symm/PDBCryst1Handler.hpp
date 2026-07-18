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
  ~PDBCryst1Handler() override;
  const char *getRecordName() const override;
  bool read(const LString &record, MolCoord *pMol) override;
  bool write(LString &record, MolCoord *pMol) override;
};

}

#endif // XTAL_INFO_MGR_HPP_INCLUDED_

