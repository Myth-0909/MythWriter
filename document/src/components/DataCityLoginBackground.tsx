import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const PARTICLE_COUNT = 8000;
const TEXTURE_SIZE = 90;
const STAR_COUNT = 2000;
const LOGO_TEXT = "ZNWrither";

interface DataCityLoginBackgroundProps {
  className?: string;
}

type Shockwave = {
  startedAt: number;
  origin: THREE.Vector2;
};

type CityBlock = {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  tier: number;
};

const positionShader = `
  uniform float time;
  uniform sampler2D velocityTexture;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 position = texture2D(texturePosition, uv);
    vec3 velocity = texture2D(velocityTexture, uv).xyz;
    gl_FragColor = vec4(position.xyz + velocity, position.w);
  }
`;

const velocityShader = `
  uniform float time;
  uniform float delta;
  uniform float mouseSpeed;
  uniform vec2 mouse;
  uniform float mouseActive;
  uniform vec2 shockOrigin;
  uniform float shockTime;
  uniform sampler2D targetTexture;
  uniform sampler2D textTargetTexture;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 current = texture2D(texturePosition, uv);
    vec3 position = current.xyz;
    vec3 velocity = texture2D(textureVelocity, uv).xyz;
    vec3 cityTarget = texture2D(targetTexture, uv).xyz;
    vec3 textTarget = texture2D(textTargetTexture, uv).xyz;

    float mouseDistance = distance(position.xz, mouse);
    float mouseField = smoothstep(5.2, 0.0, mouseDistance) * mouseActive;
    float textMix = clamp(mouseField * (0.55 + mouseSpeed * 0.95), 0.0, 1.0);
    vec3 target = mix(cityTarget, textTarget, textMix);

    vec3 spring = (target - position) * (0.026 + textMix * 0.062);
    vec2 away2 = normalize(position.xz - mouse + vec2(0.001));
    float swirl = sin(time * 4.0 + position.y * 1.7 + position.x * 0.4);
    velocity += spring;
    velocity += vec3(away2.y, 0.0, -away2.x) * mouseField * swirl * (0.018 + mouseSpeed * 0.035);
    velocity += vec3(away2.x, 1.35, away2.y) * mouseField * (0.018 + mouseSpeed * 0.045);
    velocity.y -= 0.00045;
    velocity *= 0.902;

    if (shockTime >= 0.0 && shockTime <= 2.0) {
      float shockDistance = distance(position.xz, shockOrigin);
      float radius = shockTime * 7.2;
      float wave = smoothstep(0.92, 0.0, abs(shockDistance - radius));
      vec2 away2 = normalize(position.xz - shockOrigin + vec2(0.001));
      vec3 away = vec3(away2.x, 0.34, away2.y);
      velocity += away * wave * (1.0 - shockTime / 2.0) * 0.36;
    }

    gl_FragColor = vec4(velocity, 1.0);
  }
`;

const particleVertexShader = `
  uniform sampler2D positionTexture;
  uniform float time;
  uniform float lodStep;
  attribute vec2 reference;
  attribute vec3 color;
  attribute float particleSize;
  attribute float particleIndex;
  varying vec3 vColor;
  varying float vVisible;

  void main() {
    vec3 position = texture2D(positionTexture, reference).xyz;
    vColor = color;
    vVisible = step(0.5, 1.0 - mod(particleIndex, lodStep));
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = particleSize * (240.0 / max(12.0, -mvPosition.z)) * vVisible;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = `
  varying vec3 vColor;
  varying float vVisible;

  void main() {
    if (vVisible < 0.5) discard;
    vec2 centered = gl_PointCoord - vec2(0.5);
    float alpha = smoothstep(0.5, 0.08, length(centered));
    gl_FragColor = vec4(vColor, alpha * 0.9);
  }
