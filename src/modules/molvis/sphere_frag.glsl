// -*-Mode: C++;-*-
//
//  fragment shader for spheres
//
#define varying in

#include <lighting_inc.glsl>
#include <fog_inc.glsl>
#include <matrices_inc.glsl>

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;   // offset 0
    float u_edge;       // offset 4
    int   u_bsilh;      // offset 8
    float _pad;         // offset 12
    vec4  u_edgecolor;  // offset 16
};

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;
varying float v_radius;
varying float v_edgeratio;

layout(location = 0) out vec4 o_FragColor;
// MRT eye-space normal for GTAO (sentinel vec3(0) -> reconstruct from depth).
layout(location = 1) out vec3 o_Normal;

void main()
{
    float dist = length(v_impos);
    float fd;
    vec4 ecpos = v_ecpos;

    if (dist > v_edgeratio) {
        discard;
    }

    float far = gl_DepthRange.far;
    float near = gl_DepthRange.near;

    bool bEdge = (dist > 1.0) ? true : false;

    float nd;
    vec3 normal;
    float depth;

    if (bEdge) {
        // edge
        nd = 0.0;
        normal = vec3(v_impos.xy, 0.0);
        depth = 0.0;
    } else {
        nd = sqrt(1.0 - dist * dist);
        normal = vec3(v_impos.xy, nd);
        depth = nd * v_radius;
    }

    ecpos.z += depth;
    vec4 clip_space_pos = u_ProjectionMatrix * ecpos;
    float ndc_depth = clip_space_pos.z / clip_space_pos.w;
    fd = (((far - near) * ndc_depth) + near + far) / 2.0;

    // re-apply clipping by the view volume
    if (fd > far || fd < near) {
        discard;
    }

    // set depth
    if (bEdge && u_bsilh != 0) {
        // edge
        gl_FragDepth = 0.99;
    } else {
        gl_FragDepth = fd;
    }

    // color calculation
    vec4 color;
    if (bEdge) {
        // edge
        color = u_edgecolor;
    } else {
        color = flight2(normal, ecpos, v_color);
    }

    // fog calculation
    float fogz = ffog(ecpos.z);
    o_FragColor = fragFogColor(color, frag_alpha, fogz);

    // Eye-space sphere normal (sentinel on the silhouette edge ring).
    o_Normal = bEdge ? vec3(0.0) : normalize(normal);
}
