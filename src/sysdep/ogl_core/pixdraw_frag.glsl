// -*-Mode: C++;-*-
//
//  Pixel drawing shader for OpenGL
//
#define varying in

#include "fog_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;     // offset 0
    float _p1, _p2, _p3; // offset 4, 8, 12 (padding for vec3 alignment)
    vec3  u_position;     // offset 16
    float _p4;            // offset 28
    vec2  u_size;         // offset 32
    vec2  u_viewportSize; // offset 40
    vec3  u_colorBias;    // offset 48
    float _p5;            // offset 60
};

////////////////////
// Regular uniforms (samplers cannot go in UBO)
uniform sampler2D u_texture;

////////////////////
// Varying variables

varying vec2 v_texCoord;
varying float v_fogCoord;

layout(location = 0) out vec4 o_FragColor;
// Billboard glyphs have no surface normal: write the sentinel (0,0,0) so GTAO
// leaves these pixels unshaded. vec4 to match o_FragColor (Apple Metal GL
// mishandles mixed vec4/vec3 MRT).
layout(location = 1) out vec4 o_Normal;

void main()
{
    float alphaThreshold = 0.1;

    float alpha = texture(u_texture, v_texCoord).r;

    // Alpha test
    if (alpha <= alphaThreshold) {
        discard;
    }

    o_FragColor = fragFogColor(vec4(u_colorBias, alpha), frag_alpha, v_fogCoord);
    o_Normal = vec4(0.0, 0.0, 0.0, 1.0);
}
