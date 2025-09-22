// -*-Mode: C++;-*-
//
//  Pixel drawing shader for OpenGL
//

// #version 120

////////////////////
// Uniform variables
uniform sampler2D u_texture;
uniform vec3 u_colorBias;
// uniform float u_alphaThreshold;
uniform float frag_alpha;

// fog
uniform float u_fogEnd;
uniform float u_fogScale;
uniform vec3 u_fogColor;


////////////////////
// Varying variables

varying vec2 v_texCoord;
varying float v_fogCoord;

void main()
{
    float alphaThreshold = 0.1;

    // Alpha is stored R channel in the GL_ALPHA texture
    float alpha = texture2D(u_texture, v_texCoord).a;
    alpha *= frag_alpha;

    // Alpha test
    if (alpha <= alphaThreshold) {
        discard;
    }

    // Apply color bias (equivalent to glPixelTransferf bias)
    // gl_FragColor = vec4(alpha, v_texCoord.x, v_texCoord.y, 1);

    float fog = (u_fogEnd - v_fogCoord) * u_fogScale;
    fog = clamp(fog, 0.0, 1.0);
    vec3 fogmixed = mix(u_fogColor, u_colorBias, fog);
    gl_FragColor = vec4(fogmixed, alpha);
}
