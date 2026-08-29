// builder.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { applyDecal } from './decals.js';
import { loadSpecialMesh } from './meshes.js';
import { createSound } from './sounds.js'; // Added sound import

const texLoader = new THREE.TextureLoader();
let physicalParts = [];

function fixPath(path) {
    return path.replace("lumisle://", "content/");
}

export function parseVector(str) {
    if (!str || typeof str !== 'string') return [0, 0, 0];
    return str.split(',').map(v => parseFloat(v.trim()) || 0);
}

export function parseColor(str) {
    if (!str || typeof str !== 'string') return { r: 1, g: 1, b: 1 };
    const parts = str.split(',').map(c => {
        const val = parseInt(c.trim());
        return isNaN(val) ? 255 : val; 
    });
    return { 
        r: (parts[0] !== undefined ? parts[0] : 255) / 255, 
        g: (parts[1] !== undefined ? parts[1] : 255) / 255, 
        b: (parts[2] !== undefined ? parts[2] : 255) / 255 
    };
}

export function registerPhysicalPart(mesh, data = { properties: { Anchored: "false" } }) {
    physicalParts.push({ mesh, data });
}

function applyCombinedTransparency(mesh) {
    const baseT = mesh.userData.baseTransparency || 0;
    const modifierT = mesh.userData.localTransparencyModifier || 0;
    const finalOpacity = (1 - baseT) * (1 - modifierT);

    const updateMat = (m) => {
        if (!m) return;
        m.transparent = finalOpacity < 1.0;
        m.opacity = finalOpacity;
        m.needsUpdate = true;
    };

    if (Array.isArray(mesh.material)) {
        mesh.material.forEach(updateMat);
    } else {
        updateMat(mesh.material);
    }
}

export function processTexture(image, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = image.width;
    canvas.height = image.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const targetR = color.r * 255;
    const targetG = color.g * 255;
    const targetB = color.b * 255;

    for (let i = 0; i < data.length; i += 4) {
        const texR = data[i];
        const texG = data[i + 1];
        const texB = data[i + 2];
        
        const L = (texR + texG + texB) / 3;

        data[i]     = Math.max(0, Math.min(255, targetR + (L - 128)));
        data[i + 1] = Math.max(0, Math.min(255, targetG + (L - 128)));
        data[i + 2] = Math.max(0, Math.min(255, targetB + (L - 128)));
        
    }
    
    ctx.putImageData(imageData, 0, 0);
    const newTex = new THREE.CanvasTexture(canvas);
    newTex.magFilter = THREE.LinearFilter;
    newTex.minFilter = THREE.LinearMipmapLinearFilter;
    newTex.generateMipmaps = true;
    newTex.wrapS = THREE.RepeatWrapping;
    newTex.wrapT = THREE.RepeatWrapping;
    return newTex;
}

