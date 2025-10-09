// -*-Mode: C++;-*-
//
//  mapmesh2_vert.glsl:
//    mapmesh render vertex shader
//

// attributes (none)

// uniforms
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

vec4 calcVertex(int vertexId)
{
  int id = vertexId;
  int iz = id / (ncol * nrow);
  int temp = id - iz * ncol * nrow;
  int iy = temp / ncol;
  int ix = temp - iy * ncol;
    
  return vec4(float(ix), float(iy), float(iz), 1.0);
}

void main(void)
{
  int i;
  vec4 pos = calcVertex(gl_InstanceID / 3);
  int modVert = gl_InstanceID % 3;
  int vert_id = gl_VertexID;
  int iplane = modVert; // / 2;
  
  ivec3 ipos = ivec3(pos.xyz);

  uint val[4];
  uint uisolev = uint(isolevel);
  int ii;

  //for (iplane = 0; iplane<3; ++iplane) {
  {
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

    if (flag==0U || flag>=15U) {
      gl_Position = vec4(0.0, 0.0, 0.0, -1.0);
      return;
    }
    
    ivec2 ieg = edgetab[flag];
    
    // if (crs0<0.0 || crs1<0.0 || crs0>1.0 || crs1>1.0)
    //   continue;

    int ieg0 = vert_id == 0 ? ieg.x : ieg.y;
    float crs0 = getCrossVal(val[ieg0], val[(ieg0+1)%4]);
    vec4 v0 = calcVecCrs(ipos, ieg0, crs0, ibase);
    gl_Position = wvertex(v0);
  }
}
