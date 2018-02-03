// -*-Mode: C++;-*-
//
//  OpenGL VBO implementation
//

#ifndef GFX_OGL_DRAWELEMS_HPP_
#define GFX_OGL_DRAWELEMS_HPP_

#include "sysdep.hpp"

#include <gfx/DrawAttrArray.hpp>

#ifndef CHK_GLERROR
#define CHK_GLERROR(MSG)\
{ \
  GLenum errc; \
  errc = glGetError(); \
  if (errc!=GL_NO_ERROR) \
    MB_DPRINTLN("%s GLError(%d): %s", MSG, errc, gluErrorString(errc)); \
  else \
    MB_DPRINTLN("%s : OK", MSG); \
}
#endif


namespace sysdep {
  using namespace gfx;

  GLenum convDrawMode(int nMode) {
    GLenum mode;
    switch (nMode) {
    case DrawElem::DRAW_POINTS:
      mode = GL_POINTS;
      break;
    case DrawElem::DRAW_LINE_STRIP:
      mode = GL_LINE_STRIP;
      break;
    case DrawElem::DRAW_LINE_LOOP:
      mode = GL_LINE_LOOP;
      break;
    case DrawElem::DRAW_LINES:
      mode = GL_LINES;
      break;
    case DrawElem::DRAW_TRIANGLE_STRIP:
      mode = GL_TRIANGLE_STRIP;
      break;
    case DrawElem::DRAW_TRIANGLE_FAN:
      mode = GL_TRIANGLE_FAN;
      break;
    case DrawElem::DRAW_TRIANGLES:
      mode = GL_TRIANGLES;
      break;
    case DrawElem::DRAW_QUAD_STRIP:
      mode = GL_QUAD_STRIP;
      break;
    case DrawElem::DRAW_QUADS:
      mode = GL_QUADS;
      break;
    case DrawElem::DRAW_POLYGON:
      mode = GL_POLYGON;
      break;
    default: {
      LString msg = "Ogl DrawElem: invalid draw mode";
      LOG_DPRINTLN(msg);
      MB_THROW(qlib::RuntimeException, msg);
    }
    }
    return mode;
  }

  int convGLConsts(int id)
  {
    switch (id) {
    case qlib::type_consts::QTC_BOOL:
      return GL_BOOL;
    case qlib::type_consts::QTC_UINT8:
      return GL_UNSIGNED_BYTE;
    case qlib::type_consts::QTC_UINT16:
      return GL_UNSIGNED_SHORT;
    case qlib::type_consts::QTC_UINT32:
      return GL_UNSIGNED_INT;
    case qlib::type_consts::QTC_INT8:
      return GL_BYTE;
    case qlib::type_consts::QTC_INT16:
      return GL_SHORT;
    case qlib::type_consts::QTC_INT32:
      return GL_INT;
  case qlib::type_consts::QTC_FLOAT32:
      return GL_FLOAT;
    case qlib::type_consts::QTC_FLOAT64:
      return GL_DOUBLE;
    default:
      return -1;
    }
  }

  int convGLNorm(int id)
  {
    if (id==qlib::type_consts::QTC_FLOAT32 ||
        id==qlib::type_consts::QTC_FLOAT64)
      return GL_FALSE;
    else
      return GL_TRUE;
  }
  
  /////////////////////////////////////////////////

  /// OpenGL generic object class implementation
  class OglBufRepBase
  {
  protected:
    /// Scene ID to which this buffer object belongs
    qlib::uid_t m_nSceneID;

    /// Buffer ID
    GLuint m_nBufID;

  public:
    OglBufRepBase(qlib::uid_t nSceneID) : m_nSceneID(nSceneID), m_nBufID(0) {}