export function updateObjectProperty(mesh, prop, value) {
    const body = mesh.userData.physicsBody;

    switch (prop) {
        case "LocalTransparencyModifier": {
            mesh.userData.localTransparencyModifier = parseFloat(value);
            applyCombinedTransparency(mesh);
            break;
        }

        case "Color":
        case "Color3": {
            const color = (typeof value === "string") ? parseColor(value) : value;
            const threeColor = new THREE.Color(color.r, color.g, color.b);
            mesh.userData.xmlColor = color; 

            const applyToMat = (m) => {
                if (!m) return;
                
                if (m.map && m.map.image) {
                    const oldMap = m.map;
                    const sourceImage = oldMap.userData.originalImage || oldMap.image;
                    const newCanvasTex = processTexture(sourceImage, color);
                    
                    newCanvasTex.userData.originalImage = sourceImage;
                    newCanvasTex.repeat.copy(oldMap.repeat);
                    newCanvasTex.offset.copy(oldMap.offset);
                    newCanvasTex.wrapS = oldMap.wrapS;
                    newCanvasTex.wrapT = oldMap.wrapT;
                    
                    m.map = newCanvasTex;
                    m.color.set(0xffffff); 
                    oldMap.dispose();
                } else {
                    m.color.copy(threeColor);
                }
                m.needsUpdate = true;
            };

            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(applyToMat);
            } else {
                applyToMat(mesh.material);
            }

            mesh.traverse((child) => {
                if (child !== mesh && child.isMesh) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(applyToMat);
                    } else {
                        applyToMat(child.material);
                    }
                }
            });
            break;
        }

        case "Size": {
            const size = (typeof value === "string") ? parseVector(value) : value;
            const sx = size.x !== undefined ? size.x : size[0];
            const sy = size.y !== undefined ? size.y : size[1];
            const sz = size.z !== undefined ? size.z : size[2];

            mesh.scale.set(sx, sy, sz);
            if (body) {
                if (body.shapes[0] instanceof CANNON.Box) {
                    body.shapes[0].halfExtents.set(sx / 2, sy / 2, sz / 2);
                    body.shapes[0].updateConvexPolyhedronRepresentation();
                } else if (body.shapes[0] instanceof CANNON.Sphere) {
                    body.shapes[0].radius = (sx + sy + sz) / 6;
                }
                body.updateBoundingRadius();
                body.updateMassProperties();
            }
            break;
        }

        case "Position": {
            const pos = (typeof value === "string") ? parseVector(value) : value;
            const px = pos.x !== undefined ? pos.x : pos[0];
            const py = pos.y !== undefined ? pos.y : pos[1];
            const pz = pos.z !== undefined ? pos.z : pos[2];

            mesh.position.set(px, py, pz);
            if (body) {
                body.position.set(px, py, pz);
                body.velocity.set(0, 0, 0); 
            }
            break;
        }

        case "Orientation":
        case "Rotation": {
            const isDeg = (prop === "Orientation");
            const rot = (typeof value === "string") ? parseVector(value) : value;
            
            const rx = rot.x !== undefined ? rot.x : rot[0];
            const ry = rot.y !== undefined ? rot.y : rot[1];
            const rz = rot.z !== undefined ? rot.z : rot[2];

            const finalX = isDeg ? THREE.MathUtils.degToRad(rx) : rx;
            const finalY = isDeg ? THREE.MathUtils.degToRad(ry) : ry;
            const finalZ = isDeg ? THREE.MathUtils.degToRad(rz) : rz;

            mesh.rotation.set(finalX, finalY, finalZ);
            
            if (body) {
                const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
                body.quaternion.set(q.x, q.y, q.z, q.w);
                // Re-apply cylinder offset if necessary
                if (mesh.userData.isCylinder) {
                    const offset = new CANNON.Quaternion();
                    offset.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
                    body.quaternion = body.quaternion.mult(offset);
                }
            }
            break;
        }

        case "Transparency": {
            mesh.userData.baseTransparency = parseFloat(value);
            applyCombinedTransparency(mesh);
            break;
        }

        case "Anchored": {
            const isAnchored = value === "true" || value === true;
            if (body) {
                body.type = isAnchored ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC;
                body.mass = isAnchored ? 0 : 1;
                body.updateMassProperties();
                if (isAnchored) {
                    body.velocity.set(0, 0, 0);
                    body.angularVelocity.set(0, 0, 0);
                }
            }
            mesh.userData.anchored = isAnchored;
            break;
        }

        case "CanCollide":
        case "Cancollide": {
            const canCollide = value === "true" || value === true;
            if (body) {
                body.collisionResponse = canCollide;
            }
            break;
        }
        
        case "Name": {
            mesh.name = value;
            break;
        }

        case "Playing": {
            if (mesh.play && mesh.stop) {
                if (value === "true" || value === true) mesh.play();
                else mesh.stop();
            }
            break;
        }
    }
}

