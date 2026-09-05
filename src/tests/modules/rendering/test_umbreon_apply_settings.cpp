// UmbreonSceneExporter::applyRenderSettings: the one mapping from the scene
// render settings (Scene app data "render") to the exporter properties that
// the tritium Rendering window, cuetty and the Python module share.
//
// Only member assignments are exercised, so this runs without umbreon
// (write() / beginRender() are never called).

#include <gtest/gtest.h>
#include <common.h>

#include "qlib/LExceptions.hpp"
#include "qlib/LScrSmartPtr.hpp"
#include "qlib/LVariant.hpp"
#include "modules/rendering/RenderSettings.hpp"
#include "modules/rendering/UmbreonSceneExporter.hpp"

using qlib::LString;
using qlib::LVariant;
using render::RenderSettings;
using render::UmbreonSceneExporter;

namespace {

typedef qlib::LScrSp<RenderSettings> SettingsPtr;

/// A fresh settings object (every property at its declared default)
SettingsPtr makeSettings()
{
    return SettingsPtr(MB_NEW RenderSettings());
}

LVariant prop(const UmbreonSceneExporter &ex, const char *name)
{
    LVariant v;
    EXPECT_TRUE(ex.getProperty(name, v)) << name;
    return v;
}

bool propBool(const UmbreonSceneExporter &ex, const char *name) { return prop(ex, name).getBoolValue(); }
int propInt(const UmbreonSceneExporter &ex, const char *name) { return prop(ex, name).getIntValue(); }
double propReal(const UmbreonSceneExporter &ex, const char *name) { return prop(ex, name).getRealValue(); }
LString propStr(const UmbreonSceneExporter &ex, const char *name) { return prop(ex, name).getStringValue(); }

}  // namespace

TEST(UmbreonApplySettings, AppliesCommonAndUmbreonBlock)
{
    SettingsPtr p = makeSettings();
    EXPECT_TRUE(p->setPropStr("projection", "orthographic"));
    EXPECT_TRUE(p->setPropBool("clipPlane", false));
    EXPECT_TRUE(p->setPropBool("edgeLines", false));
    EXPECT_TRUE(p->setPropBool("transparentBg", true));
    // Size in inches at 300 dpi -> pixels
    EXPECT_TRUE(p->setPropStr("unit", "in"));
    EXPECT_TRUE(p->setPropReal("dpi", 300.0));
    EXPECT_TRUE(p->setPropReal("width", 2.0));
    EXPECT_TRUE(p->setPropReal("height", 1.5));

    render::UmbreonRenderSettings *ub = p->getUmbreon().get();
    ASSERT_NE(ub, nullptr);
    EXPECT_TRUE(ub->setPropInt("supersample", 2));
    EXPECT_TRUE(ub->setPropBool("aoEnabled", true));
    EXPECT_TRUE(ub->setPropInt("aoSamples", 64));
    EXPECT_TRUE(ub->setPropStr("aoGather", "Per shading hit"));
    EXPECT_TRUE(ub->setPropReal("aoDiffuseFactor", 0.5));
    EXPECT_TRUE(ub->setPropBool("shadows", true));
    EXPECT_TRUE(ub->setPropInt("shadowSamples", 4));
    EXPECT_TRUE(ub->setPropStr("giSamples", "64"));
    EXPECT_TRUE(ub->setPropStr("denoise", "A-trous"));
    EXPECT_TRUE(ub->setPropReal("lightIntensity", 1.0));
    EXPECT_TRUE(ub->setPropReal("ambientFraction", 0.3));
    EXPECT_TRUE(ub->setPropBool("giSkyGradient", false));
    EXPECT_TRUE(ub->setPropStr("giGroundColor", "#123456"));
    EXPECT_TRUE(ub->setPropReal("creaseLimit", 45.0));
    EXPECT_TRUE(ub->setPropReal("outlineFarDepth", 0.3));

    UmbreonSceneExporter ex;
    EXPECT_STREQ(ex.applyRenderSettings(p, "umbreon").c_str(), "umbreon");

    // common
    EXPECT_FALSE(propBool(ex, "perspective"));
    EXPECT_FALSE(propBool(ex, "useClipZ"));
    EXPECT_FALSE(propBool(ex, "showEdgeLines"));
    EXPECT_TRUE(propBool(ex, "transparentBackground"));
    EXPECT_EQ(ex.getWidth(), 600);
    EXPECT_EQ(ex.getHeight(), 450);

    // umbreon block
    EXPECT_EQ(propInt(ex, "supersample"), 2);
    EXPECT_EQ(propInt(ex, "aoSamples"), 64);
    EXPECT_EQ(propInt(ex, "aoResDiv"), 0);
    EXPECT_DOUBLE_EQ(propReal(ex, "aoDiffuseFactor"), 0.5);
    EXPECT_TRUE(propBool(ex, "aoMultiScale"));  // block default, written while AO is on
    EXPECT_TRUE(propBool(ex, "shadows"));
    EXPECT_EQ(propInt(ex, "shadowSamples"), 4);
    EXPECT_DOUBLE_EQ(propReal(ex, "creaseLimit"), 45.0);
    EXPECT_DOUBLE_EQ(propReal(ex, "outlineFarDepth"), 0.3);

    // GI (the block default is GI on)
    EXPECT_TRUE(propBool(ex, "useGI"));
    EXPECT_EQ(propInt(ex, "giSamples"), 64);
    EXPECT_FALSE(propBool(ex, "giDenoise"));
    EXPECT_EQ(propInt(ex, "denoiser"), 1);
    EXPECT_DOUBLE_EQ(propReal(ex, "lightIntensity"), 1.0);
    EXPECT_DOUBLE_EQ(propReal(ex, "ambientFraction"), 0.3);
    EXPECT_FALSE(propBool(ex, "giSkyGradient"));
    EXPECT_STREQ(propStr(ex, "giGroundColor").c_str(), "#123456");
    EXPECT_FALSE(propBool(ex, "hatchEnable"));
}

