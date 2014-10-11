// -*-Mode: C++;-*-
//
// QDF Light-weight object writer class
//

#ifndef LWVIER_QDFLWOBJ_WRITER_HPP_INCLUDED
#define LWVIER_QDFLWOBJ_WRITER_HPP_INCLUDED

#include "lwview.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsWriter.hpp>

namespace gfx {
  class DrawElem;
  class DrawElemV;
  class DrawElemVC;
  class DrawElemVNCI;
  class DrawElemPix;
}

namespace lwview {

  class LWObject;
  using qlib::LString;

  class QdfLWObjWriter : public qsys::QdfAbsWriter
  {
    //MC_SCRIPTABLE;
    MC_DYNCLASS;

  private:
    typedef QdfAbsWriter super_t;

    LWObject *m_pObj;

  public:
    QdfLWObjWriter();
    virtual ~QdfLWObjWriter();

    /// Attach to and lock the target object
    virtual void attach(qsys::ObjectPtr pObj);

    /// Write to the stream
    virtual bool write(qlib::OutStream &outs);

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

    virtual const char *getName() const;

    virtual bool canHandle(qsys::ObjectPtr pobj) const;

    /////////

  private:
    struct Data {
      int m_nDataID;
      gfx::DrawElem *m_pDrawElem;
    };

    std::deque<Data> m_tmpdat;

    /// build m_tmpdat for serialization
    void prepareData();

    void writeDrawElem(gfx::DrawElem *pData);
    
    void writeDrawElemV(gfx::DrawElemV *pData);
    void writeDrawElemVC(gfx::DrawElemVC *pData);
    void writeDrawElemVNCI(gfx::DrawElemVNCI *pData);

    void writeHitData();

    void writeDrawElemPix(gfx::DrawElemPix *pData);

  };

} // namespace molstr

#endif