function applyRadialUVs(geometry, size, type) {
    const uvAttribute = geometry.attributes.uv;
    for (let i = 0; i < uvAttribute.count; i++) {
        let u = uvAttribute.getX(i);
        let v = uvAttribute.getY(i);
        if (type === "Sphere") { u *= (size[0] + size[2]) / 2; v *= size[1]; } 
        else if (type === "Cylinder") { u *= Math.max(size[0], size[2]) * Math.PI; v *= size[1]; }
        uvAttribute.setXY(i, u / 2, v / 4); 
    }
    uvAttribute.needsUpdate = true;
}

export function removeWelds(world, mesh, targetMesh = null) {
    const bodyA = mesh.userData.physicsBody;
    if (!bodyA || !world) return;
    const bodyB = targetMesh ? targetMesh.userData.physicsBody : null;
    for (let i = world.constraints.length - 1; i >= 0; i--) {
        const c = world.constraints[i];
        if (c.bodyA === bodyA || c.bodyB === bodyA) {
            if (bodyB) {
                if (c.bodyA === bodyB || c.bodyB === bodyB) world.removeConstraint(c);
            } else {
                world.removeConstraint(c);
            }
        }
    }
}

function applyAutomaticWelds(world, parts) {
    for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
            const partA = parts[i];
            const partB = parts[j];
            if (partA.data.properties.Anchored === "true" && partB.data.properties.Anchored === "true") continue;
            const boxA = new THREE.Box3().setFromObject(partA.mesh);
            const boxB = new THREE.Box3().setFromObject(partB.mesh);
            boxA.expandByScalar(0.05);
            if (boxA.intersectsBox(boxB)) {
                const sA = partA.data.properties.Surface || {};
                const sB = partB.data.properties.Surface || {};
                const typesA = Object.values(sA);
                const typesB = Object.values(sB);
                const shouldWeld = typesA.some(tA => typesB.some(tB => {
                    if (tA === 'Weld' || tB === 'Weld') return true;
                    if ((tA === 'Studs' && tB === 'Inlets') || (tA === 'Inlets' && tB === 'Studs')) return true;
                    if ((tA === 'Studs' || tA === 'Inlets') && (tB === 'Universal')) return true;
                    if ((tB === 'Studs' || tB === 'Inlets') && (tA === 'Universal')) return true;
                    return false;
                }));
                if (shouldWeld) {
                    const bodyA = partA.mesh.userData.physicsBody;
                    const bodyB = partB.mesh.userData.physicsBody;
                    if (bodyA && bodyB && bodyA !== bodyB) {
                        const constraint = new CANNON.LockConstraint(bodyA, bodyB);
                        world.addConstraint(constraint);
                    }
                }
            }
        }
    }
}

export function buildWorkspace(scene, data, world) {
    physicalParts = [];
    data.forEach(item => {
        if (item.class === "Workspace") {
            if (item.properties.FallenPartsDestroyHeight) {
                scene.userData.fallenPartsDestroyHeight = parseFloat(item.properties.FallenPartsDestroyHeight);
            }
            item.children.forEach(child => processItem(scene, child, world, physicalParts));
        } else if (item.class === "Lighting") {
            setupLighting(scene, item.properties);
        }
    });
    if (world) applyAutomaticWelds(world, physicalParts);
    scene.userData.physicalParts = physicalParts;
}

