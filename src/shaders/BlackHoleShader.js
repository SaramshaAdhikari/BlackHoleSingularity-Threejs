import * as THREE from 'three';

export const BlackHoleRayShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uIsMobile: { value: 0.0 },
        uMassMultiplier: { value: 1.0 },
        uHorizonBias: { value: 0.0 },
        uMaxSteps: { value: 200.0 },
        uCameraZ: { value: 8.176 }
    },
    vertexShader: `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
    fragmentShader: `
    varying vec2 vUv;

    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uIsMobile;
    uniform float uMassMultiplier;
    uniform float uHorizonBias;
    uniform float uMaxSteps;
    uniform float uCameraZ;
    uniform sampler2D tDiffuse;

    #define PI 3.14159265359

    // ------------------------------------------------------------
    // HASH / NOISE
    // ------------------------------------------------------------
    float hash(vec2 p){
        return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
    }

    float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0,0.0));
        float c = hash(i + vec2(0.0,1.0));
        float d = hash(i + vec2(1.0,1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a,b,u.x) +
               (c-a)*u.y*(1.0-u.x) +
               (d-b)*u.x*u.y;
    }

    float fbm(vec2 p){
        float v = 0.0;
        float a = 0.5;
        for(int i=0;i<4;i++){
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
        }
        return v;
    }

    // ------------------------------------------------------------
    // MITCHELL CHARITY BLACKBODY (FAST APPROX)
    // ------------------------------------------------------------
    vec3 blackbody(float T){
        T = clamp(T,1000.0,40000.0)/100.0;
        float r,g,b;

        if(T<=66.0){
            r=1.0;
            g=clamp(0.3900815787*log(T)-0.6318414437,0.0,1.0);
        } else {
            r=clamp(1.292936186*pow(T-60.0,-0.1332047592),0.0,1.0);
            g=clamp(1.129890861*pow(T-60.0,-0.0755148492),0.0,1.0);
        }

        if(T>=66.0) b=1.0;
        else if(T<=19.0) b=0.0;
        else b=clamp(0.5432067891*log(T-10.0)-1.19625408914,0.0,1.0);

        return vec3(r,g,b);
    }

    // ------------------------------------------------------------
    // 3D VALUE NOISE for anisotropic disk turbulence
    // ------------------------------------------------------------
    float hash3(vec3 p){
        p = fract(p * vec3(127.1, 311.7, 74.7));
        p += dot(p, p.yxz + 19.19);
        return fract((p.x + p.y) * p.z);
    }
    float noise3(vec3 p){
        vec3 i = floor(p); vec3 f = fract(p);
        vec3 u = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),u.x),
                       mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),u.x),u.y),
                   mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),u.x),
                       mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),u.x),u.y),u.z);
    }
    float fbm3(vec3 p){
        float v=0.0,a=0.5;
        for(int i=0;i<4;i++){v+=a*noise3(p);p*=2.0;a*=0.5;}
        return v;
    }

    void main() {
        vec2 uv = (vUv - 0.5) * vec2(uResolution.x/uResolution.y, 1.0);

        // ----------------------------------------------------------------
        // CAMERA (Pulled back to reduce BH apparent size by ~15%)
        // ----------------------------------------------------------------
         vec3 ro = vec3(0.42, 0.58, uCameraZ);
        vec3 ta = vec3(0.0, 0.0, 0.0);

        vec3 ww = normalize(ta - ro);
        vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
        vec3 vv = normalize(cross(uu, ww));

        // rd built with focal length 2.0 (matches 28.07 deg ThreeJS camera)
        vec3 rd = normalize(uv.x * uu + uv.y * vv + 2.0 * ww);

        // Metric Instability Escalation: all geometry scales with mass
        float baseMass         = 0.88;
        float mass             = baseMass * uMassMultiplier;
        float baseEventHorizon = 0.52;
        float eventHorizon     = baseEventHorizon * uMassMultiplier;
        float photonSphere     = eventHorizon * 1.5;
        float diskInner    = 0.60;
        float diskOuter    = 3.2;
        float diskThickness= 0.035;
        float softening    = 0.02;

        // Dynamic precision: step size shrinks when uMaxSteps > 200 and near horizon
        float baseStepSize = 0.08;
        float crossingProxy = 1.0 - smoothstep(0.8, 3.0, uCameraZ);
        float stepSize     = baseStepSize * (200.0 / uMaxSteps) * mix(1.0, 0.6, crossingProxy);

        // Mobile cap still applies as base
        float effectiveMaxSteps = (uIsMobile > 0.5) ? min(uMaxSteps, 120.0) : uMaxSteps;

        float cycleLength = 30.0;
        float t1          = mod(uTime, cycleLength);
        float t2          = mod(uTime + cycleLength * 0.5, cycleLength);
        float blendFactor = abs(1.0 - 2.0 * (t1 / cycleLength));

        vec3 pos  = ro;
        vec3 vel  = rd;

        float dither = fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453) * stepSize;
        pos += vel * (dither * 0.5);

        vec3  accumulatedColor = vec3(0.0);
        float opacity          = 0.0;
        float minR             = 100.0;

        for(int i = 0; i < 240; i++) {
            if(float(i) >= effectiveMaxSteps) break;

            float r = length(pos);
            minR = min(minR, r);

            if(r < eventHorizon - 0.05) break;
            if(r > 40.0) break;

            vec3 prevPos = pos;

            float denom = pow(r * r + softening, 1.5);
            vec3 accel = -mass * pos / denom;
            
            vel += accel * stepSize;
            pos += vel * stepSize;

            // ----------------------------------------------------------------
            // VOLUMETRIC DISK SAMPLING VIA PLANE-CROSSING
            // ----------------------------------------------------------------
            if(prevPos.y * pos.y <= 0.0 && opacity < 0.98) {
                float denomY = pos.y - prevPos.y;
                float tCross = (abs(denomY) > 1e-6) ? (-prevPos.y / denomY) : 0.5;
                vec3 hitPos = mix(prevPos, pos, tCross);

                float rHit = length(hitPos.xz);
                if(rHit > diskInner && rHit < diskOuter) {
                    float t = (rHit - diskInner)/(diskOuter-diskInner);
                    float physAngle = atan(hitPos.z, hitPos.x);
                    float texAngle = physAngle + uTime * 0.05;

                    float turbScale   = 16.0;
                    float turbStretch = 5.0;
                    float omega       = 1.0 / pow(max(rHit, 0.001), 1.5);
                    float rotAngle1   = texAngle + omega * t1;
                    float rotAngle2   = texAngle + omega * t2;

                    vec3 nc1 = vec3(rHit * turbScale,
                                    (cos(rotAngle1) * rHit * turbScale) / turbStretch,
                                    (sin(rotAngle1) * rHit * turbScale) / turbStretch);
                    vec3 nc2 = vec3(rHit * turbScale,
                                    (cos(rotAngle2) * rHit * turbScale) / turbStretch,
                                    (sin(rotAngle2) * rHit * turbScale) / turbStretch);

                    float turb = mix(fbm3(nc2), fbm3(nc1), blendFactor);
                    turb = clamp(pow(turb * 1.5, 1.5), 0.0, 1.0);

                    float rings        = turb;
                    float radialDensity= exp(-2.2 * t);
                    float innerEdge    = smoothstep(0.0, 0.04, t);
                    float outerEdge    = 1.0 - smoothstep(0.9, 1.0, t);
                    float density      = rings * radialDensity * innerEdge * outerEdge;

                    float incidence = max(abs(normalize(vel).y), 0.02);
                    float pathLength = diskThickness / incidence;

                    float beta     = clamp(0.45 / sqrt(rHit / diskInner), 0.0, 0.97);
                    float gamma_   = 1.0 / sqrt(1.0 - beta * beta);
                    vec3 velDir    = vec3(-sin(physAngle), 0.0, cos(physAngle));
                    float cosTheta = dot(velDir, rd);
                    float D        = 1.0 / (gamma_ * (1.0 - beta * cosTheta));

                    float normR = (rHit - diskInner) / (diskOuter - diskInner);
                    float innerZone = smoothstep(0.0, 0.15, normR);
                    float baseTempK = mix(6000.0, 3200.0, innerZone);
                    baseTempK = mix(baseTempK, 1500.0, smoothstep(0.1, 0.9, normR));
                    float tempK = baseTempK * D;
                    vec3 col = blackbody(tempK);

                    col *= 1.0 + 1.5 * exp(-normR * 12.0);
                    col *= clamp(pow(D, 3.5), 0.05, 5.0);

                    float optical = clamp(density * pathLength * 12.0, 0.0, 1.0);
                    accumulatedColor += col * optical * 1.5 * (1.0 - opacity);
                    opacity += optical * (1.0 - opacity);
                }
            }
        }

        // ----------------------------------------------------------------
        // STARFIELD BACKGROUND — Lensed Fetch with Edge Fade
        // ----------------------------------------------------------------
        float fwd = dot(vel, ww);
        float aspect = uResolution.x / uResolution.y;
        vec2 bgUV;
        vec3 background = vec3(0.0);

        if(fwd > 0.01) {
            float invFwd = 2.0 / fwd;
            bgUV.x = dot(vel, uu) * invFwd / (2.0 * aspect) + 0.5;
            bgUV.y = dot(vel, vv) * invFwd / 2.0 + 0.5;

            float edgeDamp = smoothstep(0.0, 0.05, bgUV.x) * (1.0 - smoothstep(0.95, 1.0, bgUV.x)) *
                             smoothstep(0.0, 0.08, bgUV.y) * (1.0 - smoothstep(0.92, 1.0, bgUV.y));
            background = texture2D(tDiffuse, clamp(bgUV, 0.0, 1.0)).rgb * edgeDamp;
        }

        vec3 finalColor = accumulatedColor + background * (1.0 - opacity);

        // ----------------------------------------------------------------
        // PHOTON RING & LENSING WARP
        // ----------------------------------------------------------------
        float rEnd = length(pos);
        float dPhoton = abs(rEnd - photonSphere);

        float coreRing = exp(-220.0 * dPhoton);
        vec3 coreColor = vec3(1.0, 0.75, 0.45) * coreRing * 0.9;

        float haloRing = exp(-35.0 * dPhoton);
        vec3 haloColor = vec3(0.9, 0.95, 1.0) * haloRing * 0.35;

        finalColor += coreColor + haloColor;

        float shadow  = smoothstep(eventHorizon + 0.03 + uHorizonBias, eventHorizon - 0.02, minR);
        finalColor    = mix(finalColor, vec3(0.0), shadow);

        float edgeSoft= smoothstep(eventHorizon, eventHorizon - 0.02, minR);
        finalColor    = mix(finalColor, vec3(0.0), edgeSoft);

        gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};
