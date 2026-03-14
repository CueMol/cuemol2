#include <gtest/gtest.h>
#include <common.h>
#include "qsys/ObjLoadEditInfo.hpp"
#include "qsys/Object.hpp"
#include "qsys/Renderer.hpp"

using qsys::ObjLoadEditInfo;

TEST(ObjLoadEditInfoTest, DefaultConstruction)
{
    // must not crash
    ObjLoadEditInfo info;
}

TEST(ObjLoadEditInfoTest, IsUndoableTrue)
{
    ObjLoadEditInfo info;
    EXPECT_TRUE(info.isUndoable());
}

TEST(ObjLoadEditInfoTest, IsRedoableTrue)
{
    ObjLoadEditInfo info;
    EXPECT_TRUE(info.isRedoable());
}

// undo/redo with an invalid scene ID must return false without crashing.
TEST(ObjLoadEditInfoTest, SetupObjCreate_UndoRedoWithInvalidID)
{
    ObjLoadEditInfo info;
    info.setupObjCreate(qlib::invalid_uid, qsys::ObjectPtr());
    EXPECT_FALSE(info.undo());
    EXPECT_FALSE(info.redo());
}

TEST(ObjLoadEditInfoTest, SetupObjDestroy_UndoRedoWithInvalidID)
{
    ObjLoadEditInfo info;
    info.setupObjDestroy(qlib::invalid_uid, qsys::ObjectPtr());
    EXPECT_FALSE(info.undo());
    EXPECT_FALSE(info.redo());
}

TEST(ObjLoadEditInfoTest, SetupRendCreate_UndoRedoWithInvalidID)
{
    ObjLoadEditInfo info;
    info.setupRendCreate(qlib::invalid_uid, qsys::RendererPtr());
    EXPECT_FALSE(info.undo());
    EXPECT_FALSE(info.redo());
}

TEST(ObjLoadEditInfoTest, SetupRendDestroy_UndoRedoWithInvalidID)
{
    ObjLoadEditInfo info;
    info.setupRendDestroy(qlib::invalid_uid, qsys::RendererPtr());
    EXPECT_FALSE(info.undo());
    EXPECT_FALSE(info.redo());
}
