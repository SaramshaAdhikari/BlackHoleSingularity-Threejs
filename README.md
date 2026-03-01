# Black Hole Singularity — Three.js

A real-time rendering of a black hole accretion disk and gravitational lensing built with Three.js and WebGL (GLSL).

When searching for Three.js black holes, you may find complex academic models using rigorous General Relativity (GR) mathematics. This project takes a different approach: **Physically-Inspired Approximations for Real-Time Performance**. By distilling complex physics down to optimized heuristic models, this black hole runs smoothly at 60fps on modern web browsers and mobile devices while still looking convincingly cinematic.

---

## The Mathematics and Physics Under the Hood

### 1. Spacetime & Gravitational Lensing (The Raymarcher)

Instead of solving the rigorous orbital geodesic equations (e.g., Runge-Kutta 4 integration of the Schwarzschild metric), this shader uses a much faster explicit Euler integration step with a modified Newtonian gravity model:

$$\vec{a} = \frac{-M \cdot \vec{r}}{(|\vec{r}|^2 + \epsilon)^{1.5}}$$

- **M** (Mass): The simulated black hole mass (`0.88 × uMassMultiplier`).
- **ε** (Softening): A softening parameter (`0.02`) that prevents division-by-zero precision errors near the singularity.

**Algorithm:** Rays are cast from the camera. At each step, a new acceleration vector is computed based on distance from the singularity, bending the ray's velocity vector $\vec{v}$. This creates beautifully curved paths that simulate warped spacetime.

**Event Horizon & Photon Sphere:**
- The **Event Horizon** is a hard cutoff ($r \approx 0.52$). Rays that fall within this radius are trapped, returning pure black.
- A subtle glowing ring represents the **Photon Sphere** ($r = 1.5 \, r_s$), highlighting where light is trapped in unstable circular orbits.

---

### 2. The Accretion Disk (Plane-Crossing Intersections)

Traditional volumetric raymarching is very expensive. Because the accretion disk is extremely thin, taking tiny steps to sample it would plummet the framerate. Instead, we use a **Plane-Crossing heuristic**:

The ray is checked at every step: `if (prevPos.y * pos.y <= 0.0)`. If the Y-coordinate flipped signs, the ray just pierced the equatorial plane of the black hole.

We linearly interpolate the exact intersection point and do all disk calculations at that instant, allowing us to take large, fast steps through the empty space above and below the disk.

---

### 3. Disk Shearing and Turbulence

The gas inside the disk looks turbulent and fibrous.

- **Anisotropic 3D Noise:** The turbulence relies on 3D Value Noise (`fbm3`) stretched along the azimuthal angle.
- **Keplerian Shear:** The noise frequency rotates continuously, but the speed of rotation decreases with radius ($\omega \propto r^{-1.5}$), naturally recreating the intense orbital shearing that tears gas apart as it spirals inward.
- **Blackbody Temperature Mapping:** The inner edge of the disk is intensely hot (~6000 K), cooling down towards the outer edge (~1500 K). These temperatures are mapped to RGB using a fast Mitchell-Charity blackbody approximation formula.

---

### 4. Relativistic Doppler Beaming

One side of a black hole always appears brighter than the other. This isn't lighting — it's relativity. Gas racing towards the observer gets brighter (blueshifted), while receding gas gets dimmer (redshifted).

The shader calculates a relativistic velocity $\beta = v/c$, then the Lorentz factor:

$$\gamma = \frac{1}{\sqrt{1 - \beta^2}}$$

A Doppler shift parameter is computed:

$$D = \frac{1}{\gamma (1 - \beta \cos\theta)}$$

$D$ is raised to the **3.5th power**, aggressively amplifying the light from the approaching side and crushing the receding side.

---

### 5. Asymmetric Optical Depth

Rays that hit the disk face-on pass through very little material. Rays that skim the disk (grazing incidence) pass through vast amounts of gas.

The shader multiplies optical density by `diskThickness / incidence` (where `incidence = abs(normalize(v).y)`). This gives the disk a heavy, dense volume despite being mathematically flattened to a 2D plane.

---

### 6. Lensed Star Background

To make the distortion visible, a Three.js `THREE.Points` starfield (200,000 stars on desktop) is generated on a separate layer.

Rays that escape the black hole and fly off to infinity carry a final, heavily bent velocity vector `vel`. The shader projects this 3D vector back into 2D UV space and fetches the starfield pixel from the background texture (`tDiffuse`). This naturally stretches and wraps the background over the black hole's warped geometry, completing the cinematic look.

---

## Installation

```bash
# Clone the repository
git clone https://github.com/SaramshaAdhikari/BlackHoleSingularity-Threejs.git
cd BlackHoleSingularity-Threejs

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open the provided `localhost` URL in your browser — you will be greeted with the real-time raymarched black hole.

## Build & Deploy

```bash
# Production build
npm run build

# Deploy to GitHub Pages
npm run deploy
```

---

**Live demo:** [saramshaadhikari.github.io/BlackHoleSingularity-Threejs](https://saramshaadhikari.github.io/BlackHoleSingularity-Threejs/)
