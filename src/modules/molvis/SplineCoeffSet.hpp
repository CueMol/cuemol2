// -*-Mode: C++;-*-
//
//  Set of spline coefficients
//

#ifndef SPLINE_COEFF_SET_HPP_INCLUDED
#define SPLINE_COEFF_SET_HPP_INCLUDED

#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>
#include <modules/molstr/molstr.hpp>
#include <modules/molstr/Evaluator.hpp>

#include "CubicSpline.hpp"

#include <set>
#include <unordered_map>
#include <vector>

using qlib::LString;
using qlib::Vector4D;

namespace molstr {
  class MolCoord;
  class MolChain;
  class MolResidue;
  class MolAtom;
  class MainChainRenderer;
}

namespace molvis {

  using namespace molstr;

  class SplineCoeff;

  ///
  /// Spline coefficients of the main chain of a molecule.
  ///
  /// The coefficients have a topology part (the segments, their residues,
  /// the parameter tables and the per-residue atoms and properties) and a
  /// geometry part (the spline coefficients computed from the positions).
  /// Moving the atoms (markMoved()) only invalidates the geometry part,
  /// which generate() then recomputes from the kept topology.
  ///
  class SplineCoeffSet
  {
  private:
    std::list<SplineCoeff *> m_list;
    // double m_fBrkLimit;
    SplineCoeff *m_pCurCoeff;

    /// Coeff of each residue (residues of the short segments excluded)
    std::unordered_map<const MolResidue *, SplineCoeff *> m_residMap;

    /// The topology / geometry parts are valid
    bool m_bTopoValid;
    bool m_bGeomValid;

    /// Incremented on every topology build (the SplineCoeff objects of an
    /// older generation are gone)
    int m_nTopoGen;

    MainChainRenderer *m_pParent;

    double m_dsmooth;

    RealNumEvaluator *m_pSmoothEval;

    /// Residues of the segments too short (1 or 2 residues) to get coeffs
    std::set<MolResidue *> m_shortResids;

  public:
    SplineCoeffSet();

    ~SplineCoeffSet();

    /// remove all of the coeffs (topology and geometry)
    void cleanup();

    /// The atoms moved: only the geometry part is recomputed by generate()
    void markMoved() { m_bGeomValid = false; }

    /// chech current coeffs are valid
    bool isValid() const;

    bool isTopoValid() const { return m_bTopoValid; }
    int getTopoGen() const { return m_nTopoGen; }

    /// search coeff obj for the residue pres
    SplineCoeff *searchCoeff(MolResiduePtr pres);

    /// true if pres belongs to a segment too short to get coeffs (no spline
    /// is drawn there)
    bool isShortSegment(MolResiduePtr pres) const {
      return m_shortResids.find(pres.get())!=m_shortResids.end();
    }

    /// generate the invalid parts of the spline coeffs for pmol
    bool generate(MolCoordPtr pmol);

    void setSmooth(double d) { m_dsmooth = d; }
    double getSmooth() const { return m_dsmooth; }

    void setSmoothEval(RealNumEvaluator *pEval);

    MolAtomPtr getPivotAtom(MolResiduePtr pRes) const;

    SplineCoeff *createSplineCoeff();

    void setParent(MainChainRenderer *p) { m_pParent = p; }

    double getSmoothByRes(MolResidue *pRes);

  private:

    void buildTopology(MolCoordPtr pmol);

    void beginSegment(MolResidue *pres);
    void rendResid(MolResidue *pRes);
    void endSegment(MolResidue *pres);


  };

  ///////////////////////////////////////////////////

  class SplineCoeff
  {
  private:
    CubicSpline m_axisInt;
    CubicSpline m_normInt;

    /// Per-residue data that does not depend on the positions
    struct ResidCache
    {
      /// pivot atom (owned by the molecule; the topology is dropped on any
      /// structural change, so the pointer stays valid while it is kept)
      MolAtom *pPiv;
      /// smoothing weight
      double smooth;
      /// protein beta strand with the C and O atoms (binormal from C=O)
      bool bSheetCO;
      MolAtom *pC;
      MolAtom *pO;
      /// "secondary2" property (helix/sheet with the start/end marks; used by
      /// the ribbon to pick the sections and junctions)
      LString sec2;
    };
    std::vector<ResidCache> m_cache;

    /// Index of each residue in this segment
    std::unordered_map<const MolResidue *, int> m_residIndex;

    /// The geometry part was computed successfully
    bool m_bGeomOK;

