// -*-Mode: C++;-*-
//
// Generate/Render the contour surface of ScalarObject
//

#ifndef XTAL_MAP_SURF_RENDERER_HPP_INCLUDED
#define XTAL_MAP_SURF_RENDERER_HPP_INCLUDED

#include "xtal.hpp"
#include "MapRenderer.hpp"

#include <qsys/ScalarObject.hpp>
#include <qsys/ViewEvent.hpp>
#include <modules/molstr/molstr.hpp>
#include <modules/molstr/BSPTree.hpp>

#include <modules/molstr/ColoringScheme.hpp>
#include <modules/surface/MolSurfObj.hpp>
#include <gfx/TrigGpuPrim.hpp>

class MapSurfRenderer_wrap;

namespace molstr { class AtomPosMap2; }

namespace xtal {

  using gfx::DisplayContext;
  using qsys::ScalarObject;
  using molstr::SelectionPtr;
  using molstr::MolCoordPtr;
  using molstr::BSPTree;
  class DensityMap;

  class MapSurfRenderer : public MapRenderer,
                          public molstr::ColSchmHolder,
                          public qsys::ViewEventListener
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef MapRenderer super_t;
    friend class ::MapSurfRenderer_wrap;

  public:
    // Both MapRenderer::getColor() (solid color property) and
    // ColSchmHolder::getColor(MolAtomPtr/MolResiduePtr) are inherited from
    // different bases; bring both overload sets into the same scope so that
    // unqualified calls resolve by argument instead of being ambiguous.
    using MapRenderer::getColor;
    using molstr::ColSchmHolder::getColor;

  private:
    ///////////////////////////////////////////
    // properties

    /// Automatically update the map center as view center
    /// (default: true)
    bool m_bAutoUpdate;

    /// Automatically update the map center as view center
    /// in both mouse-drag and mouse-up events
    /// (default: false)
    bool m_bDragUpdate;

  public:
    enum {
      MSRDRAW_FILL = 0,
      MSRDRAW_LINE = 1,
      MSRDRAW_POINT = 2,
    };
    
  private:
    /// Mesh-drawing mode
    int m_nDrawMode;

    /// Line width (used in LINE/POINT mode)
    double m_lw;

  public:
    int getDrawMode() const { return m_nDrawMode; }
    void setDrawMode(int n) {
      if (m_nDrawMode == n)
        return;
      m_nDrawMode = n;
      // fill<->line/point also switches the display route (GpuPrim vs DL);
      // drop the GPU prim, keep the mesh cache (geometry is unchanged)
      invalidateGpuMesh();
      invalidateDisplayCache();
    }
    
    void setLineWidth(double f) {
      m_lw = f;
      invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }
    

  private:
    /// cull face
    bool m_bCullFace;

  public:
    bool isCullFace() const { return m_bCullFace; }
    void setCullFace(bool b) {
      m_bCullFace = b;
      invalidateDisplayCache();
    }
    
  private:
    /// binning
    int m_nBinFac;

  public:
    int getBinFac() const { return m_nBinFac; }
    void setBinFac(int n) {
      if (m_nBinFac == n)
        return;
      m_nBinFac = n;
      invalidateGeomCache();
    }
    
  private:
    /// Max grid size (default=100x100x100 grid)
    int m_nMaxGrid;

  public:
    int getMaxGrids() const { return m_nMaxGrid; }
    void setMaxGrids(int n);

    /// Get max extent (in angstrom unit; calculated from m_nMaxGrid)
    double getMaxExtent() const;

  private:
    /// Molecule object ID by which painting color is determined
    /// (used in MOLFANC mode)
    qlib::uid_t m_nTgtMolID;

    /// Molecule object name by which painting color is determined.
    /// Used if MolID cannot be resolved (when deserialized from qsc file)
    qlib::LString m_sTgtMolName;

    /// Selection for atompos-map (used in MOLFANC mode)
    SelectionPtr m_pMolSel;

  public:
    /// Get reference molecule target (used in MOLFANC mode)
    qlib::LString getTgtObjName() const;

    /// Set reference molecule target (used in MOLFANC mode)
    void setTgtObjName(const qlib::LString &n);

    SelectionPtr getMolSel() const { return m_pMolSel; }

    void setMolSel(SelectionPtr pNewSel) {
      if (!m_pMolSel.isnull() && !pNewSel.isnull() &&
          m_pMolSel->equals(pNewSel.get()))
        return;
      m_pMolSel = pNewSel;
      invalidateAtomPosMap();
      invalidateDisplayCache();
    }

    ////

    void propChanged(qlib::LPropEvent &ev) override;

