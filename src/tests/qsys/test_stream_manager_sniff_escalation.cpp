#include <gtest/gtest.h>
#include <common.h>

#include "qsys/InOutHandler.hpp"
#include "qsys/ObjReader.hpp"
#include "qsys/StreamManager.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/GzipStream.hpp>
#include <qlib/LClassUtils.hpp>
#include <qlib/LString.hpp>

#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

using qlib::LString;
using qsys::ObjReader;
using qsys::StreamManager;

// -----------------------------------------------------------------------
// Byte-budget escalation of searchReader{,s}ByContent, pinned with two
// scripted fake readers registered under a private category. Each fake
// reads its stream in 4 KiB blocks and records, per canHandleContent
// call, how many bytes it consumed before the stream ended or its
// script fired. The tests assert the sequence of budgets the harness
// hands out (SNIFF_INITIAL_BYTES, x SNIFF_GROWTH_FACTOR, ceiling clamp)
// and which verdicts are final versus retried.
// -----------------------------------------------------------------------

namespace sniff_escalation {

// Behaviour script, in bytes consumed from the stream.
struct Script
{
    long long yesAt = -1;   // return YES once this many bytes were read
    long long noAt = -1;    // return NO once this many bytes were read
    long long stopAt = -1;  // return UNKNOWN (decisive) once this many bytes were read
    bool throwOnCall = false;
};

struct Call
{
    long long bytesRead;
    bool sawEof;  // the stream returned <= 0 (source EOF or budget cap)
};

struct Recorder
{
    Script script;
    std::vector<Call> calls;
    void reset()
    {
        script = Script();
        calls.clear();
    }
};

int runScript(Recorder &rec, qlib::InStream &ins)
{
    if (rec.script.throwOnCall) {
        rec.calls.push_back(Call{0, false});
        throw std::runtime_error("scripted sniff failure");
    }
    char buf[4096];
    long long total = 0;
    for (;;) {
        if (rec.script.yesAt >= 0 && total >= rec.script.yesAt) {
            rec.calls.push_back(Call{total, false});
            return ObjReader::CONTENT_YES;
        }
        if (rec.script.noAt >= 0 && total >= rec.script.noAt) {
            rec.calls.push_back(Call{total, false});
            return ObjReader::CONTENT_NO;
        }
        if (rec.script.stopAt >= 0 && total >= rec.script.stopAt) {
            rec.calls.push_back(Call{total, false});
            return ObjReader::CONTENT_UNKNOWN;
        }
        int n = ins.read(buf, 0, static_cast<int>(sizeof(buf)));
        if (n <= 0) break;
        total += n;
    }
    rec.calls.push_back(Call{total, true});
    return ObjReader::CONTENT_UNKNOWN;
}

// Private category: the fakes never appear in other tests' searches.
constexpr int kFakeCategory = 1000;

class RecReaderA : public ObjReader
{
public:
    static Recorder &recorder()
    {
        static Recorder r;
        return r;
    }
    bool read(qlib::InStream &) override { return true; }
    qsys::ObjectPtr createDefaultObj() const override { return qsys::ObjectPtr(); }
    const char *getName() const override { return "esc_a"; }
    const char *getTypeDescr() const override { return "Escalation fake A"; }
    const char *getFileExt() const override { return "*.esca"; }
    int getCatID() const override { return kFakeCategory; }
    int canHandleContent(qlib::InStream &ins) const override
    {
        return runScript(recorder(), ins);
    }
};

class RecReaderB : public ObjReader
{
public:
    static Recorder &recorder()
    {
        static Recorder r;
        return r;
    }
    bool read(qlib::InStream &) override { return true; }
    qsys::ObjectPtr createDefaultObj() const override { return qsys::ObjectPtr(); }
    const char *getName() const override { return "esc_b"; }
    const char *getTypeDescr() const override { return "Escalation fake B"; }
    const char *getFileExt() const override { return "*.escb"; }
    int getCatID() const override { return kFakeCategory; }
    int canHandleContent(qlib::InStream &ins) const override
    {
        return runScript(recorder(), ins);
    }
};

}  // namespace sniff_escalation

using sniff_escalation::RecReaderA;
using sniff_escalation::RecReaderB;

