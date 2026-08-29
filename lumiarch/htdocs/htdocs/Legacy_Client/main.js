var camera, scene, renderer, world;
var bodies = [];
var meshes = [];
var textureLoader = new THREE.TextureLoader();
var isPlaying = true;
var originalStates = [];

var Workspace = { gravity: -100 };
var Lighting = { brightness: 1, ambient: 0x707070 };
var ServerScriptService = {}; 

var textureScaleX = 0.5;
var textureScaleY = 0.25;

var textures = {};
var texturesLoaded = false;

function loadTexture(path) {
    return new Promise((resolve) => {
        var tex = textureLoader.load(path, () => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
        }, undefined, () => {
            console.warn("Failed to load texture:", path);
            resolve(null);
        });
    });
}

async function loadAllTextures() {
    textures['Studs'] = await loadTexture('assets/textures/Studs.png');
    textures['Inlets'] = await loadTexture('assets/textures/Inlets.png');
    textures['Weld'] = await loadTexture('assets/textures/Weld.png');
    textures['Smooth'] = await loadTexture('assets/textures/Smooth.png');
    texturesLoaded = true;
}

init();

// Handle window resize
function onWindowResize() {
    // Get current viewport dimensions (accounting for your UI panels)
    const leftWidth = 0;   // your left sidebar
    const rightWidth = 0;  // your right properties panel
    const topHeight = 0;   // top bar
    const bottomHeight = 0; // bottom bar/toolbox/etc.

    const vWidth = window.innerWidth - leftWidth - rightWidth;
    const vHeight = window.innerHeight - topHeight - bottomHeight;

    camera.aspect = vWidth / vHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(vWidth, vHeight);
    
}

window.addEventListener('resize', onWindowResize);

onWindowResize();

async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd1e5);

    var leftWidth = 250, rightWidth = 300, topHeight = 115, bottomHeight = 150;
    var vWidth = window.innerWidth - leftWidth - rightWidth;
    var vHeight = window.innerHeight - topHeight - bottomHeight;

    camera = new THREE.PerspectiveCamera(75, vWidth / vHeight, 0.1, 1000);
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(vWidth, vHeight);
    
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.2; 

    var viewportElem = document.getElementById('viewport');
    if (viewportElem) viewportElem.appendChild(renderer.domElement);

    var sun = new THREE.DirectionalLight(0xffffff, Lighting.brightness);
    sun.name = "SunLight";
    sun.position.set(10, 20, 10);
    var fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);
    scene.add(sun);

    var ambient = new THREE.AmbientLight(Lighting.ambient);
    ambient.name = "AmbientLight";
    scene.add(ambient);

    world = new CANNON.World();
    world.gravity.set(0, Workspace.gravity, 0);
    world.addEventListener("postStep", handleConnections);

    await loadAllTextures();
    loadMap('map.xml');
    animate();
}

function loadMap(url) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        processElements(this.responseXML.documentElement);
        
			bakeInitialConnections();
        
			if (typeof updateExplorer === "function") updateExplorer();
		}
	};
    xhttp.open("GET", url, true);
    xhttp.send();
}

function processElements(parent) {
    const items = parent.querySelectorAll(':scope > item');

    items.forEach(item => {
        const className = item.getAttribute('className');
        const properties = item.querySelector(':scope > properties');

        if (className === "Workspace") {
            if (properties) {
                const grav = properties.querySelector('gravity');
                if (grav) {
                    Workspace.gravity = -parseFloat(grav.getAttribute('value'));
                    world.gravity.set(0, Workspace.gravity, 0);
                }
            }
            processElements(item);
        } 
        
        else if (className === "Part") {
			parseObject(item);
		}

        else if (className === "Lighting") {
            if (properties) {
                const ambient = properties.querySelector('ambient');
                const brightness = properties.querySelector('brightness');
                
                if (ambient) Lighting.ambient = ambient.getAttribute('value');
                if (brightness) Lighting.brightness = parseFloat(brightness.getAttribute('value'));
                
                applyGlobalSettings();
            }
        }
    });
}

function processConnections(node) {
    const conns = node.getElementsByTagName('connections')[0];
    if (!conns) return;
    const welds = conns.getElementsByTagName('weld');
    for (let i = 0; i < welds.length; i++) {
        const aId = welds[i].getAttribute('a');
        const bId = welds[i].getAttribute('b');
        const meshA = meshes.find(m => m.userData.id === aId);
        const meshB = meshes.find(m => m.userData.id === bId);
        if (meshA && meshB) {
            const idxA = meshes.indexOf(meshA);
            const idxB = meshes.indexOf(meshB);
            if (idxA !== -1 && idxB !== -1) {
                recreateWeld(bodies[idxA], bodies[idxB], meshA, meshB);
            }
        }
    }
}

