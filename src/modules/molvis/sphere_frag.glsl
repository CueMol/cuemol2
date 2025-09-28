// -*-Mode: C++;-*-
//
//  fragment shader for spheres
//

#include <lighting_inc.glsl>
#include <fog_inc.glsl>

////////////////////
// Uniform variables

// edge rendering
uniform float u_edge;

// edge color
uniform vec4 u_edgecolor;

// total transparency
uniform float frag_alpha;

uniform bool u_bsilh;

uniform mat4 u_ProjectionMatrix;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;
varying float v_radius;
varying float v_edgeratio;

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
    if (bEdge && u_bsilh) {
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
    gl_FragColor = fragFogColor(color, frag_alpha, fogz);
}