    bool setContext()
    {
      qsys::ScenePtr rsc = qsys::SceneManager::getSceneS(m_nSceneID);
      if (rsc.isnull()) {
        MB_DPRINTLN("OglVBO> unknown scene, VBO %d cannot be deleted", m_nBufID);
        return false;
      }

      qsys::Scene::ViewIter viter = rsc->beginView();
      if (viter==rsc->endView()) {
        MB_DPRINTLN("OglVBO> no view, VBO %d cannot be deleted", m_nBufID);
        return false;
      }

      qsys::ViewPtr rvw = viter->second;
      if (rvw.isnull()) {
        // If any views aren't found, it is no problem,
        // because the parent context (and also all DLs) may be already destructed.
        return false;
      }
      gfx::DisplayContext *pctxt = rvw->getDisplayContext();
      pctxt->setCurrent();
      return true;
    }

    inline GLuint getID() const { return m_nBufID; }

    inline bool isCreated() const {
      if (m_nBufID==0) return false;
      else return true;
    }

  };

  /// OpenGL buffer object class implementation
  class OglBufRep : public OglBufRepBase
  {
  public:
    OglBufRep(qlib::uid_t nSceneID) : OglBufRepBase(nSceneID) {}
    
    virtual ~OglBufRep()
    {
      if (!setContext())
        return;
      destroy();
    }

    inline void create() {
      glGenBuffers(1, &m_nBufID);
    }

    inline void destroy() {
      glDeleteBuffers(1, &m_nBufID);
      m_nBufID = 0;
    }
  };

  ///////////////////

  /// OpenGL DrawArray impl (for fixed pipeline/without index buffer)
  class OglDrawArrayImpl : public gfx::DrawElemImpl
  {
  public:
    OglBufRep m_buf;
    
    OglDrawArrayImpl(qlib::uid_t nSceneID) : m_buf(nSceneID) {}

    //////////

    virtual void create(const AbstDrawElem &ade)
    {
      if (!m_buf.isCreated())
        m_buf.create();
      
      // Init VBO & transfer data
      glBindBuffer(GL_ARRAY_BUFFER, m_buf.getID());
      glBufferData(GL_ARRAY_BUFFER, ade.getDataSize(), ade.getData(), GL_STATIC_DRAW);

      //glBindBuffer(GL_ARRAY_BUFFER, 0);
    }

    virtual void update(const AbstDrawElem &ade)
    {
      // VBO updated --> call glBufferSubData
      glBindBuffer(GL_ARRAY_BUFFER, m_buf.getID());
      glBufferSubData(GL_ARRAY_BUFFER, 0, ade.getDataSize(), ade.getData());
    }
    
    virtual void preDraw(const AbstDrawElem &ade)
    {
      glBindBuffer(GL_ARRAY_BUFFER, m_buf.getID());

      const int ntype = ade.getType();
      const size_t nesize = ade.getElemSize();
      
      if (ntype==DrawElem::VA_VC) {
        glEnableClientState(GL_VERTEX_ARRAY);
        glEnableClientState(GL_COLOR_ARRAY);
        glVertexPointer(3, GL_FLOAT, nesize, 0);
        glColorPointer(4, GL_UNSIGNED_BYTE, nesize, (const GLvoid *) (3*sizeof(qfloat32)) );
      }
      else if (ntype==DrawElem::VA_V) {
        glEnableClientState(GL_VERTEX_ARRAY);
        glVertexPointer(3, GL_FLOAT, ade.getElemSize(), 0);
      }
      else if (ntype==DrawElem::VA_VNC||
               ntype==DrawElem::VA_VNCI||
               ntype==DrawElem::VA_VNCI32) {
        glEnableClientState(GL_VERTEX_ARRAY);
        glEnableClientState(GL_NORMAL_ARRAY);
        glEnableClientState(GL_COLOR_ARRAY);
        glVertexPointer(3, GL_FLOAT, nesize, 0);
        glNormalPointer(GL_FLOAT, nesize, (const GLvoid *) (3*sizeof(qfloat32)));
        glColorPointer(4, GL_UNSIGNED_BYTE, nesize, (const GLvoid *) (6*sizeof(qfloat32)));
      }
    }

