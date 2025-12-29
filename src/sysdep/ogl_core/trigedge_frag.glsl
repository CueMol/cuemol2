// -*-Mode: C++;-*-
//
//  triangle edge fragment shader for OpenGL
//
#define varying in

#include "fog_inc.glsl"

////////////////////
// Uniform variables

uniform float frag_alpha;
uniform int u_silh;

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