function parseObject(itemNode) {
    const props = itemNode.querySelector(':scope > properties');
    if (!props) {
        console.warn("Part missing properties:", itemNode);
        return;
    }

    const name = itemNode.getAttribute('name') || "Part";
    
    const partTypeNode = props.querySelector('partType');
    const partType = partTypeNode ? partTypeNode.textContent : 'Brick';
    
    const posNode = props.querySelector('position');
    const sizeNode = props.querySelector('size');
    const rotNode = props.querySelector('rotation'); // New: get rotation node
    const colorNode = props.querySelector('brickcolor');
    
    if (!posNode || !sizeNode || !colorNode) {
        console.warn("Part missing required properties (position/size/color):", name);
        return;
    }
    
    const colorHex = colorNode.textContent.replace('#', '0x');
    
    const sx = parseFloat(sizeNode.getAttribute('X')) || 2;
    const sy = parseFloat(sizeNode.getAttribute('Y')) || 1;
    const sz = parseFloat(sizeNode.getAttribute('Z')) || 4;

    // New: Parse rotation (default to 0)
    const rx = rotNode ? (parseFloat(rotNode.getAttribute("X")) || 0) : 0;
    const ry = rotNode ? (parseFloat(rotNode.getAttribute("Y")) || 0) : 0;
    const rz = rotNode ? (parseFloat(rotNode.getAttribute("Z")) || 0) : 0;
    
    const anchoredNode = props.querySelector('anchored');
    const cancollideNode = props.querySelector('cancollide');
    
    const anchored = anchoredNode ? anchoredNode.textContent === 'true' : false;
    const canCollide = cancollideNode ? cancollideNode.textContent !== 'false' : true;
    
    const surfaceNode = props.querySelector('surface');
    const surfaceData = {
        topsurface: surfaceNode ? surfaceNode.getAttribute("topsurface") : "Smooth",
        bottomsurface: surfaceNode ? surfaceNode.getAttribute("bottomsurface") : "Smooth",
        frontsurface: surfaceNode ? surfaceNode.getAttribute("frontsurface") : "Smooth",
        backsurface: surfaceNode ? surfaceNode.getAttribute("backsurface") : "Smooth",
        rightsurface: surfaceNode ? surfaceNode.getAttribute("rightsurface") : "Smooth",
        leftsurface: surfaceNode ? surfaceNode.getAttribute("leftsurface") : "Smooth"
    };

    const materials = createMaterials(sx, sy, sz, parseInt(colorHex), surfaceData);
    
    // Pass rotation values to createBrick
    const mesh = createBrick(
        parseFloat(posNode.getAttribute("X")) || 0,
        parseFloat(posNode.getAttribute("Y")) || 0,
        parseFloat(posNode.getAttribute("Z")) || 0,
        sx, sy, sz,
        rx, ry, rz, // New: Rotation params
        1, 
        anchored,
        materials,
        partType
    );

    if (mesh) {
        mesh.name = name;
        mesh.userData = {
            type: "Part",
            partType: partType,
            anchored: anchored,
            cancollide: canCollide,
            brickcolor: colorHex,
            id: itemNode.getAttribute("id") || Date.now().toString(),
            surfaces: surfaceData,
            mass: 1,
            sizeX: sx,
            sizeY: sy,
            sizeZ: sz
        };
    }
}

function createMaterials(sx, sy, sz, color, surfaces) {
    var names = ["rightsurface","leftsurface","topsurface","bottomsurface","frontsurface","backsurface"];
    return names.map((name, i) => {
        var type = surfaces[name] || "Smooth";
        
        let tex = textures[type];  
        
        if (tex) {
            tex = tex.clone();  
            
            if (i === 2 || i === 3) { // top/bottom
                tex.repeat.set(sx * textureScaleX, sz * textureScaleY);
            } else if (i === 0 || i === 1) { // sides (right/left)
                tex.repeat.set(sz * textureScaleX, sy * textureScaleY);
            } else { // front/back
                tex.repeat.set(sx * textureScaleX, sy * textureScaleY);
            }
            
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.needsUpdate = true;
        }
        
        const mat = new THREE.MeshPhongMaterial({
            color: color,
            map: tex || null,           // null = no texture, but still lit
            shininess: 10,              // optional - helps see lighting better
            specular: 0x111111
        });
        
        return mat;
    });
}

