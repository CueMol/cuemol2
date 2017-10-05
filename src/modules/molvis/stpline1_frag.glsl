// -*-Mode: C++;-*-
//
//  Stipple line fragment shader for OpenGL (ver.1)
//

@include "lib_common.glsl"

////////////////////
// Varying variables

varying float v_linepos;

////////////////////
// Uniform variables

// label color (incl. transparency)
uniform vec4 u_color;

// stipple pattern
uniform vec2 u_stipple;

void main (void)
{
  float i = v_linepos/(u_stipple.x + u_stipple.y);
  float rho = i - floor(i);

  float thr = u_stipple.x/(u_stipple.x + u_stipple.y);

  if (rho < thr) {
    gl_FragColor = u_color;
  }
  else {
    discard;
    //gl_FragColor = vec4(u_color.xyz, 0.0f);
  }
}

