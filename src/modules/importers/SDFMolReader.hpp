// -*-Mode: C++;-*-
//
// MOL/SDF format molecule structure reader class
//

#ifndef SDF_MOL_READER_HPP__
#define SDF_MOL_READER_HPP__

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
  ///   SDF/MOL structure reader class
  //
  class IMPORTERS_API SDFMolReader : public qsys::ObjReader
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

    SDFMolReader();

    ~SDFMolReader() override;

    //////////////////////////////////////////////
    // Read/build methods
  
    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    bool read(qlib::InStream &ins) override;

    /// Content-sniff: report whether `ins` looks like a V2000 SDF/MOL.
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
    void readMol(qlib::LineStream &lin, bool bskip);

    /// atom index --> atom ID mapping
    using AtomIDMap = std::map<int, int>;
    AtomIDMap m_atomIDMap;

    void readCharge(const LString &str);
  };

  /// File format exception
  MB_DECL_EXCPT_CLASS(IMPORTERS_API, SDFFormatException, qlib::FileFormatException);

}

#endif // PDB_File_H__
