// ──────────────────────────────────────────────────────────────
// Global variables
// ──────────────────────────────────────────────────────────────
let characterBody = null;
let characterMesh = null; // mainly torso reference
const moveSpeed = 13;
const jumpForce = 80;
let keys = {};
let spacePressed = false;
let isCharacterLoaded = false;

const GROUP_PLAYER = 1;
const GROUP_ENVIRONMENT = 2;

const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();

let currentYaw = 0;
let targetYaw = 0;

// Permanent containers (created once, never removed)
const playerGroup = new THREE.Group();      // All character meshes go here
scene.add(playerGroup);                     // ← Make sure this line runs once at init!

let characterParts = [];                    // {mesh, body} pairs for easy sync/cleanup

// ──────────────────────────────────────────────────────────────
// Character loading & setup
// ──────────────────────────────────────────────────────────────
function loadCharacter() {
    if (isCharacterLoaded) return;

    // 1. First, fetch the custom colors from your new PHP script
    fetch("get_colors.php")
        .then(res => res.json())
        .catch(err => {
            console.warn("Could not load custom colors, using XML defaults.", err);
            return null; // Fallback if PHP fails
        })
        .then(userColors => {
            // 2. Now fetch the actual character structure
            return fetch("assets/player/character.xml")
                .then(res => res.text())
                .then(str => {
                    const xml = new DOMParser().parseFromString(str, "text/xml");
                    
                    // Support both <item className="Model"> and legacy <model>
                    const modelNode = xml.querySelector('item[className="Model"]') || 
                                     xml.getElementsByTagName("model")[0];

                    if (!modelNode) {
                        console.error("No Character Model found in XML");
                        return;
                    }

                    const startIndex = meshes.length;
                    
                    // Use your main parser to build the limbs
                    processElements(modelNode);

                    // 3. Apply custom colors if we successfully got them from the database
                    if (userColors) {
                        const limbMap = {
                            "Head": userColors.head,
                            "Torso": userColors.torso,
                            "LeftArm": userColors.left_arm,
                            "RightArm": userColors.right_arm,
                            "LeftLeg": userColors.left_leg,
                            "RightLeg": userColors.right_leg
                        };

                        for (let i = startIndex; i < meshes.length; i++) {
                            const mesh = meshes[i];
                            const hex = limbMap[mesh.name];
                            if (hex) {
                                // Support both 0x and # formats
                                const cleanHex = hex.toString().replace('0x', '#');
                                const threeColor = new THREE.Color(cleanHex);
                                if (Array.isArray(mesh.material)) {
                                    mesh.material.forEach(mat => mat.color.copy(threeColor));
                                } else {
                                    mesh.material.color.copy(threeColor);
                                }
                                // Ensure physics resets use the new color
                                mesh.userData.brickcolor = hex; 
                            }
                        }
                    }

                    // --- Physics Setup ---
                    let torsoIndex = -1;
                    for (let i = startIndex; i < meshes.length; i++) {
                        if (meshes[i].name === "Torso") {
                            torsoIndex = i;
                            break;
                        }
                    }

                    if (torsoIndex === -1) {
                        console.error("No Torso found in character model");
                        return;
                    }

                    characterMesh = meshes[torsoIndex];
                    characterBody = bodies[torsoIndex];
                    characterParts = [];

                    const torsoPos = characterBody.position.clone();

                    // Transfer character meshes from global list to playerGroup and setup local offsets
                    for (let i = startIndex; i < bodies.length; i++) {
                        const mesh = meshes[i];
                        const body = bodies[i];
                        
                        // Calculate relative offset from torso
                        body.position.vsub(torsoPos, body.position);
                        mesh.position.sub(new THREE.Vector3(torsoPos.x, torsoPos.y, torsoPos.z));
                        
                        playerGroup.add(mesh);
                        characterParts.push({ mesh, body });
                    }

                    // Move whole character to spawn height
                    const spawnOffset = new CANNON.Vec3(0, 20, 0);
                    characterParts.forEach(part => {
                        part.body.position.vadd(spawnOffset, part.body.position);
                        part.mesh.position.copy(part.body.position);
                    });

                    // Configure Torso Physics
                    characterBody.type = CANNON.Body.DYNAMIC;
                    characterBody.mass = 50;
                    characterBody.fixedRotation = true;
                    characterBody.linearDamping = 0.4;
                    characterBody.collisionFilterGroup = GROUP_PLAYER;
                    characterBody.collisionFilterMask = GROUP_ENVIRONMENT | 1;
                    characterBody.updateMassProperties();

                    // Weld Limbs to Torso
                    characterParts.forEach((part, idx) => {
                        // Skip the torso itself
                        if (part.mesh === characterMesh) return;
                        
                        const body = part.body;
                        body.type = CANNON.Body.DYNAMIC;
                        body.mass = 5;
                        body.collisionFilterGroup = GROUP_PLAYER;
                        body.collisionFilterMask = GROUP_ENVIRONMENT | 1;
                        body.updateMassProperties();

                        const weld = new CANNON.LockConstraint(characterBody, body, {
                            maxForce: 1e10,
                            maxTorque: 1e10
                        });
                        world.addConstraint(weld);
                    });

                    if (typeof bakeInitialConnections === "function") bakeInitialConnections();
                    if (typeof handleConnections === "function") handleConnections();

                    window.characterBody = characterBody;
                    window.characterMesh = characterMesh;

                    isCharacterLoaded = true;
                    console.log("Character loaded with Hybrid XML support + Database colors");
                });
        })
        .catch(console.error);
}

