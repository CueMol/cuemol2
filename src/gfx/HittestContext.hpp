// -*-Mode: C++;-*-
//
//  Hittest context using CPU
//

#ifndef GFX_HITTEST_CONTEXT_HPP_
#define GFX_HITTEST_CONTEXT_HPP_

#include "gfx.hpp"

#include "DisplayContext.hpp"

namespace gfx {

  class GFX_API AbstHitContext : public DisplayContext
  {
  public:
    AbstHitContext() {}
    virtual ~AbstHitContext() {}

    virtual bool setCurrent() { return true; }
    virtual bool isCurrent() const { return true; }
    virtual qsys::View *getTargetView() const { return NULL; }

    /// Returns whether the rendering target of this context is a file or not.
    virtual bool isFile() const { return false; }

    /// Returns whether this context can render pixmap or not.
    virtual bool isRenderPixmap() const { return false; }

    /// Returns whether this context support VA/VBO (DrawElem()) method
    virtual bool isDrawElemSupported() const { return false; }

    ////////////////

    /// Set current vertex vector by Vector4D
    virtual void vertex(const Vector4D &vec) {}

    /// Set current normal vector by Vector4D
    virtual void normal(const Vector4D &vec) {}

    /// Set current color
    virtual void color(const ColorPtr &c) {}

    ////////////////

    ///////////////////////
    // Matrix stack support

    virtual void pushMatrix() {}
    virtual void popMatrix() {}
    virtual void multMatrix(const Matrix4D &mat) {}
    virtual void loadMatrix(const Matrix4D &mat) {}

    ////////////////
    // line and triangle primitives
    
    virtual void setPolygonMode(int id) {}
    virtual void startPoints() {}
    virtual void startPolygon() {}
    virtual void startLines() {}
    virtual void startLineStrip() {}
    virtual void startTriangles() {}
    virtual void startTriangleStrip() {}
    virtual void startTriangleFan() {}
    virtual void startQuadStrip() {}
    virtual void startQuads() {}
    virtual void end() {}

  };


  ///////////////////////////////////////

  ///
  /// Drawing container for the hittest data
  ///
  class GFX_API HittestList : public AbstHitContext
  {
  public:
    struct HitElem {
      Vector4D pos;
      int id;
    };

    std::deque<HitElem> m_data;

  public:
    HittestList() {}
    virtual ~HittestList();

    //
    // Hittest methods
    //

    virtual void drawPointHit(int nid, const Vector4D &pos);

    //
    // Display List support
    //
  
    virtual DisplayContext *createDisplayList() {
      return NULL;
    }

    virtual bool canCreateDL() const { return true; }

    virtual void callDisplayList(DisplayContext *pdl) {
    }
    
    virtual bool isCompatibleDL(DisplayContext *pdl) const {
      if (dynamic_cast<HittestList *>(pdl)!=NULL)
        return true;
      else
        return false;
    }
    
    virtual bool isDisplayList() const { return false; }

    void dump() const {
      MB_DPRINTLN("HittestList %p size=%d", this, m_data.size());
    }

  };
  ///////////////////////////////////////

  
  class GFX_API HittestContext : public AbstHitContext
  {
  public:
    typedef std::vector<int> NameList;

    /// name stack impl
    std::deque<int> m_names;

    struct DataElem {
      float z;
      qlib::uid_t rendid;
      NameList names;
    };
    std::deque<DataElem> m_data;

    qlib::uid_t m_nCurUID;

    /// matrix stack impl
    std::deque<Matrix4D> m_matstack;

  public:
    HittestContext() : m_nCurUID(qlib::invalid_uid) { pushMatrix(); pushName(-1);}
    virtual ~HittestContext() {}

    ///////////////////////
    // Matrix stack support

    virtual void pushMatrix();

    virtual void popMatrix();

    virtual void multMatrix(const Matrix4D &mat);

    virtual void loadMatrix(const Matrix4D &mat);

    const Matrix4D &topMatrix() const;

    Matrix4D m_projMat;

    ///////////////////////
    // Hittest start/end

    virtual void startHit(qlib::uid_t rend_uid) {
      m_nCurUID = rend_uid;
    }

    virtual void endHit() {
      m_nCurUID = qlib::invalid_uid;
    }

    virtual void loadName(int nameid);

    virtual void pushName(int nameid);

    virtual void popName();

    ///////////////////////
    // Display List support
  
    virtual DisplayContext *createDisplayList() {
      return MB_NEW HittestList();
    }

    virtual bool canCreateDL() const { return true; }

    virtual void callDisplayList(DisplayContext *pdl);
    
    virtual bool isCompatibleDL(DisplayContext *pdl) const {
      if (dynamic_cast<HittestList *>(pdl)!=NULL)
        return true;
      else
        return false;
    }
    
    virtual bool isDisplayList() const { return false; }

    // virtual bool recordStart();
    // virtual void recordEnd();

    void dump() const {
      MB_DPRINTLN("HitContext %p size=%d", this, m_data.size());
      /*BOOST_FOREACH (HittestList *phl, m_data) {
	phl->dump();
	}*/
    }
  };

  
}

#endif
