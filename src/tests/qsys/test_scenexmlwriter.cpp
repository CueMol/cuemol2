#include <gtest/gtest.h>
#include <common.h>
#include "qsys/SceneXMLWriter.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/InOutHandler.hpp"

using qlib::LString;
using qsys::SceneManager;
using qsys::ScenePtr;

class SceneXMLWriterFixture : public ::testing::Test {
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

TEST(SceneXMLWriterTest, GetName)
{
    qsys::SceneXMLWriter w;
    EXPECT_STREQ(w.getName(), "qsc_xml");
}

TEST(SceneXMLWriterTest, GetTypeDescrNotEmpty)
{
    qsys::SceneXMLWriter w;
    EXPECT_GT(LString(w.getTypeDescr()).length(), 0);
}

TEST(SceneXMLWriterTest, GetFileExtNotEmpty)
{
    qsys::SceneXMLWriter w;
    EXPECT_GT(LString(w.getFileExt()).length(), 0);
}

TEST(SceneXMLWriterTest, GetCatID)
{
    qsys::SceneXMLWriter w;
    EXPECT_EQ(w.getCatID(), qsys::InOutHandler::IOH_CAT_SCEWRITER);
}

TEST(SceneXMLWriterTest, DefaultCompressModeNone)
{
    qsys::SceneXMLWriter w;
    EXPECT_EQ(w.getCompressMode(), qsys::InOutHandler::COMP_NONE);
}

TEST(SceneXMLWriterTest, SetGetCompressMode)
{
    qsys::SceneXMLWriter w;
    w.setCompressMode(qsys::InOutHandler::COMP_GZIP);
    EXPECT_EQ(w.getCompressMode(), qsys::InOutHandler::COMP_GZIP);
}

TEST(SceneXMLWriterTest, DefaultBase64FlagFalse)
{
    qsys::SceneXMLWriter w;
    EXPECT_FALSE(w.getBase64Flag());
}

TEST(SceneXMLWriterTest, SetGetBase64Flag)
{
    qsys::SceneXMLWriter w;
    w.setBase64Flag(true);
    EXPECT_TRUE(w.getBase64Flag());
    w.setBase64Flag(false);
    EXPECT_FALSE(w.getBase64Flag());
}

TEST(SceneXMLWriterTest, DefaultEmbedAllFalse)
{
    qsys::SceneXMLWriter w;
    EXPECT_FALSE(w.getEmbedAll());
}

TEST(SceneXMLWriterTest, SetGetEmbedAll)
{
    qsys::SceneXMLWriter w;
    w.setEmbedAll(true);
    EXPECT_TRUE(w.getEmbedAll());
    w.setEmbedAll(false);
    EXPECT_FALSE(w.getEmbedAll());
}

TEST(SceneXMLWriterTest, DefaultNumVersionZero)
{
    qsys::SceneXMLWriter w;
    EXPECT_EQ(w.getNumVersion(), 0);
}

TEST(SceneXMLWriterTest, SetGetNumVersion)
{
    qsys::SceneXMLWriter w;
    w.setNumVersion(2);
    EXPECT_EQ(w.getNumVersion(), 2);
}

TEST(SceneXMLWriterTest, SetGetStrVersion)
{
    qsys::SceneXMLWriter w;
    LString ver = w.getStrVersion();
    // after round-trip through setStrVersion, numVersion should be consistent
    w.setStrVersion(ver);
    EXPECT_EQ(w.getStrVersion(), ver);
}

TEST_F(SceneXMLWriterFixture, AttachDetach)
{
    qsys::SceneXMLWriter w;
    w.attach(m_pScene);
    EXPECT_FALSE(w.getClient().isnull());
    ScenePtr p = w.detach();
    EXPECT_FALSE(p.isnull());
    EXPECT_TRUE(w.getClient().isnull());
}
