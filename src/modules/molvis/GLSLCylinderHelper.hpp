// -*-Mode: C++;-*-
//
//  GLSL cylinder rendering helper class
//

#ifndef GLSL_CYLINDER_HELPER_HPP_INCLUDED
#define GLSL_CYLINDER_HELPER_HPP_INCLUDED

#include <sysdep/OglShaderSetupHelper.hpp>

namespace molvis {

  class GLSLCylinderHelper
  {
  private:
    
    struct CylElem {
      qfloat32 cenx, ceny, cenz;
      qfloat32 dirx, diry, dirz;
      qfloat32 dspx, dspy;
      qfloat32 rad;
      qbyte r, g, b, a;
    };
    
    typedef gfx::DrawAttrElems<quint16, CylElem> CylElemAry16;
    typedef gfx::DrawAttrElems<quint32, CylElem> CylElemAry32;

    GLuint m_nVertexLoc;
    GLuint m_nDirLoc;
    GLuint m_nImposLoc;
    GLuint m_nRadLoc;
    GLuint m_nColLoc;

    sysdep::OglProgramObject *m_pPO;

    CylElemAry32 *m_pDrawElem;

    qfloat32 dsps[4][2];

  public:
    GLSLCylinderHelper()
         : m_pPO(NULL), m_pDrawElem(NULL)
    {
      
      dsps[0][0] = -1.0f; dsps[0][1] = -1.0f;
      dsps[1][0] =  1.0f, dsps[1][1] = -1.0f;
      dsps[2][0] = -1.0f, dsps[2][1] =  1.0f;
      dsps[3][0] =  1.0f, dsps[3][1] =  1.0f;
    }

    ~GLSLCylinderHelper()
    {
      invalidate();
    }

    bool initShader(qsys::Renderer *pRend)
    {
      MB_ASSERT(m_pPO == NULL);
      sysdep::OglShaderSetupHelper<qsys::Renderer> ssh(pRend);
      
      if (!ssh.checkEnvVS()) {
        MB_DPRINTLN("GLShader not supported");
        return false;
      }
      
      if (m_pPO==NULL)
        m_pPO = ssh.createProgObj("gpu_cylinder",
                                  "%%CONFDIR%%/data/shaders/cylinder_vertex.glsl",
                                  "%%CONFDIR%%/data/shaders/cylinder_frag.glsl");
      
      if (m_pPO==NULL) {
        LOG_DPRINTLN("GPUCylere> ERROR: cannot create progobj.");
        return false;
      }
      
      // setup attributes
      m_nVertexLoc = m_pPO->getAttribLocation("a_vertex");
      m_nDirLoc = m_pPO->getAttribLocation("a_dir");
      m_nImposLoc = m_pPO->getAttribLocation("a_impos");
      m_nRadLoc = m_pPO->getAttribLocation("a_radius");
      m_nColLoc = m_pPO->getAttribLocation("a_color");

      return true;
    }

    void alloc(int nsphs)
    {
      CylElemAry32 *pdata = MB_NEW CylElemAry32();
      m_pDrawElem = pdata;
      CylElemAry32 &sphdata = *pdata;
      sphdata.setAttrSize(5);
      sphdata.setAttrInfo(0, m_nVertexLoc, 3, qlib::type_consts::QTC_FLOAT32,  offsetof(CylElem, cenx));
      sphdata.setAttrInfo(1, m_nDirLoc, 3, qlib::type_consts::QTC_FLOAT32,  offsetof(CylElem, dirx));
      sphdata.setAttrInfo(2, m_nImposLoc, 2, qlib::type_consts::QTC_FLOAT32, offsetof(CylElem, dspx));
      sphdata.setAttrInfo(3, m_nRadLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(CylElem, rad));
      sphdata.setAttrInfo(4, m_nColLoc, 4, qlib::type_consts::QTC_UINT8, offsetof(CylElem, r));
      
      sphdata.alloc(nsphs*4);
      sphdata.allocInd(nsphs*6);
      sphdata.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    }

