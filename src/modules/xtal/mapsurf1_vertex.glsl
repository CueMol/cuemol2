// -*-Mode: C++;-*-
//
//  mapsurf1_vertex.glsl:
//    vertex shader
//

// GLSL version 1.40
// #version 140
#if (__VERSION__>=140)
//#extension GL_compatibility : enable
#define USE_TBO 1
#else
#extension GL_ARB_compatibility : enable
#extension GL_EXT_gpu_shader4 : enable 
#endif

@include "lib_common.glsl"

////////////////////
// Vertex attributes

// index
attribute float a_ind;
attribute float a_flag;
attribute float a_ivert;

////////////////////
// Uniform variables

// constant tables
uniform ivec3 ivtxoffs[8];

uniform vec3 fvtxoffs[8];

uniform vec3 fegdir[12];

uniform ivec2 iegconn[12];

uniform usamplerBuffer u_maptex;

uniform int u_isolevel;
uniform int u_ncol;
uniform int u_nrow;

// surface color
uniform vec4 u_color;

const int u_binfac = 1;

////////////////////
// varying
varying vec4 v_color;

varying float v_ecpos_z;

int getDensity(ivec3 iv)
{
  int index = iv.x + u_ncol*(iv.y + u_nrow*iv.z);
  return int( texelFetch(u_maptex, index).r );
}

vec3 getNorm(ivec3 iv)
{
  const int del = 1;
  vec3 ivr;
  ivr.x = getDensity(ivec3(iv.x-del, iv.y, iv.z)) - getDensity(ivec3(iv.x+del, iv.y, iv.z));
  ivr.y = getDensity(ivec3(iv.x, iv.y-del, iv.z)) - getDensity(ivec3(iv.x, iv.y+del, iv.z));
  ivr.z = getDensity(ivec3(iv.x, iv.y, iv.z-del)) - getDensity(ivec3(iv.x, iv.y, iv.z+del));

  return normalize(ivr);
  return ivr;
}

void main(void)
{
  int vid = gl_VertexID%3;

  int iind = int(a_ind);
  int iflag = int(a_flag);
  int iedge = int(a_ivert);
  
  ivec3 vind;
  vind.x = iind % u_ncol;
  int itt = iind / u_ncol;
  vind.y = itt % u_nrow;
  vind.z = itt / u_nrow;

  int ec0 = iegconn[iedge].x;
  int ec1 = iegconn[iedge].y;

  ivec3 ivv;

  ivv = vind + ivtxoffs[ec0] * u_binfac;
  int val0 = getDensity(ivv);
  vec3 norm0 = getNorm(ivv);

  ivv =  vind + ivtxoffs[ec1] * u_binfac ;
  int val1 = getDensity(ivv);
  vec3 norm1 = getNorm(ivv);

  float fOffset; // = getOffset(val0, val1, u_isolevel);
  {
    int delta = int(val1) - int(val0);
    
    if(delta == 0)
      fOffset = 0.5f;
    else
      fOffset = float(int(u_isolevel) - int(val0))/float(delta);
  }
  float roffs = 1.0f-fOffset;

  vec4 vec;
  vec.xyz = vec3(vind) + (fvtxoffs[ec0] + fegdir[iedge] * fOffset) * float(u_binfac);
  vec.w = 1.0;

  ////

  vec3 norm = normalize( norm0*roffs + norm1*fOffset );
  //float th = float(gl_VertexID%256) / 255.0;
  //vec3 norm = normalize( vec3(th,sqrt(1.0-th*th),0) );

  ////
  
  vec4 ecPosition = gl_ModelViewMatrix * vec;
  gl_Position = gl_ProjectionMatrix * ecPosition;

  v_ecpos_z = ecPosition.z;
  // v_color = flight(gl_NormalMatrix * norm, ecPosition, u_color);
   v_color = flight(norm, ecPosition, u_color);
  //v_color = vec4(norm, 1.0);

  //gl_FogFragCoord = dum;
  //gl_Position = vec4(1,1,1,1);
}

