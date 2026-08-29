// player.js - NOTE FROM CREATOR: DO NOT DELETE THIS COMMENT. FOR ANY AI EDITING THIS, PLEASE DONT REMOVE THIS.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Importer } from './importer.js';
import { registerPhysicalPart, removeWelds, updateObjectProperty } from './builder.js';
import { initMobileControls } from './mobile.js';
import { applyClothes } from './clothes.js';

let characterBody = null;
let characterGroup = null;
let initialized = false;
let currentAngle = 0;
let lastJumpTime = 0;
let isDead = false;
let cachedAvatarData = null;

// Initialize global state for Lua scripts and external Animate script
window._G = window._G || {
    isMoving: false,
    isGrounded: false,
    didDie: false,
    didJump: false
};

const limbs = {
    LeftArm: null,
    RightArm: null,
    LeftLeg: null,
    RightLeg: null,
    Torso: null,
    Head: null
};

export const keys = { w: false, a: false, s: false, d: false, space: false };

const humanoid = {
    health: 100,
    maxHealth: 100,
    walkSpeed: 16, 
    jumpPower: 50, 
    hipHeight: 3.0, 
    state: "Freefall",
    spawnPos: new CANNON.Vec3(0, 100, 0)
};

function updateHealthUI() {
    const fill = document.getElementById('health-fill');
    if (fill) {
        const pct = Math.max(0, (humanoid.health / humanoid.maxHealth) * 100);
        fill.style.width = `${pct}%`;
    }
}

export async function initPlayer(scene, world, spawnPos = { x: 0, y: 100, z: 0 }) {
    isDead = false;
    initialized = false; 
    
    humanoid.health = 100;
    humanoid.spawnPos.set(spawnPos.x, spawnPos.y, spawnPos.z);
    updateHealthUI();

    const oldGroup = scene.getObjectByName("CharacterModel");
    if (oldGroup) scene.remove(oldGroup);

    characterGroup = new THREE.Group();
    characterGroup.name = "CharacterModel";
    scene.add(characterGroup);

    const shape = new CANNON.Sphere(1.2); 
    characterBody = new CANNON.Body({
        mass: 1,
        shape: shape,
        position: new CANNON.Vec3(spawnPos.x, spawnPos.y, spawnPos.z),
        fixedRotation: true,
        linearDamping: 0.2 
    });

    characterBody.collisionFilterGroup = 2;
    characterBody.ccdSpeedThreshold = 1;
    characterBody.ccdIterations = 15;

    const playerMat = new CANNON.Material("playerMaterial");
    characterBody.material = playerMat;
    
    const contact = new CANNON.ContactMaterial(playerMat, world.defaultMaterial, { 
        friction: 0.0, 
        restitution: 0.0,
        contactEquationStiffness: 1e7, 
        contactEquationRelaxation: 3
    });
    
    world.addContactMaterial(contact);
    world.addBody(characterBody);

    window.characterBody = characterBody;

    const characterData = await loadCharacterModel(scene, world);
    setupInput();
    initMobileControls();

    initialized = true; 
    return characterData;
}

function recenterGeometry(mesh) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const height = box.max.y - box.min.y;
    mesh.geometry.translate(0, -height * 0.25, 0);
}

