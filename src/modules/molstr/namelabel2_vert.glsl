// -*-Mode: C++;-*-
//
//  NameLabel2 vertex shader for OpenGL
//

//#extension GL_ARB_compatibility : enable
#extension GL_EXT_gpu_shader4 : enable 

@include "lib_common.glsl"

////////////////////
// Vertex attributes

attribute vec3 a_xyz;
attribute vec2 a_wh;
attribute vec2 a_nxy;
//attribute float a_width;
//attribute float a_addr;
attribute int a_width;
attribute int a_addr;

////////////////////
// Uniform variables

uniform vec2 u_winsz;

uniform float u_ppa;

////////////////////
// Varying

varying vec2 v_labpos;

//varying float v_width;
//varying float v_addr;
flat varying int v_width;
flat varying int v_addr;

void main (void)
{
  //int ind = gl_VertexID%4;

  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * vec4(a_xyz, 1.0);
  //gEcPosition = ecPosition;

  vec2 dxy = a_wh;
  mat2 m2 = mat2(a_nxy.x, a_nxy.y, -a_nxy.y, a_nxy.x);
  dxy = m2 * dxy;
  if (u_ppa>0.0f) {
    ecPosition.xy += dxy/u_ppa;
    //ecPosition.y += a_wh.y/u_ppa;
  }

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  if (u_ppa<0.0f) {
    gl_Position.xy += dxy/u_winsz;
    //gl_Position.y += a_wh.y/u_winsz.y;
  }

  gl_FrontColor=gl_Color;

  gl_FogFragCoord = ffog(ecPosition.z);

  v_labpos.x = a_wh.x;
  v_labpos.y = a_wh.y;

  v_width = int(a_width);
  v_addr = int(a_addr);
}

