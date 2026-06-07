// AO composite fragment shader.
// Multiplies the off-screen scene color by the ambient-occlusion term and
// writes the result to the bound framebuffer. With u_hasAO == 0 it is a plain
// pass-through copy (used before the AO term is available).
//
// When the AO term is computed at a lower resolution than the output (half-res
// AO, u_upsample != 0), it is joint-bilateral upsampled: the four nearest AO
// texels are weighted by both their bilinear coverage and their depth
// similarity to the full-res pixel, so the AO does not bleed across silhouettes
// (no halo around objects).

uniform sampler2D u_colorTex;
uniform sampler2D u_aoTex;       // AO term in R (half or full resolution)
uniform sampler2D u_depthTex;    // full-res scene depth
uniform vec2 u_depthUnpack;      // (depthLinearizeMul, depthLinearizeAdd)
uniform vec2 u_aoTexelSize;      // (1/aoWidth, 1/aoHeight)
uniform int u_hasAO;
uniform int u_upsample;          // 1 = edge-aware upsample the AO term

in vec2 v_uv;

out vec4 o_FragColor;

float linearizeZ(float d)
{
    return u_depthUnpack.x / (u_depthUnpack.y - d);
}

// Joint bilateral upsample of the half-res AO term at uv, using the full-res
// depth to reject taps across depth discontinuities.
float upsampleAO(vec2 uv)
{
    float zC = linearizeZ(texture(u_depthTex, uv).r);

    // Bilinear footprint of uv over the AO texel grid.
    vec2 t = uv / u_aoTexelSize - 0.5;
    vec2 base = floor(t);
    vec2 frac = t - base;
    vec2 baseUV = (base + 0.5) * u_aoTexelSize;

    // Depth-similarity falloff relative to the centre depth (matches the
    // denoise edge scale; larger surfaces keep their soft AO, sharp depth
    // steps cut the tap).
    float range = max(abs(zC), 1e-4) * 0.02;

    float aoSum = 0.0;
    float wSum = 0.0;
    for (int j = 0; j < 2; ++j) {
        for (int i = 0; i < 2; ++i) {
            vec2 off = vec2(float(i), float(j));
            vec2 suv = baseUV + off * u_aoTexelSize;
            float bw = (i == 0 ? 1.0 - frac.x : frac.x) *
                       (j == 0 ? 1.0 - frac.y : frac.y);
            float zi = linearizeZ(texture(u_depthTex, suv).r);
            float dw = exp(-abs(zC - zi) / range);
            float w = bw * dw;
            aoSum += texture(u_aoTex, suv).r * w;
            wSum += w;
        }
    }

    // All taps rejected (isolated thin feature): fall back to a point sample.
    if (wSum < 1e-5) return texture(u_aoTex, uv).r;
    return aoSum / wSum;
}

void main()
{
    vec4 c = texture(u_colorTex, v_uv);
    if (u_hasAO != 0) {
        float ao = (u_upsample != 0) ? upsampleAO(v_uv)
                                     : texture(u_aoTex, v_uv).r;
        o_FragColor = vec4(c.rgb * ao, c.a);
    } else {
        o_FragColor = c;
    }
}
