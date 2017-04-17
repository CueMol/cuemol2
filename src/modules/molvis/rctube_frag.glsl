// -*-Mode: C++;-*-
//
//  GLSLRcTubeRenderer fragment shader for OpenGL
//

//#define USE_LINBN 1

#if (__VERSION__>=140)
#define USE_TBO 1
#else
#extension GL_EXT_gpu_shader4 : enable 
#endif

#ifdef USE_TBO
#define TextureType samplerBuffer
#else
#define TextureType sampler1D
#endif

////////////////////
// Uniform variables

uniform TextureType coefTex;
uniform TextureType binormTex;
uniform TextureType colorTex;
uniform TextureType puttyTex;

uniform float frag_alpha;

/// axial interpolation points
uniform int u_npoints;

/// smooth coloring
uniform int u_bsmocol;

uniform float u_tuber;
uniform float u_tubersq;
uniform float u_width1;
uniform float u_width2;

uniform float u_gamma;

////////////////////
// Varying variables

/// Eye-coordinate position
varying vec4 v_ecpos;

/// Texture coord
varying vec2 v_st;

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

vec3 getBinorm(in int ind)
{
#ifdef USE_TBO
  return texelFetch(binormTex, ind).xyz;
#else
  return texelFetch1D(binormTex, ind, 0).xyz;
#endif
}

/// Calculate binorm+pos (cubic spline version)
void calcBpos2(in float rho, out vec3 rval, out vec3 drval)
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

  rval = coef3*f + coef2;
  rval = rval*f + coef1;
  rval = rval*f + coef0;

  drval = coef3*(3.0*f) + coef2*2.0;
  drval = drval*f + coef1;
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

void interpolate3(in float rho, out vec3 rval, out vec3 drval, out vec3 ddrval)
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

  ddrval = coef3*(6.0*f) + coef2*2.0;
}

vec3 calcBinorm(in float rho)
{
  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  float f = rho - float(ncoeff);

  vec3 cp0 = getBinorm(ncoeff);
  vec3 cp1 = getBinorm(ncoeff+1);

  return mix(cp0, cp1, f);
}

void calcBinorm2(in float rho, out vec3 rval, out vec3 drval)
{
  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  float f = rho - float(ncoeff);

  vec3 cp0 = getBinorm(ncoeff);
  vec3 cp1 = getBinorm(ncoeff+1);

  rval = mix(cp0, cp1, f);
  drval = cp1 - cp0;
}

vec2 getEScl(in float rho)
{
  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);
  float f = rho - float(ncoeff);

  vec2 val0, val1;
#ifdef USE_TBO
  val0 = texelFetch(puttyTex, ncoeff).xy;
  val1 = texelFetch(puttyTex, ncoeff+1).xy;
#else
  val0 = texelFetch1D(puttyTex, ncoeff, 0).xy;
  val1 = texelFetch1D(puttyTex, ncoeff+1, 0).xy;
#endif

  if (u_gamma>1.0) {
    if (f<=0.5)
      f = pow(2.0*f, u_gamma)/2.0;
    else
      f = 1.0 - pow(2.0*(1.0-f), u_gamma)/2.0;
  }

  return mix(val0, val1, f);
}

void getEScl2(in float rho, out vec2 rval, out vec2 drval)
{
  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);
  float f = rho - float(ncoeff);

  vec2 val0, val1;
#ifdef USE_TBO
  val0 = texelFetch(puttyTex, ncoeff).xy;
  val1 = texelFetch(puttyTex, ncoeff+1).xy;
#else
  val0 = texelFetch1D(puttyTex, ncoeff, 0).xy;
  val1 = texelFetch1D(puttyTex, ncoeff+1, 0).xy;
#endif

  float df = 1.0;
  if (u_gamma>1.0) {
    if (f<=0.5) {
      float xx = 2.0*f;
      f = pow(xx, u_gamma)/2.0;
      df = u_gamma * pow(xx, u_gamma-1.0);
    }
    else {
      float xx = 2.0*(1.0-f);
      f = 1.0 - pow(xx, u_gamma)/2.0;
      df = u_gamma * pow(xx, u_gamma-1.0);
    }
  }

  rval = mix(val0, val1, f);
  drval = (val1-val0)*df;
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
#endif

  if (u_bsmocol!=0)
    return mix(col0, col1, f);
  else
    return (f<0.5f)?col0:col1;
}

///////////////////////////////////
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

