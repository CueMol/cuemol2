#include <gtest/gtest.h>
#include <common.h>
#include "qsys/SceneExporter.hpp"

using qlib::LString;

namespace {

class MinimalSceneExporter : public qsys::SceneExporter {
public:
    void write() override {}
    const char *getName() const override { return "minimal"; }
    const char *getTypeDescr() const override { return "Minimal exporter"; }
    const char *getFileExt() const override { return "*.min"; }
};

}  // namespace

TEST(SceneExporterTest, DefaultWidthZero)
{
    MinimalSceneExporter e;
    EXPECT_EQ(e.getWidth(), 0);
}

TEST(SceneExporterTest, SetGetWidth)
{
    MinimalSceneExporter e;
    e.setWidth(800);
    EXPECT_EQ(e.getWidth(), 800);
}

TEST(SceneExporterTest, DefaultHeightZero)
{
    MinimalSceneExporter e;
    EXPECT_EQ(e.getHeight(), 0);
}

TEST(SceneExporterTest, SetGetHeight)
{
    MinimalSceneExporter e;
    e.setHeight(600);
    EXPECT_EQ(e.getHeight(), 600);
}

TEST(SceneExporterTest, DefaultCameraNameEmpty)
{
    MinimalSceneExporter e;
    EXPECT_TRUE(e.getCameraName().isEmpty());
}

TEST(SceneExporterTest, SetGetCameraName)
{
    MinimalSceneExporter e;
    e.setCameraName("main");
    EXPECT_EQ(e.getCameraName(), LString("main"));
}

TEST(SceneExporterTest, GetCatIDIsRendToFile)
{
    MinimalSceneExporter e;
    EXPECT_EQ(e.getCatID(), qsys::InOutHandler::IOH_CAT_RENDTOFILE);
}
