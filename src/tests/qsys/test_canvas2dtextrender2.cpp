#include <gtest/gtest.h>
#include <common.h>
#include "qsys/Canvas2DTextRender2.hpp"
#include "gfx/PixelBuffer.hpp"

using qsys::Canvas2DTextRender2;

// setupFont: CSS font string construction

TEST(Canvas2DTextRender2Test, SetupFontReturnsTrue)
{
    Canvas2DTextRender2 obj;
    EXPECT_TRUE(obj.setupFont(12.0, "sans-serif", "normal", "normal"));
}

TEST(Canvas2DTextRender2Test, SetupFontNormalStyleAndWeight)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(12.0, "sans-serif", "normal", "normal");
    EXPECT_EQ(obj.getCSSFont(), "12px sans-serif");
}

TEST(Canvas2DTextRender2Test, SetupFontItalicStyle)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(16.0, "serif", "italic", "normal");
    EXPECT_EQ(obj.getCSSFont(), "italic 16px serif");
}

TEST(Canvas2DTextRender2Test, SetupFontObliqueStyle)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(14.0, "monospace", "oblique", "normal");
    EXPECT_EQ(obj.getCSSFont(), "oblique 14px monospace");
}

TEST(Canvas2DTextRender2Test, SetupFontBoldWeight)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(10.0, "Arial", "normal", "bold");
    EXPECT_EQ(obj.getCSSFont(), "bold 10px Arial");
}

TEST(Canvas2DTextRender2Test, SetupFontItalicAndBold)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(20.0, "Times New Roman", "italic", "bold");
    EXPECT_EQ(obj.getCSSFont(), "italic bold 20px Times New Roman");
}

TEST(Canvas2DTextRender2Test, SetupFontObliqueAndBold)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(18.0, "Courier", "oblique", "bold");
    EXPECT_EQ(obj.getCSSFont(), "oblique bold 18px Courier");
}

TEST(Canvas2DTextRender2Test, SetupFontStyleCaseInsensitive)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(12.0, "sans-serif", "ITALIC", "normal");
    EXPECT_EQ(obj.getCSSFont(), "italic 12px sans-serif");
}

TEST(Canvas2DTextRender2Test, SetupFontWeightCaseInsensitive)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(12.0, "sans-serif", "normal", "BOLD");
    EXPECT_EQ(obj.getCSSFont(), "bold 12px sans-serif");
}

TEST(Canvas2DTextRender2Test, SetupFontPixelSizeIsIntegerTruncated)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(15.9, "sans-serif", "normal", "normal");
    // int(15.9) == 15
    EXPECT_EQ(obj.getCSSFont(), "15px sans-serif");
}

TEST(Canvas2DTextRender2Test, SetupFontOverwritesPreviousFont)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(12.0, "serif", "italic", "bold");
    obj.setupFont(14.0, "sans-serif", "normal", "normal");
    EXPECT_EQ(obj.getCSSFont(), "14px sans-serif");
}

// Factory functions

TEST(Canvas2DTextRender2Test, CreateTextRenderReturnsNonNull)
{
    void *pTR = qsys::createTextRender();
    EXPECT_NE(pTR, nullptr);
    qsys::destroyTextRender(pTR);
}

TEST(Canvas2DTextRender2Test, CreateTextRenderDefaultCSSFont)
{
    // createTextRender() calls setupFont(12.0, "sans-serif", "normal", "normal")
    Canvas2DTextRender2 *pTR = static_cast<Canvas2DTextRender2 *>(qsys::createTextRender());
    EXPECT_EQ(pTR->getCSSFont(), "12px sans-serif");
    qsys::destroyTextRender(pTR);
}

// renderText: basic sanity with default (empty) pixel buffer

TEST(Canvas2DTextRender2Test, RenderTextReturnsTrue)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(12.0, "sans-serif", "normal", "normal");
    gfx::PixelBuffer buf;
    EXPECT_TRUE(obj.renderText("hello", buf));
}

TEST(Canvas2DTextRender2Test, RenderTextSetsBufDepthTo8)
{
    Canvas2DTextRender2 obj;
    obj.setupFont(12.0, "sans-serif", "normal", "normal");
    gfx::PixelBuffer buf;
    obj.renderText("A", buf);
    EXPECT_EQ(buf.getDepth(), 8);
}
