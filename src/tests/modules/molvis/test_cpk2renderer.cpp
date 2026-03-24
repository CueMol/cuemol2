// -*-Mode: C++;-*-
//
// Tests for CPK2Renderer property defaults and basic behavior.
//

#include <gtest/gtest.h>
#include <common.h>
#include "molvis/CPK2Renderer.hpp"

using molvis::CPK2Renderer;

// ---- getTypeName ----

TEST(CPK2RendererTest, GetTypeNameIsCpk)
{
    CPK2Renderer r;
    EXPECT_STREQ(r.getTypeName(), "cpk");
}

// ---- isRendBond ----

TEST(CPK2RendererTest, IsRendBondFalse)
{
    CPK2Renderer r;
    EXPECT_FALSE(r.isRendBond());
}

// ---- getGLRenderMode ----

TEST(CPK2RendererTest, DefaultGLRenderModeIsZero)
{
    CPK2Renderer r;
    EXPECT_EQ(r.getGLRenderMode(), CPK2Renderer::REND_DEFAULT);
}

// ---- setDetail / getDetail ----

TEST(CPK2RendererTest, SetDetail)
{
    CPK2Renderer r;
    r.setDetail(5);
    EXPECT_EQ(r.getDetail(), 5);
}

// ---- invalidateDisplayCache does not crash before init ----

TEST(CPK2RendererTest, InvalidateBeforeInitDoesNotCrash)
{
    CPK2Renderer r;
    EXPECT_NO_FATAL_FAILURE(r.invalidateDisplayCache());
}
