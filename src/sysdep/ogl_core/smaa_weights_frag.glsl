// SMAA blending-weight calculation pass. Ported from Mol*
// (mol-gl/shader/smaa/weights.{frag,vert}.ts), a three.js-derived WebGL port of
// SMAA 2.8 (iryoku, MIT) preset "SMAA 1x Medium". Mol* adapted the original DX
// (top-down) shader to the bottom-up GL UV convention; CueMol's GL is also
// bottom-up, so the port applies directly. Offsets / pixCoord are computed here
// from v_uv (the dedicated SMAA vertex shader is folded into postproc_vert).
// Uses the AreaTex (160x560 RG, LINEAR) and SearchTex (66x33 R, NEAREST) lookup
// textures shipped in share/data/textures.

uniform sampler2D u_edgesTex;
uniform sampler2D u_areaTex;
uniform sampler2D u_searchTex;
uniform vec2 u_rcpFrame;  // (1/width, 1/height), == SMAA uTexSizeInv

in vec2 v_uv;

out vec4 o_FragColor;

const int SMAA_MAX_SEARCH_STEPS = 16;
const float SMAA_AREATEX_MAX_DISTANCE = 16.0;
const vec2 SMAA_AREATEX_PIXEL_SIZE = 1.0 / vec2(160.0, 560.0);
const float SMAA_AREATEX_SUBTEX_SIZE = 1.0 / 7.0;

// SMAASampleLevelZeroOffset: base-level sample at an integer texel offset.
vec4 smaaSampleOffset(sampler2D tex, vec2 coord, ivec2 off)
{
    return texture(tex, coord + vec2(off) * u_rcpFrame);
}

float SMAASearchLength(sampler2D searchTex, vec2 e, float bias, float scale)
{
    // Valid because searchTex is point-sampled (NEAREST):
    e.r = bias + e.r * scale;
    return 255.0 * texture(searchTex, e).r;
}

float SMAASearchXLeft(sampler2D edgesTex, sampler2D searchTex, vec2 texCoord, float end)
{
    vec2 e = vec2(0.0, 1.0);
    for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
        e = texture(edgesTex, texCoord).rg;
        texCoord -= vec2(2.0, 0.0) * u_rcpFrame;
        if (!(texCoord.x > end && e.g > 0.8281 && e.r == 0.0)) break;
    }

    texCoord.x += 0.25 * u_rcpFrame.x;
    texCoord.x += u_rcpFrame.x;
    texCoord.x += 2.0 * u_rcpFrame.x;
    texCoord.x -= u_rcpFrame.x * SMAASearchLength(searchTex, e, 0.0, 0.5);
    return texCoord.x;
}

float SMAASearchXRight(sampler2D edgesTex, sampler2D searchTex, vec2 texCoord, float end)
{
    vec2 e = vec2(0.0, 1.0);
    for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
        e = texture(edgesTex, texCoord).rg;
        texCoord += vec2(2.0, 0.0) * u_rcpFrame;
        if (!(texCoord.x < end && e.g > 0.8281 && e.r == 0.0)) break;
    }

    texCoord.x -= 0.25 * u_rcpFrame.x;
    texCoord.x -= u_rcpFrame.x;
    texCoord.x -= 2.0 * u_rcpFrame.x;
    texCoord.x += u_rcpFrame.x * SMAASearchLength(searchTex, e, 0.5, 0.5);
    return texCoord.x;
}

float SMAASearchYUp(sampler2D edgesTex, sampler2D searchTex, vec2 texCoord, float end)
{
    vec2 e = vec2(1.0, 0.0);
    for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
        e = texture(edgesTex, texCoord).rg;
        texCoord += vec2(0.0, 2.0) * u_rcpFrame;  // GL bottom-up: sign flipped
        if (!(texCoord.y > end && e.r > 0.8281 && e.g == 0.0)) break;
    }

    texCoord.y -= 0.25 * u_rcpFrame.y;
    texCoord.y -= u_rcpFrame.y;
    texCoord.y -= 2.0 * u_rcpFrame.y;
    texCoord.y += u_rcpFrame.y * SMAASearchLength(searchTex, e.gr, 0.0, 0.5);
    return texCoord.y;
}