`;

const starVertexShader = `
  uniform float time;
  attribute float seed;
  varying float vAlpha;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float twinkle = 0.55 + 0.45 * sin(time * 1.4 + seed);
    gl_PointSize = (0.7 + twinkle * 1.5) * (140.0 / max(20.0, -mvPosition.z));
    vAlpha = 0.2 + twinkle * 0.32;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starFragmentShader = `
  varying float vAlpha;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float alpha = smoothstep(0.5, 0.0, length(centered));
    gl_FragColor = vec4(0.72, 0.84, 1.0, alpha * vAlpha);
  }
`;

function createTextTargets() {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 260;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 150px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(LOGO_TEXT, canvas.width / 2, canvas.height / 2 + 8);

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const points: THREE.Vector3[] = [];
  for (let y = 0; y < canvas.height; y += 4) {
    for (let x = 0; x < canvas.width; x += 4) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha > 70) {
        points.push(new THREE.Vector3((x / canvas.width - 0.5) * 13.0, (0.5 - y / canvas.height) * 3.2 + 4.2, -1.2));
      }
    }
  }
  return points;
}

function generateCityBlocks() {
  const blocks: CityBlock[] = [];
  const random = mulberry32(18);

  for (let x = -8; x <= 8; x++) {
    for (let z = -5; z <= 5; z++) {
      const distance = Math.hypot(x * 0.58, z * 0.82);
      const core = Math.max(0, 1 - distance / 7.0);
      const skyline = Math.pow(core, 1.85) * 10.5;
      const towerChance = random();
      const height = Math.max(0.65, 1.2 + skyline + random() * 3.4 + (towerChance > 0.92 ? random() * 5.5 : 0));
      const width = 0.34 + random() * 0.44;
      const depth = 0.34 + random() * 0.5;
      blocks.push({
        x: x * 0.67 + (random() - 0.5) * 0.16,
        z: z * 0.72 + (random() - 0.5) * 0.16,
        width,
        depth,
        height,
        tier: core,
      });
    }
  }

  blocks.push({ x: 0, z: 0, width: 0.78, depth: 0.78, height: 16.8, tier: 1 });
  blocks.push({ x: -0.72, z: 0.34, width: 0.42, depth: 0.42, height: 13.8, tier: 1 });
  blocks.push({ x: 0.72, z: -0.34, width: 0.42, depth: 0.42, height: 12.6, tier: 1 });
  return blocks;
}

function createCityGeometry() {
  const geometries: THREE.BufferGeometry[] = [];
  const blocks = generateCityBlocks();

  blocks.forEach((block) => {
    const geometry = new THREE.BoxGeometry(block.width, block.height, block.depth, 4, 18, 4);
    geometry.translate(block.x, block.height / 2, block.z);
    geometries.push(geometry);
  });

  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}

function createCitySilhouette() {
  const blocks = generateCityBlocks();
  const group = new THREE.Group();
  const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#071527",
    emissive: "#0d3d74",
    emissiveIntensity: 0.32,
    roughness: 0.42,
    metalness: 0.62,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const bodyMesh = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, blocks.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  blocks.forEach((block, index) => {
    matrix.compose(
      new THREE.Vector3(block.x, block.height / 2 - 0.02, block.z),
      new THREE.Quaternion(),
      new THREE.Vector3(block.width, block.height, block.depth),
    );
    bodyMesh.setMatrixAt(index, matrix);
    color.set("#0a1c32").lerp(new THREE.Color("#143d69"), block.tier);
    bodyMesh.setColorAt(index, color);
  });
  group.add(bodyMesh);

  const edgePositions: number[] = [];
  blocks.forEach((block) => {
    const x0 = block.x - block.width / 2;
    const x1 = block.x + block.width / 2;
    const z0 = block.z - block.depth / 2;
    const z1 = block.z + block.depth / 2;
    const y0 = 0;
    const y1 = block.height;
    edgePositions.push(
      x0, y0, z0, x0, y1, z0,
      x1, y0, z0, x1, y1, z0,
      x1, y0, z1, x1, y1, z1,
      x0, y0, z1, x0, y1, z1,
      x0, y1, z0, x1, y1, z0,
      x1, y1, z0, x1, y1, z1,
      x1, y1, z1, x0, y1, z1,
      x0, y1, z1, x0, y1, z0,
    );
  });
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: "#62c9ff",
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

  const antennaMaterial = new THREE.LineBasicMaterial({
    color: "#f6b83d",
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
  });
  const antennaGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 16.2, 0),
    new THREE.Vector3(0, 20.2, 0),
  ]);
  group.add(new THREE.Line(antennaGeometry, antennaMaterial));
  return group;
}

