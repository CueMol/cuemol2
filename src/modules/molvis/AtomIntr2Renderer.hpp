// -*-Mode: C++;-*-
//
//  Interaction line renderer class (ver2)
//

#ifndef MOLVIS_ATOM_INTR2_RENDERER_HPP
#define MOLVIS_ATOM_INTR2_RENDERER_HPP

#include "molvis.hpp"

#include <gfx/SolidColor.hpp>

#include <modules/molstr/molstr.hpp>
#include <modules/molstr/MolRenderer.hpp>

#include "AtomIntrData.hpp"

class AtomIntr2Renderer_wrap;

namespace gfx {
  class PixelBuffer;
}

namespace molvis {

  using gfx::ColorPtr;
  using gfx::DisplayContext;
  using qlib::Vector4D;
  using molstr::MolCoordPtr;
  using molstr::SelectionPtr;

  class MOLVIS_API AtomIntr2Renderer : public molstr::MolRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;
    
    friend class ::AtomIntr2Renderer_wrap;

    typedef molstr::MolRenderer super_t;

    /////////////
    // Properties
  private:
    
    /// Drawing mode
    int m_nMode;
    
  public:
    /// Drawing mode constants
    static const int AIR_SIMPLE = 0;
    static const int AIR_FANCY = 1;

    int getMode() const { return m_nMode; }
    virtual void setMode(int nID);

  private:
    /// Label flag
    bool m_bShowLabel;
    
  public:
    bool isShowLabel() const { return m_bShowLabel; }
    virtual void setShowLabel(bool f);

  private:
    /// line width
    double m_linew;
    
  public:
    double getWidth() const { return m_linew; }
    virtual void setWidth(double d);

  private:
    /// Shape of line termini (valid for FANCY mode)
    //int m_nEndType;
    int m_nStartCapType;
    int m_nEndCapType;
    
  public:

    /// end type ID
    static const int END_FLAT = 0;
    static const int END_SPHERE = 1;
    static const int END_ARROW = 2;

    int getEndType() const { return m_nEndCapType; }
    void setEndType(int nID) {
      m_nStartCapType = nID;
      m_nEndCapType = nID;
      invalidateDisplayCache();
    }

    int getStartCapType() const {
      return m_nStartCapType;
    }
    void setStartCapType(int n) {
      m_nStartCapType = n;
      invalidateDisplayCache();
    }

    int getEndCapType() const {
      return m_nEndCapType;
    }
    void setEndCapType(int n) {
      m_nEndCapType = n;
      invalidateDisplayCache();
    }
  
  private:
    /// Color of lines
    ColorPtr m_pcolor;
    
  public:
    const ColorPtr &getColor() const { return m_pcolor; }
	void setColor(const ColorPtr &pcol) { m_pcolor = pcol; }

  private:
    /// Height of arrow (valid for FANCY mode with arrow terminus)
    double m_dArrowHeight;
    
    /// Width of arrow (valid for FANCY mode with arrow terminus)
    double m_dArrowWidth;
    
  public:
    double getArrowWidth() const { return m_dArrowWidth; }
    void setArrowWidth(double d) {
      m_dArrowWidth = d;
      invalidateDisplayCache();
    }

    double getArrowHeight() const { return m_dArrowHeight; }
    void setArrowHeight(double d) {
      m_dArrowHeight = d;
      invalidateDisplayCache();
    }
  
  private:
    /// Tesselation level (Used in for FANCY mode)
    int m_nDetail;
    
  public:
    int getDetail() const { return m_nDetail; }
    void setDetail(int ndetail);

  //private:
  protected:
    static const int MAX_STIPPLE_INDEX = 6;
    
    /// stipple-in/out length
    double m_stipple[MAX_STIPPLE_INDEX];
    int m_nTopStipple;
    
  public:
    double getStipple0() const { return m_stipple[0]; }
    double getStipple1() const { return m_stipple[1]; }
    double getStipple2() const { return m_stipple[2]; }
    double getStipple3() const { return m_stipple[3]; }
    double getStipple4() const { return m_stipple[4]; }
    double getStipple5() const { return m_stipple[5]; }

    void setStipple0(double d);
    void setStipple1(double d);
    void setStipple2(double d);
    void setStipple3(double d);
    void setStipple4(double d);
    void setStipple5(double d);