    virtual void draw(const AbstDrawElem &ade)
    {
      GLenum mode = convDrawMode(ade.getDrawMode());

      glDrawArrays(mode, 0, ade.getSize());
    }
    
    virtual void postDraw(const AbstDrawElem &ade)
    {
      glDisableClientState(GL_VERTEX_ARRAY);
      glDisableClientState(GL_NORMAL_ARRAY);
      glDisableClientState(GL_COLOR_ARRAY);
      glBindBuffer(GL_ARRAY_BUFFER, 0);
    }
    
  };

  ////////////////////////////

  /// OpenGL DrawElements impl (for fixed pipeline/with index buffer)
  class OglDrawElemImpl : public OglDrawArrayImpl
  {
    typedef OglDrawArrayImpl super_t;

  public:
    /// Index buffer ID
    OglBufRep m_indBuf;
    
    OglDrawElemImpl(qlib::uid_t nSceneID) : super_t(nSceneID), m_indBuf(nSceneID) {}

    virtual ~OglDrawElemImpl()
    {
    }

    virtual void create(const AbstDrawElem &ade)
    {
      MB_ASSERT(ade.getType()==DrawElem::VA_VNCI||
                ade.getType()==DrawElem::VA_VNCI32);

      // create VBO
      super_t::create(ade);
      
      // create IndexVBO
      if (!m_indBuf.isCreated())
        m_indBuf.create();

      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());
      glBufferData(GL_ELEMENT_ARRAY_BUFFER,
                   ade.getIndDataSize(), ade.getIndData(), GL_STATIC_DRAW);
    }

