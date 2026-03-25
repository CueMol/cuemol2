// -*-Mode: C++;-*-
//
// DisplayList.hpp: backend-independent display list using DrawObj2
//

#pragma once

#include "gfx.hpp"
#include "DisplayContext.hpp"
#include "DrawObj2.hpp"
#include "GrowMesh.hpp"
#include "SphereCyls.hpp"

#include <deque>
#include <qlib/LTypes.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/Matrix4D.hpp>

namespace gfx {

/// Backend-independent display list.
/// Accumulates immediate-mode-style drawing calls into buffers, then converts
/// them to LineDrawObj2/TrigDrawObj2 on first draw.
class GFX_API DisplayList : public gfx::DisplayContext
{
private:
    using super_t = gfx::DisplayContext;

    bool m_fPrevPosValid;

    //////////
    // lines

    struct LineDrawAttr
    {
        qlib::Vector4D pos;
        quint32 cc;
    };

    gfx::LineDrawObj2 *m_pLineObj;

    using LineDrawBuf = std::deque<LineDrawAttr>;
    LineDrawBuf m_lineBuf;
    float m_vertLineWidth;
    bool m_bVertStipple;

    //////////
    // triangles (non-indexed, from startTriangles())

    struct TrigVertBuf
    {
        qfloat32 x, y, z;
        qfloat32 nx, ny, nz;
        quint32 cc;
    };

    int m_nPolyMode;

    gfx::TrigDrawObj2 *m_pTrigObj;

    using TrigBuf = std::deque<TrigVertBuf>;
    TrigBuf m_trigBuf;

    //////////
    // trig mesh (indexed, from strip/fan/sphere/cone/drawMesh)

    gfx::GrowMesh<qlib::quint32> m_mesh;

    gfx::TrigDrawObj2 *m_pTrigMeshObj;

    /////

    bool m_fValid;

    /// current color
    gfx::ColorPtr m_pColor;

    bool m_bSetColor;

    /// current normal vec
    qlib::Vector4D m_norm;

    /// current drawing mode
    int m_nDrawMode;

    qlib::Vector4D m_prevPos;
    qlib::quint32 m_prevCol;
    qlib::Vector4D m_prevNorm;

    static const int DRAWMODE_NONE = 0;
    static const int DRAWMODE_POINTS = 1;
    static const int DRAWMODE_LINES = 3;
    static const int DRAWMODE_LINESTRIP = 4;
    static const int DRAWMODE_TRIGS = 5;
    static const int DRAWMODE_TRIGSTRIP = 6;
    static const int DRAWMODE_TRIGFAN = 7;

    void drawLine(const qlib::Vector4D &v1, qlib::quint32 c1,
                  const qlib::Vector4D &v2, qlib::quint32 c2);

    void addTrigVert(const qlib::Vector4D &v, const qlib::Vector4D &n,
                     qlib::quint32 c);

    // Create DrawObj2 objects lazily (requires active OpenGL context)
    void createLineObj(DisplayContext *pdc);
    void createTrigObj(DisplayContext *pdc);
    void createTrigMeshObj(DisplayContext *pdc);

    void convertToMesh();

    ///////////////////////////////
    // higher-order objects

    int m_nDetail;

    using CylList = gfx::CylinderList<qlib::Vector4D, qlib::Matrix4D,
                                      gfx::GrowMesh<qlib::quint32>>;
    CylList m_cylinders;

    using SphList = gfx::SphereList<qlib::Vector4D, qlib::Matrix4D,
                                    gfx::GrowMesh<qlib::quint32>>;
    SphList m_spheres;

public:
    DisplayList();
    virtual ~DisplayList();

    virtual bool setCurrent()
    {
        return true;
    }
    virtual bool isCurrent() const
    {
        return true;
    }
    virtual bool isFile() const
    {
        return false;
    }

    virtual void vertex(const qlib::Vector4D &);
    virtual void normal(const qlib::Vector4D &);
    virtual void color(const gfx::ColorPtr &c);

    virtual void startPoints();
    virtual void startLines();
    virtual void startLineStrip();
    virtual void startTriangles();
    virtual void startTriangleStrip();
    virtual void startTriangleFan();
    virtual void end();

    virtual void setPolygonMode(int id);
    virtual void startPolygon();
    virtual void startQuadStrip() {}
    virtual void startQuads() {}

    ///////////////////////////////
    // higher-order objects

    virtual void sphere();

    virtual void cone(double r1, double r2,
                      const qlib::Vector4D &pos1, const qlib::Vector4D &pos2,
                      bool bCap);

    virtual void setDetail(int n);
    virtual int getDetail() const;

    virtual void drawMesh(const gfx::Mesh &mesh);

    ///////////////////////////////
    // Display list

    virtual gfx::DisplayContext *createDisplayList()
    {
        return nullptr;
    }
    virtual bool canCreateDL() const
    {
        return false;
    }
    virtual bool isValid() const
    {
        return m_fValid;
    }
    virtual bool isDisplayList() const;
    virtual bool recordStart();
    virtual void recordEnd();

    void callDisplayListImpl(gfx::DisplayContext *pdc);
};

}  // namespace gfx
