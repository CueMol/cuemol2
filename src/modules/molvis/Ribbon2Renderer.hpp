// -*-Mode: C++;-*-
//
//  Ribbon type2 representation (test)
//

#ifndef RIBBON2_RENDERER_HPP_INCLUDED
#define RIBBON2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <modules/molstr/MainChainRenderer.hpp>
//#include "CubicSpline.hpp"
#include "smospl/SmoothSpline.hpp"
#include "TubeSection.hpp"
#include "TubeGpuRenderer.hpp"
#include "JctTable.hpp"

class Ribbon2Renderer_wrap;

namespace molvis {

using qlib::Vector4D;
using gfx::ColorPtr;
using namespace molstr;

  class TubeSection;
  class Ribbon2Renderer;

  namespace detail {

    struct SecSplDat;

    /// A run of the helix-coil table of a ribbon-helix coil
    /// (Ribbon2Renderer::makeHCTab())
    struct HCTab {
      int jst;
      int jen;
      int flag;
    };

    /// Where a control point of a SecSplDat comes from, so that the point
    /// can be recomputed when the atoms move (SecSplDat::updateGeometry())
    struct PtSrc {
      enum {
        /// the pivot atom
        PIVOT = 0,
        /// the axis of the sheet pRef at the parameter t
        SHEET = 1,
        /// the pivot atom pulled into the cylinder pRef (NULL: not pulled)
        /// at the parameter t (Ribbon2Renderer::evalHelixJct())
        HELIX_JCT = 2
      };
      int type;
      const MolAtom *pAtom;
      SecSplDat *pRef;
      double t;
    };

    struct SecSplDat
    {
      /// Kind of the element
      enum {
        KIND_HELIX = 0,
        KIND_SHEET = 1,
        KIND_COIL = 2
      };
      int m_nKind;

      SmoothSpline m_spl;
      int m_nStartId;
      int m_nRealSize;

      // coil data
      Vector4D m_vStartD1;
      Vector4D m_vEndD1;
      bool m_bFixStart, m_bFixEnd;

      // cylinder data
      SmoothSpline1D m_wspl;
      /// m_wspl could be generated (needs at least three points)
      bool m_bWsplValid;
      double m_dWidthAver;

      // sheet data
      Vector4D m_bnorm_ave;
      SmoothSpline m_bnspl;
      bool m_bBnormSpl;
      
      std::deque<Vector4D> m_posvec;
      std::deque<MolResidue *> m_resvec;

      /// Source of each point of m_posvec
      std::vector<PtSrc> m_srcs;

      /// C and O atoms of each point of a protein sheet residue (NULL
      /// otherwise), see calcProtBinormVec()
      std::vector<std::pair<const MolAtom *, const MolAtom *> > m_coatoms;
      bool m_bCOCached;

      /// Helix-coil table (ribbon-helix coil)
      std::vector<HCTab> m_hctab;

      /// Residue of each integer parameter of m_spl (getDiffVec())
      std::vector<MolResidue *> m_diffres;

      bool m_bStartExtend;
      bool m_bEndExtend;

      int m_nResDelta;

      /// Add a point on the axis of the sheet pSheet at the parameter t
      /// (returns the tangent there in *pvpt)
      void addSheetPoint(SecSplDat *pSheet, double t, double wgt, Vector4D *pvpt);

      /// Add the pivot position of pRes
      void addPoint(MainChainRenderer *pthat, MolResiduePtr pRes, double wgt=0.0)
      {
        const MolAtom *pAtom = ensureNotNull(pthat->getPivotAtom(pRes)).get();
        m_posvec.push_back(pAtom->getPos());
        m_posvec.back().w() = wgt;
        m_resvec.push_back(pRes.get());
        m_srcs.push_back(PtSrc{PtSrc::PIVOT, pAtom, NULL, 0.0});
      }

      /// Replace the source of the last point (its weight is kept)
      void setLastSrc(const PtSrc &src);

      /// Position of a point source
      Vector4D evalSrc(const PtSrc &src) const;

      /// Recompute the points from their sources and regenerate the splines
      /// (the atoms moved; the topology is the same)
      void updateGeometry();

      /// Look up the C/O atoms of calcProtBinormVec()
      void cacheCOAtoms();

