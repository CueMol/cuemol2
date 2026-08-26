// -*-Mode: C++;-*-
//
// Tests for the optional random-access interface of input streams
// (isSeekable / tell / seekTo): in-memory and file sources support it,
// adaptors reading straight through the source inherit it, and a decoder
// in between makes the stream non-seekable.
//

#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include <fstream>
#include <string>
#include "qlib/BinStream.hpp"
#include "qlib/FileStream.hpp"
#include "qlib/GzipStream.hpp"
#include "qlib/LString.hpp"
#include "qlib/StringStream.hpp"

using qlib::BinInStream;
using qlib::FileInStream;
using qlib::LString;
using qlib::StrInStream;

namespace {

LString writeTempFile(const std::string &payload)
{
    static int s_counter = 0;
    const std::string path =
        ::testing::TempDir() + "/seek_" + std::to_string(++s_counter) + ".bin";
    std::ofstream out(path, std::ios::binary);
    out.write(payload.data(), static_cast<std::streamsize>(payload.size()));
    out.close();
    return LString(path.c_str());
}

std::string payload()
{
    std::string s;
    for (int i = 0; i < 256; ++i)
        s.push_back(char(i));
    return s;
}

}  // namespace

TEST(SeekableStream, StringStreamSeeks)
{
    const std::string data = payload();
    StrInStream ins(data.data(), int(data.size()));
    EXPECT_TRUE(ins.isSeekable());
    EXPECT_EQ(ins.tell(), 0);

    char buf[16];
    ins.readFully(buf, 0, 16);
    EXPECT_EQ(ins.tell(), 16);

    EXPECT_TRUE(ins.seekTo(100));
    EXPECT_EQ(ins.tell(), 100);
    EXPECT_EQ(ins.read(), 100);

    // out of range is refused and leaves the position alone
    EXPECT_FALSE(ins.seekTo(1000));
    EXPECT_FALSE(ins.seekTo(-1));
    EXPECT_EQ(ins.tell(), 101);

    // seeking to the end is allowed (nothing left to read)
    EXPECT_TRUE(ins.seekTo(int(data.size())));
    EXPECT_EQ(ins.read(), -1);
}

// A binary adaptor reads through the source implementation, so it
// inherits the seekability (this is what the map reader relies on).
TEST(SeekableStream, BinaryAdaptorInheritsSeek)
{
    const std::string data = payload();
    StrInStream ins(data.data(), int(data.size()));
    BinInStream bin(ins);
    EXPECT_TRUE(bin.isSeekable());
    char buf[8];
    bin.readFully(buf, 0, 8);
    EXPECT_EQ(bin.tell(), 8);
    EXPECT_TRUE(bin.seekTo(2));
    EXPECT_EQ(bin.read(), 2);
}

TEST(SeekableStream, FileStreamSeeks)
{
    const std::string data = payload();
    const LString path = writeTempFile(data);

    FileInStream fis;
    fis.open(path);
    EXPECT_TRUE(fis.isSeekable());
    EXPECT_EQ(fis.getFilePos(), 0);

    char buf[32];
    fis.readFully(buf, 0, 32);
    EXPECT_EQ(fis.tell(), 32);

    EXPECT_TRUE(fis.seekTo(200));
    EXPECT_EQ(fis.tell(), 200);
    EXPECT_EQ(fis.read(), 200);

    fis.setFilePos(5);
    EXPECT_EQ(fis.getFilePos(), 5);
    EXPECT_EQ(fis.read(), 5);
    fis.close();
}

TEST(SeekableStream, DecoderIsNotSeekable)
{
    const std::string data = payload();
    const LString path = writeTempFile(data);
    FileInStream fis;
    fis.open(path);
    // the content is not gzip; only the seekability is asked, no read
    qlib::GzipInStream gz(fis);
    EXPECT_FALSE(gz.isSeekable());
    EXPECT_EQ(gz.tell(), -1);
    EXPECT_FALSE(gz.seekTo(0));
    fis.close();
}
