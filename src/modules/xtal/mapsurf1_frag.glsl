// -*-Mode: C++;-*-
//
//  mapsurf1_frag.glsl:
//    fragment shader
//

#define varying in
#include "fog_inc.glsl"

uniform float frag_alpha;

varying vec4 v_frontColor;
varying float v_fogCoord;

out vec4 o_FragColor;

void main()
{
    // o_FragColor = v_frontColor;
    o_FragColor = fragFogColor(v_frontColor, frag_alpha, v_fogCoord);
    // o_FragColor = vec4(1,1,1,1);
}

