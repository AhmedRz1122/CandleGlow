// script.js
import * as THREE from 'three';

// Initialize scene, camera, renderer
const scene = new THREE.Scene();
scene.background = null; // Transparent background

// Use perspective camera for better 3D effect
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);
camera.lookAt(0, 1.1, 0); // Adjusted lookAt to focus on higher flame position

const renderer = new THREE.WebGLRenderer({ alpha: true }); // alpha: true for transparent background
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Create flame geometry with more segments for smoother displacement
// The geometry is a teardrop-like shape for the flame
const geometry = new THREE.SphereGeometry(0.35, 64, 64);
// Stretch the sphere to create a flame-like shape
const positions = geometry.attributes.position.array;
for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i+1];
    // Stretch vertically and taper at the top
    let scaleY = 1 + y * 1.5;
    let scaleX = 1 - Math.abs(y) * 0.5;
    positions[i] *= scaleX;
    positions[i+1] *= scaleY;
    positions[i+2] *= scaleX;
}
geometry.computeVertexNormals();

// Create gradient texture for the flame
const createFlameTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Create radial gradient
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvas.width / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');   // Core - white/yellow
    gradient.addColorStop(0.2, 'rgba(255, 200, 50, 1)');  // Inner - bright yellow
    gradient.addColorStop(0.4, 'rgba(255, 100, 0, 0.9)'); // Middle - orange
    gradient.addColorStop(0.6, 'rgba(255, 50, 0, 0.7)');  // Outer - red/orange
    gradient.addColorStop(0.8, 'rgba(255, 0, 0, 0.4)');   // Edge - red
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');       // Fully transparent
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    return new THREE.CanvasTexture(canvas);
};

// Create shader material based on the tutorial's displacement technique
const flameMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        uMousePosition: { value: new THREE.Vector2(0.5, 0.5) },
        uFlameTexture: { value: createFlameTexture() },
        uIntensity: { value: 0 }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        uniform float uTime;
        uniform vec2 uMousePosition;
        uniform float uIntensity;
        
        // Easing function from the tutorial
        float easeInOutCubic(float x) {
            return x < 0.5 ? 4. * x * x * x : 1. - pow(-2. * x + 2., 3.) / 2.;
        }
        
        // Map function for value remapping
        float map(float value, float min1, float max1, float min2, float max2) {
            return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
        }
        
        void main() {
            vUv = uv;
            
            vec3 newPosition = position;
            
            // Create natural flicker based on sine waves
            float flicker1 = sin(uTime * 15.0) * 0.02;
            float flicker2 = sin(uTime * 23.7) * 0.015;
            float flicker3 = sin(uTime * 31.2) * 0.01;
            float totalFlicker = flicker1 + flicker2 + flicker3;
            
            // Apply displacement based on Y position (more displacement at top)
            float yNorm = (position.y + 0.8) / 1.6; // Normalize Y position
            float displacementAmount = totalFlicker * (1.0 - yNorm * 0.5);
            
            // Mouse interaction - similar to the tutorial's raycaster approach
            // Convert world position to UV-like coordinates for mouse distance calculation
            vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            float mouseDistance = distance(worldPos.xy, vec3(uMousePosition, 0.0).xy);
            float mouseRadius = 1.5;
            
            if (mouseDistance < mouseRadius && uIntensity > 0.0) {
                // Apply displacement based on mouse distance (like the text effect)
                float distanceMapped = map(mouseDistance, 0.0, mouseRadius, 1.0, 0.0);
                float mouseVal = easeInOutCubic(distanceMapped) * uIntensity * 0.15;
                // Push flame away from mouse
                newPosition.x += (newPosition.x - uMousePosition.x) * mouseVal;
                newPosition.z += (newPosition.z - 0.0) * mouseVal;
            }
            
            // Add the natural flicker displacement
            newPosition.x += displacementAmount * 0.5;
            newPosition.z += displacementAmount * 0.3;
            newPosition.y += abs(displacementAmount) * 0.2;
            
            // Scale the flame slightly based on flicker
            float scale = 1.0 + totalFlicker * 0.1;
            newPosition *= scale;
            
            vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
            vPosition = mvPosition.xyz;
            gl_PointSize = 1.0;
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform sampler2D uFlameTexture;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
            // Sample the flame gradient texture
            vec4 flameColor = texture2D(uFlameTexture, vUv);
            
            // Add flickering intensity variation
            float intensity = 0.8 + sin(uTime * 20.0) * 0.15 + sin(uTime * 35.0) * 0.1;
            
            // Create edge glow
            float edgeGlow = 1.0 - length(vUv - 0.5) * 0.5;
            
            // Combine everything
            vec3 finalColor = flameColor.rgb * (intensity + edgeGlow * 0.5);
            float finalAlpha = flameColor.a * (0.7 + intensity * 0.3);
            
            gl_FragColor = vec4(finalColor, finalAlpha);
        }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
});

