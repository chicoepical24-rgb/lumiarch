//engine.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { LumisleCamera } from './camera.js';
import { buildWorkspace } from './builder.js'; // Direct import for building

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

// Physics Setup
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
document.body.appendChild(renderer.domElement);

// Lighting Setup
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.castShadow = true;

// Shadow Camera Settings - Keep these tight for higher quality shadows
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 500;
sunLight.shadow.mapSize.width = 2048; 
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.bias = -0.0005; 

scene.add(sunLight);
scene.add(sunLight.target); // Target must be in scene to move it

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

async function loadDynamicMap() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameid');
    
    if (!gameId) {
        console.warn("No gameid provided in URL. Loading default map.xml.");
        return './map.xml'; 
    }
    
    return `./get_game.php?id=${gameId}`;
}

// Function to move light with camera
function updateShadows() {
    // Offset the sun relative to where the camera is looking
    // Adjust (50, 100, 50) to change the angle of the sun
    const shadowOffset = new THREE.Vector3(50, 100, 50);
    
    // Position light relative to camera
    sunLight.position.copy(camera.position).add(shadowOffset);
    
    // Point light at the camera's general area
    sunLight.target.position.copy(camera.position);
    
    // Required to update the shadow frustum
    sunLight.target.updateMatrixWorld();
}

async function init() {
    try {
        const mapPath = await loadDynamicMap();
        const response = await fetch(mapPath);
        
        if (!response.ok) throw new Error(`Failed to fetch map: ${response.status}`);
        
        const content = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(content, "text/xml");
        
        const rootNode = xmlDoc.getElementsByTagName("lumisle")[0] || 
                         xmlDoc.getElementsByTagName("galaxia")[0] || 
                         xmlDoc.documentElement;

        const parsedData = parseXMLToJSON(rootNode); 

        const workspace = parsedData.find(i => i.class === "Workspace");
        if (workspace && workspace.properties.Gravity) {
            const g = parseFloat(workspace.properties.Gravity);
            world.gravity.set(0, -g, 0);
        }

        buildWorkspace(scene, parsedData, world);

        function animate() {
            requestAnimationFrame(animate);
            world.fixedStep();
            
            scene.traverse((child) => {
                if (child.isMesh && child.userData.physicsBody) {
                    child.position.copy(child.userData.physicsBody.position);
                    child.quaternion.copy(child.userData.physicsBody.quaternion);
                }
            });
            
            controls.update();
            updateShadows(); // Update light position every frame
            renderer.render(scene, camera);
        }
        animate();
        
        window.dispatchEvent(new CustomEvent('MapLoaded'));

    } catch (err) {
        console.error("Engine failure:", err);
    }
}

function parseXMLToJSON(node) {
    const items = [];
    const children = node.querySelectorAll(':scope > Item');
    
    children.forEach(itemNode => {
        const itemClass = itemNode.getAttribute('class');
        const properties = {};
        const propNode = itemNode.querySelector(':scope > Properties');
        
        if (propNode) {
            Array.from(propNode.children).forEach(prop => {
                if (prop.tagName === 'Surface') {
                    properties.Surface = {};
                    Array.from(prop.attributes).forEach(attr => {
                        properties.Surface[attr.name] = attr.value;
                    });
                } else if (prop.children.length > 0) {
                    properties[prop.tagName] = {};
                    Array.from(prop.attributes).forEach(attr => {
                        properties[prop.tagName][attr.name] = attr.value;
                    });
                } else {
                    properties[prop.tagName] = prop.textContent;
                }
            });
        }

        items.push({
            class: itemClass,
            properties: properties,
            children: parseXMLToJSON(itemNode)
        });
    });
    
    return items;
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();