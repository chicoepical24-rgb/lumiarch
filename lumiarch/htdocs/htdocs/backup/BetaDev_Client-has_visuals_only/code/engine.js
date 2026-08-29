import * as THREE from 'three';
import { parseLumisle } from './parser.js';
import { buildWorkspace } from './builder.js';
import { LumisleCamera } from './camera.js'; 

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

camera.position.set(12, 10, 12);
camera.lookAt(0, 0, 0);

const controls = new LumisleCamera(camera, renderer.domElement);

const loader = new THREE.CubeTextureLoader();
loader.setPath('content/sky/');

const skyboxTexture = loader.load([
    'null_plainsky512_ft.jpg',
    'null_plainsky512_bk.jpg',
    'null_plainsky512_up.jpg',
    'null_plainsky512_dn.jpg', 
    'null_plainsky512_rt.jpg',
    'null_plainsky512_lf.jpg'
]);

scene.background = skyboxTexture;

async function init() {
    try {
        const response = await fetch('./map.xml');
        if (!response.ok) throw new Error("map.xml missing");
        const xmlText = await response.text();
        
        const parsedData = parseLumisle(xmlText);
        buildWorkspace(scene, parsedData);

        function animate() {
            requestAnimationFrame(animate);
            
            // Update camera movement every frame
            controls.update();
            
            renderer.render(scene, camera);
        }
        animate();
    } catch (err) {
        console.error("Engine failure:", err);
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();