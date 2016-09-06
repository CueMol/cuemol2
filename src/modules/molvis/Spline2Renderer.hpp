// -*-Mode: C++;-*-
//
//  backbone spline-trace renderer class
//

#ifndef SPLINE2_RENDERER_HPP_INCLUDED
#define SPLINE2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Vector3F.hpp>
#include <gfx/DrawElem.hpp>

#include <modules/molstr/MainChainRenderer.hpp>
#include "CubicSpline.hpp"
#include "SplineCoeffSet.hpp"

namespace molvis {

  using qlib::Vector4D;
  using qlib::Vector3F;
  using gfx::ColorPtr;
  using namespace molstr;

  class Spline2Renderer;

  class Spline2Seg
  {
  private:
    typedef std::vector<quint32> IDArray;
    
    /// Pivot atom AID array
    IDArray m_aids;

    /// cached vertex array/VBO
    gfx::DrawElemVC *m_pVBO;

    std::deque<quint32> m_aidtmp;

    int m_nSize;
    
    typedef std::vector<Vector3F> VecArray;

    VecArray m_pos;
    VecArray m_coeff0;
    VecArray m_coeff1;
    VecArray m_coeff2;
    VecArray m_coeff3;

  public:
    Spline2Seg();
    ~Spline2Seg();

    void append(MolAtomPtr pAtom);

    void generate(Spline2Renderer *pthis);

    quint32 getSize() const { return m_nSize; }

    MolAtomPtr getAtom(MolCoordPtr pMol, quint32 ind) const {
      quint32 aid = m_aids[ind];
      return pMol->getAtom(aid);
    }

    MolResiduePtr getResid(MolCoordPtr pMol, quint32 ind) const {
      MolAtomPtr pAtom = getAtom(pMol, ind);
      return pAtom->getParentResidue();
    }

    void updateDynamicVBO(Spline2Renderer *pthis);

    void updateStaticVBO(Spline2Renderer *pthis);

    void updateVBOColor(Spline2Renderer *pthis);

    void draw(Spline2Renderer *pthis);

  };

  typedef std::deque<Spline2Seg> Spl2SegList;

  class Spline2Renderer : public MainChainRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef MainChainRenderer super_t;

    //////////////////////////////////////////////////////
    // Properties

  private:
    /// Num of interporation point to the axial direction (axialdetail)
    int m_nAxialDetail;

  public:
    void setAxialDetail(int nlev) {
      m_nAxialDetail = nlev;
      // invalidateSplineCoeffs();
    }

    int getAxialDetail() const { return m_nAxialDetail; }

  private:
    /// width of line drawing (in pixel unit)
    double m_dLineWidth;

  public:
    void setLineWidth(double d) {
      super_t::invalidateDisplayCache();
      m_dLineWidth = d;
    }
    double getLineWidth() const {
      return m_dLineWidth;
    }

    //////////////////////////////////////////////////////
    // ctor/dtor

  public:
    Spline2Renderer();
    
    virtual ~Spline2Renderer();

    //////////////////////////////////////////////////////
    // Renderer interface
    
    virtual const char *getTypeName() const;

    virtual void display(DisplayContext *pdc);

    //////////////////////////////////////////////////////
    // DispCacheRenderer interface

    virtual void preRender(DisplayContext *pdc);
    
    void invalidateDisplayCache();

    /*
    //////////////////////////////////////////////////////
    // MainChainRenderer interface
    virtual void beginRend(DisplayContext *pdl);
    virtual void beginSegment(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void rendResid(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void endSegment(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void endRend(DisplayContext *pdl);
     */

    //////////////////////////////////////////////////////
    // event handling

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void objectChanged(qsys::ObjectEvent &ev);

    //////////////////////////////////////////////////////

    // ColorPtr calcColor(double par, SplineCoeff *pCoeff);
    // void invalidateSplineCoeffs();

    //////////////////////////////////////////////////////
    // work area

  private:

    Spl2SegList m_seglist;

    void createSegList();
  };

}

#endif
