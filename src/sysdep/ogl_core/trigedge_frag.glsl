// -*-Mode: C++;-*-
//
//  triangle edge fragment shader for OpenGL
//

#include "fog_inc.glsl"

////////////////////
// Uniform variables

uniform float frag_alpha;

////////////////////
// Varying

varying vec4 v_frontColor;
varying float v_fogCoord;

void main(void)
{
    gl_FragColor = fragFogColor(v_frontColor, frag_alpha, v_fogCoord);
}
