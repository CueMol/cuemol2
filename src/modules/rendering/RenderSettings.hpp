// -*-Mode: C++;-*-
//
// Render settings stored in the scene (Scene app data "render")
//

#ifndef RENDER_SETTINGS_HPP_INCLUDED_
#define RENDER_SETTINGS_HPP_INCLUDED_

#include "render.hpp"

#include <qsys/SceneAppData.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>

class RenderSettings_wrap;
class PovRenderSettings_wrap;
class UmbreonRenderSettings_wrap;
class UmbreonNprRenderSettings_wrap;

namespace render {

  using qlib::LString;

  /// POV-Ray backend block (RenderSettings.povray)
  class RENDER_API PovRenderSettings : public qlib::LNoCopyScrObject
  {
    MC_SCRIPTABLE;

    friend class ::PovRenderSettings_wrap;

  protected:
    LString m_radiosityMode;
    bool m_shadow;
    bool m_lightDefault;
    int m_lightSpread;
    double m_lightIntensity;
    double m_flashFraction;
    double m_ambientFraction;

  public:
    PovRenderSettings();
    ~PovRenderSettings() override;
  };

  /// umbreon backend block (RenderSettings.umbreon)
  class RENDER_API UmbreonRenderSettings : public qlib::LNoCopyScrObject
  {
    MC_SCRIPTABLE;

    friend class ::UmbreonRenderSettings_wrap;

  protected:
    int m_supersample;
    bool m_aoEnabled;
    int m_aoSamples;
    double m_aoDistance;
    double m_aoIntensity;
    double m_aoDiffuseFactor;
    bool m_aoMultiScale;
    bool m_aoBentNormal;
    bool m_aoLowDiscrepancy;
    LString m_aoGather;
    bool m_shadows;
    int m_shadowSamples;
    double m_lightRadius;
    LString m_creaseLimit;  // "Off" or the crease fold angle in degrees
    double m_edgeRise;
    bool m_contactEdges;
    double m_outlineFarDepth;
    bool m_useGI;
    LString m_giSamples;
    LString m_denoise;
    bool m_giSkyGradient;
    LString m_giGroundColor;
    double m_lightIntensity;
    double m_flashFraction;
    double m_ambientFraction;

  public:
    UmbreonRenderSettings();
    ~UmbreonRenderSettings() override;
  };

  /// umbreon NPR (hatching) backend block (RenderSettings.umbreon_npr)
  class RENDER_API UmbreonNprRenderSettings : public UmbreonRenderSettings
  {
    MC_SCRIPTABLE;

    friend class ::UmbreonNprRenderSettings_wrap;

  protected:
    LString m_hatchStyle;
    LString m_hatchColoring;
    double m_hatchDensity;
    double m_hatchWidthScale;
    bool m_hatchCustomInk;
    LString m_hatchInkColor;
    bool m_hatchCustomPaper;
    LString m_hatchPaperColor;
    bool m_hatchDefaultEdges;
    LString m_hatchLayersSpec;
    LString m_hatchToneSpec;

  public:
    UmbreonNprRenderSettings();
    ~UmbreonNprRenderSettings() override;
  };

  /// Rendering-window settings of the tritium GUI, kept per scene.
  ///
  /// The backend-independent settings are properties of this object; each
  /// backend's own settings live in a child object named by the backend id
  /// (see RenderSettings.qif). A property change of a child reaches this
  /// object's propChanged (SceneAppData) with its dotted name, so it is
  /// undone and reported like a change of the object itself.
  ///
  /// Every constructor applies the defaults declared in the .qif through
  /// resetAllProps(): the .qif is the single source of the initial values.
  class RENDER_API RenderSettings : public qsys::SceneAppData
  {
    MC_SCRIPTABLE;

    friend class ::RenderSettings_wrap;

  private:
    LString m_backend;
    double m_width;
    double m_height;
    LString m_unit;
    double m_dpi;
    bool m_transparentBg;
    bool m_postBlend;
    bool m_pixelLabels;
    LString m_projection;
    LString m_stereoMode;
    double m_stereoDepth;
    bool m_clipPlane;
    int m_numThreads;
    bool m_edgeLines;

    qlib::LScrSp<PovRenderSettings> m_pPovray;
    qlib::LScrSp<UmbreonRenderSettings> m_pUmbreon;
    qlib::LScrSp<UmbreonNprRenderSettings> m_pUmbreonNpr;

  public:
    RenderSettings();
    ~RenderSettings() override;

    qlib::LScrSp<PovRenderSettings> getPovray() const { return m_pPovray; }
    qlib::LScrSp<UmbreonRenderSettings> getUmbreon() const { return m_pUmbreon; }
    qlib::LScrSp<UmbreonNprRenderSettings> getUmbreonNpr() const { return m_pUmbreonNpr; }
  };

}

#endif
