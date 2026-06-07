// SMAA edge detection pass (color-based). Ported from Mol*
// (mol-gl/shader/smaa/edges.{frag,vert}.ts), itself a three.js-derived WebGL
// port of SMAA 2.8 (iryoku, MIT) preset "SMAA 1x Medium". Mol* adapted the
// original DX (top-down) shader to the bottom-up GL UV convention; CueMol's GL
// UV is also bottom-up (see gtao doc), so the port applies directly. The
// per-pass offsets are computed here from v_uv instead of in a dedicated vertex
// shader, so the shared postproc_vert.glsl can be reused.

uniform sampler2D u_colorTex;
uniform vec2 u_rcpFrame;  // (1/width, 1/height), == SMAA uTexSizeInv

in vec2 v_uv;

out vec4 o_FragColor;

const float SMAA_THRESHOLD = 0.1;

vec4 SMAAColorEdgeDetectionPS(vec2 texcoord, vec4 offset[3], sampler2D colorTex)
{
    vec2 threshold = vec2(SMAA_THRESHOLD, SMAA_THRESHOLD);

    // Calculate color deltas:
    vec4 delta;
    vec3 C = texture(colorTex, texcoord).rgb;

    vec3 Cleft = texture(colorTex, offset[0].xy).rgb;
    vec3 t = abs(C - Cleft);
    delta.x = max(max(t.r, t.g), t.b);

    vec3 Ctop = texture(colorTex, offset[0].zw).rgb;
    t = abs(C - Ctop);
    delta.y = max(max(t.r, t.g), t.b);

    // Threshold:
    vec2 edges = step(threshold, delta.xy);

    // Discard if there is no edge:
    if (dot(edges, vec2(1.0, 1.0)) == 0.0)
        discard;

    // Calculate right and bottom deltas:
    vec3 Cright = texture(colorTex, offset[1].xy).rgb;
    t = abs(C - Cright);
    delta.z = max(max(t.r, t.g), t.b);

    vec3 Cbottom = texture(colorTex, offset[1].zw).rgb;
    t = abs(C - Cbottom);
    delta.w = max(max(t.r, t.g), t.b);

    // Maximum delta in the direct neighborhood:
    float maxDelta = max(max(max(delta.x, delta.y), delta.z), delta.w);

    // Calculate left-left and top-top deltas:
    vec3 Cleftleft = texture(colorTex, offset[2].xy).rgb;
    t = abs(C - Cleftleft);
    delta.z = max(max(t.r, t.g), t.b);

    vec3 Ctoptop = texture(colorTex, offset[2].zw).rgb;
    t = abs(C - Ctoptop);
    delta.w = max(max(t.r, t.g), t.b);

    // Final maximum delta:
    maxDelta = max(max(maxDelta, delta.z), delta.w);

    // Local contrast adaptation:
    edges.xy *= step(0.5 * maxDelta, delta.xy);

    return vec4(edges, 0.0, 0.0);
}

void main()
{
    // SMAAEdgeDetectionVS offsets (W-component sign already GL bottom-up).
    vec4 offset[3];
    offset[0] = v_uv.xyxy + u_rcpFrame.xyxy * vec4(-1.0, 0.0, 0.0, 1.0);
    offset[1] = v_uv.xyxy + u_rcpFrame.xyxy * vec4(1.0, 0.0, 0.0, -1.0);
    offset[2] = v_uv.xyxy + u_rcpFrame.xyxy * vec4(-2.0, 0.0, 0.0, 2.0);

    o_FragColor = SMAAColorEdgeDetectionPS(v_uv, offset, u_colorTex);
}
