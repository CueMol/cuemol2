// -*-Mode: C++;-*-
//
//  mapmesh2_vert.glsl:
//    mapmesh render vertex shader
//

#include <matrices_inc.glsl>

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;  // offset 0
    int   ncol;        // offset 4
    int   nrow;        // offset 8
    int   isolevel;    // offset 12
    vec4  u_color;     // offset 16
};

// Volume data field: R8 2D lookup texture (sampler must stay outside UBO).
// The linear voxel index (column fastest) wraps onto
// (index % width, index / width) with the width read back from the texture;
// buffer textures do not exist in WebGL2 / GLSL ES 3.00.
uniform highp sampler2D dataFieldTex;

// Marching-cubes lookup tables (static arrays; kept as regular uniforms)
uniform ivec3 ivdel[12];
uniform ivec2 edgetab[16];

// for fog calc
out float v_fogCoord;

uint getDensity(ivec3 iv)
{
    int index = iv.x + ncol * (iv.y + nrow * iv.z);
    int w = textureSize(dataFieldTex, 0).x;
    ivec2 tc = ivec2(index % w, index / w);
    // R8 texel: normalized 0..1, back to the byte value
    return uint(texelFetch(dataFieldTex, tc, 0).r * 255.0 + 0.5);
}

/// get the crossing value between d0 and d1 (uses isolevel)
float getCrossVal(uint d0, uint d1)
{
    if (d0 == d1) return -1.0;

    int deld = int(d1) - int(d0);
    return float(isolevel - int(d0)) / float(deld);
}

vec4 calcVecCrs(ivec3 tpos, int i0, float crs, int ibase)
{
    ivec3 iv0, iv1;

    int i1 = (i0 + 1) % 4;

    iv0 = tpos + ivdel[ibase + i0];
    iv1 = tpos + ivdel[ibase + i1];

    vec4 v0 = vec4(float(iv0.x), float(iv0.y), float(iv0.z), 1);
    vec4 v1 = vec4(float(iv1.x), float(iv1.y), float(iv1.z), 1);

    return v0 + (v1 - v0) * crs;
}

float ffog(in float ecDistance)
{
    return (abs(ecDistance));
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
    int iplane = modVert;

    ivec3 ipos = ivec3(pos.xyz);

    uint val[4];
    uint uisolev = uint(isolevel);
    int ii;

    {
        uint flag = 0U;
        uint mask = 1U;
        int ibase = iplane * 4;

        for (ii = 0; ii < 4; ++ii) {
            ivec3 iv = ipos + ivdel[ii + ibase];
            val[ii] = getDensity(iv);
            if (val[ii] > uisolev) flag += mask;
            mask = mask << 1U;
        }

        if (flag == 0U || flag >= 15U) {
            gl_Position = vec4(-1.0e10, -1.0e10, -1.0e10, -1.0e10);
            return;
        }

        ivec2 ieg = edgetab[flag];

        int ieg0 = vert_id == 0 ? ieg.x : ieg.y;
        float crs0 = getCrossVal(val[ieg0], val[(ieg0 + 1) % 4]);
        vec4 v0 = calcVecCrs(ipos, ieg0, crs0, ibase);
        gl_Position = wvertex(v0);
    }
}
