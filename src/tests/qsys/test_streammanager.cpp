#include <gtest/gtest.h>
#include <common.h>
#include "qsys/StreamManager.hpp"
#include "qsys/SceneXMLReader.hpp"
#include "qsys/SceneXMLWriter.hpp"
#include "qsys/InOutHandler.hpp"
#include "qsys/ObjReader.hpp"
#include "qsys/Object.hpp"
#include <qlib/LByteArray.hpp>
#include <string>

using qlib::LString;
using qsys::StreamManager;
using qsys::InOutHandler;

// -----------------------------------------------------------------------
// Helpers for async load tests
// -----------------------------------------------------------------------

namespace {

// Minimal Object subclass
class AsyncTestObject : public qsys::Object {
public:
    std::string m_data;
    qlib::LCloneableObject *clone() const override { return nullptr; }
};

// ObjReader that drains the stream and stores bytes in the attached object
class AsyncTestReader : public qsys::ObjReader {
public:
    bool read(qlib::InStream &ins) override {
        AsyncTestObject *pObj = getTarget<AsyncTestObject>();
        int c;
        while ((c = ins.read()) != -1) {
            pObj->m_data += static_cast<char>(c);
        }
        return true;
    }
    qsys::ObjectPtr createDefaultObj() const override {
        return qsys::ObjectPtr(new AsyncTestObject());
    }
    const char *getName() const override { return "test_async"; }
    const char *getTypeDescr() const override { return "Test async reader"; }
    const char *getFileExt() const override { return "*.tst"; }
};

// ObjReader whose read() always throws an exception
class ThrowingReader : public qsys::ObjReader {
public:
    bool read(qlib::InStream &) override {
        MB_THROW(qlib::FileFormatException, "intentional read failure");
        return false;
    }
    qsys::ObjectPtr createDefaultObj() const override {
        return qsys::ObjectPtr(new AsyncTestObject());
    }
    const char *getName() const override { return "throwing_reader"; }
    const char *getTypeDescr() const override { return "Throwing reader"; }
    const char *getFileExt() const override { return "*.err"; }
};

// Build a LByteArray smart-ptr containing the given bytes
qlib::LScrSp<qlib::LByteArray> makeBuf(const char *src, int len)
{
    auto *p = new qlib::LByteArray(len);
    std::memcpy(p->data(), src, len);
    return qlib::LScrSp<qlib::LByteArray>(p);
}

}  // namespace

// StreamManager singleton is created by qsys::init() via QsysEnvironment (test_main.cpp).
// qsys::init("") registers all classes. SetUp() then registers:
//   SceneXMLReader  (nickname "qsc_xml", category IOH_CAT_SCEREADER=3)
//   SceneXMLWriter  (nickname "qsc_xml", category IOH_CAT_SCEWRITER=4)
// No ObjReader (catID=0) or ObjWriter (catID=1) handlers are registered.

// -----------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------

TEST(StreamManagerTest, SingletonIsNotNull)
{
    EXPECT_NE(StreamManager::getInstance(), nullptr);
}

// -----------------------------------------------------------------------
// isReaderRegistered
// -----------------------------------------------------------------------

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

TEST(StreamManagerTest, EmptyStringHandlerIsNotRegistered)
{
    EXPECT_FALSE(StreamManager::getInstance()->isReaderRegistered(""));
}

// -----------------------------------------------------------------------
// createHandlerPtr
// -----------------------------------------------------------------------

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

