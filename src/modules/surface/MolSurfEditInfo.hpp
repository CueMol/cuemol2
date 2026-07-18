// -*-Mode: C++;-*-
//
// Molecular surface edit information
//

#ifndef MOL_SURF_EDIT_INFO_HPP_INCLUDED_
#define MOL_SURF_EDIT_INFO_HPP_INCLUDED_

#include "surface.hpp"

#include <qsys/EditInfo.hpp>
#include "MolSurfObj.hpp"

namespace surface {

  ///
  ///  Undo/Redoable edit-information for molecular surface
  ///
  class SURFACE_API MolSurfEditInfo : public qsys::EditInfo
  {
  private:
    /// Target MolSurf ID
    qlib::uid_t m_nTgtUID;

    /// data
    int m_nVerts;
    MSVert *m_pVerts;

    int m_nFaces;
    MSFace *m_pFaces;

  public:
    MolSurfEditInfo();
    ~MolSurfEditInfo() override;

    /////////////////////////////////////////////////////

    void setup(MolSurfObj *psurf);

    void clear();


    /////////////////////////////////////////////////////

    /// perform undo
    bool undo() override;

    /// perform redo
    bool redo() override;

    bool isUndoable() const override;
    bool isRedoable() const override;

  private:
    MolSurfObj *getTargetObj() const;

  };

}

#endif // MOL_SURF_EDIT_INFO_HPP_INCLUDED_