// ──────────────────────────────────────────────────────────────
// Player movement & sync
// ──────────────────────────────────────────────────────────────
function updatePlayer(deltaTime = 1 / 60) {
    if (!characterBody || !window.camera) return;

    // 1. Combine Keyboard + Mobile Thumbstick Inputs
    let inputX = 0, inputZ = 0;
    
    if (keys["KeyW"]) inputZ += 1;
    if (keys["KeyS"]) inputZ -= 1;
    if (keys["KeyA"]) inputX -= 1;
    if (keys["KeyD"]) inputX += 1;

    if (typeof mobileControls !== 'undefined' && mobileControls.joystick.active) {
        inputX += mobileControls.moveVector.x;
        inputZ += mobileControls.moveVector.y;
    }

    const cam = window.camera;
    cam.getWorldDirection(camForward);
    camForward.y = 0; 
    camForward.normalize();
    camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

    const moveX = camForward.x * inputZ + camRight.x * inputX;
    const moveZ = camForward.z * inputZ + camRight.z * inputX;

    // 2. Handle Rotation
    if (Math.abs(moveX) > 0.1 || Math.abs(moveZ) > 0.1) {
        targetYaw = Math.atan2(moveX, moveZ);
    }

    const turnSpeed = 8; 
    let deltaYaw = targetYaw - currentYaw;
    deltaYaw = Math.atan2(Math.sin(deltaYaw), Math.cos(deltaYaw));
    currentYaw += deltaYaw * Math.min(1, turnSpeed * deltaTime);
    characterBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), currentYaw);

    // 3. Apply Velocity
    const velX = moveX * moveSpeed;
    const velZ = moveZ * moveSpeed;

    characterParts.forEach(part => {
        part.body.velocity.x = velX;
        part.body.velocity.z = velZ;
    });

    // 4. Handle Jumping
let jumpRequested = keys["Space"];
if (typeof mobileControls !== 'undefined' && mobileControls.jumpButton.active) {
    jumpRequested = true;
}

if (jumpRequested && !spacePressed && isGrounded()) {
    characterBody.velocity.y = jumpForce;
    spacePressed = true;
}

const mobileJumpActive = (typeof mobileControls !== 'undefined') ? mobileControls.jumpButton.active : false;
if (!keys["Space"] && !mobileJumpActive) {
    spacePressed = false;
}

    // 5. Sync Every Part (Mesh follows Body)
    characterParts.forEach(part => {
        part.mesh.position.copy(part.body.position);
        part.mesh.quaternion.copy(part.body.quaternion);
    });

    // Respawn logic (Void protection)
    if (characterBody.position.y < -20) {
        const respawnPos = new CANNON.Vec3(0, 55, 0);
        const currentPos = characterBody.position.clone();
        const offset = respawnPos.vsub(currentPos); 

        characterParts.forEach(part => {
            part.body.position.vadd(offset, part.body.position); 
            part.body.velocity.set(0, 0, 0);
            part.body.angularVelocity.set(0, 0, 0);
        });
    }
}

