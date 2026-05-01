#include <gtest/gtest.h>
#include <common.h>
#include "qsys/StreamManager.hpp"
#include "qsys/SceneXMLReader.hpp"
#include "qsys/SceneXMLWriter.hpp"
#include "qsys/InOutHandler.hpp"
#include "qsys/ObjReader.hpp"
#include "qsys/Object.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/Camera.hpp"
#include <qlib/LByteArray.hpp>
#include <qlib/LVarArray.hpp>
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

// -----------------------------------------------------------------------
// Minimal JSON parsing helpers for StreamManager JSON tests
// -----------------------------------------------------------------------

// Represents one entry from getInfoJSON2() output.
struct InfoJSON2Entry {
    std::string descr, fext, name;
    int category = -1;
};

// Extract a quoted-string field value from a flat JSON object fragment.
// e.g. extractJsonString(R"({"name": "qsc_xml"})", "name") -> "qsc_xml"
// Returns empty string if the key is not found.
static std::string extractJsonString(const std::string &obj, const std::string &key)
{
    const std::string needle = "\"" + key + "\"";
    auto pos = obj.find(needle);
    if (pos == std::string::npos) return {};
    pos = obj.find('"', pos + needle.size());
    if (pos == std::string::npos) return {};
    auto end = obj.find('"', pos + 1);
    if (end == std::string::npos) return {};
    return obj.substr(pos + 1, end - pos - 1);
}

// Extract an integer field value from a flat JSON object fragment.
// e.g. extractJsonInt(R"({"category": 3})", "category") -> 3
// Returns -1 if the key is not found or the value is not parseable as int.
static int extractJsonInt(const std::string &obj, const std::string &key)
{
    const std::string needle = "\"" + key + "\"";
    auto pos = obj.find(needle);
    if (pos == std::string::npos) return -1;
    pos = obj.find(':', pos + needle.size());
    if (pos == std::string::npos) return -1;
    ++pos;
    while (pos < obj.size() && obj[pos] == ' ') ++pos;
    try { return std::stoi(obj.substr(pos)); }
    catch (...) { return -1; }
}

// Parse the output of StreamManager::getInfoJSON2() into a vector of entries.
// Expected format: [{"descr":"...","fext":"...","name":"...","category":N},...]
// Each top-level {...} is one entry; nested braces are not expected in this output.
static std::vector<InfoJSON2Entry> parseInfoJSON2(const std::string &json)
{
    std::vector<InfoJSON2Entry> result;
    auto pos = json.find('[');
    if (pos == std::string::npos) return result;
    while (true) {
        auto beg = json.find('{', pos);
        if (beg == std::string::npos) break;
        auto end = json.find('}', beg);
        if (end == std::string::npos) break;
        const std::string obj = json.substr(beg, end - beg + 1);
        InfoJSON2Entry e;
        e.descr    = extractJsonString(obj, "descr");
        e.fext     = extractJsonString(obj, "fext");
        e.name     = extractJsonString(obj, "name");
        e.category = extractJsonInt(obj, "category");
        result.push_back(e);
        pos = end + 1;
    }
    return result;
}

