// -*-Mode: C++;-*-
//
// SYBYL Mol2 format molecule structure reader class
//

#ifndef MOL2_MOL_READER_HPP__
#define MOL2_MOL_READER_HPP__

#include "importers.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjReader.hpp>
#include <modules/molstr/molstr.hpp>
#include <modules/molstr/ResidIndex.hpp>

namespace qlib {
  class LineStream;
}

namespace importers {

  using qlib::LString;
  using molstr::MolCoord;
  using molstr::MolCoordPtr;
  using molstr::MolResiduePtr;
  using molstr::ResidIndex;
  using molstr::ResidSet;

  //
  /// SYBYL Mol2 format reader class
  //
  class IMPORTERS_API MOL2MolReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

  public:

  private:
    /// building molecular coordinate obj
    MolCoordPtr m_pMol;

    /// Read atom count
    int m_nReadAtoms;

    /// Read bond count
    int m_nReadBonds;

    /// Read compound count
    int m_nReadCmpds;

    int m_nCurrResid;
    LString m_sCurrChName;

  public:
    //////////////////////////////////////////////
    // properties

    /// Load a selected compound (-1 for loading all cmpds)
    int m_iLoadCmpd;

    /// Load multi compounds as chain (or residue for false)
    bool m_bLoadAsChain;

    /// default chain name
    LString m_chainName;

    /// default residue index
    int m_nResInd;

    //////////////////////////////////////////////
  public:

    MOL2MolReader();

    ~MOL2MolReader() override;

    //////////////////////////////////////////////
    // Read/build methods
  
    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    bool read(qlib::InStream &ins) override;

    /// Content-sniff: report whether `ins` looks like a TRIPOS MOL2 file.
    int canHandleContent(qlib::InStream &ins) const override;

    //////////////////////////////////////////////
    // Information query methods

    /// get the nickname of this reader (referred from script interface)
    const char *getName() const override;

    /// get file-type description
    const char *getTypeDescr() const override;

    /// get file extension
    const char *getFileExt() const override;

    /// create default object for this reader
    qsys::ObjectPtr createDefaultObj() const override;

    // virtual int isSupportedFile(const char *fname, qlib::InStream *pins);

    //////////////////////////////////////////////

  private:

    /// read one MOL entry from stream
    /// @return return false if EOF reached
    bool readMol(qlib::LineStream &lin, bool bskip);

  };

  /// File format exception
  MB_DECL_EXCPT_CLASS(IMPORTERS_API, MOL2FormatException, qlib::FileFormatException);

}

#endif // PDB_File_H__
