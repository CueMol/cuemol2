// -*-Mode: C++;-*-
//
//  GPU ID-buffer pick pass: shared declarations
//
//  The pick programs write uvec4(rend_idx, element_name, outer_name, 0) into
//  an RGBA32UI target. Names are the encoded hit names (gfx::encodeHitName:
//  0 = no name) carried as integer vertex attributes; the renderer index and
//  the outer name come from the pick tail of the DrawParamsBlock UBO.
//

#pragma once

// Pick tail appended to the DrawParamsBlock of every pick program (16 bytes).
#define PICK_DRAWPARAMS_TAIL \
    uint u_rend_idx;         \
    uint u_outer_name;       \
    uint _pp0;               \
    uint _pp1;
