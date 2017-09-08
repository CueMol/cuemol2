// -*-Mode: C++;-*-
//
//  Name label renderer (ver.2) class
//

#ifndef MOLSTR_NAME_LABEL2_RENDERER_H_INCLUDED
#define MOLSTR_NAME_LABEL2_RENDERER_H_INCLUDED

#include "molstr.hpp"

#include <qsys/DispListRenderer.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/LabelCacheImpl.hpp>

class NameLabel2Renderer_wrap;

namespace molstr {

  using qlib::Vector4D;
  using gfx::DisplayContext;

  struct NameLabel;
  struct NameLabelList;

  class MOLSTR_API NameLabel2Renderer : public qsys::DispListRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::NameLabel2Renderer_wrap;

  private:
    typedef qsys::DispListRenderer super_t;

    /// implementation
    NameLabelList *m_pdata;

    /// max labels
    int m_nMax;

    /// label's color
    gfx::ColorPtr m_color;

    /// displacement along the X axes
    double m_xdispl;

    /// displacement along the Y axes
    double m_ydispl;
  
    /// label's font name
    LString m_strFontName;
    /// label's font size
    double m_dFontSize;
    /// label's font style (corresponds to the font-style prop of CSS)
    LString m_strFontStyle;
    /// label's font weight (corresponds to the font-weight prop of CSS)
    LString m_strFontWgt;

    /// label pixbuf cache
    gfx::LabelCacheImpl m_pixCache;

    //////////////////////////////////////////////////////

  public:
    NameLabel2Renderer();
    virtual ~NameLabel2Renderer();

    //////////////////////////////////////////////////////
    // Renderer interface implementation

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
    virtual LString toString() const;

    virtual bool isHitTestSupported() const;

    virtual Vector4D getCenter() const;

    virtual const char *getTypeName() const;

    virtual bool isTransp() const { return true; }

    /// Invalidate the display cache
    virtual void invalidateDisplayCache();

    //////////////////////////////////////////////////////
    // Old rendering interface
    //   (for renderFile()/GL compatible prof)

    virtual void preRender(DisplayContext *pdc);
    virtual void render(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc);

    //////////////////////////////////////////////////////
    // Ver. 2 interface

    /// Use ver2 interface (--> return true)
    virtual bool isUseVer2Iface() const;

    /// Initialize & setup capabilities (for glsl setup)
    virtual bool init(DisplayContext *pdc);
    
    virtual void createDisplayCache();

    virtual bool isCacheAvail() const;

    /// Render to display (using VBO)
    virtual void renderVBO(DisplayContext *pdc);

    /// Render to display (using GLSL)
    virtual void renderGLSL(DisplayContext *pdc);

    //////////////////////////////////////////////////////
    // Event handlers

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void styleChanged(qsys::StyleEvent &);

    virtual void objectChanged(qsys::ObjectEvent &ev);

    //////////////////////////////////////////////////////
    // Serialization / deserialization impl for non-prop data

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    //////////////////////////////////////////////////////

    MolCoordPtr getClientMol() const;

    bool addLabelByID(int aid, const LString &label = LString());
    bool addLabel(MolAtomPtr patom, const LString &label = LString());

    bool removeLabelByID(int aid);

    void setMaxLabel(int nmax) { m_nMax = nmax; }
    int getMaxLabel() const { return m_nMax; }


    void setFontSize(double val);
    double getFontSize() const { return m_dFontSize; }
  
    void setFontName(const LString &val);
    LString getFontName() const { return m_strFontName; }
  
    void setFontStyle(const LString &val);
    LString getFontStyle() const { return m_strFontStyle; }
  
    void setFontWgt(const LString &val);
    LString getFontWgt() const { return m_strFontWgt; }

  private:
    bool makeLabelStr(NameLabel &n, LString &lab,Vector4D &pos);

    /// clear all cached data
    void invalidateAll();

  };

} // namespace

#endif
