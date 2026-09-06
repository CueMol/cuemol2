// Tests for the GPU ID-buffer pick pass at the Scene level: which renderers
// take part in displayPick(), and how processHit(bCpuOnly) complements it.

#include <gtest/gtest.h>
#include <common.h>

#include "qsys/Scene.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/Object.hpp"
#include "qsys/Renderer.hpp"
#include <gfx/DisplayContext.hpp>
#include <qlib/Vector4D.hpp>

using qlib::Vector4D;

namespace {

class PickTestObject : public qsys::Object
{
public:
    qlib::LCloneableObject *clone() const override { return nullptr; }
};

// A renderer that records the renderer index it was drawn with.
class PickTestRenderer : public qsys::Renderer
{
public:
    bool m_bPick;
    bool m_bHit;
    std::vector<qlib::quint32> m_drawnIdx;

    PickTestRenderer(bool bPick, bool bHit) : m_bPick(bPick), m_bHit(bHit) {}

    const char *getTypeName() const override { return "picktest"; }
    bool isCompatibleObj(qsys::ObjectPtr) const override { return true; }
    Vector4D getCenter() const override { return Vector4D(); }
    void display(gfx::DisplayContext *) override {}
    void unloading() override {}
    qlib::LCloneableObject *clone() const override { return nullptr; }

    bool isHitTestSupported() const override { return m_bHit; }
    bool isPickSupported() const override { return m_bPick; }
    void displayPick(gfx::DisplayContext *pdc) override
    {
        m_drawnIdx.push_back(pdc->getHitRendIndex());
    }
};

class StubDC : public gfx::DisplayContext
{
public:
    bool setCurrent() override { return true; }
    bool isCurrent() const override { return true; }
    bool isFile() const override { return false; }
    void vertex(const Vector4D &) override {}
    void normal(const Vector4D &) override {}
    void setPolygonMode(int) override {}
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

}  // namespace

class ScenePickFixture : public ::testing::Test
{
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();
        m_pObj = qsys::ObjectPtr(MB_NEW PickTestObject());
        m_pScene->addObject(m_pObj);
    }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            qlib::uid_t uid = m_pScene->getUID();
            m_pObj = qsys::ObjectPtr();
            m_pScene = qsys::ScenePtr();
            qsys::SceneManager::getInstance()->destroyScene(uid);
        }
    }

    PickTestRenderer *attach(bool bPick, bool bHit)
    {
        auto *p = MB_NEW PickTestRenderer(bPick, bHit);
        m_pObj->attachRenderer(qsys::RendererPtr(p));
        return p;
    }
};

// displayPick() draws only visible, unlocked, pick-capable renderers whose
// default alpha is above the threshold, numbering them 1.. in the renderer
// table the View reads back; processHit(bCpuOnly=true) covers the rest.
TEST_F(ScenePickFixture, DisplayPickSelectsParticipantsAndCpuOnlyComplements)
{
    PickTestRenderer *pOk = attach(true, true);
    PickTestRenderer *pHidden = attach(true, true);
    pHidden->setVisible(false);
    PickTestRenderer *pLocked = attach(true, true);
    pLocked->setUILocked(true);
    PickTestRenderer *pTransp = attach(true, true);
    pTransp->setDefaultAlpha(0.3);
    PickTestRenderer *pCpuOnly = attach(false, true);
    PickTestRenderer *pNoHit = attach(false, false);

    StubDC dc;
    m_pScene->displayPick(&dc);

    // Only pOk was drawn, with renderer index 1, and the table maps 1 -> its uid.
    ASSERT_EQ(dc.getHitRendTable().size(), 1u);
    EXPECT_EQ(dc.getHitRendTable()[0], pOk->getUID());
    ASSERT_EQ(pOk->m_drawnIdx.size(), 1u);
    EXPECT_EQ(pOk->m_drawnIdx[0], 1u);
    EXPECT_TRUE(pHidden->m_drawnIdx.empty());
    EXPECT_TRUE(pLocked->m_drawnIdx.empty());
    EXPECT_TRUE(pTransp->m_drawnIdx.empty());
    EXPECT_TRUE(pCpuOnly->m_drawnIdx.empty());
    EXPECT_TRUE(pNoHit->m_drawnIdx.empty());
    // Index is reset outside startHit/endHit.
    EXPECT_EQ(dc.getHitRendIndex(), 0u);

    // A hit-test renderer without GPU pick support needs the CPU fallback.
    EXPECT_TRUE(m_pScene->hasCpuOnlyHitRenderers());

    // processHit(bCpuOnly=true) skips the GPU-picked renderers (pOk, pTransp)
    // but still visits the CPU-only ones (and, as before, ignores hidden /
    // locked ones).
    StubDC hc;
    m_pScene->processHit(&hc, true);
    std::vector<qlib::uid_t> visited = hc.getHitRendTable();
    EXPECT_EQ(visited.size(), 2u);
    EXPECT_NE(std::find(visited.begin(), visited.end(), pCpuOnly->getUID()), visited.end());
    EXPECT_NE(std::find(visited.begin(), visited.end(), pNoHit->getUID()), visited.end());
    EXPECT_EQ(std::find(visited.begin(), visited.end(), pOk->getUID()), visited.end());

    // The default (bCpuOnly=false) is the legacy behaviour: everyone visible.
    StubDC hc2;
    m_pScene->processHit(&hc2);
    EXPECT_EQ(hc2.getHitRendTable().size(), 4u);
}
