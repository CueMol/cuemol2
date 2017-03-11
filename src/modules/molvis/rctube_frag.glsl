// -*-Mode: C++;-*-
//
//  GLSLRcTubeRenderer fragment shader for OpenGL
//

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
uniform sampler1D colorTex;

uniform float frag_alpha;

/// axial interpolation points
uniform int u_npoints;

/// smooth coloring
uniform int u_bsmocol;

uniform float u_tuber;
uniform float u_width;

////////////////////
// Varying variables

/// Eye-coordinate position
varying vec4 v_ecpos;

/// Texture coord
varying vec2 v_st;

/// Normal
//varying vec2 v_norm;

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

void interpolate3(in TextureType tex, in float rho,
                  out vec3 rval, out vec3 drval, out vec3 ddrval)
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

  ddrval = coef3*(6.0*f) + coef2*2.0;
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

void calcBinorm2(in float rho, out vec3 rval, out vec3 drval)
{
  vec3 coef0, coef1, coef2, coef3;

  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  float f = rho - float(ncoeff);

  vec3 cp0 = getCoef(binormTex, ncoeff);
  vec3 cp1 = getCoef(binormTex, ncoeff+1);

  //vec3 rval = cp0*(1.0-f) + cp1*f;
  rval = mix(cp0, cp1, f);
  drval = cp1 - cp0;
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

void st2pos(in vec2 st, out vec4 pos, out vec3 norm)
{
  vec3 f, df;
  interpolate2(coefTex, st.s, f, df);

  float dflen = length(df);
  vec3 e0 = df/dflen;
  
  vec3 v2 = calcBinorm(st.s);
  vec3 e2 = normalize(v2);

  vec3 e1 = cross(e2, e0);
  float th = st.t * M_2PI;

  float si = sin(th);
  float co = cos(th);
  vec3 pos3 = f + e1*(co*u_width) + e2*(si*u_width*u_tuber);

  float dlen = sqrt(co*co*u_tuber*u_tuber + si*si);
  norm = e1*(co*u_tuber/dlen) + e2*(si/dlen);

  pos = vec4(pos3, 1.0);
}

void st2pos_dsdt(in vec2 st, out vec4 pos, out vec4 pos_ds, out vec4 pos_dt)
{
  vec3 f, v0, dv0;
  interpolate3(coefTex, st.s, f, v0, dv0);

  float v0len = length(v0);
  vec3 e0 = v0/v0len;
  
  vec3 v2, dv2;
  calcBinorm2(st.s, v2, dv2);
  float v2len = length(v2);
  vec3 e2 = v2/v2len;

  vec3 e1 = cross(e2, e0);
  float th = st.t * M_2PI;
  
  float si = sin(th);
  float co = cos(th);

  vec3 pos3 = f + e1*(co*u_width) + e2*(si*u_width*u_tuber);
  pos = vec4(pos3, 1.0);

  vec3 pos_dt3 = e1*(-si*u_width * M_2PI) + e2*(co*u_width*u_tuber * M_2PI);
  pos_dt = vec4(pos_dt3, 0.0);

  // s derivative of e0 (=v0/|v0|)
  vec3 de0 = ( cross(v0, cross(dv0, v0) ) )/(v0len*v0len*v0len);
  // s derivative of e2 (=v2/|v2|)
  vec3 de2 = ( cross(v2, cross(dv2, v2) ) )/(v2len*v2len*v2len);
  // s derivative of e1 (cross(e2, e0))
  vec3 de1 = cross(de2, e0) + cross(e2, de0);

  vec3 pos_ds3 = v0 + de1*(co*u_width) + de2*(si*u_width*u_tuber);
  pos_ds = vec4(pos_ds3, 0.0);
}

const float ftol = 1e-8;
float solve_st(in vec4 vwpos, in vec2 st0, out vec2 st, out vec4 rpos)
{
  vec2 del;
  float dist;
  vec4 pos;
  vec4 pos_ds, pos_dt;

  st = st0;

  for (int k=0; k<6; ++k) {
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
  vec4 color;

  vec2 st;
  vec4 pos;
  vec4 v_vwpos = gl_ProjectionMatrix * v_ecpos;

  float del = solve_st(v_vwpos, v_st, st, pos);

  if (del>ftol) {
    //discard;
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    gl_FragDepth = gl_DepthRange.far-0.01;
  }
  else {
    vec3 norm;
    st2pos(st, pos, norm);
    pos = gl_ModelViewProjectionMatrix * pos;
    norm = gl_NormalMatrix * norm;

    float ndc_depth = pos.z / pos.w;
    float far=gl_DepthRange.far;
    float near=gl_DepthRange.near;
    float fd = (((far-near) * ndc_depth) + near + far) / 2.0;

    if (fd>far || fd<near) {
      discard;
    }
    else {
      gl_FragDepth = fd;
    }

    color = flight(calcColor(st.s), norm, v_ecpos);
    //color = HSBtoRGB(vec4(st.t, mod(st.s, 1.0), 1.0, 1.0));
    
    //gl_FragColor = vec4(mod(s, 1.0), t, 0.0, 1.0);
    //gl_FragColor = vec4(0.0, 0.0, del*1e5, 1.0);
    //gl_FragColor = vec4(0.0, 0.0, abs((pos.z+1.0)*0.5 - gl_FragCoord.z), 1.0);
    //gl_FragColor = vec4(gl_FragCoord.x/1024.0, gl_FragCoord.y/1024.0, 0.0, 1.0);
    
    gl_FragColor = color;

  }
  
}

