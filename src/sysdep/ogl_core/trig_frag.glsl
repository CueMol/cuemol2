// -*-Mode: C++;-*-
//
//  Triangle fragment shader for OpenGL
//
#define varying in

#include "fog_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;       // offset 0
    int   enable_lighting;  // offset 4
    int   u_nodepth;        // offset 8
    float _pad;             // offset 12
};

////////////////////
// Varying variables

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

    // Write the real eye-space normal whenever one is available (lit or not), so
    // only genuinely normal-less primitives fall back to the sentinel.
    o_Normal = (dot(v_ecNormal, v_ecNormal) > 1e-12)
                   ? vec4(normalize(v_ecNormal), 1.0)
                   : vec4(0.0, 0.0, 0.0, 1.0);
}
