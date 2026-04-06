// -*-Mode: C++;-*-
//
//  vertex shader for spheres (predefined attribute locations)
//
#define varying out

#include <matrices_inc.glsl>

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;   // offset 0
    float u_edge;       // offset 4
    int   u_bsilh;      // offset 8
    float _pad;         // offset 12
    vec4  u_edgecolor;  // offset 16
};

////////////////////
// Vertex attributes (predefined locations)

// position
layout(location = 0) in vec4 a_vertex;

// impostor
layout(location = 1) in vec2 a_impos;

// radius
layout(location = 2) in float a_radius;

// color
layout(location = 3) in vec4 a_color;

////////////////////
// Varying variables

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;
varying float v_radius;
varying float v_edgeratio;

////////////////////
// Program

void main()
{
    vec4 pos;

    pos = a_vertex;

    pos = u_ModelViewMatrix * pos;
    pos.xy = pos.xy + a_impos.xy * (a_radius + u_edge);
    v_ecpos = pos;
    pos = u_ProjectionMatrix * pos;

    gl_Position = pos;  // vec4(pos, 1.0);

    v_edgeratio = (a_radius + u_edge) / a_radius;
    v_impos = a_impos * v_edgeratio;
    v_radius = a_radius;
    v_color = a_color;
}
