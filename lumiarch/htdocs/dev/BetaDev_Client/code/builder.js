// builder.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { applyDecal } from './decals.js';
import { loadSpecialMesh } from './meshes.js';

const texLoader = new THREE.TextureLoader();

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

export function updateObjectProperty(mesh, prop, value) {
    const body = mesh.userData.physicsBody;

    switch (prop) {
        case "Color":
        case "Color3": {
            const color = (typeof value === "string") ? parseColor(value) : value;
            const threeColor = new THREE.Color(color.r, color.g, color.b);
            mesh.userData.xmlColor = color; // Store for the loader callback

            const applyToMat = (m) => {
                if (!m) return;
                
                if (m.map && m.map.image) {
                    const newCanvasTex = processTexture(m.map.image, color);
                    
                    newCanvasTex.repeat.copy(m.map.repeat);
                    newCanvasTex.offset.copy(m.map.offset);
                    newCanvasTex.wrapS = m.map.wrapS;
                    newCanvasTex.wrapT = m.map.wrapT;
                    
                    m.map = newCanvasTex;
                    m.color.set(0xffffff); 
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
            mesh.scale.set(size[0], size[1], size[2]);
            
            if (body) {
                if (body.shapes[0] instanceof CANNON.Box) {
                    body.shapes[0].halfExtents.set(size[0] / 2, size[1] / 2, size[2] / 2);
                    body.shapes[0].updateConvexPolyhedronRepresentation();
                } else if (body.shapes[0] instanceof CANNON.Sphere) {
                    body.shapes[0].radius = (size[0] + size[1] + size[2]) / 6;
                }
                body.updateBoundingRadius();
            }
            break;
        }

        case "Position": {
            const pos = (typeof value === "string") ? parseVector(value) : value;
            mesh.position.set(pos[0], pos[1], pos[2]);
            if (body) {
                body.position.set(pos[0], pos[1], pos[2]);
            }
            break;
        }

        case "Orientation": {
            const rot = (typeof value === "string") ? parseVector(value) : value;
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                THREE.MathUtils.degToRad(rot[0]),
                THREE.MathUtils.degToRad(rot[1]),
                THREE.MathUtils.degToRad(rot[2]),
                'XYZ'
            ));
            mesh.quaternion.copy(q);
            if (body) {
                body.quaternion.set(q.x, q.y, q.z, q.w);
                if (mesh.userData.isCylinder) {
                    const tilt = new CANNON.Quaternion();
                    tilt.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
                    body.quaternion = body.quaternion.mult(tilt);
                }
            }
            break;
        }

        case "Transparency": {
            const t = parseFloat(value);
            const applyTrans = (m) => {
                if (!m) return;
                m.transparent = t > 0;
                m.opacity = 1 - t;
            };
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(applyTrans);
            } else {
                applyTrans(mesh.material);
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
        if (type === "Sphere") {
            u *= (size[0] + size[2]) / 2; 
            v *= size[1];
        } else if (type === "Cylinder") {
            u *= Math.max(size[0], size[2]) * Math.PI;
            v *= size[1];
        }
        uvAttribute.setXY(i, u / 2, v / 4); 
    }
    uvAttribute.needsUpdate = true;
}

export function processTexture(image, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = image.width;
    canvas.height = image.height;
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
        const luminance = 0.299 * texR + 0.587 * texG + 0.114 * texB;

        const blend = (c, t) => {
            if (t < 128) {
                let shadowRes = (2 * c * t) / 255;
                return Math.min(255, shadowRes + (c * 0.1));
            } else {
                return 255 - 2 * (255 - c) * (255 - t) / 255;
            }
        };
        
        data[i]     = blend(targetR, luminance);
        data[i + 1] = blend(targetG, luminance);
        data[i + 2] = blend(targetB, luminance);
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
                    const bodyA = partA.mesh.userData.physicsBody || world.bodies.find(b => b.position.almostEquals(new CANNON.Vec3(partA.mesh.position.x, partA.mesh.position.y, partA.mesh.position.z), 0.1));
                    const bodyB = partB.mesh.userData.physicsBody || world.bodies.find(b => b.position.almostEquals(new CANNON.Vec3(partB.mesh.position.x, partB.mesh.position.y, partB.mesh.position.z), 0.1));
                    if (bodyA && bodyB && bodyA !== bodyB) {
                        world.addConstraint(new CANNON.LockConstraint(bodyA, bodyB));
                    }
                }
            }
        }
    }
}

export function buildWorkspace(scene, data, world) {
    const physicalParts = [];
    data.forEach(item => {
        if (item.class === "Workspace") {
            item.children.forEach(child => {
                if (child.class === "Part" || child.class === "SpawnLocation") {
                    const mesh = createObject(scene, child, world);
                    if (mesh) physicalParts.push({ mesh, data: child });
                }
            });
        } else if (item.class === "Lighting") {
            setupLighting(scene, item.properties);
        }
    });
    if (world) applyAutomaticWelds(world, physicalParts);
}

