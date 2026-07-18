// -*-Mode: C++;-*-
//
// PQR File writer class
//

#ifndef PQR_FILE_WRITER_H__
#define PQR_FILE_WRITER_H__

#include "surface.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjWriter.hpp>

#include <modules/molstr/molstr.hpp>

//namespace molstr{ class MolCoord; }

namespace surface {

  using molstr::MolCoord;
  using molstr::SelectionPtr;

  class PQRFileWriter : public qsys::ObjWriter
  {
    MC_SCRIPTABLE;

  private:
    typedef ObjWriter super_t;

    /// Attached molecular coordinate obj
    MolCoord *m_pMol;

    SelectionPtr m_pSel;

    // write original hydrogen atoms in MolCoord
    bool m_bUseH;

    // name space of ff to apply
    LString m_sNameSpace;

  public:
    PQRFileWriter();
    ~PQRFileWriter() override;

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

    bool isUseH() const { return m_bUseH; }
    void setUseH(bool v) { m_bUseH = v; }

    LString getNS() const { return m_sNameSpace; }
    void setNS(const LString &v) { m_sNameSpace = v; }
  };

}

#endif
