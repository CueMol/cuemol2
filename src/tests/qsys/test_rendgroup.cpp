#include <gtest/gtest.h>
#include <common.h>
#include "qsys/RendGroup.hpp"
#include "qsys/Object.hpp"
#include "qsys/Scene.hpp"
#include "qsys/SceneManager.hpp"

using qlib::LString;

TEST(RendGroupTest, TypeName)
{
    qsys::RendGroup rg;
    EXPECT_STREQ(rg.getTypeName(), "*group");
}

TEST(RendGroupTest, ToString)
{
    qsys::RendGroup rg;
    EXPECT_EQ(rg.toString(), LString("Renderer group"));
}

// isCompatibleObj ignores the argument and always returns true
TEST(RendGroupTest, IsCompatibleObjAlwaysTrue)
{
    qsys::RendGroup rg;
    EXPECT_TRUE(rg.isCompatibleObj(qsys::ObjectPtr()));
}

TEST(RendGroupTest, UICollapsedDefaultFalse)
{
    qsys::RendGroup rg;
    EXPECT_FALSE(rg.isUICollapsed());
}

TEST(RendGroupTest, SetUICollapsed)
{
    qsys::RendGroup rg;
    rg.setUICollapsed(true);
    EXPECT_TRUE(rg.isUICollapsed());
    rg.setUICollapsed(false);
    EXPECT_FALSE(rg.isUICollapsed());
}

TEST(RendGroupTest, DefaultVisibilityTrue)
{
    qsys::RendGroup rg;
    EXPECT_TRUE(rg.isVisible());
}

TEST(RendGroupTest, DefaultLockedFalse)
{
    qsys::RendGroup rg;
    EXPECT_FALSE(rg.isUILocked());
}

TEST(RendGroupTest, IsHitTestSupportedFalse)
{
    qsys::RendGroup rg;
    EXPECT_FALSE(rg.isHitTestSupported());
}

TEST(RendGroupTest, DefaultGroupNameEmpty)
{
    qsys::RendGroup rg;
    EXPECT_TRUE(rg.getGroupName().isEmpty());
}

// --- Center scan termination ---
//
// getCenter/hasCenter find the group's members by name: every renderer of the
// client object whose group property equals this group's name. A group whose
// own name matches that scan -- itself, or another group carrying the same
// name -- recursed through hasCenter without end; both groups nameless is
// exactly what pasting an object serialized before the createPresetRenderer
// name fix produces. Groups are not legal members (nesting is unsupported),
// so the scan must skip them.

namespace {

class CenterScanObject : public qsys::Object {
public:
    qlib::LCloneableObject *clone() const override { return nullptr; }
};

}  // namespace

class RendGroupCenterFixture : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();
        m_pObj = qsys::ObjectPtr(MB_NEW CenterScanObject());
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
};

TEST_F(RendGroupCenterFixture, NamelessGroupDoesNotRecurseIntoItself)
{
    qsys::RendererPtr pGrp(MB_NEW qsys::RendGroup());
    m_pObj->attachRenderer(pGrp);

    // Both the group's name and its group property are "": the scan matches
    // the group itself. Without the group skip this call never returned.
    EXPECT_FALSE(pGrp->hasCenter());
    EXPECT_TRUE(pGrp->getCenter().equals(qlib::Vector4D()));
}

TEST_F(RendGroupCenterFixture, TwoNamelessGroupsDoNotRecurseIntoEachOther)
{
    qsys::RendererPtr pGrpA(MB_NEW qsys::RendGroup());
    qsys::RendererPtr pGrpB(MB_NEW qsys::RendGroup());
    m_pObj->attachRenderer(pGrpA);
    m_pObj->attachRenderer(pGrpB);

    // A's scan finds B and B's finds A; skipping only "self" still loops.
    EXPECT_FALSE(pGrpA->hasCenter());
    EXPECT_FALSE(pGrpB->hasCenter());
}

TEST(RendGroupCenterTest, DetachedGroupHasNoCenter)
{
    // No client object at all (never attached): the scan has nothing to walk.
    qsys::RendGroup rg;
    EXPECT_FALSE(rg.hasCenter());
    EXPECT_TRUE(rg.getCenter().equals(qlib::Vector4D()));
}
