//
// Biomolecule analysis manager singleton class
//

#ifndef MOLANL_MANAGER_HPP_INCLUDE_
#define MOLANL_MANAGER_HPP_INCLUDE_

#include "molanl.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>

#include <modules/molstr/molstr.hpp>

namespace qlib {
  class Matrix4D;
  class OutStream;
}

namespace molanl {

  using qlib::LString;
  using qlib::Matrix4D;
  using molstr::MolCoordPtr;
  using molstr::SelectionPtr;

  /// Biomol analysis manager singleton class.
  ///
  class MOLANL_API MolAnlManager : public qlib::LSingletonScrObject,
  public qlib::SingletonBase<MolAnlManager>
  {
    MC_SCRIPTABLE;

  private:

  public:
    MolAnlManager();

    virtual ~MolAnlManager();

    //////////
    // services

    // void transformMol(MolCoordPtr pmol_mov, const qlib::Matrix4D &mat);

    /// SSM superpose (1)
    Matrix4D superposeSSM1(MolCoordPtr pmol_ref, SelectionPtr psel_ref,
			   MolCoordPtr pmol_mov, SelectionPtr psel_mov, bool bUseProp=false);

    void superposeSSM2(qlib::uid_t mol_ref, const LString &sel_ref,
                       qlib::uid_t mol_mov, const LString &sel_mov);

    /// LSQ superpose
    void superposeLSQ1(MolCoordPtr pmol_ref, SelectionPtr psel_ref,
                       MolCoordPtr pmol_mov, SelectionPtr psel_mov, bool bUseProp=false);


    double calcRMSDScr(MolCoordPtr pmol_ref, SelectionPtr psel_ref,
                       MolCoordPtr pmol_mov, SelectionPtr psel_mov,
                       const LString &fname);

    bool lsqFit(MolCoordPtr pRefMol, SelectionPtr pRefSel,
                MolCoordPtr pMovMol, SelectionPtr pMovSel,
                double *pdRMSD, int *pnFit, qlib::Matrix4D *presmat);

    double calcRMSD(MolCoordPtr pRefMol, SelectionPtr pRefSel,
                    MolCoordPtr pMovMol, SelectionPtr pMovSel,
                    qlib::OutStream *pouts=NULL);

    //////////////////////////////////////////////////////

    LString getNostdBondsJSON(MolCoordPtr pmol);
    void removeBond(MolCoordPtr pmol, int aid1, int aid2);
    void makeBond(MolCoordPtr pmol, int aid1, int aid2);

    
    /// Copy the selected part of pmol2 into this mol (inv. op. of deleteSel())
    bool copyAtoms(const MolCoordPtr &pmol, const MolCoordPtr &pmol2, const SelectionPtr &psel2);
    
    /// Delete the selected part of this mol (inv. op. of copy())
    bool deleteAtoms(const MolCoordPtr &pmol, const SelectionPtr &psel);

    /// Rename chain name
    bool changeChainName(const MolCoordPtr &pmol, const SelectionPtr &psel, const LString &name);

    /// Shift residue index
    bool shiftResIndex(const MolCoordPtr &pmol, const SelectionPtr &psel, bool bshift, int nval);

    /// Renum residue index
    bool renumResIndex(const MolCoordPtr &pmol, const SelectionPtr &psel, bool bshift, int nval);

    //////////////////////////////////////////////////////

    LString calcAtomContactJSON(MolCoordPtr pMol, SelectionPtr pSel,
                                double r_min, double r_max, bool hbond, int nMax);

    LString calcAtomContact2JSON(MolCoordPtr pMol, SelectionPtr pSel1, SelectionPtr pSel2,
                                 double r_min, double r_max, bool hbond,
                                 int nMax);

    void calcProt2ndry2(MolCoordPtr pMol, bool bignb, double dhangl1);
    
    void setProt2ndry(MolCoordPtr pMol, SelectionPtr pSel, int nSecType);

  public:
  
    //////////
    // Initializer/finalizer (called from qlib-appfw)

    static bool initClass(qlib::LClass *pcls)
    {
      return qlib::SingletonBase<MolAnlManager>::init();
    }
    
    static void finiClass(qlib::LClass *pcls)
    {
      qlib::SingletonBase<MolAnlManager>::fini();
    }

  };

}

#endif