      void setStart()
      {
        int nleft = m_posvec.size();
        m_nStartId = -nleft;
      }

      void setEnd()
      {
        int nleft = m_posvec.size();
        m_nRealSize = nleft + m_nStartId;
      }

      bool generate();
      bool generateHelix(double wrho);
      bool generateSheet();
      bool generateCoil();

      Vector4D calcBinormVec(int i);
      bool calcProtBinormVec(int nres, Vector4D &res);

      Vector4D getBnormVec(double t);
      Vector4D getCoilBnormVec(double t);
      

      Ribbon2Renderer *m_pParent;

      SecSplDat(Ribbon2Renderer *pP, int nKind);
    };

    /// The elements of the GPU mesh: owned across atom moves, so that a
    /// coordinate update recomputes their geometry and redraws them chunk
    /// by chunk instead of rebuilding them. A copy starts empty.
    struct CartoonGpuElems
    {
      /// Elements by kind (all segments)
      std::vector<SecSplDat *> m_cyls, m_sheets, m_coils;
      /// Element drawn as each chunk of the mesh
      std::vector<SecSplDat *> m_chunks;

      CartoonGpuElems() {}
      CartoonGpuElems(const CartoonGpuElems &) {}
      CartoonGpuElems &operator=(const CartoonGpuElems &) = delete;
      ~CartoonGpuElems() { clear(); }

      void clear();
      bool empty() const { return m_chunks.empty(); }
    };

    class SecStrTab
    {
    public:
      SecStrTab() {}
      ~SecStrTab() {}

      typedef std::vector<char> data_t;
      data_t m_data;

      void setSize(int nsize) { m_data.resize(nsize*2); }
      void setSecStr(int ind, const MolResiduePtr &pRes);
      LString getSecStr(int ind);

      //void fillHelixGap(int ngap);
      //void setHelix(int ind);
    };

  } // namespace detail

  class Ribbon2Renderer : public TubeGpuRenderer<MainChainRenderer>
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::Ribbon2Renderer_wrap;

  private:

    typedef TubeGpuRenderer<MainChainRenderer> super_t;

    //////////////////////////////////////////////////////
    // Properties

    /// Section data for coil
    TubeSectionPtr m_ptsCoil;

    /// Section data for cylinder helix
    TubeSectionPtr m_ptsHelix;

    /// Section data for sheet
    TubeSectionPtr m_ptsSheet;

    /// Sheet junction (arrow head)
    JctTablePtr m_pSheetHead;

    /// Section data for ribbon helix
    TubeSectionPtr m_ptsRibHelix;

    /// Coil-Helix junction (used in ribbonhelix mode)
    JctTablePtr m_pRibHelixTail;

    /// Helix-Coil junction (used in ribbonhelix mode)
    JctTablePtr m_pRibHelixHead;

    /// Num of interporation point to the axial direction (axialdetail)
    int m_nAxialDetail;

    /// interpolate color or not
    bool m_bInterpColor;

    // anchor params (coil/sheet)
    SelectionPtr m_pAnchorSel;
    double m_dAnchorWgt;

    // helix props
    double m_dHelixSmo;

    double m_dAxExt;
    double m_dWidthPlus;
    double m_dWidthRho;

  private:
    enum {
      HWIDTH_CONST = 0,
      HWIDTH_AVER = 1,
      HWIDTH_WAVY = 2
    };
    int m_nHelixWidthMode;

  public:
    int getHelixWidthMode() const {return m_nHelixWidthMode;}
    void setHelixWidthMode(int n) {m_nHelixWidthMode = n;}

  public:
    // compatibility for helix_waver prop
    bool isWidthAver() const {
      if (m_nHelixWidthMode==HWIDTH_AVER) return true;
      else return false;
    }
    void setWidthAver(bool b) {
      m_nHelixWidthMode = HWIDTH_AVER;
    }

  private:
    /// Helix width (const width mode)
    double m_dHelixWidth;

    // sheet props
    double m_dSheetSmo;
    double m_dSheetWsmo;

    // coil props
    double m_dCoilSmo;

  private:

    ////////////////////////////////////////////////
    // workarea

    /// Residue table
    std::deque<MolResiduePtr> m_resvec;
    /// Sheet index vector
    std::vector<int> m_indvec;