function createBrick(x, y, z, sx, sy, sz, rx, ry, rz, mass, anchored, materials, partType) {
    var shape, geometry, meshMaterial;

    switch (partType) {
        case "Sphere": {
            var r = Math.max(sx, sy, sz) / 2;
            shape = new CANNON.Sphere(r);
            geometry = new THREE.SphereGeometry(r, 24, 16);
            meshMaterial = materials[0];
            break;
        }
        case "Cylinder": {
            shape = new CANNON.Cylinder(sx / 2, sx / 2, sy, 16);
            geometry = new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 16);
            meshMaterial = materials[0];
            break;
        }
        case "Cone": {
            shape = new CANNON.Cylinder(0, sx / 2, sy, 16);
            geometry = new THREE.CylinderGeometry(0, sx / 2, sy, 16);
            meshMaterial = materials[0];
            break;
        }
        default: { 
            var shape2d = new THREE.Shape();
            var r = 0.05; 
            var w = sx / 2, d = sz / 2;
            shape2d.moveTo(-w + r, -d);
            shape2d.lineTo(w - r, -d);
            shape2d.absarc(w - r, -d + r, r, Math.PI * 1.5, 0, false);
            shape2d.lineTo(w, d - r);
            shape2d.absarc(w - r, d - r, r, 0, Math.PI * 0.5, false);
            shape2d.lineTo(-w + r, d);
            shape2d.absarc(-w + r, d - r, r, Math.PI * 0.5, Math.PI, false);
            shape2d.lineTo(-w, -d + r);
            shape2d.absarc(-w + r, -d + r, r, Math.PI, Math.PI * 1.5, false);

            geometry = new THREE.ExtrudeGeometry(shape2d, {
                depth: sy,
                bevelEnabled: true,
                bevelThickness: r,
                bevelSize: r,
                bevelSegments: 3
            });
            geometry.center(); 
            shape = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2));
            meshMaterial = materials;
        }
    }

    var body = new CANNON.Body({ mass: anchored ? 0 : (mass || 1) });
    if (anchored) body.type = CANNON.Body.STATIC;
    body.addShape(shape);
    body.position.set(x, y, z);

    var radX = rx * (Math.PI / 180), radY = ry * (Math.PI / 180), radZ = rz * (Math.PI / 180);
    body.quaternion.setFromEuler(radX, radY, radZ);

    var mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.position.set(x, y, z);
    mesh.rotation.set(radX, radY, radZ);

    body.meshIndex = meshes.length;
    world.addBody(body);
    scene.add(mesh);
    bodies.push(body);
    meshes.push(mesh);
    return mesh;
}


function spawnPartAtCamera() {
    var spawnPos = new THREE.Vector3();
    camera.getWorldDirection(spawnPos);
    spawnPos.multiplyScalar(15).add(camera.position);

    var sx = 2, sy = 1, sz = 4;
    var surfaces = { topsurface:"Studs", bottomsurface:"Inlets", frontsurface:"Weld", backsurface:"Smooth", rightsurface:"Smooth", leftsurface:"Smooth" };
    var materials = createMaterials(sx, sy, sz, 0xff0000, surfaces);

    var mesh = createBrick(
        Math.round(spawnPos.x),
        Math.round(spawnPos.y),
        Math.round(spawnPos.z),
        sx, sy, sz,
        1,
        true,
        materials,
        "Block"
    );

    mesh.name = "Part";
    mesh.userData = {
        type:"Part",
        partType:"Block",
        anchored:true,
        cancollide:true,
        brickcolor:"0xff0000",
        id:Date.now().toString(),
        surfaces:surfaces,
        mass:1
    };

    if (typeof updateExplorer === "function") updateExplorer();
}

// Lego-style connection system - Roblox style welding using REAL constraints
var weldConstraints = []; // Store actual CANNON.js constraints

