// -*-Mode: C++;-*-
//
//  Tests for SimpleRenderer (property defaults and accessors)
//

#include <gtest/gtest.h>
#include <common.h>
#include "molstr/SimpleRenderer.hpp"

using molstr::SimpleRenderer;

// ---- Default constructor ----

TEST(SimpleRendererTest, DefaultValBondTrue)
{
    SimpleRenderer r;
    EXPECT_TRUE(r.getValBond());
}

TEST(SimpleRendererTest, DefaultVBScl1IsMinusZeroPointZeroFive)
{
    SimpleRenderer r;
    EXPECT_DOUBLE_EQ(r.getVBScl1(), -0.05);
}

TEST(SimpleRendererTest, DefaultVBScl2IsZeroPointZeroFive)
{
    SimpleRenderer r;
    EXPECT_DOUBLE_EQ(r.getVBScl2(), 0.05);
}

// ---- getTypeName ----

TEST(SimpleRendererTest, GetTypeNameIsSimple)
{
    SimpleRenderer r;
    EXPECT_STREQ(r.getTypeName(), "simple");
}

// ---- isRendBond ----

TEST(SimpleRendererTest, IsRendBondTrue)
{
    SimpleRenderer r;
    EXPECT_TRUE(r.isRendBond());
}

// ---- setValBond / getValBond ----

TEST(SimpleRendererTest, SetValBondFalse)
{
    SimpleRenderer r;
    r.setValBond(false);
    EXPECT_FALSE(r.getValBond());
}

TEST(SimpleRendererTest, SetValBondTrueAfterFalse)
{
    SimpleRenderer r;
    r.setValBond(false);
    r.setValBond(true);
    EXPECT_TRUE(r.getValBond());
}

// ---- setVBScl1 / getVBScl1 ----

TEST(SimpleRendererTest, SetGetVBScl1)
{
    SimpleRenderer r;
    r.setVBScl1(-0.1);
    EXPECT_DOUBLE_EQ(r.getVBScl1(), -0.1);
}

TEST(SimpleRendererTest, SetGetVBScl1Positive)
{
    SimpleRenderer r;
    r.setVBScl1(0.2);
    EXPECT_DOUBLE_EQ(r.getVBScl1(), 0.2);
}

// ---- setVBScl2 / getVBScl2 ----

TEST(SimpleRendererTest, SetGetVBScl2)
{
    SimpleRenderer r;
    r.setVBScl2(0.1);
    EXPECT_DOUBLE_EQ(r.getVBScl2(), 0.1);
}

TEST(SimpleRendererTest, SetGetVBScl2Negative)
{
    SimpleRenderer r;
    r.setVBScl2(-0.3);
    EXPECT_DOUBLE_EQ(r.getVBScl2(), -0.3);
}

// ---- setLineWidth / getLineWidth ----

TEST(SimpleRendererTest, SetGetLineWidth)
{
    SimpleRenderer r;
    r.setLineWidth(2.5);
    EXPECT_DOUBLE_EQ(r.getLineWidth(), 2.5);
}

TEST(SimpleRendererTest, SetGetLineWidthOne)
{
    SimpleRenderer r;
    r.setLineWidth(1.0);
    EXPECT_DOUBLE_EQ(r.getLineWidth(), 1.0);
}

// ---- DrawObj2-based shader state ----

TEST(SimpleRendererTest, DefaultUseShaderFalse)
{
    SimpleRenderer r;
    EXPECT_FALSE(r.m_bUseShader);
}

TEST(SimpleRendererTest, DefaultCheckShaderOKFalse)
{
    SimpleRenderer r;
    EXPECT_FALSE(r.m_bCheckShaderOK);
}

TEST(SimpleRendererTest, DefaultLineDrawObjNotValid)
{
    SimpleRenderer r;
    EXPECT_FALSE(r.m_lineGpuPrim.isValid());
}
