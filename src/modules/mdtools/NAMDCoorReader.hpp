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

    virtual ~NAMDCoorReader();

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

    void loadTopology();
    void loadCoord(qlib::InStream &ins);

  };

}

#endif

