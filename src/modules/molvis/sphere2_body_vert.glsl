// -*-Mode: C++;-*-
//
//  vertex shader body for spheres (predefined attribute locations)
//
//  Included by sphere2_vertex.glsl (direct position) and
//  sphere2idx_vertex.glsl (coordinate texture). Do not add to
//  GLSL_SHADER_FILES; it is an include-only body.
//
#define varying out

#include <matrices_inc.glsl>

#ifdef USE_COORD_TEX
#include <lib_atoms.glsl>
#endif

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

#ifdef USE_COORD_TEX
// atom index into the coordinate texture
layout(location = 0) in float a_index;
uniform sampler2D u_coordTex;
#else
// position
layout(location = 0) in vec4 a_vertex;
#endif

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

#ifdef USE_COORD_TEX
    pos = getAtomPos(u_coordTex, int(a_index));
#else
    pos = a_vertex;
#endif

    pos = u_ModelViewMatrix * pos;
    pos.xy = pos.xy + a_impos.xy * (a_radius + u_edge);
    v_ecpos = pos;
    pos = u_ProjectionMatrix * pos;

    gl_Position = pos;

    v_edgeratio = (a_radius + u_edge) / a_radius;
    v_impos = a_impos * v_edgeratio;
    v_radius = a_radius;
    v_color = a_color;
}
