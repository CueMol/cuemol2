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

out vec4 o_FragColor;

void main(void)
{
    o_FragColor = fragFogColor(v_frontColor, frag_alpha, v_fogCoord);

    if (u_silh == 1) {
        gl_FragDepth = 0.9999;
    } else {
        gl_FragDepth = gl_FragCoord.z;
    }
}