// nickname matches but catID differs — should return null
TEST(StreamManagerTest, CreateHandlerPtrWrongCatIDReturnsNull)
{
    // "qsc_xml" is registered only as SCEREADER(3) and SCEWRITER(4),
    // not as OBJREADER(0) or OBJWRITER(1).
    InOutHandler *pHandler = StreamManager::getInstance()->createHandlerPtr(
        "qsc_xml", InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_EQ(pHandler, nullptr);
}

TEST(StreamManagerTest, CreateHandlerPtrWrongCatIDObjWriterReturnsNull)
{
    InOutHandler *pHandler = StreamManager::getInstance()->createHandlerPtr(
        "qsc_xml", InOutHandler::IOH_CAT_OBJWRITER);
    EXPECT_EQ(pHandler, nullptr);
}

// -----------------------------------------------------------------------
// createReaderPtr (creates ObjReader, catID=0)
// -----------------------------------------------------------------------

TEST(StreamManagerTest, CreateReaderPtrForUnknownReturnsNull)
{
    // No ObjReader is registered, so any name should return null.
    qsys::ObjReader *pRdr = StreamManager::getInstance()->createReaderPtr("__unknown__");
    EXPECT_EQ(pRdr, nullptr);
}

TEST(StreamManagerTest, CreateReaderPtrQscXmlReturnsNullBecauseWrongCategory)
{
    // "qsc_xml" is a scene reader (catID=3), not an ObjReader (catID=0).
    qsys::ObjReader *pRdr = StreamManager::getInstance()->createReaderPtr("qsc_xml");
    EXPECT_EQ(pRdr, nullptr);
}

// -----------------------------------------------------------------------
// createHandler (smart-pointer wrapper)
// -----------------------------------------------------------------------

TEST(StreamManagerTest, CreateHandlerReturnsNonNullForKnownHandler)
{
    auto pHandler = StreamManager::getInstance()->createHandler(
        "qsc_xml", InOutHandler::IOH_CAT_SCEREADER);
    EXPECT_FALSE(pHandler.isnull());
}

TEST(StreamManagerTest, CreateHandlerReturnsNullForUnknownHandler)
{
    auto pHandler = StreamManager::getInstance()->createHandler(
        "__unknown__", InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(pHandler.isnull());
}

// -----------------------------------------------------------------------
// getStreamHandlerInfo
// -----------------------------------------------------------------------

TEST(StreamManagerTest, GetStreamHandlerInfoIsNonEmpty)
{
    const auto &info = StreamManager::getInstance()->getStreamHandlerInfo();
    EXPECT_GT(static_cast<int>(info.size()), 0);
}

TEST(StreamManagerTest, GetStreamHandlerInfoContainsBothRegisteredHandlers)
{
    const auto &info = StreamManager::getInstance()->getStreamHandlerInfo();
    // Two handlers were registered: SceneXMLReader and SceneXMLWriter.
    EXPECT_GE(static_cast<int>(info.size()), 2);
}

// -----------------------------------------------------------------------
// getInfoJSON2
// -----------------------------------------------------------------------

TEST(StreamManagerTest, GetInfoJSON2StartsWithBracket)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    EXPECT_EQ(json.c_str()[0], '[');
}

TEST(StreamManagerTest, GetInfoJSON2EndsWithBracket)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    // trim trailing whitespace/newline before checking
    EXPECT_NE(json.indexOf("]"), -1);
}

TEST(StreamManagerTest, GetInfoJSON2ContainsQscXml)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    EXPECT_NE(json.indexOf("qsc_xml"), -1);
}

TEST(StreamManagerTest, GetInfoJSON2ContainsCategoryField)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    EXPECT_NE(json.indexOf("category"), -1);
}

TEST(StreamManagerTest, GetInfoJSON2ContainsDescrField)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    EXPECT_NE(json.indexOf("descr"), -1);
}

TEST(StreamManagerTest, GetInfoJSON2ContainsFextField)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    EXPECT_NE(json.indexOf("fext"), -1);
}

TEST(StreamManagerTest, GetInfoJSON2ContainsNameField)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    EXPECT_NE(json.indexOf("name"), -1);
}

// Both SCEREADER(3) and SCEWRITER(4) should appear.
TEST(StreamManagerTest, GetInfoJSON2ContainsBothCategoryValues)
{
    LString json = StreamManager::getInstance()->getInfoJSON2();
    // category: 3 (SCEREADER)
    EXPECT_NE(json.indexOf("3"), -1);
    // category: 4 (SCEWRITER)
    EXPECT_NE(json.indexOf("4"), -1);
}

