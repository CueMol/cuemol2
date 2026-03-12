#include <gtest/gtest.h>
#include <common.h>
#include "qsys/InOutHandler.hpp"

using qlib::LString;

namespace {

class MinimalIOHandler : public qsys::InOutHandler {
public:
    const char *getName() const override { return "minimal"; }
    const char *getTypeDescr() const override { return "Minimal handler"; }
    const char *getFileExt() const override { return "*.min"; }
    int getCatID() const override { return IOH_CAT_OBJREADER; }
};

}  // namespace

TEST(InOutHandlerTest, DefaultMainPathEmpty)
{
    MinimalIOHandler h;
    EXPECT_TRUE(h.getPath().isEmpty());
}

TEST(InOutHandlerTest, SetGetMainPath)
{
    MinimalIOHandler h;
    h.setPath("/tmp/test.pdb");
    EXPECT_EQ(h.getPath(), LString("/tmp/test.pdb"));
}

TEST(InOutHandlerTest, SetGetNamedPath)
{
    MinimalIOHandler h;
    h.setPath("sub", "/tmp/sub.dat");
    EXPECT_EQ(h.getPath("sub"), LString("/tmp/sub.dat"));
}

TEST(InOutHandlerTest, MainAndSubPathIndependent)
{
    MinimalIOHandler h;
    h.setPath("/main.dat");
    h.setPath("aux", "/aux.dat");
    EXPECT_EQ(h.getPath(), LString("/main.dat"));
    EXPECT_EQ(h.getPath("aux"), LString("/aux.dat"));
}

TEST(InOutHandlerTest, DefaultCompressModeIsNone)
{
    MinimalIOHandler h;
    EXPECT_EQ(h.getCompressMode(), qsys::InOutHandler::COMP_NONE);
}

TEST(InOutHandlerTest, DefaultBase64FlagFalse)
{
    MinimalIOHandler h;
    EXPECT_FALSE(h.getBase64Flag());
}

TEST(InOutHandlerTest, CompressModeConstants)
{
    EXPECT_EQ(qsys::InOutHandler::COMP_NONE, 0);
    EXPECT_NE(qsys::InOutHandler::COMP_GZIP, qsys::InOutHandler::COMP_NONE);
    EXPECT_NE(qsys::InOutHandler::COMP_BZIP2, qsys::InOutHandler::COMP_GZIP);
    EXPECT_NE(qsys::InOutHandler::COMP_XZIP, qsys::InOutHandler::COMP_BZIP2);
}

TEST(InOutHandlerTest, CategoryConstants)
{
    EXPECT_EQ(qsys::InOutHandler::IOH_CAT_OBJREADER, 0);
    EXPECT_EQ(qsys::InOutHandler::IOH_CAT_OBJWRITER, 1);
    EXPECT_EQ(qsys::InOutHandler::IOH_CAT_RENDTOFILE, 2);
    EXPECT_EQ(qsys::InOutHandler::IOH_CAT_SCEREADER, 3);
    EXPECT_EQ(qsys::InOutHandler::IOH_CAT_SCEWRITER, 4);
}
