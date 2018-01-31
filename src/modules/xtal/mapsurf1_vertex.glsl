// -*-Mode: C++;-*-
//
//  mapsurf1_vertex.glsl:
//    vertex shader
//

//GLSL version 1.40
//#version 140
//#extension GL_ARB_compatibility : enable
//#extension GL_EXT_gpu_shader4 : enable 

// constant tables
/*
uniform ivec3 ivtxoffs[8];

uniform vec3 fvtxoffs[8];

uniform vec3 fegdir[12];

uniform ivec3 iegconn[12];
*/
////////////////////
// Uniform variables

//uniform usamplerBuffer u_maptex;
/*
uniform int u_isolevel;
uniform int u_ncol;
uniform int u_nrow;
*/
////////////////////
// Vertex attributes

// index
attribute float a_ind;
attribute float a_flag;
attribute float a_ivert;

/*uint getDensity(ivec3 iv)
{
  int index = iv.x + u_ncol*(iv.y + u_nrow*iv.z);
  return uint( texelFetch(u_maptex, index).r );
}*/

void main(void)
{
/*
  int iind = int(a_ind);
  
  int ind_i = iind % u_ncol;
  int itt = iind / u_ncol;
  int ind_j = itt % u_nrow;
  int ind_k = itt / u_nrow;

  ////
  
  vec4 ecPosition = gl_ModelViewMatrix * vec4(ind_i, ind_j, ind_k, 1);
  //FogFragCoord = ffog(ecPosition.z);
  gl_Position = gl_ProjectionMatrix * ecPosition;
*/
  gl_Position = vec4(1,1,1,1);
}

