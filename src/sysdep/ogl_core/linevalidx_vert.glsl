// -*-Mode: C++;-*-
//
//  Vertex shader for valence-aware wide lines with texture-fetched endpoints.
//
//  Extends linew2idx_vert.glsl for the stick (SimpleRenderer) model: each
//  endpoint is parametric along a bond (mix of the two fetched atom positions)
//  plus a static offset, and double/triple-bond parallel lines carry a
//  perpendicular displacement whose direction is computed here (so it follows
//  the atoms). The displacement direction is the in-plane perpendicular defined
//  by a reference (distal) atom when one is available, and a view-facing
//  perpendicular otherwise (isolated double bonds, collinear triple bonds).
//
#define attribute in
#define varying out

#include "fog_inc.glsl"
#include "matrices_inc.glsl"
#include "lib_atoms.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;   // offset 0
    float lineWidth;    // offset 4
    float stippleLen;   // offset 8
    int   u_nodepth;    // offset 12
    vec2  screenSize;   // offset 16
    int   use_u_color;  // offset 24
    float _pad;         // offset 28
    vec4  u_color;      // offset 32
};

////////////////////
// Vertex attributes (valence index variant)

// endpoint 1: xyz = model-space offset, w = atom index into the coordinate texture
layout(location = 0) in vec4 a_p1;
layout(location = 1) in vec4 a_p2;

// x = t1, y = t2 (endpoint parameters along the bond, 0=idx1 .. 1=idx2),
// z = displacement scale (0 = none), w = reference atom index (<0 = view fallback)
layout(location = 2) in vec4 a_val;

// color
layout(location = 3) in vec4 a_color1;
layout(location = 4) in vec4 a_color2;

uniform sampler2D u_coordTex;

////////////////////
// Endpoint positions consumed by linew_func() (globals, filled in main)

vec4 a_vertex1;
vec4 a_vertex2;

////////////////////
// Varying

varying float v_length;
varying vec4 v_frontColor;
varying float v_fogCoord;

////////////////////

#include "linew_inc.glsl"

// Perpendicular displacement direction (unit, model space) for a double/triple
// bond line. Uses the in-plane perpendicular defined by the reference atom
// idxd; falls back to a view-facing perpendicular when idxd is absent (<0) or
// the reference is collinear with the bond (triple bonds).
vec3 calcDispDir(in vec3 p1, in vec3 p2, in float idxd)
{
    vec3 ebond = normalize(p2 - p1);

    if (idxd >= 0.0) {
        vec3 pd = getAtomPos3(u_coordTex, int(idxd));
        vec3 v2 = pd - p1;
        float v2len = length(v2);
        vec3 d = v2 - ebond * dot(ebond, v2);
        // Use the in-plane perpendicular only when the reference atom is
        // clearly off the bond axis (ratio ~= sin of the off-axis angle,
        // 0.15 ~= 8.6 deg). Near-collinear references -- notably triple bonds
        // and slightly-bent alkynes -- fall through to the view-facing
        // direction instead of a noise-sensitive perpendicular.
        if (v2len > 1.0e-4 && length(d) > 0.15 * v2len) {
            return normalize(d);
        }
    }

    // View-facing fallback: perpendicular to the bond, in the screen plane.
    mat3 mv3 = mat3(u_ModelViewMatrix);
    vec3 ecb = normalize(mv3 * ebond);
    vec3 ecp = vec3(-ecb.y, ecb.x, 0.0);   // perpendicular to ecb in the xy plane
    float pl = length(ecp);
    if (pl < 1.0e-4) {
        // Bond points straight at the viewer; any screen direction works.
        ecp = vec3(1.0, 0.0, 0.0);
    } else {
        ecp /= pl;
    }
    return normalize(inverse(mv3) * ecp);
}

void main(void)
{
    vec3 p1 = getAtomPos3(u_coordTex, int(a_p1.w));
    vec3 p2 = getAtomPos3(u_coordTex, int(a_p2.w));

    vec3 base1 = mix(p1, p2, a_val.x);
    vec3 base2 = mix(p1, p2, a_val.y);

    vec3 disp = vec3(0.0);
    if (a_val.z != 0.0) {
        disp = calcDispDir(p1, p2, a_val.w) * a_val.z;
    }

    a_vertex1 = vec4(base1 + a_p1.xyz + disp, 1.0);
    a_vertex2 = vec4(base2 + a_p2.xyz + disp, 1.0);

    linew_func(stippleLen, v_length, v_fogCoord);

    if (u_nodepth > 0) {
        // billboarded line without depth
        gl_Position.z = -0.99;
        gl_Position.w = 1.0;
        v_fogCoord = 0.0;
    }
}
