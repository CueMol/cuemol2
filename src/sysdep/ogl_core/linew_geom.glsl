// -*-Mode: C++;-*-
//
//  mapmesh_geom.glsl:
//    geometry shader
//

#version 330 compatibility

// uniform mat4 projection;
// uniform float lineWidth;

void main() {
    vec4 p1 = gl_in[0].gl_Position;
    vec4 p2 = gl_in[1].gl_Position;
    
    vec2 dir = normalize((p2 - p1).xy);
    vec2 normal = vec2(-dir.y, dir.x) * lineWidth * 0.5;
    
    lineWidth = 2.0;

    // P0
    // gl_Position = projection * (p1 + vec4(normal, 0.0, 0.0));
    gl_Position = (p1 + vec4(normal, 0.0, 0.0));
    EmitVertex();
    
    // P1
    // gl_Position = projection * (p1 - vec4(normal, 0.0, 0.0));
    gl_Position = (p1 - vec4(normal, 0.0, 0.0));
    EmitVertex();
    
    // P2
    // gl_Position = projection * (p2 + vec4(normal, 0.0, 0.0));
    gl_Position = (p2 + vec4(normal, 0.0, 0.0));
    EmitVertex();
    
    // P3
    // gl_Position = projection * (p2 - vec4(normal, 0.0, 0.0));
    gl_Position = (p2 - vec4(normal, 0.0, 0.0));
    EmitVertex();
    
    EndPrimitive();
}
