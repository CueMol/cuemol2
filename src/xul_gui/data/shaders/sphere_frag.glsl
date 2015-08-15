// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL ES2
//

// define default precision for float, vec, mat.
// precision highp float;

varying vec2 v_impos;
varying vec3 v_ecpos;

void main()
{
  float dist = length(v_impos);
  if (dist>1.0) {
    discard;
  }
  else {
    float depth = sqrt(1.0-dist*dist);

    float far=gl_DepthRange.far;
    float near=gl_DepthRange.near;

    vec4 ecpos = vec4(v_ecpos, 1.0);
    ecpos.z += depth;
    vec4 clip_space_pos = gl_ProjectionMatrix * ecpos;

    float ndc_depth = clip_space_pos.z / clip_space_pos.w;

    gl_FragDepth = (((far-near) * ndc_depth) + near + far) / 2.0;

    gl_FragColor = vec4(depth, depth, 0.5, 1.0);//gl_Color;
  }
}

