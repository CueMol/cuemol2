// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL
//

vec4 Ambient;
vec4 Diffuse;
vec4 Specular;

uniform bool enable_lighting;
uniform float frag_alpha;

varying vec3 gNormal;
varying vec4 gEcPosition;

void DirectionalLight(in int i, in vec3 normal)
{
  float nDotVP;         // normal . light direction
  float nDotHV;         // normal . light half vector
  float pf;             // power factor
  
  nDotVP = max(0.0, dot(normal,
                        normalize(vec3(gl_LightSource[i].position))));
  nDotHV = max(0.0, dot(normal, vec3(gl_LightSource[i].halfVector)));
  
  if (nDotVP == 0.0)
    pf = 0.0;
  else
    pf = pow(nDotHV, gl_FrontMaterial.shininess);
  
  Ambient  += gl_LightSource[i].ambient;
  Diffuse  += gl_LightSource[i].diffuse * nDotVP;
  Specular += gl_LightSource[i].specular * pf;
}

vec4 flight(in vec3 normal, in vec4 ecPosition)
{
  vec4 color;
  vec3 ecPosition3;
  vec3 eye;

  ecPosition3 = (vec3 (ecPosition)) / ecPosition.w;
  eye = vec3 (0.0, 0.0, 1.0);

  // Clear the light intensity accumulators
  Ambient  = vec4 (0.0);
  Diffuse  = vec4 (0.0);
  Specular = vec4 (0.0);

  //pointLight(0, normal, eye, ecPosition3);
  DirectionalLight(0, normal);

  //color = gl_FrontLightModelProduct.sceneColor;
  //color += Ambient  * gl_FrontMaterial.ambient;
  //color += Diffuse  * gl_FrontMaterial.diffuse;

  color = gl_LightModel.ambient * gl_Color;
  color += Ambient  * gl_Color;
  color += Diffuse  * gl_Color;
  color += Specular * gl_FrontMaterial.specular;
  //color = clamp( color, 0.0, 1.0 );
  //gl_FrontColor = color;
  return color;
}

void main (void)
{
  vec4 color;

  color = gl_Color;
  float z = gl_FogFragCoord;

  float fog;
  fog = (gl_Fog.end - z) * gl_Fog.scale;
  fog = clamp(fog, 0.0, 1.0);
  color = vec4(mix( vec3(gl_Fog.color), vec3(color), fog), color.a * frag_alpha);
  //color = vec4(mix( vec3(gl_Fog.color), vec3(color), fog), color.a);
  gl_FragColor = color;
  
}

