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
    return LString::format("%s_col_%d", getSecName().c_str(), icol);
  }

  void writeMeshes();

};

}

#endif

