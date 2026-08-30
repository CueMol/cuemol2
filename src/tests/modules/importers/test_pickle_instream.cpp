#include <gtest/gtest.h>
#include <common.h>
#include <cstring>
#include <memory>
#include <string>
#include <qlib/LExceptions.hpp>
#include <qlib/StringStream.hpp>
#include "importers/PickleInStream.hpp"

using importers::PickleInStream;
using qlib::LVarDict;
using qlib::LVariant;
using qlib::LVarList;
using qlib::StrInStream;

namespace {

// Emits the subset of pickle protocol 2 opcodes that PickleInStream reads.
class PickleBuilder
{
public:
    void emptyDict()
    {
        m_buf += '}';
    }
    void emptyList()
    {
        m_buf += ']';
    }
    void mark()
    {
        m_buf += '(';
    }
    void stop()
    {
        m_buf += '.';
    }
    void setItem()
    {
        m_buf += 's';
    }
    void setItems()
    {
        m_buf += 'u';
    }
    void appends()
    {
        m_buf += 'e';
    }
    void binput(int i)
    {
        m_buf += 'q';
        m_buf += char(i);
    }
    void binget(int i)
    {
        m_buf += 'h';
        m_buf += char(i);
    }
    void binint(int v)
    {
        m_buf += 'J';
        le32(v);
    }
    void binstring(const std::string &s)
    {
        m_buf += 'T';
        le32(int(s.size()));
        m_buf += s;
    }
    void binunicode(const std::string &s)
    {
        m_buf += 'X';
        le32(int(s.size()));
        m_buf += s;
    }

    void binfloat(double d)
    {
        m_buf += 'G';
        unsigned char raw[sizeof(double)];
        std::memcpy(raw, &d, sizeof(double));
        // BINFLOAT payload is big-endian
        if (hostIsLittleEndian()) {
            for (int i = int(sizeof(double)) - 1; i >= 0; --i) m_buf += char(raw[i]);
        } else {
            for (int i = 0; i < int(sizeof(double)); ++i) m_buf += char(raw[i]);
        }
    }

    /// Length header that claims more bytes than follow (simulates a truncated file)
    void truncatedUnicode(int claimed, const std::string &partial)
    {
        m_buf += 'X';
        le32(claimed);
        m_buf += partial;
    }

    const std::string &bytes() const
    {
        return m_buf;
    }

private:
    static bool hostIsLittleEndian()
    {
        const unsigned short one = 1;
        return *reinterpret_cast<const unsigned char *>(&one) == 1;
    }

    void le32(int v)
    {
        const unsigned int u = static_cast<unsigned int>(v);
        for (int i = 0; i < 4; ++i) m_buf += char((u >> (8 * i)) & 0xffu);
    }

    std::string m_buf;
};

// Parses the pickle and destroys the stream before returning, so the result
// must not alias anything the stream owned (its stack or memo).
std::unique_ptr<LVariant> parse(const PickleBuilder &pb)
{
    StrInStream ins(pb.bytes().data(), static_cast<int>(pb.bytes().size()));
    PickleInStream pis(ins);
    return std::unique_ptr<LVariant>(pis.getMap());
}

}  // namespace

TEST(PickleInStream, SetItemsBuildsDictWithNestedListAndMemoRefs)
{
    PickleBuilder pb;
    pb.emptyDict();
    pb.binput(0);
    pb.mark();
    pb.binunicode("version");
    pb.binput(1);
    pb.binint(1810);
    pb.binunicode("names");
    pb.binput(2);
    pb.emptyList();
    pb.mark();
    pb.binget(1);  // "version" again, through the memo
    pb.binfloat(1.5);
    pb.binstring("abc");
    pb.appends();
    pb.binunicode("flag");
    pb.binget(2);  // "names" reused as a value
    pb.setItems();
    pb.stop();

    std::unique_ptr<LVariant> pTop = parse(pb);
    ASSERT_TRUE(pTop->isDict());
    LVarDict *pDict = pTop->getDictPtr();

    EXPECT_EQ(pDict->getInt("version"), 1810);
    EXPECT_STREQ(pDict->getString("flag").c_str(), "names");

    LVarList *pNames = pDict->getList("names");
    ASSERT_NE(pNames, nullptr);
    ASSERT_EQ(pNames->size(), 3u);
    EXPECT_STREQ(pNames->getString(0).c_str(), "version");
    EXPECT_DOUBLE_EQ(pNames->getReal(1), 1.5);
    EXPECT_STREQ(pNames->getString(2).c_str(), "abc");

    // getList() hands out the stored list, not a copy
    EXPECT_EQ(pDict->getList("names"), pNames);
}

TEST(PickleInStream, SetItemStoresSingleEntry)
{
    PickleBuilder pb;
    pb.emptyDict();
    pb.binunicode("k");
    pb.binint(5);
    pb.setItem();
    pb.stop();

    std::unique_ptr<LVariant> pTop = parse(pb);
    ASSERT_TRUE(pTop->isDict());
    EXPECT_EQ(pTop->getDictPtr()->getInt("k"), 5);
}

TEST(PickleInStream, UnicodeStringIsBoundedByItsLength)
{
    // The bytes after "ab" are opcodes; they must not leak into the string.
    PickleBuilder pb;
    pb.emptyDict();
    pb.binunicode("k");
    pb.binunicode("ab");
    pb.setItem();
    pb.stop();

    std::unique_ptr<LVariant> pTop = parse(pb);
    EXPECT_STREQ(pTop->getDictPtr()->getString("k").c_str(), "ab");
}

TEST(PickleInStream, SetItemsWithOddItemCountThrows)
{
    PickleBuilder pb;
    pb.emptyDict();
    pb.mark();
    pb.binunicode("k");  // key without a value
    pb.setItems();
    pb.stop();
    EXPECT_THROW(parse(pb), qlib::LException);
}

TEST(PickleInStream, TruncatedStringThrows)
{
    PickleBuilder pb;
    pb.emptyDict();
    pb.truncatedUnicode(100, "abc");
    EXPECT_THROW(parse(pb), qlib::LException);
}
