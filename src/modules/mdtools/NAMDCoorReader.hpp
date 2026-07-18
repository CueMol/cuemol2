// -*-Mode: C++;-*-
//
// NAMD coor file reader class
//

#ifndef NAMD_COOR_READER_HPP__
#define NAMD_COOR_READER_HPP__

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjReader.hpp>
#include <modules/molstr/molstr.hpp>

namespace qlib {
  class LClass;
}

namespace mdtools {

  using qlib::LString;
  using molstr::MolCoordPtr;

  //
  ///   NAMD restart coor file reader class
  //
  class MDTOOLS_API NAMDCoorReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

  private:
    /// building molecular coordinate obj
    MolCoordPtr m_pMol;

    //////////////////////////////////////////////
  public:

    NAMDCoorReader();

    ~NAMDCoorReader() override;

    //////////////////////////////////////////////
    // Read/build methods
  
    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    bool read(qlib::InStream &ins) override;

    /// Content sniff: NAMD coor has no magic. Validate that the
    /// first int32 (natoms) plus the first atom xyz (3 * float64)
    /// look plausible under either native or byte-swapped endian.
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

    void loadTopology();
    void loadCoord(qlib::InStream &ins);

  };

}

#endif

