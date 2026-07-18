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
    ~AbstHitContext() override {}

    bool setCurrent() override { return true; }
    bool isCurrent() const override { return true; }
    qsys::View *getTargetView() const override { return NULL; }

    /// Returns whether the rendering target of this context is a file or not.
    bool isFile() const override { return false; }

    /// Returns whether this context can render pixmap or not.
    bool isRenderPixmap() const override { return false; }

    /// Returns whether this context support VA/VBO (DrawElem()) method
    bool isDrawElemSupported() const override { return false; }

    ////////////////

    /// Set current vertex vector by Vector4D
    void vertex(const Vector4D &vec) override {}

    /// Set current normal vector by Vector4D
    void normal(const Vector4D &vec) override {}

    /// Set current color
    void color(const ColorPtr &c) override {}

    ////////////////
    // line and triangle primitives
    
    void setPolygonMode(int id) override {}
    void startPoints() override {}
    void startPolygon() override {}
    void startLines() override {}
    void startLineStrip() override {}
    void startTriangles() override {}
    void startTriangleStrip() override {}
    void startTriangleFan() override {}
    void startQuadStrip() override {}
    void startQuads() override {}
    void end() override {}

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
    ~HittestList() override;

    //
    // Hittest methods
    //

    void drawPointHit(int nid, const Vector4D &pos) override;

    //
    // Display List support
    //
  
    DisplayContext *createDisplayList() override {
      return NULL;
    }

    bool canCreateDL() const override { return true; }

    void callDisplayList(DisplayContext *pdl) override {
    }
    
    bool isCompatibleDL(DisplayContext *pdl) const override {
      if (dynamic_cast<HittestList *>(pdl)!=NULL)
        return true;
      else
        return false;
    }
    
    bool isDisplayList() const override { return false; }

    void dump() const {
      MB_DPRINTLN("HittestList %p size=%d", this, (int)m_data.size());
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
    // std::deque<Matrix4D> m_matstack;

  public:
    HittestContext() : m_nCurUID(qlib::invalid_uid) { pushMatrix(); pushName(-1);}
    ~HittestContext() override {}

    ///////////////////////
    // Matrix stack support

    // virtual void pushMatrix();
    // virtual void popMatrix();
    // virtual void multMatrix(const Matrix4D &mat);
    // virtual void loadMatrix(const Matrix4D &mat);
    // const Matrix4D &topMatrix() const;

    Matrix4D m_projMat;

    ///////////////////////
    // Hittest start/end

    void startHit(qlib::uid_t rend_uid) override {
      m_nCurUID = rend_uid;
    }

    void endHit() override {
      m_nCurUID = qlib::invalid_uid;
    }

    void loadName(int nameid) override;

    void pushName(int nameid) override;

    void popName() override;

    ///////////////////////
    // Display List support
  
    DisplayContext *createDisplayList() override {
      return MB_NEW HittestList();
    }

    bool canCreateDL() const override { return true; }

    void callDisplayList(DisplayContext *pdl) override;
    
    bool isCompatibleDL(DisplayContext *pdl) const override {
      if (dynamic_cast<HittestList *>(pdl)!=NULL)
        return true;
      else
        return false;
    }
    
    bool isDisplayList() const override { return false; }

    // virtual bool recordStart();
    // virtual void recordEnd();

    void dump() const {
      MB_DPRINTLN("HitContext %p size=%d", this, (int)m_data.size());
      /*BOOST_FOREACH (HittestList *phl, m_data) {
	phl->dump();
	}*/
    }
  };

  
}

#endif