// ──────────────────────────────────────────────────────────────
// Ground detection
// ──────────────────────────────────────────────────────────────
function isGrounded() {
    if (!characterBody) return false;

    // Use torso bottom as start (more reliable than center)
    const torsoHalfHeight = 1; // half of Y=2 size
    const start = characterBody.position.clone();
    start.y -= torsoHalfHeight;  // now at ~22.5 when standing

    const rayLength = 0.4 + 0.1; // small extra margin for slopes/noise
    const end = start.clone();
    end.y -= rayLength;

    const result = new CANNON.RaycastResult();
    const rayOptions = {
        collisionFilterMask: GROUP_ENVIRONMENT,
        // Important: ignore ALL player bodies to prevent self-hits
        skip: characterParts.map(p => p.body)
    };

    const hasHit = world.raycastClosest(start, end, rayOptions, result);

    if (hasHit) {
        // Optional: only count near-horizontal floors (good for slopes)
        const worldUp = new CANNON.Vec3(0, 1, 0);
        return result.hitNormalWorld.dot(worldUp) > 0.7; // ~45° max slope
    }

    return false;
}

// ──────────────────────────────────────────────────────────────
// Map loading with Hybrid Support
// ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    const btnExit = document.getElementById('btn-exit');
    const btnInfo = document.getElementById('btn-info');
    const fileInput = document.getElementById('map-loader');

    if(btnExit) btnExit.onclick = () => window.location.href = "menu.html";

    if(btnInfo) {
        btnInfo.onclick = () => {
            alert("Galaxia Studio\nBuild 2026\n\nWASD - Move\nSpace - Jump\nRight Click - Camera");
        };
    }

    if(fileInput) {
        fileInput.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                const content = e.target.result;

                // Cleanup existing map
                if (typeof meshes !== 'undefined' && typeof bodies !== 'undefined') {
                    for (let i = meshes.length - 1; i >= 0; i--) {
                        // Keep character meshes!
                        if (playerGroup.children.includes(meshes[i])) continue; 

                        scene.remove(meshes[i]);
                        if (bodies[i] && world) world.removeBody(bodies[i]);
                        meshes.splice(i, 1);
                        bodies.splice(i, 1);
                    }
                }

                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(content, "text/xml");
                
                // Identify Root Node (Modern or Legacy)
                const rootNode = xmlDoc.querySelector("galaxia, galaxia-game") || xmlDoc.documentElement;
                
                // Handle Gravity (Modern format uses 'value', Legacy uses 'val')
                const gravModern = xmlDoc.querySelector('item[className="Workspace"] > properties > gravity');
                const gravLegacy = xmlDoc.querySelector("workspace > config > gravity");
                const gravNode = gravModern || gravLegacy;

                if (gravNode && world) {
                    const valAttr = gravNode.getAttribute("value") || gravNode.getAttribute("val");
                    world.gravity.set(0, parseFloat(valAttr), 0);
                }

                // Process the map elements
                if (typeof processElements === "function") {
                    processElements(rootNode);

                    // Teleport character to spawn point of new map
                    if (characterBody) {
                        const spawnPos = new CANNON.Vec3(0, 15, 0);
                        const currentPos = characterBody.position.clone();
                        const offset = spawnPos.vsub(currentPos);
                        characterParts.forEach(part => {
                            part.body.position.vadd(offset, part.body.position);
                            part.body.velocity.set(0,0,0);
                            part.body.angularVelocity.set(0,0,0);
                        });
                    }
                }
            };
            reader.readAsText(file);
            fileInput.value = ''; // Reset input
        };
    }
});

// Input handling
window.addEventListener("keydown", e => keys[e.code] = true);
window.addEventListener("keyup", e => keys[e.code] = false);

// Public API
window.loadCharacter = loadCharacter;
window.updatePlayer = updatePlayer;

// Initialize
setTimeout(loadCharacter, 500);