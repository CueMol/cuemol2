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

  class TextureRep
  {
  public:
    virtual ~TextureRep() {}
  };

  class AbstTexture
  {
  public:
    virtual ~AbstTexture()
    {
      delete m_pTexRep;
    }

  private:
    mutable TextureRep *m_pTexRep;

  public:
    void setRep(TextureRep *pRep) const {
      m_pTexRep = pRep;
    }
    TextureRep *getRep() const {
      return m_pTexRep;
    }

  public:
    virtual int getWidth() const =0;
    //virtual int getHeight() const =0;
    //virtual int getDepth() const =0;

    /// pixel format
    static const int FMT_R = 0;
    static const int FMT_RG = 1;
    static const int FMT_RGB = 2;
    static const int FMT_RGBA = 3;

    /// pixel type
    static const int TYPE_UINT8 = 0;
    static const int TYPE_UINT16 = 1;
    static const int TYPE_UINT32 = 2;

    virtual void create1D(int format, int type, int nx, void *pdata) =0;
    //void create2D(int format, int type, int nx, int ny, void *pdata);
    //void create3D(int format, int type, int nx, int ny, int nz, void *pdata);
  }; 

  class Texture1D : public AbstTexture
  {
  public:
    OglTexture()
      : m_nWidth(0) 
    {
    }

    virtual ~OglTexture()
    {
    }

  private:
    int m_nWidth;

  public:
    virtual int getWidth() const {
      return m_nWidth; 
    }
  }; 

  class Spline2Seg
  {
  private:
    typedef std::vector<quint32> IDArray;
    
    /// Pivot atom AID array
    IDArray m_aids;

    IDArray m_inds;

    /// cached vertex array/VBO
    gfx::DrawElemVC *m_pVBO;

    std::deque<quint32> m_aidtmp;

    int m_nPoints;
    
    int m_nDetail;
    int m_nVA;


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

    quint32 getSize() const { return m_nPoints; }

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

    void draw(Spline2Renderer *pthis, DisplayContext *pdc);

  private:
    void generateNaturalSpline();
    void allocWorkArea();
    void freeWorkArea();

    void interpolate(float par, Vector3F *vec,
                     Vector3F *dvec = NULL,
                     Vector3F *ddvec = NULL);

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
