// -*-Mode: C++;-*-
//
//  Name label renderer (ver.2) class
//

#ifndef MOLSTR_NAME_LABEL2_RENDERER_H_INCLUDED
#define MOLSTR_NAME_LABEL2_RENDERER_H_INCLUDED

#include "molstr.hpp"

#include "MolRenderer.hpp"
#include <gfx/SolidColor.hpp>
#include <gfx/PixelBuffer.hpp>

class NameLabel2Renderer_wrap;

namespace molstr {

  using qlib::Vector4D;
  using gfx::DisplayContext;

  struct NameLabel2
  {
  public:

    NameLabel2(): m_pPixBuf(NULL)
    {
    }

    NameLabel2(const NameLabel2 &arg)
         : aid(arg.aid), strAid(arg.strAid), str(arg.str), m_pPixBuf(NULL)
    {
    }

    virtual ~NameLabel2() {
      if (m_pPixBuf!=NULL)
        delete m_pPixBuf;
    }

    /// Target atom ID
    int aid;

    /// Target atom in string representation
    LString strAid;

    /// Custom label string
    LString str;

    /// Image data of the label (in CPU)
    gfx::PixelBuffer *m_pPixBuf;

    inline bool equals(const NameLabel2 &a) const {
      return aid==a.aid;
    }
  };

  struct NameLabel2List : public std::list<NameLabel2> {};

  /////////////////////////////////////////////////////////////////////

  class MOLSTR_API NameLabel2Renderer : public MolRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::NameLabel2Renderer_wrap;

  private:
    typedef MolRenderer super_t;

    //////////////////////////////////////////////////////
    // Properties

  private:
    /// label's color
    gfx::ColorPtr m_pcolor;

  public:
    void setColor(const gfx::ColorPtr &pcol) {
      m_pcolor = pcol;
      //m_glsllabel.m_pcolor = pcol;
    }

    gfx::ColorPtr getColor() const {
      return m_pcolor;
    }

  private:
    /// displacement along the X axes
    double m_xdispl;

    /// displacement along the Y axes
    double m_ydispl;
  
    /// label's font name
    LString m_strFontName;

    /// label's font size (pixel/angstrom)
    double m_dFontSize;

    /// label's font style (corresponds to the font-style prop of CSS)
    LString m_strFontStyle;

    /// label's font weight (corresponds to the font-weight prop of CSS)
    LString m_strFontWgt;

  public:
    void setFontSize(double val);
    double getFontSize() const { return m_dFontSize; }
  
    void setFontName(const LString &val);
    LString getFontName() const { return m_strFontName; }
  
    void setFontStyle(const LString &val);
    LString getFontStyle() const { return m_strFontStyle; }
  
    void setFontWgt(const LString &val);
    LString getFontWgt() const { return m_strFontWgt; }

  private:
    /// Scaling mode flag (false: fixed pixel draw mode)
    bool m_bScaling;

    double m_dPixPerAng;

  public:
    bool isScaling() const { return m_bScaling; }
    void setScaling(bool b);

  private:
    double m_dRotTh;

  public:
    double getRotTh() const { return m_dRotTh; }
    virtual void setRotTh(double th);

    //////////////////////////////////////////////////////

    /// Label data structure
    NameLabel2List *m_pdata;

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
    // Event handlers

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void styleChanged(qsys::StyleEvent &);

    //virtual void objectChanged(qsys::ObjectEvent &ev);

    //////////////////////////////////////////////////////
    // Serialization / deserialization impl for non-prop data

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    //////////////////////////////////////////////////////

    // MolCoordPtr getClientMol() const;

    bool addLabelByID(int aid, const LString &label = LString());
    bool addLabel(MolAtomPtr patom, const LString &label = LString());

    bool removeLabelByID(int aid);

  private:
    //bool makeLabelStr(NameLabel &n, LString &lab,Vector4D &pos);
    LString makeLabelStr(NameLabel2 &nlab);

    gfx::PixelBuffer *createPixBuf(double scl, const LString &lab);

    /// clear all cached data
    void clearAllLabelPix();


  };

  //////////////////////////////

} // namespace

#endif