function handleConnections() {
    if (!isPlaying) return;
   
    for (var i = 0; i < world.contacts.length; i++) {
        var contact = world.contacts[i];
       
        if (!contact || !contact.bi || !contact.bj || !contact.ni || !contact.ri) continue;
       
        var bodyA = contact.bi;
        var bodyB = contact.bj;
       
        var limbNames = ["Torso", "Head", "LeftArm", "RightArm", "LeftLeg", "RightLeg"];
        var meshA = bodyA.meshIndex !== undefined && bodyA.meshIndex >= 0 && bodyA.meshIndex < meshes.length ? meshes[bodyA.meshIndex] : null;
        var meshB = bodyB.meshIndex !== undefined && bodyB.meshIndex >= 0 && bodyB.meshIndex < meshes.length ? meshes[bodyB.meshIndex] : null;
       
        var aIsPlayer = meshA && limbNames.includes(meshA.name);
        var bIsPlayer = meshB && limbNames.includes(meshB.name);
       
        if (aIsPlayer && bIsPlayer) continue;
       
        if (bodyA.type === CANNON.Body.STATIC || bodyB.type === CANNON.Body.STATIC) continue;
       
        if (bodyA.meshIndex === undefined || bodyB.meshIndex === undefined) continue;
        if (bodyA.meshIndex < 0 || bodyA.meshIndex >= meshes.length) continue;
        if (bodyB.meshIndex < 0 || bodyB.meshIndex >= meshes.length) continue;
       
        if (!meshA || !meshB || !meshA.userData || !meshB.userData) continue;
       
        var alreadyWelded = weldConstraints.some(w =>
            (w.bodyA === bodyA && w.bodyB === bodyB) ||
            (w.bodyA === bodyB && w.bodyB === bodyA)
        );
       
        if (alreadyWelded) continue;
       
        var relVelocity = new CANNON.Vec3();
        bodyA.velocity.vsub(bodyB.velocity, relVelocity);
        if (relVelocity.length() > 2) continue;
       
        var normal = contact.ni.clone().unit();  // make sure it's normalized
        var absNormal = new CANNON.Vec3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
       
        var faceIndexA, faceIndexB;
       
        if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
            // vertical contact
            if (normal.y > 0) {           // normal points up → A is below, touching B from below
                faceIndexA = 2;           // A's top (Studs?)
                faceIndexB = 3;           // B's bottom (Inlets?)
            } else {                      // normal points down → B is below, touching A from below
                faceIndexA = 3;           // A's bottom
                faceIndexB = 2;           // B's top
            }
        } else if (absNormal.x > absNormal.z) {
            if (normal.x > 0) {
                faceIndexA = 0; faceIndexB = 1;
            } else {
                faceIndexA = 1; faceIndexB = 0;
            }
        } else {
            if (normal.z > 0) {
                faceIndexA = 4; faceIndexB = 5;
            } else {
                faceIndexA = 5; faceIndexB = 4;
            }
        }
       
        var surfaceNames = ["rightsurface", "leftsurface", "topsurface", "bottomsurface", "frontsurface", "backsurface"];
        var surfaceA = meshA.userData.surfaces ? meshA.userData.surfaces[surfaceNames[faceIndexA]] : "Smooth";
        var surfaceB = meshB.userData.surfaces ? meshB.userData.surfaces[surfaceNames[faceIndexB]] : "Smooth";
       
        var shouldConnect = false;
       
        if ((surfaceA === "Studs" && surfaceB === "Inlets") ||
            (surfaceA === "Inlets" && surfaceB === "Studs") ||
            surfaceA === "Weld" || surfaceB === "Weld") {
            shouldConnect = true;
        }
       
        if (shouldConnect) {
            // Only very gentle snap along normal (prevents flying away)
            var snapDistance = 0.08;  // small value — adjust if needed (0.05–0.15)
            var correction = normal.scale(-snapDistance);  // push apart slightly if penetrating
            bodyB.position.vadd(correction, bodyB.position);
           
            // Rotation snap — only for vertical studs/inlets (most common case)
            if ((faceIndexA === 2 || faceIndexA === 3) && (faceIndexB === 2 || faceIndexB === 3)) {
                bodyB.quaternion.copy(bodyA.quaternion);
            }
           
            bodyB.velocity.set(0, 0, 0);
            bodyB.angularVelocity.set(0, 0, 0);
           
            var constraint = new CANNON.LockConstraint(bodyA, bodyB, {
                maxForce: 1e8
            });
           
            world.addConstraint(constraint);
           
            weldConstraints.push({
                constraint: constraint,
                bodyA: bodyA,
                bodyB: bodyB,
                meshA: meshA,
                meshB: meshB
            });
           
            console.log("✓ Welded:", meshA.name, surfaceA, "to", meshB.name, surfaceB);
        }
    }
}

