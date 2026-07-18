// -*-Mode: C++;-*-
//
//  Abstract display context interface
//
//  $Id: DisplayContext.hpp,v 1.25 2011/01/09 15:12:22 rishitani Exp $

#pragma once

#include "gfx.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/LQuat.hpp>
#include "AbstractColor.hpp"

using qlib::LQuat;
using qlib::Matrix4D;
using qlib::Vector4D;

namespace qsys {
class View;
}

namespace gfx {

class Mesh;
class AbstDrawElem;
class AbstDrawAttrs;
class DrawElem;
class AbstractColor;
class PixelBuffer;
class PixRep;
class VBORep;
class ShaderObject;
class PixGpuPrim;

class BufTexRep;
class RenderTarget;
class DataTexture;

class GFX_API DisplayContext : public qlib::LObject
{
private:
    LString m_defMatName;
    LString m_styleNames;

    /// Default alpha value
    double m_defAlpha;

    /// Default line width
    double m_lineWidth;

    /// Line stipple
    quint16 m_lineStipple;

    /// lighting
    bool m_bLighting;

    /// Pixel scaling factor
    double m_dPixSclFac;

    /// Edge line type (defined in gfx::DisplayContext)
    int m_nEdgeLineType;

    /// Edge line width
    double m_dEdgeLineWidth;

    /// Edge line color
    ColorPtr m_egLineCol;

    /// Current color
    ColorPtr m_color;

    /// Fog
    bool m_bFogEnabled;
    float m_fFogStart;
    float m_fFogEnd;
    ColorPtr m_fogColor;

    /// Screen-space ambient occlusion (GTAO)
    bool m_bAOEnabled;

    /// Proj mat
    Matrix4D m_projMat;

    /// Viewport (x,y,w,h)
    Vector4D m_viewport;

    /// Model-view matrix stack
    std::deque<qlib::Matrix4D> m_matstack;

    /// Target view
    qsys::View *m_pTargView;

    /// UID of the target view
    qlib::uid_t m_nViewID;

    /// UID of the target scene
    qlib::uid_t m_nSceneID;

protected:
    /// Polygon rendering mode (POLY_FILL/POLY_LINE/...)
    int m_nPolygonMode;

public:
    /// Polygon rendering mode
    enum {
        POLY_POINT,
        POLY_LINE,
        POLY_FILL,
        // filled face without ridge lines
        POLY_FILL_NORGLN,
        POLY_FILL_XX,
    };

    /// Edge line types
    enum {
        ELT_NONE,
        ELT_EDGES,
        ELT_SILHOUETTE,
    };

    /// Vertex attribute types (used as hint for edge rendering)
    enum {
        DVA_NONE,
        DVA_NOEDGE,
    };

public:
    DisplayContext();
    ~DisplayContext() override;

    virtual bool setCurrent() = 0;
    virtual bool isCurrent() const = 0;

    ////////////////

    //
    // Target scene and view
    //
    virtual void setTargetView(qsys::View *);
    virtual qsys::View *getTargetView() const;

    inline qlib::uid_t getViewID() const
    {
        return m_nViewID;
    }
    inline void setViewID(qlib::uid_t uid)
    {
        m_nViewID = uid;
    }
    inline qlib::uid_t getSceneID() const
    {
        return m_nSceneID;
    }
    inline void setSceneID(qlib::uid_t uid)
    {
        m_nSceneID = uid;
    }

    /// Returns whether the rendering target of this context is a file or not.
    virtual bool isFile() const = 0;

    /// Returns whether this context can render pixmap or not.
    virtual bool isRenderPixmap() const;

    /// Returns whether this context support VA/VBO (DrawElem()) method
    virtual bool isDrawElemSupported() const;

    ////////////////

    /// Set current vertex vector by Vector4D
    virtual void vertex(const Vector4D &vec) = 0;

    /// Set current normal vector by Vector4D
    virtual void normal(const Vector4D &vec) = 0;

    /// Set current color
    virtual void color(const ColorPtr &c);

    /// Get curent color
    ColorPtr getColor() const
    {
        return m_color;
    }

    /// Set current vertex attribute
    virtual void attribute(int n);

    ////////////////

    virtual void setMaterial(const LString &name);
    virtual void setAlpha(double a);
    virtual void setStyleNames(const LString &names);

