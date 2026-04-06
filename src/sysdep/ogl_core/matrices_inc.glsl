// -*-Mode: C++;-*-
//
//  Matrices UBO GLSL include file
//

#pragma once

////////////////////
// MatricesBlock UBO: binding point 0
// u_NormalMatrix is stored as mat4 for std140 compatibility.
// Use mat3(u_NormalMatrix) in shaders that need mat3.

layout(std140) uniform MatricesBlock {
    mat4 u_ModelViewMatrix;   // offset 0,   64 bytes
    mat4 u_ProjectionMatrix;  // offset 64,  64 bytes
    mat4 u_NormalMatrix;      // offset 128, 64 bytes (logically mat3, padded as mat4)
};
