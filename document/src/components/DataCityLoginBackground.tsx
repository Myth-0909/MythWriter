import { useEffect, useRef } from "react";
import * as THREE from "three";

type LoginTheme = "light" | "dark";

interface DataCityLoginBackgroundProps {
  className?: string;
  theme?: LoginTheme;
  stageSide?: "left" | "right";
}

type Palette = {
  background: string;
  fog: string;
  base: string;
  tower: string;
  glass: string;
  accent: string;
  secondary: string;
  line: string;
};

const palettes: Record<LoginTheme, Palette> = {
  dark: {
    background: "#030713",
    fog: "#06101f",
    base: "#071326",
    tower: "#12365e",
    glass: "#8fd7ff",
    accent: "#f6b83d",
    secondary: "#5ebdff",
    line: "#e9f7ff",
  },
  light: {
    background: "#f7fbff",
    fog: "#eaf3fb",
    base: "#ddeaf7",
    tower: "#9ebbd8",
    glass: "#1f6ea6",
    accent: "#b46c08",
    secondary: "#2e7fc3",
    line: "#10283d",
  },
};

function createCrystalSkyline(palette: Palette) {
  const group = new THREE.Group();
  const body = new THREE.MeshBasicMaterial({ color: palette.tower, transparent: true, opacity: 0.76 });
  const glass = new THREE.MeshBasicMaterial({
    color: palette.glass,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending });
  const random = mulberry32(77);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(3.0, 0), glass);
  core.position.set(0, 6.7, 0);
  core.rotation.set(0.6, 0.2, 0.75);
  group.add(core);

  for (let i = 0; i < 13; i++) {
    const angle = (i / 13) * Math.PI * 2;
    const h = 2.0 + random() * 4.8;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.42 + random() * 0.45, h, 0.42 + random() * 0.45), body.clone());
    tower.position.set(Math.cos(angle) * (2.4 + random() * 2.2), h / 2, Math.sin(angle) * (2.0 + random() * 2.0));
    tower.rotation.y = -angle + 0.25;
    group.add(tower);
  }

  const orbitPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    orbitPoints.push(new THREE.Vector3(Math.cos(a) * 5.3, 5.9 + Math.sin(a * 3) * 0.25, Math.sin(a) * 3.2));
  }
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPoints), line));
  return group;
}

function createGround(palette: Palette) {
  const group = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: palette.secondary,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6 + i * 1.55, 1.62 + i * 1.55, 128), ringMaterial.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03 + i * 0.002;
    group.add(ring);
  }

  const spokes: number[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    spokes.push(0, 0.02, 0, Math.cos(a) * 9, 0.02, Math.sin(a) * 9);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(spokes, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.12 })));
  return group;
}

function createPointerFocus(palette: Palette) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.5, 96),
    new THREE.MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const sweep = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 0.12),
    new THREE.MeshBasicMaterial({
      color: palette.line,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  sweep.position.y = 3.8;
  group.add(sweep);
  return group;
}

function createStars(palette: Palette) {
  const count = 520;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const random = mulberry32(202);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 38;
    positions[i * 3 + 1] = 3 + random() * 16;
    positions[i * 3 + 2] = -10 - random() * 18;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: palette.line,
      size: 0.026,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function DataCityLoginBackground({ className = "", theme = "dark", stageSide = "left" }: DataCityLoginBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const palette = palettes[theme];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(palette.fog, theme === "light" ? 0.03 : 0.045);

    const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 80);
    camera.position.set(0, 6.8, 16.5);
    camera.lookAt(0, 4.2, 0);
    const side = stageSide === "left" ? -1 : 1;
    const stageX = 4.2 * side;
    const stageZ = -1.8;

    const exhibit = createCrystalSkyline(palette);
    exhibit.position.set(stageX, -0.4, stageZ);
    scene.add(exhibit);

    const ground = createGround(palette);
    ground.position.set(stageX, -0.35, stageZ);
    scene.add(ground);

    const stars = createStars(palette);
    scene.add(stars);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(2.8, 3.0, 128),
      new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    halo.position.set(stageX, 7.4, stageZ);
    halo.rotation.x = Math.PI / 2;
    scene.add(halo);

    const pointerFocus = createPointerFocus(palette);
    pointerFocus.position.set(stageX, 0.04, stageZ);
    scene.add(pointerFocus);

    const clock = new THREE.Clock();
    const pointer = new THREE.Vector2(0, 0);
    const pointerTarget = new THREE.Vector2(0, 0);
    let pointerActive = 0;
    let disposed = false;

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointerTarget.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerTarget.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      pointerActive = 1;
    };

    const onPointerLeave = () => {
      pointerActive = 0;
      pointerTarget.set(0, 0);
    };

    const onResize = () => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const onVisibilityChange = () => {
      renderer.setAnimationLoop(document.hidden ? null : animate);
    };

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const animate = () => {
      if (disposed) return;
      const time = clock.elapsedTime;
      pointer.lerp(pointerTarget, 0.12);
      exhibit.rotation.y = time * 0.08 + pointer.x * 0.16;
      exhibit.rotation.x = pointer.y * 0.085;
      exhibit.position.y = -0.4 + Math.sin(time * 1.2) * 0.035 + pointerActive * 0.16;
      ground.rotation.y = -time * 0.055;
      halo.rotation.z = time * 0.18;
      halo.scale.setScalar(1 + Math.sin(time * 1.3) * 0.035 + pointerActive * 0.12);
      const haloMaterial = halo.material as THREE.MeshBasicMaterial;
      haloMaterial.opacity = 0.22 + pointerActive * 0.22;

      pointerFocus.position.x = stageX + pointer.x * 2.2;
      pointerFocus.position.z = stageZ - pointer.y * 1.4;
      pointerFocus.scale.setScalar(1 + pointerActive * 1.35);
      pointerFocus.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.MeshBasicMaterial;
          material.opacity = pointerActive ? (index === 0 ? 0.46 : 0.34) : 0;
          child.rotation.z = index === 0 ? time * 0.9 : -pointer.x * 0.5;
        }
      });

      camera.position.x = pointer.x * 0.9 + side * 0.2;
      camera.position.y += (6.8 + pointer.y * 0.42 - camera.position.y) * 0.06;
      camera.lookAt(stageX * 0.62 + pointer.x * 0.55, 4.1 - pointer.y * 0.32, stageZ);
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [theme, stageSide, palette]);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-auto absolute inset-0 overflow-hidden ${className}`}
      style={{ backgroundColor: palette.background }}
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            theme === "light"
              ? `radial-gradient(circle at 72% 25%, ${palette.accent}33, transparent 22%), radial-gradient(circle at 63% 55%, ${palette.secondary}30, transparent 38%), linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.58))`
              : `radial-gradient(circle at 72% 25%, ${palette.accent}26, transparent 22%), radial-gradient(circle at 63% 55%, ${palette.secondary}36, transparent 38%), linear-gradient(180deg, rgba(2,6,18,0.02), rgba(2,6,18,0.74))`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:112px_112px] opacity-35" />
    </div>
  );
}
