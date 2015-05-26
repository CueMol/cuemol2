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

  class SplineCoeffSet
  {
  private:
    std::list<SplineCoeff *> m_list;
    // double m_fBrkLimit;
    SplineCoeff *m_pCurCoeff;

    MainChainRenderer *m_pParent;

    double m_dsmooth;

    RealNumEvaluator *m_pSmoothEval;

  public:
    SplineCoeffSet();

    ~SplineCoeffSet();

    /// remove all of the coeffs
    void cleanup();

    /// chech current coeffs are valid
    bool isValid() const;

    /// search coeff obj for the residue pres
    SplineCoeff *searchCoeff(MolResiduePtr pres);

    /// generate spline coeffs for pmol
    bool generate(MolCoordPtr pmol);

    void setSmooth(double d) { m_dsmooth = d; }
    double getSmooth() const { return m_dsmooth; }

    void setSmoothEval(RealNumEvaluator *pEval);

    MolAtomPtr getPivotAtom(MolResiduePtr pRes) const;

    SplineCoeff *createSplineCoeff();

    void setParent(MainChainRenderer *p) { m_pParent = p; }

    double getSmoothByRes(MolResidue *pRes);

  private:

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

    typedef std::map<int, int> PivAidMap;
    PivAidMap m_pivaid_map;

    SplineCoeffSet *m_pParent;

    static const int SC_BDIR1=1;
    static const int SC_BDIR2=2;
    static const int SC_BDIR3=3;
    static const int SC_BDIR4=4;
    std::vector<int> m_bnormDirs;

  private:
    SplineCoeff() {}

  public:
    SplineCoeff(SplineCoeffSet *pParent)
         : m_pParamTab(NULL), m_pParamCentTab(NULL),
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

    bool generate();

    MolResidue *getResidue(int ires) const
    {
      if (ires<0 || ires>=m_resid_array.size())
        return NULL;
      return m_resid_array[ires];
    }

    MolAtomPtr getAtom(int ires) const {
      return getPivotAtom(MolResiduePtr(getResidue(ires)));
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

    int getBnormDirFlag(int nres) const {
      if (!( 0<=nres && nres<m_nResids )) return 0;
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

    MolAtomPtr getSafeAtom(int nind) const;

    Vector4D calcBnormVec(int nres);
  };



} // namespace molvis

#endif

