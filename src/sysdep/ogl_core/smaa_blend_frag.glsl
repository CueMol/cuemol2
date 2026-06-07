// SMAA neighborhood blending pass (final). Ported from Mol*
// (mol-gl/shader/smaa/blend.{frag,vert}.ts), a three.js-derived WebGL port of
// SMAA 2.8 (iryoku, MIT) preset "SMAA 1x Medium". Mol* adapted the original DX
// (top-down) shader to the bottom-up GL UV convention; CueMol's GL is also
// bottom-up, so the port applies directly. Offsets are computed here from v_uv.
// Blends the composited scene color using the per-pixel weights, with gamma
// 2.2 correction (as Mol* does).

uniform sampler2D u_colorTex;
uniform sampler2D u_weightsTex;
uniform vec2 u_rcpFrame;  // (1/width, 1/height), == SMAA uTexSizeInv

in vec2 v_uv;

out vec4 o_FragColor;

vec4 SMAANeighborhoodBlendingPS(vec2 texCoord, vec4 offset[2], sampler2D colorTex,
                                sampler2D blendTex)
{
    // Fetch the blending weights for the current pixel:
    vec4 a;
    a.xz = texture(blendTex, texCoord).xz;
    a.y = texture(blendTex, offset[1].zw).g;
    a.w = texture(blendTex, offset[1].xy).a;

    // Any blending weight greater than 0?
    if (dot(a, vec4(1.0, 1.0, 1.0, 1.0)) < 1e-5) {
        return texture(colorTex, texCoord);
    } else {
        // Pick the direction with the maximum weight (renamed from SMAA's
        // 'offset' to avoid shadowing the parameter):
        vec2 dir;
        dir.x = a.a > a.b ? a.a : -a.b;  // left vs. right
        dir.y = a.g > a.r ? -a.g : a.r;  // top vs. bottom (GL bottom-up signs)

        // Go in the direction with the maximum weight:
        if (abs(dir.x) > abs(dir.y)) {
            dir.y = 0.0;
        } else {
            dir.x = 0.0;
        }

        // Fetch the opposite color and lerp by hand:
        vec4 C = texture(colorTex, texCoord);
        texCoord += sign(dir) * u_rcpFrame;
        vec4 Cop = texture(colorTex, texCoord);
        float s = abs(dir.x) > abs(dir.y) ? abs(dir.x) : abs(dir.y);

        // Gamma correction (as in Mol*):
        C.xyz = pow(C.xyz, vec3(2.2));
        Cop.xyz = pow(Cop.xyz, vec3(2.2));
        vec4 mixed = mix(C, Cop, s);
        mixed.xyz = pow(mixed.xyz, vec3(1.0 / 2.2));

        return mixed;
    }
}

void main()
{
    // SMAANeighborhoodBlendingVS offsets (W-component sign already GL bottom-up).
    vec4 offset[2];
    offset[0] = v_uv.xyxy + u_rcpFrame.xyxy * vec4(-1.0, 0.0, 0.0, 1.0);
    offset[1] = v_uv.xyxy + u_rcpFrame.xyxy * vec4(1.0, 0.0, 0.0, -1.0);

    o_FragColor = SMAANeighborhoodBlendingPS(v_uv, offset, u_colorTex, u_weightsTex);
}
