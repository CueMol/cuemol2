// -*-Mode: C++;-*-
//
//  Pixel drawing shader for OpenGL
//

// #version 120

////////////////////
// Uniform variables
uniform sampler2D u_texture;
uniform vec3 u_colorBias;
uniform float u_alphaThreshold;

////////////////////
// Varying variables

varying vec2 v_texCoord;


void main()
{
    // Alpha is stored R channel in the GL_ALPHA texture
    float alpha =
        texture2D(u_texture, v_texCoord).r;

    // Alpha test
    if (alpha <= u_alphaThreshold) {
        discard;
    }

    // Apply color bias (equivalent to glPixelTransferf bias)
    gl_FragColor = vec4(u_colorBias, alpha);
}
