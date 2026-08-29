// ──────────────────────────────────────────────────────────────
// Global variables
// ──────────────────────────────────────────────────────────────
let characterBody = null;
let characterMesh = null;
const moveSpeed = 13;
const jumpForce = 50;
let keys = {};
let spacePressed = false;
let isCharacterLoaded = false;

const GROUP_PLAYER = 1;
const GROUP_ENVIRONMENT = 2;

const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();

let currentYaw = 0;
let targetYaw = 0;

// Permanent containers
const playerGroup = new THREE.Group();
scene.add(playerGroup);

let characterParts = [];

// ──────────────────────────────────────────────────────────────
// Ground detection (Generous Velocity-based)
// ──────────────────────────────────────────────────────────────
function isGrounded() {
    if (!characterBody) return false;

    // Check if vertical movement is nearly zero. 
    // This allows jumping on any surface without strict raycast alignment.
    return Math.abs(characterBody.velocity.y) < 0.5;
}

// ──────────────────────────────────────────────────────────────
// Player movement & sync
// ──────────────────────────────────────────────────────────────
function updatePlayer(deltaTime = 1 / 60) {
    if (!characterBody || !window.camera || !isCharacterLoaded) return;

    // 1. Input Handling
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

    // 2. Rotation
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

    // 4. Handle Jumping (Single Jump Only)
    let jumpRequested = keys["Space"] || (typeof mobileControls !== 'undefined' && mobileControls.jumpButton.active);

    if (jumpRequested) {
        if (!spacePressed && isGrounded()) {
            characterBody.velocity.y = jumpForce;
            spacePressed = true; 
        }
    } else {
        spacePressed = false;
    }

    // 5. Sync Mesh to Physics
    characterParts.forEach(part => {
        part.mesh.position.copy(part.body.position);
        part.mesh.quaternion.copy(part.body.quaternion);
    });

    // Respawn logic
    if (characterBody.position.y < -20) {
        const respawnPos = new CANNON.Vec3(0, 55, 0);
        const offset = respawnPos.vsub(characterBody.position); 

        characterParts.forEach(part => {
            part.body.position.vadd(offset, part.body.position); 
            part.body.velocity.set(0, 0, 0);
            part.body.angularVelocity.set(0, 0, 0);
        });
    }
}

