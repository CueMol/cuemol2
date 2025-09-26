// -*-Mode: C++;-*-
//
//  Triangle vertex shader for OpenGL
//

////////////////////
// Uniform variables

uniform bool enable_lighting;

////////////////////
// Vertex attributes

attribute vec4 aVertex;
attribute vec4 aNormal;
attribute vec4 aColor;

////////////////////
// Varying variables

varying vec4 vFrontColor;
// varying float v_fogCoord;

#include "lighting_inc.glsl"
#include "fog_inc.glsl"

// ////////////////////
// // Workarea

// vec4 Ambient;
// vec4 Diffuse;
// vec4 Specular;

// void DirectionalLight(in int i, in vec3 normal)
// {
//     float nDotVP;  // normal . light direction
//     float nDotHV;  // normal . light half vector
//     float pf;      // power factor

//     nDotVP = max(0.0, dot(normal, normalize(vec3(gl_LightSource[i].position))));
//     nDotHV = max(0.0, dot(normal, vec3(gl_LightSource[i].halfVector)));

//     if (nDotVP == 0.0)
//         pf = 0.0;
//     else
//         pf = pow(nDotHV, gl_FrontMaterial.shininess);

//     Ambient += gl_LightSource[i].ambient;
//     Diffuse += gl_LightSource[i].diffuse * nDotVP;
//     Specular += gl_LightSource[i].specular * pf;
// }

// float ffog(in float ecDistance)
// {
//     return (abs(ecDistance));
// }

// vec4 flight(in vec3 normal, in vec4 ecPosition, in vec4 a_color)
// {
//     vec4 color;
//     vec3 ecPosition3;
//     vec3 eye;

//     ecPosition3 = (vec3(ecPosition)) / ecPosition.w;
//     eye = vec3(0.0, 0.0, 1.0);

//     // Clear the light intensity accumulators
//     Ambient = vec4(0.0);
//     Diffuse = vec4(0.0);
//     Specular = vec4(0.0);

//     // pointLight(0, normal, eye, ecPosition3);
//     DirectionalLight(0, normal);

//     color = gl_LightModel.ambient * a_color;
//     color += Ambient * a_color;
//     color += Diffuse * a_color;
//     color += Specular * gl_FrontMaterial.specular;
//     color = clamp(color, 0.0, 1.0);
//     return color;
// }

void main(void)
{
    // Eye-coordinate position of vertex, needed in various calculations
    vec4 ecPosition = gl_ModelViewMatrix * aVertex;

    gl_Position = gl_ModelViewProjectionMatrix * aVertex;

    if (enable_lighting) {
        vec3 normal = normalize(gl_NormalMatrix * aNormal.xyz);
        vFrontColor = flight(normal, ecPosition, aColor);
    } else {
        vFrontColor = aColor;
    }

    // v_fogCoord = ffog(ecPosition.z);
    v_fogCoord = ffog(ecPosition.z);
}
