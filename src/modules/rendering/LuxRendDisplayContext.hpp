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
}

namespace render {

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

  void writeLights();

  void writeObjects();
  void writeSpheres();
  void writeCyls();

  void writeMaterials();

  LString makeColorMatName(int icol) const {
    return LString::format("%s_mat_%d", getSecName().c_str(), icol);
  }

  LString makeGradMatName(const ColorTable::elem_t &ic) const {
    return LString::format("%s_grd_%d_%d", getSecName().c_str(), ic.cid1, ic.cid2);
  }

  void writeMeshes();

  void writeMeshVerts(PrintStream &ps, int nverts, MeshVert **pmary);

  static inline bool isEqualGradCol(const ColorTable::elem_t &ic1,
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

};

}

#endif

