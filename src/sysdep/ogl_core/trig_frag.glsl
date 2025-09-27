// -*-Mode: C++;-*-
//
//  Triangle fragment shader for OpenGL
//

#include "fog_inc.glsl"

////////////////////
// Uniform variables

uniform float frag_alpha;

// uniform float u_fogEnd;
// uniform float u_fogScale;
// uniform vec3 u_fogColor;

////////////////////
// Varying variables

varying vec4 v_frontColor;
varying float v_fogCoord;

void main(void)
{
    gl_FragColor = fragFogColor(v_frontColor, frag_alpha, v_fogCoord);
}
