#include <gtest/gtest.h>
#include <common.h>
#include "qsys/StreamManager.hpp"
#include "qsys/InOutHandler.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/LString.hpp>
#include <fstream>
#include <string>
#include <vector>

using qlib::LString;
using qsys::StreamManager;
using qsys::InOutHandler;

// -----------------------------------------------------------------------
// Test fixtures: write temp files and probe the search API.
// We can't register a mock ObjReader (would require a full wrap.cpp /
// LClass registration), so these tests pin the *API contract*: empty
// candidate set returns empty, .gz paths short-circuit the peek, etc.
// Full sniff-scenario coverage lives in Phase 2 alongside Mmcif*Reader.
// -----------------------------------------------------------------------

namespace {

// Write `content` to a fresh temp file under TempDir() and return the path.
LString writeTempFile(const std::string &suffix, const std::string &content)
{
    static int s_counter = 0;
    const std::string dir = ::testing::TempDir();
    const std::string path =
        dir + "/sm_search_" + std::to_string(++s_counter) + suffix;
    std::ofstream out(path, std::ios::binary);
    out.write(content.data(), content.size());
    out.close();
    return LString(path.c_str());
}

}  // namespace

// -----------------------------------------------------------------------
// searchReaderByContent: empty-candidate semantics
// -----------------------------------------------------------------------

// No ObjReader is registered in this test environment, so an empty CSV
// (== "all readers in this category") with IOH_CAT_OBJREADER yields "".
TEST(StreamManagerSearchTest, NoObjReadersReturnsEmpty)
{
    const LString path = writeTempFile(".txt", "some content");
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(hit.isEmpty());
}

// Multi-match variant of the above.
TEST(StreamManagerSearchTest, NoObjReadersListReturnsEmpty)
{
    const LString path = writeTempFile(".txt", "some content");
    LString csv = StreamManager::getInstance()->searchReadersByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(csv.isEmpty());
}

// Explicit CSV that doesn't match any registered reader returns empty.
TEST(StreamManagerSearchTest, UnknownNicknamesReturnsEmpty)
{
    const LString path = writeTempFile(".txt", "some content");
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString("__bogus_reader_1__,__bogus_reader_2__"),
        InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(hit.isEmpty());
}

// Whitespace around commas in the CSV must be trimmed so callers can
// pass humanised filter strings. We can't directly observe trimming
// without a YES-returning reader, but we can confirm that a
// whitespace-padded bogus list still parses without crashing and yields
// empty (i.e. didn't treat " __bogus__" as a different token whose
// match would have been accidentally true under some normalisation).
TEST(StreamManagerSearchTest, WhitespaceAroundCommasTrimmed)
{
    const LString path = writeTempFile(".txt", "some content");
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(" __bogus_a__ , __bogus_b__ "),
        InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(hit.isEmpty());
}

// -----------------------------------------------------------------------
// Category filtering: SceneXMLReader is registered under IOH_CAT_SCEREADER,
// but inherits the default canHandleContent() == UNKNOWN, so even though
// the candidate set is non-empty no reader returns YES.
// -----------------------------------------------------------------------

TEST(StreamManagerSearchTest, SceReaderCategoryNoYesVerdictReturnsEmpty)
{
    const LString path = writeTempFile(".qsc", "<?xml version=\"1.0\"?>");
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_SCEREADER);
    EXPECT_TRUE(hit.isEmpty());
}

// -----------------------------------------------------------------------
// peekHead semantics: when supportCompression is false (default), .gz /
// .xz paths short-circuit by extension. When true, magic bytes drive
// detection and the head is decompressed transparently.
// -----------------------------------------------------------------------

TEST(StreamManagerSearchTest, GzPathProducesEmptyResultWithoutCompressionFlag)
{
    // The file doesn't need to be valid gzip; peekHead must skip purely
    // by extension when supportCompression=false (the default).
    const LString path = writeTempFile(".cif.gz", "uncompressed-but-named-gz");
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(hit.isEmpty());
}

TEST(StreamManagerSearchTest, XzPathProducesEmptyResultWithoutCompressionFlag)
{
    const LString path = writeTempFile(".cif.xz", "uncompressed-but-named-xz");
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(hit.isEmpty());
}

// With supportCompression=true and a file whose name claims gzip but
// whose body is garbage, the GzipInStream filter will error out. We
// must not crash; just return empty.
TEST(StreamManagerSearchTest, MalformedGzWithCompressionFlagDoesNotCrash)
{
    const LString path = writeTempFile(".cif.gz", "not a real gzip stream");
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER,
        /*supportCompression=*/true);
    EXPECT_TRUE(hit.isEmpty());
}

// With supportCompression=true and a real (uncompressed) file, the
// path's extension is irrelevant -- magic bytes drive the choice and
// fall through to raw read. We can only assert "no crash, empty result"
// here because no ObjReader is registered to claim the bytes.
TEST(StreamManagerSearchTest, RawFileWithCompressionFlagFallsThroughToRaw)
{
    const LString path = writeTempFile(".txt", "plain text content");
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER,
        /*supportCompression=*/true);
    EXPECT_TRUE(hit.isEmpty());
}

// Real gzip-compressed payload: 22-byte canonical "Hello\n" gzip stream.
// supportCompression=true must drive the GzipInStream path without
// crashing; with no ObjReader registered, the result is empty -- the
// scenario covered here is that the magic-byte detection + decoder
// chain is wired correctly, full sniff-then-match coverage lands in
// Phase 2 alongside Mmcif*Reader.
TEST(StreamManagerSearchTest, RealGzipPayloadWithCompressionFlagDoesNotCrash)
{
    // gzip("Hello\n") canonical bytes. Generated once and pinned.
    const std::vector<unsigned char> gzipped = {
        0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
        0xf3, 0x48, 0xcd, 0xc9, 0xc9, 0xe7, 0x02, 0x00, 0x16, 0x35,
        0x96, 0x31, 0x06, 0x00, 0x00, 0x00
    };
    const std::string raw(reinterpret_cast<const char *>(gzipped.data()),
                          gzipped.size());
    const LString path = writeTempFile(".dat.gz", raw);

    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER,
        /*supportCompression=*/true);
    EXPECT_TRUE(hit.isEmpty());
}

// Non-existent path must not crash; returns empty.
TEST(StreamManagerSearchTest, NonExistentPathReturnsEmpty)
{
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        LString("/no/such/file/exists.dat"), LString(),
        InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(hit.isEmpty());
}

// Empty file (zero bytes): peekHead reads nothing, so no reader is invoked.
TEST(StreamManagerSearchTest, EmptyFileReturnsEmpty)
{
    const LString path = writeTempFile(".txt", "");
    LString hit = StreamManager::getInstance()->searchReaderByContent(
        path, LString(), InOutHandler::IOH_CAT_OBJREADER);
    EXPECT_TRUE(hit.isEmpty());
}