// Returns true if two faces are compatible for connection
function areSurfacesCompatible(surfaceA, surfaceB) {
    return (surfaceA === "Studs" && surfaceB === "Inlets") ||
           (surfaceA === "Inlets" && surfaceB === "Studs") ||
           surfaceA === "Weld" || surfaceB === "Weld";
}

// Helper to get face center and normal in world space
function getFaceInfo(body, mesh, faceIndex) {
    const halfExtents = new CANNON.Vec3(
        mesh.userData.sizeX / 2 || 1,
        mesh.userData.sizeY / 2 || 1,
        mesh.userData.sizeZ / 2 || 1
    );
    
    let localOffset = new CANNON.Vec3();
    let worldNormal = new CANNON.Vec3();
    
    switch (faceIndex) {
        case 0: // right (+x)
            localOffset.set(halfExtents.x, 0, 0);
            worldNormal.set(1, 0, 0);
            break;
        case 1: // left (-x)
            localOffset.set(-halfExtents.x, 0, 0);
            worldNormal.set(-1, 0, 0);
            break;
        case 2: // top (+y)
            localOffset.set(0, halfExtents.y, 0);
            worldNormal.set(0, 1, 0);
            break;
        case 3: // bottom (-y)
            localOffset.set(0, -halfExtents.y, 0);
            worldNormal.set(0, -1, 0);
            break;
        case 4: // front (+z)
            localOffset.set(0, 0, halfExtents.z);
            worldNormal.set(0, 0, 1);
            break;
        case 5: // back (-z)
            localOffset.set(0, 0, -halfExtents.z);
            worldNormal.set(0, 0, -1);
            break;
    }
    
    // Transform to world
    const worldOffset = body.quaternion.vmult(localOffset);
    const faceCenter = new CANNON.Vec3().copy(body.position).vadd(worldOffset);
    
    return { center: faceCenter, normal: body.quaternion.vmult(worldNormal) };
}

// Main pre-connection function - call once after loading all parts
function bakeInitialConnections() {
    console.log("Baking initial stud/inlet/weld connections...");
    let connectionCount = 0;
    
    // For every pair (brute force - ok for <500 parts; optimize later if needed)
    for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
            const bodyA = bodies[i];
            const bodyB = bodies[j];
            const meshA = meshes[i];
            const meshB = meshes[j];
            
            if (!meshA.userData || !meshB.userData) continue;
            
            // Skip if either is anchored/static (old Roblox behavior: anchored parts don't auto-weld dynamically)
            if (bodyA.type === CANNON.Body.STATIC || bodyB.type === CANNON.Body.STATIC) continue;
            
            // Already connected? Skip
            const alreadyWelded = weldConstraints.some(w =>
                (w.bodyA === bodyA && w.bodyB === bodyB) ||
                (w.bodyA === bodyB && w.bodyB === bodyA)
            );
            if (alreadyWelded) continue;
            
            // Check all 6×6 face combinations (36 is fine for small-medium maps)
            for (let fa = 0; fa < 6; fa++) {
                for (let fb = 0; fb < 6; fb++) {
                    const faceA = getFaceInfo(bodyA, meshA, fa);
                    const faceB = getFaceInfo(bodyB, meshB, fb);
                    
                    // Check if surfaces match
                    const surfaceA = meshA.userData.surfaces[ ["rightsurface","leftsurface","topsurface","bottomsurface","frontsurface","backsurface"][fa] ];
                    const surfaceB = meshB.userData.surfaces[ ["rightsurface","leftsurface","topsurface","bottomsurface","frontsurface","backsurface"][fb] ];
                    
                    if (!areSurfacesCompatible(surfaceA, surfaceB)) continue;
                    
                    // Distance between face centers
                    const distVec = new CANNON.Vec3().copy(faceA.center).vsub(faceB.center);
                    const distance = distVec.length();
                    
                    // Normals should be opposite (facing each other)
                    const dot = faceA.normal.dot(faceB.normal);
                    
                    // Tolerance: ~0.01 stud gap + alignment
                    if (distance < 0.1 && Math.abs(dot + 1) < 0.1) {
                        // Snap B to A's face exactly (prevents tiny offsets)
                        const correction = faceA.center.vsub(faceB.center);
                        bodyB.position.vadd(correction, bodyB.position);
                        
                        // Align rotation if vertical stack
                        if (fa === 2 || fa === 3 || fb === 2 || fb === 3) {
                            bodyB.quaternion.copy(bodyA.quaternion);
                        }
                        
                        // Create the weld!
                        const constraint = new CANNON.LockConstraint(bodyA, bodyB, { maxForce: 1e9 });
                        world.addConstraint(constraint);
                        
                        weldConstraints.push({
                            constraint,
                            bodyA, bodyB,
                            meshA, meshB
                        });
                        
                        connectionCount++;
                        console.log(`Pre-connected ${meshA.name} (${surfaceA}) → ${meshB.name} (${surfaceB})`);
                        
                        // Optional: break early if you want only one connection per pair
                        // break;
                    }
                }
            }
        }
    }
    
    console.log(`Bake complete! Created ${connectionCount} initial connections.`);
}

