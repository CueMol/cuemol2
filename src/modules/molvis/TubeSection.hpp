// -*-Mode: C++;-*-
//
//  Tube section class
//

#ifndef TUBE_SECTION_HPP_INCLUDED
#define TUBE_SECTION_HPP_INCLUDED

#include <qlib/Vector4D.hpp>
#include <qlib/Vector3F.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>

#include <qsys/style/StyleSupports.hpp>
#include <gfx/gfx.hpp>

namespace gfx {
  class DisplayContext;
}

namespace molvis {

using gfx::DisplayContext;
using qlib::Vector4D;
using qlib::Vector3F;

class TubeSection :
  //public qsys::StyleScrObject
  public qlib::LSimpleCopyScrObject,
  public qsys::StyleResetPropImpl
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

private:

  ////////////////////////////////
  // properties

  /// Tube width
  double m_lw;

  /// Tuber ratio
  double m_tuber;

  /// alpha ratio (valid only for type SQUARE; not an alpha channel)
  double m_alpha;

  /// Section type 
  int m_nSectType;

  /// Detailness in section direction
  int m_nSectDetail;

  ////////////////////////////////
  // internal data
  
  /// Section of the tube
  Vector4D *m_pSectTab;

  /// Size of m_pSectTab
  int m_nSectTabSz;

  // for MOLSCR mode
  int m_Nx, m_Ny;

public:
  //
  static const char TSSF_UNKNOWN = 0;
  static const char TSSF_FRONT = 1;
  static const char TSSF_BACK  = 2;
  static const char TSSF_SIDE1 = 3;
  static const char TSSF_SIDE2 = 4;

private:
  std::vector<char> m_sftypes;

public:

  /// section type ID
  static const int TS_ELLIPTICAL = 0;
  static const int TS_SQUARE = 1;
  static const int TS_RECT = 2;
  static const int TS_MOLSCR = 3;

public:

  TubeSection();
  ~TubeSection();

  /////////////////////////////////////
  // Setters/Getters

  void setWidth(double d) {
    m_lw = d;
    //setupSectionTable();
    invalidate();
  }
  double getWidth() const { return m_lw; }

  void setTuber(double d) {
    m_tuber = d;
    invalidate();
    //setupSectionTable();
  }
  double getTuber() const { return m_tuber; }

  void setSharp(double d) {
    m_alpha = d;
    // if (m_nSectType==TS_SQUARE)
    invalidate();
      //setupSectionTable();
  }
  double getSharp() const { return m_alpha; }

  void setType(int d) {
    m_nSectType = d;
    invalidate();
    //setupSectionTable();
  }
  int getType() const { return m_nSectType; }

  void setDetail(int d) {
    m_nSectDetail = d;
    invalidate();
    //setupSectionTable();
  }
  int getDetail() const { return m_nSectDetail; }

  void setupSectionTable();

  /////////////////////////////////////
  // data access

  /// returns true, if current data is valid.
  bool isValid() const { return m_pSectTab!=NULL; }

  /// Clear the current section table data
  void invalidate();

  /// get the size of section coordinates
  int getSize() const { return m_nSectTabSz; }

  ///
  /// Get the section vector of j th coordinate
  /// @param j Index number for the section table.
  ///        j will be truncated to be modulus of m_nSectTabSz.
  /// @param e1 basis vector along X direction.
  /// @param e2 basis vector along Y direction.
  ///
  Vector4D getVec(int j, const Vector4D &e1, const Vector4D &e2) const {
    j = j%m_nSectTabSz;
    Vector4D g = e1.scale(m_pSectTab[j].x()) + e2.scale(m_pSectTab[j].y());
    return g;
  }

  Vector3F getVec(int j, const Vector3F &e1, const Vector3F &e2) const
  {
    j = j%m_nSectTabSz;
    Vector3F g = e1.scale(m_pSectTab[j].x()) + e2.scale(m_pSectTab[j].y());
    return g;
  }

  ///
  /// Get the section normal vector of j th coordinate
  /// @param j Index number for the section table.
  ///        j will be truncated to be modulus of m_nSectTabSz.
  /// @param e1 basis vector along X direction.
  /// @param e2 basis vector along Y direction.
  /// 
  Vector4D getNormVec(int j, const Vector4D &e1, const Vector4D &e2) const {
    j = j%m_nSectTabSz;
    Vector4D g = e1.scale(m_pSectTab[j].z()) + e2.scale(m_pSectTab[j].w());
    return g;
  }

  Vector4D getSectTab(int j) const { return m_pSectTab[j%m_nSectTabSz]; }

  char getSfType(int j) const { return m_sftypes[j%m_nSectTabSz]; }

  virtual bool resetProperty(const LString &propnm);

  ////////////////////////////////////////
  // Cap rendering routines
  
  void makeCap(DisplayContext *pdl,
               bool fStart, int nType,
               const Vector4D &f, const Vector4D &vpt,
               const Vector4D &e1, const Vector4D &e2);

  void makeSpherCap(DisplayContext *pdl,
                    bool fStart,
                    const Vector4D &f, const Vector4D &vpt,
                    const Vector4D &e1, const Vector4D &e2);

  void makeFlatCap(DisplayContext *pdl,
                   bool fStart,
                   const Vector4D &f, const Vector4D &vpt,
                   const Vector4D &e1, const Vector4D &e2);

  void makeDisconJct(DisplayContext *pdl,
                     const Vector4D &f1, const Vector4D &ev,
                     const Vector4D &e11, const Vector4D &e12,
                     const Vector4D &escl, const Vector4D &escl_prev);

private:
  void makeDJEllip(DisplayContext *pdl,
                   const Vector4D &f1, const Vector4D &ev,
                   const Vector4D &pe1, const Vector4D &pe2,
                   const Vector4D &ne1, const Vector4D &ne2);

public:
  ////////////////////////////////////////
  // Tesselation routines

  void startTess();

  // no or simple norm shift
  void doTess(DisplayContext *pdl,
              const Vector4D &f1,
              const gfx::ColorPtr &pCol, bool bSmoothCol,
              const Vector4D &e11, const Vector4D &e12,
              const Vector4D &norm_shift);

  // complex norm shift (for ribbon junction)
  // vpt should be normalized
  void doTess(DisplayContext *pdl,
              const Vector4D &f1,
              const gfx::ColorPtr &pCol, bool bSmoothCol,
              const Vector4D &e11, const Vector4D &e12,
              const Vector4D &escl, const Vector4D &vpt);

  void endTess();

private:
  bool m_bTessEmpty;
  std::vector<Vector4D> m_vtess;
  std::vector<Vector4D> m_ntess;
  gfx::ColorPtr m_pPrevCol;

  ////////////////////////////////////////
private:

  void setupEllipticalSection();
  void setupSquareSection();
  void setupRectSection();
  void setupMolScrSection();

  Vector4D calcDnorm(int index, const Vector4D &escl, const Vector4D &vpt);
};


typedef qlib::LScrSp<TubeSection> TubeSectionPtr;

}

#endif