    /// object-changed event handler (for target mol changes in MOLFANC mode)
    void objectChanged(qsys::ObjectEvent &ev) override;

    /// scene-changed event handler (for target mol name resolution)
    void sceneChanged(qsys::SceneEvent &ev) override;

  private:

    ///////////////////////////////////////////
    // work area

    /// Periodic boundary flag. This value is determined by the map size and usePBC flag
    bool m_bPBC;

    /// size of map (copy from m_pMap)
    int m_nMapColNo, m_nMapRowNo, m_nMapSecNo;

    /// size of section array
    int m_nActCol, m_nActRow, m_nActSec;
    int m_nStCol, m_nStRow, m_nStSec;

    /// contour level (not a property)
    double m_dLevel;

    /// for debug
    std::deque<Vector4D> m_tmpv;
    
  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    MapSurfRenderer();

    /// destructor
    ~MapSurfRenderer() override;

    ///////////////////////////////////////////

    const char *getTypeName() const override;

    //virtual void attachObj(qlib::uid_t obj_uid);
    void setSceneID(qlib::uid_t nid) override;

    qlib::uid_t detachObj() override;

    ///////////////////////////////////////////

    void render(DisplayContext *pdl) override;
    void preRender(DisplayContext *pdc) override;
    void postRender(DisplayContext *pdc) override;

    /// GpuPrim-based display path (fill mode, GL contexts); file export and
    /// line/point draw modes fall back to the display-list path
    void display(DisplayContext *pdc) override;

    /// Called just before this renderer is unloaded from the view
    void unloading() override;

    // virtual bool isTransp() const { return true; }

    ///////////////////////////////////////////////////////////////

    void viewChanged(qsys::ViewEvent &) override;

  protected:
    // We must override firePropertyChanged() to avoid destructing the display list,
    // when only the color was changed.
    // virtual void firePropertyChanged(qlib::PropChgEvent &ev);

  private:

    // cached ptr of target obj
    ScalarObject *m_pCMap;

    void makerange();

    void renderImpl(DisplayContext *pdl);

    /// One emission record of the marching-cubes build: a vertex position
    /// (cell-grid coordinates, pre-xform) and its (possibly flipped) normal.
    struct MCVert {
      Vector4D pos;
      Vector4D norm;
    };
    typedef std::vector<MCVert> MCVertBuf;

    /// Pure per-cell marching-cubes kernel. Appends the cell's emission
    /// records to out in the exact serial order (gen-surf inside-cell caps
    /// early-return; triangle corners; gen-surf crossing-cell caps last).
    /// Only reads shared state, so distinct cells may run concurrently.
    void marchCubeCell(int fx, int fy, int fz, const float values[8],
                       const bool bary[8], bool bGenSurf, MCVertBuf &out) const;

    ///////////////////////////////////////////
    // persistent mesh cache (display mode)

    /// Persistent per-vertex mesh cache record (cell-grid coords, pre-xform,
    /// normal flip already applied); shared geometry source of the display
    /// sinks. The gen-surf path keeps its own transient double-precision
    /// records and does not use this cache.
    struct CachedVert {
      float x, y, z;      ///< position
      float nx, ny, nz;   ///< normal
      qint32 aid;         ///< nearest atom id (MOLFANC); -1 = unresolved
    };

    /// Mesh cache, flattened in slab order (empty + !m_bMeshCacheValid =
    /// rebuild needed)
    std::vector<CachedVert> m_meshCache;

    /// Mesh cache validity (geometry level)
    bool m_bMeshCacheValid;

    /// Validity of the aid column of the mesh cache (MOLFANC)
    bool m_bAidValid;

    /// GPU-side colors need re-resolution (color level; used by the GpuPrim
    /// display path)
    bool m_bColorDirty;

    /// Phase 1: run the per-cell MC kernel over the current range in
    /// parallel, one buffer per col-axis slab (shared by the gen-surf path
    /// and buildMeshCache)
    void runMarchingCubes(bool bGenSurf, std::vector<MCVertBuf> &slabs) const;

    /// Run the parallel MC over the current range and flatten the records
    /// into m_meshCache (slabs freed afterwards)
    void buildMeshCache();

    /// Parallel nearest-atom pass over m_meshCache (MOLFANC). Requires the
    /// AtomPosMap2 tree to be built (ensureBuilt); queries are read-only
    /// and return plain ints, so they run concurrently.
    void resolveAidCache();

    ///////////////////////////////////////////
    // GpuPrim display path

    /// Triangle-mesh GPU primitive (fill-mode interactive rendering)
    gfx::TrigGpuPrim m_trigGpuPrim;

