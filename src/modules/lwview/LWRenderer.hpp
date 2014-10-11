// -*-Mode: C++;-*-
//
// Light-weight renderer class
//

#ifndef LWVIEW_LWRENDERER_HPP_INCLUDE_
#define LWVIEW_LWRENDERER_HPP_INCLUDE_

#include "lwview.hpp"
#include <qsys/Renderer.hpp>
#include <qlib/Array.hpp>

namespace gfx {
  class DisplayContext;
  class DrawElem;
}

namespace lwview {

  using gfx::DisplayContext;

  /// Light-weight renderer class
  class LWVIEW_API LWRenderer : public qsys::Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef qsys::Renderer super_t;

    typedef qlib::Array<gfx::DrawElem *> data_t;
    data_t m_data;

    int m_nDataID;

    DisplayContext *m_phl;

  public:

    LWRenderer();
    LWRenderer(const LWRenderer &r);
    virtual ~LWRenderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual void unloading();
    virtual void display(DisplayContext *pdc);
    virtual void displayLabels(DisplayContext *pdc);
    virtual void invalidateDisplayCache();

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
    virtual LString toString() const;
    virtual const char *getTypeName() const;
    virtual qlib::Vector4D getCenter() const;

    //////////////////////////////////////////////////////
    // Hittest implementation

    virtual void invalidateHittestCache();

    /// render Hittest object
    virtual void displayHit(DisplayContext *pdc);

    /// Hittest support check
    virtual bool isHitTestSupported() const;

    /// Hittest result interpretation
    virtual LString interpHit(const gfx::RawHitData &);

    void setHitIndexSize(int n) {
      m_hitIndex.resize(n);
    }
    int getHitIndexSize() const {
      return m_hitIndex.size();
    }
    void setHitIndex(int i, int n) {
      m_hitIndex[i] = n;
    }
    int getHitIndex(int i) const {
      return m_hitIndex[i];
    }

  private:
    typedef qlib::Array<int> HitIndex;

    /// index set of hittest array in LWObject
    HitIndex m_hitIndex;

    //////////////////////////////////////////////////////
  public:
    void allocData(int nsize);
    void setDrawElem(int ind, gfx::DrawElem *pData);

    void clearData();
    gfx::DrawElem *getDrawElem (int ind) const {
      return m_data[ind];
    }
    int getElemSize() const { return m_data.size(); }

    int getDataID() const { return m_nDataID; }
    void setDataID(int n) { m_nDataID = n; }

  };

}

#endif

