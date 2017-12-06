// -*-Mode: C++;-*-
//
//  mapmesh2_vert.glsl:
//    vertex shader
//

#ifndef USE_TBO
#extension GL_EXT_gpu_shader4 : enable 
// #extension GL_ARB_compatibility : enable
#endif

////////////////////
// Uniform variables

uniform int isolevel;

uniform ivec3 ivdel[12];

uniform ivec2 edgetab[16];

// Volume data field texture buffer
//uniform int ncol;
//uniform int nrow;
//uniform int nsec;

uniform ivec3 u_dspsz;

uniform ivec3 u_stpos;
uniform ivec3 u_mapsz;

#ifdef USE_TBO
uniform usamplerBuffer dataFieldTex; 
#else
uniform sampler3D dataFieldTex; 
#endif

uniform int u_plane;

uniform mat4 u_xform;
uniform vec3 u_cen;
uniform float u_cexten;

uniform vec4 u_color;

////////////////////
// Vertex attributes

// 
attribute float a_dummy;

////////////////////
// Varying variables

varying float v_fDiscard;
varying float v_fFogCoord; 

int getDensity(ivec3 iv)
{
  iv += u_stpos;

  iv = (iv + u_mapsz*100) % u_mapsz;
  //iv.x = iv.x % u_mapsz.x;
  //iv.y = iv.y % u_mapsz.y;
  //iv.z = iv.z % u_mapsz.z;

#ifdef USE_TBO
  int index = iv.x + u_mapsz.x*(iv.y + u_mapsz.y*iv.z);
  return int( texelFetch(dataFieldTex, index).r );
#else
  float val = texelFetch3D(dataFieldTex, iv, 0).x;
  return int(val * 255.0 + 0.5);
  //return int( texelFetch3D(dataFieldTex, iv, 0).x );
#endif
}

/// get the crossing value between d0 and d1 (uses isolevel)
float getCrossVal(int d0, int d1)
{
  if (d0==d1) return -1.0;

  int deld = d1-d0;
  return float(isolevel-d0)/float(deld);
}

vec4 calcVecCrs(ivec3 tpos, int i0, float crs, int ibase)
{
  ivec3 iv0, iv1;

  int i1 = (i0+1)%4;

  iv0 = tpos + ivdel[ibase+i0];
  iv1 = tpos + ivdel[ibase+i1];

  vec4 v0 = vec4(float(iv0.x), float(iv0.y), float(iv0.z), 1);
  vec4 v1 = vec4(float(iv1.x), float(iv1.y), float(iv1.z), 1);

  return v0 + (v1-v0)*crs;
}

float ffog(in float ecDistance)
{
  return(abs(ecDistance));
}

vec4 wvertex(vec4 v)
{
  vec4 ecPosition = gl_ModelViewMatrix * v;
  v_fFogCoord = ffog(ecPosition.z);
  return gl_ProjectionMatrix * ecPosition;
}

void vdiscard()
{
  gl_Position = vec4(0,0,0,1);
  gl_FrontColor = vec4(0,0,0,0);
  v_fDiscard = 1.0;
}

void main(void)
{
  v_fDiscard = 0.0;

  ivec3 ipos; // = ivec3(a_pos.xyz);

  ivec3 vsz = ivec3(u_dspsz.x-1, u_dspsz.y-1, u_dspsz.z-1);

  int il = gl_VertexID/2;
  ipos.x = il%vsz.x;
  int ixx = il/vsz.x;
  ipos.y = ixx%vsz.y;
  int iyy = ixx/vsz.y;
  ipos.z = iyy%vsz.z;

  //int iplane = int( a_plane );
  int iplane = u_plane;

  int val[4];
  int uisolev = int(isolevel);
  int i;
  int ii;

  {
    int flag = 0;
    int mask = 1;
    int ibase = iplane*4;
    
    for (ii=0; ii<4; ++ii) {
      ivec3 iv = ipos + ivdel[ii + ibase];
      val[ii] = getDensity(iv);
      if (val[ii]>uisolev)
        flag += mask;
      mask = mask << 1U;
    }
    
    if (flag==0 || flag>=15) {
      vdiscard();
      return;
    }

    ivec2 i01 = edgetab[flag];
    float crs0 = getCrossVal(val[i01.x], val[(i01.x+1)%4]);
    float crs1 = getCrossVal(val[i01.y], val[(i01.y+1)%4]);
    
    if (crs0<-0.0 || crs1<-0.0) {
      vdiscard();
      return;
    }

    vec4 v;
    if (gl_VertexID%2==0)
    //if (a_ord>0)
      v = calcVecCrs(ipos, i01.x, crs0, ibase);
    else
      v = calcVecCrs(ipos, i01.y, crs1, ibase);

    if (u_cexten>0.0) {
      vec4 wld = u_xform * v;
      float d = length(wld.xyz - u_cen);
      if (d>u_cexten) {
        vdiscard();
      }
    }
    //gl_FrontColor=vec4(d, d, d, 1.0);

    //gl_Position = wvertex(v);
    vec4 ecPosition = gl_ModelViewMatrix * v;
    v_fFogCoord = ffog(ecPosition.z);
    gl_Position = gl_ProjectionMatrix * ecPosition;
    gl_FrontColor=u_color;
  }

/*  
  vec4 v = vec4(a_pos, 1.0);
  gl_Position = wvertex(v);
*/
  
  //gl_Position=gl_Vertex;
  //gl_FrontColor=u_color;
}