function processItem(parent, item, world, physicalParts) {
    const isPart = ["Part", "SpawnLocation", "MeshPart", "WedgePart", "CornerWedgePart"].includes(item.class);
    
    if (isPart) {
        const mesh = createObject(parent, item, world);
        if (mesh) physicalParts.push({ mesh, data: item });
    } else if (item.class === "Model" || item.class === "Folder") {
        const group = new THREE.Group();
        group.name = item.properties.Name || item.class;
        parent.add(group);
        if (item.children) {
            item.children.forEach(child => processItem(group, child, world, physicalParts));
        }
    } else if (item.class === "Sound" || item.class === "Script") {
        createObject(parent, item, world);
    }
}
export function createObject(scene, data, world, group = null) {
    const props = data.properties;
    const className = data.class;

    // 1. Handle Container Classes (Workspace, ScriptService, Lighting, Model)
    if (["Workspace", "ScriptService", "Lighting", "Model"].includes(className)) {
        const container = new THREE.Group();
        container.name = props.Name || className;
        
        if (group) group.add(container); else scene.add(container);
        
        // Critical: If this is the Workspace, set a global ref for scripts
        if (className === "Workspace") window.workspace = container;
        
        return container; 
    }

    // 2. Handle Scripts
    if (className === "Script") {
        const scriptObj = new THREE.Object3D();
        scriptObj.name = props.Name || "Script";
        // Link the XML data to the Three.js instance so ScriptService can find it
        data.instance = scriptObj; 
        
        if (group) group.add(scriptObj); else scene.add(scriptObj);
        return scriptObj;
    }

    // 3. Handle Sounds
    if (className === "Sound") {
        const parent = group || scene;
        const sound = createSound(parent, props);
        if (props.Position) {
            const pos = parseVector(props.Position);
            sound.position.set(pos[0], pos[1], pos[2]);
        }
        sound.name = props.Name || "Sound";
        return sound;
    }

    // 4. Handle Parts (Existing Logic)
    if (!props.Size || !props.Position) return null;

    const size = parseVector(props.Size);
    const pos = parseVector(props.Position);
    const rot = parseVector(props.Orientation || "0, 0, 0");
    const color = parseColor(props.Color3 || "255, 255, 255");
    const transparency = props.Transparency ? parseFloat(props.Transparency) : 0;
    const partType = props.PartType || "Brick";
    const anchored = props.Anchored === "true";

    let geometry;
    let physShape;

    if (partType === "Sphere") {
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        applyRadialUVs(geometry, size, "Sphere");
        physShape = new CANNON.Sphere((size[0] + size[1] + size[2]) / 6);
    } else if (partType === "Cylinder") {
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        applyRadialUVs(geometry, size, "Cylinder");
        physShape = new CANNON.Cylinder(size[0] / 2, size[2] / 2, size[1], 32);
    } else {
        geometry = new THREE.BoxGeometry(1, 1, 1);
        physShape = new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
    }

    const threeColor = new THREE.Color(color.r, color.g, color.b);
    let materials;

    if (partType === "Sphere") {
        materials = new THREE.MeshStandardMaterial({ color: threeColor, transparent: transparency > 0, opacity: 1 - transparency, roughness: 0.4, metalness: 0.0 });
    } else if (partType === "Cylinder") {
        const sideMat = new THREE.MeshStandardMaterial({ color: threeColor, transparent: transparency > 0, opacity: 1 - transparency, roughness: 0.4, metalness: 0.0 });
        const capMat = new THREE.MeshStandardMaterial({ color: threeColor, transparent: transparency > 0, opacity: 1 - transparency, roughness: 0.4, metalness: 0.0 });
        const sideSurface = (props.Surface && props.Surface.top) || 'Smooth';
        if (sideSurface !== 'Smooth') {
            texLoader.load(fixPath(`lumisle://textures/${sideSurface}.png`), (texImage) => {
                const currentColor = mesh.userData.xmlColor || color;
                const tinted = processTexture(texImage.image, currentColor);
                tinted.userData.originalImage = texImage.image;
                sideMat.map = tinted;
                sideMat.color.set(0xffffff); 
                sideMat.needsUpdate = true;
            });
        }
        materials = [sideMat, capMat, capMat];
    } else {
        materials = [];
        const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
        const faceDims = [[size[2], size[1]], [size[2], size[1]], [size[0], size[2]], [size[0], size[2]], [size[0], size[1]], [size[0], size[1]]];
        faces.forEach((face, index) => {
            const mat = new THREE.MeshStandardMaterial({ color: threeColor, transparent: transparency > 0, opacity: 1 - transparency, roughness: 0.4, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
            const surfaceType = (props.Surface && props.Surface[face]) || 'Smooth';
            if (surfaceType !== 'Smooth') {
                const [fw, fh] = faceDims[index];
                texLoader.load(fixPath(`lumisle://textures/${surfaceType}.png`), (texImage) => {
                    const currentColor = mesh.userData.xmlColor || color;
                    const tinted = processTexture(texImage.image, currentColor);
                    tinted.userData.originalImage = texImage.image;
                    tinted.repeat.set(fw / 2, fh / 4);
                    mat.map = tinted;
                    mat.color.set(0xffffff);
                    mat.userData.isSurfaceLoaded = true;
                    mat.needsUpdate = true;
                    mesh.dispatchEvent({ type: 'SurfaceLoaded' });
                });
            }
            materials.push(mat);
        });
    }

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = props.Name || "Part";
    mesh.userData.xmlColor = color;
    mesh.userData.isCylinder = (partType === "Cylinder");
    mesh.userData.baseTransparency = transparency;
    mesh.userData.localTransparencyModifier = 0;
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(rot[0]), 
        THREE.MathUtils.degToRad(rot[1]), 
        THREE.MathUtils.degToRad(rot[2]), 
        'XYZ'
    ));
    mesh.quaternion.copy(quat);

    if (data.children) {
        data.children.forEach(child => {
            if (child.class === "Decal") {
                applyDecal(mesh, child, size);
            } else if (child.class === "SpecialMesh") {
                mesh.userData.hasSpecialMesh = true;
                loadSpecialMesh(mesh, child, fixPath);
            } else if (child.class === "Sound") {
                createObject(scene, child, world, mesh);
            } else if (child.class === "Script") {
                createObject(scene, child, world, mesh);
            }
        });
    }

    mesh.castShadow = props.CastShadow !== "false"; 
    mesh.receiveShadow = true;
    if (group) group.add(mesh); else scene.add(mesh);

    if (world) {
        const body = new CANNON.Body({
            mass: anchored ? 0 : 1,
            shape: physShape,
            position: new CANNON.Vec3(pos[0], pos[1], pos[2]),
            quaternion: new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w)
        });
        if (partType === "Cylinder") {
            const q = new CANNON.Quaternion();
            q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
            body.quaternion = body.quaternion.mult(q);
        }
        world.addBody(body);
        mesh.userData.physicsBody = body;
    }

    return mesh;
}

