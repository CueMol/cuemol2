// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL
//
#define varying in

#include "fog_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;   // offset 0
    float lineWidth;    // offset 4
    float stippleLen;   // offset 8
    int   u_nodepth;    // offset 12
    vec2  screenSize;   // offset 16
    int   use_u_color;  // offset 24
    float _pad;         // offset 28
    vec4  u_color;      // offset 32
};

////////////////////
// Varying

varying float v_length;
varying vec4 v_frontColor;
varying float v_fogCoord;

layout(location = 0) out vec4 o_FragColor;
// Lines have no surface normal: write the sentinel so GTAO reconstructs from
// depth for these pixels (MRT normal output is ignored when there is no
// attachment).
layout(location = 1) out vec3 o_Normal;

void main(void)
{
    if (stippleLen > 0.0) {
        float stipos = mod(v_length, stippleLen);
        if (stipos < stippleLen * 0.5) {
            discard;
        }
    }

    vec4 color;
    if (use_u_color != 0) {
        color = u_color;
    } else {
        color = v_frontColor;
    }

    o_FragColor = fragFogColor(color, frag_alpha, v_fogCoord);
    o_Normal = vec3(0.0);
}
