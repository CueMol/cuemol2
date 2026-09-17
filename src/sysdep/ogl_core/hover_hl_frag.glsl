// Hover highlight, pass 3 of 3: overlay.
//
// Samples the soft element mask (hover_mask_frag.glsl + hover_blur_frag.glsl,
// pick-buffer resolution, LINEAR) once per pixel and paints a translucent
// fill inside the element plus a two-tone outline. The two tones lie on
// different surfaces (the outer one on whatever is behind the element, the
// inner one on the element itself), so the caller picks each against its own
// surface (GUIView::hoverEdgeTonesForBg). The mask is a Gaussian blur of the
// binary element mask with sigma = one outline tone, so its value s is about
// Phi(d / sigma) for the signed distance d to the boundary: the outline is
// where s lies between Phi(-1) and Phi(+1), the tone switches at s = 0.5 and
// the fill is where s > 0.5. Drawn over the finished frame with alpha
// blending; fragments outside the outline are discarded.

uniform sampler2D u_maskTex;  // soft mask, red channel
uniform vec4 u_fillColor;     // rgb + strength inside the element
uniform vec4 u_edgeInner;     // rgb + strength of the inner outline
uniform vec4 u_edgeOuter;     // rgb + strength of the outer outline

in vec2 v_uv;

out vec4 o_FragColor;

const float BAND_LO = 0.16;  // Phi(-1): outer edge of the outline
const float BAND_HI = 0.84;  // Phi(+1): inner edge of the outline
const float SOFT = 0.06;     // ramp width of the outline edges in mask units

void main()
{
    float s = texture(u_maskTex, v_uv).r;
    if (s <= BAND_LO - SOFT) discard;

    float band = smoothstep(BAND_LO - SOFT, BAND_LO + SOFT, s) *
                 (1.0 - smoothstep(BAND_HI - SOFT, BAND_HI + SOFT, s));
    float tone = smoothstep(0.42, 0.58, s);  // outer tone -> inner tone
    vec3 edgeRGB = mix(u_edgeOuter.rgb, u_edgeInner.rgb, tone);
    float edgeA = mix(u_edgeOuter.a, u_edgeInner.a, tone) * band;
    float fillA = u_fillColor.a * smoothstep(0.45, 0.55, s);

    // Outline over fill (non-premultiplied for the standard over-blend).
    float a = edgeA + fillA * (1.0 - edgeA);
    if (a <= 0.0) discard;
    vec3 rgb = (edgeRGB * edgeA + u_fillColor.rgb * fillA * (1.0 - edgeA)) / a;
    o_FragColor = vec4(rgb, a);
}
