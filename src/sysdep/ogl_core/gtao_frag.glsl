// GTAO fragment shader (Ground-Truth Ambient Occlusion).
//
// Depth-only port of the XeGTAO main pass (Jimenez et al. 2016, "Practical
// Realtime Strategies for Accurate Indirect Occlusion"; Intel XeGTAO, MIT).
// Reads the scene depth texture, reconstructs view-space position and a
// depth-derived normal, and integrates horizon-based occlusion over a few
// slices. No depth MIP chain, no edges/denoise, no bent normals yet.
//
// View-space constants are derived CPU-side from the projection matrix:
//   viewZ      = u_depthUnpack.x / (u_depthUnpack.y - rawDepth)
//   viewPos.xy = (u_ndcToViewMul * uv + u_ndcToViewAdd) * viewZ
// with viewZ a positive linear distance and a GL bottom-up [0,1] UV.

uniform sampler2D u_depthTex;
uniform sampler2D u_normalTex;          // MRT eye-space normal (when u_hasNormal)
uniform vec2 u_depthUnpack;             // (depthLinearizeMul, depthLinearizeAdd)
uniform vec2 u_ndcToViewMul;
uniform vec2 u_ndcToViewAdd;
uniform vec2 u_viewportPixelSize;       // (1/width, 1/height)
uniform float u_effectRadius;           // occlusion sphere radius (view units)
uniform float u_finalValuePower;        // occlusion = pow(occlusion, power)
uniform int u_sliceCount;               // number of horizon slices (quality)
uniform int u_stepCount;                // number of steps marched per slice
uniform int u_hasNormal;                // 1 = use the stored geometry normal
uniform int u_debugMode;                // 0 = AO, 1 = normal, 2 = linear depth

in vec2 v_uv;

out vec4 o_FragColor;

const float PI = 3.14159265359;
const float HALF_PI = 1.57079632679;

float linearizeZ(float d)
{
    return u_depthUnpack.x / (u_depthUnpack.y - d);
}

vec3 viewPos(vec2 uv, float vz)
{
    return vec3((u_ndcToViewMul * uv + u_ndcToViewAdd) * vz, vz);
}

