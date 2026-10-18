// -*-Mode: C++;-*-
//
//  Nucleic acid renderer class
//
//  $Id: NARenderer.hpp,v 1.2 2009/12/17 06:11:27 rishitani Exp $

#ifndef MOLVIS_NUCLEIC_ACID_RENDERER_HPP
#define MOLVIS_NUCLEIC_ACID_RENDERER_HPP

#include "TubeRenderer.hpp"
#include <gfx/SphereGpuPrim.hpp>
#include <gfx/CylinderGpuPrim.hpp>
#include "BallStickRenderer.hpp"

namespace molstr {
  class MolResidue;
}

//MC_DECL_SCRSP(BallStickRenderer);

namespace molvis {

// Nucleic acid renderer
class NARenderer : public TubeRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

private:

  typedef TubeRenderer super_t;

  //
  //  properties
  //
  
  /// width of base sticks
  double m_bondw;
  
  double m_bsthick;

  /// nucleic acid rendering type (enum)
  int m_nType;

  /// tube rendering on/off
  bool m_fRendTube;

  /// tesselation level of base tubes
  int m_nBaseDetail;

  /// base pair rendering on/off
  bool m_bShowBP;

public:
  /// nucleic acid rendering mode type ID
  static const int NAREND_BP = 0;
  static const int NAREND_SIMPLE1 = 1;
  static const int NAREND_DETAIL1 = 2;
  static const int NAREND_DETAIL2 = 3;

public:

  ////////////////////////////////////////////
  // property handling

  double getBaseSize() const { return m_bondw; }
  void setBaseSize(double f) {
    m_bondw = f;
    invalidateDisplayCache();
  }

  double getBaseThick() const { return m_bsthick; }
  void setBaseThick(double f) {
    m_bsthick = f;
    invalidateDisplayCache();
  }

  int getBaseType() const { return m_nType; }
  void setBaseType(int n) {
    m_nType = n;
    invalidateDisplayCache();
  }

  bool getRendTube() const { return m_fRendTube; }
  void setRendTube(bool n) {
    m_fRendTube = n;
    invalidateDisplayCache();
  }

  int getBaseDetail() const { return m_nBaseDetail; }
  void setBaseDetail(int n) {
    m_nBaseDetail = n;
    invalidateDisplayCache();
  }

  bool isShowBP() const { return m_bShowBP; }
  void setShowBP(bool n) {
    m_bShowBP = n;
    invalidateDisplayCache();
  }

private:
  ////////////////////////////////////////////
  //
  //  workarea
  //

  std::set<molstr::MolResidue *> *m_pBpTmp;

  BallStickRenderer *m_pBSRend;

  ////////////////////////////////////////////

public:
  NARenderer();
  ~NARenderer() override;

  // virtual Renderer *create();

  const char *getTypeName() const override;

  //////////////////////////////////////////////////////
  // GPU mesh: the tube and the base ring plates go to the TubeGpuSupport
  // mesh, the base sticks to the sphere/cylinder impostor primitives. All of
  // them are recorded (and updated in place) by the same traversal.

  void display(DisplayContext *pdc) override;
  void displayPick(DisplayContext *pdc) override;
  void unloading() override;

  /// Sticks recorded by the last GPU traversal (exposed for inspection/testing)
  struct Stick
  {
    Vector4D pos1, pos2;  ///< pos2 is unused for a sphere
    float rad;
    qlib::quint32 col;
    int name;
  };
  const std::vector<Stick> &getSpheres() const { return m_sphs; }
  const std::vector<Stick> &getCylinders() const { return m_cyls; }

protected:
  void tubeGpuRenderMesh() override;

  /// The bases are drawn per residue, outside the segment chunks: no chunked
  /// (parallel) coordinate update
  bool tubeGpuCanUpdateChunks() const override { return false; }

public:
  //////////////////////////////////////////////////////

  void beginRend(DisplayContext *pdl) override;
  void endRend(DisplayContext *pdl) override;

  void beginSegment(DisplayContext *pdl, MolResiduePtr pRes) override;
  void rendResid(DisplayContext *pdl, MolResiduePtr pRes) override;
  void endSegment(DisplayContext *pdl, MolResiduePtr pRes) override;

  //////////////////////////////////////////////////////

  void attachObj(qlib::uid_t obj_uid) override;
  qlib::uid_t detachObj() override;

private:
  void rendResidBasePair(DisplayContext *pdl, MolResiduePtr pRes);
  void rendResidSimple1(DisplayContext *pdl, MolResiduePtr pRes);
  void rendResidDetail1(DisplayContext *pdl, MolResiduePtr pRes);

  void rendDetailBond(const std::map<LString, MolAtomPtr> &atoms,
                      const LString &anam1, const LString &anam2, int nPivName);

  ////////////////////////////////////////////
  // Base sticks

  /// Draw a sphere / cylinder of the base sticks: to the DisplayContext in
  /// the display-list path, to the stick records in the GPU traversal
  void stickSphere(const Vector4D &pos, double rad, const ColorPtr &col, int name);
  void stickCyl(const Vector4D &pos1, const Vector4D &pos2, double rad,
                const ColorPtr &col, int name);
  void recordStick(std::vector<Stick> &recs, int &nCur, const Vector4D &pos1,
                   const Vector4D &pos2, double rad, const ColorPtr &col, int name);

  /// Build / update the stick primitives after a GPU traversal; false if the
  /// display-list path has to be used
  bool prepareGpu(DisplayContext *pdc);

  /// Context of the display-list (direct) traversal, null in the GPU traversal
  DisplayContext *m_pDirectDC;

  std::vector<Stick> m_sphs;
  std::vector<Stick> m_cyls;

  /// Builder mode (TubeMeshBuilder::MODE_*) and update flags of the last GPU
  /// traversal, MODE_NONE once its result is applied to the primitives
  int m_nStickPass;
  int m_nStickFlags;
  /// Write cursors of the update traversal
  int m_nSphCur;
  int m_nCylCur;
  /// The update traversal did not reproduce the recorded sticks
  bool m_bStickMismatch;

  gfx::SphereGpuPrim m_sphPrim;
  gfx::CylinderGpuPrim m_cylPrim;
  bool m_bCheckStickShader;
  bool m_bStickShaderOK;

  MolResiduePtr getBPPeerResid(MolResiduePtr pRes) const;
};

}

#endif