    void setData(int ind, const Vector4D &pos1, const Vector4D &pos2, double rad, ColorPtr pc, qlib::uid_t nSceneID = qlib::invalid_uid)
    {
      Vector4D dir = pos2-pos1;

      CylElemAry32 &sphdata = *m_pDrawElem;

      int i = ind * 4, j;
      int ifc = ind * 6;

      sphdata.atind(ifc) = i + 0; ++ifc;
      sphdata.atind(ifc) = i + 1; ++ifc;
      sphdata.atind(ifc) = i + 2; ++ifc;
      sphdata.atind(ifc) = i + 2; ++ifc;
      sphdata.atind(ifc) = i + 1; ++ifc;
      sphdata.atind(ifc) = i + 3; ++ifc;

      CylElem data;

      data.cenx = (qfloat32) pos1.x();
      data.ceny = (qfloat32) pos1.y();
      data.cenz = (qfloat32) pos1.z();
      data.dirx = (qfloat32) dir.x();
      data.diry = (qfloat32) dir.y();
      data.dirz = (qfloat32) dir.z();
      data.rad = (qfloat32) rad;

      quint32 devcode = pc->getDevCode(nSceneID);
      data.r = (qbyte) gfx::getRCode(devcode);
      data.g = (qbyte) gfx::getGCode(devcode);
      data.b = (qbyte) gfx::getBCode(devcode);
      data.a = (qbyte) gfx::getACode(devcode);

      for (j=0; j<2; ++j) {
        sphdata.at(i) = data;
        sphdata.at(i).dspx = dsps[j][0];
        sphdata.at(i).dspy = dsps[j][1];
	++i;
      }

      dir = -dir;
      data.cenx = (qfloat32) pos2.x();
      data.ceny = (qfloat32) pos2.y();
      data.cenz = (qfloat32) pos2.z();
      data.dirx = (qfloat32) dir.x();
      data.diry = (qfloat32) dir.y();
      data.dirz = (qfloat32) dir.z();

      for (; j<4; ++j) {
        sphdata.at(i) = data;
        sphdata.at(i).dspx = dsps[j][0];
        sphdata.at(i).dspy = dsps[j][1];
	++i;
      }
    }

    gfx::AbstDrawElem *getDrawElem() const
    {
      return m_pDrawElem;
    }

    void draw(DisplayContext *pdc, qlib::uid_t nSceneID = qlib::invalid_uid)
    {
      if (m_pDrawElem!=NULL) {
        m_pPO->enable();
        m_pPO->setUniformF("frag_alpha", pdc->getAlpha());

        // Setup edge/silhouette
        if (pdc->getEdgeLineType()!=DisplayContext::ELT_NONE) {
          m_pPO->setUniformF("u_edge", pdc->getEdgeLineWidth());

          float r=.0f,g=.0f,b=.0f;
          ColorPtr pcol = pdc->getEdgeLineColor();
          if (!pcol.isnull()) {
            quint32 dcc = pcol->getDevCode(nSceneID);
            r = gfx::convI2F(gfx::getRCode(dcc));
            g = gfx::convI2F(gfx::getGCode(dcc));
            b = gfx::convI2F(gfx::getBCode(dcc));
          }
          m_pPO->setUniformF("u_edgecolor", r,g,b,1);
          if (pdc->getEdgeLineType()==DisplayContext::ELT_SILHOUETTE)
            m_pPO->setUniform("u_bsilh", 1);
          else
            m_pPO->setUniform("u_bsilh", 0);
        }
        else {
          m_pPO->setUniformF("u_edge", 0.0);
          m_pPO->setUniformF("u_edgecolor", 0,0,0,1);
          m_pPO->setUniform("u_bsilh", 0);
        }
        pdc->drawElem(*m_pDrawElem);
        m_pPO->disable();
      }
    }

    void invalidate()
    {
      if (m_pDrawElem!=NULL) {
        delete m_pDrawElem;
        m_pDrawElem = NULL;
      }
    }

  };

}

#endif

