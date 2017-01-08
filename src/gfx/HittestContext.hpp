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
    struct HitElem {
      Vector4D pos;
      int id;
    };

    std::deque<HitElem> m_data;

  public:
    HittestList() {}
    virtual ~HittestList() {}

    //
    // Hittest methods
    //

    virtual void drawPointHit(int nid, const Vector4D &pos) {
      m_data.push_back(HitElem());
      HitElem &he = m_data.back();
      he.pos = pos;
      he.pos.w() = 1.0;
      he.id = nid;
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

    Matrix4D m_projMat;

    ///////////////////////
    // Hittest start/end

    virtual void startHit(qlib::uid_t rend_uid) {
      m_nCurUID = rend_uid;
    }

    virtual void endHit() {
      m_nCurUID = qlib::invalid_uid;
    }

    virtual void loadName(int nameid) {
      MB_DPRINTLN("HitCtxt> load name %d", nameid);
      m_names.front() = nameid;
    }

    virtual void pushName(int nameid) {
      MB_DPRINTLN("HitCtxt> push name %d", nameid);
      m_names.push_front(nameid);
    }

    virtual void popName() {
      MB_DPRINTLN("HitCtxt> pop name");
      if (m_names.size()<=1) {
        LString msg("HittestList> FATAL ERROR: cannot popName()!!");
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::RuntimeException, msg);
        return;
      }
      m_names.pop_front();
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

          MB_DPRINT("[%d %d]", m_nCurUID, elem.id);
          MB_DPRINTLN(" (%f,%f,%f)",
                      elem.pos.x(), elem.pos.y(), elem.pos.z());
		      
	  m_data.push_back(DataElem());
	  DataElem &he = m_data.back();
	  he.z = vv.z();
	  he.rendid = m_nCurUID;
          he.names.resize(m_names.size()+1-1);
          int j;
          for (j=1; j<m_names.size(); ++j)
            he.names[j-1] = m_names[j];
          he.names[j-1] = elem.id;
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
      /*BOOST_FOREACH (HittestList *phl, m_data) {
	phl->dump();
	}*/
    }
  };

  
}

#endif