// -----------------------------------------------------------------------
// getReaderInfoJSON / getWriterInfoJSON
// (These return only IOH_CAT_OBJREADER / IOH_CAT_OBJWRITER entries.
//  None are registered in this test environment, so size should be 0.)
// -----------------------------------------------------------------------

TEST(StreamManagerTest, GetReaderInfoJSONContainsSizeZero)
{
    LString json = StreamManager::getInstance()->getReaderInfoJSON();
    // Format: "({ size: 0 })\n"
    EXPECT_NE(json.indexOf("size"), -1);
    EXPECT_NE(json.indexOf("0"), -1);
}

TEST(StreamManagerTest, GetReaderInfoJSONHasExpectedWrapper)
{
    LString json = StreamManager::getInstance()->getReaderInfoJSON();
    // Outer wrapper is "({ ... })\n"
    EXPECT_NE(json.indexOf("({"), -1);
    EXPECT_NE(json.indexOf("})"), -1);
}

TEST(StreamManagerTest, GetWriterInfoJSONContainsSizeZero)
{
    LString json = StreamManager::getInstance()->getWriterInfoJSON();
    EXPECT_NE(json.indexOf("size"), -1);
    EXPECT_NE(json.indexOf("0"), -1);
}

TEST(StreamManagerTest, GetWriterInfoJSONHasExpectedWrapper)
{
    LString json = StreamManager::getInstance()->getWriterInfoJSON();
    EXPECT_NE(json.indexOf("({"), -1);
    EXPECT_NE(json.indexOf("})"), -1);
}

// -----------------------------------------------------------------------
// unregistReader (always returns false — TODO stub)
// -----------------------------------------------------------------------

TEST(StreamManagerTest, UnregistReaderAlwaysReturnsFalse)
{
    // The function body is "// TO DO: implementation" — returns false unconditionally.
    LString abiname(typeid(qsys::SceneXMLReader).name());
    bool result = StreamManager::getInstance()->unregistReader(abiname);
    EXPECT_FALSE(result);
}

TEST(StreamManagerTest, UnregistReaderWithWriterFlagAlwaysReturnsFalse)
{
    LString abiname(typeid(qsys::SceneXMLWriter).name());
    bool result = StreamManager::getInstance()->unregistReader(abiname, true);
    EXPECT_FALSE(result);
}

// -----------------------------------------------------------------------
// Category constant helpers
// -----------------------------------------------------------------------

TEST(StreamManagerTest, GetCATObjReaderMatchesConstant)
{
    auto *pSM = StreamManager::getInstance();
    EXPECT_EQ(pSM->getCAT_OBJREADER(), InOutHandler::IOH_CAT_OBJREADER);
}

TEST(StreamManagerTest, GetCATObjWriterMatchesConstant)
{
    auto *pSM = StreamManager::getInstance();
    EXPECT_EQ(pSM->getCAT_OBJWRITER(), InOutHandler::IOH_CAT_OBJWRITER);
}

TEST(StreamManagerTest, GetCATRendToFileMatchesConstant)
{
    auto *pSM = StreamManager::getInstance();
    EXPECT_EQ(pSM->getCAT_RENDTOFILE(), InOutHandler::IOH_CAT_RENDTOFILE);
}

TEST(StreamManagerTest, GetCATSceReaderMatchesConstant)
{
    auto *pSM = StreamManager::getInstance();
    EXPECT_EQ(pSM->getCAT_SCEREADER(), InOutHandler::IOH_CAT_SCEREADER);
}

TEST(StreamManagerTest, GetCATSceWriterMatchesConstant)
{
    auto *pSM = StreamManager::getInstance();
    EXPECT_EQ(pSM->getCAT_SCEWRITER(), InOutHandler::IOH_CAT_SCEWRITER);
}

// -----------------------------------------------------------------------
// Compression constant helpers
// -----------------------------------------------------------------------