    virtual void update(const AbstDrawElem &ade)
    {
      // update main VBO
      super_t::update(ade);

      // IndexVBO updated --> call glBufferSubData
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());
      glBufferSubData(GL_ELEMENT_ARRAY_BUFFER, 0, ade.getIndDataSize(), ade.getIndData());
    }

    virtual void preDraw(const AbstDrawElem &ade)
    {
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());
      super_t::preDraw(ade);
    }

    virtual void draw(const AbstDrawElem &ade)
    {
      const int ntype = ade.getType();

      MB_ASSERT(ntype==DrawElem::VA_VNCI||
                ntype==DrawElem::VA_VNCI32);

      glBindBuffer(GL_ARRAY_BUFFER, m_buf.getID());
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());

      const size_t ninds = ade.getIndSize();
      
      GLenum mode = convDrawMode(ade.getDrawMode());

      if (ntype==DrawElem::VA_VNCI) {
        glDrawElements(mode, ninds, GL_UNSIGNED_SHORT, 0);
      }
      else if (ntype==DrawElem::VA_VNCI32) {
        glDrawElements(mode, ninds, GL_UNSIGNED_INT, 0);
      }

      //glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
      //glBindBuffer(GL_ARRAY_BUFFER, 0);
    }

    virtual void postDraw(const AbstDrawElem &ade)
    {
      super_t::postDraw(ade);
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
    }
  };


  ////////////////////////////////////////////////////////


  /// Draw array (shader attributes without indices)
  class OglDrawArrayAttrsImpl : public OglDrawArrayImpl
  {

    typedef OglDrawArrayImpl super_t;

  public:
    
    OglDrawArrayAttrsImpl(qlib::uid_t nSceneID) : super_t(nSceneID) {}

    //////////

    virtual void preDraw(const AbstDrawElem &ade)
    {
      const gfx::AbstDrawAttrs &ada = static_cast<const gfx::AbstDrawAttrs &>(ade);

      glBindBuffer(GL_ARRAY_BUFFER, m_buf.getID());

      size_t nattr = ada.getAttrSize();
      for (int i=0; i<nattr; ++i) {
        int al = ada.getAttrLoc(i);
        int az = ada.getAttrElemSize(i);
        int at = ada.getAttrTypeID(i);
        int ap = ada.getAttrPos(i);
        if (at==qlib::type_consts::QTC_INT32 ||
            at==qlib::type_consts::QTC_UINT32) {
          glVertexAttribIPointer(al,
                                 az,
                                 convGLConsts(at),
                                 ada.getElemSize(),
                                 (void *) ap);
        }
        else {
          glVertexAttribPointer(al,
                                az,
                                convGLConsts(at),
                                convGLNorm(at),
                                ada.getElemSize(),
                                (void *) ap);
        }
        glEnableVertexAttribArray(al);
      }
    }

    virtual void draw(const AbstDrawElem &ade)
    {
      const gfx::AbstDrawAttrs &ada = static_cast<const gfx::AbstDrawAttrs &>(ade);

      int ninst = ada.getInstCount();
      GLenum mode = convDrawMode(ada.getDrawMode());

      if (ninst>0 && GLEW_ARB_instanced_arrays)
        glDrawArraysInstanced(mode, 0, ada.getSize(), ninst);
      else
        glDrawArrays(mode, 0, ada.getSize());
    }
    
    virtual void postDraw(const AbstDrawElem &ade)
    {
      const gfx::AbstDrawAttrs &ada = static_cast<const gfx::AbstDrawAttrs &>(ade);

      size_t nattr = ada.getAttrSize();
      for (int i=0; i<nattr; ++i) {
        int al = ada.getAttrLoc(i);
        glDisableVertexAttribArray(al);
      }

      glBindBuffer(GL_ARRAY_BUFFER, 0);
    }
    
  };

  /////////////////////////////////////////////////////////
  
  /// Draw elements (shader attributes with indices)
  class OglDrawElemAttrsImpl : public OglDrawArrayAttrsImpl
  {

    typedef OglDrawArrayAttrsImpl super_t;

    /// Index buffer ID
    OglBufRep m_indBuf;

  public:
    
    OglDrawElemAttrsImpl(qlib::uid_t nSceneID) : super_t(nSceneID), m_indBuf(nSceneID) {}

    //////////

    virtual void create(const AbstDrawElem &ade)
    {
      // create VBO
      super_t::create(ade);
      
      // create IndexVBO
      if (!m_indBuf.isCreated())
        m_indBuf.create();

      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());
      glBufferData(GL_ELEMENT_ARRAY_BUFFER,
                   ade.getIndDataSize(), ade.getIndData(), GL_STATIC_DRAW);
    }

    virtual void update(const AbstDrawElem &ade)
    {
      // update main VBO
      super_t::update(ade);

      // IndexVBO updated --> call glBufferSubData
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());
      glBufferSubData(GL_ELEMENT_ARRAY_BUFFER, 0, ade.getIndDataSize(), ade.getIndData());
    }

    virtual void preDraw(const AbstDrawElem &ade)
    {
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());
      super_t::preDraw(ade);
    }

    virtual void draw(const AbstDrawElem &ade)
    {
      //const gfx::AbstDrawAttrs &ada = static_cast<const gfx::AbstDrawAttrs &>(ade);

      int ninst = ade.getInstCount();
      GLenum mode = convDrawMode(ade.getDrawMode());
      size_t ninds = ade.getIndSize();
      size_t indsz = ade.getIndElemSize();

      if (indsz==2) {
        if (ninst>0 && GLEW_ARB_instanced_arrays)
          glDrawElementsInstanced(mode, ninds, GL_UNSIGNED_SHORT, 0, ninst);
        else
          glDrawElements(mode, ninds, GL_UNSIGNED_SHORT, 0);
      }
      else if (indsz==4) {
        if (ninst>0 && GLEW_ARB_instanced_arrays)
          glDrawElementsInstanced(mode, ninds, GL_UNSIGNED_INT, 0, ninst);
        else
          glDrawElements(mode, ninds, GL_UNSIGNED_INT, 0);
      }
      else {
        LOG_DPRINTLN("unsupported index element size %d", indsz);
        MB_ASSERT(false);
      }
    }
    
    virtual void postDraw(const AbstDrawElem &ade)
    {
      super_t::postDraw(ade);
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
    }
    
  };

  /////////////////////////////////////////////////////////

  /// OpenGL vertex array object (VAO) class
  class OglVAORep : public OglBufRepBase
  {
  public:
    OglVAORep(qlib::uid_t nSceneID) : OglBufRepBase(nSceneID) {}
    
    virtual ~OglVAORep()
    {
      if (!setContext())
        return;
      destroy();
    }

    inline void create() {
      glGenVertexArrays(1, &m_nBufID);
    }

    inline void destroy() {
      glDeleteVertexArrays(1, &m_nBufID);
      m_nBufID = 0;
    }

    inline void bind() {
      glBindVertexArray(m_nBufID);
    }
  };

  /// OpenGL DrawArray impl (for GL3 VAO/without index buffer)
  class OglVAOArrayImpl : public gfx::DrawElemImpl
  {
  public:
    OglBufRep m_buf;
    //OglVAORep m_vao;
    
    typedef std::map<int, OglVAORep> VAORepTab;
    
    VAORepTab m_tab;

    qlib::uid_t m_nSceneID;

    int m_nCurID;

    OglVAOArrayImpl(qlib::uid_t nSceneID, OglDisplayContext *pctxt)
         : m_buf(nSceneID)//, m_vao(nSceneID)
    {
      m_nSceneID = nSceneID;
      int id = (int) pctxt;
      m_tab.insert( VAORepTab::value_type(id, OglVAORep(m_nSceneID)) );
      m_nCurID = id;
    }

    //////////

    OglVAORep &getVAO() {
      VAORepTab::iterator i = m_tab.find(m_nCurID);
      MB_ASSERT(i!=m_tab.end());
      OglVAORep &vao = i->second;
      if (!vao.isCreated())
        vao.create();
      return vao;
    }

    void setCurrCtxt(OglDisplayContext *pctxt, const AbstDrawElem &ade) {
      int id = (int) pctxt;
      if (m_tab.find(id)!=m_tab.end())
        return;
      m_tab.insert( VAORepTab::value_type(id, OglVAORep(m_nSceneID)) );
      m_nCurID = id;

      // create new VAO for this context
      create(ade);
    }

    virtual void create(const AbstDrawElem &ade)
    {
      OglVAORep &vao = getVAO();
      
      if (!vao.isCreated())
        vao.create();

      vao.bind();

      if (!m_buf.isCreated())
        m_buf.create();
      
      // Init VBO & transfer data
      glBindBuffer(GL_ARRAY_BUFFER, m_buf.getID());
      glBufferData(GL_ARRAY_BUFFER, ade.getDataSize(), ade.getData(), GL_STATIC_DRAW);

      const gfx::AbstDrawAttrs &ada = static_cast<const gfx::AbstDrawAttrs &>(ade);

      size_t nattr = ada.getAttrSize();
      for (int i=0; i<nattr; ++i) {
        int al = ada.getAttrLoc(i);
        int az = ada.getAttrElemSize(i);
        int at = ada.getAttrTypeID(i);
        int ap = ada.getAttrPos(i);
        if (at==qlib::type_consts::QTC_INT32 ||
            at==qlib::type_consts::QTC_UINT32) {
          glVertexAttribIPointer(al,
                                 az,
                                 convGLConsts(at),
                                 ada.getElemSize(),
                                 (void *) ap);
        }
        else {
          glVertexAttribPointer(al,
                                az,
                                convGLConsts(at),
                                convGLNorm(at),
                                ada.getElemSize(),
                                (void *) ap);
        }
        glEnableVertexAttribArray(al);
      }

      //glBindVertexArray(0);
    }

    virtual void update(const AbstDrawElem &ade)
    {
      // VBO updated --> call glBufferSubData
      glBindBuffer(GL_ARRAY_BUFFER, m_buf.getID());
      glBufferSubData(GL_ARRAY_BUFFER, 0, ade.getDataSize(), ade.getData());
    }
    
    virtual void preDraw(const AbstDrawElem &ade)
    {
    }

    virtual void draw(const AbstDrawElem &ade)
    {
      const gfx::AbstDrawAttrs &ada = static_cast<const gfx::AbstDrawAttrs &>(ade);

      int ninst = ada.getInstCount();
      GLenum mode = convDrawMode(ada.getDrawMode());

      OglVAORep &vao = getVAO();
      vao.bind();

      if (ninst>0 && GLEW_ARB_instanced_arrays)
        glDrawArraysInstanced(mode, 0, ada.getSize(), ninst);
      else
        glDrawArrays(mode, 0, ada.getSize());

      glBindVertexArray(0);
    }

    virtual void postDraw(const AbstDrawElem &ade)
    {
    }
  };

  /// Draw elements (shader attributes with indices)
  class OglVAOElemImpl : public OglVAOArrayImpl
  {

    typedef OglVAOArrayImpl super_t;

    /// Index buffer ID
    OglBufRep m_indBuf;

  public:
    
    OglVAOElemImpl(qlib::uid_t nSceneID, OglDisplayContext *pctxt)
         : super_t(nSceneID, pctxt), m_indBuf(nSceneID)
    {
    }

    //////////

    virtual void create(const AbstDrawElem &ade)
    {
      // create VAO/VBO
      super_t::create(ade);
      
      // create IndexVBO
      if (!m_indBuf.isCreated())
        m_indBuf.create();

      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());
      glBufferData(GL_ELEMENT_ARRAY_BUFFER,
                   ade.getIndDataSize(), ade.getIndData(), GL_STATIC_DRAW);
    }

    virtual void update(const AbstDrawElem &ade)
    {
      // update main VBO
      super_t::update(ade);

      // IndexVBO updated --> call glBufferSubData
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());
      glBufferSubData(GL_ELEMENT_ARRAY_BUFFER, 0, ade.getIndDataSize(), ade.getIndData());
    }

    /*virtual void preDraw(const AbstDrawElem &ade)
    {
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m_indBuf.getID());
      super_t::preDraw(ade);
    }*/

    virtual void draw(const AbstDrawElem &ade)
    {
      //const gfx::AbstDrawAttrs &ada = static_cast<const gfx::AbstDrawAttrs &>(ade);
      auto vao = getVAO();
      vao.bind();
      
      int ninst = ade.getInstCount();
      GLenum mode = convDrawMode(ade.getDrawMode());
      size_t ninds = ade.getIndSize();
      size_t indsz = ade.getIndElemSize();

      if (indsz==2) {
        if (ninst>0 && GLEW_ARB_instanced_arrays)
          glDrawElementsInstanced(mode, ninds, GL_UNSIGNED_SHORT, 0, ninst);
        else
          glDrawElements(mode, ninds, GL_UNSIGNED_SHORT, 0);
      }
      else if (indsz==4) {
        if (ninst>0 && GLEW_ARB_instanced_arrays)
          glDrawElementsInstanced(mode, ninds, GL_UNSIGNED_INT, 0, ninst);
        else
          glDrawElements(mode, ninds, GL_UNSIGNED_INT, 0);
      }
      else {
        LOG_DPRINTLN("unsupported index element size %d", indsz);
        MB_ASSERT(false);
      }

      glBindVertexArray(0);
    }
    
    /*virtual void postDraw(const AbstDrawElem &ade)
    {
      super_t::postDraw(ade);
      glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
    }*/
    
  };

}

#endif


