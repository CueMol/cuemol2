// -*-Mode: C++;-*-
//
// SelCommand : selection by commands
//
// $Id: SelCommand.hpp,v 1.7 2011/02/05 11:47:04 rishitani Exp $

#ifndef MOL_CONSTRUCTION_SELECTION_H__
#define MOL_CONSTRUCTION_SELECTION_H__

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>
//#include <qlib/Box3D.hpp>

#include "Selection.hpp"
//#include "SelNodes.hpp"
//#include "MolCachedSel.hpp"

namespace molstr {

  using qlib::Vector4D;
  //using qlib::Box3D;
  
  class MolAtom;
  class MolResidue;
  class MolCoord;
  class SelSuperNode;
  
  /**
     selection by molecular selection syntax
  */
  class MOLSTR_API SelCommand : public Selection
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    SelSuperNode *m_pSelRoot;

    LString m_origcmd;

    LString m_errorMsg;

  public:
    /// default ctor
    SelCommand();

    /// copy ctor
    SelCommand(const SelCommand &src);

    /// compile from command string
    SelCommand(const LString &psz);

    /// create from SelNode object
    SelCommand(SelSuperNode *pNode);

    /// dtor
    ~SelCommand() override;

    /////////////////////////////////////////////////

    /// compile from sel string
    bool compile(const LString &cmd, qlib::uid_t nCtxtID = qlib::invalid_uid);

    /////////////////////////////////////////////////

    int isSelectedMol(MolCoordPtr pobj) override;
    int isSelectedChain(MolChainPtr pchain) override;
    int isSelectedResid(MolResiduePtr presid) override;
    bool isSelected(MolAtomPtr patom) override;

    LString toString() const override;
    bool isStrConv() const override;
    // virtual bool fromString(const LString &src);

    bool isEmpty() const override;

    LString dumpNodes() const;

    /// An equivalent, usually shorter expression (SelSimplifier), checked to
    /// compile; the expression as it is when the shorter one does not.
    /// For expressions the GUI or a console builds by wrapping the current
    /// one; an expression a user typed is not rewritten behind their back.
    LString simplify() const;

    /// not (this), simplified (so that inverting twice gives this back).
    /// "*" for an empty selection.
    LString invertSimplified() const;

    /// bysidech (this), or the inside when this is bysidech already.
    LString toggleSidechain() const;

    /// this around dist (byres when bByres), replacing an around already at
    /// the root, so that choosing another distance does not stack them.
    LString rewriteAround(double dist, bool bByres) const;

  private:
    LString rewriteChecked(int nEdit, double dist, bool bByres, const LString &fallback) const;

  public:

    void setErrorMsg(const LString &msg) {
        m_errorMsg = msg;
    }
    LString getErrorMsg() const {
        return m_errorMsg;
    }
  };

}

#endif // CONSTRUCTION_SELECTION_H__
