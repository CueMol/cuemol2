// -*-Mode: C++;-*-
//
//  Hittest context using CPU
//

#ifndef GFX_HITTEST_CONTEXT_HPP_
#define GFX_HITTEST_CONTEXT_HPP_

#include "gfx.hpp"

//#include <qlib/Vector3F.hpp>

#include "DisplayContext.hpp"

namespace gfx {

  //using qlib::Vector3F;

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

    ////////////////
    // metadata operations
    /*    
    virtual void startRender();
    virtual void endRender();
    virtual void startSection(const LString &section_name);
    virtual void endSection();
    */

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

  
  class GFX_API HittestList : public AbstHitContext
  {
  public:
    typedef std::vector<int> NameList;

    struct HitElem {
      Vector4D pos;
      NameList names;
    };

    std::deque<HitElem> m_data;

    /// name stack impl
    std::deque<int> m_names;

  public:
    HittestList() {}
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
      m_data.push_back(HitElem());
      HitElem &he = m_data.back();
      /*
      Vector4D v = pos;
      v.w() = 1.0;
      topMatrix().xform4D(v);
      he.pos = v;
      */
      he.pos = pos;
      he.pos.w() = 1.0;
      int nnm = m_names.size()+1;
      he.names.resize(nnm);
      if (!m_names.empty())
	std::copy(m_names.begin(), m_names.end(), he.names.begin());
      he.names[nnm-1] = nid;
      //MB_DPRINTLN("names size=%d, nid=%d %d", he.names.size(), nid, he.names[nnm-1]);
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

    void dump() const {
      MB_DPRINTLN("HittestList %p size=%d", this, m_data.size());
    }

  };
  ///////////////////////////////////////

  
  class GFX_API HittestContext : public AbstHitContext
  {
  private:
    std::deque<HittestList *> m_data;

    qlib::uid_t m_nCurUID;

    /// matrix stack impl
    std::deque<Matrix4D> m_matstack;

  public:
    HittestContext() : m_nCurUID(qlib::invalid_uid) { pushMatrix(); }
    virtual ~HittestContext() {}

    ///////////////////////
    // Matrix stack support

    virtual void pushMatrix()
    {
      MB_DPRINTLN("Hit(%p) pushMat %d", this, m_matstack.size());
      if (m_matstack.size()<=0)
        m_matstack.push_front(Matrix4D());
      else
        m_matstack.push_front(m_matstack.front());
    }

    virtual void popMatrix()
    {
      MB_DPRINTLN("Hit(%p) popMat %d", this, m_matstack.size());
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

    const Matrix4D &topMatrix() const {
      if (m_matstack.size()<1) {
        LString msg("Hittest> FATAL ERROR: cannot topMatrix()!!");
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::RuntimeException, msg);
      }
      return m_matstack.front();
    }

    /*
    double m_slabdepth;
    double m_zoom;
    double m_dist;
    int m_width;
    int m_height;

    double m_pickx;
    double m_picky;
    double m_deltax;
    double m_deltay;
    */

    Matrix4D m_projMat;

    ///////////////////////
    // Hittest start/end

    virtual void startHit(qlib::uid_t rend_uid) {
      m_nCurUID = rend_uid;
    }

    virtual void endHit() {
      m_nCurUID = qlib::invalid_uid;
    }

    ///////////////////////
    // Display List support
  
    virtual DisplayContext *createDisplayList() {
      return MB_NEW HittestList();
    }

    virtual bool canCreateDL() const { return true; }

    virtual void callDisplayList(DisplayContext *pdl)
    {
      HittestList *phl = dynamic_cast<HittestList *>(pdl);
      if (phl==NULL)
	return;

      // m_data.push_back(phl);

      topMatrix().dump();

      BOOST_FOREACH (const HittestList::HitElem &elem, phl->m_data) {
	Vector4D vv = topMatrix().mulvec(elem.pos);
	vv = m_projMat.mulvec(vv);
	if (vv.x()>-1.0 && vv.x()<1.0 &&
	    vv.y()>-1.0 && vv.y()<1.0 &&
	    vv.z()>-1.0 && vv.z()<1.0) {
	  //MB_DPRINTLN("(%f,%f,%f)->(%f,%f,%f)",
	  //elem.pos.x(), elem.pos.y(), elem.pos.z(),
	  //vv.x(), vv.y(), vv.z());

	  MB_DPRINT("[%d ", m_nCurUID);
	  BOOST_FOREACH (int i, elem.names) {
	    MB_DPRINT("%d ", i);
	  }
	  MB_DPRINTLN("] (%f,%f,%f)",
		      elem.pos.x(), elem.pos.y(), elem.pos.z());
		      
	}
      }
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

    void dump() const {
      MB_DPRINTLN("HitContext %p size=%d", this, m_data.size());
      BOOST_FOREACH (HittestList *phl, m_data) {
	phl->dump();
      }
    }
  };

  
}

#endif
