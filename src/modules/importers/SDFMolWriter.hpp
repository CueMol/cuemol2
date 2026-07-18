//
// MOL/SDF format molecule structure writer class
//

#pragma once

#include <modules/molstr/molstr.hpp>
#include <modules/molstr/ResidIndex.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/mcutils.hpp>
#include <qsys/ObjWriter.hpp>

#include "importers.hpp"

namespace qlib {
class PrintStream;
}

namespace importers {

using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolResiduePtr;
using molstr::ResidIndex;
using molstr::ResidSet;

//
///  SDF/MOL structure writer class
//
class IMPORTERS_API SDFMolWriter : public qsys::ObjWriter
{
    MC_SCRIPTABLE;

private:
    typedef ObjWriter super_t;

public:
    SDFMolWriter();
    ~SDFMolWriter() override;

    /// Attach to and lock the target object
    void attach(qsys::ObjectPtr pObj) override;

    /// write to the stream
    bool write(qlib::OutStream &outs) override;

    /// get file-type description
    const char *getTypeDescr() const override;

    /// get file extension
    const char *getFileExt() const override;

    const char *getName() const override;

    bool canHandle(qsys::ObjectPtr pobj) const override;

private:
    /// Output target selection
    molstr::SelectionPtr m_pSel;

public:
    // Set selection for writing
    void setSelection(molstr::SelectionPtr pSel)
    {
        m_pSel = pSel;
    }

    // Get selection for writing
    molstr::SelectionPtr getSelection() const
    {
        return m_pSel;
    }

private:
    /// building molecular coordinate obj
    molstr::MolCoordPtr m_pMol;

    using ResBondMap = std::map<LString, std::deque<int>>;
    ResBondMap m_resBondMap;
    void writeResidue(const molstr::MolResiduePtr &presid, qlib::PrintStream &prs);

    void writeChgLines(const std::map<int, int> &chgmap,qlib::PrintStream &prs);
};

}  // namespace importers