vec4 HSBtoRGB(in vec4 hsb)
{
  vec4 rgb;

  float hue = hsb.x;
  float saturation = hsb.y;
  float brightness = hsb.z;
  rgb.w = hsb.w;

  hue = mod(hue, 1.0);
  saturation = clamp(saturation, 0.0, 1.0);
  brightness = clamp(brightness, 0.0, 1.0);

  // int r = 0, g = 0, b = 0;
  if (saturation<0.001) {
    rgb.r = rgb.g = rgb.b = brightness;
  }
  else {
    float h = hue * 6.0;

    float hi = floor(h);
    float f = h - hi;
    float p = brightness * (1.0 - saturation);
    float q = brightness * (1.0 - saturation * f);
    float t = brightness * (1.0 - (saturation * (1.0 - f)));
    int ihi = int(hi);
    if (ihi == 0) {
      rgb.r = brightness;
      rgb.g = t;
      rgb.b = p;
    }
    else if (ihi == 1) {
      rgb.r = q;
      rgb.g = brightness;
      rgb.b = p;
    }
    else if (ihi == 2) {
      rgb.r = p;
      rgb.g = brightness;
      rgb.b = t;
    }
    else if (ihi == 3) {
      rgb.r = p;
      rgb.g = q;
      rgb.b = brightness;
    }
    else if (ihi == 4) {
      rgb.r = t;
      rgb.g = p;
      rgb.b = brightness;
    }
    else {
      //case 5:
      rgb.r = brightness;
      rgb.g = p;
      rgb.b = q;
    }
  }

  return rgb;
}

//const float M_PI = 3.141592653589793238462643383;
const float M_2PI = 3.141592653589793238462643383 * 2.0;

void st2pos_dsdt(in vec2 st, out vec4 pos, out vec4 pos_ds, out vec4 pos_dt)
{
  vec3 f, v0, dv0;
  interpolate3(st.s, f, v0, dv0);

  float v0len = length(v0);
  vec3 e0 = v0/v0len;
  
  vec3 v2, dv2;

#ifdef USE_LINBN
  calcBinorm2(st.s, v2, dv2);
#else
  vec3 bpos, dbpos;
  calcBpos2(st.s, bpos, dbpos);
  v2 = bpos - f;
  dv2 = dbpos - v0;
#endif

  float v2len = length(v2);
  vec3 e2 = v2/v2len;

  vec3 e1 = cross(e2, e0);

  vec2 escl, descl;
  getEScl2(st.s, escl, descl);

  //float th = st.t * M_2PI;
  float th = st.t;
  float si = sin(th);
  float co = cos(th);

  float cow = co*u_width1;
  float siw = si*u_width2;

  // Calc x

  vec3 pos3 = f + e1*(cow*escl.x) + e2*(siw*escl.y);
  pos = vec4(pos3, 1.0);

  // Calc dx/dt

  vec3 pos_dt3 = e1*(-si*u_width1*escl.x) + e2*(co*u_width2*escl.y);
  pos_dt = vec4(pos_dt3, 0.0);

  // Calc dx/ds

  // s derivative of e0 (=v0/|v0|)
  vec3 de0 = ( cross(v0, cross(dv0, v0) ) )/(v0len*v0len*v0len);
  // s derivative of e2 (=v2/|v2|)
  vec3 de2 = ( cross(v2, cross(dv2, v2) ) )/(v2len*v2len*v2len);
  // s derivative of e1 (cross(e2, e0))
  vec3 de1 = cross(de2, e0) + cross(e2, de0);

  vec3 pos_ds3 = v0 +
    //cow*( de1*escl.x) + siw*( de2*escl.y );
    cow*( e1*descl.x + de1*escl.x) + siw*( e2*descl.y + de2*escl.y );
  pos_ds = vec4(pos_ds3, 0.0);
}

void st2pos(in vec2 st, out vec4 pos, out vec3 norm)
{
/*
  vec3 f, df;
  interpolate2(st.s, f, df);

  float dflen = length(df);
  vec3 e0 = df/dflen;
  
  vec3 v2 = calcBinorm(st.s);
  vec3 e2 = normalize(v2);

  vec3 e1 = cross(e2, e0);

  vec2 escl = getEScl(st.s);

  //float th = st.t * M_2PI;
  float th = st.t;
  float si = sin(th);
  float co = cos(th);

  vec3 pos3 = f + e1*(co*u_width1*escl.x) + e2*(si*u_width2*escl.y);

  float dlen = sqrt(co*co*u_tubersq + si*si);
  norm = e1*(co*u_tuber/dlen) + e2*(si/dlen);

  pos = vec4(pos3, 1.0);
*/
  vec4 pos_ds, pos_dt;
  st2pos_dsdt(st, pos, pos_ds, pos_dt);
  
  norm = normalize( cross(pos_dt.xyz, pos_ds.xyz) );
}

