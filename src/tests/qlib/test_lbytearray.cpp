#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LByteArray.hpp"
#include "qlib/LExceptions.hpp"
#include "qlib/LTypes.hpp"

using qlib::LByteArray;

// getAt/setAt are script-visible: an index whose byte offset wraps around in
// int used to pass the bounds check and read far outside the array.
TEST(LByteArray, HugeIndexIsRejectedNotWrapped)
{
    LByteArray arr(16);
    arr.setElemType(qlib::type_consts::QTC_INT32);

    arr.setAt(3, 7);
    EXPECT_EQ(arr.getAt(3), 7);

    // 0x40000000 * 4 == 0 in 32-bit int
    EXPECT_THROW(arr.getAt(0x40000000), qlib::IndexOutOfBoundsException);
    EXPECT_THROW(arr.setAt(0x40000000, 1), qlib::IndexOutOfBoundsException);
    EXPECT_THROW(arr.getAt(4), qlib::IndexOutOfBoundsException);
    EXPECT_THROW(arr.getAt(-1), qlib::IndexOutOfBoundsException);
}

TEST(LByteArray, HugeFloatIndexIsRejected)
{
    LByteArray arr(16);
    arr.setElemType(qlib::type_consts::QTC_FLOAT32);

    arr.setAtF(1, 2.5);
    EXPECT_DOUBLE_EQ(arr.getAtF(1), 2.5);

    EXPECT_THROW(arr.getAtF(0x40000000), qlib::IndexOutOfBoundsException);
    EXPECT_THROW(arr.setAtF(0x40000000, 1.0), qlib::IndexOutOfBoundsException);
}
