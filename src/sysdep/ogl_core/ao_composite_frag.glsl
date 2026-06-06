// AO composite fragment shader.
// Samples the off-screen scene color texture and writes it to the bound
// framebuffer. In this initial step it is a pass-through copy; a later step
// multiplies the scene color by the ambient-occlusion term.

uniform sampler2D u_colorTex;

in vec2 v_uv;

out vec4 o_FragColor;

void main()
{
    o_FragColor = texture(u_colorTex, v_uv);
}
