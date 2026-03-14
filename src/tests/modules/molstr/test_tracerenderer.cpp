// -*-Mode: C++;-*-
//
//  Tests for TraceRenderer (property defaults and accessors)
//

#include <gtest/gtest.h>
#include <common.h>
#include "molstr/TraceRenderer.hpp"

using molstr::TraceRenderer;

// ---- getTypeName ----

TEST(TraceRendererTest, GetTypeNameIsTrace)
{
    TraceRenderer r;
    EXPECT_STREQ(r.getTypeName(), "trace");
}

// ---- setLineWidth / getLineWidth ----

TEST(TraceRendererTest, SetGetLineWidth)
{
    TraceRenderer r;
    r.setLineWidth(2.0);
    EXPECT_DOUBLE_EQ(r.getLineWidth(), 2.0);
}

TEST(TraceRendererTest, SetGetLineWidthSmall)
{
    TraceRenderer r;
    r.setLineWidth(0.5);
    EXPECT_DOUBLE_EQ(r.getLineWidth(), 0.5);
}

TEST(TraceRendererTest, SetGetLineWidthLarge)
{
    TraceRenderer r;
    r.setLineWidth(10.0);
    EXPECT_DOUBLE_EQ(r.getLineWidth(), 10.0);
}

// ---- isHitTestSupported (from MainChainRenderer) ----

TEST(TraceRendererTest, IsHitTestSupportedTrue)
{
    TraceRenderer r;
    EXPECT_TRUE(r.isHitTestSupported());
}

// ---- setPivAtomName / getPivAtomName (from MainChainRenderer) ----

TEST(TraceRendererTest, DefaultPivAtomNameIsEmpty)
{
    TraceRenderer r;
    EXPECT_TRUE(r.getPivAtomName().isEmpty());
}

TEST(TraceRendererTest, SetGetPivAtomNameCA)
{
    TraceRenderer r;
    r.setPivAtomName("CA");
    EXPECT_EQ(r.getPivAtomName(), qlib::LString("CA"));
}

TEST(TraceRendererTest, SetGetPivAtomNameP)
{
    TraceRenderer r;
    r.setPivAtomName("P");
    EXPECT_EQ(r.getPivAtomName(), qlib::LString("P"));
}

TEST(TraceRendererTest, SetPivAtomNameOverwrite)
{
    TraceRenderer r;
    r.setPivAtomName("CA");
    r.setPivAtomName("CB");
    EXPECT_EQ(r.getPivAtomName(), qlib::LString("CB"));
}