function createLogoSprite() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Sprite();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = "rgba(246, 184, 61, 0.9)";
  ctx.shadowBlur = 32;
  ctx.fillStyle = "#f8d677";
  ctx.font = "900 112px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(LOGO_TEXT, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: "#ffffff",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.8, 0.95, 1);
  sprite.position.set(0, 8.75, 0);
  return sprite;
}

function fillTextures(
  gpu: GPUComputationRenderer,
  cityTargets: THREE.Vector3[],
  textTargets: THREE.Vector3[],
) {
  const positionTexture = gpu.createTexture();
  const velocityTexture = gpu.createTexture();
  const targetTexture = gpu.createTexture();
  const textTexture = gpu.createTexture();
  const positionData = positionTexture.image.data;
  const velocityData = velocityTexture.image.data;
  const targetData = targetTexture.image.data;
  const textData = textTexture.image.data;
  const random = mulberry32(42);

  if (!positionData || !velocityData || !targetData || !textData) {
    throw new Error("Unable to allocate GPGPU particle textures.");
  }

  for (let i = 0; i < TEXTURE_SIZE * TEXTURE_SIZE; i++) {
    const stride = i * 4;
    const city = cityTargets[i % cityTargets.length];
    const text = textTargets.length ? textTargets[Math.floor((i / (TEXTURE_SIZE * TEXTURE_SIZE)) * textTargets.length) % textTargets.length] : city;
    const jitter = new THREE.Vector3((random() - 0.5) * 0.05, (random() - 0.5) * 0.05, (random() - 0.5) * 0.05);

    positionData[stride] = city.x + jitter.x;
    positionData[stride + 1] = city.y + jitter.y;
    positionData[stride + 2] = city.z + jitter.z;
    positionData[stride + 3] = 1;

    velocityData[stride] = (random() - 0.5) * 0.006;
    velocityData[stride + 1] = (random() - 0.5) * 0.006;
    velocityData[stride + 2] = (random() - 0.5) * 0.006;
    velocityData[stride + 3] = 1;

    targetData[stride] = city.x;
    targetData[stride + 1] = city.y;
    targetData[stride + 2] = city.z;
    targetData[stride + 3] = 1;

    textData[stride] = text.x + (random() - 0.5) * 0.035;
    textData[stride + 1] = text.y + (random() - 0.5) * 0.035;
    textData[stride + 2] = text.z + (random() - 0.5) * 0.35;
    textData[stride + 3] = 1;
  }

  return { positionTexture, velocityTexture, targetTexture, textTexture };
}

