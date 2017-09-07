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
uniform TextureType colorTex;
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

void getCoefs(in int ind, out vec3 vc0, out vec3 vc1, out vec3 vc2, out vec3 vc3)
{
#ifdef USE_TBO
  vc0 = texelFetch(coefTex, ind*4+0).xyz;
  vc1 = texelFetch(coefTex, ind*4+1).xyz;
  vc2 = texelFetch(coefTex, ind*4+2).xyz;
  vc3 = texelFetch(coefTex, ind*4+3).xyz;
#else
  vc0 = texelFetch1D(coefTex, ind*4+0, 0).xyz;
  vc1 = texelFetch1D(coefTex, ind*4+1, 0).xyz;
  vc2 = texelFetch1D(coefTex, ind*4+2, 0).xyz;
  vc3 = texelFetch1D(coefTex, ind*4+3, 0).xyz;
#endif
}

/// Get binorm vec (linear version)
vec3 getBinorm(in int ind)
{
#ifdef USE_TBO
  return texelFetch(binormTex, ind).xyz;
#else
  return texelFetch1D(binormTex, ind, 0).xyz;
#endif
}

/// Calculate binorm+pos (cubic spline version)
vec3 calcBpos(in float rho)
{
  vec3 coef0, coef1, coef2, coef3;

  int ind = int(floor(rho));
  ind = clamp(ind, 0, u_npoints-2);

#ifdef USE_TBO
  coef0 = texelFetch(binormTex, ind*4+0).xyz;
  coef1 = texelFetch(binormTex, ind*4+1).xyz;
  coef2 = texelFetch(binormTex, ind*4+2).xyz;
  coef3 = texelFetch(binormTex, ind*4+3).xyz;
#else
  coef0 = texelFetch1D(binormTex, ind*4+0, 0).xyz;
  coef1 = texelFetch1D(binormTex, ind*4+1, 0).xyz;
  coef2 = texelFetch1D(binormTex, ind*4+2, 0).xyz;
  coef3 = texelFetch1D(binormTex, ind*4+3, 0).xyz;
#endif

  float f = rho - float(ind);

  vec3 rval;
  rval = coef3*f + coef2;
  rval = rval*f + coef1;
  rval = rval*f + coef0;

  return rval;
}

void interpolate2(in float rho, out vec3 rval, out vec3 drval)
{
  vec3 coef0, coef1, coef2, coef3;

  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  getCoefs(ncoeff, coef0, coef1, coef2, coef3);

  float f = rho - float(ncoeff);

  rval = coef3*f + coef2;
  rval = rval*f + coef1;
  rval = rval*f + coef0;

  drval = coef3*(3.0*f) + coef2*2.0;
  drval = drval*f + coef1;
}

vec3 calcBinorm(in float rho)
{
  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  float f = rho - float(ncoeff);

  vec3 cp0 = getBinorm(ncoeff);
  vec3 cp1 = getBinorm(ncoeff+1);

  //vec3 rval = cp0*(1.0-f) + cp1*f;
  //return rval;
  return mix(cp0, cp1, f);
}

vec4 getSectTab(in int ind)
{
#ifdef USE_TBO
  return texelFetch(sectTex, ind);
#else
  return texelFetch1D(sectTex, ind, 0);
  /*float w = 0.35f;
  float ndiv = 16.0f;
  float th = radians( float(ind)*360.0f /ndiv );
  float co = cos(th);
  float si = sin(th);
  return vec4(co*w, si*w, co, si);*/
#endif
}

vec4 calcColor(in float rho)
{
  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);
  float f = rho - float(ncoeff);

#ifdef USE_TBO
  vec4 col0 = texelFetch(colorTex, ncoeff);
  vec4 col1 = texelFetch(colorTex, ncoeff+1);
#else
  vec4 col0 = texelFetch1D(colorTex, ncoeff, 0);
  vec4 col1 = texelFetch1D(colorTex, ncoeff+1, 0);
  //vec4 col0 = vec4(1,0,0,1);
  //vec4 col1 = vec4(0,0,1,1);
#endif

  if (u_bsmocol!=0)
    return mix(col0, col1, f);
  else
    return (f<0.5f)?col0:col1;
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
#ifdef USE_INSTANCED
  float par = a_rho.x + gl_InstanceID;
#else
  float par = a_rho.x + u_InstanceID;
#endif

  vec3 cpos, binorm, v0;

  interpolate2(par, cpos, v0);

#ifdef USE_LINBN
  binorm = calcBinorm(par);
#else
  vec3 bpos = calcBpos(par);
  binorm = bpos - cpos;
#endif
  
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

