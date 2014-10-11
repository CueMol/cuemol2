// -*-Mode: C++;-*-
//
// Protein secondary structure
//

#ifndef PROT_2NDRY_STR_HPP
#define PROT_2NDRY_STR_HPP

#include "molstr.hpp"

#include <qsys/EditInfo.hpp>

namespace molstr {

  class MOLSTR_API Prot2ndrySet
  {
  public:

    /// helix/sheet information
    ResidSet m_helix;
    ResidSet m_helix310;
    ResidSet m_helixpi;
    ResidSet m_sheet;
    
  public:
    Prot2ndrySet() {}

    /// Create from mol
    void create(MolCoordPtr pMol);

    /// Apply to mol
    void applyTo(MolCoordPtr pMol);

    void clear()
    {
      m_helix.clear();
      m_helix310.clear();
      m_helixpi.clear();
      m_sheet.clear();
    }
    
  private:
    
    void apply2ndry(const char *ss1, const char *ss2, const ResidSet &data, MolCoordPtr pMol);
  };

  ///
  ///  Undo/Redoable edit-information for structure-transformation
  ///

  class MOLSTR_API Prot2ndryEditInfo : public qsys::EditInfo
  {
  private:
    /// Target Mol ID
    qlib::uid_t m_nTgtUID;

    /// undo/redo data
    Prot2ndrySet m_before;
    Prot2ndrySet m_after;

    bool m_bBeforeModified;

  public:
    Prot2ndryEditInfo();
    virtual ~Prot2ndryEditInfo();

    /////////////////////////////////////////////////////

    /// save atom positions before transformation
    void saveBefore(MolCoordPtr pmol);

    /// save atom positions after transformation
    void saveAfter(MolCoordPtr pmol);

    void clear();

    /////////////////////////////////////////////////////

    /// perform undo
    virtual bool undo();

    /// perform redo
    virtual bool redo();

    virtual bool isUndoable() const;
    virtual bool isRedoable() const;

  };


}

#endif