float SMAASearchYDown(sampler2D edgesTex, sampler2D searchTex, vec2 texCoord, float end)
{
    vec2 e = vec2(1.0, 0.0);
    for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
        e = texture(edgesTex, texCoord).rg;
        texCoord -= vec2(0.0, 2.0) * u_rcpFrame;  // GL bottom-up: sign flipped
        if (!(texCoord.y < end && e.r > 0.8281 && e.g == 0.0)) break;
    }

    texCoord.y += 0.25 * u_rcpFrame.y;
    texCoord.y += u_rcpFrame.y;
    texCoord.y += 2.0 * u_rcpFrame.y;
    texCoord.y -= u_rcpFrame.y * SMAASearchLength(searchTex, e.gr, 0.5, 0.5);
    return texCoord.y;
}

vec2 SMAAArea(sampler2D areaTex, vec2 dist, float e1, float e2, float offset)
{
    // Rounding prevents precision errors of bilinear filtering:
    vec2 texCoord = SMAA_AREATEX_MAX_DISTANCE * round(4.0 * vec2(e1, e2)) + dist;

    // Scale and bias into texel space:
    texCoord = SMAA_AREATEX_PIXEL_SIZE * texCoord + (0.5 * SMAA_AREATEX_PIXEL_SIZE);

    // Move to the proper place according to the subpixel offset:
    texCoord.y += SMAA_AREATEX_SUBTEX_SIZE * offset;

    return texture(areaTex, texCoord).rg;
}

vec4 SMAABlendingWeightCalculationPS(vec2 texCoord, vec2 pixCoord, vec4 offset[3],
                                     sampler2D edgesTex, sampler2D areaTex,
                                     sampler2D searchTex, ivec4 subsampleIndices)
{
    vec4 weights = vec4(0.0, 0.0, 0.0, 0.0);

    vec2 e = texture(edgesTex, texCoord).rg;

    if (e.g > 0.0) {  // Edge at north
        vec2 d;
        vec2 coords;
        coords.x = SMAASearchXLeft(edgesTex, searchTex, offset[0].xy, offset[2].x);
        coords.y = offset[1].y;  // @CROSSING_OFFSET
        d.x = coords.x;

        float e1 = texture(edgesTex, coords).r;

        coords.x = SMAASearchXRight(edgesTex, searchTex, offset[0].zw, offset[2].y);
        d.y = coords.x;

        d = d / u_rcpFrame.x - pixCoord.x;
        vec2 sqrt_d = sqrt(abs(d));

        coords.y -= 1.0 * u_rcpFrame.y;
        float e2 = smaaSampleOffset(edgesTex, coords, ivec2(1, 0)).r;

        weights.rg = SMAAArea(areaTex, sqrt_d, e1, e2, float(subsampleIndices.y));
    }

    if (e.r > 0.0) {  // Edge at west
        vec2 d;
        vec2 coords;
        coords.y = SMAASearchYUp(edgesTex, searchTex, offset[1].xy, offset[2].z);
        coords.x = offset[0].x;
        d.x = coords.y;

        float e1 = texture(edgesTex, coords).g;

        coords.y = SMAASearchYDown(edgesTex, searchTex, offset[1].zw, offset[2].w);
        d.y = coords.y;

        d = d / u_rcpFrame.y - pixCoord.y;
        vec2 sqrt_d = sqrt(abs(d));

        coords.y -= 1.0 * u_rcpFrame.y;
        float e2 = smaaSampleOffset(edgesTex, coords, ivec2(0, 1)).g;

        weights.ba = SMAAArea(areaTex, sqrt_d, e1, e2, float(subsampleIndices.x));
    }

    return weights;
}

void main()
{
    // SMAABlendingWeightCalculationVS offsets / pixcoord (GL bottom-up signs).
    vec2 pixCoord = v_uv / u_rcpFrame;
    vec4 offset[3];
    offset[0] = v_uv.xyxy + u_rcpFrame.xyxy * vec4(-0.25, 0.125, 1.25, 0.125);
    offset[1] = v_uv.xyxy + u_rcpFrame.xyxy * vec4(-0.125, 0.25, -0.125, -1.25);
    offset[2] = vec4(offset[0].xz, offset[1].yw) +
                vec4(-2.0, 2.0, -2.0, 2.0) * u_rcpFrame.xxyy * float(SMAA_MAX_SEARCH_STEPS);

    o_FragColor = SMAABlendingWeightCalculationPS(v_uv, pixCoord, offset, u_edgesTex,
                                                  u_areaTex, u_searchTex, ivec4(0));
}
