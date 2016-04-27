// -*-Mode: C++;-*-
//
//  LuxRender Display context implementation class
//

#ifndef LUXREND_DISPLAY_CONTEXT_HPP_INCLUDED__
#define LUXREND_DISPLAY_CONTEXT_HPP_INCLUDED__

#include "render.hpp"

#include "FileDisplayContext.hpp"
#include "RendIntData.hpp"
#include <qlib/LString.hpp>
#include <qlib/MapTable.hpp>

namespace qlib {
  class OutStream;
  class PrintStream;
}

namespace render {

  using qlib::PrintStream;
  class RendIntData;
  class LuxRendSceneExporter;

  class LuxRendDisplayContext : public FileDisplayContext
  {
  private:
    typedef FileDisplayContext super_t;

    /// output file
    qlib::OutStream *m_pOut;

    /// Parent scene exporter
    LuxRendSceneExporter *m_pParent;

    Vector4D m_vSpotLightPos;

  public:
    LuxRendDisplayContext();
    virtual ~LuxRendDisplayContext();

    ///////////////////////////////

    void startRender();
    void endRender();

    virtual void startSection(const LString &name);
    virtual void endSection();

    ////////////////////////////////////////////////////////////
    // Implementation

    void init(qlib::OutStream *pOut, LuxRendSceneExporter *pParent);

  private:
    void writeHeader();
    void writeTailer();

    void writeLights(PrintStream &ps);

    void writeObjects();
    void writeSpheres();
    void writeCyls();

    void writeLines(PrintStream &ps);
    
    void writeMaterials(PrintStream &ps);

    LString makeColorMatName(int icol) const {
      return LString::format("%s_mat_%d", getSecName().c_str(), icol);
    }

    /*LString makeGradMatName(const ColorTable::elem_t &ic) const {
    return LString::format("%s_grd_%d_%d", getSecName().c_str(), ic.cid1, ic.cid2);
  }*/

    LString makeGradMatName(int icol) const {
      return LString::format("%s_grd_%d", getSecName().c_str(), icol);
    }

    LString makeLineColorName(int icol) const {
      return LString::format("%s_lcol_%d", getSecName().c_str(), icol);
    }
    
    void writeMeshes();

    void writeMeshVerts(PrintStream &ps, int nverts, MeshVert **pmary);

    static inline bool isEqualCol(const ColorTable::elem_t &ic1,
                                  const ColorTable::elem_t &ic2)
    {
      if (ic1.isGrad() && ic2.isGrad()) {
        if (ic1.cid1==ic2.cid1 &&
            ic1.cid2==ic2.cid2)
          return true;

        if (ic1.cid1==ic2.cid2 &&
            ic1.cid2==ic2.cid1)
          return true;
      }
      else if (!ic1.isGrad() && ic2.isGrad()) {
        // ic1 is solid color
        if (ic1.cid1==ic2.cid1 ||
            ic1.cid1==ic2.cid2)
          return true;
      }
      else if (ic1.isGrad() && !ic2.isGrad()) {
        // ic2 is solid color
        if (ic2.cid1==ic1.cid1 ||
            ic2.cid1==ic1.cid2)
          return true;
      }
      else {
        // both are solid color
        if (ic1.cid1==ic2.cid1)
          return true;
      }

      return false;
    }

    short findEqualGradIndex(const ColorTable::elem_t &ic1,
                             const ColorTable::elem_t &ic2,
                             const ColorTable::elem_t &ic3) const
    {
      short icol1 = ic1.cid1;
      short icol2 = icol1;
      if (ic1.cid2>=0 && ic1.cid2!=icol1)
        icol2 = ic1.cid2;
      else if (ic2.cid1!=icol1)
        icol2 = ic2.cid1;
      else if (ic2.cid2>=0 && ic2.cid2!=icol1)
        icol2 = ic2.cid2;
      else if (ic3.cid1!=icol1)
        icol2 = ic3.cid1;
      else if (ic3.cid2>=0 && ic3.cid2!=icol1)
        icol2 = ic3.cid2;

      MB_ASSERT(icol1!=icol2);

      if (icol1>icol2)
        std::swap(icol1, icol2);

      ColorTable::elem_t gcol;
      gcol.cid1 = icol1;
      gcol.cid2 = icol2;

      return m_pIntData->m_clut.getGradIndex(gcol);
    }

    short findEqualGradIndex(const ColorTable::elem_t &ic1,
                             const ColorTable::elem_t &ic2) const
    {
      short icol1 = ic1.cid1;
      short icol2 = icol1;
      if (ic1.cid2>=0 && ic1.cid2!=icol1)
        icol2 = ic1.cid2;
      else if (ic2.cid1!=icol1)
        icol2 = ic2.cid1;
      else if (ic2.cid2>=0 && ic2.cid2!=icol1)
        icol2 = ic2.cid2;

      if (icol1==icol2)
        return -1;

      if (icol1>icol2)
        std::swap(icol1, icol2);

      ColorTable::elem_t gcol;
      gcol.cid1 = icol1;
      gcol.cid2 = icol2;

      return m_pIntData->m_clut.getGradIndex(gcol);
    }

    std::pair<bool, short> setFaceType1(const ColorTable::elem_t &ic1,
                                        const ColorTable::elem_t &ic2) const
    {
      // ic1 != ic2 ; ic1 & ic2 are solid
      std::pair<bool, short> rval;
      short gi = findEqualGradIndex(ic1, ic2);
      if (gi>=0) {
        rval.first = true;
        rval.second = gi;
      }
      else {
        // ic1==ic2==solid color (and ic3==grad color)??
        rval.first = false;
        rval.second = ic1.cid1;
      }

      return rval;
    }

    std::pair<bool, short> setFaceType2(const ColorTable::elem_t &ic1,
                                        const ColorTable::elem_t &ic2,
                                        const ColorTable::elem_t &icd) const
    {
      // ic1 == ic2 != icd
      std::pair<bool, short> rval;
      short gi = findEqualGradIndex(ic1, ic2);
      if (gi>=0) {
        rval.first = true;
        rval.second = gi;
      }
      else {
        // ic1==ic2==solid color (and ic3==grad color)??
        rval.first = false;
        rval.second = ic1.cid1;
      }

      return rval;
    }

  };

}

#endif