    /// secstr table
    detail::SecStrTab m_sstab;

    std::deque<detail::SecSplDat*> m_cylinders;
    std::deque<detail::SecSplDat*> m_sheets;
    std::deque<detail::SecSplDat*> m_coils;

    /// Dump curvature info of axial spline func
    bool m_bDumpCurv;

    typedef std::map<MolResidue *, std::pair<Vector4D,Vector4D> > DiffVecMap;

    /// differential vectors for getDiffVec impl
    DiffVecMap m_diffvecs;

    /// m_diffvecs is to be rebuilt from m_gpuElems (after a chunked update)
    bool m_bLazyDiffVecs;

    /// Elements of the GPU mesh (see CartoonGpuElems)
    detail::CartoonGpuElems m_gpuElems;

    ////////////////////////////////////////////////

  public:
    Ribbon2Renderer();
    ~Ribbon2Renderer() override;

    const char *getTypeName() const override;

    //////////////////////////////////////////////////////
    // GPU mesh (TubeGpuRenderer)

  protected:
    /// The differential vectors derived from the positions are dropped
    /// (the elements' geometry is recomputed by tubeGpuPrepareChunkUpdate()
    /// or by the serial traversal)
    void tubeGpuOnMovedAtoms() override { m_diffvecs.clear(); }

    /// Chunked update: one chunk per helix / sheet / coil element
    bool tubeGpuCanUpdateChunks() const override { return !m_gpuElems.empty(); }
    void tubeGpuPrepareChunkUpdate() override;
    void tubeGpuUpdateChunk(int i, TubeMeshBuilder *pmb) override;

  public:
    //////////////////////////////////////////////////////

    void beginRend(DisplayContext *pdl) override;
    void endRend(DisplayContext *pdl) override;

    void beginSegment(DisplayContext *pdl, MolResiduePtr pRes) override;
    void rendResid(DisplayContext *pdl, MolResiduePtr pRes) override;
    void endSegment(DisplayContext *pdl, MolResiduePtr pRes) override;

  private:
    //////////////////////////////////////////////////////

    /// Set up the section and junction tables (once per traversal)
    void setupSections();

    /// Draw the element pC (any kind) to pmb. Uses no renderer state that
    /// it writes, so that elements can be drawn concurrently.
    void renderElemTo(TubeMeshBuilder *pmb, detail::SecSplDat *pC);

    void buildHelixData();
    void clearHelixData();
    void renderHelixTo(TubeMeshBuilder *pmb, detail::SecSplDat *pC);

    /// Cylinder radius of the helix pC at the parameter t
    double calcHelixWidth(detail::SecSplDat *pC, double t, double &dwidth) const;

  public:
    /// Source of the coil control point for the helix residue at
    /// m_resvec[ires]: the pivot position pulled into the cylinder when it
    /// lies outside
    detail::PtSrc findHelixJct(int ires);

    /// Position of a PtSrc::HELIX_JCT source
    Vector4D evalHelixJct(const detail::PtSrc &src) const;

    double getWidthRho() const { return m_dWidthRho; }

  private:

    void buildSheetData();
    void clearSheetData();
    void renderSheetTo(TubeMeshBuilder *pmb, detail::SecSplDat *pSh);

    void buildCoilData();
    void clearCoilData();
    void renderCoilTo(TubeMeshBuilder *pmb, detail::SecSplDat *pSh);
    void renderHelixCoilTo(TubeMeshBuilder *pmb, detail::SecSplDat *pSh);

    /// Helix-coil table of the ribbon-helix coil pC (current segment)
    std::vector<detail::HCTab> makeHCTab(detail::SecSplDat *pC);

    void getCoilResids(double at, detail::SecSplDat *pCyl,
                       MolResiduePtr &pResPrev,
                       MolResiduePtr &pResNext,
                       double &resrho, int *piPrev=NULL);

    gfx::ColorPtr calcCoilColor(double at, detail::SecSplDat *pCyl);


    /// Sheet to Coil junction
    void extendSheetCoil(detail::SecSplDat *pSh, int nPrevInd);

    /// Coil to Sheet junction
    void extendCoilSheet(detail::SecSplDat *pSh, int nNextInd);

  public:
    //////////////////////////////////////////////////////
    // event handling