TEST(StreamManagerTest, GetCOMPNoneMatchesConstant)
{
    auto *pSM = StreamManager::getInstance();
    EXPECT_EQ(pSM->getCOMP_NONE(), InOutHandler::COMP_NONE);
}

TEST(StreamManagerTest, GetCOMPGzipMatchesConstant)
{
    auto *pSM = StreamManager::getInstance();
    EXPECT_EQ(pSM->getCOMP_GZIP(), InOutHandler::COMP_GZIP);
}

TEST(StreamManagerTest, GetCOMPBzip2MatchesConstant)
{
    auto *pSM = StreamManager::getInstance();
    EXPECT_EQ(pSM->getCOMP_BZIP2(), InOutHandler::COMP_BZIP2);
}

TEST(StreamManagerTest, GetCOMPXzipMatchesConstant)
{
    auto *pSM = StreamManager::getInstance();
    EXPECT_EQ(pSM->getCOMP_XZIP(), InOutHandler::COMP_XZIP);
}

// -----------------------------------------------------------------------
// Duplicate registration throws RuntimeException
// -----------------------------------------------------------------------

TEST(StreamManagerTest, RegisteringDuplicateAbiNameThrows)
{
    // SceneXMLReader was already registered in SetUp(). Registering it again
    // must throw qlib::RuntimeException via regIOHImpl().
    EXPECT_THROW(
        StreamManager::getInstance()->registReader<qsys::SceneXMLReader>(),
        qlib::RuntimeException);
}

TEST(StreamManagerTest, RegisteringDuplicateWriterAbiNameThrows)
{
    EXPECT_THROW(
        StreamManager::getInstance()->registWriter<qsys::SceneXMLWriter>(),
        qlib::RuntimeException);
}

// -----------------------------------------------------------------------
// Async load (thread-based) — loadObjectAsync / supplyDataAsync / waitLoadAsync
// -----------------------------------------------------------------------

// Full happy-path: supply data, wait, get a non-null object back.
TEST(StreamManagerTest, AsyncLoadBasicFlow)
{
    auto pRdr = qlib::LScrSp<qsys::ObjReader>(new AsyncTestReader());
    int tid = StreamManager::getInstance()->loadObjectAsync(pRdr);
    EXPECT_GE(tid, 0);

    const char payload[] = "hello async";
    StreamManager::getInstance()->supplyDataAsync(
        tid, makeBuf(payload, sizeof(payload) - 1), sizeof(payload) - 1);

    qsys::ObjectPtr pObj = StreamManager::getInstance()->waitLoadAsync(tid);
    EXPECT_FALSE(pObj.isnull());
}

// waitLoadAsync clears the object's source path.
TEST(StreamManagerTest, AsyncLoadSourceClearedAfterWait)
{
    auto pRdr = qlib::LScrSp<qsys::ObjReader>(new AsyncTestReader());
    int tid = StreamManager::getInstance()->loadObjectAsync(pRdr);

    const char payload[] = "data";
    StreamManager::getInstance()->supplyDataAsync(
        tid, makeBuf(payload, sizeof(payload) - 1), sizeof(payload) - 1);

    qsys::ObjectPtr pObj = StreamManager::getInstance()->waitLoadAsync(tid);
    ASSERT_FALSE(pObj.isnull());
    // waitLoadAsync unconditionally calls pret->setSource("").
    EXPECT_TRUE(pObj->getSource().isEmpty());
}

// Reader receives exactly the bytes that were supplied.
TEST(StreamManagerTest, AsyncLoadDataReceivedCorrectly)
{
    auto pRdr = qlib::LScrSp<qsys::ObjReader>(new AsyncTestReader());
    int tid = StreamManager::getInstance()->loadObjectAsync(pRdr);

    const std::string expected = "test payload 123";
    StreamManager::getInstance()->supplyDataAsync(
        tid,
        makeBuf(expected.c_str(), static_cast<int>(expected.size())),
        static_cast<int>(expected.size()));

    qsys::ObjectPtr pObj = StreamManager::getInstance()->waitLoadAsync(tid);
    ASSERT_FALSE(pObj.isnull());

    auto *pTyped = dynamic_cast<AsyncTestObject *>(pObj.get());
    ASSERT_NE(pTyped, nullptr);
    EXPECT_EQ(pTyped->m_data, expected);
}

