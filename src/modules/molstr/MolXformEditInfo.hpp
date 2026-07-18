// -*-Mode: C++;-*-
//
// Structure-transforming edit information
//

#ifndef MOL_XFRM_EDIT_INFO_HPP_INCLUDED_
#define MOL_XFRM_EDIT_INFO_HPP_INCLUDED_

#include "molstr.hpp"
#include "Selection.hpp"

#include <qsys/EditInfo.hpp>
#include <qlib/Vector4D.hpp>

namespace molstr {

using qlib::Vector4D;

///
///  Undo/Redoable edit-information for structure-transformation
///

class MOLSTR_API MolXformEditInfo : public qsys::EditInfo
{
private:
  /// Target Mol ID
  qlib::uid_t m_nTgtUID;

  typedef std::vector<std::pair<int, Vector4D> > data_t;

  /// undo/redo data
  data_t m_before;
  data_t m_after;

  bool moveImpl(data_t &data);

public:
  MolXformEditInfo();
  ~MolXformEditInfo() override;

  /////////////////////////////////////////////////////

  /// save atom positions before transformation
  void saveBeforePos(MolCoordPtr pmol);
  void saveBeforePos(MolCoordPtr pmol, SelectionPtr hsel);

  /// save atom positions after transformation
  void saveAfterPos(MolCoordPtr pmol);
  void saveAfterPos(MolCoordPtr pmol, SelectionPtr hsel);

  void clear();

//  void setDesc(const LString &desc) { m_desc = desc; }

  /////////////////////////////////////////////////////

  /// perform undo
  bool undo() override;

  /// perform redo
  bool redo() override;

  bool isUndoable() const override;
  bool isRedoable() const override;

};

}

#endif // MOL_XFORM_EDIT_INFO_HPP_INCLUDED_