    /// Shader availability probed (one-shot)
    bool m_bCheckShaderOK;

    /// Shader program available on this context
    bool m_bUseShader;

    /// Set up the coloring environment for a build/recolor pass (target
    /// mol resolution, atom-pos map, scheme start brackets, m_xform);
    /// shared by the DL render path and the GpuPrim display path
    void setupColorEnv();

    /// Tear down what setupColorEnv() set up (scheme end brackets etc.)
    void cleanupColorEnv();

    /// Resolve one devcode per cached vertex according to the color mode
    /// (per-atom memoized for MOLFANC); requires setupColorEnv()
    void resolveVertexColors(std::vector<quint32> &vcols);

    /// Full GPU-prim fill: geometry + colors from the mesh cache
    void buildGpuMesh(DisplayContext *pdc);

    /// In-place color rewrite of the GPU prim (VBO/VAO reused; whole buffer
    /// re-uploaded on the next draw). Returns false if the vertex count no
    /// longer matches (caller falls back to buildGpuMesh).
    bool updateGpuColors();

    /// Drop the GPU prim only (mesh cache kept)
    void invalidateGpuMesh();

    /// Replay m_meshCache into the display-list context (serial coloring)
    void replayMeshCache(DisplayContext *pdl);

    /// GEOM-level invalidation: drop the mesh cache (and everything below)
    void invalidateMeshCache();

  protected:
    /// MapRenderer geometry-setter hook: also drop the mesh cache
    void invalidateGeomCache() override;

  public:
    /// COLOR-level invalidation (any generic display-cache invalidation):
    /// keep the mesh cache, mark colors dirty, drop the DL
    void invalidateDisplayCache() override;

  private:

    /// Coloring map object (for MULTIGRAD mode)
    qsys::ScalarObject *m_pColMapObj;

    qsys::MultiGradient *m_pGrad;

    /// Coloring target mol (for MOLFANC mode; only valid during rendering)
    MolCoordPtr m_pColMol;

    /// Nearest-atom map for MOLFANC coloring. Cached across renders;
    /// NULL means "rebuild needed". Dropped when the target mol, the
    /// selection, or the atom positions/topology change (never on
    /// color-only display-cache invalidations).
    molstr::AtomPosMap2 *m_pAtomPosMap;

    /// Drop the cached nearest-atom map (rebuilt on next MOLFANC render)
    void invalidateAtomPosMap();

    /// Resolve mol name, set m_nTgtMolID, listen the MolCoord events,
    /// and return the MolCoord object
    MolCoordPtr resolveMolIDImpl(const qlib::LString &name);

    void makeAtomPosMap();

    /// Get color of the nearest atom (v is in the orthogonal coordinates)
    bool getColorMol(const Vector4D &v, gfx::ColorPtr &rcol);

    void setVertexColor(DisplayContext *pdl, const Vector4D &rfPosition);

    inline float getDen(int x, int y, int z) const
    {
      // TO DO: support symop

      if (m_bPBC) {
        const int xx = (x+10000*m_nMapColNo)%m_nMapColNo;
        const int yy = (y+10000*m_nMapRowNo)%m_nMapRowNo;
        const int zz = (z+10000*m_nMapSecNo)%m_nMapSecNo;
        // return pMap->atByte(xx,yy,zz);
        return m_pCMap->atFloat(xx, yy, zz);
      }
      else {
        if (x<0||y<0||z<0)
          return 0.0;
        if (x>=m_nMapColNo||
            y>=m_nMapRowNo||
            z>=m_nMapSecNo)
          return 0.0;
        return m_pCMap->atFloat(x, y, z);
      }
      
    }

    Vector4D getGrdNorm2(int ix, int iy, int iz) const;

    void setupXformMat(DisplayContext *pdl);
    void setupXformMat();

  private:
    bool m_bGenSurfMode;

    std::deque<surface::MSVert> m_msverts;
    Matrix4D m_xform;

    int addMSVert(const Vector4D &v, const Vector4D &n)
    {
      Vector4D vv(v);
      vv.w() = 1.0;
      m_xform.xform4D(vv);

      Vector4D nn(n);
      nn.w() = 0.0;
      m_xform.xform4D(nn);

      int nid = m_msverts.size();
      m_msverts.push_back( surface::MSVert(vv, nn) );

      return nid;
    }

    int addMSVert(int ix, int iy, int iz, int nx, int ny, int nz)
    {
      return addMSVert(Vector4D(ix, iy, iz), Vector4D(nx, ny, nz));
    }

  public:    
    qsys::ObjectPtr generateSurfObj();

  };

}

#endif
