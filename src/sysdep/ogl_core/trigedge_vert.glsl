// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//
#define varying out

#include "fog_inc.glsl"
#include "matrices_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;  // offset 0
    float edge_width;  // offset 4
    int   u_silh;      // offset 8
    float _pad;        // offset 12
    vec4  edge_color;  // offset 16
};

////////////////////
// Vertex attributes (predefined locations)

layout(location = 0) in vec4 aVertex;
layout(location = 1) in vec4 aNormal;

////////////////////
// Varying

varying vec4 v_frontColor;
varying float v_fogCoord;

void main(void)
{
    // Eye-coordinate position of vertex, needed in various calculations
    vec4 ecPosition = u_ModelViewMatrix * aVertex;

    vec3 normal = normalize(mat3(u_NormalMatrix) * aNormal.xyz);

    ecPosition += vec4(normal * edge_width, 0);

    // Do fixed functionality vertex transform
    vec4 pos = u_ProjectionMatrix * ecPosition;

    gl_Position = pos;

    v_frontColor = edge_color;

    v_fogCoord = ffog(ecPosition.z);
}
