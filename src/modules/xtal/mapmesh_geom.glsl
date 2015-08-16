// -*-Mode: C++;-*-
//
//  mapmesh_geom.glsl:
//    geometry shader
//

// GLSL version 1.30
#version 130

// //GLSL version 1.40
// #version 140
// #extension GL_ARB_compatibility : enable

//New G80 extensions
#extension GL_EXT_geometry_shader4 : enable
#extension GL_EXT_gpu_shader4 : enable 

/*
// Volume data field texture 
uniform usampler3D dataFieldTex; 
uint getDensity(ivec3 iv)
{
  return uint( texelFetch(dataFieldTex, iv, 0).a );
}
*/

// Volume data field texture buffer
uniform int ncol;
uniform int nrow;
uniform int nsec;
uniform usamplerBuffer dataFieldTex; 
uint getDensity(ivec3 iv)
{
  int index = iv.x + ncol*(iv.y + nrow*iv.z);
  return uint( texelFetch(dataFieldTex, index).r );
}

uniform int isolevel;

uniform ivec3 ivdel[12];

uniform ivec2 edgetab[16];

// for fog calc
varying float FogFragCoord; 

/// get the crossing value between d0 and d1 (uses isolevel)
float getCrossVal(uint d0, uint d1)
{
  if (d0==d1) return -1.0;

  int deld = int(d1)-int(d0);
  return float(isolevel-int(d0))/float(deld);
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
  FogFragCoord = ffog(ecPosition.z);
  return gl_ProjectionMatrix * ecPosition;
}

void main(void)
{
  int i;
  vec4 pos = gl_PositionIn[0];
  gl_FrontColor = gl_FrontColorIn[0];
  
  ivec3 ipos = ivec3(pos.xyz);

  uint val[4];
  uint uisolev = uint(isolevel);
  int iplane, ii;

  for (iplane = 0; iplane<3; ++iplane) {
    uint flag = 0U;
    uint mask = 1U;
    int ibase = iplane*4;

    for (ii=0; ii<4; ++ii) {
      ivec3 iv = ipos + ivdel[ii + ibase];
      val[ii] = getDensity(iv);
      if (val[ii]>uisolev)
        flag += mask;
      mask = mask << 1U;
    }

    if (flag==0U || flag>=15U)
      continue;

    ivec2 i01 = edgetab[flag];
    float crs0 = getCrossVal(val[i01.x], val[(i01.x+1)%4]);
    float crs1 = getCrossVal(val[i01.y], val[(i01.y+1)%4]);
    
    if (crs0<-0.0 || crs1<-0.0)
      continue;

    vec4 v0 = calcVecCrs(ipos, i01.x, crs0, ibase);
    vec4 v1 = calcVecCrs(ipos, i01.y, crs1, ibase);
    gl_Position = wvertex(v0);
    EmitVertex();
    gl_Position = wvertex(v1);
    EmitVertex();

    EndPrimitive();	
  }
}


/*
void main(void)
{
  int i;
  gl_FrontColor = gl_FrontColorIn[0];
  
  ivec3 ipos = GeomVertex[0].xyz;
  int iplane = GeomVertex[0].w;

  uint val[4];
  uint uisolev = uint(isolevel);
  int ii;

  uint flag = 0U;
  uint mask = 1U;
  int ibase = iplane*4;

  for (ii=0; ii<4; ++ii) {
    ivec3 iv = ipos + ivdel[ii + ibase];
    val[ii] = getDensity(iv);
    if (val[ii]>uisolev)
      flag += mask;
    mask = mask << 1U;
  }

  if (flag==0U || flag>=15U)
    continue;

  ivec2 i01 = edgetab[flag];
  float crs0 = getCrossVal(val[i01.x], val[(i01.x+1)%4]);
  float crs1 = getCrossVal(val[i01.y], val[(i01.y+1)%4]);

  if (crs0<-0.0 || crs1<-0.0)
    continue;

  vec4 v0 = calcVecCrs(ipos, i01.x, crs0, ibase);
  vec4 v1 = calcVecCrs(ipos, i01.y, crs1, ibase);
  wvertex(v0);
  wvertex(v1);

  EndPrimitive();
}
*/

/*
void main(void)
{
  vec4 pos = gl_PositionIn[0];

  ivec3 ipos = ivec3(pos.xyz);
  uint val = getDensity(ipos);

  gl_FrontColor = vec4(float(val)/255.0, float(val)/255.0, float(isolevel)/255.0, 1.0);
  // gl_FrontColor = vec4(1, 1, 0, 1);

  //pos = gl_ProjectionMatrix * gl_ModelViewMatrix * pos;
  //pos = gl_ModelViewMatrix * pos;

  vec4 pos2;

  gl_Position = wvertex(pos);
  EmitVertex();
  pos2 = pos;
  pos2.x += 0.1;
  gl_Position = wvertex(pos2);
  EmitVertex();
  EndPrimitive();	

  gl_Position = wvertex(pos);
  EmitVertex();
  pos2 = pos;
  pos2.y += 0.1;
  gl_Position = wvertex(pos2);
  EmitVertex();
  EndPrimitive();	

  gl_Position = wvertex(pos);
  EmitVertex();
  pos2 = pos;
  pos2.z += 0.1;
  gl_Position = wvertex(pos2);
  EmitVertex();
  EndPrimitive();	

}
*/

