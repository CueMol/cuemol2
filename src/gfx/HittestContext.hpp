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
  private:
    /// matrix stack impl
    std::deque<Matrix4D> m_matstack;

  public:
    AbstHitContext();
    virtual ~AbstHitContext() {}

    virtual bool setCurrent() { return true; }
    virtual bool isCurrent() { return true; }
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

    virtual void pushMatrix()
    {
      if (m_matstack.size()<=0)
        m_matstack.push_front(Matrix4D());
      else
        m_matstack.push_front(m_matstack.front());
    }

    virtual void popMatrix()
    {
      if (m_matstack.size()<=1) {
        LString msg("Hittest> FATAL ERROR: cannot popMatrix()!!");
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::RuntimeException, msg);
        return;
      }
      m_matstack.pop_front();
    }

    virtual void multMatrix(const Matrix4D &mat)
    {
      Matrix4D top = m_matstack.front();
      top.matprod(mat);
      m_matstack.front() = top;
    }

    virtual void loadMatrix(const Matrix4D &mat) {
      m_matstack.front() = mat;
    }

    ////////////////
    // metadata operations
    
    virtual void startHit(qlib::uid_t rend_uid);
    virtual void endHit();

    virtual void startRender();
    virtual void endRender();
    virtual void startSection(const LString &section_name);
    virtual void endSection();

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

  
  class GFX_API HittestList : public AbstHitContext
  {
  private:

    struct HitElem {
      Vector3F pos;
      int m_nRendID;
      int m_nAtomID;
    }

    std::deque<HitElem> m_data;

    /// name stack impl
    std::deque<int> m_names;

  public:
    HittestList();
    virtual ~HittestList() {}

    //
    // Hittest methods
    //

    virtual void loadName(int nameid) {
      m_names.front() = nameid;
    }

    virtual void pushName(int nameid) {
      m_names.push_front(nameid);
    }

    virtual void popName() {
      if (m_names.size()<=1) {
        LString msg("HittestList> FATAL ERROR: cannot popName()!!");
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::RuntimeException, msg);
        return;
      }
      m_names.pop_front();
    }

    virtual void drawPointHit(int nid, const Vector4D &pos) {
    }

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

    // virtual bool recordStart();
    // virtual void recordEnd();

  };
  ///////////////////////////////////////

  
  class GFX_API HittestContext : public AbstHitContext
  {
  private:

  public:
    HittestContext();
    virtual ~HittestContext() {}

    ///////////////////////
    // Display List support
  
    virtual DisplayContext *createDisplayList() {
      return MB_NEW HittestList();
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

    // virtual bool recordStart();
    // virtual void recordEnd();

  };

  
}

#endif
