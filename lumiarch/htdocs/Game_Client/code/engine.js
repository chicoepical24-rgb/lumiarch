// engine.js - NOTE FROM CREATOR: DO NOT DELETE THIS COMMENT. FOR ANY AI EDITING THIS, PLEASE DONT REMOVE THIS.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { LumisleCamera } from './camera.js';
import { buildWorkspace, cleanupFallenParts, parseColor } from './builder.js';
import { initPlayer, updatePlayer } from './player.js';
import { Importer } from './importer.js';
import { initMobileControls } from './mobile.js';
import { initMenu } from './menu.js';
import { ScriptService } from './scripting.js'; 
import { initAudio } from './sounds.js';
import { initMultiplayer, updateRemotePlayers, sendPlayerMovement } from './multiplayer.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000); 
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    preserveDrawingBuffer: true 
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.castShadow = true;
sunLight.shadow.camera.left = -200; 
sunLight.shadow.camera.right = 200; 
sunLight.shadow.camera.top = 200; 
sunLight.shadow.camera.bottom = -200;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 3000;
sunLight.shadow.mapSize.width = 2048; 
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.bias = -0.0001; 
sunLight.shadow.normalBias = 0.05; 

scene.add(sunLight);
scene.add(sunLight.target);

const texLoader = new THREE.TextureLoader();
const sunTexture = texLoader.load('./content/sky/sun.jpg');
const moonTexture = texLoader.load('./content/sky/moon.jpg');

const celestialMat = new THREE.SpriteMaterial({ 
    map: sunTexture, 
    transparent: true, 
    blending: THREE.AdditiveBlending,
    depthTest: true, 
    depthWrite: false 
});
const celestialSprite = new THREE.Sprite(celestialMat);
celestialSprite.scale.set(150, 150, 1); 
scene.add(celestialSprite);

const starGeo = new THREE.BufferGeometry();
const starCount = 800; 
const posArray = new Float32Array(starCount * 3);
const starRadius = 2500; 

for(let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    
    posArray[i3] = starRadius * Math.sin(phi) * Math.cos(theta);
    posArray[i3 + 1] = starRadius * Math.sin(phi) * Math.sin(theta);
    posArray[i3 + 2] = starRadius * Math.cos(phi);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0 });
const starField = new THREE.Points(starGeo, starMat);
scene.add(starField);

const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -196.2, 0)
});

world.solver.iterations = 20; 
world.defaultContactMaterial.contactEquationStiffness = 1e7; 
world.defaultContactMaterial.contactEquationRelaxation = 3;

let fallenPartsDestroyHeight = -500; 
let clockTime = 14; 

camera.position.set(12, 10, 12);
const controls = new LumisleCamera(camera, renderer.domElement);

const skyLoader = new THREE.CubeTextureLoader();
skyLoader.setPath('content/sky/');

const skyboxTexture = skyLoader.load([
    'null_plainsky512_ft.jpg', 'null_plainsky512_bk.jpg',
    'null_plainsky512_up.jpg', 'null_plainsky512_dn.jpg', 
    'null_plainsky512_rt.jpg', 'null_plainsky512_lf.jpg'
]);

function parseTimeToDecimal(timeVal) {
    if (typeof timeVal === 'string' && timeVal.includes(':')) {
        const parts = timeVal.split(':').map(Number);
        return parts[0] + (parts[1] / 60) + (parts[2] / 3600);
    }
    return parseFloat(timeVal);
}