  private:
    /// label's font name
    LString m_strFontName;
    
    /// label's font size
    double m_dFontSize;
    
    /// label's font style (corresponds to the font-style prop of CSS)
    LString m_strFontStyle;
    
    /// label's font weight (corresponds to the font-weight prop of CSS)
    LString m_strFontWgt;
    
    
    //////////////////////////////////////////////////////

  protected:
    
    /// Implementation data
    AtomIntrSet m_data;
    
    //////////////////////////////////////////////////////

  public:
    AtomIntr2Renderer();
    virtual ~AtomIntr2Renderer();

    //////////////////////////////////////////////////////

    virtual LString toString() const;

    virtual bool isHitTestSupported() const;

    virtual Vector4D getCenter() const;

    virtual const char *getTypeName() const;

    virtual bool isTransp() const;

    virtual void invalidateDisplayCache();

    //////////////////////////////////////////////////////
    // Old rendering interface
    //   (for renderFile()/GL compatible prof)

    virtual void preRender(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc);
    virtual void render(DisplayContext *pdl);

    // virtual void displayLabels(DisplayContext *pdc);

  public:

    //////////////////////////////////////////////////////
    // AtomIntr specific interface

    /// Append distance label by selection string
    int appendBySelStr(const LString &sstr1, const LString &sstr2);

    /// Append distance label by AtomID/ObjID
    int appendById(int nAid1, qlib::uid_t nMolID2, int nAid2, bool bShowMsg);

    /// Append angle label by AtomID/ObjID
    int appendAngleById(int nAid1,
                        qlib::uid_t nMolID2, int nAid2,
                        qlib::uid_t nMolID3, int nAid3);

    /// Append torsion label by AtomID/ObjID
    int appendTorsionById(int nAid1,
                          qlib::uid_t nMolID2, int nAid2,
                          qlib::uid_t nMolID3, int nAid3,
                          qlib::uid_t nMolID4, int nAid4);

    /// Append label by cart coord vecs
    int appendByVecs(const std::vector<Vector4D> &vecs);

    /// Append distance label by cart coord vecs
    int appendBy2Vecs(const Vector4D &v1, const Vector4D &v2);

    //////////

    /// Create intr data with ID (for REDO operation)
    void setAt(int index, const AtomIntrData &dat);

    /// Remove intr data by ID
    bool remove(int nid);

    /// Get intr data defs by JSON rep.
    LString getDefsJSON() const;

    //////////////////////////////////////////////////////
    // Serialization / deserialization impl for non-prop data

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    //////////////////////////////////////////////////////
    // Event handling

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void styleChanged(qsys::StyleEvent &ev);

    //////////////////////////////////////////////////////
    // Specific implementations
    
  protected:

    void invalidateAllLabels();

    int appendImpl(const AtomIntrData &dat);

    void renderDistLabel(AtomIntrData &value, DisplayContext *pdl);
    void renderAngleLabel(AtomIntrData &value, DisplayContext *pdl);
    void renderTorsionLabel(AtomIntrData &value, DisplayContext *pdl);

    void renderLabel(DisplayContext *pdl, AtomIntrData &value, const Vector4D &pos, const LString &strlab);

    LString formatAidatJSON(const AtomIntrElem &aie) const;

    bool evalPos(AtomIntrElem &elem, Vector4D &rval);
    MolCoordPtr evalMol(const AtomIntrElem &elem) const;

    void drawArrow(DisplayContext *pdl,
		   const Vector4D &startPos,
		   const Vector4D &endPos);

    void cylImpl(DisplayContext *pdl,
		 const Vector4D &startPos,
		 const Vector4D &endPos);

    void checkStipple()
    {
      m_nTopStipple = 0;
      for (int i=0; i<MAX_STIPPLE_INDEX; i++) {
	if (m_stipple[i]>0) m_nTopStipple = i+1;
	else break;
      }
    }

    /// Render label to the pixel buffer
    gfx::PixelBuffer *createPixBuf(double scl, const LString &lab);

    void writeTo2ElemHelper(qlib::LDom2Node *pNode, int nOrder,
			    const AtomIntrElem &elem) const;

    bool readFrom2Helper(qlib::LDom2Node *pNode, int nOrder,
			 AtomIntrElem &elem);

  };

}


#endif