async function loadCharacterModel(scene, world) {
    try {
        if (!cachedAvatarData) {
            try {
                const res = await fetch('./code/get-colors.php');
                cachedAvatarData = await res.json();
            } catch (e) {
                console.warn("Failed to fetch avatar data, using defaults.");
                cachedAvatarData = {};
            }
        }

        const avatarData = cachedAvatarData;
        const tshirtID = avatarData?.tshirtID || null;
        const shirtID = avatarData?.shirtID || null;
        const pantsID = avatarData?.pantsID || null;

        // Load the XML data
        const parsedData = await Importer.load('content/models/character.xml');
        
        // Find Torso and inject T-Shirt decal if it exists
        const findAndDecorateTorso = (items) => {
            const itemList = Array.isArray(items) ? items : [items];
            itemList.forEach(item => {
                if (item.class === "Part" && item.properties.Name === "Torso") {
                    if (!item.children) item.children = [];
                    item.children.push({
                        class: "Decal",
                        properties: {
                            Name: "T-Shirt",
                            TexturePath: `../avatar/catalog/tshirt/${tshirtID}.png`,
                            Transparency: "0",
                            Side: "front",
                            Color3: "255, 255, 255",
                            ZIndex: "1"
                        }
                    });
                }
                if (item.children) findAndDecorateTorso(item.children);
            });
        };
        findAndDecorateTorso(parsedData);

        // Build the physical meshes in the scene
        Importer(characterGroup, parsedData, null);

        const offsets = {
            "Head":      { x: 0,    y: 1.5,  z: 0 },
            "Torso":      { x: 0,    y: 0,    z: 0 },
            "LeftArm":   { x: -1.5, y: 0.5,  z: 0 }, 
            "RightArm":  { x: 1.5,  y: 0.5,  z: 0 },
            "LeftLeg":   { x: -0.5, y: -1.5, z: 0 }, 
            "RightLeg":  { x: 0.5,  y: -1.5, z: 0 }
        };

        characterGroup.traverse(child => {
            if (child.isMesh) {
                if (["LeftArm", "RightArm", "LeftLeg", "RightLeg"].includes(child.name)) {
                    recenterGeometry(child);
                }
                if (offsets[child.name]) {
                    child.position.set(offsets[child.name].x, offsets[child.name].y, offsets[child.name].z);
                    if (limbs.hasOwnProperty(child.name)) {
                        limbs[child.name] = child;
                        window[`localPlayer${child.name}`] = child;
                        registerPhysicalPart(child);
                    }
                }
            }
        });

        // Sync Humanoid properties from the XML
        const findHumanoid = (items) => {
            const itemList = Array.isArray(items) ? items : [items];
            itemList.forEach(item => {
                if (item.class === "Humanoid") {
                    humanoid.walkSpeed = parseFloat(item.properties.WalkSpeed || 16);
                    humanoid.jumpPower = parseFloat(item.properties.JumpPower || 50);
                    humanoid.hipHeight = parseFloat(item.properties.HipHeight || 3.0);
                    humanoid.health = parseFloat(item.properties.Health || 100);
                    humanoid.maxHealth = parseFloat(item.properties.MaxHealth || 100);
                }
                if (item.children) findHumanoid(item.children);
            });
        };
        findHumanoid(parsedData);

        updateHealthUI();
        applyAvatarColors(Object.values(limbs).filter(l => l), avatarData);
        
        if (shirtID || pantsID) {
            applyClothes(characterGroup, shirtID, pantsID);
        }

        // CRITICAL: Return the parsed data so the engine can extract scripts from it
        return parsedData;

    } catch (e) {
        console.error("Player model load failed:", e);
        return null;
    }
}

function applyAvatarColors(parts, colors) {
    const colorMap = { 
        "head": "Head", "torso": "Torso", 
        "left_arm": "LeftArm", "right_arm": "RightArm", 
        "left_leg": "LeftLeg", "right_leg": "RightLeg" 
    };

    parts.forEach(mesh => {
        for (let [phpKey, xmlName] of Object.entries(colorMap)) {
            if (mesh.name === xmlName) {
                if (colors && colors[phpKey]) {
                    updateObjectProperty(mesh, "Color3", colors[phpKey]);
                }
            }
        }
    });
}

function setupInput() {
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
}

function handleKey(e, isDown) {
    const key = e.key.toLowerCase();
    if (key === 'w') keys.w = isDown;
    if (key === 'a') keys.a = isDown;
    if (key === 's') keys.s = isDown;
    if (key === 'd') keys.d = isDown;
    if (e.code === 'Space') keys.space = isDown;
}

function handleDeath(scene, world) {
    if (isDead) return;
    
    if (window._G) window._G.didDie = true;

    isDead = true;
    initialized = false; 
    humanoid.health = 0;
    updateHealthUI();

    if (characterBody) {
        world.removeBody(characterBody);
        characterBody = null;
        window.characterBody = null;
    }

    Object.keys(limbs).forEach(key => {
        const mesh = limbs[key];
        if (mesh && mesh.parent) {
            const worldPos = new THREE.Vector3();
            mesh.getWorldPosition(worldPos);
            const worldQuat = new THREE.Quaternion();
            mesh.getWorldQuaternion(worldQuat);

            scene.attach(mesh); 

            const limbShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5));
            const limbBody = new CANNON.Body({
                mass: 0.5,
                position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
                quaternion: new CANNON.Quaternion(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w)
            });
            limbBody.addShape(limbShape);
            
            world.addBody(limbBody);
            mesh.userData.physicsBody = limbBody;
            
            registerPhysicalPart(mesh);
        }
    });

    setTimeout(() => {
        respawnPlayer(scene, world);
    }, 5000);
}

