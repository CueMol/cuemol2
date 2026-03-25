// -*-Mode: C++;-*-
//
// Generate/Render a mesh contour of ScalarObject (DrawObj2-based implementation)
//

#ifndef XTAL_GLSL_MAP_MESH_RENDERER2_HPP_INCLUDED
#define XTAL_GLSL_MAP_MESH_RENDERER2_HPP_INCLUDED

#include "xtal.hpp"
#include "MapRenderer.hpp"
#include "MapBufTex.hpp"
#include "MapMeshDrawObj2.hpp"

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

    /// Periodic boundary flag
    bool m_bPBC;

    /// Automatically update the map center as view center
    bool m_bAutoUpdate;

    /// Automatically update including mouse-drag events
    bool m_bDragUpdate;

private:
    /// Shader init flag
    bool m_bChkShaderDone;

    /// DrawObj2 for GPU marching-cubes rendering (owned)
    MapMeshDrawObj2 *m_pDrawObj;

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
    virtual ~GLSLMapMeshRenderer2();

    ///////////////////////////////////////////

    virtual const char *getTypeName() const;

    virtual void setSceneID(qlib::uid_t nid);

    virtual qlib::uid_t detachObj();

    bool initShader(DisplayContext *pdc);

    virtual void unloading();

    ///////////////////////////////////////////

    void display(DisplayContext *pdc);

    virtual void render(DisplayContext *pdl) {}
    virtual void preRender(DisplayContext *pdc) {}
    virtual void postRender(DisplayContext *pdc) {}

    virtual bool isTransp() const { return true; }

    virtual void invalidateDisplayCache();

    ///////////////////////////////////////////////////////////////

    void make3DTexMap(DisplayContext *pdc, ScalarObject *pMap, DensityMap *pXtal);

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

    virtual void viewChanged(qsys::ViewEvent &);

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
