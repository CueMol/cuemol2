// -*-Mode: C++;-*-
//
// QDF Light-weight object reader class
//

#ifndef LWVIER_QDFLWOBJ_READER_HPP_INCLUDED
#define LWVIER_QDFLWOBJ_READER_HPP_INCLUDED

#include "lwview.hpp"

//#include <qlib/mcutils.hpp>
//#include <qlib/LExceptions.hpp>
#include <qlib/Array.hpp>
#include <qsys/QdfAbsReader.hpp>
#include <gfx/DrawElem.hpp>

namespace lwview {

  class LWObject;
  using qlib::LString;

  class QdfLWObjReader : public qsys::QdfAbsReader
  {
    //MC_SCRIPTABLE;
    MC_DYNCLASS;

  private:
    typedef qsys::QdfAbsReader super_t;

    LWObject *m_pObj;

    /// file version number
    int m_nVer;

  public:
    /// default constructor
    QdfLWObjReader();

    /// destructor
    virtual ~QdfLWObjReader();

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
    LWRendPtr findRenderer(int nID);

    struct Data {
      int m_nDataID;
      gfx::DrawElem *m_pDrawElem;
    };

    qlib::Array<Data> m_tmpdat;

    void readTypeIndex();
    void scatterDrawElem();

    void readDrawElem(gfx::DrawElem *pData);

    void readDrawElemV(gfx::DrawElemV * pData);
    void readDrawElemVC(gfx::DrawElemVC * pData);
    void readDrawElemVNCI(gfx::DrawElemVNCI * pData);

    void readHitData();

    void readDrawElemPix(gfx::DrawElemPix * pData);
  };

}

#endif

