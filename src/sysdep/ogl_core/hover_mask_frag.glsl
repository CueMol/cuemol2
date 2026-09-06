// Hover highlight, pass 1 of 3: element mask from the pick ID buffer, blurred
// horizontally.
//
// Runs at pick-buffer resolution. Each texel's mask value (1 where the pick ID
// equals u_hlId, else 0) is convolved along the row with a Gaussian of
// u_sigma texels (kernel +-u_radius). Pass 2 (hover_blur_frag.glsl) blurs the
// result vertically; the overlay then reads the soft mask bilinearly, which
// turns the coarse pick grid into a smooth outline.

uniform highp usampler2D u_pickTex;
uniform ivec3 u_hlId;   // (rendIdx, encodeHitName(atom), encodeHitName(outer))
uniform ivec2 u_size;   // pick buffer size in texels
uniform float u_sigma;  // Gaussian sigma in texels
uniform int u_radius;   // kernel half-width in texels

in vec2 v_uv;

out vec4 o_FragColor;

float hitAt(ivec2 p)
{
    p = clamp(p, ivec2(0), u_size - 1);
    uvec3 id = texelFetch(u_pickTex, p, 0).xyz;
    return all(equal(id, uvec3(u_hlId))) ? 1.0 : 0.0;
}

void main()
{
    ivec2 p = ivec2(v_uv * vec2(u_size));
    float k2 = -0.5 / (u_sigma * u_sigma);
    float sum = 0.0;
    float wsum = 0.0;
    for (int k = -u_radius; k <= u_radius; ++k) {
        float w = exp(float(k * k) * k2);
        sum += w * hitAt(p + ivec2(k, 0));
        wsum += w;
    }
    float v = sum / wsum;
    o_FragColor = vec4(v, v, v, 1.0);
}