// Extract the numeric size field from getReaderInfoJSON()/getWriterInfoJSON() output.
// Format: "({ size: N, ... })\n"  (pseudo-JS, not valid JSON).
// Returns -1 if the field is missing or not parseable as int.
static int extractPseudoJsonSize(const std::string &s)
{
    const std::string needle = "size:";
    auto pos = s.find(needle);
    if (pos == std::string::npos) return -1;
    pos += needle.size();
    while (pos < s.size() && s[pos] == ' ') ++pos;
    try { return std::stoi(s.substr(pos)); }
    catch (...) { return -1; }
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
// getInfoJSON2 -- structural and semantic validation
// -----------------------------------------------------------------------

// Verify the output is a parseable JSON array with exactly the 2 handlers
// registered in this test environment (SceneXMLReader + SceneXMLWriter).
TEST(StreamManagerTest, GetInfoJSON2StructureAndCount)
{
    const std::string json = StreamManager::getInstance()->getInfoJSON2().c_str();
    ASSERT_FALSE(json.empty());
    EXPECT_EQ(json.front(), '[');
    EXPECT_NE(json.find(']'), std::string::npos);
    const auto entries = parseInfoJSON2(json);
    EXPECT_EQ(static_cast<int>(entries.size()), 2);
}

// Verify that every entry has all four required fields with correct types.
// descr/fext/name must be non-empty strings; category must be a non-negative integer.
TEST(StreamManagerTest, GetInfoJSON2EntriesHaveRequiredFields)
{
    const std::string json = StreamManager::getInstance()->getInfoJSON2().c_str();
    const auto entries = parseInfoJSON2(json);
    ASSERT_EQ(static_cast<int>(entries.size()), 2);
    for (const auto &e : entries) {
        EXPECT_FALSE(e.descr.empty()) << "descr must be a non-empty string";
        EXPECT_FALSE(e.fext.empty())  << "fext must be a non-empty string";
        EXPECT_FALSE(e.name.empty())  << "name must be a non-empty string";
        EXPECT_GE(e.category, 0)      << "category must be a non-negative integer";
    }
}

// Verify that the two entries match the registered SceneXMLReader (SCEREADER) and
// SceneXMLWriter (SCEWRITER), using InOutHandler enum constants, not bare literals.
// Entry order is not guaranteed (m_rdrinfotab is sorted by ABI name key).
TEST(StreamManagerTest, GetInfoJSON2EntriesMatchRegisteredHandlers)
{
    const std::string json = StreamManager::getInstance()->getInfoJSON2().c_str();
    const auto entries = parseInfoJSON2(json);
    ASSERT_EQ(static_cast<int>(entries.size()), 2);

    const InfoJSON2Entry *pReader = nullptr, *pWriter = nullptr;
    for (const auto &e : entries) {
        if (e.category == InOutHandler::IOH_CAT_SCEREADER) pReader = &e;
        if (e.category == InOutHandler::IOH_CAT_SCEWRITER) pWriter = &e;
    }
    ASSERT_NE(pReader, nullptr) << "no entry with category IOH_CAT_SCEREADER";
    ASSERT_NE(pWriter, nullptr) << "no entry with category IOH_CAT_SCEWRITER";
    EXPECT_EQ(pReader->name, "qsc_xml");
    EXPECT_EQ(pWriter->name, "qsc_xml");
}

// -----------------------------------------------------------------------
// getReaderInfoJSON / getWriterInfoJSON -- format and size validation
// (These return only IOH_CAT_OBJREADER / IOH_CAT_OBJWRITER entries.
//  Neither is registered in this test environment, so size must be 0.)
// -----------------------------------------------------------------------

// Verify the pseudo-JS wrapper format and that size parses as exactly 0.
TEST(StreamManagerTest, GetReaderInfoJSONStructureAndSizeZero)
{
    const std::string s = StreamManager::getInstance()->getReaderInfoJSON().c_str();
    EXPECT_EQ(s.substr(0, 2), "({") << "output must start with ({";
    EXPECT_NE(s.find("})"), std::string::npos) << "output must contain })";
    EXPECT_EQ(extractPseudoJsonSize(s), 0);
}

// Same invariants for getWriterInfoJSON.
TEST(StreamManagerTest, GetWriterInfoJSONStructureAndSizeZero)
{
    const std::string s = StreamManager::getInstance()->getWriterInfoJSON().c_str();
    EXPECT_EQ(s.substr(0, 2), "({") << "output must start with ({";
    EXPECT_NE(s.find("})"), std::string::npos) << "output must contain })";
    EXPECT_EQ(extractPseudoJsonSize(s), 0);
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

// -----------------------------------------------------------------------
// toXML / fromXML (Camera round-trip via StreamManager)
// -----------------------------------------------------------------------

class StreamManagerXMLFixture : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qlib::uid_t m_sceneID;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();
        m_sceneID = m_pScene->getUID();
    }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            m_pScene = qsys::ScenePtr();
            qsys::SceneManager::getInstance()->destroyScene(m_sceneID);
        }
    }
};

// toXML on a Camera returns a non-null byte array.
TEST_F(StreamManagerXMLFixture, ToXMLCameraReturnsNonNull)
{
    qsys::CameraPtr pCam(MB_NEW qsys::Camera);
    pCam->setZoom(80.0);
    auto pXml = StreamManager::getInstance()->toXML(pCam);
    EXPECT_FALSE(pXml.isnull());
}

// toXML byte array content contains the "camera" element tag.
TEST_F(StreamManagerXMLFixture, ToXMLCameraContainsCameraTag)
{
    qsys::CameraPtr pCam(MB_NEW qsys::Camera);
    auto pXml = StreamManager::getInstance()->toXML(pCam);
    ASSERT_FALSE(pXml.isnull());
    std::string xml(reinterpret_cast<const char *>(pXml->data()), pXml->size());
    EXPECT_NE(xml.find("camera"), std::string::npos);
}

// toXML / fromXML preserves Camera properties through a full round-trip.
// Only properties without a QIF default (name, center, rotation) are always
// written to XML; properties with defaults (zoom, slab, distance) are only
// written when their "default flag" has been cleared via setDefaultPropFlag,
// which copyFrom() does but direct C++ setters do not.
TEST_F(StreamManagerXMLFixture, CameraRoundTripPreservesProperties)
{
    qsys::CameraPtr pCam(MB_NEW qsys::Camera);
    pCam->setName("testcam");
    pCam->setCenter(qlib::Vector4D(1.0, 2.0, 3.0));

    auto pXml = StreamManager::getInstance()->toXML(pCam);
    ASSERT_FALSE(pXml.isnull());

    auto pSObj = StreamManager::getInstance()->fromXML(pXml, m_sceneID);
    ASSERT_FALSE(pSObj.isnull());

    qsys::CameraPtr pRestored(pSObj, qlib::no_throw_tag());
    ASSERT_FALSE(pRestored.isnull());
    EXPECT_EQ(pRestored->getName(), LString("testcam"));
    qlib::Vector4D center = pRestored->getCenter();
    EXPECT_NEAR(center.x(), 1.0, 1e-6);
    EXPECT_NEAR(center.y(), 2.0, 1e-6);
    EXPECT_NEAR(center.z(), 3.0, 1e-6);
}

// arrayToXML with an empty variant array returns a non-null byte array.
TEST_F(StreamManagerXMLFixture, ArrayToXMLEmptyArrayReturnsNonNull)
{
    qlib::LVarArray objs(0);
    auto pXml = StreamManager::getInstance()->arrayToXML(objs);
    EXPECT_FALSE(pXml.isnull());
}

// -----------------------------------------------------------------------
// findCompatibleWriterNamesForObj
// -----------------------------------------------------------------------

// With no ObjWriter registered, result is empty regardless of the object ID.
TEST(StreamManagerTest, FindCompatibleWriterNamesForInvalidIDIsEmpty)
{
    LString result = StreamManager::getInstance()->findCompatibleWriterNamesForObj(99999);
    EXPECT_TRUE(result.isEmpty());
}
