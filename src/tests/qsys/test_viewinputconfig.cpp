#include <gtest/gtest.h>
#include <common.h>
#include "qsys/ViewInputConfig.hpp"

using qsys::ViewInputConfig;
using qlib::LString;

// ViewInputConfig is a singleton initialized by qsys::init("") in test_main.cpp.

TEST(ViewInputConfigTest, SingletonNotNull)
{
    EXPECT_NE(ViewInputConfig::getInstance(), nullptr);
}

TEST(ViewInputConfigTest, SetGetTbRad)
{
    ViewInputConfig *pVIC = ViewInputConfig::getInstance();
    pVIC->setTbRad(1.5);
    EXPECT_DOUBLE_EQ(pVIC->getTbRad(), 1.5);
}

TEST(ViewInputConfigTest, SetGetHitPrec)
{
    ViewInputConfig *pVIC = ViewInputConfig::getInstance();
    pVIC->setHitPrec(0.05);
    EXPECT_DOUBLE_EQ(pVIC->getHitPrec(), 0.05);
}

TEST(ViewInputConfigTest, SetBindingAndGetBinding)
{
    ViewInputConfig *pVIC = ViewInputConfig::getInstance();
    // bind VIEW_ROTX to LBUTTON | MOUSE_X
    pVIC->setBinding(ViewInputConfig::VIEW_ROTX, "LBUTTON|MOUSE_X");
    LString s = pVIC->getBinding(ViewInputConfig::VIEW_ROTX);
    EXPECT_FALSE(s.isEmpty());
    EXPECT_GE(s.indexOf("LBUTTON"), 0);
    EXPECT_GE(s.indexOf("MOUSE_X"), 0);
}

TEST(ViewInputConfigTest, RemoveBindings)
{
    ViewInputConfig *pVIC = ViewInputConfig::getInstance();
    pVIC->setBinding(ViewInputConfig::VIEW_ROTY, "RBUTTON|MOUSE_Y");
    EXPECT_FALSE(pVIC->getBinding(ViewInputConfig::VIEW_ROTY).isEmpty());

    pVIC->removeBindings(ViewInputConfig::VIEW_ROTY);
    EXPECT_TRUE(pVIC->getBinding(ViewInputConfig::VIEW_ROTY).isEmpty());
}

TEST(ViewInputConfigTest, SetBindingEmptyStringClearsBinding)
{
    ViewInputConfig *pVIC = ViewInputConfig::getInstance();
    pVIC->setBinding(ViewInputConfig::VIEW_ROTZ, "SHIFT|MOUSE_X");
    EXPECT_FALSE(pVIC->getBinding(ViewInputConfig::VIEW_ROTZ).isEmpty());

    pVIC->setBinding(ViewInputConfig::VIEW_ROTZ, "");
    EXPECT_TRUE(pVIC->getBinding(ViewInputConfig::VIEW_ROTZ).isEmpty());
}

TEST(ViewInputConfigTest, SetConfRotXRoundtrip)
{
    ViewInputConfig *pVIC = ViewInputConfig::getInstance();
    pVIC->setConfRotX("LBUTTON|MOUSE_X");
    LString s = pVIC->getConfRotX();
    EXPECT_GE(s.indexOf("LBUTTON"), 0);
    EXPECT_GE(s.indexOf("MOUSE_X"), 0);
}

TEST(ViewInputConfigTest, SetConfZoomRoundtrip)
{
    ViewInputConfig *pVIC = ViewInputConfig::getInstance();
    pVIC->setConfZoom("WHEEL1");
    LString s = pVIC->getConfZoom();
    EXPECT_GE(s.indexOf("WHEEL1"), 0);
}

TEST(ViewInputConfigTest, MultipleBindingsForSameID)
{
    ViewInputConfig *pVIC = ViewInputConfig::getInstance();
    // comma-separated list assigns multiple modifier combos to one operation
    pVIC->setBinding(ViewInputConfig::VIEW_ZOOM, "WHEEL1,CTRL|MOUSE_Y");
    LString s = pVIC->getBinding(ViewInputConfig::VIEW_ZOOM);
    EXPECT_GE(s.indexOf("WHEEL1"), 0);
    EXPECT_GE(s.indexOf("MOUSE_Y"), 0);
}