namespace {

constexpr long long kInitial = static_cast<long long>(StreamManager::SNIFF_INITIAL_BYTES);
constexpr long long kGrowth = static_cast<long long>(StreamManager::SNIFF_GROWTH_FACTOR);
constexpr long long kKiB = 1024;

std::string makeText(long long nbytes)
{
    std::string out;
    out.reserve(static_cast<size_t>(nbytes) + 64);
    const std::string line = "0123456789abcdefghijklmnopqrstuvwxyz filler line\n";
    while (static_cast<long long>(out.size()) < nbytes) out += line;
    out.resize(static_cast<size_t>(nbytes));
    return out;
}

LString writeTempFile(const std::string &suffix, const std::string &content)
{
    static int s_counter = 0;
    const std::string path = ::testing::TempDir() + "/sniff_esc_" +
                             std::to_string(++s_counter) + suffix;
    std::ofstream out(path, std::ios::binary);
    out.write(content.data(), static_cast<std::streamsize>(content.size()));
    out.close();
    return LString(path.c_str());
}

LString writeTempGzip(const std::string &content)
{
    static int s_counter = 0;
    const std::string path = ::testing::TempDir() + "/sniff_esc_gz_" +
                             std::to_string(++s_counter) + ".txt.gz";
    qlib::FileOutStream fos;
    fos.open(LString(path.c_str()));
    qlib::GzipOutStream gz(fos);
    gz.write(content.data(), 0, static_cast<int>(content.size()));
    gz.close();
    fos.close();
    return LString(path.c_str());
}

std::vector<long long> bytesPerCall(const sniff_escalation::Recorder &rec)
{
    std::vector<long long> out;
    for (const auto &c : rec.calls) out.push_back(c.bytesRead);
    return out;
}

class SniffEscalationTest : public ::testing::Test
{
protected:
    static qlib::LClass *s_pClsA;
    static qlib::LClass *s_pClsB;

    static void SetUpTestSuite()
    {
        qlib::ClassRegistry *pCR = qlib::ClassRegistry::getInstance();
        s_pClsA = MB_NEW qlib::LSpecificClass<RecReaderA>("sniff_escalation::RecReaderA");
        s_pClsB = MB_NEW qlib::LSpecificClass<RecReaderB>("sniff_escalation::RecReaderB");
        pCR->regClassObj(s_pClsA);
        pCR->regClassObj(s_pClsB);
        StreamManager *sm = StreamManager::getInstance();
        sm->registReader<RecReaderA>();
        sm->registReader<RecReaderB>();
    }

    static void TearDownTestSuite()
    {
        StreamManager *sm = StreamManager::getInstance();
        sm->unregistReader(LString(typeid(RecReaderA).name()));
        sm->unregistReader(LString(typeid(RecReaderB).name()));
        qlib::ClassRegistry *pCR = qlib::ClassRegistry::getInstance();
        pCR->unregClassObj<RecReaderA>();
        pCR->unregClassObj<RecReaderB>();
        delete s_pClsA;
        delete s_pClsB;
        s_pClsA = nullptr;
        s_pClsB = nullptr;
    }

    void SetUp() override
    {
        RecReaderA::recorder().reset();
        RecReaderB::recorder().reset();
    }

    static LString searchFirst(const LString &path, qlib::quint64 ceiling,
                               bool supportCompression = false)
    {
        return StreamManager::getInstance()->searchReaderByContent(
            path, LString(), sniff_escalation::kFakeCategory, supportCompression, ceiling);
    }

    static LString searchAll(const LString &path, qlib::quint64 ceiling)
    {
        return StreamManager::getInstance()->searchReadersByContent(
            path, LString(), sniff_escalation::kFakeCategory, false, ceiling);
    }
};

qlib::LClass *SniffEscalationTest::s_pClsA = nullptr;
qlib::LClass *SniffEscalationTest::s_pClsB = nullptr;

}  // namespace

// Sanity: the private category is visible to the search and both fakes
// are candidates (ABI-name order puts A before B).
TEST_F(SniffEscalationTest, FakesAreRegisteredUnderPrivateCategory)
{
    StreamManager *sm = StreamManager::getInstance();
    EXPECT_TRUE(sm->isReaderRegistered(LString(typeid(RecReaderA).name())));
    EXPECT_TRUE(sm->isReaderRegistered(LString(typeid(RecReaderB).name())));

    RecReaderA::recorder().script.yesAt = 0;
    RecReaderB::recorder().script.yesAt = 0;
    const LString path = writeTempFile(".txt", makeText(100));
    EXPECT_EQ(searchAll(path, 0), LString("esc_a,esc_b"));
}

