// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL
//

uniform float frag_alpha;
uniform float frag_zdisp;

varying vec3 gNormal;
varying vec4 gEcPosition;

void main (void)
{
  vec4 color;

//  float nDot = dot(gNormal, normalize(vec3(gEcPosition)));
//  if (nDot<-0.5||nDot>0.5)
//    discard;

  color = gl_Color;
  float z = gl_FogFragCoord;

  float fog;
  fog = (gl_Fog.end - z) * gl_Fog.scale;
  fog = clamp(fog, 0.0, 1.0);
  color = vec4(mix( vec3(gl_Fog.color), vec3(color), fog), color.a * frag_alpha);

  gl_FragColor = color;

  //gl_FragDepth = gl_FragCoord.z + frag_zdisp;
}

