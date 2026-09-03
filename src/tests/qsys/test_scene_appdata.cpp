#include <gtest/gtest.h>
#include <common.h>

#include "qlib/LDOM2Tree.hpp"
#include "qsys/Scene.hpp"
#include "qsys/SceneAppData.hpp"
#include "qsys/SceneManager.hpp"

using qlib::LString;
using qsys::SceneAppDataPtr;
using qsys::SceneManager;
using qsys::ScenePtr;

// Generic behaviour of the Scene app-data store that needs no concrete
// SceneAppData class (those live in the modules; see test_render).
class SceneAppDataTest : public ::testing::Test {
protected:
    ScenePtr m_pScene;

    void SetUp() override { m_pScene = SceneManager::getInstance()->createScene(); }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            qlib::uid_t uid = m_pScene->getUID();
            m_pScene = ScenePtr();
            SceneManager::getInstance()->destroyScene(uid);
        }
    }
};

TEST_F(SceneAppDataTest, GetCreateUnknownClassReturnsNull)
{
    SceneAppDataPtr p = m_pScene->getCreateAppData("x", "NoSuchClass");
    EXPECT_TRUE(p.isnull());
    EXPECT_FALSE(m_pScene->hasAppData("x"));
}

TEST_F(SceneAppDataTest, UnregisteredTypeIsPreservedVerbatim)
{
    qlib::LDom2Tree in("scene");
    qlib::LDom2Node *pCh = in.top()->appendChild("appdata");
    pCh->setStrAttr("id", "x");
    pCh->setTypeName("NoSuchClass");
    pCh->setStrAttr("foo", "1");

    in.deserialize(m_pScene.get());

    LString msgs = in.top()->getErrorMsgs();
    EXPECT_NE(msgs.indexOf("NoSuchClass"), -1) << msgs.c_str();
    // opaque: not visible as a live object ...
    EXPECT_FALSE(m_pScene->hasAppData("x"));
    EXPECT_TRUE(m_pScene->getAppData("x").isnull());

    // ... but re-emitted as-is on save
    qlib::LDom2Tree out("scene");
    out.serialize(m_pScene.get(), false);
    qlib::LDom2Node *pOut = out.top()->findChild("appdata");
    ASSERT_NE(pOut, nullptr);
    EXPECT_TRUE(pOut->getStrAttr("id").equals("x"));
    EXPECT_TRUE(pOut->getTypeName().equals("NoSuchClass"));
    EXPECT_TRUE(pOut->getStrAttr("foo").equals("1"));

    // and dropped with the rest of the scene data
    m_pScene->clearAllData();
    qlib::LDom2Tree out2("scene");
    out2.serialize(m_pScene.get(), false);
    EXPECT_EQ(out2.top()->findChild("appdata"), nullptr);
}
