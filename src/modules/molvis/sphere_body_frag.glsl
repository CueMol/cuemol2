// -*-Mode: C++;-*-
//
//  fragment shader body for spheres (impostor ray-sphere intersection)
//
//  Included by sphere_frag.glsl (shading) and sphere_pick_frag.glsl
//  (PICK_MODE: GPU ID-buffer pick pass). Do not add to GLSL_SHADER_FILES;
//  it is an include-only body.
//
#define varying in

#include <matrices_inc.glsl>
#ifdef PICK_MODE
#include <pick_inc.glsl>
#else
#include <lighting_inc.glsl>
#include <fog_inc.glsl>
#endif

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;   // offset 0
    float u_edge;       // offset 4
    int   u_bsilh;      // offset 8
    float _pad;         // offset 12
    vec4  u_edgecolor;  // offset 16
#ifdef PICK_MODE
    PICK_DRAWPARAMS_TAIL  // offset 32
#endif
};

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;
varying float v_radius;
varying float v_edgeratio;

#ifdef PICK_MODE
flat varying uint v_hitName;
// The pick target has a single unsigned-integer attachment.
layout(location = 0) out uvec4 o_Pick;
#else
layout(location = 0) out vec4 o_FragColor;
// MRT eye-space normal for GTAO (sentinel (0,0,0) -> reconstruct from depth).
// vec4 to match o_FragColor's component count (Apple Metal GL mishandles MRT
// with mixed vec4/vec3 outputs and broadcasts output 0 to all targets).
layout(location = 1) out vec4 o_Normal;
#endif

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

#ifdef PICK_MODE
    // The silhouette ring and unnamed spheres are not pickable.
    if (bEdge || v_hitName == 0u) discard;
    o_Pick = uvec4(u_rend_idx, v_hitName, u_outer_name, 0u);
#else
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
    o_Normal = bEdge ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(normalize(normal), 1.0);
#endif
}