function createParticleGeometry(cityTargets: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const references = new Float32Array(PARTICLE_COUNT * 2);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);
  const indices = new Float32Array(PARTICLE_COUNT);
  const low = new THREE.Color("#1a3a6a");
  const high = new THREE.Color("#f6b83d");
  const color = new THREE.Color();
  const random = mulberry32(84);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const point = cityTargets[i];
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    references[i * 2] = (i % TEXTURE_SIZE) / (TEXTURE_SIZE - 1);
    references[i * 2 + 1] = Math.floor(i / TEXTURE_SIZE) / (TEXTURE_SIZE - 1);
    color.copy(low).lerp(high, THREE.MathUtils.clamp(point.y / 8.5, 0, 1));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    sizes[i] = 0.05 + random() * 0.1;
    indices[i] = i;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("reference", new THREE.BufferAttribute(references, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("particleSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("particleIndex", new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function createStars() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(STAR_COUNT * 3);
  const seeds = new Float32Array(STAR_COUNT);
  const random = mulberry32(126);

  for (let i = 0; i < STAR_COUNT; i++) {
    const radius = 22 + random() * 28;
    const angle = random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 6 + random() * 20;
    positions[i * 3 + 2] = Math.sin(angle) * radius - 18;
    seeds[i] = random() * 100;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

function createGrid() {
  const grid = new THREE.GridHelper(34, 68, "#4a90d9", "#7b2fbe");
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  grid.position.y = -0.03;
  return grid;
}

function createCursorHalo() {
  const group = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#66d9ff",
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 96), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const coreMaterial = new THREE.MeshBasicMaterial({
    color: "#f6b83d",
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 48), coreMaterial);
  core.rotation.x = -Math.PI / 2;
  group.add(core);

  const light = new THREE.PointLight("#66d9ff", 0, 5.5, 2);
  light.position.y = 1.1;
  group.add(light);
  group.position.set(1000, 0.06, 1000);
  return group;
}

function createShockRings(count: number) {
  return Array.from({ length: count }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: "#f6b83d",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 128), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    ring.visible = false;
    return ring;
  });
}

function createLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight("#6b8cff", 0.22));
  const keyLight = new THREE.DirectionalLight("#9bdcff", 1.2);
  keyLight.position.set(-5, 12, 10);
  scene.add(keyLight);
  const random = mulberry32(168);
  for (let i = 0; i < 36; i++) {
    const light = new THREE.PointLight(random() > 0.38 ? "#f6b83d" : "#62c9ff", 0.35 + random() * 0.9, 5.8, 2);
    light.position.set((random() - 0.5) * 12.8, 1.8 + random() * 11.5, (random() - 0.5) * 8.6);
    scene.add(light);
  }
}

function sampleCity() {
  const geometry = createCityGeometry();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const sampler = new MeshSurfaceSampler(mesh).build();
  const targets: THREE.Vector3[] = [];
  const scratch = new THREE.Vector3();

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    sampler.sample(scratch);
    targets.push(scratch.clone());
  }

  mesh.geometry.dispose();
  return targets;
}