// Create the flame mesh
const flame = new THREE.Mesh(geometry, flameMaterial);
// Position the flame at the tip of the wick (adjusted upward)
// The wick tip is at y ≈ 2.1, so placing flame at y = 2.35 puts it right at the tip
flame.position.set(0, 2.38, 0);
flame.scale.set(0.8, 1.2, 0.8);
scene.add(flame);

// Add a subtle ambient light to help blend with the HTML candle
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

// Add a point light to create glow effect
const glowLight = new THREE.PointLight(0xff6600, 0.5, 8);
glowLight.position.set(0, 2.38, 0); // Match flame position
scene.add(glowLight);

// Mouse tracking for interaction (inspired by the tutorial's raycaster approach)
const mousePosition = new THREE.Vector2(0, 0);
let mouseIntensity = 0;

window.addEventListener('mousemove', (event) => {
    // Convert mouse coordinates to world space (approximate)
    const x = (event.clientX / window.innerWidth) * 4 - 2;
    const y = -(event.clientY / window.innerHeight) * 3 + 1.8; // Adjusted Y range for higher flame
    
    mousePosition.set(x, y);
    mouseIntensity = 1.0;
    
    // Update shader uniforms with mouse position
    flameMaterial.uniforms.uMousePosition.value = mousePosition;
    flameMaterial.uniforms.uIntensity.value = mouseIntensity;
});

// Decay mouse intensity over time when not moving
setInterval(() => {
    if (mouseIntensity > 0) {
        mouseIntensity = Math.max(0, mouseIntensity - 0.05);
        flameMaterial.uniforms.uIntensity.value = mouseIntensity;
    }
}, 50);

// Animation loop
let time = 0;

function animate() {
    requestAnimationFrame(animate);
    
    time += 0.016; // Delta time approximation
    flameMaterial.uniforms.uTime.value = time;
    
    // Pulsate the glow light
    const lightIntensity = 0.4 + Math.sin(time * 15) * 0.15 + Math.sin(time * 23) * 0.1;
    glowLight.intensity = lightIntensity;
    
    // Subtle flame rotation based on mouse
    if (mouseIntensity > 0.1) {
        flame.rotation.z = (mousePosition.x * 0.2) * mouseIntensity;
        flame.rotation.x = (mousePosition.y * 0.1) * mouseIntensity;
    } else {
        flame.rotation.z *= 0.95;
        flame.rotation.x *= 0.95;
    }
    
    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Add some floating particles for ambiance
const particleCount = 100;
const particlesGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount; i++) {
    particlePositions[i*3] = (Math.random() - 0.5) * 1.5;
    particlePositions[i*3+1] = Math.random() * 3 + 0.5; // Adjusted Y range for particles
    particlePositions[i*3+2] = (Math.random() - 0.5) * 1;
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

const particleMaterial = new THREE.PointsMaterial({
    color: 0xff6600,
    size: 0.02,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending
});

const particles = new THREE.Points(particlesGeometry, particleMaterial);
scene.add(particles);

// Animate particles
function animateParticles() {
    requestAnimationFrame(animateParticles);
    particles.rotation.y += 0.005;
    particles.rotation.x = Math.sin(time * 0.5) * 0.1;
}
animateParticles();