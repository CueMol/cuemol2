// -*-Mode: C++;-*-
//
// QDF MolCoord Reader class
//

#ifndef MOLSTR_QDFPDBREADER_HPP
#define MOLSTR_QDFPDBREADER_HPP

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include "PDBFileReader.hpp"

namespace molstr {

  using qlib::LString;

  class QdfPdbReader : public PDBFileReader
  {
    MC_SCRIPTABLE;

  private:
    typedef PDBFileReader super_t;

  public:
    
    QdfPdbReader();

    ~QdfPdbReader() override;

    //////////////////////////////////////////////
    // Read/build methods
  
    ///
    ///  Read from the input stream ins, and build the attached object.
    ///
    bool read(qlib::InStream &ins) override;

    //////////////////////////////////////////////
    // Information query methods

    /// Get the nickname of this reader (referred from script interface)
    const char *getName() const override;

    /// Get file-type description
    const char *getTypeDescr() const override;

    /// Get file extension
    const char *getFileExt() const override;

    /// Create default object for this reader
    qsys::ObjectPtr createDefaultObj() const override;

  };

} // namespace molstr

#endif

