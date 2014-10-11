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
  
  virtual ~SymmEditInfo()
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
  virtual bool undo()
  {
    SymOpDB *pDB = SymOpDB::getInstance();
    if (m_bHasOld)
      return pDB->changeXIImpl(m_nTgtUID, &m_oldxi);
    else
      return pDB->changeXIImpl(m_nTgtUID, NULL);
  }

  /// perform redo
  virtual bool redo()
  {
    SymOpDB *pDB = SymOpDB::getInstance();
    if (m_bHasNew)
      return pDB->changeXIImpl(m_nTgtUID, &m_newxi);
    else
      return pDB->changeXIImpl(m_nTgtUID, NULL);
  }

  virtual bool isUndoable() const
  {
    return true;
  }
  
  virtual bool isRedoable() const
  {
    return true;
  }

};

}

#endif // MOL_XFORM_EDIT_INFO_HPP_INCLUDED_



