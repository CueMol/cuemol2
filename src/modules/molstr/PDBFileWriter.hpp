// -*-Mode: C++;-*-
//
// PDB File writer class
//
// $Id: PDBFileWriter.hpp,v 1.6 2011/04/16 07:40:51 rishitani Exp $

#ifndef PDB_FILE_WRITER_H__
#define PDB_FILE_WRITER_H__

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjWriter.hpp>

namespace qlib {
  class PrintStream;
}

namespace molstr {

  using qlib::LString;


  class PDBFileWriter : public qsys::ObjWriter
  {
    MC_SCRIPTABLE;

  private:
    typedef ObjWriter super_t;

  public:
    PDBFileWriter();
    virtual ~PDBFileWriter();

    /// Attach to and lock the target object
    virtual void attach(qsys::ObjectPtr pObj);

    // /** detach from the target object */
    // virtual qsys::ObjectPtr detach();

    /** write to the stream */
    virtual bool write(qlib::OutStream &outs);

    /** get file-type description */
    virtual const char *getTypeDescr() const;

    /** get file extension */
    virtual const char *getFileExt() const;

    virtual const char *getName() const;

    virtual bool canHandle(qsys::ObjectPtr pobj) const;

    /////////

  private:
    SelectionPtr m_pSel;
    
  public:

    // Set selection for writing
    void setSelection(SelectionPtr pSel) {
      m_pSel = pSel;
    }
    
    // Get selection for writing
    SelectionPtr getSelection() const {
      return m_pSel;
    }
    

    /////////

  private:
    //

    MolCoord *m_pMol;

    bool writeAtomLine(int nserial, const ResidIndex &rindex,
                       const char *resnam, char chainch,
                       MolAtomPtr pa, qlib::PrintStream &prs);


    void writeSecstr(qlib::PrintStream &prs);

    void writeSSBonds(qlib::PrintStream &prs);
    void writeLinks(qlib::PrintStream &prs);

    LString formatAtomName(MolAtomPtr pAtom);

    // void loadExtHandlers();
  };

} // namespace molstr

#endif