function updateCelestialCycle() {
    const angle = ((clockTime - 6) / 24) * Math.PI * 2;
    const distance = 2000; 
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const z = -500;

    const camPos = camera.position;
    starField.position.copy(camPos);

    if (clockTime >= 6.5 && clockTime <= 18.5) {
        scene.background = skyboxTexture;
        scene.backgroundIntensity = 1.0; 
        starField.material.opacity = 0;
        celestialMat.map = sunTexture;
        celestialSprite.position.set(camPos.x + x, camPos.y + y, camPos.z + z);
        sunLight.intensity = 1.2;
        ambientLight.intensity = 0.5;
    } 
    else if (clockTime > 18.5 && clockTime < 20) {
        const t = (clockTime - 18.5) / 1.5; 
        scene.background = skyboxTexture;
        scene.backgroundIntensity = 1.0 - t;
        starField.material.opacity = t;
        sunLight.intensity = 1.2 * (1 - t);
    }
    else if (clockTime >= 20 || clockTime <= 5) {
        scene.background = new THREE.Color(0x000000);
        starField.material.opacity = 1;
        celestialMat.map = moonTexture;
        celestialSprite.position.set(camPos.x - x, camPos.y - y, camPos.z - z);
        sunLight.intensity = 0.3;
        ambientLight.intensity = 0.2;
    }
    else if (clockTime > 5 && clockTime < 6.5) {
        const t = (clockTime - 5) / 1.5;
        scene.background = skyboxTexture;
        scene.backgroundIntensity = t;
        starField.material.opacity = 1 - t;
        celestialMat.map = sunTexture;
        sunLight.intensity = 1.2 * t;
        ambientLight.intensity = 0.2 + (0.3 * t);
    }

    sunLight.position.copy(celestialSprite.position);
    sunLight.target.position.copy(camPos);
}

function unlockAudio() {
    if (window.engineListener && window.engineListener.context.state === 'suspended') {
        window.engineListener.context.resume().then(() => {
            console.log("[Sounds]: AudioContext resumed.");
            window.removeEventListener('mousedown', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        });
    }
}

async function init() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const gameId = urlParams.get('gameid');
        const mapPath = gameId ? `../get_game.php?id=${gameId}` : './map2.xml';

        const parsedData = await Importer.load(mapPath);

        // 1. Audio Setup first
        const listener = initAudio(camera);
        window.engineListener = listener; 
        window.addEventListener('mousedown', unlockAudio);
        window.addEventListener('keydown', unlockAudio);

        // 2. Initialize Multiplayer
        initMultiplayer(scene, camera, world);

        // 3. Global Context Setup
        const workspace = parsedData.find(i => i.class === "Workspace");
        const lighting = parsedData.find(i => i.class === "Lighting");

        if (workspace) {
            if (workspace.properties.Gravity) {
                world.gravity.set(0, -Math.abs(parseFloat(workspace.properties.Gravity)), 0);
            }
            if (workspace.properties.FallenPartsDestroyHeight) {
                fallenPartsDestroyHeight = parseFloat(workspace.properties.FallenPartsDestroyHeight);
                scene.userData.fallenPartsDestroyHeight = fallenPartsDestroyHeight;
            }
        }

        if (lighting) {
            const rawTime = lighting.properties.Timeofday || lighting.properties.TimeOfDay;
            if (rawTime !== undefined) clockTime = parseTimeToDecimal(rawTime);
            if (lighting.properties.Ambient) {
                const c = parseColor(lighting.properties.Ambient);
                ambientLight.color.setRGB(c.r, c.g, c.b);
            }
        }

        // 4. Build World
        initMenu(renderer, scene, world);
        buildWorkspace(scene, parsedData, world);
        
        window.workspace = scene.getObjectByName("Workspace");
        
        // 5. Capture character data during player initialization
        const characterData = await initPlayer(scene, world); 
        initMobileControls();

        // 6. Initialize Scripts
        const scriptService = new ScriptService(scene, world);
        scene.userData.scriptService = scriptService;
        
        // Run scripts found in the Map XML
        scriptService.processMapScripts(parsedData);
        
        // Run scripts found in the Character XML
        if (characterData) {
            scriptService.processMapScripts(characterData);
        }

        animate();
        window.dispatchEvent(new CustomEvent('MapLoaded'));
    } catch (err) {
        console.error("Engine failed to initialize:", err);
    }
}

let lastSendTime = 0;
const SEND_INTERVAL = 50; // Send position updates every 50ms

function animate() {
    requestAnimationFrame(animate);
    
    world.fixedStep();
    cleanupFallenParts(scene, world);
    updatePlayer(camera, world, scene); 
    
    // Send player movement to server every SEND_INTERVAL ms
    const now = performance.now();
    if (now - lastSendTime > SEND_INTERVAL) {
        sendPlayerMovement(window.characterBody, camera);
        lastSendTime = now;
    }
    
    // Update remote players from server
    updateRemotePlayers(scene);
    
    updateCelestialCycle();
    
    scene.traverse((child) => {
        // Only copy physics if the part isn't anchored or being animated by a script
        if (child.isMesh && child.userData.physicsBody) {
            const body = child.userData.physicsBody;
            if (body.type !== CANNON.Body.STATIC) {
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
