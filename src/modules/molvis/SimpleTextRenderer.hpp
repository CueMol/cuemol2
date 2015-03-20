// -*-Mode: C++;-*-
//
//  Simple text renderer class
//

#ifndef __SIMPLE_TEXT_RENDERER_HPP_INCLUDED__
#define __SIMPLE_TEXT_RENDERER_HPP_INCLUDED__

#include "molvis.hpp"

#include <gfx/PixelBuffer.hpp>
#include <modules/molstr/TextRenderer.hpp>
#include <modules/molstr/Selection.hpp>

class SimpleTextRenderer_wrap;

namespace molvis {

  using qlib::Vector4D;
  using gfx::DisplayContext;
  using gfx::ColorPtr;
  using molstr::SelectionPtr;
  using molstr::MolCoord;
  using molstr::MolCoordPtr;
  using molstr::MolAtomPtr;

  class MOLVIS_API SimpleTextRenderer : public molstr::TextRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::SimpleTextRenderer_wrap;

  private:
    typedef molstr::TextRenderer super_t;

  public:
    SimpleTextRenderer();
    virtual ~SimpleTextRenderer();

    //////////////////////////////////////////////////////

    /// 
    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;

    /// 
    virtual LString toString() const;

    /// 
    virtual void render(DisplayContext *pdc);

    /// 
    virtual Vector4D getCenter() const;

    /// 
    virtual const char *getTypeName() const;

    ///
    virtual void invalidatePixCache();

    ///
    // virtual void styleChanged(qsys::StyleEvent &ev);
    

    //////////////////////////////////////////////////////

  private:
    /// label string
    LString m_strLabel;

  public:
    LString getLabelStr() const {
      return m_strLabel;
    }
    void setLabelStr(const LString &rc) {
      m_strLabel = rc;
    }

  private:
    /// target atom ID (in string format)
    LString m_strTgtAID;

  public:
    const LString &getTargetAID() const {
      return m_strTgtAID;
    }
    void setTargetAID(const LString &n) {
      m_strTgtAID = n;
    }

    /*
  private:
    /// Target selection
    SelectionPtr m_pTgtSel;

  public:
    /// Get target selection
    SelectionPtr getTargetSel() const {
      return m_pTgtSel;
    }

    /// Set target selection
    void setTargetSel(const SelectionPtr &pSel);
    */

  private:
    /// label's outline color
    gfx::ColorPtr m_outlColor;

  public:
    gfx::ColorPtr getOutlineColor() const {
      return m_outlColor;
    }
    void setOutlineColor(const ColorPtr &rc) {
      m_outlColor = rc;
    }
    
  private:
    /// label's outline thickness
    double m_outlSize;

  public:
    double getOutlineSize() const {
      return m_outlSize;
    }
    void setOutlineSize(double rc) {
      m_outlSize = rc;
    }

  private:
    /// Unit of sizes
    int m_nSizeUnit;
    
  public:
    int getSizeUnit() const {
      return m_nSizeUnit;
    }
    void setSizeUnit(int n) {
      m_nSizeUnit = n;
    }

    //////////////////////////////////////////////////////

  private:
    MolCoordPtr getClientMol() const;
    MolAtomPtr getTargetAtom() const;
    
    gfx::PixelBuffer m_pixbuf;

    bool getLabelPos(Vector4D &res) const;
    bool makeLabelStr();
  };

} // namespace

#endif
