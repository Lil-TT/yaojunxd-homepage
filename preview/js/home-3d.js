import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SOURCES = ["assets/character.glb", "assets/nanachi.glb"];

async function loadGltf(loader) {
  let lastErr;
  for (const src of SOURCES) {
    try {
      return await loader.loadAsync(src);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("missing character glb");
}

export async function createHero(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x171717, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe8eef6, 0x171717, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(2.2, 3.4, 2.6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8eb7dc, 0.7);
  fill.position.set(-2.4, 1.1, -1.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.45);
  rim.position.set(0, 2.2, -3);
  scene.add(rim);

  const gltf = await loadGltf(new GLTFLoader());
  const model = gltf.scene;
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.forEach((mat) => {
      if (!mat) return;
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.metalness = Math.min(mat.metalness ?? 0, 0.15);
        mat.roughness = Math.max(mat.roughness ?? 0.5, 0.55);
      }
      mat.transparent = false;
    });
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += size.y * 0.02;
  scene.add(model);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 200);
  const cam = {
    dist: maxDim * 1.68,
    y: size.y * 0.18,
    lookY: size.y * 0.16,
    lookX: size.x * 0.22,
    x: maxDim * 0.06,
  };

  const mixer = new THREE.AnimationMixer(model);
  const clip = gltf.animations[0];
  const action = clip ? mixer.clipAction(clip) : null;
  if (action) {
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.paused = true;
    action.play();
  }

  const clock = new THREE.Clock();
  let alive = true;

  const applyCam = () => {
    camera.position.set(cam.x, cam.y, cam.dist);
    camera.lookAt(cam.lookX || 0, cam.lookY, 0);
  };
  applyCam();

  const loop = () => {
    if (!alive) return;
    mixer.update(clock.getDelta());
    applyCam();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  loop();

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  };
  addEventListener("resize", onResize);

  window.__heroMeta = {
    size: { x: size.x, y: size.y, z: size.z },
    maxDim,
    clips: gltf.animations.map((c) => c.name),
  };

  return {
    cam,
    size,
    maxDim,
    play() {
      if (!action) return;
      action.paused = false;
    },
    pause() {
      if (action) action.paused = true;
    },
    hold() {
      if (action) action.paused = true;
    },
    dispose() {
      alive = false;
      removeEventListener("resize", onResize);
      mixer.stopAllAction();
      renderer.dispose();
    },
  };
}