    LString m_chainname;
    int m_nStartResid;
    int m_nEndResid;

    /// Num of residues in this coeff
    int m_nResids;

    /// Size of spline coeff table
    int m_nParamTabSz;
    double *m_pParamTab;
    double *m_pParamCentTab;

    typedef std::vector<MolResidue *> ResidArray;

    ResidArray m_resid_array;

    SplineCoeffSet *m_pParent;

    std::vector<bool> m_bnormDirs;

  private:
    SplineCoeff() {}

  public:
    SplineCoeff(SplineCoeffSet *pParent)
         : m_bGeomOK(false),
           m_pParamTab(NULL), m_pParamCentTab(NULL),
           m_pParent(pParent)
    {
    }

    ~SplineCoeff() {
      if (m_pParamTab!=NULL)
        delete [] m_pParamTab;
      if (m_pParamCentTab!=NULL)
        delete [] m_pParamCentTab;
    }

    //////////

    void clear()
    {
      //m_resid_array.erase(m_resid_array.begin(), m_resid_array.end());
      m_resid_array.clear();
    }

    void addResid(MolResidue *pRes) {
      m_resid_array.push_back(pRes);
    }

    int getResidCount() const { return int(m_resid_array.size()); }

    /// Build the topology part (false for a segment of 1 or 2 residues)
    bool setupTopology();

    /// Compute the spline coeffs from the current positions
    bool updateGeometry();

    bool isGeomOK() const { return m_bGeomOK; }

    MolResidue *getResidue(int ires) const
    {
      if (ires<0 || ires>=m_resid_array.size())
        return NULL;
      return m_resid_array[ires];
    }

    /// "secondary2" property of the residue (kept in the topology part)
    const LString &getSecondary2(int ires) const {
      return m_cache[ires].sec2;
    }

    /// Pivot atom of the residue (raw pointer kept in the topology part; no
    /// reference counting, so it can be read from several threads)
    MolAtom *getPivot(int ires) const {
      if (ires<0 || ires>=int(m_cache.size()))
        return NULL;
      return m_cache[ires].pPiv;
    }

    MolAtomPtr getAtom(int ires) const {
      if (ires<0 || ires>=int(m_cache.size()))
        return MolAtomPtr();
      return MolAtomPtr(m_cache[ires].pPiv);
    }

    bool contains(MolResidue *pres);

    int getIndex(MolResiduePtr pRes) const;

    bool getParamRange(MolResiduePtr pRes, double &fstart, double &fend, double &fcent) {
      int nres = getIndex(pRes);
      if (nres<0) return false;
      MB_ASSERT( 0<=nres && nres<m_nResids );
      return getParamRange(nres, fstart, fend, fcent);
    }

    bool getParamRange(MolResiduePtr pRes, double &fstart, double &fend) {
      double dum;
      return getParamRange(pRes, fstart, fend, dum);
    }
    bool getCentParam(MolResiduePtr pRes, double &fcent) {
      double dum1, dum2;
      return getParamRange(pRes, dum1, dum2, fcent);
    }

    bool getParamRange(int nres, double &fstart, double &fend, double &fcent) const {
      if (!( 0<=nres && nres<m_nResids )) return false;
      fstart = m_pParamTab[nres];
      fcent = m_pParamCentTab[nres];
      fend = m_pParamTab[nres+1];
      return true;
    }

    bool getBnormDirFlag(int nres) const {
      if (!( 0<=nres && nres<m_nResids )) return false;
      return m_bnormDirs[nres];
    }

    //////////

    bool interpAxis(double param,
                    Vector4D *pv,
                    Vector4D *pvv=NULL,
                    Vector4D *pvvv=NULL) {
      return m_axisInt.interpolate(param, pv, pvv, pvvv);
    }

    bool interpNormal(double param,
                      Vector4D *pv,
                      Vector4D *pvv=NULL,
                      Vector4D *pvvv=NULL) {
      return m_normInt.interpolate(param, pv, pvv, pvvv);
    }

    //////////

  private:

    MolAtomPtr getPivotAtom(MolResiduePtr pRes) const {
      return m_pParent->getPivotAtom(pRes);
    }

    MolAtom *getSafeAtom(int nind) const {
      if (nind<0 || nind>=m_nResids)
        return NULL;
      return m_cache[nind].pPiv;
    }

    Vector4D calcBnormVec(int nres);

    bool calcProtBnormVec(int nres, Vector4D &res);
  };



} // namespace molvis

#endif

