// GTAO fragment shader (debug visualization stage).
//
// Reconstructs view-space depth and position from the scene depth texture and
// outputs a debug image so the depth linearization and position/normal
// reconstruction (and the GL bottom-up UV / Y orientation) can be validated
// before the horizon-based occlusion integral is added.
//
// View-space constants are derived CPU-side from the projection matrix:
//   viewZ      = u_depthUnpack.x / (u_depthUnpack.y - rawDepth)
//   viewPos.xy = (u_ndcToViewMul * uv + u_ndcToViewAdd) * viewZ
// with viewZ a positive linear distance (XeGTAO convention).

uniform sampler2D u_depthTex;
uniform vec2 u_depthUnpack;             // (depthLinearizeMul, depthLinearizeAdd)
uniform vec2 u_ndcToViewMul;
uniform vec2 u_ndcToViewAdd;
uniform vec2 u_viewportPixelSize;       // (1/width, 1/height)
uniform int u_debugMode;                // 0 = linear depth, 1 = reconstructed normal

in vec2 v_uv;

out vec4 o_FragColor;

float linearizeZ(float d)
{
    return u_depthUnpack.x / (u_depthUnpack.y - d);
}

vec3 viewPos(vec2 uv, float vz)
{
    return vec3((u_ndcToViewMul * uv + u_ndcToViewAdd) * vz, vz);
}

void main()
{
    float d = texture(u_depthTex, v_uv).r;
    float vz = linearizeZ(d);

    if (u_debugMode == 1) {
        // Reconstruct the view-space normal from the closer horizontal and
        // vertical neighbours (depth-only). cross(ddx, ddy) yields a normal in
        // the XeGTAO view space (z positive into the screen).
        vec2 e = u_viewportPixelSize;
        vec3 pC = viewPos(v_uv, vz);
        vec3 pR = viewPos(v_uv + vec2(e.x, 0.0), linearizeZ(texture(u_depthTex, v_uv + vec2(e.x, 0.0)).r));
        vec3 pL = viewPos(v_uv - vec2(e.x, 0.0), linearizeZ(texture(u_depthTex, v_uv - vec2(e.x, 0.0)).r));
        vec3 pT = viewPos(v_uv + vec2(0.0, e.y), linearizeZ(texture(u_depthTex, v_uv + vec2(0.0, e.y)).r));
        vec3 pB = viewPos(v_uv - vec2(0.0, e.y), linearizeZ(texture(u_depthTex, v_uv - vec2(0.0, e.y)).r));

        vec3 ddx = (abs(pR.z - pC.z) < abs(pC.z - pL.z)) ? (pR - pC) : (pC - pL);
        vec3 ddy = (abs(pT.z - pC.z) < abs(pC.z - pB.z)) ? (pT - pC) : (pC - pB);

        vec3 N = normalize(cross(ddx, ddy));
        o_FragColor = vec4(N * 0.5 + 0.5, 1.0);
    } else {
        // Linear-depth grayscale (near = bright, far = dark). near/far are
        // recovered from the unpack constants: near = mul/add at d=0,
        // far = mul/(add-1) at d=1.
        float vnear = u_depthUnpack.x / u_depthUnpack.y;
        float vfar = u_depthUnpack.x / (u_depthUnpack.y - 1.0);
        float g = clamp((vz - vnear) / (vfar - vnear), 0.0, 1.0);
        o_FragColor = vec4(vec3(1.0 - g), 1.0);
    }
}
