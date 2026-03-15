#include <gtest/gtest.h>
#include <common.h>
#include "qlib/PipeStream.hpp"

#include <memory>

using qlib::PipeStreamImpl;
using qlib::PipeInStream;
using qlib::PipeOutStream;

TEST(PipeStreamImpl, WriteThenReadOneByte)
{
    PipeStreamImpl impl;
    impl.write(42);
    impl.o_close();

    int val = impl.read();
    EXPECT_EQ(val, 42);
}

TEST(PipeStreamImpl, WriteThenReadBlock)
{
    PipeStreamImpl impl;
    const char src[] = "hello";
    impl.write(src, 0, 5);
    impl.o_close();

    char dst[5] = {};
    int n = impl.read(dst, 0, 5);
    EXPECT_EQ(n, 5);
    EXPECT_EQ(std::string(dst, 5), std::string(src, 5));
}

TEST(PipeStreamImpl, ReadBlockPartial)
{
    PipeStreamImpl impl;
    const char src[] = "abc";
    impl.write(src, 0, 3);
    impl.o_close();

    char dst[10] = {};
    // Request more bytes than available
    int n = impl.read(dst, 0, 10);
    // Should return only the available 3 bytes
    EXPECT_EQ(n, 3);
    EXPECT_EQ(std::string(dst, 3), std::string(src, 3));
}

TEST(PipeStreamImpl, EOFOnRead)
{
    PipeStreamImpl impl;
    impl.o_close();

    int val = impl.read();
    EXPECT_EQ(val, -1);
}

TEST(PipeStreamImpl, EOFOnReadBlock)
{
    PipeStreamImpl impl;
    impl.o_close();

    char buf[4] = {};
    int n = impl.read(buf, 0, 4);
    EXPECT_EQ(n, -1);
}

TEST(PipeStreamImpl, ReadyWithData)
{
    PipeStreamImpl impl;
    impl.write(99);
    EXPECT_TRUE(impl.ready());
}

TEST(PipeStreamImpl, ReadyEmptyNotClosed)
{
    PipeStreamImpl impl;
    // No data but channel is still open
    EXPECT_TRUE(impl.ready());
}

TEST(PipeStreamImpl, ReadyEmptyAndClosed)
{
    PipeStreamImpl impl;
    impl.o_close();
    EXPECT_FALSE(impl.ready());
}

TEST(PipeStreamImpl, SkipReturnCount)
{
    PipeStreamImpl impl;
    impl.write("hello", 0, 5);
    impl.o_close();

    int n = impl.skip(3);
    EXPECT_EQ(n, 3);
}

TEST(PipeStreamImpl, SkipPartialReturn)
{
    PipeStreamImpl impl;
    impl.write("hi", 0, 2);
    impl.o_close();

    // Request to skip more bytes than available
    int n = impl.skip(10);
    EXPECT_EQ(n, 2);
}

TEST(PipeStreamImpl, PipeInOutStream)
{
    auto pimpl = qlib::sp<PipeStreamImpl>(new PipeStreamImpl());

    PipeOutStream out;
    out.setImpl(pimpl);

    PipeInStream in;
    in.setImpl(pimpl);

    // Write via PipeOutStream
    const char src[] = "world";
    pimpl->write(src, 0, 5);
    pimpl->o_close();

    // Read via PipeInStream
    char dst[5] = {};
    int n = pimpl->read(dst, 0, 5);
    EXPECT_EQ(n, 5);
    EXPECT_EQ(std::string(dst, 5), std::string(src, 5));
}
