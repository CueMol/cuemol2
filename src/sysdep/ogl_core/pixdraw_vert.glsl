// -*-Mode: C++;-*-
//
//  Pixel drawing shader for OpenGL
//
// #version 120

#include "fog_inc.glsl"

////////////////////
// Uniform variables

uniform vec3 u_position;
uniform vec2 u_size;
uniform vec2 u_viewportSize;

uniform mat4 u_ModelViewMatrix;
uniform mat4 u_ProjectionMatrix;

////////////////////
// Vertex attributes

attribute vec2 a_vertex;
attribute vec2 a_texCoord;

////////////////////
// Varying variables

varying vec2 v_texCoord;
varying float v_fogCoord;

void main()
{
    // Transform 3D position to clip space
    vec4 ecPos = u_ModelViewMatrix * vec4(u_position, 1.0);
    vec4 clipPos = u_ProjectionMatrix * ecPos;

    // Convert to normalized device coordinates for screen space calculations
    vec2 ndcPos = clipPos.xy / clipPos.w;

    // Convert pixel size to NDC size
    vec2 ndcSize = (u_size / u_viewportSize) * 2.0;

    // Create quad in screen space with pixel-accurate size
    vec2 quadPos = ndcPos + (a_vertex * ndcSize);

    // Output in clip space (let OpenGL do perspective division)
    gl_Position = vec4(quadPos * clipPos.w, clipPos.z, clipPos.w);

    v_texCoord = a_texCoord;
    // v_fogCoord = abs(ecPos.z);
    v_fogCoord = ffog(ecPos.z);
}
