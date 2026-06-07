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
varying vec3 v_ecNormal;

layout(location = 0) out vec4 o_FragColor;
// MRT eye-space normal for GTAO (sentinel (0,0,0) -> reconstruct from depth).
// vec4 to match o_FragColor (Apple Metal GL mishandles mixed vec4/vec3 MRT).
layout(location = 1) out vec4 o_Normal;

void main()
{
    // o_FragColor = v_frontColor;
    o_FragColor = fragFogColor(v_frontColor, frag_alpha, v_fogCoord);
    // o_FragColor = vec4(1,1,1,1);

    o_Normal = (dot(v_ecNormal, v_ecNormal) > 1e-12)
                   ? vec4(normalize(v_ecNormal), 1.0)
                   : vec4(0.0, 0.0, 0.0, 1.0);
}

