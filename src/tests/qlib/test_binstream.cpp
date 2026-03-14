#include <gtest/gtest.h>
#include <common.h>
#include "qlib/BinStream.hpp"
#include "qlib/PipeStream.hpp"

using qlib::BinInStream;
using qlib::BinOutStream;
using qlib::PipeInStream;
using qlib::PipeOutStream;
using qlib::PipeStreamImpl;

// Helper: create a linked pair of BinOutStream / BinInStream backed by a
// shared PipeStreamImpl so that whatever is written can be read back.
struct BinPipe {
    qlib::sp<PipeStreamImpl> impl;
    PipeOutStream raw_out;
    PipeInStream  raw_in;
    BinOutStream  out;
    BinInStream   in;

    BinPipe()
        : impl(new PipeStreamImpl())
    {
        raw_out.setImpl(impl);
        raw_in.setImpl(impl);
        out = raw_out;   // BinOutStream::operator=(OutStream&) shares impl
        in  = raw_in;    // BinInStream  ::operator=(InStream& ) shares impl (inherited)
    }

    // Signal end-of-stream so readFully/readStr don't block.
    void close_write() { impl->o_close(); }
};

// ---- Int8 ---------------------------------------------------------------

TEST(BinStream, WriteReadInt8)
{
    BinPipe p;
    p.out.writeInt8(42);
    p.close_write();
    EXPECT_EQ(p.in.readInt8(), 42);
}

TEST(BinStream, WriteReadInt8Negative)
{
    BinPipe p;
    p.out.writeInt8(-1);
    p.close_write();
    EXPECT_EQ(p.in.readInt8(), -1);
}

// ---- Int16 --------------------------------------------------------------

TEST(BinStream, WriteReadInt16)
{
    BinPipe p;
    p.out.writeInt16(0x1234);
    p.close_write();
    EXPECT_EQ(p.in.readInt16(), 0x1234);
}

// ---- Int32 --------------------------------------------------------------

TEST(BinStream, WriteReadInt32)
{
    BinPipe p;
    p.out.writeInt32(0x12345678);
    p.close_write();
    EXPECT_EQ(p.in.readInt32(), 0x12345678);
}

TEST(BinStream, WriteReadMultipleInt32)
{
    BinPipe p;
    p.out.writeInt32(1);
    p.out.writeInt32(2);
    p.out.writeInt32(3);
    p.close_write();
    EXPECT_EQ(p.in.readInt32(), 1);
    EXPECT_EQ(p.in.readInt32(), 2);
    EXPECT_EQ(p.in.readInt32(), 3);
}

// ---- Float32 ------------------------------------------------------------

TEST(BinStream, WriteReadFloat32)
{
    BinPipe p;
    p.out.writeFloat32(3.14f);
    p.close_write();
    EXPECT_FLOAT_EQ(p.in.readFloat32(), 3.14f);
}

// ---- String (length-prefixed) -------------------------------------------

TEST(BinStream, WriteReadStr)
{
    BinPipe p;
    p.out.writeStr("hello");
    p.close_write();
    EXPECT_EQ(p.in.readStr(), qlib::LString("hello"));
}

TEST(BinStream, WriteReadStrEmpty)
{
    BinPipe p;
    // writeStr writes length 0, then no bytes
    p.out.writeStr("");
    p.close_write();
    EXPECT_EQ(p.in.readStr(), qlib::LString());
}

// ---- Fixed-width string -------------------------------------------------

TEST(BinStream, WriteFixedStrPadded)
{
    BinPipe p;
    p.out.writeFixedStr("hi", 4);  // 2 chars + 2 zero bytes
    p.close_write();

    char buf[4] = {'\xFF', '\xFF', '\xFF', '\xFF'};
    p.impl->read(buf, 0, 4);
    EXPECT_EQ(buf[0], 'h');
    EXPECT_EQ(buf[1], 'i');
    EXPECT_EQ(buf[2], '\0');
    EXPECT_EQ(buf[3], '\0');
}

// ---- Byte-swap mode -----------------------------------------------------

TEST(BinStream, SwapModeDefaultNoop)
{
    BinPipe p;
    EXPECT_EQ(p.in.getSwapMode(), BinInStream::MODE_NOOP);
}

TEST(BinStream, SwapModeSetGet)
{
    BinPipe p;
    p.in.setSwapMode(BinInStream::MODE_SWAP);
    EXPECT_EQ(p.in.getSwapMode(), BinInStream::MODE_SWAP);
}

TEST(BinStream, ByteSwapInt16)
{
    BinPipe p;
    // Write 0x0102 in native order; read with swap => 0x0201
    p.out.writeInt16(0x0102);
    p.close_write();

    p.in.setSwapMode(BinInStream::MODE_SWAP);
    qlib::qint16 val = p.in.readInt16();
    EXPECT_EQ(val, static_cast<qlib::qint16>(0x0201));
}

TEST(BinStream, ByteSwapInt32)
{
    BinPipe p;
    p.out.writeInt32(0x01020304);
    p.close_write();

    p.in.setSwapMode(BinInStream::MODE_SWAP);
    EXPECT_EQ(p.in.readInt32(), static_cast<qlib::qint32>(0x04030201));
}

// ---- assertValue --------------------------------------------------------

TEST(BinStream, AssertValueMatch)
{
    BinPipe p;
    p.out.writeInt32(99);
    p.close_write();
    EXPECT_TRUE(p.in.assertValue<qlib::qint32>(99));
}

TEST(BinStream, AssertValueMismatch)
{
    BinPipe p;
    p.out.writeInt32(99);
    p.close_write();
    EXPECT_FALSE(p.in.assertValue<qlib::qint32>(0));
}