// ──────────────────────────────────────────────────────────────
// Character loading & setup
// ──────────────────────────────────────────────────────────────
function loadCharacter() {
    if (isCharacterLoaded) return;

    fetch("get_colors.php")
        .then(res => res.json())
        .catch(err => {
            console.warn("Could not load custom colors, using XML defaults.", err);
            return null;
        })
        .then(userColors => {
            return fetch("assets/player/character.xml")
                .then(res => res.text())
                .then(str => {
                    const xml = new DOMParser().parseFromString(str, "text/xml");
                    const modelNode = xml.querySelector('item[className="Model"]') || 
                                     xml.getElementsByTagName("model")[0];

                    if (!modelNode) {
                        console.error("No Character Model found in XML");
                        return;
                    }

                    const startIndex = meshes.length;
                    processElements(modelNode);

                    const textureLoader = new THREE.TextureLoader();

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
                                const cleanHex = hex.toString().replace('0x', '#');
                                const threeColor = new THREE.Color(cleanHex);
                                if (Array.isArray(mesh.material)) {
                                    mesh.material.forEach(mat => mat.color.copy(threeColor));
                                } else {
                                    mesh.material.color.copy(threeColor);
                                }
                                mesh.userData.brickcolor = hex; 
                            }

                            // Calculate geometry size for decal placement
                            mesh.geometry.computeBoundingBox();
                            const size = new THREE.Vector3();
                            mesh.geometry.boundingBox.getSize(size);

                            // Face Decal Logic
                            if (mesh.name === "Head") {
                                const faceTexture = textureLoader.load('assets/textures/face.png');
                                faceTexture.magFilter = THREE.NearestFilter;
                                faceTexture.minFilter = THREE.NearestFilter;

                                const decalGeom = new THREE.PlaneGeometry(size.x, size.y);
                                const decalMat = new THREE.MeshBasicMaterial({
                                    map: faceTexture,
                                    transparent: true,
                                    side: THREE.FrontSide
                                });
                                const decalMesh = new THREE.Mesh(decalGeom, decalMat);
                                decalMesh.position.set(0, 0, (size.z / 2) + 0.01);
                                mesh.add(decalMesh);
                            }

                            // T-Shirt Decal Logic
                            if (mesh.name === "Torso" && userColors.shirtID && userColors.shirtID !== "0" && userColors.shirtID !== "N/A") {
                                const shirtPath = `../avatar/catalog/${userColors.shirtID}.png`;
                                const shirtTexture = textureLoader.load(shirtPath);
                                shirtTexture.magFilter = THREE.NearestFilter;
                                shirtTexture.minFilter = THREE.NearestFilter;

                                const shirtGeom = new THREE.PlaneGeometry(size.x, size.y);
                                const shirtMat = new THREE.MeshBasicMaterial({
                                    map: shirtTexture,
                                    transparent: true,
                                    side: THREE.FrontSide
                                });
                                const shirtMesh = new THREE.Mesh(shirtGeom, shirtMat);
                                shirtMesh.position.set(0, 0, (size.z / 2) + 0.01);
                                mesh.add(shirtMesh);
                            }
                        }
                    }

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

                    for (let i = startIndex; i < bodies.length; i++) {
                        const mesh = meshes[i];
                        const body = bodies[i];
                        
                        body.position.vsub(torsoPos, body.position);
                        mesh.position.sub(new THREE.Vector3(torsoPos.x, torsoPos.y, torsoPos.z));
                        
                        playerGroup.add(mesh);
                        characterParts.push({ mesh, body });
                    }

                    const spawnOffset = new CANNON.Vec3(0, 20, 0);
                    characterParts.forEach(part => {
                        part.body.position.vadd(spawnOffset, part.body.position);
                        part.mesh.position.copy(part.body.position);
                    });

                    world.solver.iterations = 25; 

                    characterBody.type = CANNON.Body.DYNAMIC;
                    characterBody.mass = 50;
                    characterBody.fixedRotation = true;
                    characterBody.linearDamping = 0.4;
                    characterBody.collisionFilterGroup = GROUP_PLAYER;
                    characterBody.collisionFilterMask = GROUP_ENVIRONMENT | 1;
                    characterBody.updateMassProperties();

                    characterParts.forEach((part, idx) => {
                        if (part.mesh === characterMesh) return;
                        
                        const body = part.body;
                        body.type = CANNON.Body.DYNAMIC;
                        body.mass = 5;
                        body.collisionFilterGroup = GROUP_PLAYER;
                        body.collisionFilterMask = GROUP_ENVIRONMENT | 1;
                        body.updateMassProperties();

                        const weld = new CANNON.LockConstraint(characterBody, body);
                        weld.force = 1e15; 
                        weld.torque = 1e15;
                        world.addConstraint(weld);
                    });

                    if (typeof bakeInitialConnections === "function") bakeInitialConnections();
                    if (typeof handleConnections === "function") handleConnections();

                    window.characterBody = characterBody;
                    window.characterMesh = characterMesh;

                    isCharacterLoaded = true;
                });
        })
        .catch(console.error);
}
// ──────────────────────────────────────────────────────────────
// Map loading
// ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('map-loader');
    if(fileInput) {
        fileInput.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                const content = e.target.result;

                if (typeof meshes !== 'undefined' && typeof bodies !== 'undefined') {
                    for (let i = meshes.length - 1; i >= 0; i--) {
                        if (playerGroup.children.includes(meshes[i])) continue; 
                        scene.remove(meshes[i]);
                        if (bodies[i] && world) world.removeBody(bodies[i]);
                        meshes.splice(i, 1);
                        bodies.splice(i, 1);
                    }
                }

                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(content, "text/xml");
                const rootNode = xmlDoc.querySelector("galaxia, galaxia-game") || xmlDoc.documentElement;
                
                if (typeof processElements === "function") {
                    processElements(rootNode);
                    if (characterBody) {
                        const spawnPos = new CANNON.Vec3(0, 15, 0);
                        const offset = spawnPos.vsub(characterBody.position);
                        characterParts.forEach(part => {
                            part.body.position.vadd(offset, part.body.position);
                            part.body.velocity.set(0,0,0);
                        });
                    }
                }
            };
            reader.readAsText(file);
            fileInput.value = ''; 
        };
    }
});

// Input handling
window.addEventListener("keydown", e => keys[e.code] = true);
window.addEventListener("keyup", e => keys[e.code] = false);

// Global Exposure
window.loadCharacter = loadCharacter;
window.updatePlayer = updatePlayer;
window.isGrounded = isGrounded;

// Initialize
setTimeout(loadCharacter, 500);