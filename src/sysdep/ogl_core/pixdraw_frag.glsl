// -*-Mode: C++;-*-
//
//  Pixel drawing shader for OpenGL
//

// #version 120
#include "fog_inc.glsl"

////////////////////
// Uniform variables
uniform sampler2D u_texture;
uniform vec3 u_colorBias;
// uniform float u_alphaThreshold;
uniform float frag_alpha;

// // fog
// uniform float u_fogEnd;
// uniform float u_fogScale;
// uniform vec3 u_fogColor;

////////////////////
// Varying variables

varying vec2 v_texCoord;
varying float v_fogCoord;

void main()
{
    float alphaThreshold = 0.1;

    float alpha = texture2D(u_texture, v_texCoord).a;
    // alpha *= frag_alpha;

    // Alpha test
    if (alpha <= alphaThreshold) {
        discard;
    }

    gl_FragColor = fragFogColor(vec4(u_colorBias, alpha), frag_alpha, v_fogCoord);
}
