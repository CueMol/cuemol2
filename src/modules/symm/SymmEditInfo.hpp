// -*-Mode: C++;-*-
//
// Crystal info edit info
//

#ifndef SYMM_EDIT_INFO_HPP_INCLUDED
#define SYMM_EDIT_INFO_HPP_INCLUDED

#include "symm.hpp"

#include <qsys/EditInfo.hpp>

namespace symm {

///
///  Undo/Redoable edit-information for structure-transformation
///

class SYMM_API SymmEditInfo : public qsys::EditInfo
{
private:
  /// Target Obj ID
  qlib::uid_t m_nTgtUID;

  CrystalInfo m_oldxi;
  bool m_bHasOld;

  CrystalInfo m_newxi;
  bool m_bHasNew;

public:
  SymmEditInfo()
  {
  }
  
  ~SymmEditInfo() override
  {
  }

  /////////////////////////////////////////////////////

  void saveInfo(qlib::uid_t nObjID,
                bool bHasOld, const CrystalInfo &old_xi,
                bool bHasNew, const CrystalInfo &new_xi)
  {
    m_nTgtUID = nObjID;
    m_bHasOld = bHasOld;
    m_bHasNew = bHasNew;
    m_oldxi = old_xi;
    m_newxi = new_xi;
  }

  /////////////////////////////////////////////////////

  /// perform undo
  bool undo() override
  {
    SymOpDB *pDB = SymOpDB::getInstance();
    if (m_bHasOld)
      return pDB->changeXIImpl(m_nTgtUID, &m_oldxi);
    else
      return pDB->changeXIImpl(m_nTgtUID, NULL);
  }

  /// perform redo
  bool redo() override
  {
    SymOpDB *pDB = SymOpDB::getInstance();
    if (m_bHasNew)
      return pDB->changeXIImpl(m_nTgtUID, &m_newxi);
    else
      return pDB->changeXIImpl(m_nTgtUID, NULL);
  }

  bool isUndoable() const override
  {
    return true;
  }
  
  bool isRedoable() const override
  {
    return true;
  }

};

}

#endif // MOL_XFORM_EDIT_INFO_HPP_INCLUDED_