function togglePhysics(state) {
    if (state && !isPlaying) {
        // Store original states
        originalStates = meshes.map((m, i) => ({
            pos: m.position.clone(),
            quat: m.quaternion.clone(),
            userData: JSON.parse(JSON.stringify(m.userData)),
            name: m.name
        }));
        
        // Wake up all dynamic bodies
        bodies.forEach(body => {
            if (body.type !== CANNON.Body.STATIC) {
                body.wakeUp();
            }
        });
        
        isPlaying = true;
        console.log("Physics started - Bricks will weld on contact!");
        
    } else if (!state && isPlaying) {
        isPlaying = false;
        
        // Clear all weld constraints
        weldConstraints.forEach(function(weld) {
            world.removeConstraint(weld.constraint);
        });
        weldConstraints = [];
        
        // Restore original states
        originalStates.forEach((s, i) => {
            if (meshes[i] && bodies[i]) {
                meshes[i].position.copy(s.pos);
                meshes[i].quaternion.copy(s.quat);
                meshes[i].name = s.name;
                meshes[i].userData = JSON.parse(JSON.stringify(s.userData));
                
                bodies[i].position.copy(s.pos);
                bodies[i].quaternion.copy(s.quat);
                bodies[i].velocity.set(0,0,0);
                bodies[i].angularVelocity.set(0,0,0);
                bodies[i].type = s.userData.anchored ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC;
                bodies[i].mass = s.userData.mass || 1;
                bodies[i].updateMassProperties();
                
                if (meshes[i].material && Array.isArray(meshes[i].material)) {
                    meshes[i].material.forEach(mat => mat.color.setHex(parseInt(s.userData.brickcolor)));
                }
            }
        });
        
        if (typeof updateExplorer === "function") updateExplorer();
        console.log("Physics stopped, welds cleared");
    }
}

function removeWeldsForBody(targetBody) {
    const removed = [];
    weldConstraints = weldConstraints.filter(weld => {
        if (weld.bodyA === targetBody || weld.bodyB === targetBody) {
            world.removeConstraint(weld.constraint);
            removed.push(weld);  // Store for re-adding later
            return false;
        }
        return true;
    });
    return removed;  // Return the removed welds to re-create later
}

function recreateWeld(bodyA, bodyB, meshA, meshB) {
    // Simplified: Assume they should connect (since they were welded before)
    // For accuracy, you could re-check surfaces/contact, but for editor moves, just lock them
    const constraint = new CANNON.LockConstraint(bodyA, bodyB, { maxForce: 1e8 });
    world.addConstraint(constraint);
    weldConstraints.push({
        constraint: constraint,
        bodyA: bodyA,
        bodyB: bodyB,
        meshA: meshA,
        meshB: meshB
    });
    console.log("✓ Re-welded:", meshA.name, "to", meshB.name);
}

function applyGlobalSettings() {
    world.gravity.set(0, Workspace.gravity, 0);
    var sun = scene.getObjectByName("SunLight");
    if (sun) sun.intensity = parseFloat(Lighting.brightness);
}

function animate() {
    requestAnimationFrame(animate);
    
    // Camera controls (from camera.js)
    if (typeof updateCamera === "function") updateCamera();
    
    // Player controls (from player.js)
    if (typeof updatePlayer === "function") updatePlayer();
    
    if (isPlaying) {
        try {
            world.step(1 / 60);
            for (var i = 0; i < bodies.length; i++) {
                if (meshes[i] && bodies[i]) {
                    meshes[i].position.copy(bodies[i].position);
                    meshes[i].quaternion.copy(bodies[i].quaternion);
                }
            }
        } catch(e) {
            console.error("Physics error:", e);
            if (typeof togglePhysics === 'function') {
                togglePhysics(false);
            }
        }
    }
    
    renderer.render(scene, camera);
}