export function createRenderer(mesh, palette) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 416;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('Chromium could not initialize WebGL 2');

  const vertexSource = `#version 300 es
    in vec3 position;
    in vec3 normal;
    in vec3 referencePosition;
    uniform vec3 angles;
    out vec3 world;
    out vec3 surface;
    out vec3 objectPosition;
    out vec3 reference;
    vec3 rotate(vec3 p) {
      float cx = cos(angles.x);
      float sx = sin(angles.x);
      float cy = cos(angles.y);
      float sy = sin(angles.y);
      float cz = cos(angles.z);
      float sz = sin(angles.z);
      p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
      p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
      return vec3(cz * p.x - sz * p.y, sz * p.x + cz * p.y, p.z);
    }
    void main() {
      world = rotate(position - vec3(0.0, 0.6, 1.0));
      surface = rotate(normal);
      objectPosition = position;
      reference = referencePosition;
      gl_Position = vec4(world.x / 14.4, world.y / 15.6, -world.z / 25.0, 1.0);
    }`;
  const fragmentSource = `#version 300 es
    precision highp float;
    uniform vec3 material;
    uniform vec3 eyeCenter;
    uniform vec3 gaze;
    uniform float skin;
    in vec3 world;
    in vec3 surface;
    in vec3 objectPosition;
    in vec3 reference;
    out vec4 color;
    void main() {
      vec3 n = normalize(surface);
      vec3 light = normalize(vec3(-0.52, 0.70, 0.85));
      float key = max(dot(n, light), 0.0);
      float fill = max(dot(n, normalize(vec3(0.88, 0.24, 0.38))), 0.0);
      float rim = max(dot(n, normalize(vec3(0.20, 0.48, -0.87))), 0.0);
      float sheen = pow(max(dot(n, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 22.0);
      float shadow = smoothstep(-4.6, 1.6, world.z + n.y * 3.8);
      vec3 base = material;
      if (gaze.z > 0.0) {
        float aim = dot(normalize(objectPosition - eyeCenter), gaze);
        float iris = smoothstep(0.918, 0.942, aim);
        float pupil = smoothstep(0.982, 0.992, aim);
        float irisRim = smoothstep(0.953, 0.968, aim);
        base = mix(base, mix(vec3(0.21), vec3(0.41), irisRim), iris);
        base = mix(base, vec3(0.13), pupil);
      }
      if (skin > 0.0) {
        float horizontal = abs(reference.x) - 3.18;
        float arc = 5.56 - 0.14 * horizontal * horizontal - 0.10 * horizontal;
        float vertical = (reference.y - arc) / 0.23;
        float brow = exp(-vertical * vertical) * (1.0 - smoothstep(1.16, 2.03, abs(horizontal)));
        base *= 1.0 - 0.34 * brow * smoothstep(6.3, 8.0, reference.z);
      }
      vec3 lit = base * (0.30 + 0.51 * key + 0.22 * fill + 0.22 * rim + 0.08 * shadow);
      lit += vec3(0.075 * sheen);
      vec3 background = vec3(0.895, 0.905, 0.915);
      color = vec4(mix(background, lit, smoothstep(-15.7, -12.7, world.y)), 1.0);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.895, 0.905, 0.915, 1);

  function attribute(name) {
    const index = gl.getAttribLocation(program, name);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, 3, gl.FLOAT, false, 0, 0);
    return buffer;
  }

  const positions = attribute('position');
  const normals = attribute('normal');
  attribute('referencePosition');
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.vertices), gl.STATIC_DRAW);
  const rotation = gl.getUniformLocation(program, 'angles');
  const material = gl.getUniformLocation(program, 'material');
  const eyeCenter = gl.getUniformLocation(program, 'eyeCenter');
  const gaze = gl.getUniformLocation(program, 'gaze');
  const skin = gl.getUniformLocation(program, 'skin');
  const groups = Object.entries(mesh.groups).map(([name, indices]) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    const eyeSide = { M_ScleraLeft: 1, M_ScleraRight: -1 }[name] ?? 0;
    return { indices, buffer, color: palette[name], eyeSide, isSkin: name === 'M_Face' };
  });

  function surfaceNormals(points) {
    const result = new Float32Array(points.length);
    for (const { indices } of groups) {
      for (let index = 0; index < indices.length; index += 3) {
        const a = indices[index] * 3;
        const b = indices[index + 1] * 3;
        const c = indices[index + 2] * 3;
        const ux = points[b] - points[a];
        const uy = points[b + 1] - points[a + 1];
        const uz = points[b + 2] - points[a + 2];
        const vx = points[c] - points[a];
        const vy = points[c + 1] - points[a + 1];
        const vz = points[c + 2] - points[a + 2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        for (const offset of [a, b, c]) {
          result[offset] += nx;
          result[offset + 1] += ny;
          result[offset + 2] += nz;
        }
      }
    }
    for (let offset = 0; offset < result.length; offset += 3) {
      const length = Math.hypot(result[offset], result[offset + 1], result[offset + 2]) || 1;
      result[offset] /= length;
      result[offset + 1] /= length;
      result[offset + 2] /= length;
    }
    return result;
  }

  return (points, [pitch, yaw, roll], weights) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, normals);
    gl.bufferData(gl.ARRAY_BUFFER, surfaceNormals(points), gl.DYNAMIC_DRAW);

    const images = {};
    for (const [view, turn] of Object.entries({ front: 0, tq: 32 })) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform3fv(rotation, [pitch, yaw + turn, roll].map(degrees => degrees * Math.PI / 180));
      for (const group of groups) {
        gl.uniform3fv(material, group.color);
        gl.uniform1f(skin, Number(group.isSkin));
        if (group.eyeSide) {
          const side = group.eyeSide > 0 ? 'L' : 'R';
          const strength = name => weights[`${name}_${side}`] ?? 0;
          const x = group.eyeSide * 0.57 * (strength('eyeLookOut') - strength('eyeLookIn'));
          const y = 0.57 * (strength('eyeLookUp') - strength('eyeLookDown'));
          const length = Math.hypot(x, y, 1);
          gl.uniform3f(eyeCenter, group.eyeSide * 3.10, 3.62, 7.99);
          gl.uniform3f(gaze, x / length, y / length, 1 / length);
        } else {
          gl.uniform3f(gaze, 0, 0, 0);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, group.buffer);
        gl.drawElements(gl.TRIANGLES, group.indices.length, gl.UNSIGNED_SHORT, 0);
      }
      const encoded = canvas.toDataURL('image/webp', 0.88);
      if (!encoded.startsWith('data:image/webp;base64,')) throw new Error('Chromium could not encode WebP');
      images[view] = encoded.split(',')[1];
    }
    return images;
  };
}
