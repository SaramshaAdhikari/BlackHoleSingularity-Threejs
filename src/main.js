import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BlackHoleRayShader } from './shaders/BlackHoleShader.js';
import { createStarfield } from './components/Starfield.js';

// — Scene globals —
let scene, camera, renderer, composer;
let bloomPass, bhPass, clock, animId;
let starfield;
const isMobile = /Mobi|Android/i.test(navigator.userAgent);

function init() {
  const container = document.getElementById('scene-container');

  scene = new THREE.Scene();

  starfield = createStarfield(isMobile);
  scene.add(starfield);

  // ---------------------------------------------------------------
  // Perfect optics sync:
  // GLSL rd = normalize(uv * basis + 2.0 * ww) → Focal Length 2.0
  // tan(FOV/2) = 0.5/2.0 = 0.25 → FOV = 2 * arctan(0.25) = 28.07248°
  // ---------------------------------------------------------------
  camera = new THREE.PerspectiveCamera(
    28.07248,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0.42, 0.58, 8.176);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  container.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  // — Post-processing pipeline —
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  BlackHoleRayShader.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  BlackHoleRayShader.uniforms.uIsMobile.value = isMobile ? 1.0 : 0.0;

  bhPass = new ShaderPass(BlackHoleRayShader);
  composer.addPass(bhPass);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.18, 0.4, 0.95
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  // — Resize handler —
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(onResize, 200);
  });

  animate();
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer.setSize(w, h);
  composer.setSize(w, h);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  if (bhPass && !isMobile) {
    bhPass.uniforms.uResolution.value.set(w, h);
  }
}

function animate() {
  animId = requestAnimationFrame(animate);
  const time = clock.getElapsedTime() * 0.97; // 3% time dilation

  if (bhPass?.uniforms?.uTime) {
    bhPass.uniforms.uTime.value = time;
  }

  if (starfield) {
    if (starfield.material.uniforms.uTime) {
      starfield.material.uniforms.uTime.value = time;
    }
    starfield.rotation.y = time * -0.005;
    starfield.rotation.z = time * 0.002;
  }

  composer.render();
}

init();
