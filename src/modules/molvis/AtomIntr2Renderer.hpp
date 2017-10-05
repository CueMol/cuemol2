// -*-Mode: C++;-*-
//
//  Interaction line renderer class (ver2)
//

#ifndef MOLVIS_ATOM_INTR2_RENDERER_HPP
#define MOLVIS_ATOM_INTR2_RENDERER_HPP

#include "molvis.hpp"

#include <gfx/SolidColor.hpp>
#include <gfx/LabelCacheImpl.hpp>
#include <gfx/DrawAttrArray.hpp>

#include <modules/molstr/molstr.hpp>
#include <modules/molstr/MolRenderer.hpp>
#include <modules/molstr/GLSLLabelHelper.hpp>

#include "AtomIntrData.hpp"

class AtomIntr2Renderer_wrap;

namespace gfx {
  class PixelBuffer;
}

namespace sysdep {
  class OglProgramObject;
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
    int getMode() const { return m_nMode; }
    void setMode(int nID) {
      invalidateDisplayCache();
      m_nMode = nID;
    }

  private:
    /// Label flag
    bool m_bShowLabel;
    
  public:
    bool isShowLabel() const { return m_bShowLabel; }
    void setShowLabel(bool f) {
      invalidateDisplayCache();
      m_bShowLabel = f;
    }

  private:
    /// line width
    double m_linew;
    
  public:
    double getWidth() const { return m_linew; }
    void setWidth(double d) {
      m_linew = d;
      invalidateDisplayCache();
    }


  private:
    /// Shape of line termini (valid for FANCY mode)
    //int m_nEndType;
    int m_nStartCapType;
    int m_nEndCapType;
    
  public:
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

  private:
    static const int MAX_STIPPLE_INDEX = 6;
    
    /// stipple-in/out length
    double m_stipple[MAX_STIPPLE_INDEX];
    int m_nTopStipple;
    
    /// label's font name
    LString m_strFontName;
    
    /// label's font size
    double m_dFontSize;
    
    /// label's font style (corresponds to the font-style prop of CSS)
    LString m_strFontStyle;
    
    /// label's font weight (corresponds to the font-weight prop of CSS)
    LString m_strFontWgt;
    
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
    
    /// Implementation data
    AtomIntrSet m_data;
    
    MolCoordPtr m_pMol;
    
    gfx::LabelCacheImpl m_pixCache;
    
  public:
    /// end type ID
    enum {
      END_FLAT = 0,
      END_SPHERE = 1,
      END_ARROW = 2
    };

    /// Drawing mode constants
    enum {
      AIR_SIMPLE = 0,
      AIR_FANCY = 1,
    };
  
    //////////////////////////////////////////////////////

  public:
    AtomIntr2Renderer();
    virtual ~AtomIntr2Renderer();

    //////////////////////////////////////////////////////

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
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

    //////////////////////////////////////////////////////
    // Ver. 2 interface

    /// Use ver2 interface (--> return true)
    virtual bool isUseVer2Iface() const;

    /// Initialize & setup capabilities (for glsl setup)
    virtual bool init(DisplayContext *pdc);
    
    virtual bool isCacheAvail() const;

    /// Create GLSL data (VBO, texture, etc)
    virtual void createGLSL();

    /// update VBO positions using CrdArray
    virtual void updateDynamicGLSL();

    /// update VBO positions using getPos
    virtual void updateStaticGLSL();


    // /// Render to display (using VBO)
    // virtual void renderVBO(DisplayContext *pdc);

    /// Render to display (using GLSL)
    virtual void renderGLSL(DisplayContext *pdc);

  private:
    
    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    struct AttrElem {
      qfloat32 pos1x, pos1y, pos1z;
      qfloat32 pos2x, pos2y, pos2z;
      qfloat32 hwidth;
      qfloat32 dir;
    };

    quint32 m_nPos1Loc;
    quint32 m_nPos2Loc;
    quint32 m_nHwidthLoc;
    quint32 m_nDirLoc;

    typedef gfx::DrawAttrElems<quint32, AttrElem> AttrArray;

    /// VBO for GLSL rendering
    AttrArray *m_pAttrAry;
    
    //////////

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pLabPO;

    /// Attribute for label rendering VBO
    struct LabAttrElem {
      // label origin position
      qfloat32 x, y, z;
      // label w-direction
      qfloat32 nx, ny, nz;
      // label texture coord
      qfloat32 w, h;
      // vertex displacement
      qfloat32 dx, dy;
    };

    typedef gfx::DrawAttrElems<quint32, LabAttrElem> LabAttrArray;

    /// VBO for GLSL rendering
    LabAttrArray *m_pLabAttrAry;

    typedef std::vector<qbyte> LabPixBuf;

    static const int LABEL_TEX_UNIT = 0;

    /// label image texture (in GPU)
    gfx::Texture *m_pLabelTex;

    /// Label image data (in CPU)
    LabPixBuf m_pixall;

    void createTextureData(DisplayContext *pdc, float asclx, float scly);

    // TO DO: move to gfx::PixelBuffer??
    gfx::PixelBuffer *createPixBuf(double scl, const LString &lab);

    static const int TEX2D_WIDTH = 2048;

    /// Height and Width of CoordTex (2D texture mode for GL1.3)
    int m_nTexW, m_nTexH;

    int m_nDigitW, m_nDigitH;

    int m_nDigits;
    static const int NUM_TEX_UNIT = 1;
    gfx::Texture *m_pNumTex;
    LabPixBuf m_numpix;

  public:

    //////////////////////////////////////////////////////
    // Specific implementation

    // MolCoordPtr getClientMol() const;
    
    int appendBySelStr(const LString &sstr1, const LString &sstr2);

    int appendById(int nAid1, qlib::uid_t nMolID2, int nAid2, bool bShowMsg);

    int appendAngleById(int nAid1,
			qlib::uid_t nMolID2, int nAid2,
			qlib::uid_t nMolID3, int nAid3);

    int appendTorsionById(int nAid1,
			  qlib::uid_t nMolID2, int nAid2,
			  qlib::uid_t nMolID3, int nAid3,
			  qlib::uid_t nMolID4, int nAid4);

    //////////

    int appendByVecs(const std::vector<Vector4D> &vecs);

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

  private:

    void invalidateAllLabels();

    int appendImpl(const AtomIntrData &dat);

    //bool getSelCenter(const MolCoordPtr pmol,
    //const SelectionPtr &sel,
    //Vector4D &rval);

    void renderDistLabel(AtomIntrData &value, DisplayContext *pdl);
    void renderAngleLabel(AtomIntrData &value, DisplayContext *pdl);
    void renderTorsionLabel(AtomIntrData &value, DisplayContext *pdl);

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

    void writeTo2ElemHelper(qlib::LDom2Node *pNode, int nOrder,
			    const AtomIntrElem &elem) const;

    bool readFrom2Helper(qlib::LDom2Node *pNode, int nOrder,
			 AtomIntrElem &elem);

  };

}


#endif

