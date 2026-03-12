#include <gtest/gtest.h>
#include <common.h>
#include "qsys/SceneXMLReader.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/InOutHandler.hpp"

using qlib::LString;
using qsys::SceneManager;
using qsys::ScenePtr;

class SceneXMLReaderFixture : public ::testing::Test {
protected:
    ScenePtr m_pScene;

    void SetUp() override
    {
        m_pScene = SceneManager::getInstance()->createScene();
    }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            qlib::uid_t uid = m_pScene->getUID();
            m_pScene = ScenePtr();
            SceneManager::getInstance()->destroyScene(uid);
        }
    }
};

TEST(SceneXMLReaderTest, GetName)
{
    qsys::SceneXMLReader r;
    EXPECT_STREQ(r.getName(), "qsc_xml");
}

TEST(SceneXMLReaderTest, GetTypeDescrNotEmpty)
{
    qsys::SceneXMLReader r;
    EXPECT_GT(LString(r.getTypeDescr()).length(), 0);
}

TEST(SceneXMLReaderTest, GetFileExtNotEmpty)
{
    qsys::SceneXMLReader r;
    EXPECT_GT(LString(r.getFileExt()).length(), 0);
}

TEST(SceneXMLReaderTest, GetCatID)
{
    qsys::SceneXMLReader r;
    EXPECT_EQ(r.getCatID(), qsys::InOutHandler::IOH_CAT_SCEREADER);
}

TEST(SceneXMLReaderTest, DefaultBufSize)
{
    qsys::SceneXMLReader r;
    EXPECT_EQ(r.getBufSize(), 1024 * 1024);
}

TEST(SceneXMLReaderTest, SetGetBufSize)
{
    qsys::SceneXMLReader r;
    r.setBufSize(512 * 1024);
    EXPECT_EQ(r.getBufSize(), 512 * 1024);
}

TEST_F(SceneXMLReaderFixture, AttachDetach)
{
    qsys::SceneXMLReader r;
    r.attach(m_pScene);
    EXPECT_FALSE(r.getClient().isnull());
    ScenePtr p = r.detach();
    EXPECT_FALSE(p.isnull());
    EXPECT_TRUE(r.getClient().isnull());
}
