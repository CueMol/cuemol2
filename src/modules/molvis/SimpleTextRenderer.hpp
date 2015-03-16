// -*-Mode: C++;-*-
//
//  Simple text renderer class
//

#ifndef __SIMPLE_TEXT_RENDERER_HPP_INCLUDED__
#define __SIMPLE_TEXT_RENDERER_HPP_INCLUDED__

#include "molvis.hpp"

#include <qsys/Renderer.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/LabelCacheImpl.hpp>

class SimpleTextRenderer_wrap;

namespace molvis {

  using qlib::Vector4D;
  using gfx::DisplayContext;

  class MOLVIS_API TextRenderer : public qsys::Renderer
  {
    MC_SCRIPTABLE;

  private:
    typedef qsys::Renderer super_t;

  public:
    TextRenderer();
    virtual ~TextRenderer();

    //////////////////////////////////////////////////////

  private:
    /// label's color
    gfx::ColorPtr m_color;

  public:
    gfx::ColorPtr getColor() const {
      return m_color;
    }
    void setColor(const ColorPtr &rc) {
      m_color = rc;
    }
    
  private:
    /// label's font name
    LString m_strFontName;

  public:
    LString getFontName() const {
      return m_strFontName;
    }
    void setFontName(const LString &rc) {
      m_strFontName = rc;
    }

  private:
    /// label's font size
    double m_dFontSize;

  public:
    double getFontSize() const {
      return m_strFontSize;
    }
    void setFontSize(double rc) {
      m_strFontSize = rc;
    }

  private:
    /// label's font style (corresponds to the font-style prop of CSS)
    LString m_strFontStyle;

  public:
    LString getFontStyle() const {
      return m_strFontStyle;
    }
    void setFontStyle(const LString &rc) {
      m_strFontStyle = rc;
    }

  private:
    /// label's font weight (corresponds to the font-weight prop of CSS)
    LString m_strFontWgt;

  public:
    LString getFontWgt() const {
      return m_strFontWgt;
    }
    void setFontWgt(const LString &rc) {
      m_strFontWgt = rc;
    }

  private:
    /// displacement along the view coordinate system
    Vector4D m_offset;
  
  public:
    Vector4D getOffset() const {
      return m_offset;
    }
    void setOffset(const Vector4D &rc) {
      m_offset = rc;
    }


    //////////////////////////////////////////////////////

    virtual bool isHitTestSupported() const;
    virtual bool isTransp() const { return true; }

    //////
    // Event handlers

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void styleChanged(qsys::StyleEvent &);

  };

  class MOLVIS_API SimpleTextRenderer : public qsys::Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::SimpleTextRenderer_wrap;

  private:
    typedef qsys::Renderer super_t;

    /// implementation
    SimpleTextList *m_pdata;

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
    SimpleTextRenderer();
    virtual ~SimpleTextRenderer();

    //////////////////////////////////////////////////////

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
    virtual LString toString() const;

    virtual void display(DisplayContext *pdc);
    virtual void displayLabels(DisplayContext *pdc);

    virtual void preRender(DisplayContext *pdc);
    virtual void render(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc);
    virtual bool isHitTestSupported() const;

    virtual Vector4D getCenter() const;

    virtual const char *getTypeName() const;

    virtual bool isTransp() const { return true; }

    //////
    // Event handlers

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void styleChanged(qsys::StyleEvent &);

    //////
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

  private:
    bool makeLabelStr(SimpleText &n, LString &lab,Vector4D &pos);

    void makeLabelImg();

  };

} // namespace

#endif
