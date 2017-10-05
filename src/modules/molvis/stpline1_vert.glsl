// -*-Mode: C++;-*-
//
//  Stipple-line vertex shader for OpenGL (ver.1)
//

@include "lib_common.glsl"

////////////////////
// Vertex attributes

attribute vec3 a_pos1;
attribute vec3 a_pos2;
attribute float a_hwidth;
attribute float a_dir;

////////////////////
// Uniform variables

uniform float u_width;

uniform vec2 u_winsz;
//uniform float u_ppa;

////////////////////
// Varying variables

varying float v_linepos;

void main (void)
{
  vec3 v12 = a_pos2 - a_pos1;
  
  vec4 ec_v12 = gl_ModelViewMatrix * vec4(v12, 0.0f);

  vec2 e1 = normalize(ec_v12.xy);
  vec2 e2 = vec2(-e1.y, e1.x);
  
  vec4 ecPosition = gl_ModelViewMatrix * vec4(a_pos1, 1.0);

  ecPosition.xy += e2 * a_hwidth * u_width;

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  gl_FrontColor=gl_Color;

  gl_FogFragCoord = ffog(ecPosition.z);

  ////////////////////

  //v_linepos = a_dir * length(v12);

  vec4 vw12 = gl_ProjectionMatrix * gl_ModelViewMatrix * vec4(v12, 0.0);
  vec2 vwdir = vw12.xy;
  vwdir *= u_winsz;
  v_linepos = a_dir * length(vwdir);
}

