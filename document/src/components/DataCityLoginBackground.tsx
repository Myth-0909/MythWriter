import { useEffect, useRef } from "react";
import * as THREE from "three";

export type LoginVisualTemplate = "mimo" | "noir" | "paper";
type LoginTheme = "light" | "dark";

interface DataCityLoginBackgroundProps {
  className?: string;
  template?: LoginVisualTemplate;
  theme?: LoginTheme;
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

const palettes: Record<LoginVisualTemplate, Record<LoginTheme, Palette>> = {
  mimo: {
    dark: {
      background: "#050814",
      fog: "#06101e",
      base: "#071326",
      tower: "#15365a",
      glass: "#8fd7ff",
      accent: "#f6b83d",
      secondary: "#5ebdff",
      line: "#d8efff",
    },
    light: {
      background: "#eef5ff",
      fog: "#eef5ff",
      base: "#dce9f7",
      tower: "#b8cfe8",
      glass: "#2f7fbd",
      accent: "#b67818",
      secondary: "#71a7dc",
      line: "#163650",
    },
  },
  noir: {
    dark: {
      background: "#020309",
      fog: "#03040b",
      base: "#050915",
      tower: "#0b1b2e",
      glass: "#7cf4ff",
      accent: "#ffffff",
      secondary: "#245cff",
      line: "#95fbff",
    },
    light: {
      background: "#e9edf4",
      fog: "#edf2f8",
      base: "#d9e1eb",
      tower: "#b7c5d6",
      glass: "#20324b",
      accent: "#0f172a",
      secondary: "#4b6bff",
      line: "#172033",
    },
  },
  paper: {
    dark: {
      background: "#080915",
      fog: "#0a0b17",
      base: "#131927",
      tower: "#263247",
      glass: "#e8d7aa",
      accent: "#d8bd73",
      secondary: "#8ab4f8",
      line: "#f5e6bf",
    },
    light: {
      background: "#f1f4f0",
      fog: "#f1f4f0",
      base: "#dfe6df",
      tower: "#cbd7d1",
      glass: "#806018",
      accent: "#b9954e",
      secondary: "#6f9ac8",
      line: "#2a332d",
    },
  },
};

function createMimoCrystal(palette: Palette) {
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

function createNoirCore(palette: Palette) {
  const group = new THREE.Group();
  const body = new THREE.MeshBasicMaterial({ color: palette.tower, transparent: true, opacity: 0.86 });
  const line = new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending });
  const glass = new THREE.MeshBasicMaterial({ color: palette.glass, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });

  const slabs = [
    [3.8, 0.72, 3.8, 1.0],
    [3.0, 0.72, 3.0, 2.2],
    [2.2, 0.72, 2.2, 3.4],
    [1.4, 4.8, 1.4, 6.0],
  ];
  slabs.forEach(([w, h, d, y], index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), body.clone());
    mesh.position.y = y;
    mesh.rotation.y = index * 0.18;
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), line);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    group.add(edges);
  });

  for (let i = 0; i < 9; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 5.4, 2.8), glass.clone());
    blade.position.y = 4.8;
    blade.rotation.y = (i / 9) * Math.PI;
    group.add(blade);
  }

  return group;
}

function createPaperCity(palette: Palette) {
  const group = new THREE.Group();
  const paper = new THREE.MeshBasicMaterial({ color: palette.tower, transparent: true, opacity: 0.74 });
  const ink = new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.36 });
  const accent = new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.28, depthWrite: false });

  for (let i = 0; i < 7; i++) {
    const w = 5.6 - i * 0.46;
    const d = 3.2 - i * 0.22;
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), paper.clone());
    sheet.position.set((i - 3) * 0.18, 1.0 + i * 0.72, (i - 3) * -0.12);
    sheet.rotation.y = (i - 3) * 0.08;
    sheet.rotation.z = (i - 3) * 0.018;
    group.add(sheet);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(sheet.geometry), ink);
    edges.position.copy(sheet.position);
    edges.rotation.copy(sheet.rotation);
    group.add(edges);
  }

  for (let i = 0; i < 11; i++) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6 + (i % 4) * 0.54, 0.16), accent.clone());
    column.position.set((i - 5) * 0.42, 3.1 + (i % 4) * 0.24, -0.7 + (i % 3) * 0.58);
    group.add(column);
  }
  return group;
}

function createExhibit(template: LoginVisualTemplate, palette: Palette) {
  if (template === "noir") return createNoirCore(palette);
  if (template === "paper") return createPaperCity(palette);
  return createMimoCrystal(palette);
}

function createGround(template: LoginVisualTemplate, palette: Palette) {
  const group = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: palette.secondary,
    transparent: true,
    opacity: template === "paper" ? 0.16 : 0.25,
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

function createStars(palette: Palette, template: LoginVisualTemplate) {
  const count = template === "paper" ? 260 : 520;
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
      size: template === "paper" ? 0.018 : 0.026,
      transparent: true,
      opacity: template === "paper" ? 0.22 : 0.42,
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

export function DataCityLoginBackground({ className = "", template = "mimo", theme = "dark" }: DataCityLoginBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const palette = palettes[template][theme];

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
    camera.position.set(0, template === "paper" ? 6.2 : 6.8, template === "noir" ? 18.5 : 16.5);
    camera.lookAt(0, 4.2, 0);

    const exhibit = createExhibit(template, palette);
    exhibit.position.set(template === "paper" ? 4.8 : 4.2, template === "paper" ? 0.1 : -0.4, template === "noir" ? -2.4 : -1.8);
    scene.add(exhibit);

    const ground = createGround(template, palette);
    ground.position.set(template === "paper" ? 4.8 : 4.2, -0.35, template === "noir" ? -2.4 : -1.8);
    scene.add(ground);

    const stars = createStars(palette, template);
    scene.add(stars);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(2.8, 3.0, 128),
      new THREE.MeshBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    halo.position.set(template === "paper" ? 4.8 : 4.2, template === "paper" ? 4.8 : 7.4, template === "noir" ? -2.4 : -1.8);
    halo.rotation.x = Math.PI / 2;
    scene.add(halo);

    const clock = new THREE.Clock();
    const pointer = new THREE.Vector2(0, 0);
    let disposed = false;

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
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
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const animate = () => {
      if (disposed) return;
      const time = clock.elapsedTime;
      exhibit.rotation.y = time * (template === "paper" ? 0.045 : template === "noir" ? 0.12 : 0.08) + pointer.x * 0.16;
      exhibit.rotation.x = pointer.y * 0.035;
      ground.rotation.y = -time * 0.055;
      halo.rotation.z = time * 0.18;
      halo.scale.setScalar(1 + Math.sin(time * 1.3) * 0.035);
      camera.position.x = pointer.x * 0.55;
      camera.position.y += ((template === "paper" ? 6.2 : 6.8) + pointer.y * 0.28 - camera.position.y) * 0.04;
      camera.lookAt(2.7 + pointer.x * 0.3, 4.1 - pointer.y * 0.18, -1.8);
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      container.removeEventListener("pointermove", onPointerMove);
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
  }, [template, theme, palette]);

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