TEST(UmbreonApplySettings, GatesAoAmbientAndHatchByBlock)
{
    SettingsPtr p = makeSettings();
    render::UmbreonRenderSettings *ub = p->getUmbreon().get();
    ASSERT_NE(ub, nullptr);
    // AO off: the stored AO knobs must not reach the exporter
    EXPECT_TRUE(ub->setPropBool("aoEnabled", false));
    EXPECT_TRUE(ub->setPropInt("aoSamples", 128));
    EXPECT_TRUE(ub->setPropStr("aoGather", "Per shading hit"));
    EXPECT_TRUE(ub->setPropReal("aoDistance", 5.0));
    // GI off: the GI-side ambient fraction must not dim the direct lights
    EXPECT_TRUE(ub->setPropBool("useGI", false));
    EXPECT_TRUE(ub->setPropReal("ambientFraction", 0.9));

    UmbreonSceneExporter ex;
    EXPECT_STREQ(ex.applyRenderSettings(p, "umbreon").c_str(), "umbreon");
    EXPECT_EQ(propInt(ex, "aoSamples"), 0);
    EXPECT_EQ(propInt(ex, "aoResDiv"), 0);  // ctor value, untouched
    EXPECT_DOUBLE_EQ(propReal(ex, "aoDistance"), 1.0e20);  // ctor value, untouched
    EXPECT_FALSE(propBool(ex, "useGI"));
    EXPECT_DOUBLE_EQ(propReal(ex, "ambientFraction"), 0.16);
    EXPECT_DOUBLE_EQ(propReal(ex, "lightIntensity"), 1.2);  // the block's default

    // NPR block: hatching on, GI never, colors only behind their Custom switch
    render::UmbreonNprRenderSettings *np = p->getUmbreonNpr().get();
    ASSERT_NE(np, nullptr);
    EXPECT_TRUE(np->setPropBool("useGI", true));  // ignored under hatching
    EXPECT_TRUE(np->setPropStr("hatchColoring", "Ink on color fill"));
    EXPECT_TRUE(np->setPropBool("hatchCustomInk", false));
    EXPECT_TRUE(np->setPropStr("hatchInkColor", "#ff0000"));
    EXPECT_TRUE(np->setPropBool("hatchCustomPaper", true));
    EXPECT_TRUE(np->setPropStr("hatchPaperColor", "#eeeeee"));
    EXPECT_TRUE(np->setPropStr("hatchLayersSpec", "layer: kind=line\n"));

    UmbreonSceneExporter ex2;
    EXPECT_STREQ(ex2.applyRenderSettings(p, "umbreon_npr").c_str(), "umbreon_npr");
    EXPECT_TRUE(propBool(ex2, "hatchEnable"));
    EXPECT_FALSE(propBool(ex2, "useGI"));
    EXPECT_STREQ(propStr(ex2, "hatchBase").c_str(), "albedo");
    EXPECT_STREQ(propStr(ex2, "hatchInk").c_str(), "fixed");
    EXPECT_STREQ(propStr(ex2, "hatchInkColor").c_str(), "");
    EXPECT_STREQ(propStr(ex2, "hatchPaperColor").c_str(), "#eeeeee");
    EXPECT_STREQ(propStr(ex2, "hatchLayersSpec").c_str(), "layer: kind=line\n");
    EXPECT_STREQ(propStr(ex2, "hatchToneSpec").c_str(), "");
    EXPECT_DOUBLE_EQ(propReal(ex2, "lightIntensity"), 1.55);  // the NPR block's default
    EXPECT_DOUBLE_EQ(propReal(ex2, "ambientFraction"), 0.16);
}

TEST(UmbreonApplySettings, ResolvesTheBackendFromTheSettings)
{
    SettingsPtr p = makeSettings();
    UmbreonSceneExporter ex;

    // "" = not chosen in the scene, and POV-Ray cannot be honoured: plain umbreon
    EXPECT_STREQ(ex.applyRenderSettings(p, "").c_str(), "umbreon");
    EXPECT_TRUE(p->setPropStr("backend", "povray"));
    EXPECT_STREQ(ex.applyRenderSettings(p, "").c_str(), "umbreon");
    EXPECT_FALSE(propBool(ex, "hatchEnable"));

    EXPECT_TRUE(p->setPropStr("backend", "umbreon_npr"));
    EXPECT_STREQ(ex.applyRenderSettings(p, "").c_str(), "umbreon_npr");
    EXPECT_TRUE(propBool(ex, "hatchEnable"));

    // An explicit backend wins over the stored choice; unknown ids are errors
    EXPECT_STREQ(ex.applyRenderSettings(p, "umbreon").c_str(), "umbreon");
    EXPECT_FALSE(propBool(ex, "hatchEnable"));
    EXPECT_THROW(ex.applyRenderSettings(p, "povray"), qlib::IllegalArgumentException);
}
