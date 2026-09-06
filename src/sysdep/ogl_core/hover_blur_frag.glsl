// Hover highlight, pass 2 of 3: vertical Gaussian blur of the element mask.
//
// Runs at pick-buffer resolution on the output of hover_mask_frag.glsl (red
// channel), with the same kernel (u_sigma texels, +-u_radius). The result is
// the soft mask the overlay samples bilinearly: about 0.5 on the element
// boundary, 1 deep inside, 0 far outside.

uniform sampler2D u_maskTex;
uniform ivec2 u_size;   // mask size in texels
uniform float u_sigma;  // Gaussian sigma in texels
uniform int u_radius;   // kernel half-width in texels

in vec2 v_uv;

out vec4 o_FragColor;

float maskAt(ivec2 p)
{
    p = clamp(p, ivec2(0), u_size - 1);
    return texelFetch(u_maskTex, p, 0).r;
}

void main()
{
    ivec2 p = ivec2(v_uv * vec2(u_size));
    float k2 = -0.5 / (u_sigma * u_sigma);
    float sum = 0.0;
    float wsum = 0.0;
    for (int k = -u_radius; k <= u_radius; ++k) {
        float w = exp(float(k * k) * k2);
        sum += w * maskAt(p + ivec2(0, k));
        wsum += w;
    }
    float v = sum / wsum;
    o_FragColor = vec4(v, v, v, 1.0);
}