function getWorldMouse(
  event: PointerEvent,
  element: HTMLElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  ground: THREE.Plane,
) {
  const rect = element.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const hit = new THREE.Vector3();
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(ground, hit);
  return new THREE.Vector2(hit.x, hit.z);
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function DataCityLoginBackground({ className = "" }: DataCityLoginBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#040813", 0.044);

    const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 110);
    camera.position.set(0, 7.4, 18.2);
    camera.lookAt(0, 5.2, 0);

    const cityTargets = sampleCity();
    const textTargets = createTextTargets();
    const gpu = new GPUComputationRenderer(TEXTURE_SIZE, TEXTURE_SIZE, renderer);
    const { positionTexture, velocityTexture, targetTexture, textTexture } = fillTextures(gpu, cityTargets, textTargets);

    const positionVariable = gpu.addVariable("texturePosition", positionShader, positionTexture);
    const velocityVariable = gpu.addVariable("textureVelocity", velocityShader, velocityTexture);
    gpu.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
    gpu.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);

    positionVariable.material.uniforms.time = { value: 0 };
    positionVariable.material.uniforms.velocityTexture = { value: null };
    velocityVariable.material.uniforms.time = { value: 0 };
    velocityVariable.material.uniforms.delta = { value: 0 };
    velocityVariable.material.uniforms.mouse = { value: new THREE.Vector2(1000, 1000) };
    velocityVariable.material.uniforms.mouseSpeed = { value: 0 };
    velocityVariable.material.uniforms.mouseActive = { value: 0 };
    velocityVariable.material.uniforms.shockOrigin = { value: new THREE.Vector2(1000, 1000) };
    velocityVariable.material.uniforms.shockTime = { value: -1 };
    velocityVariable.material.uniforms.targetTexture = { value: targetTexture };
    velocityVariable.material.uniforms.textTargetTexture = { value: textTexture };

    const gpuError = gpu.init();
    if (gpuError) {
      console.warn(gpuError);
    }

    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        positionTexture: { value: null },
        time: { value: 0 },
        lodStep: { value: 1 },
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particleGeometry = createParticleGeometry(cityTargets);
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const citySilhouette = createCitySilhouette();
    scene.add(citySilhouette);

    const stars = createStars();
    scene.add(stars);

    const grid = createGrid();
    scene.add(grid);

    const logo = createLogoSprite();
    scene.add(logo);

    const cursorHalo = createCursorHalo();
    scene.add(cursorHalo);

    const shockRings = createShockRings(4);
    shockRings.forEach((ring) => scene.add(ring));

    createLights(scene);

    const clock = new THREE.Clock();
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const mouse = new THREE.Vector2(1000, 1000);
    const lastMouse = new THREE.Vector2(1000, 1000);
    const shockwaves: Shockwave[] = [];
    let mouseActive = 0;
    let hoverStartedAt = 0;
    let animationPaused = false;
    let disposed = false;

    const triggerShockwave = (origin: THREE.Vector2, startedAt: number) => {
      shockwaves.push({ origin: origin.clone(), startedAt });
      if (shockwaves.length > 4) shockwaves.shift();
    };

    const onPointerMove = (event: PointerEvent) => {
      const worldMouse = getWorldMouse(event, container, camera, raycaster, groundPlane);
      lastMouse.copy(mouse);
      mouse.copy(worldMouse);
      mouseActive = 1;
      if (!hoverStartedAt) hoverStartedAt = clock.elapsedTime;
    };

    const onPointerLeave = () => {
      mouse.set(1000, 1000);
      mouseActive = 0;
      hoverStartedAt = 0;
    };

    const onPointerDown = (event: PointerEvent) => {
      triggerShockwave(getWorldMouse(event, container, camera, raycaster, groundPlane), clock.elapsedTime);
    };

    const onResize = () => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const onVisibilityChange = () => {
      animationPaused = document.hidden;
      renderer.setAnimationLoop(animationPaused ? null : animate);
    };

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const animate = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.033);
      const time = clock.elapsedTime;
      const mouseSpeed = mouseActive ? Math.min(mouse.distanceTo(lastMouse) / Math.max(delta, 0.001) / 18, 1.8) : 0;
      lastMouse.lerp(mouse, 0.28);

      if (mouseActive && hoverStartedAt && time - hoverStartedAt > 1) {
        triggerShockwave(mouse, time);
        hoverStartedAt = time + 999;
      }

      let activeShockwave: Shockwave | undefined;
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        if (time - shockwaves[i].startedAt <= 2) {
          activeShockwave = shockwaves[i];
          break;
        }
      }
      positionVariable.material.uniforms.time.value = time;
      positionVariable.material.uniforms.velocityTexture.value = gpu.getCurrentRenderTarget(velocityVariable).texture;
      velocityVariable.material.uniforms.time.value = time;
      velocityVariable.material.uniforms.delta.value = delta;
      velocityVariable.material.uniforms.mouse.value.copy(mouse);
      velocityVariable.material.uniforms.mouseSpeed.value = THREE.MathUtils.clamp(mouseSpeed, 0, 1.8);
      velocityVariable.material.uniforms.mouseActive.value = mouseActive;
      velocityVariable.material.uniforms.shockOrigin.value.copy(activeShockwave?.origin ?? mouse);
      velocityVariable.material.uniforms.shockTime.value = activeShockwave ? time - activeShockwave.startedAt : -1;

      gpu.compute();

      const cameraDistance = camera.position.distanceTo(new THREE.Vector3(0, 3, 0));
      particleMaterial.uniforms.positionTexture.value = gpu.getCurrentRenderTarget(positionVariable).texture;
      particleMaterial.uniforms.time.value = time;
      particleMaterial.uniforms.lodStep.value = cameraDistance > 20 ? 3 : cameraDistance > 15 ? 2 : 1;

      const starMaterial = stars.material as THREE.ShaderMaterial;
      starMaterial.uniforms.time.value = time;

      const gridMaterial = grid.material as THREE.Material & { color: THREE.Color; opacity: number };
      gridMaterial.color.lerpColors(new THREE.Color("#4a90d9"), new THREE.Color("#7b2fbe"), 0.5 + Math.sin(time * 0.7) * 0.5);
      gridMaterial.opacity = 0.3 + Math.sin(time * 1.2) * 0.1;

      cursorHalo.position.set(mouse.x, 0.1, mouse.y);
      cursorHalo.visible = Boolean(mouseActive);
      cursorHalo.scale.setScalar(1.0 + Math.sin(time * 5.5) * 0.08 + mouseSpeed * 0.45);
      cursorHalo.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.MeshBasicMaterial;
          material.opacity = mouseActive ? (index === 0 ? 0.42 : 0.86) : 0;
        }
        if (child instanceof THREE.PointLight) {
          child.intensity = mouseActive ? 2.3 + mouseSpeed * 4.5 : 0;
        }
      });

      shockRings.forEach((ring, index) => {
        const shockwave = shockwaves[shockwaves.length - 1 - index];
        const material = ring.material as THREE.MeshBasicMaterial;
        if (!shockwave) {
          ring.visible = false;
          material.opacity = 0;
          return;
        }
        const age = time - shockwave.startedAt;
        if (age < 0 || age > 2) {
          ring.visible = false;
          material.opacity = 0;
          return;
        }
        ring.visible = true;
        ring.position.x = shockwave.origin.x;
        ring.position.z = shockwave.origin.y;
        ring.scale.setScalar(0.8 + age * 7.2);
        material.opacity = (1 - age / 2) * 0.78;
      });

      const logoPulse = mouseActive ? 1.0 + Math.sin(time * 6.5) * 0.08 : 1.0 + Math.sin(time * 1.4) * 0.025;
      logo.scale.set(4.4 * logoPulse, 1.1 * logoPulse, 1);
      const logoMaterial = logo.material as THREE.SpriteMaterial;
      logoMaterial.opacity = mouseActive ? 1 : 0.82;

      citySilhouette.rotation.y = Math.sin(time * 0.08) * 0.055;

      camera.position.x = Math.sin(time * 0.08) * 0.72 + (mouseActive ? THREE.MathUtils.clamp(mouse.x * 0.035, -0.35, 0.35) : 0);
      camera.position.y = 7.4 + Math.sin(time * 0.11) * 0.28;
      camera.lookAt(0, 5.05, 0);
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      particleGeometry.dispose();
      particleMaterial.dispose();
      (stars.geometry as THREE.BufferGeometry).dispose();
      (stars.material as THREE.Material).dispose();
      (grid.material as THREE.Material).dispose();
      (logo.material as THREE.SpriteMaterial).map?.dispose();
      (logo.material as THREE.Material).dispose();
      citySilhouette.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      cursorHalo.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      shockRings.forEach((ring) => {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-auto absolute inset-0 overflow-hidden bg-[#050814] ${className}`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(246,184,61,0.14),transparent_20%),radial-gradient(circle_at_50%_45%,rgba(74,144,217,0.26),transparent_44%),linear-gradient(180deg,rgba(2,6,18,0.04),rgba(2,6,18,0.86))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:96px_96px] opacity-40" />
    </div>
  );
}
