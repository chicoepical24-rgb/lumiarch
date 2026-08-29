// player.js, NOTE FROM CREATOR, DO NOT DELETE THIS. THIS IS A REFERENCE
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Importer } from './importer.js';
import { updateObjectProperty } from './builder.js';
import { initMobileControls } from './mobile.js';
import { applyClothes } from './clothes.js';

let characterBody = null;
let characterGroup = null;
let initialized = false;
let currentAngle = 0;
let lastJumpTime = 0;
let stepPhase = 0; 

const limbs = {
    LeftArm: null,
    RightArm: null,
    LeftLeg: null,
    RightLeg: null,
    Torso: null
};

export const keys = { w: false, a: false, s: false, d: false, space: false };

const humanoid = {
    walkSpeed: 16, 
    jumpPower: 50, 
    hipHeight: 3.0, 
    state: "Freefall"
};

export async function initPlayer(scene, world, spawnPos = { x: 0, y: 100, z: 0 }) {
    characterGroup = new THREE.Group();
    characterGroup.name = "PlayerCharacter";
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

    await loadCharacterModel(); 
    setupInput();
    initMobileControls();

    initialized = true;
}

function recenterGeometry(mesh) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const height = box.max.y - box.min.y;
    mesh.geometry.translate(0, -height * 0.25, 0);
}

async function loadCharacterModel() {
    try {
        let avatarData = null;
        try {
            const res = await fetch('./code/get-colors.php');
            avatarData = await res.json();
        } catch (e) {
            console.warn("Failed to fetch avatar data, using defaults.");
        }

        const tshirtID = avatarData?.tshirtID || null;
        const shirtID = avatarData?.shirtID || null;
        const pantsID = avatarData?.pantsID || null;

        const parsedData = await Importer.load('content/models/character.xml');
        
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

        Importer(characterGroup, parsedData, null);

        const offsets = {
            "Head":      { x: 0,    y: 1.5,  z: 0 },
            "Torso":      { x: 0,    y: 0,    z: 0 },
            "LeftArm":   { x: -1.5, y: 0.5,  z: 0 }, 
            "RightArm":  { x: 1.5,  y: 0.5,  z: 0 },
            "LeftLeg":   { x: -0.5, y: -1.5, z: 0 }, 
            "RightLeg":  { x: 0.5,  y: -1.5, z: 0 }
        };

        const characterParts = [];
        characterGroup.traverse(child => {
            if (child.isMesh) {
                characterParts.push(child);
                if (["LeftArm", "RightArm", "LeftLeg", "RightLeg"].includes(child.name)) {
                    recenterGeometry(child);
                }
                if (offsets[child.name]) {
                    child.position.set(offsets[child.name].x, offsets[child.name].y, offsets[child.name].z);
                    if (limbs.hasOwnProperty(child.name)) {
                        limbs[child.name] = child;
                    }
                }
            }
        });

        const findHumanoid = (items) => {
            const itemList = Array.isArray(items) ? items : [items];
            itemList.forEach(item => {
                if (item.class === "Humanoid") {
                    humanoid.walkSpeed = parseFloat(item.properties.WalkSpeed || 16);
                    humanoid.jumpPower = parseFloat(item.properties.JumpPower || 50);
                    humanoid.hipHeight = parseFloat(item.properties.HipHeight || 3.0);
                }
                if (item.children) findHumanoid(item.children);
            });
        };
        findHumanoid(parsedData);
        applyAvatarColors(characterParts, avatarData);
        
        if (shirtID || pantsID) {
            applyClothes(characterGroup, shirtID, pantsID);
        }

    } catch (e) {
        console.error("Player model load failed:", e);
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
                    updateObjectProperty(mesh, "Color", colors[phpKey]);
                } else if (mesh.userData.xmlColor) {
                    const c = mesh.userData.xmlColor;
                    const rgbStr = `${Math.floor(c.r * 255)}, ${Math.floor(c.g * 255)}, ${Math.floor(c.b * 255)}`;
                    updateObjectProperty(mesh, "Color", rgbStr);
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

function processAnimations(isMoving, isGrounded) {
    if (!limbs.LeftArm || !limbs.LeftLeg) return;

    let targetLA = 0, targetRA = 0, targetLL = 0, targetRL = 0;
    const lerpSpeed = 0.15; 

    if (!isGrounded) {
        targetLA = -Math.PI;
        targetRA = -Math.PI;
        targetLL = 0; 
        targetRL = 0;
    } else if (isMoving) {
        stepPhase += 0.12; 
        const rawSwing = Math.sin(stepPhase);
        const swing = Math.sign(rawSwing) * Math.pow(Math.abs(rawSwing), 0.7) * (Math.PI / 4);

        targetLA = swing;
        targetRA = -swing;
        targetLL = -swing;
        targetRL = swing;
    } else {
        stepPhase = 0;
        targetLA = 0;
        targetRA = 0;
        targetLL = 0;
        targetRL = 0;
    }

    limbs.LeftArm.rotation.x = THREE.MathUtils.lerp(limbs.LeftArm.rotation.x, targetLA, lerpSpeed);
    limbs.RightArm.rotation.x = THREE.MathUtils.lerp(limbs.RightArm.rotation.x, targetRA, lerpSpeed);
    limbs.LeftLeg.rotation.x = THREE.MathUtils.lerp(limbs.LeftLeg.rotation.x, targetLL, lerpSpeed);
    limbs.RightLeg.rotation.x = THREE.MathUtils.lerp(limbs.RightLeg.rotation.x, targetRL, lerpSpeed);
}

export function updatePlayer(camera, world) {
    if (!characterBody) return;

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
        lastJumpTime = now;
        humanoid.state = "Freefall";
        isGrounded = false;
    }

    processAnimations(isMoving, isGrounded);

    if (characterGroup) {
        characterGroup.position.copy(characterBody.position);
        characterGroup.quaternion.copy(characterBody.quaternion);
    }
}