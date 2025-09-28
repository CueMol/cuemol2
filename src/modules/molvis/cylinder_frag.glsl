// -*-Mode: C++;-*-
//
//  fragment shader for cylinders
//

#include <lighting_inc.glsl>
#include <fog_inc.glsl>

////////////////////
// Uniform variables

uniform float frag_alpha;

uniform float u_edge;

// edge color
uniform vec4 u_edgecolor;

// silhouette mode flag
uniform bool u_bsilh;

uniform mat4 u_ProjectionMatrix;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;
varying float v_ndec;
// varying float v_dec;
// varying float vw_len;
// varying float v_sinph;
varying float v_flag;

varying float v_depmx;
varying vec2 v_normadj;
varying mat2 v_normmat;
// varying vec2 v_vwdir;

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
        return;
    }

    bool bEdge = (v_impos.x < -1.0 || v_impos.x > 1.0) ? true : false;

    float depth = v_depmx * adj_cen;

    vec4 ecpos = v_ecpos;
    // if (!bEdge) ecpos.z += depth;
    ecpos.z += bEdge ? 0.0 : depth;

    vec4 clip_space_pos = gl_ProjectionMatrix * ecpos;
    float ndc_depth = clip_space_pos.z / clip_space_pos.w;
    float fd = (((far - near) * ndc_depth) + near + far) / 2.0;

    // re-apply clipping by the view volume
    if (fd < near || fd > far) {
        discard;
    }

    // set depth
    if (bEdge && u_bsilh)
        gl_FragDepth = 0.99;
    else
        gl_FragDepth = fd;

    // color calculation
    vec4 color;
    if (bEdge) {
        color = vec4(u_edgecolor.rgb, v_color.a);
    } else {
        vec3 normal = vec3(v_impos.x, v_normadj.x * adj_cen, v_normadj.y * adj_cen);
        // mat2 rmat = mat2(v_vwdir.x, v_vwdir.y,
        //-v_vwdir.y, v_vwdir.x);
        // normal.xy *= rmat;
        normal.xy *= v_normmat;

        color = flight2(normal, ecpos, v_color);
    }

    // fog calculation
    float fogz = ffog(ecpos.z);
    color = fragFogColor(color, frag_alpha, fogz);

    gl_FragColor = color;
    // gl_FragColor = v_color;
}
