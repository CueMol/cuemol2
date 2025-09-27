// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL
//

#include "fog_inc.glsl"

uniform float frag_alpha;
uniform float stippleLen;
uniform vec4 u_color;
uniform bool use_u_color;

////////////////////
// Varying

varying float v_length;
varying vec4 v_frontColor;
varying float v_fogCoord;

void main(void)
{
    if (stippleLen > 0.0) {
        float stipos = mod(v_length, stippleLen);
        if (stipos < stippleLen * 0.5) {
            // gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            discard;
        }
    }

    vec4 color;
    if (use_u_color) {
        color = u_color;
    } else {
        color = v_frontColor;
    }

    gl_FragColor = fragFogColor(color, frag_alpha, v_fogCoord);
}
