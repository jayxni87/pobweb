#version 300 es
precision highp float;

// Per-instance line segment
layout(location = 0) in vec2 a_start;     // line start world pos
layout(location = 1) in vec2 a_end;       // line end world pos
layout(location = 2) in float a_width;    // line width
layout(location = 3) in vec4 a_color;     // line color

// Per-vertex (quad for line segment: 0..1 along length, -0.5..0.5 across width)
layout(location = 4) in vec2 a_vertex;

uniform mat4 u_viewProjection;

out vec4 v_color;

void main() {
  vec2 dir = a_end - a_start;
  vec2 normal = normalize(vec2(-dir.y, dir.x));

  vec2 worldPos = a_start + dir * a_vertex.x + normal * a_width * a_vertex.y;
  gl_Position = u_viewProjection * vec4(worldPos, 0.0, 1.0);
  v_color = a_color;
}
