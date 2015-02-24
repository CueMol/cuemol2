// -*-Mode: C++;-*-
//
//  Interaction line renderer class
//

#ifndef MOLVIS_INTRACTION_RENDERER_HPP
#define MOLVIS_INTRACTION_RENDERER_HPP

#include "molvis.hpp"

#include <modules/molstr/molstr.hpp>
#include <qsys/DispListRenderer.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/LabelCacheImpl.hpp>
#include "AtomIntrData.hpp"

class AtomIntrRenderer_wrap;

namespace gfx {
  class PixelBuffer;
}

namespace molvis {

using gfx::ColorPtr;
using gfx::DisplayContext;
using qlib::Vector4D;
using molstr::MolCoordPtr;
using molstr::SelectionPtr;

class MOLVIS_API AtomIntrRenderer : public qsys::DispListRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  friend class ::AtomIntrRenderer_wrap;

  typedef qsys::DispListRenderer super_t;

private:

  /// Drawing mode
  int m_nMode;

  /// Label flag
  bool m_bShowLabel;

  /// line width
  double m_linew;

  /// Shape of line termini (valid for FANCY mode)
  int m_nEndType;

  /// Color of lines
  ColorPtr m_pcolor;

  /// Height of arrow (valid for FANCY mode with arrow terminus)
  double m_dArrowHeight;

  /// Width of arrow (valid for FANCY mode with arrow terminus)
  double m_dArrowWidth;

  /// Tesselation level (valid for FANCY mode)
  int m_nDetail;

  enum {
    MAX_STIPPLE_INDEX = 6
  };

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
  AtomIntrRenderer();
  virtual ~AtomIntrRenderer();

  //////////////////////////////////////////////////////

  virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
  virtual LString toString() const;

  virtual void preRender(DisplayContext *pdc);
  virtual void postRender(DisplayContext *pdc);
  virtual void render(DisplayContext *pdl);
  virtual bool isHitTestSupported() const;

  Vector4D getCenter() const;

  virtual const char *getTypeName() const;

  virtual bool isTransp() const;

  virtual void displayLabels(DisplayContext *pdc);

  ////

  virtual void propChanged(qlib::LPropEvent &ev);

  virtual void styleChanged(qsys::StyleEvent &ev);

  //////////////////////////////////////////////////////

  MolCoordPtr getClientMol() const;

  int getMode() const { return m_nMode; }
  void setMode(int nID) {
    invalidateDisplayCache();
    m_nMode = nID;
  }

  bool isShowLabel() const { return m_bShowLabel; }
  void setShowLabel(bool f) {
    invalidateDisplayCache();
    m_bShowLabel = f;
  }

  int getEndType() const { return m_nEndType; }
  void setEndType(int nID) {
    invalidateDisplayCache();
    m_nEndType = nID;
  }

  int getDetail() const { return m_nDetail; }
  void setDetail(int nID);

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

  //////////

  /// Create intr data with ID (for REDO operation)
  void setAt(int index, const AtomIntrData &dat);

  /// Remove intr data by ID
  bool remove(int nid);

  /// Get intr data defs by JSON rep.
  LString getDefsJSON() const;

  double getWidth() const { return m_linew; }
  void setWidth(double d) {
    m_linew = d;
    invalidateDisplayCache();
  }

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
  
  //////////////////////////////////////////////////////
  // Serialization / deserialization impl for non-prop data

  virtual void writeTo2(qlib::LDom2Node *pNode) const;
  virtual void readFrom2(qlib::LDom2Node *pNode);

private:

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