export function createObject(scene, data, world, group = null) {
    const props = data.properties;

    // --- 1. Handle Functional Items (Shirt/Pants) First ---
    if (data.class === "Shirt" || data.class === "Pants") {
        const templateProp = data.class === "Shirt" ? "ShirtTemplate" : "PantsTemplate";
        const rawPath = props[templateProp];
        
        if (rawPath && group) {
            const texturePath = fixPath(rawPath);
            const isShirt = data.class === "Shirt";
            
            texLoader.load(texturePath, (texture) => {
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;

                const UV_MAP = {
                    Torso: { x: 175, y: 20, w: 128, h: 128, d: 64 },
                    Limb:  { x: 40,  y: 20, w: 64,  h: 128, d: 64 }
                };
                const TEMPLATE_SIZE = { width: 585, height: 559 };

                const targets = isShirt 
                    ? ["Torso", "LeftArm", "RightArm"] 
                    : ["LeftLeg", "RightLeg", "Torso"];

                group.traverse((part) => {
                    if (part.isMesh && targets.includes(part.name)) {
                        // Skip applying pants to Torso if a shirt is already there
                        if (!isShirt && part.name === "Torso" && part.userData.hasShirt) return;
                        if (isShirt && part.name === "Torso") part.userData.hasShirt = true;

                        const coords = (part.name === "Torso") ? UV_MAP.Torso : UV_MAP.Limb;
                        const tw = coords.d + coords.w + coords.d + coords.w;
                        const th = coords.d + coords.h + coords.d;

                        const partTex = texture.clone();
                        partTex.needsUpdate = true;
                        partTex.repeat.set(tw / TEMPLATE_SIZE.width, th / TEMPLATE_SIZE.height);
                        partTex.offset.set(
                            coords.x / TEMPLATE_SIZE.width,
                            1 - (coords.y + th) / TEMPLATE_SIZE.height
                        );

                        const applyToMaterial = (m) => {
                            m.map = partTex;
                            m.transparent = true;
                            m.alphaTest = 0.5;
                            m.color.set(0xffffff); 
                            m.needsUpdate = true;
                        };

                        if (Array.isArray(part.material)) {
                            part.material.forEach(applyToMaterial);
                        } else {
                            applyToMaterial(part.material);
                        }
                    }
                });
            });
        }
        return null; // Shirt/Pants don't create their own mesh
    }

    // --- 2. Standard Physical Object Logic (Parts/SpawnLocation) ---
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
        materials = new THREE.MeshStandardMaterial({
            color: threeColor,
            transparent: transparency > 0,
            opacity: 1 - transparency,
            roughness: 0.4,
            metalness: 0.0
        });
    } else if (partType === "Cylinder") {
        const sideMat = new THREE.MeshStandardMaterial({ color: threeColor, transparent: transparency > 0, opacity: 1 - transparency, roughness: 0.4, metalness: 0.0 });
        const capMat = new THREE.MeshStandardMaterial({ color: threeColor, transparent: transparency > 0, opacity: 1 - transparency, roughness: 0.4, metalness: 0.0 });
        const sideSurface = (props.Surface && props.Surface.top) || 'Smooth';
        if (sideSurface !== 'Smooth') {
            texLoader.load(fixPath(`lumisle://textures/${sideSurface}.png`), (texImage) => {
                const currentColor = mesh.userData.xmlColor || color;
                sideMat.map = processTexture(texImage.image, currentColor);
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
            const mat = new THREE.MeshStandardMaterial({ 
                color: threeColor,
                transparent: transparency > 0, 
                opacity: 1 - transparency, 
                roughness: 0.4, 
                metalness: 0.0, 
                polygonOffset: true, 
                polygonOffsetFactor: 1, 
                polygonOffsetUnits: 1 
            });
            const surfaceType = (props.Surface && props.Surface[face]) || 'Smooth';
            if (surfaceType !== 'Smooth') {
                const [faceWidth, faceHeight] = faceDims[index];
                texLoader.load(fixPath(`lumisle://textures/${surfaceType}.png`), (texImage) => {
                    const currentColor = mesh.userData.xmlColor || color;
                    const tinted = processTexture(texImage.image, currentColor);
                    tinted.repeat.set(faceWidth / 2, faceHeight / 4);
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
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]), 'XYZ'));
    mesh.quaternion.copy(quat);

    // --- 3. Process Children (Decals, Meshes, etc) ---
    if (data.children) {
        data.children.forEach(child => {
            if (child.class === "Decal") applyDecal(mesh, child, size);
            else if (child.class === "SpecialMesh") {
                mesh.userData.hasSpecialMesh = true;
                loadSpecialMesh(mesh, child, fixPath);
            }
        });
    }

    mesh.castShadow = props.CastShadow !== "false"; 
    mesh.receiveShadow = true;
    
    if (group) group.add(mesh);
    else scene.add(mesh);

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

    if (ambientLight) {
        ambientLight.color.setRGB(ambColor.r, ambColor.g, ambColor.b);
        ambientLight.intensity = brightness * 0.5;
    }

    if (sunLight) {
        sunLight.color.setRGB(sunColor.r, sunColor.g, sunColor.b);
        sunLight.intensity = brightness * 1.2;
    }
}