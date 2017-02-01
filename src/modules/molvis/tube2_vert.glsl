// -*-Mode: C++;-*-
//
//  Tube2Renderer vertex shader for OpenGL
//

#if (__VERSION__>=140)
#define USE_TBO 1
#define USE_INSTANCED 1
#else
#extension GL_EXT_gpu_shader4 : enable 
#endif

//precision mediump float;

////////////////////
// Uniform variables

#ifdef USE_TBO
#define TextureType samplerBuffer
#else
#define TextureType sampler1D
#endif

uniform TextureType coefTex;
uniform TextureType binormTex;
uniform TextureType sectTex;
uniform sampler1D colorTex;
uniform TextureType puttyTex;

/// axial interpolation points
uniform int u_npoints;

/// smooth coloring
uniform int u_bsmocol;

/// putty mode flag
uniform int u_bputty;

#ifndef USE_INSTANCED
uniform int u_InstanceID;
#endif

////////////////////
// Vertex attributes

// spline rho param
attribute vec2 a_rho;

// // color
// attribute vec4 a_color;

////////////////////

void getCoefs(in TextureType tex, in int ind, out vec3 vc0, out vec3 vc1, out vec3 vc2, out vec3 vc3)
{
#ifdef USE_TBO
  vc0.x = texelFetch(tex, ind*12+0).r;
  vc0.y = texelFetch(tex, ind*12+1).r;
  vc0.z = texelFetch(tex, ind*12+2).r;

  vc1.x = texelFetch(tex, ind*12+3).r;
  vc1.y = texelFetch(tex, ind*12+4).r;
  vc1.z = texelFetch(tex, ind*12+5).r;

  vc2.x = texelFetch(tex, ind*12+6).r;
  vc2.y = texelFetch(tex, ind*12+7).r;
  vc2.z = texelFetch(tex, ind*12+8).r;

  vc3.x = texelFetch(tex, ind*12+9).r;
  vc3.y = texelFetch(tex, ind*12+10).r;
  vc3.z = texelFetch(tex, ind*12+11).r;
#else
  vc0 = texelFetch1D(tex, ind*4+0, 0).xyz;
  vc1 = texelFetch1D(tex, ind*4+1, 0).xyz;
  vc2 = texelFetch1D(tex, ind*4+2, 0).xyz;
  vc3 = texelFetch1D(tex, ind*4+3, 0).xyz;
#endif
}

vec3 getCoef(in TextureType tex, in int ind)
{
  vec3 rval;
#ifdef USE_TBO
  rval.x = texelFetch(tex, ind*3+0).r;
  rval.y = texelFetch(tex, ind*3+1).r;
  rval.z = texelFetch(tex, ind*3+2).r;
#else
  rval = texelFetch1D(tex, ind, 0).xyz;
#endif
  return rval;
}

vec3 interpolate(in TextureType tex, in float rho)
{
  vec3 coef0, coef1, coef2, coef3;

  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  getCoefs(tex, ncoeff, coef0, coef1, coef2, coef3);

  float f = rho - float(ncoeff);

  vec3 rval;
  rval = coef3*f + coef2;
  rval = rval*f + coef1;
  rval = rval*f + coef0;

  return rval;
}

void interpolate2(in TextureType tex, in float rho,
                  out vec3 rval, out vec3 drval)
{
  vec3 coef0, coef1, coef2, coef3;

  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  getCoefs(tex, ncoeff, coef0, coef1, coef2, coef3);

  float f = rho - float(ncoeff);

  rval = coef3*f + coef2;
  rval = rval*f + coef1;
  rval = rval*f + coef0;

  drval = coef3*(3.0*f) + coef2*2.0;
  drval = drval*f + coef1;
}

vec3 calcBinorm(in float rho)
{
  vec3 coef0, coef1, coef2, coef3;

  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  float f = rho - float(ncoeff);

  vec3 cp0 = getCoef(binormTex, ncoeff);
  vec3 cp1 = getCoef(binormTex, ncoeff+1);

  //vec3 rval = cp0*(1.0-f) + cp1*f;
  //return rval;
  return mix(cp0, cp1, f);
}

vec4 getSectTab(in int ind)
{
#ifdef USE_TBO
  return vec4( texelFetch(sectTex, ind*4+0).r,
               texelFetch(sectTex, ind*4+1).r,
               texelFetch(sectTex, ind*4+2).r,
               texelFetch(sectTex, ind*4+3).r );
#else
  return texelFetch1D(sectTex, ind, 0);
#endif
}

vec4 calcColor(in float rho)
{
  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);
  float f = rho - float(ncoeff);

#if (__VERSION__>=140)
  vec4 col0 = texelFetch(colorTex, ncoeff, 0);
  vec4 col1 = texelFetch(colorTex, ncoeff+1, 0);
#else
  vec4 col0 = texelFetch1D(colorTex, ncoeff, 0);
  vec4 col1 = texelFetch1D(colorTex, ncoeff+1, 0);
#endif

  if (u_bsmocol!=0) {
    return mix(col0, col1, f);
  }
  else {
    return (f<0.5f)?col0:col1;
  }
}

float getEScl(in float rho)
{
  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);
  float f = rho - float(ncoeff);

  float val0, val1;
#ifdef USE_TBO
  val0 = texelFetch(puttyTex, ncoeff).r;
  val1 = texelFetch(puttyTex, ncoeff+1).r;
#else
  val0 = texelFetch1D(puttyTex, ncoeff, 0).r;
  val1 = texelFetch1D(puttyTex, ncoeff+1, 0).r;
#endif

  return mix(val0, val1, f);
}

// local variables for lighting calc
vec4 Ambient;
vec4 Diffuse;
vec4 Specular;

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

vec4 flight(in vec4 acolor, in vec3 normal, in vec4 ecPosition)
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

  DirectionalLight(0, normal);

  color = gl_LightModel.ambient * acolor;
  color += Ambient  * acolor;
  color += Diffuse  * acolor;
  color += Specular * gl_FrontMaterial.specular;
  color = clamp( color, 0.0, 1.0 );
  return color;
}

float ffog(in float ecDistance)
{
  return(abs(ecDistance));
}

void main (void)
{
  //float xx = float(a_ind12.x)/2.0;

  //float par = a_rho.x;
#ifdef USE_INSTANCED
  float par = a_rho.x + gl_InstanceID;
#else
  float par = a_rho.x + u_InstanceID;
#endif

  vec3 cpos, bpos, binorm, v0;

  interpolate2(coefTex, par, cpos, v0);

  //bpos = interpolate(binormTex, par);
  //vec3 binorm = bpos - cpos;
  binorm = calcBinorm(par);
  
  vec3 e0 = normalize(v0);

  vec3 v2 = binorm - e0*(dot(e0,binorm));
  vec3 e2 = normalize(v2);
  vec3 e1 = cross(e2,e0);

  int j = int(a_rho.y);

  vec4 stab = getSectTab(j);

  vec3 norm = e1*stab.z + e2*stab.w;

  if (u_bputty!=0) {
    float escl = getEScl(par);
    e1 *= escl;
    e2 *= escl;
  }

  vec3 pos = cpos + e1*stab.x + e2*stab.y;

  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * vec4(pos, 1.0);

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  vec4 col = calcColor(par);
  //gl_FrontColor=vec4(xx, xx, xx, 1.0);
  //gl_FrontColor=a_color;

  gl_FrontColor = flight(col, gl_NormalMatrix * norm, ecPosition);

  gl_FogFragCoord = ffog(ecPosition.z);
}