export function setupLighting(scene, props) {
    const ambientLight = scene.children.find(c => c instanceof THREE.AmbientLight);
    const sunLight = scene.children.find(c => c instanceof THREE.DirectionalLight);
    const brightness = props.Brightness ? parseFloat(props.Brightness) : 1;
    const ambColor = parseColor(props.Ambient || "255, 255, 255");
    const sunColor = parseColor(props.Color || "255, 255, 255");
    if (ambientLight) { ambientLight.color.setRGB(ambColor.r, ambColor.g, ambColor.b); ambientLight.intensity = brightness * 0.5; }
    if (sunLight) { sunLight.color.setRGB(sunColor.r, sunColor.g, sunColor.b); sunLight.intensity = brightness * 1.2; }
}

export function cleanupFallenParts(scene, world) {
    const threshold = scene.userData.fallenPartsDestroyHeight;
    if (threshold === undefined || !physicalParts) return;
    for (let i = physicalParts.length - 1; i >= 0; i--) {
        const part = physicalParts[i];
        const mesh = part.mesh;
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        if (worldPos.y < threshold) {
            const body = mesh.userData.physicsBody;
            if (body) { removeWelds(world, mesh); world.removeBody(body); }
            if (mesh.parent) mesh.parent.remove(mesh);
            physicalParts.splice(i, 1);
        }
    }
}