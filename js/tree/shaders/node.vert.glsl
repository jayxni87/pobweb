#version 300 es
precision highp float;

// Per-vertex attributes (quad)
layout(location = 0) in vec2 a_position;  // quad vertex [-0.5, 0.5]
layout(location = 1) in vec2 a_texCoord;  // texture coord [0, 1]

// Per-instance attributes
layout(location = 2) in vec2 a_offset;    // node world position
layout(location = 3) in float a_size;     // node size
layout(location = 4) in vec4 a_spriteRect; // sprite rect in atlas [x, y, w, h]
layout(location = 5) in vec4 a_color;     // tint color + alpha

uniform mat4 u_viewProjection;

out vec2 v_texCoord;
out vec4 v_color;

void main() {
  vec2 worldPos = a_offset + a_position * a_size;
  gl_Position = u_viewProjection * vec4(worldPos, 0.0, 1.0);

  // Map quad texcoords to sprite rect in atlas
  v_texCoord = a_spriteRect.xy + a_texCoord * a_spriteRect.zw;
  v_color = a_color;
}
