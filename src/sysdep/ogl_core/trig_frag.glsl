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
// MRT eye-space normal for GTAO (sentinel vec3(0) -> reconstruct from depth).
layout(location = 1) out vec3 o_Normal;

void main(void)
{
    o_FragColor = fragFogColor(v_frontColor, frag_alpha, v_fogCoord);

    // Write the real eye-space normal whenever one is available (lit or not), so
    // only genuinely normal-less primitives fall back to the sentinel.
    o_Normal = (dot(v_ecNormal, v_ecNormal) > 1e-12) ? normalize(v_ecNormal)
                                                     : vec3(0.0);
}