// A marker past the initial budget is reached in round 2: the reader
// was cut off at exactly SNIFF_INITIAL_BYTES (truncated UNKNOWN) and
// retried with a bigger budget.
TEST_F(SniffEscalationTest, MarkerPastInitialCapIsFoundByEscalation)
{
    const long long marker = 200 * kKiB;
    RecReaderA::recorder().script.yesAt = marker;
    const LString path = writeTempFile(".txt", makeText(300 * kKiB));

    EXPECT_EQ(searchFirst(path, 0), LString("esc_a"));

    const auto &calls = RecReaderA::recorder().calls;
    ASSERT_EQ(calls.size(), 2u);
    EXPECT_EQ(calls[0].bytesRead, kInitial);
    EXPECT_TRUE(calls[0].sawEof);
    EXPECT_GE(calls[1].bytesRead, marker);
    EXPECT_FALSE(calls[1].sawEof);
}

// UNKNOWN because the file really ended (smaller than the budget) is
// final: no second call.
TEST_F(SniffEscalationTest, UnknownAtTrueEofIsNotRetried)
{
    const long long size = 10 * kKiB;
    const LString path = writeTempFile(".txt", makeText(size));

    EXPECT_TRUE(searchFirst(path, 0).isEmpty());

    EXPECT_EQ(bytesPerCall(RecReaderA::recorder()), std::vector<long long>({size}));
    EXPECT_EQ(bytesPerCall(RecReaderB::recorder()), std::vector<long long>({size}));
    EXPECT_TRUE(RecReaderA::recorder().calls[0].sawEof);
}

// With no ceiling the loop grows the budget by the factor and stops as
// soon as the retried reader reaches true EOF.
TEST_F(SniffEscalationTest, SecondRoundReachingEofStopsLoop)
{
    const long long size = 300 * kKiB;
    ASSERT_LT(size, kInitial * kGrowth);
    const LString path = writeTempFile(".txt", makeText(size));

    EXPECT_TRUE(searchFirst(path, 0).isEmpty());

    EXPECT_EQ(bytesPerCall(RecReaderA::recorder()), std::vector<long long>({kInitial, size}));
    EXPECT_EQ(bytesPerCall(RecReaderB::recorder()), std::vector<long long>({kInitial, size}));
}

// The ceiling clamps the final round: 64 KiB then 128 KiB, then stop
// even though the reader was still cut off.
TEST_F(SniffEscalationTest, CeilingClampsFinalRound)
{
    const long long ceiling = 128 * kKiB;
    const LString path = writeTempFile(".txt", makeText(300 * kKiB));

    EXPECT_TRUE(searchFirst(path, static_cast<qlib::quint64>(ceiling)).isEmpty());

    EXPECT_EQ(bytesPerCall(RecReaderA::recorder()), std::vector<long long>({kInitial, ceiling}));
    EXPECT_EQ(bytesPerCall(RecReaderB::recorder()), std::vector<long long>({kInitial, ceiling}));
}

// A ceiling below the initial budget means one round at the ceiling.
TEST_F(SniffEscalationTest, CeilingBelowInitialIsSingleRound)
{
    const long long ceiling = 1024;
    const LString path = writeTempFile(".txt", makeText(300 * kKiB));

    EXPECT_TRUE(searchFirst(path, static_cast<qlib::quint64>(ceiling)).isEmpty());

    EXPECT_EQ(bytesPerCall(RecReaderA::recorder()), std::vector<long long>({ceiling}));
    EXPECT_EQ(bytesPerCall(RecReaderB::recorder()), std::vector<long long>({ceiling}));
}

TEST_F(SniffEscalationTest, CeilingEqualToInitialIsSingleRound)
{
    const LString path = writeTempFile(".txt", makeText(300 * kKiB));

    EXPECT_TRUE(searchFirst(path, static_cast<qlib::quint64>(kInitial)).isEmpty());

    EXPECT_EQ(bytesPerCall(RecReaderA::recorder()), std::vector<long long>({kInitial}));
    EXPECT_EQ(bytesPerCall(RecReaderB::recorder()), std::vector<long long>({kInitial}));
}

