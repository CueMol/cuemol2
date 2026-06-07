// -*-Mode: C++;-*-
//
//  Triangle vertex shader for OpenGL
//
#define varying out

#include "lighting_inc.glsl"
#include "fog_inc.glsl"
#include "matrices_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;       // offset 0
    int   enable_lighting;  // offset 4
    int   u_nodepth;        // offset 8
    float _pad;             // offset 12
};

////////////////////
// Vertex attributes (predefined locations)

layout(location = 0) in vec4 aVertex;
layout(location = 1) in vec4 aNormal;
layout(location = 2) in vec4 aColor;

////////////////////
// Varying variables

varying vec4 v_frontColor;
varying float v_fogCoord;
// Eye-space geometry normal forwarded to the MRT normal output (GTAO). Raw
// (un-normalized) here; the fragment shader normalizes with a zero guard.
varying vec3 v_ecNormal;

void main(void)
{
    // Eye-coordinate position of vertex, needed in various calculations
    vec4 ecPosition = u_ModelViewMatrix * aVertex;

    gl_Position = u_ProjectionMatrix * ecPosition;

    vec3 ecNormal = mat3(u_NormalMatrix) * aNormal.xyz;
    v_ecNormal = ecNormal;

    if (enable_lighting != 0) {
        v_frontColor = flight2(normalize(ecNormal), ecPosition, aColor);
    } else {
        v_frontColor = aColor;
    }

    if (u_nodepth > 0) {
        // billboarded line without depth
        gl_Position.z = -0.99;
        gl_Position.w = 1.0;
        v_fogCoord = 0.0;
    } else {
        v_fogCoord = ffog(ecPosition.z);
    }
}
