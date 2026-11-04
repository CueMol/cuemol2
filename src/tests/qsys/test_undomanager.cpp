#include <gtest/gtest.h>
#include <stdexcept>
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

// An EditInfo that changes the scene and then fails, as one whose work
// throws half way through does (TrajBlockEditInfo turns a load error after
// removing a block into false). `*changed` stands for the scene.
class ChangeThenFailEditInfo : public EditInfo {
public:
    int *changed;
    explicit ChangeThenFailEditInfo(int *p) : changed(p) {}
    bool undo() override { ++*changed; return false; }
    bool redo() override { ++*changed; return false; }
    bool isUndoable() const override { return true; }
    bool isRedoable() const override { return true; }
};

// An EditInfo whose undo throws.
class ThrowEditInfo : public EditInfo {
public:
    bool undo() override { throw std::runtime_error("boom"); }
    bool redo() override { throw std::runtime_error("boom"); }
    bool isUndoable() const override { return true; }
    bool isRedoable() const override { return true; }
};

/// Commit one transaction holding `pei`.
void commitOne(UndoManager &um, const char *desc, EditInfo *pei)
{
    um.startTxn(desc);
    um.addEditInfo(pei);
    um.commitTxn();
}

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

// ---- Transaction calls outside a transaction ----------------------------
// commitTxn()/rollbackTxn() are script-visible; calling them without a
// matching startTxn() must be a no-op, not a null dereference.

TEST(UndoManagerTest, CommitWithoutTxnIsIgnored)
{
    UndoManager um;
    um.commitTxn();
    EXPECT_FALSE(um.isInTxn());
    EXPECT_EQ(um.getUndoSize(), 0);
}

TEST(UndoManagerTest, RollbackWithoutTxnIsIgnored)
{
    UndoManager um;
    um.rollbackTxn();
    EXPECT_FALSE(um.isInTxn());
    EXPECT_EQ(um.getUndoSize(), 0);
}

TEST(UndoManagerTest, DoubleCommitKeepsSingleEntry)
{
    UndoManager um;
    um.startTxn("op");
    um.addEditInfo(new CountEditInfo());
    um.commitTxn();
    um.commitTxn();
    EXPECT_FALSE(um.isInTxn());
    EXPECT_EQ(um.getUndoSize(), 1);
    EXPECT_TRUE(um.isUndoable());
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

// A step that fails may have changed the scene (no EditInfo promises
// otherwise), so no record is left to be applied to that state: the whole
// history goes, the step that failed included.
TEST(UndoManagerTest, FailedUndoDropsTheHistory)
{
    UndoManager um;
    int changed = 0;
    commitOne(um, "older", new CountEditInfo());
    commitOne(um, "fails", new ChangeThenFailEditInfo(&changed));
    commitOne(um, "redone", new CountEditInfo());
    ASSERT_TRUE(um.undo());   // "redone" goes to the redo side

    EXPECT_FALSE(um.undo());  // "fails"
    EXPECT_EQ(changed, 1);
    EXPECT_EQ(um.getUndoSize(), 0);
    EXPECT_EQ(um.getRedoSize(), 0);
    EXPECT_TRUE(um.takeHistoryDropped());
    EXPECT_FALSE(um.takeHistoryDropped());
}

// An exception from an EditInfo is a failure like false, and recording is
// back on afterwards, so later edits can still be undone.
TEST(UndoManagerTest, ThrowingUndoFailsAndRecordingResumes)
{
    UndoManager um;
    commitOne(um, "throws", new ThrowEditInfo());

    EXPECT_FALSE(um.undo());
    EXPECT_FALSE(um.isDisabled());
    commitOne(um, "later", new CountEditInfo());
    EXPECT_EQ(um.getUndoSize(), 1);
    EXPECT_TRUE(um.undo());
}

// A rollback that cannot take its change back leaves the scene where the
// old redo records do not apply: they go too, and recording resumes.
TEST(UndoManagerTest, FailedRollbackDropsTheHistory)
{
    UndoManager um;
    int changed = 0;
    commitOne(um, "done", new CountEditInfo());
    ASSERT_TRUE(um.undo());
    ASSERT_EQ(um.getRedoSize(), 1);

    um.startTxn("edit");
    um.addEditInfo(new ChangeThenFailEditInfo(&changed));
    um.rollbackTxn();

    EXPECT_EQ(changed, 1);
    EXPECT_FALSE(um.isInTxn());
    EXPECT_EQ(um.getUndoSize(), 0);
    EXPECT_EQ(um.getRedoSize(), 0);
    EXPECT_TRUE(um.takeHistoryDropped());
    commitOne(um, "later", new CountEditInfo());
    EXPECT_EQ(um.getUndoSize(), 1);
}
