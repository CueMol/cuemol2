// -*-Mode: C++;-*-
//
//  Pixel drawing shader for OpenGL
//
#define varying out

#include "fog_inc.glsl"
#include "matrices_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;     // offset 0
    float _p1, _p2, _p3; // offset 4, 8, 12 (padding for vec3 alignment)
    vec3  u_position;     // offset 16
    float _p4;            // offset 28
    vec2  u_size;         // offset 32
    vec2  u_viewportSize; // offset 40
    vec3  u_colorBias;    // offset 48
    float _p5;            // offset 60
};

////////////////////
// Vertex attributes (predefined locations)

layout(location = 0) in vec2 a_vertex;
layout(location = 1) in vec2 a_texCoord;

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
    v_fogCoord = ffog(ecPos.z);
}
