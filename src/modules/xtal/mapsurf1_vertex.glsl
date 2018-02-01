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

uniform ivec2 iegconn[12];

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

vec4 Ambient;
vec4 Diffuse;
vec4 Specular;

//varying vec3 gNormal;
//varying vec4 gEcPosition;

void DirectionalLight(in int i, in vec3 normal)
{
  float nDotVP;         // normal . light direction
  float nDotHV;         // normal . light half vector
  float pf;             // power factor
  
  nDotVP = max(0.0, dot(normal,
                        normalize(vec3(gl_LightSource[i].position))));
  nDotHV = max(0.0, dot(normal, vec3(gl_LightSource[i].halfVector)));
  
  if (nDotVP == 0.0)
    pf = 0.0;
  else
    pf = pow(nDotHV, gl_FrontMaterial.shininess);
  
  Ambient  += gl_LightSource[i].ambient;
  Diffuse  += gl_LightSource[i].diffuse * nDotVP;
  Specular += gl_LightSource[i].specular * pf;
}

vec4 flight(in vec3 normal, in vec4 ecPosition)
{
  vec4 color;
  vec3 ecPosition3;
  vec3 eye;

  ecPosition3 = (vec3 (ecPosition)) / ecPosition.w;
  eye = vec3 (0.0, 0.0, 1.0);

  // Clear the light intensity accumulators
  Ambient  = vec4 (0.0);
  Diffuse  = vec4 (0.0);
  Specular = vec4 (0.0);

  //pointLight(0, normal, eye, ecPosition3);
  DirectionalLight(0, normal);

  //color = gl_FrontLightModelProduct.sceneColor;
  //color += Ambient  * gl_FrontMaterial.ambient;
  //color += Diffuse  * gl_FrontMaterial.diffuse;

  color = gl_LightModel.ambient * gl_Color;
  color += Ambient  * gl_Color;
  color += Diffuse  * gl_Color;
  color += Specular * gl_FrontMaterial.specular;
  color = clamp( color, 0.0, 1.0 );
  return color;
}


int getDensity(ivec3 iv)
{
  int index = iv.x + u_ncol*(iv.y + u_nrow*iv.z);
  return int( texelFetch(u_maptex, index).r );
}

ivec3 getNorm(ivec3 iv)
{
  const int del = 1;
  ivec3 ivr;
  ivr.x = getDensity(ivec3(iv.x-del, iv.y, iv.z)) - getDensity(ivec3(iv.x+del, iv.y, iv.z));
  ivr.y = getDensity(ivec3(iv.x, iv.y-del, iv.z)) - getDensity(ivec3(iv.x, iv.y+del, iv.z));
  ivr.z = getDensity(ivec3(iv.x, iv.y, iv.z-del)) - getDensity(ivec3(iv.x, iv.y, iv.z+del));

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
  ivec3 norm0 = getNorm(ivv);

  ivv =  vind + ivtxoffs[ec1] * u_binfac ;
  int val1 = getDensity(ivv);
  ivec3 norm1 = getNorm(ivv);

  float fOffset; // = getOffset(val0, val1, u_isolevel);
  {
    int delta = int(val1) - int(val0);
    
    if(delta == 0)
      fOffset = 0.5f;
    else
      fOffset = float(int(u_isolevel) - int(val0))/float(delta);
  }
  float roffs = 1.0f-fOffset;

  vec3 norm = normalize( vec3(norm0)*roffs + vec3(norm1)*fOffset );

  vec4 vec;

  vec.xyz = vec3(vind) + (fvtxoffs[ec0] + fegdir[iedge] * fOffset) * float(u_binfac);
  vec.w = 1.0;

  ////
  
  vec4 ecPosition = gl_ModelViewMatrix * vec;
  gl_Position = gl_ProjectionMatrix * ecPosition;

  gl_FrontColor = flight(gl_NormalMatrix * norm, ecPosition);
  //gl_FogFragCoord = dum;
  //gl_Position = vec4(1,1,1,1);
}

