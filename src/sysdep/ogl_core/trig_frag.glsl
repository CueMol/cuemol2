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

out vec4 o_FragColor;

void main(void)
{
    o_FragColor = fragFogColor(v_frontColor, frag_alpha, v_fogCoord);
}