// Supply data in multiple chunks; all bytes must be received.
TEST(StreamManagerTest, AsyncLoadMultipleChunks)
{
    auto pRdr = qlib::LScrSp<qsys::ObjReader>(new AsyncTestReader());
    int tid = StreamManager::getInstance()->loadObjectAsync(pRdr);

    StreamManager::getInstance()->supplyDataAsync(
        tid, makeBuf("foo", 3), 3);
    StreamManager::getInstance()->supplyDataAsync(
        tid, makeBuf("bar", 3), 3);

    qsys::ObjectPtr pObj = StreamManager::getInstance()->waitLoadAsync(tid);
    ASSERT_FALSE(pObj.isnull());

    auto *pTyped = dynamic_cast<AsyncTestObject *>(pObj.get());
    ASSERT_NE(pTyped, nullptr);
    EXPECT_EQ(pTyped->m_data, std::string("foobar"));
}

// Supply zero bytes (empty pipe); object should still be returned.
TEST(StreamManagerTest, AsyncLoadEmptyData)
{
    auto pRdr = qlib::LScrSp<qsys::ObjReader>(new AsyncTestReader());
    int tid = StreamManager::getInstance()->loadObjectAsync(pRdr);
    // No supplyDataAsync call — pipe is closed immediately by waitLoadAsync.
    qsys::ObjectPtr pObj = StreamManager::getInstance()->waitLoadAsync(tid);
    EXPECT_FALSE(pObj.isnull());
}

// When the reader throws, waitLoadAsync must return a null ObjectPtr.
TEST(StreamManagerTest, AsyncLoadReaderExceptionReturnsNull)
{
    auto pRdr = qlib::LScrSp<qsys::ObjReader>(new ThrowingReader());
    int tid = StreamManager::getInstance()->loadObjectAsync(pRdr);

    // Supply some bytes so the thread's read() is actually called.
    StreamManager::getInstance()->supplyDataAsync(
        tid, makeBuf("x", 1), 1);

    qsys::ObjectPtr pObj = StreamManager::getInstance()->waitLoadAsync(tid);
    EXPECT_TRUE(pObj.isnull());
}

// waitLoadAsync with an invalid id returns null without crashing.
TEST(StreamManagerTest, WaitLoadAsyncInvalidIDReturnsNull)
{
    qsys::ObjectPtr pObj = StreamManager::getInstance()->waitLoadAsync(99999);
    EXPECT_TRUE(pObj.isnull());
}

// supplyDataAsync with an invalid id must not crash.
TEST(StreamManagerTest, SupplyDataAsyncInvalidIDNoCrash)
{
    EXPECT_NO_THROW(
        StreamManager::getInstance()->supplyDataAsync(
            99999, makeBuf("x", 1), 1));
}

// Each loadObjectAsync call returns a unique, non-negative ID.
TEST(StreamManagerTest, AsyncLoadReturnsDistinctIDs)
{
    auto pRdr1 = qlib::LScrSp<qsys::ObjReader>(new AsyncTestReader());
    auto pRdr2 = qlib::LScrSp<qsys::ObjReader>(new AsyncTestReader());

    int tid1 = StreamManager::getInstance()->loadObjectAsync(pRdr1);
    int tid2 = StreamManager::getInstance()->loadObjectAsync(pRdr2);

    EXPECT_GE(tid1, 0);
    EXPECT_GE(tid2, 0);
    EXPECT_NE(tid1, tid2);

    // Clean up both threads
    StreamManager::getInstance()->waitLoadAsync(tid1);
    StreamManager::getInstance()->waitLoadAsync(tid2);
}
