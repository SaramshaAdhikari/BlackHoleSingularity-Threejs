import * as THREE from 'three';

export function createStarfield(isMobile) {
    const starCount = isMobile ? 60000 : 200000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starPhase = new Float32Array(starCount);
    const starSize = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
        let u = Math.random();
        let v = Math.random();
        let theta = u * 2.0 * Math.PI;
        let phi = Math.acos(2.0 * v - 1.0);

        let r;
        let baseSize;
        if (Math.random() > 0.6) {
            // Foreground (~40% of stars)
            r = 30 + Math.random() * 20;
            baseSize = 1.0 + Math.random() * 0.8;
        } else {
            // Background (~60% of stars)
            r = 80 + Math.random() * 40;
            baseSize = 0.4 + Math.random() * 0.5;
        }

        starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        starPos[i * 3 + 2] = r * Math.cos(phi);

        starPhase[i] = Math.random() * Math.PI * 2;
        starSize[i]  = baseSize;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('phase',    new THREE.BufferAttribute(starPhase, 1));
    starGeo.setAttribute('sizeMult', new THREE.BufferAttribute(starSize, 1));

    const starMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime:           { value: 0 },
            uIsMobile:       { value: isMobile ? 1.0 : 0.0 },
            uOpacityFallback:{ value: 1.0 }
        },
        vertexShader: `
      uniform float uTime;
      uniform float uIsMobile;
      attribute float phase;
      attribute float sizeMult;
      varying float vAlpha;
      varying float vWarm;
      void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float amp = uIsMobile > 0.5 ? 0.15 : 0.25;
          float twinkle = 1.0 + amp * (sin(uTime * 1.425 + phase) * cos(uTime * 0.76 + phase * 1.5));
          float sz = (28.0 / -mvPosition.z) * twinkle * sizeMult;
          gl_PointSize = clamp(sz, 0.5, 4.0);
          vAlpha = 1.0;
          vWarm = step(3.14159, phase);
      }
    `,
        fragmentShader: `
      uniform float uOpacityFallback;
      varying float vAlpha;
      varying float vWarm;
      void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float brightness = exp(-dist * dist * 12.0) + 0.3 * exp(-dist * dist * 40.0);
          vec3 col = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.93, 0.78), vWarm);
          gl_FragColor = vec4(col * brightness * 1.5, 1.0) * vAlpha * uOpacityFallback;
      }
    `,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        transparent: true
    });

    return new THREE.Points(starGeo, starMat);
}