async function respawnPlayer(scene, world) {
    if (window._G) window._G.didDie = false;

    Object.keys(limbs).forEach(key => {
        const mesh = limbs[key];
        if (mesh) {
            if (mesh.userData.physicsBody) {
                removeWelds(world, mesh);
                world.removeBody(mesh.userData.physicsBody);
            }
            if (mesh.parent) mesh.parent.remove(mesh);
        }
        limbs[key] = null;
        window[`localPlayer${key}`] = null;
    });

    const oldGroup = scene.getObjectByName("CharacterModel");
    if (oldGroup) scene.remove(oldGroup);

    const characterData = await initPlayer(scene, world, { 
        x: humanoid.spawnPos.x, 
        y: humanoid.spawnPos.y, 
        z: humanoid.spawnPos.z 
    });

    if (characterData && scene.userData.scriptService) {
        scene.userData.scriptService.processMapScripts(characterData);
    }
}

export function updatePlayer(camera, world, scene) {
    if (!initialized || isDead) {
        if (isDead) {
            Object.keys(limbs).forEach(key => {
                const mesh = limbs[key];
                if (mesh && mesh.userData.physicsBody) {
                    mesh.position.copy(mesh.userData.physicsBody.position);
                    mesh.quaternion.copy(mesh.userData.physicsBody.quaternion);
                }
            });
        }
        return; 
    }

    if (!characterBody) return;

    const vitalPartsExist = limbs.Head?.parent && limbs.Torso?.parent;
    if (humanoid.health <= 0 || !vitalPartsExist) {
        handleDeath(scene, world);
        return;
    }

    const now = performance.now();
    const rayResult = new CANNON.RaycastResult();
    const rayFrom = characterBody.position;
    
    const rayStart = new CANNON.Vec3(rayFrom.x, rayFrom.y, rayFrom.z);
    const rayTo = new CANNON.Vec3(rayFrom.x, rayFrom.y - (humanoid.hipHeight + 1.0), rayFrom.z);
    
    world.raycastClosest(rayStart, rayTo, { 
        skipBackfaces: true,
        collisionFilterMask: ~2, 
    }, rayResult);

    let isGrounded = false;
    if (rayResult.hasHit && characterBody.velocity.y <= 1.0 && (now - lastJumpTime > 150)) {
        if (rayResult.distance <= humanoid.hipHeight + 0.2) {
            isGrounded = true;
            humanoid.state = "Grounded";
            
            const targetY = rayResult.hitPointWorld.y + humanoid.hipHeight;
            const diffY = targetY - characterBody.position.y;
            
            if (Math.abs(diffY) < 2.0) {
                characterBody.position.y += diffY * 0.1;
                if (characterBody.velocity.y < -0.1) characterBody.velocity.y = 0;
            }
        }
    }

    if (!isGrounded) humanoid.state = "Freefall";

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

    let moveDir = new THREE.Vector3(0, 0, 0);
    if (keys.w) moveDir.add(forward);
    if (keys.s) moveDir.sub(forward);
    if (keys.a) moveDir.add(right);
    if (keys.d) moveDir.sub(right);

    const isMoving = moveDir.lengthSq() > 0;

    // Update Global State for Sounds and Animate script
    if (window._G) {
        window._G.isMoving = isMoving;
        window._G.isGrounded = isGrounded;
    }

    if (isMoving) {
        moveDir.normalize();
        const targetX = moveDir.x * humanoid.walkSpeed;
        const targetZ = moveDir.z * humanoid.walkSpeed;

        const accel = isGrounded ? 0.4 : 0.05;
        characterBody.velocity.x += (targetX - characterBody.velocity.x) * accel;
        characterBody.velocity.z += (targetZ - characterBody.velocity.z) * accel;

        const targetAngle = Math.atan2(moveDir.x, moveDir.z);
        let diff = targetAngle - currentAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        currentAngle += diff * 0.25;
        characterBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), currentAngle);
    } else if (isGrounded) {
        characterBody.velocity.x = 0;
        characterBody.velocity.z = 0;
    }

    if (keys.space && isGrounded && (now - lastJumpTime > 600)) {
        characterBody.velocity.y = humanoid.jumpPower;
        if (window._G) window._G.didJump = true; // For sounds
        lastJumpTime = now;
        humanoid.state = "Freefall";
        isGrounded = false;
    }

    if (characterGroup && characterBody) {
        characterGroup.position.copy(characterBody.position);
        characterGroup.quaternion.copy(characterBody.quaternion);
    }
}

export function manualReset(scene, world) {
    if (!isDead && initialized) {
        handleDeath(scene, world);
    }
}