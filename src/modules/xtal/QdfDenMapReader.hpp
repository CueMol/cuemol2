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
    ~QdfDenMapReader() override;

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

    //////////////////////////////////////////////
    // Read/build methods

    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    bool read(qlib::InStream &ins) override;

    ///////////////////////////////////////////

  private:

    void readData();

    int m_nx, m_ny, m_nz;
    
    void readDataArray();
    void readDataArray2();

  };

}

#endif

