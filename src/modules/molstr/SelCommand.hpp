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
    virtual ~SelCommand();

    /////////////////////////////////////////////////

    /// compile from sel string
    bool compile(const LString &cmd, qlib::uid_t nCtxtID = qlib::invalid_uid);

    /////////////////////////////////////////////////

    virtual int isSelectedMol(MolCoordPtr pobj);
    virtual int isSelectedChain(MolChainPtr pchain);
    virtual int isSelectedResid(MolResiduePtr presid);
    virtual bool isSelected(MolAtomPtr patom);

    virtual LString toString() const;
    virtual bool isStrConv() const;
    // virtual bool fromString(const LString &src);

    virtual bool isEmpty() const;

    LString dumpNodes() const;

    void setErrorMsg(const LString &msg) {
        m_errorMsg = msg;
    }
    LString getErrorMsg() const {
        return m_errorMsg;
    }
  };

}

#endif // CONSTRUCTION_SELECTION_H__
