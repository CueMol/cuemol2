// -*-Mode: C++;-*-
//
//  mapsurf1_vertex.glsl:
//    vertex shader
//

// GLSL version 1.40
// #version 140
#if (__VERSION__>=140)
// #extension GL_compatibility : enable
#define USE_TBO 1
#else
#extension GL_ARB_compatibility : enable
#endif

#extension GL_EXT_gpu_shader4 : enable 

#if (USE_DRAW_INSTANCED>=1)
#extension GL_ARB_draw_instanced : enable
#endif

@include "lib_common.glsl"

////////////////////
// Vertex attributes

// index
attribute int a_ind;
/*
attribute float a_flag;
attribute float a_ivert;
*/

////////////////////
// Uniform variables

// constant tables
uniform ivec3 ivtxoffs[8];

uniform vec3 fvtxoffs[8];

uniform vec3 fegdir[12];

uniform ivec2 iegconn[12];

// uniform int itconn[256*15];

#ifdef USE_TBO
uniform usamplerBuffer u_maptex;
uniform usamplerBuffer u_tritex;
#else
uniform usampler3D u_maptex;
uniform usampler1D u_tritex;
#endif

uniform int u_isolevel;
//uniform int u_ncol;
//uniform int u_nrow;

/// Size of MapTex
uniform ivec3 u_mapsz;
uniform ivec3 u_dspsz;
uniform ivec3 u_stpos;

// surface color
uniform vec4 u_color;

const int u_binfac = 1;

#if (USE_DRAW_INSTANCED>=1)
uniform int u_vbosz;
uniform int u_vmax;
#endif

////////////////////
// varying
varying vec4 v_color;

varying float v_ecpos_z;

flat varying int v_fDiscard;

////////////////////

int getDensity(ivec3 iv)
{
  iv += u_stpos;

  iv = (iv + u_mapsz*100) % u_mapsz;

#ifdef USE_TBO
  //int index = iv.x + u_ncol*(iv.y + u_nrow*iv.z);
  int index = iv.x + u_mapsz.x*(iv.y + u_mapsz.y*iv.z);
  return int( texelFetch(u_maptex, index).r );
#else
  float val = texelFetch3D(dataFieldTex, iv, 0).x;
  return int(val * 255.0 + 0.5);
#endif
}

int itconn(int index)
{
#ifdef USE_TBO
  return int( texelFetch(u_tritex, index).r );
#else
#endif
}

vec3 getNorm(ivec3 iv)
{
  const int del = 1;
  vec3 ivr;
  ivr.x = getDensity(ivec3(iv.x-del, iv.y, iv.z)) - getDensity(ivec3(iv.x+del, iv.y, iv.z));
  ivr.y = getDensity(ivec3(iv.x, iv.y-del, iv.z)) - getDensity(ivec3(iv.x, iv.y+del, iv.z));
  ivr.z = getDensity(ivec3(iv.x, iv.y, iv.z-del)) - getDensity(ivec3(iv.x, iv.y, iv.z+del));

  return normalize(ivr);
  // return ivr;
}

void vdiscard()
{
  gl_Position = vec4(0,0,0,1);
  v_color = vec4(0,0,0,0);
  //gl_FrontColor = vec4(0,0,0,0);
  v_fDiscard = 1;
}

void main(void)
{
  v_fDiscard = 0;

  // int vid = gl_VertexID%3;

#if (USE_DRAW_INSTANCED>=1)
  int vid = gl_InstanceID*u_vbosz + gl_VertexID;
  if (vid>u_vmax) {
    vdiscard();
    return;
  }
  int iind = vid/15;
  int icorn = vid%15;
#else
  int iind = gl_VertexID/15;
  int icorn = gl_VertexID%15;
#endif  

  int u_ncol = u_dspsz.x;
  int u_nrow = u_dspsz.y;

  ivec3 vind;
  vind.x = iind % u_ncol;
  int itt = iind / u_ncol;
  vind.y = itt % u_nrow;
  vind.z = itt / u_nrow;
  
  //////////

  //int values[8];
  // ivec3 vvind;
  int val;
  int imask = 1;
  int iflag = 0;
  for (int ii=0; ii<8; ii++) {
    // vvind = vind + ivtxoffs[ii]; // * m_nBinFac;
    //val = getDensity(vind + ivtxoffs[ii]);

    if(getDensity(vind + ivtxoffs[ii]) <= u_isolevel)
      iflag |= 1<<ii;
  }

  if (iflag==0 || iflag==255) {
    vdiscard();
    return;
  }
  
  //////////

  // int iind = int(a_ind);
  // int iflag = int(a_flag);
  // int iedge = int(a_ivert);
  // int icorn = int(a_ivert);

  int iedge = itconn(iflag*15 + icorn);
  if (iedge<0) {
    vdiscard();
    return;
  }

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

  vec4 vec;
  vec.xyz = vec3(vind) + (fvtxoffs[ec0] + fegdir[iedge] * fOffset) * float(u_binfac);
  vec.w = 1.0;

  ////

  //vec3 norm = normalize( norm0*roffs + norm1*fOffset );
  vec3 norm = norm0*(1.0-fOffset) + norm1*fOffset;

  ////
  
  vec4 ecPosition = gl_ModelViewMatrix * vec;
  gl_Position = gl_ProjectionMatrix * ecPosition;

  v_ecpos_z = ecPosition.z;
  v_color = flight(normalize(gl_NormalMatrix * norm), ecPosition, u_color);

}

