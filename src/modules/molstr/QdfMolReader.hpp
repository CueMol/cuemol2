// -*-Mode: C++;-*-
//
// QDF MolCoord Reader class
//

#ifndef MOLSTR_QDFMOL_READER_HPP
#define MOLSTR_QDFMOL_READER_HPP

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include "PDBFileReader.hpp"

namespace molstr {

  using qlib::LString;

  class QdfMolReader : public PDBFileReader
  {
    MC_SCRIPTABLE;

  private:
    typedef PDBFileReader super_t;

  public:
    
    QdfMolReader();

    virtual ~QdfMolReader();

    //////////////////////////////////////////////
    // Read/build methods
  
    ///
    ///  Read from the input stream ins, and build the attached object.
    ///
    virtual bool read(qlib::InStream &ins);

    //////////////////////////////////////////////
    // Information query methods

    /// Get the nickname of this reader (referred from script interface)
    virtual const char *getName() const;

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

    /// Create default object for this reader
    virtual qsys::ObjectPtr createDefaultObj() const;

  };

} // namespace molstr

#endif
