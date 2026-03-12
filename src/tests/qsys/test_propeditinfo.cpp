#include <gtest/gtest.h>
#include <common.h>
#include "qsys/PropEditInfo.hpp"
#include <qlib/LVariant.hpp>

using qsys::PropEditInfoBase;
using qsys::PropEditInfo;

namespace {

// PropEditInfoBase is abstract; use PropEditInfo (concrete subclass) to test
// the base-class accessors.
PropEditInfo makeBase() { return PropEditInfo(); }

}  // namespace

// ---- PropEditInfoBase accessors (tested via PropEditInfo) ----

TEST(PropEditInfoBaseTest, DefaultTargetUID)
{
    PropEditInfo ei;
    EXPECT_EQ(ei.getTargetUID(), qlib::invalid_uid);
}

TEST(PropEditInfoBaseTest, SetGetTargetUID)
{
    PropEditInfo ei;
    ei.setTargetUID(42);
    EXPECT_EQ(ei.getTargetUID(), 42u);
}

TEST(PropEditInfoBaseTest, SetGetPropName)
{
    PropEditInfo ei;
    ei.setPropName("myProp");
    EXPECT_EQ(ei.getPropName(), "myProp");
}

TEST(PropEditInfoBaseTest, GetTargetNullWhenInvalidUID)
{
    PropEditInfo ei;
    // invalid_uid → ObjectManager returns null
    EXPECT_EQ(ei.getTarget(), nullptr);
}

// ---- PropEditInfo ----

TEST(PropEditInfoTest, NotUndoableWithInvalidTarget)
{
    PropEditInfo ei;
    ei.setTargetUID(qlib::invalid_uid);
    EXPECT_FALSE(ei.isUndoable());
}

TEST(PropEditInfoTest, NotRedoableWithInvalidTarget)
{
    PropEditInfo ei;
    ei.setTargetUID(qlib::invalid_uid);
    EXPECT_FALSE(ei.isRedoable());
}

TEST(PropEditInfoTest, UndoReturnsFalseWithInvalidTarget)
{
    PropEditInfo ei;
    ei.setTargetUID(qlib::invalid_uid);
    EXPECT_FALSE(ei.undo());
}

TEST(PropEditInfoTest, RedoReturnsFalseWithInvalidTarget)
{
    PropEditInfo ei;
    ei.setTargetUID(qlib::invalid_uid);
    EXPECT_FALSE(ei.redo());
}

TEST(PropEditInfoTest, SetupOldNewValues)
{
    PropEditInfo ei;
    qlib::LVariant ov("old"), nv("new");
    ei.setup(qlib::invalid_uid, "someProp", ov, nv);

    EXPECT_EQ(ei.getPropName(), "someProp");
    EXPECT_EQ(ei.getTargetUID(), qlib::invalid_uid);
    // target is null → undo/redo return false
    EXPECT_FALSE(ei.undo());
    EXPECT_FALSE(ei.redo());
}
