// -*-Mode: C++;-*-
//
//  Atom coordinate texture lookup helpers.
//
//  The coordinate texture is a 2D RGB32F texture holding one atom position
//  per texel, laid out row-major with a fixed width. A linear atom index is
//  wrapped onto (x, y) so that large systems exceed neither MAX_TEXTURE_SIZE
//  nor the per-dimension limit.
//
#ifndef LIB_ATOMS_GLSL_INCLUDED
#define LIB_ATOMS_GLSL_INCLUDED

#ifndef TEX2D_WIDTH
#  define TEX2D_WIDTH 1024
#endif

vec3 getAtomPos3(in sampler2D tex, in int ind)
{
    ivec2 iv;
    iv.x = ind % TEX2D_WIDTH;
    iv.y = ind / TEX2D_WIDTH;
    return texelFetch(tex, iv, 0).xyz;
}

vec4 getAtomPos(in sampler2D tex, in int ind)
{
    return vec4(getAtomPos3(tex, ind), 1.0);
}

#endif
