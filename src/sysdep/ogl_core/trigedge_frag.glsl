// -*-Mode: C++;-*-
//
//  triangle edge fragment shader for OpenGL
//
#define varying in

#include "fog_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;  // offset 0
    float edge_width;  // offset 4
    int   u_silh;      // offset 8
    float _pad;        // offset 12
    vec4  edge_color;  // offset 16
};

////////////////////
// Varying

varying vec4 v_frontColor;
varying float v_fogCoord;
varying vec3 v_ecNormal;

layout(location = 0) out vec4 o_FragColor;
// MRT eye-space normal for GTAO (sentinel (0,0,0) -> reconstruct from depth).
// vec4 to match o_FragColor (Apple Metal GL mishandles mixed vec4/vec3 MRT).
layout(location = 1) out vec4 o_Normal;

void main(void)
{
    o_FragColor = fragFogColor(v_frontColor, frag_alpha, v_fogCoord);

    // Edge-line (inverted-hull) fragments are decorative outlines: write the
    // sentinel normal (0,0,0) so the GTAO pass excludes them as both occluder and
    // receiver, matching the line / label / sphere / cylinder edge convention.
    // Otherwise the offset hull is mistaken for real geometry and perturbs the AO
    // around edges (e.g. crease mode darkening near the outline).
    o_Normal = vec4(0.0, 0.0, 0.0, 1.0);

    if (u_silh == 1) {
        gl_FragDepth = 0.9999;
    } else {
        gl_FragDepth = gl_FragCoord.z;
    }
}
