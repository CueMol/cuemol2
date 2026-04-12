// -*-Mode: C++;-*-
//
//  fragment shader for cylinders
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
varying float v_ndec;
varying float v_flag;

varying float v_depmx;
varying vec2 v_normadj;
varying mat2 v_normmat;

out vec4 o_FragColor;

void main()
{
    float adj_cen = sqrt(max(0.0, 1.0 - v_impos.x * v_impos.x));
    float disp_cir = adj_cen * v_ndec;
    float far = gl_DepthRange.far;
    float near = gl_DepthRange.near;

    float imy = v_impos.y;
    imy -= disp_cir * v_flag;

    // discard the impostor pixels out of the cylinder
    if (imy <= -1.0 || 1.0 <= imy) {
        discard;
    }

    bool bEdge = (v_impos.x < -1.0 || v_impos.x > 1.0) ? true : false;

    float depth = v_depmx * adj_cen;

    vec4 ecpos = v_ecpos;
    ecpos.z += bEdge ? 0.0 : depth;

    vec4 clip_space_pos = u_ProjectionMatrix * ecpos;
    float ndc_depth = clip_space_pos.z / clip_space_pos.w;
    float fd = (((far - near) * ndc_depth) + near + far) / 2.0;

    // re-apply clipping by the view volume
    if (fd < near || fd > far) {
        discard;
    }

    // set depth
    if (bEdge && u_bsilh != 0)
        gl_FragDepth = 0.99;
    else
        gl_FragDepth = fd;

    // color calculation
    vec4 color;
    if (bEdge) {
        color = vec4(u_edgecolor.rgb, v_color.a);
    } else {
        vec3 normal = vec3(v_impos.x, v_normadj.x * adj_cen, v_normadj.y * adj_cen);
        normal.xy *= v_normmat;

        color = flight2(normal, ecpos, v_color);
    }

    // fog calculation
    float fogz = ffog(ecpos.z);
    color = fragFogColor(color, frag_alpha, fogz);

    o_FragColor = color;
}