// NO is final even though the reader had consumed only part of its
// budget; the other (truncated) reader still escalates on its own.
TEST_F(SniffEscalationTest, NoIsFinal)
{
    RecReaderA::recorder().script.noAt = 4096;
    const LString path = writeTempFile(".txt", makeText(300 * kKiB));

    EXPECT_TRUE(searchFirst(path, 0).isEmpty());

    EXPECT_EQ(bytesPerCall(RecReaderA::recorder()), std::vector<long long>({4096}));
    EXPECT_EQ(RecReaderB::recorder().calls.size(), 2u);
}

// A reader that stops early with budget to spare (decisive UNKNOWN,
// e.g. "line 2 is not a number") is final: the budget was not what
// stopped it.
TEST_F(SniffEscalationTest, DecisiveUnknownIsFinal)
{
    RecReaderA::recorder().script.stopAt = 8192;
    const LString path = writeTempFile(".txt", makeText(300 * kKiB));

    EXPECT_TRUE(searchFirst(path, 0).isEmpty());

    EXPECT_EQ(bytesPerCall(RecReaderA::recorder()), std::vector<long long>({8192}));
    EXPECT_EQ(RecReaderB::recorder().calls.size(), 2u);
}

// An exception inside canHandleContent is swallowed as a final UNKNOWN
// and does not abort the search for the other readers.
TEST_F(SniffEscalationTest, ThrowingReaderIsFinalUnknown)
{
    RecReaderA::recorder().script.throwOnCall = true;
    RecReaderB::recorder().script.yesAt = 100 * kKiB;
    const LString path = writeTempFile(".txt", makeText(300 * kKiB));

    EXPECT_EQ(searchFirst(path, 0), LString("esc_b"));

    EXPECT_EQ(RecReaderA::recorder().calls.size(), 1u);
    EXPECT_EQ(RecReaderB::recorder().calls.size(), 2u);
}

// First-only search is round-major: a YES from a later candidate in
// round 1 wins immediately, and the earlier (still pending) candidate
// is never retried.
TEST_F(SniffEscalationTest, FirstOnlyReturnsEarlyYesWithoutEscalatingOthers)
{
    RecReaderB::recorder().script.yesAt = 0;
    const LString path = writeTempFile(".txt", makeText(300 * kKiB));

    EXPECT_EQ(searchFirst(path, 0), LString("esc_b"));

    EXPECT_EQ(bytesPerCall(RecReaderA::recorder()), std::vector<long long>({kInitial}));
    EXPECT_EQ(RecReaderB::recorder().calls.size(), 1u);
}

// Multi-match keeps escalating the pending reader after another one
// said YES, and reports hits in candidate order regardless of the
// round in which each decided.
TEST_F(SniffEscalationTest, AllModeKeepsEscalatingAndPreservesCandidateOrder)
{
    RecReaderA::recorder().script.yesAt = 200 * kKiB;
    RecReaderB::recorder().script.yesAt = 0;
    const LString path = writeTempFile(".txt", makeText(300 * kKiB));

    EXPECT_EQ(searchAll(path, 0), LString("esc_a,esc_b"));

    EXPECT_EQ(RecReaderA::recorder().calls.size(), 2u);
    EXPECT_EQ(RecReaderA::recorder().calls[0].bytesRead, kInitial);
    EXPECT_EQ(RecReaderB::recorder().calls.size(), 1u);
}

// The budget counts decompressed bytes: a small .gz whose payload puts
// the marker past 64 KiB still needs (and gets) a second round.
TEST_F(SniffEscalationTest, GzipPayloadEscalatesOnDecompressedBytes)
{
    const long long marker = 200 * kKiB;
    RecReaderA::recorder().script.yesAt = marker;
    RecReaderB::recorder().script.stopAt = 0;
    const LString path = writeTempGzip(makeText(300 * kKiB));

    EXPECT_EQ(searchFirst(path, 0, /*supportCompression=*/true), LString("esc_a"));

    const auto &calls = RecReaderA::recorder().calls;
    ASSERT_EQ(calls.size(), 2u);
    EXPECT_EQ(calls[0].bytesRead, kInitial);
    EXPECT_GE(calls[1].bytesRead, marker);
}
