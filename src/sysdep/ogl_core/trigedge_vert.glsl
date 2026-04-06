// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//
#define varying out

#include "fog_inc.glsl"

////////////////////
// Uniform variables

uniform float edge_width;
uniform vec4 edge_color;
uniform mat4 u_ModelViewMatrix;
uniform mat4 u_ProjectionMatrix;
uniform mat3 u_NormalMatrix;

////////////////////
// Vertex attributes (predefined locations)

layout(location = 0) in vec4 aVertex;
layout(location = 1) in vec4 aNormal;

////////////////////
// Varying

varying vec4 v_frontColor;
varying float v_fogCoord;

// uniform int u_silh;

void main(void)
{
    // Eye-coordinate position of vertex, needed in various calculations
    vec4 ecPosition = u_ModelViewMatrix * aVertex;

    vec3 normal = normalize(u_NormalMatrix * aNormal.xyz);

    ecPosition += vec4(normal * edge_width, 0);

    // Do fixed functionality vertex transform
    vec4 pos = u_ProjectionMatrix * ecPosition;

    gl_Position = pos;

    v_frontColor = edge_color;

    // v_fogCoord = abs(ecPosition.z);
    v_fogCoord = ffog(ecPosition.z);

    // if (u_silh == 1) {
    //     gl_Position.z = 0.9999;
    //     gl_Position.w = 1.0;
    // }
}
