// -*-Mode: C++;-*-
//
//  Abstract text renderer class
//

#ifndef __TEXT_RENDERER_HPP_INCLUDED__
#define __TEXT_RENDERER_HPP_INCLUDED__

#include "molstr.hpp"

#include <qsys/Renderer.hpp>
#include <gfx/SolidColor.hpp>


namespace molstr {

  using qlib::Vector4D;
  using gfx::ColorPtr;
  using gfx::DisplayContext;

  class MOLSTR_API TextRenderer : public qsys::Renderer
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
    void setColor(const ColorPtr &rc);
    
  private:
    /// label's font name
    LString m_strFontName;

  public:
    LString getFontName() const {
      return m_strFontName;
    }
    void setFontName(const LString &rc) {
      m_strFontName = rc;
      invalidatePixCache();
    }

  private:
    /// label's font size
    double m_dFontSize;

  public:
    double getFontSize() const {
      return m_dFontSize;
    }
    void setFontSize(double rc) {
      m_dFontSize = rc;
      invalidatePixCache();
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
      invalidatePixCache();
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
      invalidatePixCache();
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

    double getDispX() const {
      return m_offset.x();
    }
    void setDispX(double rc);

    double getDispY() const {
      return m_offset.y();
    }
    void setDispY(double rc);

  private:
    /// Unit of displacement (offset)
    int m_nOfsUnit;
    
  public:
    static const int TR_UNIT_PIXEL = 0;
    static const int TR_UNIT_ANGSTROM = 1;
    static const int TR_UNIT_MOGE = 2;

    int getOffsetUnit() const {
      return m_nOfsUnit;
    }
    void setOffsetUnit(int n) {
      m_nOfsUnit = n;
    }

    //////////////////////////////////////////////////////
    // Renderer interface

    virtual void display(DisplayContext *pdc);
    virtual void displayLabels(DisplayContext *pdc);
    virtual void preRender(DisplayContext *pdc);
    virtual void render(DisplayContext *pdc) =0;
    virtual void postRender(DisplayContext *pdc);
    virtual bool isHitTestSupported() const;
    virtual bool isTransp() const;

    //////////////////////////////////////////////////////
    // TextRenderer interface

    virtual void invalidatePixCache()=0;

    //////
    // Event handlers

    virtual void styleChanged(qsys::StyleEvent &);
    //virtual void propChanged(qlib::LPropEvent &ev);

    //////
    // serialization (compatibility for xdisp, ydisp properties)

    virtual void readFrom2(qlib::LDom2Node *pNode);

  };

} // namespace

#endif
