// -*-Mode: C++;-*-
//
//  mapsurf1_vertex.glsl:
//    vertex shader
//
#define attribute in
#define varying out

#include "lighting_inc.glsl"
#include "fog_inc.glsl"

////////////////////
// Uniform variables

// Matrices
uniform mat4 u_ModelViewMatrix;
uniform mat4 u_ProjectionMatrix;
uniform mat3 u_NormalMatrix;

// constant tables
uniform ivec3 ivtxoffs[8];
uniform vec3 fvtxoffs[8];
uniform vec3 fegdir[12];
uniform ivec2 iegconn[12];

// volume texture
uniform usamplerBuffer u_maptex;

// params
uniform int u_isolevel;
uniform int u_ncol;
uniform int u_nrow;

////////////////////
// Vertex attributes

// index
attribute float a_ind;
attribute float a_flag;
attribute float a_ivert;

////////////////////
// Varying variables

varying vec4 v_frontColor;
varying float v_fogCoord;

const int u_binfac = 1;

// vec4 Ambient;
// vec4 Diffuse;
// vec4 Specular;

// void DirectionalLight(in int i, in vec3 normal)
// {
//   float nDotVP;         // normal . light direction
//   float nDotHV;         // normal . light half vector
//   float pf;             // power factor

//   nDotVP = max(0.0, dot(normal,
//                         normalize(vec3(gl_LightSource[i].position))));
//   nDotHV = max(0.0, dot(normal, vec3(gl_LightSource[i].halfVector)));

//   if (nDotVP == 0.0)
//     pf = 0.0;
//   else
//     pf = pow(nDotHV, gl_FrontMaterial.shininess);

//   Ambient  += gl_LightSource[i].ambient;
//   Diffuse  += gl_LightSource[i].diffuse * nDotVP;
//   Specular += gl_LightSource[i].specular * pf;
// }

// vec4 flight(in vec3 normal, in vec4 ecPosition)
// {
//   vec4 color;
//   vec3 ecPosition3;
//   vec3 eye;

//   ecPosition3 = (vec3 (ecPosition)) / ecPosition.w;
//   eye = vec3 (0.0, 0.0, 1.0);

//   // Clear the light intensity accumulators
//   Ambient  = vec4 (0.0);
//   Diffuse  = vec4 (0.0);
//   Specular = vec4 (0.0);

//   //pointLight(0, normal, eye, ecPosition3);
//   DirectionalLight(0, normal);

//   //color = gl_FrontLightModelProduct.sceneColor;
//   //color += Ambient  * gl_FrontMaterial.ambient;
//   //color += Diffuse  * gl_FrontMaterial.diffuse;

//   color = gl_LightModel.ambient * gl_Color;
//   color += Ambient  * gl_Color;
//   color += Diffuse  * gl_Color;
//   color += Specular * gl_FrontMaterial.specular;
//   color = clamp( color, 0.0, 1.0 );
//   return color;
// }

int getDensity(ivec3 iv)
{
    int index = iv.x + u_ncol * (iv.y + u_nrow * iv.z);
    return int(texelFetch(u_maptex, index).r);
}

ivec3 getNorm(ivec3 iv)
{
    const int del = 1;
    ivec3 ivr;
    ivr.x = getDensity(ivec3(iv.x - del, iv.y, iv.z)) -
            getDensity(ivec3(iv.x + del, iv.y, iv.z));
    ivr.y = getDensity(ivec3(iv.x, iv.y - del, iv.z)) -
            getDensity(ivec3(iv.x, iv.y + del, iv.z));
    ivr.z = getDensity(ivec3(iv.x, iv.y, iv.z - del)) -
            getDensity(ivec3(iv.x, iv.y, iv.z + del));

    return ivr;
}

void main(void)
{
    int vid = gl_VertexID % 3;

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
    ivec3 inorm0 = getNorm(ivv);

    ivv = vind + ivtxoffs[ec1] * u_binfac;
    int val1 = getDensity(ivv);
    ivec3 inorm1 = getNorm(ivv);

    float fOffset;  // = getOffset(val0, val1, u_isolevel);
    {
        int delta = int(val1) - int(val0);

        if (delta == 0)
            fOffset = 0.5f;
        else
            fOffset = float(int(u_isolevel) - int(val0)) / float(delta);
    }

    vec4 vec;
    vec.xyz = vec3(vind) + (fvtxoffs[ec0] + fegdir[iedge] * fOffset) * float(u_binfac);
    vec.w = 1.0;

    vec4 ecPosition = u_ModelViewMatrix * vec;
    gl_Position = u_ProjectionMatrix * ecPosition;

    ////

    // vec3 norm0 = normalize(u_NormalMatrix * vec3(inorm0));
    // vec3 norm1 = normalize(u_NormalMatrix * vec3(inorm1));
    // vec3 norm = normalize(norm0* (1.0 - fOffset) + norm1 * fOffset);

    vec3 norm = vec3(inorm0) * (1.0 - fOffset) + vec3(inorm1) * fOffset;
    norm = normalize(norm);
    norm = normalize(u_NormalMatrix * norm);

    ////

    vec4 in_color = vec4(0.5, 0.5, 0.5, 1.0);
    v_frontColor = flight2(norm, ecPosition, in_color);
    v_fogCoord = ffog(ecPosition.z);

    // v_frontColor = in_color;
}
