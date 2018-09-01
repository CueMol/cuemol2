// -*-Mode: C++;-*-
//
//  LuxCore Display context implementation class
//

#ifndef LUXCORE_DISPLAY_CONTEXT_HPP_INCLUDED
#define LUXCORE_DISPLAY_CONTEXT_HPP_INCLUDED

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
  class LuxCoreSceneExporter;

  class LuxCoreDisplayContext : public FileDisplayContext
  {
  private:
    typedef FileDisplayContext super_t;

    /// main output file
    qlib::OutStream *m_pOut;

    /// sub output file (scn file)
    qlib::OutStream *m_pOut2;

    /// output scn filename
    LString m_scnName;

    /// Parent scene exporter
    LuxCoreSceneExporter *m_pParent;

    Vector4D m_vSpotLightPos;

    double m_dOrthoScl;

  public:
    LuxCoreDisplayContext();
    virtual ~LuxCoreDisplayContext();

    ///////////////////////////////

    void startRender();
    void endRender();

    virtual void startSection(const LString &name);
    virtual void endSection();

    ////////////////////////////////////////////////////////////
    // Implementation

    void init(LuxCoreSceneExporter *pParent, qlib::OutStream *pOut);

    //void setScnFileName(const LString &name) { m_scnFileName = name; }

  private:
    void writeHeader();
    void writeTailer();

    void writeLights(PrintStream &ps);

    bool writeCylXform(PrintStream &ps,
		       const Vector4D &v1, const Vector4D &v2,
		       double &rlen);

    void writeObjects();
    void writeSpheres(PrintStream &ps);
    void writeCyls(PrintStream &ps);

    void writeLines(PrintStream &ps);
    
    void writeMaterials(PrintStream &ps);

    LString makeColorMatName(int icol) const {
      return LString::format("%s_mat_%d", getSecName().c_str(), icol);
    }

    LString makeGradMatName(int icol) const {
      return LString::format("%s_grd_%d", getSecName().c_str(), icol);
    }

    LString makeLineColorName(int icol) const {
      return LString::format("%s_lcol_%d", getSecName().c_str(), icol);
    }
    
    void writeMeshes(PrintStream &ps);

    void writeMeshVerts(PrintStream &ps, int nverts, MeshVert **pmary);

    ////////////////////////

    void writeSilEdges(PrintStream &ps);
    
  public:
    virtual void writeEdgeLineImpl(PrintStream &ips, int xa1, int xa2,
				   const Vector4D &x1, const Vector4D &n1,
				   const Vector4D &x2, const Vector4D &n2);

    virtual void writePointImpl(PrintStream &ips,
				const Vector4D &v1,
				const Vector4D &n1,
				int alpha);

  };

}

#endif

