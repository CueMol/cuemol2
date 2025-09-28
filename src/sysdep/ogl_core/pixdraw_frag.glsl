// -*-Mode: C++;-*-
//
//  Pixel drawing shader for OpenGL
//
#define varying in

#include "fog_inc.glsl"

////////////////////
// Uniform variables
uniform sampler2D u_texture;
uniform vec3 u_colorBias;
// uniform float u_alphaThreshold;
uniform float frag_alpha;

////////////////////
// Varying variables

varying vec2 v_texCoord;
varying float v_fogCoord;

out vec4 o_FragColor;

void main()
{
    o_FragColor = vec4(1.0, 0.0, 1.0, 1.0); // debug
    return;

    float alphaThreshold = 0.1;

    // float alpha = texture2D(u_texture, v_texCoord).a;
    float alpha = texture(u_texture, v_texCoord).a;

    // Alpha test
    if (alpha <= alphaThreshold) {
        discard;
    }

    o_FragColor = fragFogColor(vec4(u_colorBias, alpha), frag_alpha, v_fogCoord);
}
