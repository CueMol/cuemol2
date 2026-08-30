// LScrSp no-throw cast and BinInStream::readStr() input validation.
#include <gtest/gtest.h>
#include <common.h>
#include <string>
#include "qlib/LScrSmartPtr.hpp"
#include "qlib/LScrVector4D.hpp"
#include "qlib/LScrMatrix4D.hpp"
#include "qlib/BinStream.hpp"
#include "qlib/StringStream.hpp"
#include "qlib/LExceptions.hpp"

using qlib::LScrSp;

TEST(LScrSpNoThrow, FailedCastReleasesTheReference)
{
    LScrSp<qlib::LScrVector4D> pv(MB_NEW qlib::LScrVector4D());
    ASSERT_EQ(pv.use_count(), 1);
    {
        LScrSp<qlib::LScrMatrix4D> pm(pv, qlib::no_throw_tag());
        EXPECT_TRUE(pm.isnull());
        // The failed cast must not keep a reference on pv's object (it used
        // to leak one and share pv's counter).
        EXPECT_EQ(pv.use_count(), 1);
    }
    EXPECT_EQ(pv.use_count(), 1);
    EXPECT_FALSE(pv.isnull());
}

TEST(LScrSpNoThrow, SuccessfulCastSharesTheObject)
{
    LScrSp<qlib::LScrVector4D> pv(MB_NEW qlib::LScrVector4D());
    LScrSp<qlib::LScrVector4D> pv2(pv, qlib::no_throw_tag());
    EXPECT_FALSE(pv2.isnull());
    EXPECT_EQ(pv.use_count(), 2);
}

TEST(BinInStreamReadStr, NegativeLengthIsAFormatError)
{
    // int32 length -1 (all bytes 0xff, so the byte order does not matter)
    const std::string data("\xff\xff\xff\xff", 4);
    qlib::StrInStream sis(data.c_str(), int(data.size()));
    qlib::BinInStream bin(sis);
    EXPECT_THROW(bin.readStr(), qlib::FileFormatException);
}

TEST(BinInStreamReadStr, ZeroLengthIsEmpty)
{
    const std::string data("\0\0\0\0", 4);
    qlib::StrInStream sis(data.c_str(), int(data.size()));
    qlib::BinInStream bin(sis);
    EXPECT_TRUE(bin.readStr().isEmpty());
}
