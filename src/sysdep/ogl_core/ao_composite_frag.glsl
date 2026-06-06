// AO composite fragment shader.
// Multiplies the off-screen scene color by the ambient-occlusion term and
// writes the result to the bound framebuffer. With u_hasAO == 0 it is a plain
// pass-through copy (used before the AO term is available).

uniform sampler2D u_colorTex;
uniform sampler2D u_aoTex;
uniform int u_hasAO;

in vec2 v_uv;

out vec4 o_FragColor;

void main()
{
    vec4 c = texture(u_colorTex, v_uv);
    if (u_hasAO != 0) {
        float ao = texture(u_aoTex, v_uv).r;
        o_FragColor = vec4(c.rgb * ao, c.a);
    } else {
        o_FragColor = c;
    }
}