// Per-pixel interleaved gradient noise in [0,1). Spectrally blue-ish, so the
// spatial denoise removes the residual grain well; with a high slice count its
// per-pixel structure is averaged out and not visible as a regular pattern.
float ign(vec2 p)
{
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Depth-discontinuity edges (1 = flat, 0 = strong edge), per XeGTAO. The
// denoise pass reads these to avoid blurring AO across silhouettes.
vec4 calculateEdges(float cZ, float lZ, float rZ, float tZ, float bZ)
{
    vec4 e = vec4(lZ, rZ, tZ, bZ) - cZ;
    float slopeLR = (e.y - e.x) * 0.5;
    float slopeTB = (e.w - e.z) * 0.5;
    vec4 eAdj = e + vec4(slopeLR, -slopeLR, slopeTB, -slopeTB);
    e = min(abs(e), abs(eAdj));
    return clamp(1.25 - e / (cZ * 0.011), 0.0, 1.0);
}

// Pack the 4 edge values (2 bits each) into one 8-bit channel.
float packEdges(vec4 e)
{
    e = round(clamp(e, 0.0, 1.0) * 2.9);
    return dot(e, vec4(64.0 / 255.0, 16.0 / 255.0, 4.0 / 255.0, 1.0 / 255.0));
}

// Reconstruct the view-space normal from the closer horizontal / vertical
// neighbours, oriented toward the camera (all visible fragments are front
// facing).
vec3 reconstructNormal(vec2 uv, vec3 pC)
{
    vec2 e = u_viewportPixelSize;
    vec3 pR = viewPos(uv + vec2(e.x, 0.0), linearizeZ(texture(u_depthTex, uv + vec2(e.x, 0.0)).r));
    vec3 pL = viewPos(uv - vec2(e.x, 0.0), linearizeZ(texture(u_depthTex, uv - vec2(e.x, 0.0)).r));
    vec3 pT = viewPos(uv + vec2(0.0, e.y), linearizeZ(texture(u_depthTex, uv + vec2(0.0, e.y)).r));
    vec3 pB = viewPos(uv - vec2(0.0, e.y), linearizeZ(texture(u_depthTex, uv - vec2(0.0, e.y)).r));
    vec3 ddx = (abs(pR.z - pC.z) < abs(pC.z - pL.z)) ? (pR - pC) : (pC - pL);
    vec3 ddy = (abs(pT.z - pC.z) < abs(pC.z - pB.z)) ? (pT - pC) : (pC - pB);
    vec3 N = normalize(cross(ddx, ddy));
    vec3 V = normalize(-pC);
    if (dot(N, V) < 0.0) N = -N;
    return N;
}

// Pick the view-space normal: the MRT geometry normal when present (smooth on
// tessellated meshes), otherwise the depth-reconstructed normal (fallback for
// primitives that write the sentinel, and when no normal buffer is supplied).
// The stored eye-space normal has +Z toward the camera; the GTAO integration
// space has vz > 0 forward, so flip Z only, then orient toward the camera the
// same way reconstructNormal does (flipping all three would corrupt x/y).
// Returns the view-space normal. Sets isExcluded when the pixel belongs to a
// primitive that opted out of AO: a line / label / wireframe writes the
// sentinel (0,0,0) into the normal buffer, and such pixels are left fully lit
// (AO = 1) instead of being shaded. With no normal buffer (u_hasNormal == 0)
// the depth-reconstructed normal is used and nothing is excluded.
vec3 selectNormal(vec2 uv, vec3 pC, out bool isExcluded)
{
    isExcluded = false;
    if (u_hasNormal != 0) {
        vec3 n = texture(u_normalTex, uv).xyz;
        if (dot(n, n) > 0.5) {
            // Stored eye-space normal: +Z faces the camera, so flip Z only to
            // reach the GTAO space (vz > 0 forward).
            vec3 N = normalize(vec3(n.x, n.y, -n.z));
            vec3 V = normalize(-pC);
            // Clamp to the visible hemisphere. The exact normal can point away
            // from the camera at grazing silhouettes (sphere/cylinder edges) or
            // on the back side of two-sided meshes (cartoon ribbons), where the
            // horizon integral turns unstable and goes to near-black. Instead of
            // a hard flip (which inverts the in-plane direction and bands the
            // edge), fold it just inside the hemisphere toward the view vector.
            // Continuous and well defined even head-on (d = -1 -> N = V).
            float d = dot(N, V);
            if (d < 0.0) N = normalize(N - 1.01 * d * V);
            return N;
        }
        isExcluded = true;
    }
    return reconstructNormal(uv, pC);
}

void main()
{
    float rawDepth = texture(u_depthTex, v_uv).r;
    float viewspaceZ = linearizeZ(rawDepth);
    vec3 pixCenterPos = viewPos(v_uv, viewspaceZ);
    bool isExcluded;
    vec3 N = selectNormal(v_uv, pixCenterPos, isExcluded);

    if (u_debugMode == 1) {
        // Normal fed to the integration, as RGB (debugging).
        o_FragColor = vec4(N * 0.5 + 0.5, 1.0);
        return;
    }
    if (u_debugMode == 2) {
        float vnear = u_depthUnpack.x / u_depthUnpack.y;
        float vfar = u_depthUnpack.x / (u_depthUnpack.y - 1.0);
        float g = clamp((viewspaceZ - vnear) / (vfar - vnear), 0.0, 1.0);
        o_FragColor = vec4(vec3(1.0 - g), 1.0);
        return;
    }

    // Far plane / no geometry: fully unoccluded (and flat edges).
    if (rawDepth >= 1.0) {
        o_FragColor = vec4(1.0);
        return;
    }

    // Line / label / wireframe primitive: keep it fully lit (AO = 1, flat edges).
    if (isExcluded) {
        o_FragColor = vec4(1.0);
        return;
    }

    // Depth-discontinuity edges for the denoise pass (uses un-nudged depth).
    vec2 ep = u_viewportPixelSize;
    float zL = linearizeZ(texture(u_depthTex, v_uv - vec2(ep.x, 0.0)).r);
    float zR = linearizeZ(texture(u_depthTex, v_uv + vec2(ep.x, 0.0)).r);
    float zT = linearizeZ(texture(u_depthTex, v_uv + vec2(0.0, ep.y)).r);
    float zB = linearizeZ(texture(u_depthTex, v_uv - vec2(0.0, ep.y)).r);
    float packedEdges = packEdges(calculateEdges(viewspaceZ, zL, zR, zT, zB));

    // ---- GTAO horizon integration (depth-only) ----
    // Slice count sets the angular sampling = base noise level; a high count
    // keeps grain low without temporal accumulation. The AO spread (how far the
    // occlusion reaches) is controlled separately by u_effectRadius. Clamped to
    // a sane range so a bad scene value cannot stall the GPU.
    int sliceCount = clamp(u_sliceCount, 1, 16);
    int stepsPerSlice = clamp(u_stepCount, 1, 16);
    const float sampleDistributionPower = 2.0;
    const float falloffRangeRatio = 0.615;
    const float pixelTooCloseThreshold = 1.3;

    // Nudge slightly toward the camera to reduce self-occlusion precision
    // artifacts.
    viewspaceZ *= 0.99999;
    pixCenterPos = viewPos(v_uv, viewspaceZ);
    vec3 viewVec = normalize(-pixCenterPos);

    float effectRadius = u_effectRadius;

    vec2 ndcToViewMul_x_pixelSize = u_ndcToViewMul * u_viewportPixelSize;
    float pixViewSize = viewspaceZ * ndcToViewMul_x_pixelSize.x;
    float screenspaceRadius = effectRadius / max(pixViewSize, 1e-6);

    // Clamp the screen-space radius so the horizon samples stay cache-local
    // when zoomed in. Without a depth MIP chain a world-space radius maps to a
    // huge pixel radius at close range, scattering the 54 texture reads across
    // the screen and causing frame drops. The effective world radius is derived
    // back from the clamped value so the falloff stays consistent (no change
    // when the radius is not clamped).
    const float maxScreenspaceRadius = 256.0;
    screenspaceRadius = min(screenspaceRadius, maxScreenspaceRadius);
    float effectiveRadius = screenspaceRadius * pixViewSize;

    float falloffRange = falloffRangeRatio * effectiveRadius;
    float falloffFrom = effectiveRadius * (1.0 - falloffRangeRatio);
    float falloffMul = -1.0 / falloffRange;
    float falloffAdd = falloffFrom / falloffRange + 1.0;

    float noiseSlice = ign(gl_FragCoord.xy);
    float noiseSample =
        fract(noiseSlice + dot(gl_FragCoord.xy, vec2(0.7548776662, 0.5698402909)));

    float minS = pixelTooCloseThreshold / screenspaceRadius;

    float visibility = 0.0;

    for (int slice = 0; slice < sliceCount; slice++) {
        float sliceK = (float(slice) + noiseSlice) / float(sliceCount);
        float phi = sliceK * PI;
        float cosPhi = cos(phi);
        float sinPhi = sin(phi);
        // In-screen sampling direction in pixels. GL UV is bottom-up, so the
        // y component keeps the same sign as the view-space direction (XeGTAO
        // negates it for the top-down DX convention).
        vec2 omega = vec2(cosPhi, sinPhi) * screenspaceRadius;

        vec3 directionVec = vec3(cosPhi, sinPhi, 0.0);
        vec3 orthoDirectionVec = directionVec - dot(directionVec, viewVec) * viewVec;
        vec3 axisVec = normalize(cross(orthoDirectionVec, viewVec));
        vec3 projectedNormalVec = N - axisVec * dot(N, axisVec);
        float signNorm = sign(dot(orthoDirectionVec, projectedNormalVec));
        float projectedNormalVecLength = length(projectedNormalVec);
        float cosNorm =
            clamp(dot(projectedNormalVec, viewVec) / max(projectedNormalVecLength, 1e-6),
                  0.0, 1.0);
        float n = signNorm * acos(cosNorm);

        float lowHorizonCos0 = cos(n + HALF_PI);
        float lowHorizonCos1 = cos(n - HALF_PI);
        float horizonCos0 = lowHorizonCos0;
        float horizonCos1 = lowHorizonCos1;

        for (int step = 0; step < stepsPerSlice; step++) {
            float stepBaseNoise = float(slice + step * stepsPerSlice) * 0.6180339887;
            float stepNoise = fract(noiseSample + stepBaseNoise);
            float s = (float(step) + stepNoise) / float(stepsPerSlice);
            s = pow(s, sampleDistributionPower);
            s += minS;
            vec2 sampleOffset = round(s * omega) * u_viewportPixelSize;

            vec2 sp0 = v_uv + sampleOffset;
            vec2 sp1 = v_uv - sampleOffset;
            vec3 samplePos0 = viewPos(sp0, linearizeZ(texture(u_depthTex, sp0).r));
            vec3 samplePos1 = viewPos(sp1, linearizeZ(texture(u_depthTex, sp1).r));

            vec3 sampleDelta0 = samplePos0 - pixCenterPos;
            vec3 sampleDelta1 = samplePos1 - pixCenterPos;
            float sampleDist0 = length(sampleDelta0);
            float sampleDist1 = length(sampleDelta1);
            vec3 sampleHorizonVec0 = sampleDelta0 / max(sampleDist0, 1e-6);
            vec3 sampleHorizonVec1 = sampleDelta1 / max(sampleDist1, 1e-6);

            float weight0 = clamp(sampleDist0 * falloffMul + falloffAdd, 0.0, 1.0);
            float weight1 = clamp(sampleDist1 * falloffMul + falloffAdd, 0.0, 1.0);

            float shc0 = dot(sampleHorizonVec0, viewVec);
            float shc1 = dot(sampleHorizonVec1, viewVec);
            shc0 = mix(lowHorizonCos0, shc0, weight0);
            shc1 = mix(lowHorizonCos1, shc1, weight1);
            horizonCos0 = max(horizonCos0, shc0);
            horizonCos1 = max(horizonCos1, shc1);
        }

        projectedNormalVecLength = mix(projectedNormalVecLength, 1.0, 0.05);
        float h0 = -acos(clamp(horizonCos1, -1.0, 1.0));
        float h1 = acos(clamp(horizonCos0, -1.0, 1.0));
        float iarc0 = (cosNorm + 2.0 * h0 * sin(n) - cos(2.0 * h0 - n)) / 4.0;
        float iarc1 = (cosNorm + 2.0 * h1 * sin(n) - cos(2.0 * h1 - n)) / 4.0;
        visibility += projectedNormalVecLength * (iarc0 + iarc1);
    }

    visibility /= float(sliceCount);
    visibility = pow(max(visibility, 0.0), u_finalValuePower);
    visibility = max(0.03, visibility);

    // R = AO term, G = packed edges (consumed by the denoise pass).
    o_FragColor = vec4(visibility, packedEdges, 0.0, 1.0);
}
