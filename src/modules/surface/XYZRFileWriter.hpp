// -*-Mode: C++;-*-
//
// XYZR File writer class
//

#ifndef XYZR_FILE_WRITER_H__
#define XYZR_FILE_WRITER_H__

#include "surface.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjWriter.hpp>

#include <modules/molstr/molstr.hpp>

//namespace molstr{ class MolCoord; }

namespace surface {

  using molstr::MolCoord;
  using molstr::SelectionPtr;

  class XYZRFileWriter : public qsys::ObjWriter
  {
    MC_SCRIPTABLE;

  private:
    typedef ObjWriter super_t;

    /// Attached molecular coordinate obj
    MolCoord *m_pMol;

    SelectionPtr m_pSel;

  public:
    XYZRFileWriter();
    virtual ~XYZRFileWriter();

    /// Attach to and lock the target object
    virtual void attach(qsys::ObjectPtr pObj);

    // // detach the current target object
    // virtual MbObject *detach();

    /// Write to the stream
    virtual bool write(qlib::OutStream &outs);

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

    virtual const char *getName() const;
    
    virtual bool canHandle(qsys::ObjectPtr pobj) const;

    // virtual bool isCompat(MbObject *pobj) const;

    SelectionPtr getSelection() const { return m_pSel; }

    void setSelection(SelectionPtr pNewSel) { m_pSel = pNewSel; }
  };

}

#endif
