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

    /// default chain name
    LString m_chainName;

    /// default residue index
    int m_nResInd;

  public:
    //////////////////////////////////////////////
    // properties

    /// load multiple models
    bool m_bLoadMultiModel;

    /// load alternate conformations
    bool m_bLoadAltConf;

    ///  load anisotropic B factors
    bool m_bLoadAnisoU;

    /// Load protein secondary structure from the file
    bool m_bLoadSecstr;
    
    /// Auto generate unknown compound's topology
    bool m_bAutoTopoGen;

    //////////////////////////////////////////////
  public:

    SDFMolReader();

    virtual ~SDFMolReader();

    //////////////////////////////////////////////
    // Read/build methods
  
    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    virtual bool read(qlib::InStream &ins);

    //////////////////////////////////////////////
    // Information query methods

    /// get the nickname of this reader (referred from script interface)
    virtual const char *getName() const;

    /// get file-type description
    virtual const char *getTypeDescr() const;

    /// get file extension
    virtual const char *getFileExt() const;

    /// create default object for this reader
    virtual qsys::ObjectPtr createDefaultObj() const;

    // virtual int isSupportedFile(const char *fname, qlib::InStream *pins);

    //////////////////////////////////////////////

  private:

    /// read one MOL entry from stream
    void readMol(qlib::LineStream &lin);

  };

  /// File format exception
  MB_DECL_EXCPT_CLASS(IMPORTERS_API, SDFFormatException, qlib::FileFormatException);

}

#endif // PDB_File_H__
