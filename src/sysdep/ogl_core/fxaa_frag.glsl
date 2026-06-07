// FXAA (Fast Approximate Anti-Aliasing) fragment shader.
//
// Single-pass post-process after Timothy Lottes' FXAA 3.11. Detects luminance
// edges in the composited scene color and blends along them. Self-contained:
// luma is derived from RGB (no luma-in-alpha requirement) and no lookup
// textures are used, so the same shader ports to WebGL2 (GLSL ES 3.00).
// The source color texture must use LINEAR filtering (sub-texel sampling).
//
// Applied as the final stage of the live AO path: the AO composite renders into
// an off-screen LINEAR color target, this pass reads it and writes the
// antialiased result to the default framebuffer.

uniform sampler2D u_colorTex;
uniform vec2 u_rcpFrame;  // (1/width, 1/height)

in vec2 v_uv;

out vec4 o_FragColor;

// FXAA 3.11 defaults.
const float EDGE_THRESHOLD_MIN = 0.0312;
const float EDGE_THRESHOLD_MAX = 0.125;
const float SUBPIXEL_QUALITY = 0.75;
const int ITERATIONS = 12;

float rgb2luma(vec3 rgb)
{
    return sqrt(dot(rgb, vec3(0.299, 0.587, 0.114)));
}

// Per-iteration edge-search step multipliers (FXAA quality preset).
float qualityStep(int i)
{
    if (i < 5) return 1.0;
    if (i == 5) return 1.5;
    if (i < 10) return 2.0;
    if (i == 10) return 4.0;
    return 8.0;
}

