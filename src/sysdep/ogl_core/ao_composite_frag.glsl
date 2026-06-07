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
uniform float u_fogEnd;          // linear fog far limit (view-space Z)
uniform float u_fogScale;        // 1/(fogEnd - fogStart)

in vec2 v_uv;

out vec4 o_FragColor;

float linearizeZ(float d)
{
    return u_depthUnpack.x / (u_depthUnpack.y - d);
}

// Nearest-depth upsample of the half-res AO term at uv (NVIDIA-style). On a
// flat surface the four AO taps have nearly equal depth and are blended
// smoothly (bilinear); across a silhouette the depth spread is large, so the
// AO of the single tap nearest the full-res depth is taken verbatim. Never
// mixing taps from across a depth step is what prevents the bright AO halo a
// soft bilateral weight leaves around edges.
float upsampleAO(vec2 uv)
{
    float zC = linearizeZ(texture(u_depthTex, uv).r);

    // Bilinear footprint of uv over the AO texel grid (taps 00,10,01,11).
    vec2 t = uv / u_aoTexelSize - 0.5;
    vec2 base = floor(t);
    vec2 frac = t - base;
    vec2 b = (base + 0.5) * u_aoTexelSize;
    vec2 px = vec2(u_aoTexelSize.x, 0.0);
    vec2 py = vec2(0.0, u_aoTexelSize.y);

    vec2 uv00 = b;
    vec2 uv10 = b + px;
    vec2 uv01 = b + py;
    vec2 uv11 = b + px + py;

    float a00 = texture(u_aoTex, uv00).r;
    float a10 = texture(u_aoTex, uv10).r;
    float a01 = texture(u_aoTex, uv01).r;
    float a11 = texture(u_aoTex, uv11).r;

    float z00 = linearizeZ(texture(u_depthTex, uv00).r);
    float z10 = linearizeZ(texture(u_depthTex, uv10).r);
    float z01 = linearizeZ(texture(u_depthTex, uv01).r);
    float z11 = linearizeZ(texture(u_depthTex, uv11).r);

    float w00 = (1.0 - frac.x) * (1.0 - frac.y);
    float w10 = frac.x * (1.0 - frac.y);
    float w01 = (1.0 - frac.x) * frac.y;
    float w11 = frac.x * frac.y;

    // Edge test: depth spread across the four taps relative to the centre depth.
    float zmin = min(min(z00, z10), min(z01, z11));
    float zmax = max(max(z00, z10), max(z01, z11));
    float threshold = max(abs(zC), 1e-4) * 0.03;

    if (zmax - zmin <= threshold) {
        // Flat region: smooth bilinear blend.
        return a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
    }

    // Silhouette: take the AO of the tap closest in depth (no cross-edge mix).
    float ao = a00;
    float best = abs(z00 - zC);
    float d;
    d = abs(z10 - zC); if (d < best) { best = d; ao = a10; }
    d = abs(z01 - zC); if (d < best) { best = d; ao = a01; }
    d = abs(z11 - zC); if (d < best) { best = d; ao = a11; }
    return ao;
}

void main()
{
    vec4 c = texture(u_colorTex, v_uv);
    if (u_hasAO != 0) {
        float ao = (u_upsample != 0) ? upsampleAO(v_uv)
                                     : texture(u_aoTex, v_uv).r;
        // Fade AO out where fog has taken over: the scene color is already fog-
        // blended toward the background color, so a fully-fogged pixel must not
        // be darkened by AO (otherwise its shadow shows through the fog). fogVis
        // matches the scene's linear fog factor (fog_inc.glsl): 1 = near/clear,
        // 0 = far/fully fogged.
        float zlin = linearizeZ(texture(u_depthTex, v_uv).r);
        float fogVis = clamp((u_fogEnd - zlin) * u_fogScale, 0.0, 1.0);
        ao = mix(1.0, ao, fogVis);
        o_FragColor = vec4(c.rgb * ao, c.a);
    } else {
        o_FragColor = c;
    }
}
