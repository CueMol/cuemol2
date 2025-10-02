// -*-Mode: C++;-*-
//
//  Triangle vertex shader for OpenGL
//
#define attribute in
#define varying out

#include "lighting_inc.glsl"
#include "fog_inc.glsl"

////////////////////
// Uniform variables

uniform bool enable_lighting;
uniform mat4 u_ModelViewMatrix;
uniform mat4 u_ProjectionMatrix;
uniform mat3 u_NormalMatrix;

////////////////////
// Vertex attributes

attribute vec4 aVertex;
attribute vec4 aNormal;
attribute vec4 aColor;

////////////////////
// Varying variables

varying vec4 v_frontColor;
varying float v_fogCoord;

void main(void)
{
    // Eye-coordinate position of vertex, needed in various calculations
    // vec4 ecPosition = gl_ModelViewMatrix * aVertex;
    vec4 ecPosition = u_ModelViewMatrix * aVertex;

    gl_Position = u_ProjectionMatrix * ecPosition;

    if (enable_lighting) {
        vec3 normal = normalize(u_NormalMatrix * aNormal.xyz);
        v_frontColor = flight2(normal, ecPosition, aColor);
    } else {
        v_frontColor = aColor;
    }

    v_fogCoord = ffog(ecPosition.z);
}