void main()
{
    vec2 uv = v_uv;
    vec3 colorCenter = texture(u_colorTex, uv).rgb;
    float lumaCenter = rgb2luma(colorCenter);

    // Direct neighbour lumas.
    float lumaDown = rgb2luma(textureOffset(u_colorTex, uv, ivec2(0, -1)).rgb);
    float lumaUp = rgb2luma(textureOffset(u_colorTex, uv, ivec2(0, 1)).rgb);
    float lumaLeft = rgb2luma(textureOffset(u_colorTex, uv, ivec2(-1, 0)).rgb);
    float lumaRight = rgb2luma(textureOffset(u_colorTex, uv, ivec2(1, 0)).rgb);

    float lumaMin = min(lumaCenter, min(min(lumaDown, lumaUp), min(lumaLeft, lumaRight)));
    float lumaMax = max(lumaCenter, max(max(lumaDown, lumaUp), max(lumaLeft, lumaRight)));
    float lumaRange = lumaMax - lumaMin;

    // Flat region (or pure darkness): keep the original color.
    if (lumaRange < max(EDGE_THRESHOLD_MIN, lumaMax * EDGE_THRESHOLD_MAX)) {
        o_FragColor = vec4(colorCenter, 1.0);
        return;
    }

    // Corner lumas.
    float lumaDownLeft = rgb2luma(textureOffset(u_colorTex, uv, ivec2(-1, -1)).rgb);
    float lumaUpRight = rgb2luma(textureOffset(u_colorTex, uv, ivec2(1, 1)).rgb);
    float lumaUpLeft = rgb2luma(textureOffset(u_colorTex, uv, ivec2(-1, 1)).rgb);
    float lumaDownRight = rgb2luma(textureOffset(u_colorTex, uv, ivec2(1, -1)).rgb);

    float lumaDownUp = lumaDown + lumaUp;
    float lumaLeftRight = lumaLeft + lumaRight;
    float lumaLeftCorners = lumaDownLeft + lumaUpLeft;
    float lumaDownCorners = lumaDownLeft + lumaDownRight;
    float lumaRightCorners = lumaDownRight + lumaUpRight;
    float lumaUpCorners = lumaUpRight + lumaUpLeft;

    // Estimate the edge orientation.
    float edgeHorizontal = abs(-2.0 * lumaLeft + lumaLeftCorners) +
                           abs(-2.0 * lumaCenter + lumaDownUp) * 2.0 +
                           abs(-2.0 * lumaRight + lumaRightCorners);
    float edgeVertical = abs(-2.0 * lumaUp + lumaUpCorners) +
                         abs(-2.0 * lumaCenter + lumaLeftRight) * 2.0 +
                         abs(-2.0 * lumaDown + lumaDownCorners);
    bool isHorizontal = (edgeHorizontal >= edgeVertical);

    // Lumas on the two sides of the edge.
    float luma1 = isHorizontal ? lumaDown : lumaLeft;
    float luma2 = isHorizontal ? lumaUp : lumaRight;
    float gradient1 = luma1 - lumaCenter;
    float gradient2 = luma2 - lumaCenter;

    bool is1Steepest = abs(gradient1) >= abs(gradient2);
    float gradientScaled = 0.25 * max(abs(gradient1), abs(gradient2));

    // One-texel step in the gradient direction (toward the steeper side).
    float stepLength = isHorizontal ? u_rcpFrame.y : u_rcpFrame.x;
    float lumaLocalAverage = 0.0;
    if (is1Steepest) {
        stepLength = -stepLength;
        lumaLocalAverage = 0.5 * (luma1 + lumaCenter);
    } else {
        lumaLocalAverage = 0.5 * (luma2 + lumaCenter);
    }

    // Shift the UV by half a texel toward the edge.
    vec2 currentUv = uv;
    if (isHorizontal)
        currentUv.y += stepLength * 0.5;
    else
        currentUv.x += stepLength * 0.5;

    // March along the edge in both directions until the luma change exceeds
    // the local gradient.
    vec2 offset = isHorizontal ? vec2(u_rcpFrame.x, 0.0) : vec2(0.0, u_rcpFrame.y);
    vec2 uv1 = currentUv - offset;
    vec2 uv2 = currentUv + offset;

    float lumaEnd1 = rgb2luma(texture(u_colorTex, uv1).rgb) - lumaLocalAverage;
    float lumaEnd2 = rgb2luma(texture(u_colorTex, uv2).rgb) - lumaLocalAverage;
    bool reached1 = abs(lumaEnd1) >= gradientScaled;
    bool reached2 = abs(lumaEnd2) >= gradientScaled;
    bool reachedBoth = reached1 && reached2;

    if (!reached1) uv1 -= offset;
    if (!reached2) uv2 += offset;

    if (!reachedBoth) {
        for (int i = 2; i < ITERATIONS; i++) {
            if (!reached1)
                lumaEnd1 = rgb2luma(texture(u_colorTex, uv1).rgb) - lumaLocalAverage;
            if (!reached2)
                lumaEnd2 = rgb2luma(texture(u_colorTex, uv2).rgb) - lumaLocalAverage;
            reached1 = abs(lumaEnd1) >= gradientScaled;
            reached2 = abs(lumaEnd2) >= gradientScaled;
            reachedBoth = reached1 && reached2;
            if (!reached1) uv1 -= offset * qualityStep(i);
            if (!reached2) uv2 += offset * qualityStep(i);
            if (reachedBoth) break;
        }
    }

    // Distances to each end of the edge.
    float distance1 = isHorizontal ? (uv.x - uv1.x) : (uv.y - uv1.y);
    float distance2 = isHorizontal ? (uv2.x - uv.x) : (uv2.y - uv.y);
    bool isDirection1 = distance1 < distance2;
    float distanceFinal = min(distance1, distance2);
    float edgeThickness = distance1 + distance2;
    float pixelOffset = -distanceFinal / edgeThickness + 0.5;

    bool isLumaCenterSmaller = lumaCenter < lumaLocalAverage;
    bool correctVariation =
        ((isDirection1 ? lumaEnd1 : lumaEnd2) < 0.0) != isLumaCenterSmaller;
    float finalOffset = correctVariation ? pixelOffset : 0.0;

    // Subpixel antialiasing from the 3x3 luma average.
    float lumaAverage = (1.0 / 12.0) * (2.0 * (lumaDownUp + lumaLeftRight) +
                                        lumaLeftCorners + lumaRightCorners);
    float subPixelOffset1 = clamp(abs(lumaAverage - lumaCenter) / lumaRange, 0.0, 1.0);
    float subPixelOffset2 =
        (-2.0 * subPixelOffset1 + 3.0) * subPixelOffset1 * subPixelOffset1;
    float subPixelOffsetFinal = subPixelOffset2 * subPixelOffset2 * SUBPIXEL_QUALITY;
    finalOffset = max(finalOffset, subPixelOffsetFinal);

    // Sample the final (offset) position.
    vec2 finalUv = uv;
    if (isHorizontal)
        finalUv.y += finalOffset * stepLength;
    else
        finalUv.x += finalOffset * stepLength;

    o_FragColor = vec4(texture(u_colorTex, finalUv).rgb, 1.0);
}
