// -*-Mode: C++;-*-
//
//  fragment shader for spheres
//

@include "lib_common.glsl"

////////////////////
// Uniform variables

// // edge rendering
// uniform float u_edge;

// edge color
uniform vec4 u_edgecolor;

// total transparency
uniform float frag_alpha;

uniform bool u_bsilh;

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

  if (dist>v_edgeratio) {
    discard;
  }
  else if (dist>1.0) {
    // edge
    float nd = 0.0;
    vec3 normal = vec3(v_impos.xy, 0.0);

    float depth = 0.0;

    float far=gl_DepthRange.far;
    float near=gl_DepthRange.near;

    vec4 ecpos = v_ecpos;
    //ecpos.z += depth;
    vec4 clip_space_pos = gl_ProjectionMatrix * ecpos;

    float ndc_depth = clip_space_pos.z / clip_space_pos.w;

    float fd = (((far-near) * ndc_depth) + near + far) / 2.0;

    // re-apply clipping by the view volume
    if (fd>far) {
      discard;
    }
    else if (fd<near) {
      discard;
      //normal = vec3(0.0, 0.0, 1.0);
      //fd = near;
    }
    else {
      gl_FragDepth = u_bsilh ? 0.99 : fd;
      gl_FragColor = calcFogAlpha(vec4(u_edgecolor.rgb, v_color.a), ffog(ecpos.z), frag_alpha);
    }

  }
  else {
    float nd = sqrt(1.0-dist*dist);
    vec3 normal = vec3(v_impos.xy, nd);

    float depth = nd * v_radius;

    float far=gl_DepthRange.far;
    float near=gl_DepthRange.near;

    vec4 ecpos = v_ecpos;
    ecpos.z += depth;
    vec4 clip_space_pos = gl_ProjectionMatrix * ecpos;

    float ndc_depth = clip_space_pos.z / clip_space_pos.w;

    float fd = (((far-near) * ndc_depth) + near + far) / 2.0;

    // re-apply clipping by the view volume
    if (fd>far) {
      discard;
    }
    else if (fd<near) {
      discard;
      //normal = vec3(0.0, 0.0, 1.0);
      //fd = near;
    }
    else {
      gl_FragDepth = fd;
      
      // color calculation
      vec4 color = flight(normal, ecpos, v_color);
      gl_FragColor = calcFogAlpha(color, ffog(ecpos.z), frag_alpha);
    }
  }

}

