#include <gtest/gtest.h>
#include <common.h>
#include "qsys/ObjWriter.hpp"
#include "qsys/Object.hpp"

using qlib::LString;

namespace {

class MinimalObjWriter : public qsys::ObjWriter {
public:
    bool write(qlib::OutStream &) override { return true; }
    bool canHandle(qsys::ObjectPtr) const override { return false; }
    const char *getName() const override { return "minimal"; }
    const char *getTypeDescr() const override { return "Minimal writer"; }
    const char *getFileExt() const override { return "*.min"; }
};

}  // namespace

TEST(ObjWriterTest, DefaultCompressModeIsNone)
{
    MinimalObjWriter w;
    EXPECT_EQ(w.getCompressMode(), qsys::InOutHandler::COMP_NONE);
}

TEST(ObjWriterTest, SetGetCompressMode)
{
    MinimalObjWriter w;
    w.setCompressMode(qsys::InOutHandler::COMP_GZIP);
    EXPECT_EQ(w.getCompressMode(), qsys::InOutHandler::COMP_GZIP);
}

TEST(ObjWriterTest, DefaultBase64FlagFalse)
{
    MinimalObjWriter w;
    EXPECT_FALSE(w.getBase64Flag());
}

TEST(ObjWriterTest, SetGetBase64Flag)
{
    MinimalObjWriter w;
    w.setBase64Flag(true);
    EXPECT_TRUE(w.getBase64Flag());
}

TEST(ObjWriterTest, DefaultConvToLinkFalse)
{
    MinimalObjWriter w;
    EXPECT_FALSE(w.isConvToLink());
}

TEST(ObjWriterTest, SetGetConvToLink)
{
    MinimalObjWriter w;
    w.setConvToLink(true);
    EXPECT_TRUE(w.isConvToLink());
}

TEST(ObjWriterTest, GetCatIDIsObjWriter)
{
    MinimalObjWriter w;
    EXPECT_EQ(w.getCatID(), qsys::InOutHandler::IOH_CAT_OBJWRITER);
}
