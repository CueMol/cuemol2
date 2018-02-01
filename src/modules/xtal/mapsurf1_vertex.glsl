// -*-Mode: C++;-*-
//
//  mapsurf1_vertex.glsl:
//    vertex shader
//

// GLSL version 1.40
#version 140
#extension GL_ARB_compatibility : enable
#extension GL_EXT_gpu_shader4 : enable 

// constant tables
uniform ivec3 ivtxoffs[8];

uniform vec3 fvtxoffs[8];

uniform vec3 fegdir[12];

uniform ivec3 iegconn[12];

////////////////////
// Uniform variables

uniform usamplerBuffer u_maptex;

uniform int u_isolevel;
uniform int u_ncol;
uniform int u_nrow;

////////////////////
// Vertex attributes

// index
attribute float a_ind;
attribute float a_flag;
attribute float a_ivert;

const int u_binfac = 1;

uint getDensity(ivec3 iv)
{
  int index = iv.x + u_ncol*(iv.y + u_nrow*iv.z);
  return uint( texelFetch(u_maptex, index).r );
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

  int ixx, iyy, izz;
  ixx = vind.x + (ivtxoffs[ec0].x);// * u_binfac;
  iyy = vind.y + (ivtxoffs[ec0].y);// * u_binfac;
  izz = vind.z + (ivtxoffs[ec0].z);// * u_binfac;

  uint val0 = getDensity(ivec3(ixx, iyy, izz));

  ixx = vind.x + (ivtxoffs[ec1].x);// * u_binfac;
  iyy = vind.y + (ivtxoffs[ec1].y);// * u_binfac;
  izz = vind.z + (ivtxoffs[ec1].z);// * u_binfac;

  uint val1 = getDensity(ivec3(ixx, iyy, izz));


  float fOffset; // = getOffset(val0, val1, u_isolevel);
  {
    int delta = int(val1) - int(val0);
    
    if(delta == 0)
      fOffset = 0.5f;
    else
      fOffset = float(int(u_isolevel) - int(val0))/float(delta);
  }
  fOffset = 0.5f;

  vec4 vec;

  vec.x = float(vind.x) + 
    (fvtxoffs[ec0].x + fOffset*fegdir[iedge].x);// * u_binfac;
  vec.y = float(vind.y) + 
    (fvtxoffs[ec0].y + fOffset*fegdir[iedge].y);// * u_binfac;
  vec.z = float(vind.z) + 
    (fvtxoffs[ec0].z + fOffset*fegdir[iedge].z);// * u_binfac;
  vec.w = 1.0;

  ////
  
  vec4 ecPosition = gl_ModelViewMatrix * vec;
  gl_Position = gl_ProjectionMatrix * ecPosition;

  //gl_FogFragCoord = dum;
  //gl_FrontColor = vec4(flag, ivert, 1, 1);
  //gl_Position = vec4(1,1,1,1);
}

