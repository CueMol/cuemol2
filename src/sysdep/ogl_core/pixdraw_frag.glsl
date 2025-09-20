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

////////////////////
// Varying variables

varying vec2 v_texCoord;

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
    gl_FragColor = vec4(u_colorBias, alpha);
    // gl_FragColor = vec4(alpha, v_texCoord.x, v_texCoord.y, 1);
}
