// -*-Mode: C++;-*-
//
//  Off-screen render target (framebuffer object) abstraction
//

#pragma once

#include "gfx.hpp"

namespace gfx {

/// Attachment configuration flags for RenderTarget (bitmask).
enum RTFlags
{
    /// 8-bit RGBA color attachment 0.
    RT_COLOR_RGBA8 = 0x01,
    /// Sampleable depth texture attachment (DEPTH_COMPONENT24).
    RT_DEPTH_TEX = 0x02,
    /// Use NEAREST (point) filtering for the color attachment instead of
    /// LINEAR. Required for targets holding packed data (e.g. AO + packed
    /// edges) that must not be interpolated.
    RT_COLOR_NEAREST = 0x04,
    /// MRT normal color attachment 1 (RGBA16F). Used by the GTAO pass for
    /// geometry normals. RGBA (not RGB) because RGB16F is not a guaranteed
    /// color-renderable format and is mishandled by some drivers (Apple GL).
    RT_NORMAL_RGBA16F = 0x08,
    /// Make color attachment 0 RGBA16F (float) instead of RGBA8. Used by the
    /// temporal-jitter accumulation target to avoid 8-bit banding when summing
    /// many samples.
    RT_COLOR_RGBA16F = 0x10,
};

/// Conventional texture-unit assignments shared by post-processing passes.
enum RTTexUnit
{
    RT_TU_COLOR = 0,
    RT_TU_DEPTH = 1,
    RT_TU_NORMAL = 2,
    RT_TU_NOISE = 3,
    /// SMAA lookup textures (blending-weight pass).
    RT_TU_SMAA_AREA = 4,
    RT_TU_SMAA_SEARCH = 5,
};

/// Backend-independent off-screen render target (color + depth, optional
/// MRT normal). Created via DisplayContext::createRenderTarget; the scene is
/// rendered into it via bind()/unbind(), and its attachments are exposed to
/// shaders as textures (bindDepthTex) or read back to the CPU (readColor).
class GFX_API RenderTarget
{
public:
    virtual ~RenderTarget() {}

    /// Make this render target the current draw target and set the viewport
    /// to its size. Saves the previous viewport for unbind().
    virtual void bind() = 0;

    /// Restore the default framebuffer and the previously saved viewport.
    virtual void unbind() = 0;

    /// Clear the color (RGBA) and depth buffers. Must be called while bound.
    /// Unlike DisplayContext::clearBuffer, the alpha is explicit so off-screen
    /// captures can produce a transparent background (a == 0).
    virtual void clear(float r, float g, float b, float a) = 0;

    /// Re-allocate all attachments to the given size. No-op if unchanged.
    virtual void resize(int w, int h) = 0;

    /// Bind color attachment idx as a sampler texture on the given texunit.
    virtual void bindColorTex(int idx, int texUnit) = 0;

    /// Bind the depth attachment as a sampler texture on the given texunit.
    virtual void bindDepthTex(int texUnit) = 0;

    /// Unbind sampler textures bound by bindColorTex / bindDepthTex.
    virtual void unbindTextures() = 0;

    /// Read back a sub-rectangle of color attachment idx into pbuf.
    /// Coordinates are in framebuffer space (bottom-left origin). ncomp is 3
    /// (RGB) or 4 (RGBA). pbuf must hold at least the platform row-aligned size.
    virtual void readColor(int idx, int x, int y, int w, int h, int ncomp,
                           void *pbuf) = 0;

    /// Copy this target's depth attachment (1:1) into the default framebuffer's
    /// depth buffer. Used by the live AO path so the UI overlays drawn into the
    /// default framebuffer afterwards depth-test against the off-screen scene as
    /// in the non-AO path. Default is a no-op.
    virtual void blitDepthToDefault() {}

    /// True if an MRT normal attachment was allocated.
    virtual bool hasNormal() const = 0;

    virtual int getWidth() const = 0;
    virtual int getHeight() const = 0;
};

}  // namespace gfx