    /// Set edge (silhouette) line props
    virtual int getEdgeLineType() const;
    virtual void setEdgeLineType(int n);

    /// Get the current polygon rendering mode (POLY_FILL/POLY_LINE/...)
    int getPolygonMode() const
    {
        return m_nPolygonMode;
    }

    virtual double getEdgeLineWidth() const;
    virtual void setEdgeLineWidth(double w);

    virtual ColorPtr getEdgeLineColor() const;
    virtual void setEdgeLineColor(const ColorPtr &c);

    // Fog
    virtual void enableFog(bool b);
    bool isFogEnabled() const
    {
        return m_bFogEnabled;
    }
    virtual void setFogStart(float val);
    float getFogStart() const
    {
        return m_fFogStart;
    }
    virtual void setFogEnd(float val);
    float getFogEnd() const
    {
        return m_fFogEnd;
    }
    virtual void setFogColor(const ColorPtr &val);
    ColorPtr getFogColor() const
    {
        return m_fogColor;
    }

    // Screen-space ambient occlusion (GTAO)
    virtual void enableAO(bool b);
    bool isAOEnabled() const
    {
        return m_bAOEnabled;
    }

    LString getMaterial() const
    {
        return m_defMatName;
    }
    double getAlpha() const
    {
        return m_defAlpha;
    }
    LString getStyleNames() const
    {
        return m_styleNames;
    }

    ////////////////
    // Model-view matrix

    virtual void pushMatrix();
    virtual void popMatrix();
    virtual void multMatrix(const Matrix4D &mat);
    virtual void loadMatrix(const Matrix4D &mat);

    void rotate(const LQuat &q)
    {
        multMatrix(q.toRotMatrix());
    }
    void scale(const Vector4D &v)
    {
        multMatrix(Matrix4D::makeScaleMat(v));
    }
    void translate(const Vector4D &v)
    {
        multMatrix(Matrix4D::makeTransMat(v));
    }
    void loadIdent()
    {
        loadMatrix(Matrix4D());
    }

    void clearMatStack()
    {
        m_matstack.clear();
        m_matstack.push_front(Matrix4D());
    }

    const Matrix4D &getModelViewMat() const
    {
        if (m_matstack.empty()) {
            MB_THROW(qlib::RuntimeException,
                     "DisplayContext::getModelViewMat(): matrix stack underflow");
            // return Matrix4D();
        } else {
            return m_matstack.front();
        }
    }

    void xform_vec(Vector4D &v) const
    {
        const Matrix4D &mtop = getModelViewMat();
        v.w() = 1.0;
        mtop.xform4D(v);
    }

    void xform_norm(Vector4D &v) const
    {
        const Matrix4D &mtop = getModelViewMat();
        v.w() = 0.0;
        mtop.xform4D(v);
    }

    // Projection matrix
    virtual void setProjMat(const Matrix4D &mat);

    Matrix4D getProjMat() const
    {
        return m_projMat;
    }

    // Viewport (in device pixel unit)
    virtual void setViewport(const Vector4D &vp);

    Vector4D getViewport() const
    {
        return m_viewport;
    }

    virtual void enableDepthTest(bool) {}

    /// Enable or disable the depth test itself (GL_DEPTH_TEST). Distinct from
    /// enableDepthTest(), which toggles only the depth write mask in the
    /// OpenGL backend. Used by fullscreen post-processing passes (AO composite)
    /// that must not be depth-rejected. Default is a no-op.
    virtual void setDepthTestEnabled(bool) {}

    virtual void setCullFace(bool f = true) {}
    virtual void setInvertColorBlend(bool bInv) {}

    /// Enable or disable color blending (GL_BLEND). Blending is enabled globally
    /// for the scene color pass, but data-only fullscreen passes that write
    /// non-premultiplied values (e.g. SMAA edges/weights, whose alpha carries
    /// data or is 0) must run with blending off or their output is discarded.
    /// Default is a no-op.
    virtual void setBlendEnabled(bool) {}

    /// Select the blend function: additive (GL_ONE, GL_ONE) when add is true,
    /// otherwise the default over-blend (GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA).
    /// Used by temporal-jitter accumulation. Caller must restore the default
    /// before normal (UI/overlay) drawing. Default is a no-op.
    virtual void setBlendModeAdd(bool) {}

