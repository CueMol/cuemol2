// -*-Mode: C++;-*-
//
//  mapmesh_geom.glsl:
//    geometry shader
//

/*
// Volume data field texture 
uniform usampler3D dataFieldTex; 
uint getDensity(ivec3 iv)
{
  return uint( texelFetch(dataFieldTex, iv, 0).a );
}
*/

// input (points)
layout(points) in;
// output (line strip; 16 verts max)
layout(line_strip, max_vertices = 16) out;


uniform mat4 u_ModelViewMatrix;
uniform mat4 u_ProjectionMatrix;

// Volume data field texture buffer
uniform int ncol;
uniform int nrow;
uniform int nsec;
uniform usamplerBuffer dataFieldTex; 
uniform int isolevel;

uniform ivec3 ivdel[12];

uniform ivec2 edgetab[16];

// for fog calc
out float v_fogCoord; 

uint getDensity(ivec3 iv)
{
  int index = iv.x + ncol*(iv.y + nrow*iv.z);
  return uint( texelFetch(dataFieldTex, index).r );
}


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
  vec4 ecPosition = u_ModelViewMatrix * v;
  v_fogCoord = ffog(ecPosition.z);
  return u_ProjectionMatrix * ecPosition;
}


void main(void)
{
  int i;
  vec4 pos = gl_in[0].gl_Position;
  // gl_FrontColor = gl_FrontColorIn[0];
  
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

    ivec2 ieg = edgetab[flag];
    
    // if (crs0<0.0 || crs1<0.0 || crs0>1.0 || crs1>1.0)
    //   continue;

    int ieg0 = ieg.x;
    float crs0 = getCrossVal(val[ieg0], val[(ieg0+1)%4]);
    vec4 v0 = calcVecCrs(ipos, ieg0, crs0, ibase);
    gl_Position = wvertex(v0);
    EmitVertex();

    int ieg1 = ieg.y;
    float crs1 = getCrossVal(val[ieg1], val[(ieg1+1)%4]);
    vec4 v1 = calcVecCrs(ipos, ieg1, crs1, ibase);
    gl_Position = wvertex(v1);
    EmitVertex();

    EndPrimitive();	
  }
}


/*
void main(void)
{
  vec4 pos = gl_PositionIn[0];
  gl_FrontColor = gl_FrontColorIn[0];
}
*/

