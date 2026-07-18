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
    ~XYZRFileWriter() override;

    /// Attach to and lock the target object
    void attach(qsys::ObjectPtr pObj) override;

    // // detach the current target object
    // virtual MbObject *detach();

    /// Write to the stream
    bool write(qlib::OutStream &outs) override;

    /// Get file-type description
    const char *getTypeDescr() const override;

    /// Get file extension
    const char *getFileExt() const override;

    const char *getName() const override;
    
    bool canHandle(qsys::ObjectPtr pobj) const override;

    // virtual bool isCompat(MbObject *pobj) const;

    SelectionPtr getSelection() const { return m_pSel; }

    void setSelection(SelectionPtr pNewSel) { m_pSel = pNewSel; }
  };

}

#endif
