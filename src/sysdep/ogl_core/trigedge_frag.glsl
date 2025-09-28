// -*-Mode: C++;-*-
//
//  triangle edge fragment shader for OpenGL
//
#define varying in

#include "fog_inc.glsl"

////////////////////
// Uniform variables

uniform float frag_alpha;

////////////////////
// Varying

varying vec4 v_frontColor;
varying float v_fogCoord;

out vec4 o_FragColor;

void main(void)
{
    o_FragColor = fragFogColor(v_frontColor, frag_alpha, v_fogCoord);
}
