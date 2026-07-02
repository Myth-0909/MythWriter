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
    float mouseField = smoothstep(3.0, 0.0, mouseDistance) * mouseActive;
    float textMix = clamp(mouseField * (0.35 + mouseSpeed * 0.65), 0.0, 1.0);
    vec3 target = mix(cityTarget, textTarget, textMix);

    vec3 spring = (target - position) * (0.016 + textMix * 0.028);
    velocity += spring;
    velocity.y -= 0.0009;
    velocity *= 0.928;

    if (shockTime >= 0.0 && shockTime <= 2.0) {
      float radius = shockTime * 5.7;
      float wave = smoothstep(0.7, 0.0, abs(mouseDistance - radius));
      vec2 away2 = normalize(position.xz - shockOrigin + vec2(0.001));
      vec3 away = vec3(away2.x, 0.34, away2.y);
      velocity += away * wave * (1.0 - shockTime / 2.0) * 0.19;
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

function createCityGeometry() {
  const geometries: THREE.BufferGeometry[] = [];
  const random = mulberry32(18);

  for (let x = -5; x <= 5; x++) {
    for (let z = -4; z <= 4; z++) {
      const distance = Math.hypot(x * 0.78, z * 0.9);
      const height = Math.max(0.8, 5.8 - distance * 0.72 + random() * 2.0);
      const width = 0.45 + random() * 0.42;
      const depth = 0.45 + random() * 0.42;
      const geometry = new THREE.BoxGeometry(width, height, depth, 3, 10, 3);
      geometry.translate(x * 0.86 + (random() - 0.5) * 0.15, height / 2, z * 0.86 + (random() - 0.5) * 0.15);
      geometries.push(geometry);
    }
  }

  const spire = new THREE.CylinderGeometry(0.34, 0.7, 8.2, 8, 14);
  spire.translate(0, 4.1, 0);
  geometries.push(spire);

  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
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
  const grid = new THREE.GridHelper(24, 48, "#4a90d9", "#7b2fbe");
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = -0.03;
  return grid;
}

function createLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight("#6b8cff", 0.38));
  const random = mulberry32(168);
  for (let i = 0; i < 18; i++) {
    const light = new THREE.PointLight("#f6b83d", 0.55 + random() * 0.8, 4.5, 2);
    light.position.set((random() - 0.5) * 8.8, 2.2 + random() * 5.8, (random() - 0.5) * 7.2);
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
    scene.fog = new THREE.FogExp2("#070b16", 0.035);

    const camera = new THREE.PerspectiveCamera(44, container.clientWidth / container.clientHeight, 0.1, 90);
    camera.position.set(0, 6.3, 15.4);
    camera.lookAt(0, 3.4, 0);

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

    const stars = createStars();
    scene.add(stars);

    const grid = createGrid();
    scene.add(grid);

    const logo = createLogoSprite();
    scene.add(logo);

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
      gridMaterial.opacity = 0.22 + Math.sin(time * 1.2) * 0.08;

      const logoPulse = mouseActive ? 1.0 + Math.sin(time * 6.5) * 0.08 : 1.0 + Math.sin(time * 1.4) * 0.025;
      logo.scale.set(3.8 * logoPulse, 0.95 * logoPulse, 1);
      const logoMaterial = logo.material as THREE.SpriteMaterial;
      logoMaterial.opacity = mouseActive ? 0.95 : 0.72;

      camera.position.x = Math.sin(time * 0.08) * 0.55;
      camera.lookAt(0, 3.4, 0);
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(74,144,217,0.18),transparent_42%),linear-gradient(180deg,rgba(5,8,20,0.12),rgba(5,8,20,0.72))]" />
    </div>
  );
}
