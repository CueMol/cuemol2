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
uniform vec2 u_depthUnpack;             // (depthLinearizeMul, depthLinearizeAdd)
uniform vec2 u_ndcToViewMul;
uniform vec2 u_ndcToViewAdd;
uniform vec2 u_viewportPixelSize;       // (1/width, 1/height)
uniform float u_effectRadius;           // occlusion sphere radius (view units)
uniform float u_finalValuePower;        // occlusion = pow(occlusion, power)
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

// Per-pixel interleaved gradient noise (spatial, no temporal component).
float ign(vec2 p)
{
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
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

void main()
{
    float rawDepth = texture(u_depthTex, v_uv).r;
    float viewspaceZ = linearizeZ(rawDepth);
    vec3 pixCenterPos = viewPos(v_uv, viewspaceZ);
    vec3 N = reconstructNormal(v_uv, pixCenterPos);

    if (u_debugMode == 1) {
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

    // Far plane / no geometry: fully unoccluded.
    if (rawDepth >= 1.0) {
        o_FragColor = vec4(1.0);
        return;
    }

    // ---- GTAO horizon integration (depth-only) ----
    const int sliceCount = 3;
    const int stepsPerSlice = 3;
    const float sampleDistributionPower = 2.0;
    const float falloffRangeRatio = 0.615;
    const float pixelTooCloseThreshold = 1.3;

    // Nudge slightly toward the camera to reduce self-occlusion precision
    // artifacts.
    viewspaceZ *= 0.99999;
    pixCenterPos = viewPos(v_uv, viewspaceZ);
    vec3 viewVec = normalize(-pixCenterPos);

    float effectRadius = u_effectRadius;
    float falloffRange = falloffRangeRatio * effectRadius;
    float falloffFrom = effectRadius * (1.0 - falloffRangeRatio);
    float falloffMul = -1.0 / falloffRange;
    float falloffAdd = falloffFrom / falloffRange + 1.0;

    vec2 ndcToViewMul_x_pixelSize = u_ndcToViewMul * u_viewportPixelSize;
    float pixViewSize = viewspaceZ * ndcToViewMul_x_pixelSize.x;
    float screenspaceRadius = effectRadius / max(pixViewSize, 1e-6);

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

    o_FragColor = vec4(vec3(visibility), 1.0);
}
