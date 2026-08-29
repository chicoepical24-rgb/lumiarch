import * as THREE from 'three';
import { buildWorkspace, parseColor } from './builder.js';
import { Importer } from './importer.js';

let scene, camera, renderer, sunLight, ambientLight;
let celestialSprite, celestialMat, starField;
let sunTexture, moonTexture, skyboxTexture;
let clockTime = 14; 

export async function init(input = null) {
    setupScene();
    setupLights();
    await setupAssets();
    
    try {
        let xmlString;

        if (typeof input === 'string' && input.trim().startsWith('<')) {
            console.log("Input is already XML. Skipping fetch to prevent 414 error.");
            xmlString = input;
        } 
        else if (input && !isNaN(input)) {
            console.log(`Fetching game data for ID: ${input}`);
            const response = await fetch(`../get_game.php?id=${input}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            xmlString = await response.text();
        } 
        else {
            const response = await fetch('./map2.xml');
            xmlString = await response.text();
        }

        const parsedData = await Importer.load(xmlString);

        const lighting = parsedData.find(i => i.class === "Lighting");
        if (lighting) {
            const rawTime = lighting.properties.Timeofday || lighting.properties.TimeOfDay;
            if (rawTime !== undefined) clockTime = parseTimeToDecimal(rawTime);
            if (lighting.properties.Ambient) {
                const c = parseColor(lighting.properties.Ambient);
                ambientLight.color.setRGB(c.r, c.g, c.b);
            }
        }

        buildWorkspace(scene, parsedData);
        
        const spawn = parsedData.find(i => i.class === "SpawnLocation");
        if (spawn && spawn.properties.Position) {
            const pos = spawn.properties.Position.split(',').map(Number);
            camera.position.set(pos[0], pos[1] + 5, pos[2]);
            camera.lookAt(pos[0], pos[1] + 5, pos[2] - 10);
        } else {
            frameScene(); 
        }

        updateCelestialCycle(); 
        
        // Wait a few frames for textures to catch up before the final render
        // Since this is for a thumbnail, we can afford a 100ms delay
        setTimeout(() => {
            render();
            console.log("Render generated successfully with textures.");
        }, 100);

    } catch (err) {
        console.error("Renderer failed:", err);
    }
}

function setupScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
}

function setupLights() {
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -500; 
    sunLight.shadow.camera.right = 500; 
    sunLight.shadow.camera.top = 500; 
    sunLight.shadow.camera.bottom = -500;
    sunLight.shadow.camera.far = 5000;
    sunLight.shadow.mapSize.width = 2048; 
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.0001; 
    scene.add(sunLight);
    scene.add(sunLight.target);
}

async function setupAssets() {
    const texLoader = new THREE.TextureLoader();
    sunTexture = texLoader.load('./content/sky/sun.jpg');
    moonTexture = texLoader.load('./content/sky/moon.jpg');

    celestialMat = new THREE.SpriteMaterial({ 
        map: sunTexture, transparent: true, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false
    });
    celestialSprite = new THREE.Sprite(celestialMat);
    celestialSprite.scale.set(150, 150, 1);
    scene.add(celestialSprite);

    const starGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(800 * 3);
    for(let i = 0; i < 800; i++) {
        const i3 = i * 3;
        const u = Math.random(), v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        posArray[i3] = 2500 * Math.sin(phi) * Math.cos(theta);
        posArray[i3 + 1] = 2500 * Math.sin(phi) * Math.sin(theta);
        posArray[i3 + 2] = 2500 * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0 }));
    scene.add(starField);

    const skyLoader = new THREE.CubeTextureLoader();
    skyLoader.setPath('content/sky/');
    skyboxTexture = skyLoader.load([
        'null_plainsky512_ft.jpg', 'null_plainsky512_bk.jpg',
        'null_plainsky512_up.jpg', 'null_plainsky512_dn.jpg', 
        'null_plainsky512_rt.jpg', 'null_plainsky512_lf.jpg'
    ]);
}

function updateCelestialCycle() {
    const angle = ((clockTime - 6) / 24) * Math.PI * 2;
    const x = Math.cos(angle) * 2000;
    const y = Math.sin(angle) * 2000;

    const camPos = camera.position;
    starField.position.copy(camPos);

    if (clockTime >= 6.5 && clockTime <= 18.5) {
        scene.background = skyboxTexture;
        scene.backgroundIntensity = 1.0; 
        starField.material.opacity = 0;
        celestialMat.map = sunTexture;
        celestialSprite.position.set(camPos.x + x, camPos.y + y, camPos.z - 500);
        sunLight.intensity = 1.2;
    } else {
        scene.background = new THREE.Color(0x000000);
        starField.material.opacity = 1;
        celestialMat.map = moonTexture;
        celestialSprite.position.set(camPos.x - x, camPos.y - y, camPos.z + 500);
        sunLight.intensity = 0.3;
    }

    sunLight.position.copy(celestialSprite.position);
    sunLight.target.position.copy(camPos);
}

function frameScene() {
    const boundingBox = new THREE.Box3();
    let hasContent = false;
    scene.traverse((child) => {
        if (child.isMesh && child !== celestialSprite && child !== starField) {
            boundingBox.expandByObject(child);
            hasContent = true;
        }
    });

    if (hasContent) {
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        const sphere = new THREE.Sphere();
        boundingBox.getBoundingSphere(sphere);
        const distance = (sphere.radius / Math.sin((camera.fov * Math.PI / 180) / 2)) * 0.4;
        camera.position.set(center.x + distance, center.y + distance, center.z + distance);
        camera.lookAt(center);
    }
}

function render() {
    renderer.render(scene, camera);
}

function parseTimeToDecimal(timeVal) {
    if (typeof timeVal === 'string' && timeVal.includes(':')) {
        const parts = timeVal.split(':').map(Number);
        return parts[0] + (parts[1] / 60) + (parts[2] / 3600 || 0);
    }
    return parseFloat(timeVal) ?? 14;
}