    ////////////////
    // Geometry construction

    /// Set current vertex vector by x,y,z (calls vector version)
    virtual void vertex(double x, double y, double z);

    /// Set current normal vector by x,y,z (calls vector version)
    virtual void normal(double x, double y, double z);

    /// Set solid color
    virtual void color(double r, double g, double b);
    virtual void color(double r, double g, double b, double a);

    ////////////////

    virtual void setLineWidth(double lw);
    double getLineWidth() const
    {
        return m_lineWidth;
    }

    virtual void setLineStipple(unsigned short pattern);
    unsigned short getLineStipple() const
    {
        return m_lineStipple;
    }

    virtual void setLighting(bool f = true);
    bool isLighting() const
    {
        return m_bLighting;
    }

    virtual void setPointSize(double size);

    ////////////////
    // metadata operations

    virtual void startHit(qlib::uid_t rend_uid);
    virtual void endHit();

    virtual void loadName(int nameid);
    virtual void pushName(int nameid);
    virtual void popName();
    virtual void drawPointHit(int nid, const Vector4D &pos);

    virtual void startRender();
    virtual void endRender();
    virtual void startSection(const LString &section_name);
    virtual void endSection();

    virtual void startEdgeSection();
    virtual void endEdgeSection();

    /// Release GPU-side resources owned by this context.
    /// Must be called before the OpenGL context is destroyed (i.e., from View::unloading()).
    virtual void cleanup();

    ////////////////
    // image/text drawing (default: do nothing)

    virtual void drawString(const Vector4D &pos, const qlib::LString &str);
    virtual void drawPixels(const Vector4D &pos, const PixelBuffer &data,
                            const ColorPtr &col);

    // get logical to device pixel scaling factor
    // default returns 1.0 (no scaling)
    void setPixSclFac(double f)
    {
        m_dPixSclFac = f;
    }
    inline double getPixSclFac() const
    {
        return m_dPixSclFac;
    }

    ////////////////
    // line and triangle primitives

    virtual void setPolygonMode(int id) = 0;
    virtual void startPoints() = 0;
    virtual void startPolygon() = 0;
    virtual void startLines() = 0;
    virtual void startLineStrip() = 0;
    virtual void startTriangles() = 0;
    virtual void startTriangleStrip() = 0;
    virtual void startTriangleFan() = 0;
    virtual void startQuadStrip() = 0;
    virtual void startQuads() = 0;
    virtual void end() = 0;

    ///////////////////////////////
    // higher-order objects

    /// Display unit sphere
    virtual void sphere();

    /// Display sphere with radius of r at position vec
    virtual void sphere(double r, const Vector4D &vec);

    /// Display cylinder (capping is dependent on the implementation)
    virtual void cylinder(double r, const Vector4D &pos1, const Vector4D &pos2);

    /// Display cylinder (capping is always created)
    virtual void cylinderCap(double r, const Vector4D &pos1, const Vector4D &pos2);

    virtual void cone(double r1, double r2, const Vector4D &pos1, const Vector4D &pos2,
                      bool bCap);

    virtual void setDetail(int n);
    virtual int getDetail() const;

    // texture (default: not supported)
    // virtual void useTexture(const LTexture &) {}
    // virtual void unuseTexture() {}
    // virtual void texCoord(double u, double v) {}
    // virtual LTexture createTexture() { return LTexture(); }

    /// Mesh drawing
    virtual void drawMesh(const Mesh &);

    /// Drawing element support (vertex array version)
    virtual void drawElem(const AbstDrawElem &);

    ///////////////////////////////
    // Display List support

    /// Create new display list.
    /// returns NULL if display list is not supported.
    virtual DisplayContext *createDisplayList();

    virtual bool canCreateDL() const;

    /// Call display list.
    /// "pdl" should be a display list supported by this context.
    virtual void callDisplayList(DisplayContext *pdl);

    virtual bool isCompatibleDL(DisplayContext *pdl) const;

    virtual bool isDisplayList() const;

    virtual bool recordStart();
    virtual void recordEnd();

    ////////////////////////////////////////////////////
    // convenience methods

    inline void drawAster(const Vector4D &pos, double rad)
    {
        const Vector4D xdel(rad, 0, 0);
        const Vector4D ydel(0, rad, 0);
        const Vector4D zdel(0, 0, rad);

        vertex(pos - xdel);
        vertex(pos + xdel);
        vertex(pos - ydel);
        vertex(pos + ydel);
        vertex(pos - zdel);
        vertex(pos + zdel);
    }

