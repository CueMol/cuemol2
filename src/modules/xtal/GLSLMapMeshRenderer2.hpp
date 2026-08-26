// -*-Mode: C++;-*-
//
// Generate/Render a mesh contour of ScalarObject (GpuPrim-based implementation)
//

#ifndef XTAL_GLSL_MAP_MESH_RENDERER2_HPP_INCLUDED
#define XTAL_GLSL_MAP_MESH_RENDERER2_HPP_INCLUDED

#include "xtal.hpp"
#include "MapRenderer.hpp"
#include "MapBufTex.hpp"
#include "MapMeshGpuPrim.hpp"

#include <qlib/IntVec3D.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/ViewEvent.hpp>

class GLSLMapMeshRenderer2_wrap;

namespace xtal {

using gfx::DisplayContext;
using qsys::ScalarObject;
class DensityMap;

using qlib::IntVec3D;

class GLSLMapMeshRenderer2 : public MapRenderer, public qsys::ViewEventListener
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef MapRenderer super_t;
    friend class ::GLSLMapMeshRenderer2_wrap;

private:
    ///////////////////////////////////////////
    // properties

    /// Drawing line width (in pixel unit)
    double m_lw;

    /// Internal buffer size (default: 100x100x100 points)
    int m_nBufSize;

  public:
    enum {
        LOD_AUTO = 0,
    };

  private:
    /// Level of detail in full region mode (LOD_AUTO or a grid stride)
    int m_nLod;

    /// Cell budget of the automatic level of detail (2^20 cells)
    int m_nLodBudget;

    /// grid stride of the current texture (1 in box mode)
    int m_nStep;

  public:
    int getLod() const { return m_nLod; }
    void setLod(int n)
    {
        if (m_nLod == n) return;
        m_nLod = n;
        invalidateDisplayCache();
    }
    int getLodBudget() const { return m_nLodBudget; }
    void setLodBudget(int n)
    {
        if (n < 1) n = 1;
        if (m_nLodBudget == n) return;
        m_nLodBudget = n;
        invalidateDisplayCache();
    }
    int getStep() const { return m_nStep; }

  private:

    /// Periodic boundary flag
    bool m_bPBC;

    /// Automatically update the map center as view center
    bool m_bAutoUpdate;

    /// Automatically update including mouse-drag events
    bool m_bDragUpdate;

private:
    /// Shader init flag
    bool m_bChkShaderDone;

    /// GpuPrim for GPU marching-cubes rendering (owned)
    MapMeshGpuPrim *m_pGpuPrim;

    /// CPU/GPU buffer texture pair (owned)
    MapBufTex m_mapBufTex;

    ///////////////////////////////////////////
    // work area

    int m_nMapColNo, m_nMapRowNo, m_nMapSecNo;

    int m_nActCol, m_nActRow, m_nActSec;
    int m_nStCol, m_nStRow, m_nStSec;

    double m_delta;

    unsigned int m_isolevel;

    void renderGPU(DisplayContext *pdc);
    void renderCPU(DisplayContext *pdc);

    IntVec3D m_ivdel[12];

    Vector4D calcVecCrs(const IntVec3D &tpos, int iv0, float crs0, int ivbase);

public:
    ///////////////////////////////////////////
    // constructors / destructor

    GLSLMapMeshRenderer2();
    ~GLSLMapMeshRenderer2() override;

    ///////////////////////////////////////////

    const char *getTypeName() const override;

    void setSceneID(qlib::uid_t nid) override;

    qlib::uid_t detachObj() override;

    bool initShader(DisplayContext *pdc);

    void unloading() override;

    ///////////////////////////////////////////

    void display(DisplayContext *pdc) override;

    void render(DisplayContext *pdl) override {}
    void preRender(DisplayContext *pdc) override {}
    void postRender(DisplayContext *pdc) override {}

    bool isTransp() const override { return true; }

    void invalidateDisplayCache() override;

    ///////////////////////////////////////////////////////////////

    void make3DTexMap(DisplayContext *pdc, ScalarObject *pMap, DensityMap *pXtal);

    /// Full region mode texture (whole block at the budget stride)

    void make3DTexMapFull(DisplayContext *pdc, ScalarObject *pMap);

    ///////////////////////////////////////////////////////////////

    void setLineWidth(double f)
    {
        m_lw = f;
        super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }

    double getMaxExtent() const;

    int getBufSize() const { return m_nBufSize; }
    void setBufSize(int nsize) { m_nBufSize = nsize; }

    ///////////////////////////////////////////////////////////////

    void viewChanged(qsys::ViewEvent &) override;

    ///////////////////////////////////////////////////////////////

private:
    bool m_bMapTexOK;

    unsigned char getMap(ScalarObject *pMap, int x, int y, int z) const
    {
        if (m_bPBC) {
            const int xx = (x + 10000 * m_nMapColNo) % m_nMapColNo;
            const int yy = (y + 10000 * m_nMapRowNo) % m_nMapRowNo;
            const int zz = (z + 10000 * m_nMapSecNo) % m_nMapSecNo;
            return pMap->atByte(xx, yy, zz);
        } else {
            if (pMap->isInBoundary(x, y, z))
                return pMap->atByte(x, y, z);
            else
                return 0;
        }
    }
};

}  // namespace xtal

#endif
