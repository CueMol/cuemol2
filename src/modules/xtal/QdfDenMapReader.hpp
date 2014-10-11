// -*-Mode: C++;-*-
//
// QDF DensityMap File reader class
//

#ifndef XTAL_QDF_DENMAP_READER_HPP
#define XTAL_QDF_DENMAP_READER_HPP

#include "xtal.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsReader.hpp>

namespace xtal {

  class DensityMap;
  using qlib::LString;

  class QdfDenMapReader : public qsys::QdfAbsReader
  {
    MC_DYNCLASS;

  private:
    typedef QdfAbsReader super_t;

    DensityMap *m_pObj;

  public:
    // default constructor
    QdfDenMapReader();

    // destructor
    virtual ~QdfDenMapReader();

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

    //////////////////////////////////////////////
    // Read/build methods

    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    virtual bool read(qlib::InStream &ins);

    ///////////////////////////////////////////

  private:

    void readData();

  };

}

#endif

