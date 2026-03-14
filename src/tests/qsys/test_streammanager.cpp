#include <gtest/gtest.h>
#include <common.h>
#include "qsys/StreamManager.hpp"
#include "qsys/SceneXMLReader.hpp"
#include "qsys/SceneXMLWriter.hpp"
#include "qsys/InOutHandler.hpp"

using qlib::LString;
using qsys::StreamManager;
using qsys::InOutHandler;

// StreamManager singleton is created by qsys::init() via QsysEnvironment.
// qsys::init("") registers:
//   SceneXMLReader  (nickname "qsc_xml", category IOH_CAT_SCEREADER)
//   SceneXMLWriter  (nickname "qsc_xml", category IOH_CAT_SCEWRITER)

TEST(StreamManagerTest, SingletonIsNotNull)
{
    EXPECT_NE(StreamManager::getInstance(), nullptr);
}

TEST(StreamManagerTest, SceneXMLReaderIsRegistered)
{
    LString abiname(typeid(qsys::SceneXMLReader).name());
    EXPECT_TRUE(StreamManager::getInstance()->isReaderRegistered(abiname));
}

TEST(StreamManagerTest, SceneXMLWriterIsRegistered)
{
    LString abiname(typeid(qsys::SceneXMLWriter).name());
    EXPECT_TRUE(StreamManager::getInstance()->isReaderRegistered(abiname));
}

TEST(StreamManagerTest, UnknownHandlerIsNotRegistered)
{
    EXPECT_FALSE(StreamManager::getInstance()->isReaderRegistered("__nonexistent__"));
}

TEST(StreamManagerTest, GetInfoJSON2ContainsQscXml)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    EXPECT_NE(json.indexOf("qsc_xml"), -1);
}

TEST(StreamManagerTest, CreateSceneReaderHandlerSucceeds)
{
    InOutHandler *pHandler = StreamManager::getInstance()->createHandlerPtr(
        "qsc_xml", InOutHandler::IOH_CAT_SCEREADER);
    EXPECT_NE(pHandler, nullptr);
    delete pHandler;
}

TEST(StreamManagerTest, CreateSceneWriterHandlerSucceeds)
{
    InOutHandler *pHandler = StreamManager::getInstance()->createHandlerPtr(
        "qsc_xml", InOutHandler::IOH_CAT_SCEWRITER);
    EXPECT_NE(pHandler, nullptr);
    delete pHandler;
}

TEST(StreamManagerTest, CreateHandlerPtrForUnknownNicknameReturnsNull)
{
    InOutHandler *pHandler = StreamManager::getInstance()->createHandlerPtr(
        "__unknown__", InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(pHandler, nullptr);
}

TEST(StreamManagerTest, GetInfoJSON2ContainsCategoryField)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    EXPECT_NE(json.indexOf("category"), -1);
}
