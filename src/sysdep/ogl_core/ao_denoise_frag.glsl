// AO denoise fragment shader (edge-aware spatial blur).
//
// Depth-only port of the XeGTAO denoise pass. Reads the AO term (R) and packed
// depth edges (G) and performs a 3x3 weighted blur whose weights come from the
// edge connectivity, so the AO term does not bleed across depth
// discontinuities. Single-pass full resolution (no TAA).

uniform sampler2D u_aoTex;              // R = AO term, G = packed edges
uniform vec2 u_viewportPixelSize;       // (1/width, 1/height)

in vec2 v_uv;

out vec4 o_FragColor;

// Unpack 4 edge values (2 bits each) from one channel (1 = flat, 0 = edge).
vec4 unpackEdges(float p)
{
    int v = int(p * 255.5);
    vec4 e;
    e.x = float((v >> 6) & 3) / 3.0;
    e.y = float((v >> 4) & 3) / 3.0;
    e.z = float((v >> 2) & 3) / 3.0;
    e.w = float((v >> 0) & 3) / 3.0;
    return clamp(e, 0.0, 1.0);
}

void main()
{
    vec2 e = u_viewportPixelSize;

    vec2 cC = texture(u_aoTex, v_uv).rg;
    float aoC = cC.r;
    vec4 edgesC = unpackEdges(cC.g);    // connectivity to (L, R, T, B)

    // Neighbour AO and edges.
    vec2 cL = texture(u_aoTex, v_uv - vec2(e.x, 0.0)).rg;
    vec2 cR = texture(u_aoTex, v_uv + vec2(e.x, 0.0)).rg;
    vec2 cT = texture(u_aoTex, v_uv + vec2(0.0, e.y)).rg;
    vec2 cB = texture(u_aoTex, v_uv - vec2(0.0, e.y)).rg;
    vec2 cTL = texture(u_aoTex, v_uv + vec2(-e.x, e.y)).rg;
    vec2 cTR = texture(u_aoTex, v_uv + vec2(e.x, e.y)).rg;
    vec2 cBL = texture(u_aoTex, v_uv + vec2(-e.x, -e.y)).rg;
    vec2 cBR = texture(u_aoTex, v_uv + vec2(e.x, -e.y)).rg;

    // Enforce symmetry: a connection counts only if both sides agree (C's edge
    // toward the neighbour AND the neighbour's edge back toward C).
    float wL = edgesC.x * unpackEdges(cL.g).y;
    float wR = edgesC.y * unpackEdges(cR.g).x;
    float wT = edgesC.z * unpackEdges(cT.g).w;
    float wB = edgesC.w * unpackEdges(cB.g).z;

    // Diagonal weights: product of the two adjacent axial edges.
    const float diagWeight = 0.425;
    float wTL = diagWeight * edgesC.x * edgesC.z;
    float wTR = diagWeight * edgesC.y * edgesC.z;
    float wBL = diagWeight * edgesC.x * edgesC.w;
    float wBR = diagWeight * edgesC.y * edgesC.w;

    const float blurAmount = 1.2;       // XeGTAO DenoiseBlurBeta (sharp)
    float sum = aoC * blurAmount;
    float sumW = blurAmount;

    sum += cL.r * wL;   sumW += wL;
    sum += cR.r * wR;   sumW += wR;
    sum += cT.r * wT;   sumW += wT;
    sum += cB.r * wB;   sumW += wB;
    sum += cTL.r * wTL; sumW += wTL;
    sum += cTR.r * wTR; sumW += wTR;
    sum += cBL.r * wBL; sumW += wBL;
    sum += cBR.r * wBR; sumW += wBR;

    float ao = sum / sumW;
    o_FragColor = vec4(ao, 0.0, 0.0, 1.0);
}
