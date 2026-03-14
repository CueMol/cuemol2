#include <gtest/gtest.h>
#include <common.h>
#include "qsys/ObjReader.hpp"
#include "qsys/Object.hpp"

using qlib::LString;

namespace {

class MinimalObjReader : public qsys::ObjReader {
public:
    bool read(qlib::InStream &) override { return true; }
    qsys::ObjectPtr createDefaultObj() const override {
        return qsys::ObjectPtr();
    }
    const char *getName() const override { return "minimal"; }
    const char *getTypeDescr() const override { return "Minimal reader"; }
    const char *getFileExt() const override { return "*.min"; }
};

}  // namespace

TEST(ObjReaderTest, DefaultCompressModeIsNone)
{
    MinimalObjReader r;
    EXPECT_EQ(r.getCompressMode(), qsys::InOutHandler::COMP_NONE);
}

TEST(ObjReaderTest, SetGetCompressMode)
{
    MinimalObjReader r;
    r.setCompressMode(qsys::InOutHandler::COMP_GZIP);
    EXPECT_EQ(r.getCompressMode(), qsys::InOutHandler::COMP_GZIP);
}

TEST(ObjReaderTest, DefaultBase64FlagFalse)
{
    MinimalObjReader r;
    EXPECT_FALSE(r.getBase64Flag());
}

TEST(ObjReaderTest, SetGetBase64Flag)
{
    MinimalObjReader r;
    r.setBase64Flag(true);
    EXPECT_TRUE(r.getBase64Flag());
}

TEST(ObjReaderTest, GetCatIDIsObjReader)
{
    MinimalObjReader r;
    EXPECT_EQ(r.getCatID(), qsys::InOutHandler::IOH_CAT_OBJREADER);
}
