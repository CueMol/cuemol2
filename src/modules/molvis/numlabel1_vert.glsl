// -*-Mode: C++;-*-
//
//  Number label vertex shader for OpenGL
//

#extension GL_EXT_gpu_shader4 : require

@include "lib_common.glsl"

////////////////////
// Vertex attributes

attribute vec3 a_xyz;
attribute vec3 a_nxyz;
attribute vec2 a_wh;
attribute vec2 a_disp;

////////////////////
// Uniform variables

uniform vec2 u_winsz;

uniform float u_ppa;

////////////////////
// Varying

varying vec2 v_labpos;
varying float v_ilab;

void main (void)
{
  vec4 pos = vec4(a_xyz, 1.0);
  vec2 dxy = a_disp;

/*
  vec3 ndir = normalize(a_nxyz);
  vec3 dir2 = cross(vec3(0,0,1), ndir);
  vec3 ndir2 = normalize(dir2);

  pos.xyz += ndir * dxy.x;
  pos.xyz += ndir2 * dxy.y;
*/
  
  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * pos;

/*
  vec4 ec_dir = gl_ModelViewMatrix * vec4(a_nxyz, 0.0);
  vec3 ec_dir2 = cross(vec3(0,0,1), ec_dir.xyz);

  vec3 nec_dir = normalize(ec_dir.xyz);
  vec3 nec_dir2 = normalize(ec_dir2);

  ecPosition.xyz += nec_dir * dxy.x;
  ecPosition.xyz += nec_dir2 * dxy.y;
*/
  
/*
  if (u_ppa>0.0f) {
    ecPosition.xy += dxy/u_ppa;
  }
*/
  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  vec4 vw_dir = gl_ModelViewMatrix * vec4(a_nxyz, 0.0);
  //if (vw_dir.x<0)
  vw_dir = vw_dir * sign(vw_dir.x);
  vec2 vw_ndir = normalize(vw_dir.xy);
  vec2 vw_ndir2 = vec2(-vw_ndir.y, vw_ndir.x);

  if (u_ppa<0.0f) {
    gl_Position.xy += vw_ndir * (dxy.x/u_winsz);
    gl_Position.xy += vw_ndir2 * (dxy.y/u_winsz);
  }

  gl_FrontColor=gl_Color;

  gl_FogFragCoord = ffog(ecPosition.z);

  v_labpos.x = a_wh.x;
  v_labpos.y = a_wh.y;

  v_ilab = float(gl_VertexID/4);
}