    void getDevRGBColor(const ColorPtr &pcol, float &r, float &g, float &b);
    void getDevRGBAColor(const ColorPtr &pcol, float &r, float &g, float &b, float &a);

    static Matrix4D makeOrthoProjMat(float left, float right, float bottom, float top,
                                     float slabnear, float slabfar);
    static Matrix4D makeOrthoProjMat(float vw, float fasp, float slabnear, float slabfar) {
        return makeOrthoProjMat(-vw*fasp, vw*fasp, -vw, vw, slabnear, slabfar);
    }

    static Matrix4D makePersProjMat(float width, float fasp, float near, float far,
                                    float distance);

    ////

    /// Clear the target buffer with the specified color.
    virtual void clearBuffer(const gfx::ColorPtr &pcol) {}

    ///////////////////////////////
    // Shader object support

    /// Load (or retrieve cached) shader object. Default returns nullptr.
    virtual ShaderObject *loadShaderObject(const LString &name, const LString &vert_path,
                                           const LString &frag_path);

    /// Create a new shader object (backend-specific compilation). Default returns nullptr.
    virtual ShaderObject *createShaderObject(const LString &name, const LString &vert_path,
                                             const LString &frag_path);

    /// Set front face winding order. Default is a no-op.
    virtual void setFrontFace(bool bCCW = true) {}

    ///////////////////////////////
    // Buffer texture support

    /// Create a backend-specific BufTexRep. Returns nullptr if not supported.
    virtual BufTexRep *createBufTexRep();

    /// Create a backend-specific VBORep for the given draw attributes.
    /// Returns nullptr if this context does not support drawElem.
    virtual VBORep *createVBORep(const AbstDrawAttrs &ada);

    /// Create a backend-specific PixRep for the given pixel buffer.
    /// Returns nullptr if this context does not support drawPixels.
    virtual PixRep *createPixRep(const PixelBuffer &pixbuf);

    ///////////////////////////////
    // Off-screen render target (FBO) support

    /// Create a backend-specific off-screen render target of the given size
    /// and attachment flags (see gfx::RTFlags). Returns nullptr if this
    /// context does not support off-screen rendering (default).
    virtual RenderTarget *createRenderTarget(int w, int h, int flags)
    {
        return nullptr;
    }

    /// Create a backend-specific immutable data texture from CPU bytes.
    /// ncomp: 1 = R8, 2 = RG8. linear selects LINEAR vs NEAREST filtering.
    /// Returns nullptr if unsupported (default).
    virtual DataTexture *createDataTexture(int w, int h, int ncomp, bool linear,
                                           const void *data)
    {
        return nullptr;
    }

    /// Create a data texture from a raw byte file (resolved like shader paths,
    /// e.g. "%%CONFDIR%%/data/textures/foo.dat"). The file must hold exactly
    /// w*h*ncomp bytes. Returns nullptr if unsupported or on read failure.
    virtual DataTexture *createDataTextureFromFile(const LString &path, int w, int h,
                                                   int ncomp, bool linear)
    {
        return nullptr;
    }

    /// Make the given render target the current draw target. Passing nullptr
    /// restores the default framebuffer. Default is a no-op.
    virtual void bindRenderTarget(RenderTarget *prt) {}

    /// Restore the default framebuffer as the draw target. Default no-op.
    virtual void bindDefaultFramebuffer() {}

    ///////////////////////////////
    // Buffer allocation

    /// Allocate CPU-side storage for the given draw attributes.
    /// Pure memory allocation; does NOT read attribute layout.
    /// Default impl allocates owning C++ heap storage via
    /// allocOwnedData / allocOwnedIndData on the attrs object.
    /// Backend overrides (e.g. WebGL) may allocate V8-cage memory and
    /// attach it via setDataRef / setIndDataRef so renderer-side writes
    /// land directly in V8 ArrayBuffer backing storage (no memcpy).
    /// nind == 0 means no index buffer.
    virtual void allocBuffer(AbstDrawAttrs &ada, int nvert, int nind);

protected:
    PixGpuPrim *m_pPixGpuPrim = nullptr;
};

}  // namespace gfx