    void propChanged(qlib::LPropEvent &ev) override;

    void objectChanged(qsys::ObjectEvent &ev) override;

    //////////////////////////////////////////////////////

    virtual void setAxialDetail(int nlev);

    int getAxialDetail() const { return m_nAxialDetail; }

    void setSmoothColor(bool b) {
      m_bInterpColor = b;
      invalidateDisplayCache();
    }
    bool isSmoothColor() const { return m_bInterpColor; }


  public:

    SelectionPtr getAnchorSel() const
    {
      return m_pAnchorSel;
    }

    void setAnchorSel(SelectionPtr pNewSel)
    {
      m_pAnchorSel = pNewSel;
      invalidateDisplayCache();
    }

    double getAnchorWgt() const {
      return m_dAnchorWgt;
    }

    void setAnchorWgt(double d) {
      m_dAnchorWgt = d;
      invalidateDisplayCache();
    }

    double getAnchorWgt(MolResiduePtr pRes) const;
    double getAnchorWgt2(MolResiduePtr pRes, const LString &sstr) const;

    void invalidateSplineCoeffs();

    //////////////////////////////////////////////////////
    // Tube capping routine

  public:
    /// cap type ID
    enum {
      TUBE_CAP_SPHR = 0,
      TUBE_CAP_FLAT = 1,
      TUBE_CAP_NONE = 2
    };

    int getStartCapType() const { return m_nStCapType; }
    void setStartCapType(int nType) {
      invalidateDisplayCache();
      m_nStCapType = nType;
    }

    int getEndCapType() const {
      MB_DPRINTLN("Rib2rend end_captype=%d", m_nEnCapType);
      return m_nEnCapType;
    }
    void setEndCapType(int nType) {
      invalidateDisplayCache();
      m_nEnCapType = nType;
    }

  private:

    /// start cap type
    int m_nStCapType;
    int m_nEnCapType;

  public:

    gfx::ColorPtr calcColor(double t, detail::SecSplDat *pCyl);

    /// Hit name (pivot atom ID of the owning residue) at spline parameter t
    /// of a helix/sheet segment (same residue selection as calcColor).
    int calcHitName(double t, detail::SecSplDat *pCyl) const;

    /// Hit name at parameter at of a coil segment (see calcCoilColor).
    int calcCoilHitName(double at, detail::SecSplDat *pCyl);

    TubeSectionPtr getHelixSection() const { return m_ptsHelix; }
    TubeSectionPtr getSheetSection() const { return m_ptsSheet; }
    TubeSectionPtr getCoilSection() const { return m_ptsCoil; }

    JctTablePtr getSheetHead() const { return m_pSheetHead; }

    TubeSectionPtr getRibHelixSection() const { return m_ptsRibHelix; }
    JctTablePtr getRibHelixHead() const { return m_pRibHelixHead; }
    JctTablePtr getRibHelixTail() const { return m_pRibHelixTail; }

    //////////

    void curvature();
    void dumpCyls(detail::SecSplDat *pC);

  private:
    void updateDiffVecs();
    void updateDiffVecsImpl(detail::SecSplDat *pC);

    /// Residues of the integer parameters of pC (current segment)
    void setupDiffRes(detail::SecSplDat *pC);

  public:
    /// Returns 1-st differential vector as to the axial (t) parameter.
    ///  (used for the tangential vector calculation for the disorder renderer)
    bool getDiffVec(MolResiduePtr pRes, Vector4D &rpos, Vector4D &rvec) override;

    /// Ribbon shaped helix flag
    bool m_bRibbonHelix;

    ////////////////////////////////

  private:
    /// Fade out flag of the end of the segment
    bool m_bSegEndFade;

  public:
    void setSegEndFade(bool b) {
      invalidateDisplayCache();
      m_bSegEndFade = b;
    }
    bool isSegEndFade() const { return m_bSegEndFade; }

    /// Returns true, if par is at the internal end of the segment
    ///  (returns false, if par is at the external end.)
    //bool isSegEnd(double par, detail::SecSplDat *pCyl);

  private:

    MolResiduePtr getResByIndex(int n) const {
      if (0<=n && n<m_resvec.size())
        return m_resvec[n];
      else
        return MolResiduePtr();
    }
  };

}

#endif
