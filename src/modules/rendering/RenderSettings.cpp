// -*-Mode: C++;-*-
//
// Render settings stored in the scene (Scene app data "render")
//

#include <common.h>

#include "RenderSettings.hpp"

using namespace render;

// Each constructor ends with resetAllProps(), the wrapper-generated reset
// that writes every declared default through the property setters (no
// events, no undo). LScrObjBase::resetProperty cannot be used for this: a
// fresh object reports every property as "still default" and returns early.

PovRenderSettings::PovRenderSettings()
    : m_shadow(false),
      m_lightDefault(true),
      m_lightSpread(1),
      m_lightIntensity(0.0),
      m_flashFraction(0.0),
      m_ambientFraction(0.0)
{
  resetAllProps();
}

PovRenderSettings::~PovRenderSettings() {}

UmbreonRenderSettings::UmbreonRenderSettings()
    : m_supersample(1),
      m_aoEnabled(false),
      m_aoSamples(0),
      m_aoDistance(0.0),
      m_aoIntensity(0.0),
      m_aoDiffuseFactor(0.0),
      m_aoMultiScale(false),
      m_aoBentNormal(false),
      m_aoLowDiscrepancy(false),
      m_shadows(false),
      m_shadowSamples(1),
      m_lightRadius(0.0),
      m_creaseLimit(0.0),
      m_edgeRise(0.0),
      m_contactEdges(true),
      m_useGI(false),
      m_giSkyGradient(false),
      m_lightIntensity(0.0),
      m_flashFraction(0.0),
      m_ambientFraction(0.0)
{
  // Virtual dispatch resolves to this class here: the umbreon defaults.
  resetAllProps();
}

UmbreonRenderSettings::~UmbreonRenderSettings() {}

UmbreonNprRenderSettings::UmbreonNprRenderSettings()
    : m_hatchDensity(0.0),
      m_hatchWidthScale(0.0),
      m_hatchCustomInk(false),
      m_hatchCustomPaper(false),
      m_hatchDefaultEdges(false)
{
  // Now the NPR class: its own properties and the overridden defaults.
  resetAllProps();
}

UmbreonNprRenderSettings::~UmbreonNprRenderSettings() {}

RenderSettings::RenderSettings()
    : m_width(0.0),
      m_height(0.0),
      m_dpi(0.0),
      m_transparentBg(false),
      m_postBlend(false),
      m_pixelLabels(false),
      m_stereoDepth(0.0),
      m_clipPlane(false),
      m_numThreads(1),
      m_edgeLines(false),
      m_pPovray(MB_NEW PovRenderSettings()),
      m_pUmbreon(MB_NEW UmbreonRenderSettings()),
      m_pUmbreonNpr(MB_NEW UmbreonNprRenderSettings())
{
  resetAllProps();

  // Route the children's property events through this object (dotted
  // names), as a renderer does with its section objects.
  setupParentData("povray");
  setupParentData("umbreon");
  setupParentData("umbreon_npr");
}

RenderSettings::~RenderSettings() {}
