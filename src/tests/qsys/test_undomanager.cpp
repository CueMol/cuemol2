#include <gtest/gtest.h>
#include <common.h>
#include "qsys/UndoManager.hpp"

using qsys::UndoManager;
using qsys::EditInfo;
using qlib::LString;

namespace {

// Minimal EditInfo implementation that records call counts.
class CountEditInfo : public EditInfo {
public:
    int undo_count = 0;
    int redo_count = 0;
    bool undoable = true;
    bool redoable = true;

    bool undo() override { ++undo_count; return true; }
    bool redo() override { ++redo_count; return true; }
    bool isUndoable() const override { return undoable; }
    bool isRedoable() const override { return redoable; }
};

}  // namespace

TEST(UndoManagerTest, DefaultState)
{
    UndoManager um;
    EXPECT_FALSE(um.isUndoable());
    EXPECT_FALSE(um.isRedoable());
    EXPECT_FALSE(um.isInTxn());
    EXPECT_FALSE(um.isDisabled());
    EXPECT_EQ(um.getUndoSize(), 0);
    EXPECT_EQ(um.getRedoSize(), 0);
}

TEST(UndoManagerTest, CommitMakesUndoable)
{
    UndoManager um;
    um.startTxn("op1");
    EXPECT_TRUE(um.isInTxn());

    auto *pei = new CountEditInfo();
    um.addEditInfo(pei);
    um.commitTxn();

    EXPECT_FALSE(um.isInTxn());
    EXPECT_TRUE(um.isUndoable());
    EXPECT_EQ(um.getUndoSize(), 1);
}

TEST(UndoManagerTest, UndoCallsEditInfo)
{
    UndoManager um;
    um.startTxn("op");
    auto *pei = new CountEditInfo();
    um.addEditInfo(pei);
    // pei is owned by um after addEditInfo; keep a raw ptr only for inspection
    // (safe because um hasn't executed undo yet)
    um.commitTxn();

    EXPECT_TRUE(um.undo());
    // undo moves the entry to redo list
    EXPECT_FALSE(um.isUndoable());
    EXPECT_TRUE(um.isRedoable());
}

TEST(UndoManagerTest, RedoAfterUndo)
{
    UndoManager um;
    um.startTxn("op");
    um.addEditInfo(new CountEditInfo());
    um.commitTxn();

    um.undo();
    EXPECT_TRUE(um.redo());
    EXPECT_TRUE(um.isUndoable());
    EXPECT_FALSE(um.isRedoable());
}

TEST(UndoManagerTest, CommitClearsRedoHistory)
{
    UndoManager um;

    um.startTxn("op1");
    um.addEditInfo(new CountEditInfo());
    um.commitTxn();

    um.undo();
    EXPECT_EQ(um.getRedoSize(), 1);

    // new commit must discard redo history
    um.startTxn("op2");
    um.addEditInfo(new CountEditInfo());
    um.commitTxn();

    EXPECT_EQ(um.getRedoSize(), 0);
}

TEST(UndoManagerTest, EmptyTxnIsDiscarded)
{
    UndoManager um;
    um.startTxn("empty");
    um.commitTxn();  // no EditInfo added → discarded

    EXPECT_FALSE(um.isUndoable());
    EXPECT_EQ(um.getUndoSize(), 0);
}

TEST(UndoManagerTest, RollbackUndoesPending)
{
    UndoManager um;
    um.startTxn("op");
    auto *pei = new CountEditInfo();
    um.addEditInfo(pei);

    um.rollbackTxn();

    EXPECT_FALSE(um.isInTxn());
    EXPECT_FALSE(um.isUndoable());
    EXPECT_EQ(um.getUndoSize(), 0);
}

TEST(UndoManagerTest, ClearAllInfo)
{
    UndoManager um;
    um.startTxn("op");
    um.addEditInfo(new CountEditInfo());
    um.commitTxn();

    um.clearAllInfo();
    EXPECT_FALSE(um.isUndoable());
    EXPECT_EQ(um.getUndoSize(), 0);
}

TEST(UndoManagerTest, GetUndoDesc)
{
    UndoManager um;
    um.startTxn("my_operation");
    um.addEditInfo(new CountEditInfo());
    um.commitTxn();

    LString desc;
    EXPECT_TRUE(um.getUndoDesc(0, desc));
    EXPECT_EQ(desc, "my_operation");
}

TEST(UndoManagerTest, NestedTxnLevels)
{
    UndoManager um;
    um.startTxn("outer");
    um.startTxn("inner");   // increments nest level
    um.addEditInfo(new CountEditInfo());
    um.commitTxn();          // decrements nest level, no actual commit yet
    EXPECT_TRUE(um.isInTxn());  // still inside outer txn
    um.commitTxn();          // actual commit
    EXPECT_FALSE(um.isInTxn());
    EXPECT_TRUE(um.isUndoable());
}

TEST(UndoManagerTest, IsOKOnlyInsideTxn)
{
    UndoManager um;
    EXPECT_FALSE(um.isOK());
    um.startTxn("op");
    EXPECT_TRUE(um.isOK());
    um.commitTxn();
    EXPECT_FALSE(um.isOK());
}

// getUndoDesc/getRedoDesc are script-visible; an index past the list used to
// advance the iterator beyond end().
TEST(UndoManagerTest, DescIndexOutOfRangeReturnsFalse)
{
    UndoManager um;
    um.startTxn("only");
    um.addEditInfo(new CountEditInfo());
    um.commitTxn();

    LString desc;
    EXPECT_TRUE(um.getUndoDesc(0, desc));
    EXPECT_EQ(desc, LString("only"));
    EXPECT_FALSE(um.getUndoDesc(1, desc));
    EXPECT_FALSE(um.getUndoDesc(5, desc));
    EXPECT_FALSE(um.getUndoDesc(-1, desc));

    ASSERT_TRUE(um.undo());
    EXPECT_TRUE(um.getRedoDesc(0, desc));
    EXPECT_FALSE(um.getRedoDesc(3, desc));
}
