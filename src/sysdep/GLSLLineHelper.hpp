//
//  GLSL line rendering helper class
//

#pragma once

#include <gfx/DrawElem.hpp>

namespace sysdep {

class GLSLLineHelper
{
private:
    struct LineElem
    {
        qfloat32 x1, y1, z1;
        qfloat32 x2, y2, z2;
        qbyte r1, g1, b1, a1;
        qbyte r2, g2, b2, a2;
        qfloat32 ind;  // index number
    };

    using LineArray = gfx::DrawAttrArray<LineElem>;

    GLuint m_nVertex1Loc;
    GLuint m_nCol1Loc;
    GLuint m_nVertex2Loc;
    GLuint m_nCol2Loc;
    GLuint m_nIndLoc;

    sysdep::OglProgramObject *m_pPO;

    LineArray *m_pDrawAry;

    bool m_bInitialized;

    float m_linew;

public:
    GLSLLineHelper() : m_pPO(NULL), m_pDrawAry(NULL), m_bInitialized(false) {}

    ~GLSLLineHelper()
    {
        invalidate();
    }

    bool initShader(qsys::Renderer *pRend)
    {
        if (m_bInitialized) return true;

        MB_ASSERT(m_pPO == NULL);
        sysdep::ShaderSetupHelper<qsys::Renderer> ssh(pRend);

        if (!ssh.checkEnvVS()) {
            MB_DPRINTLN("GLShader not supported");
            return false;
        }

        if (m_pPO == NULL)
            m_pPO = ssh.createProgObj("gpu_line",
                                      "%%CONFDIR%%/data/shaders/linew_vert.glsl",
                                      "%%CONFDIR%%/data/shaders/linew_frag.glsl");

        if (m_pPO == NULL) {
            LOG_DPRINTLN("GLSLLine> ERROR: cannot create progobj.");
            return false;
        }

        // setup attributes
        m_nIndLoc = m_pPO->getAttribLocation("a_index");
        m_nVertex1Loc = m_pPO->getAttribLocation("a_vertex1");
        m_nVertex2Loc = m_pPO->getAttribLocation("a_vertex2");
        m_nCol1Loc = m_pPO->getAttribLocation("a_color1");
        m_nCol2Loc = m_pPO->getAttribLocation("a_color2");

        m_bInitialized = true;
        return true;
    }

    void alloc(int nverts)
    {
        LineArray *pdata = MB_NEW LineArray();
        m_pDrawAry = pdata;
        LineArray &data = *pdata;
        data.setAttrSize(5);
        data.setAttrInfo(0, m_nVertex1Loc, 3, qlib::type_consts::QTC_FLOAT32,
                         offsetof(LineElem, x1));
        data.setAttrInfo(1, m_nVertex2Loc, 3, qlib::type_consts::QTC_FLOAT32,
                         offsetof(LineElem, x2));
        data.setAttrInfo(2, m_nCol1Loc, 4, qlib::type_consts::QTC_UINT8,
                         offsetof(LineElem, r1));
        data.setAttrInfo(3, m_nCol2Loc, 4, qlib::type_consts::QTC_UINT8,
                         offsetof(LineElem, r2));
        data.setAttrInfo(4, m_nIndLoc, 1, qlib::type_consts::QTC_FLOAT32,
                         offsetof(LineElem, ind));

        // data.alloc(nverts);
        // data.setDrawMode(gfx::AbstDrawElem::DRAW_LINES);

        data.alloc(nverts * 3);
        data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
        // data.setDrawMode(gfx::AbstDrawElem::DRAW_LINES);
        MB_DPRINTLN("GLSLLine> allocated %d vertices", nverts);

        // assign index
        for (int i = 0; i < nverts * 3; i++) {
            data.at(i).ind = i % 6;
        }
    }

    void setLineWidth(double lw)
    {
        m_linew = lw;
    }

    void color(int ind, quint32 devcode)
    {
        // auto &data = *m_pDrawAry;
        // MB_ASSERT(ind >= 0);
        // MB_ASSERT(ind < data.getSize());

        // data.at(ind).r = (qbyte)gfx::getRCode(devcode);
        // data.at(ind).g = (qbyte)gfx::getGCode(devcode);
        // data.at(ind).b = (qbyte)gfx::getBCode(devcode);
        // data.at(ind).a = (qbyte)gfx::getACode(devcode);
    }

    void vertex(int ind, const Vector4D &v)
    {
        auto &data = *m_pDrawAry;

        const auto ind2 = ind / 2;
        const auto flag = ind % 2;

        const auto ind3 = ind2 * 6;

        // MB_DPRINTLN("vertex: %d (%f,%f,%f)", ind, v.x(), v.y(), v.z());
        MB_ASSERT(ind3 >= 0);
        MB_ASSERT(ind3 < data.getSize());

        if (flag == 0) {
            for (int j=0; j<6; j++) {
                data.at(ind3 + j).x1 = (qfloat32)v.x();
                data.at(ind3 + j).y1 = (qfloat32)v.y();
                data.at(ind3 + j).z1 = (qfloat32)v.z();
            }
        } else {
            for (int j=0; j<6; j++) {
                data.at(ind3 + j).x2 = (qfloat32)v.x();
                data.at(ind3 + j).y2 = (qfloat32)v.y();
                data.at(ind3 + j).z2 = (qfloat32)v.z();
            }
        }
    }

    gfx::AbstDrawElem *getDrawElem() const
    {
        return m_pDrawAry;
    }

    void draw(gfx::DisplayContext *pdc, qlib::uid_t nSceneID = qlib::invalid_uid)
    {
        if (m_pDrawAry == NULL) {
            return;
        }

        auto pview = pdc->getTargetView();
        if (pview == NULL) {
            MB_DPRINTLN("GLSLLine> ERROR: no target view");
            return;
        }

        float w = pview->getWidth();
        float h = pview->getHeight();

        m_pPO->enable();
        m_pPO->setUniformF("frag_alpha", pdc->getAlpha());
        m_pPO->setUniformF("lineWidth", m_linew);
        m_pPO->setUniformF("screenSize", w, h);
        pdc->drawElem(*m_pDrawAry);
        m_pPO->disable();
    }

    void invalidate()
    {
        if (m_pDrawAry != NULL) {
            delete m_pDrawAry;
            m_pDrawAry = NULL;
            MB_DPRINTLN("GLSLLine> deleted draw array");
        }
    }

    bool isValid() const
    {
        return m_bInitialized && m_pDrawAry != NULL;
    }
};

}  // namespace sysdep
