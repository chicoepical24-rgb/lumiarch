import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { LumisleCamera } from './camera.js';
import { buildWorkspace } from './builder.js';
import { initPlayer, updatePlayer } from './player.js';
import { Importer } from './importer.js';
import { initMobileControls } from './mobile.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.castShadow = true;
sunLight.shadow.camera.left = -100; 
sunLight.shadow.camera.right = 100; 
sunLight.shadow.camera.top = 100; 
sunLight.shadow.camera.bottom = -100;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 500;
sunLight.shadow.mapSize.width = 2048; 
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.bias = -0.0001; 
sunLight.shadow.normalBias = 0.05; 

scene.add(sunLight);
scene.add(sunLight.target);

// --- PHYSICS ENGINE REFINEMENT ---
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -196.2, 0)
});

world.solver.iterations = 20; 
world.defaultContactMaterial.contactEquationStiffness = 1e7; 
world.defaultContactMaterial.contactEquationRelaxation = 3;
// ---------------------------------

camera.position.set(12, 10, 12);
const controls = new LumisleCamera(camera, renderer.domElement);

const skyLoader = new THREE.CubeTextureLoader();
skyLoader.setPath('content/sky/');

const skyboxTexture = skyLoader.load([
    'null_plainsky512_ft.jpg',
    'null_plainsky512_bk.jpg',
    'null_plainsky512_up.jpg',
    'null_plainsky512_dn.jpg', 
    'null_plainsky512_rt.jpg',
    'null_plainsky512_lf.jpg'
]);
scene.background = skyboxTexture;

async function loadDynamicMapPath() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameid');
    if (!gameId) return './map2.xml'; 
    return `../get_game.php?id=${gameId}`;
}

const sunOffset = new THREE.Vector3(50, 150, 50);

function updateSunPosition() {
    sunLight.position.copy(camera.position).add(sunOffset);
    sunLight.target.position.copy(camera.position);
    sunLight.target.updateMatrixWorld();
}

async function init() {
    try {
        const mapPath = await loadDynamicMapPath();
        const parsedData = await Importer.load(mapPath);

        const workspace = parsedData.find(i => i.class === "Workspace");
        if (workspace && workspace.properties.Gravity) {
            const g = parseFloat(workspace.properties.Gravity);
            world.gravity.set(0, -g, 0);
        }

        buildWorkspace(scene, parsedData, world);
        await initPlayer(scene, world);

        // Initialize mobile controls after player/world is ready
        initMobileControls();

        animate();
        window.dispatchEvent(new CustomEvent('MapLoaded'));
    } catch (err) {
        console.error("Engine failed to initialize:", err);
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    world.fixedStep();
    
    updatePlayer(camera, world);
    updateSunPosition();
    
    scene.traverse((child) => {
        if (child.isMesh && child.userData.physicsBody) {
            const body = child.userData.physicsBody;
            if (!isNaN(body.position.x)) {
                child.position.copy(body.position);
                child.quaternion.copy(body.quaternion);
            }
        }
    });
    
    controls.update(scene); 
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();