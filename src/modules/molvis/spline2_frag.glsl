// -*-Mode: C++;-*-
//
//  Spline2Renderer fragment shader for OpenGL
//

uniform float frag_alpha;

void main (void)
{
  vec4 color;

  color = gl_Color;
  float z = gl_FogFragCoord;

  float fog;
  fog = (gl_Fog.end - z) * gl_Fog.scale;
  fog = clamp(fog, 0.0, 1.0);

  float alpha = color.a * frag_alpha;
  vec3 fogmixed = mix( vec3(gl_Fog.color), vec3(color), fog );

  color = vec4(fogmixed, alpha);

  gl_FragColor = color;
  
}

