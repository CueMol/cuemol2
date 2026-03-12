#include <gtest/gtest.h>
#include <common.h>
#include "qsys/EditInfo.hpp"

// EditInfo is a pure abstract interface; use a minimal concrete implementation.
namespace {

class ConcreteEditInfo : public qsys::EditInfo {
public:
    bool undo_called = false;
    bool redo_called = false;
    bool undoable = true;
    bool redoable = true;

    bool undo() override { undo_called = true; return true; }
    bool redo() override { redo_called = true; return true; }
    bool isUndoable() const override { return undoable; }
    bool isRedoable() const override { return redoable; }
};

}  // namespace

TEST(EditInfoTest, UndoRedo)
{
    ConcreteEditInfo ei;
    EXPECT_TRUE(ei.isUndoable());
    EXPECT_TRUE(ei.isRedoable());

    EXPECT_TRUE(ei.undo());
    EXPECT_TRUE(ei.undo_called);

    EXPECT_TRUE(ei.redo());
    EXPECT_TRUE(ei.redo_called);
}

TEST(EditInfoTest, NotUndoableNotRedoable)
{
    ConcreteEditInfo ei;
    ei.undoable = false;
    ei.redoable = false;
    EXPECT_FALSE(ei.isUndoable());
    EXPECT_FALSE(ei.isRedoable());
}