const float ftol = 1e-7;
float solve_st(in vec4 vwpos, in vec2 st0, out vec2 st, out vec4 rpos)
{
  vec2 del;
  float dist;
  vec4 pos;
  vec4 pos_ds, pos_dt;

  st = st0;

  for (int k=0; k<5; ++k) {
  //for (int k=0; k<1; ++k) {
    st2pos_dsdt(st, pos, pos_ds, pos_dt);
    //pos = gl_ProjectionMatrix * gl_ModelViewMatrix * pos;
    pos = gl_ModelViewProjectionMatrix * pos;

    del.x = pos.x - vwpos.x;
    del.y = pos.y - vwpos.y;
    dist = (del.x*del.x + del.y*del.y);

    if (dist<ftol) break;

    //pos_ds = gl_ProjectionMatrix * gl_ModelViewMatrix * pos_ds;
    //pos_dt = gl_ProjectionMatrix * gl_ModelViewMatrix * pos_dt;
    pos_ds = gl_ModelViewProjectionMatrix * pos_ds;
    pos_dt = gl_ModelViewProjectionMatrix * pos_dt;

    float j11 = pos_ds.x;
    float j12 = pos_dt.x;
    float j21 = pos_ds.y;
    float j22 = pos_dt.y;

    float det = 1.0/(j11*j22-j12*j21);
    float rj11 = j22 * det;
    float rj22 = j11 * det;
    float rj12 = -j12 * det;
    float rj21 = -j21 * det;

    st.s = st.s - ( rj11 * del.x + rj12 * del.y );
    st.t = st.t - ( rj21 * del.x + rj22 * del.y );
  }

  //st2pos(st, pos);
  //pos = gl_ProjectionMatrix * gl_ModelViewMatrix * pos;
  //del.x = pos.x - vwpos.x;
  //del.y = pos.y - vwpos.y;
  //dist = (del.x*del.x + del.y*del.y);

  rpos = pos;
  return dist;
}

void main (void)
{
  vec2 st;
  vec4 pos;
  vec4 v_vwpos = gl_ProjectionMatrix * v_ecpos;

  float del = solve_st(v_vwpos, v_st, st, pos);
  //float del = 0.0;
  //st = v_st;

  //gl_FragColor = vec4(1.0, st.s, st.t, 1.0);
  //return;


  if (del>ftol) {
    discard;
    //gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    //gl_FragDepth = gl_DepthRange.far-0.01;
  }
  else
  {
    vec3 norm;
    st2pos(st, pos, norm);
    vec4 ecpos = gl_ModelViewMatrix * pos;
    vec4 cspos = gl_ProjectionMatrix * ecpos;
    norm = gl_NormalMatrix * norm;

    float ndc_depth = cspos.z / cspos.w;
    float far=gl_DepthRange.far;
    float near=gl_DepthRange.near;
    float fd = (((far-near) * ndc_depth) + near + far) / 2.0;

    if (fd>far || fd<near) {
      discard;
    }
    else {
      gl_FragDepth = fd;
    }
    gl_FragDepth = fd;
    
    // color calculation
    vec4 color;
    color = flight(calcColor(st.s), norm, ecpos);
    //color = HSBtoRGB(vec4(st.t, mod(st.s, 1.0), 1.0, 1.0));
    
    // fog calculation
    float fogz = abs(ecpos.z);
    float fog;
    fog = (gl_Fog.end - fogz) * gl_Fog.scale;
    fog = clamp(fog, 0.0, 1.0);
    vec4 fc = vec4(mix( vec3(gl_Fog.color), vec3(color), fog), color.a*frag_alpha);

    //gl_FragColor = vec4(mod(s, 1.0), t, 0.0, 1.0);
    //gl_FragColor = vec4(0.0, 0.0, del*1e5, 1.0);
    //gl_FragColor = vec4(gl_FragCoord.x/1024.0, gl_FragCoord.y/1024.0, 0.0, 1.0);
    
    gl_FragColor = fc;

  }

}

