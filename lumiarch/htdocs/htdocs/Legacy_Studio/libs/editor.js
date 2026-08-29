import * as THREE from "three";
import { TransformControls } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/TransformControls.js";

var control; 
var selectedObjects = [];
var selectedFolderId = null; 
var selectionBox; 
var clipboard = null; 
var groups = [];
var shiftDown = false;
var ctrlDown = false;
var altDown = false;
var activeTool = "select"; 

var isDraggingPart = false;
var dragOffset = new THREE.Vector3();
var dragPlane = null;
var dragAxis = null; // 'x', 'y', 'z', or null for free movement
var isScaling = false;
var scaleStartPos = new THREE.Vector3();
var scaleStartSize = new THREE.Vector3();

var showPartTypeMenu = false;

const STUD_SNAP = 1;
const ROTATE_SNAP = Math.PI / 8; 

var lastScale = new THREE.Vector3();
var lastPosition = new THREE.Vector3();
var lastQuat = new THREE.Quaternion();

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}
// Helper function to create geometry based on partType
function createGeometryForPartType(partType, sizeX, sizeY, sizeZ) {
    switch (partType) {
        case 'Sphere':
            // Use average of dimensions for sphere radius
            const radius = Math.max(sizeX, sizeY, sizeZ) / 2;
            return new THREE.SphereGeometry(radius, 16, 16);
        case 'Cylinder':
            // Y is height, X/Z averaged for radius
            const cylRadius = Math.max(sizeX, sizeZ) / 2;
            return new THREE.CylinderGeometry(cylRadius, cylRadius, sizeY, 16);
        case 'Cone':
            const coneRadius = Math.max(sizeX, sizeZ) / 2;
            return new THREE.CylinderGeometry(0, coneRadius, sizeY, 16);
        case 'Block':
        default:
            return new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
    }
}

// Helper function to rebuild mesh geometry
function rebuildMeshGeometry(mesh) {
    if (!mesh.userData) return;
   
    const partType = mesh.userData.partType || 'Block';
    const sizeX = mesh.userData.sizeX || 2;
    const sizeY = mesh.userData.sizeY || 1;
    const sizeZ = mesh.userData.sizeZ || 4;
   
    // Dispose old geometry
    if (mesh.geometry) mesh.geometry.dispose();
   
    // Dispose old materials (prevents leaks and mismatches)
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
                if (mat.map) mat.map.dispose();
                mat.dispose();
            });
        } else {
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
        }
    }
   
    // Create new geometry
    mesh.geometry = createGeometryForPartType(partType, sizeX, sizeY, sizeZ);
   
    // Create NEW materials based on partType
    const color = parseInt(mesh.userData.brickcolor) || 0xffffff;
    const surfaces = mesh.userData.surfaces || {
        topsurface: "Smooth", bottomsurface: "Smooth",
        frontsurface: "Smooth", backsurface: "Smooth",
        rightsurface: "Smooth", leftsurface: "Smooth"
    };
    const materials = createMaterials(sizeX, sizeY, sizeZ, color, surfaces);
   
    if (partType === 'Block') {
        mesh.material = materials;  // array for faces
    } else {
        // Single material for non-blocks (use first one, no textures needed)
        mesh.material = materials[0] || new THREE.MeshPhongMaterial({ color: color });
    }
   
    // Reset scale to 1,1,1 since size is now in geometry
    mesh.scale.set(1, 1, 1);
   
    // Update textures (only if Block)
    updateTextureScale(mesh);
	mesh.geometry.computeBoundingBox();
	mesh.geometry.computeBoundingSphere();
}

// Helper function to normalize mesh (apply scale to size, reset scale)
function normalizeMesh(mesh) {
    if (!mesh.userData) return;
    
    // Get current effective size
    const partType = mesh.userData.partType || 'Block';
    
    if (partType === 'Block') {
        // For blocks, multiply geometry size by scale
        const baseX = mesh.geometry.parameters.width || mesh.userData.sizeX || 2;
        const baseY = mesh.geometry.parameters.height || mesh.userData.sizeY || 1;
        const baseZ = mesh.geometry.parameters.depth || mesh.userData.sizeZ || 4;
        
        mesh.userData.sizeX = baseX * mesh.scale.x;
        mesh.userData.sizeY = baseY * mesh.scale.y;
        mesh.userData.sizeZ = baseZ * mesh.scale.z;
    } else if (partType === 'Sphere') {
		const baseRadius = mesh.geometry.parameters.radius || 1;
		const avgScale = (mesh.scale.x + mesh.scale.y + mesh.scale.z) / 3;
		const effectiveSize = baseRadius * 2 * avgScale;
		mesh.userData.sizeX = effectiveSize;
		mesh.userData.sizeY = effectiveSize;
		mesh.userData.sizeZ = effectiveSize;
	} else if (partType === 'Cylinder' || partType === 'Cone') {
		const baseRadius = mesh.geometry.parameters.radiusTop || mesh.geometry.parameters.radiusBottom || 1;
		const baseHeight = mesh.geometry.parameters.height || 2;
		const avgRadial = (mesh.scale.x + mesh.scale.z) / 2;
		mesh.userData.sizeX = baseRadius * 2 * avgRadial;
		mesh.userData.sizeY = baseHeight * Math.abs(mesh.scale.y);
		mesh.userData.sizeZ = baseRadius * 2 * avgRadial;
	}
    
    // Rebuild geometry with new size
    rebuildMeshGeometry(mesh);
}

function initEditorControls() {
    if (typeof renderer === 'undefined' || typeof camera === 'undefined' || !renderer || !camera) {
        setTimeout(initEditorControls, 100);
        return;
    }
    
    control = new TransformControls(camera, renderer.domElement);
    control.setTranslationSnap(STUD_SNAP);
    control.setScaleSnap(STUD_SNAP);
    control.setRotationSnap(ROTATE_SNAP);
    control.enabled = true;
    
    scene.add(control);

    selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x00a2ff);
    selectionBox.visible = false;
    scene.add(selectionBox);

    control.addEventListener('mouseDown', () => {
        if (control.object && !isPlaying) {
            const idx = meshes.indexOf(control.object);
            if (idx !== -1 && bodies[idx]) {
                removedWelds = removeWeldsForBody(bodies[idx]);
            }
            lastScale.copy(control.object.scale);
            lastPosition.copy(control.object.position);
            lastQuat.copy(control.object.quaternion);
        }
    });

    control.addEventListener('change', () => {
        if (control.object && !isPlaying) {
            const obj = control.object;

            // ── Handle scale mode specially ──
            if (control.mode === "scale") {
                control.setScaleSnap(shiftDown ? null : STUD_SNAP);

                if (altDown) {
                    // Uniform scaling when Alt is held
                    let maxScale = Math.max(obj.scale.x, obj.scale.y, obj.scale.z);
                    obj.scale.set(maxScale, maxScale, maxScale);
                }

                // Critical: Immediately apply current scale to userData sizes
                obj.userData.sizeX = (obj.userData.sizeX || 2) * obj.scale.x;
                obj.userData.sizeY = (obj.userData.sizeY || 1) * obj.scale.y;
                obj.userData.sizeZ = (obj.userData.sizeZ || 4) * obj.scale.z;

                // Reset visual scale back to 1 (size now lives in userData)
                obj.scale.set(1, 1, 1);

                // Rebuild geometry + materials + physics
                rebuildMeshGeometry(obj);
                syncPhysics(obj);
            }

            // Group handling
            let group = groups.find(g => g.id === selectedFolderId || g.members.includes(obj));
            if (group && group.members.includes(obj) && control.dragging) {
                let deltaPos = obj.position.clone().sub(lastPosition);
                let deltaQuat = obj.quaternion.clone().multiply(lastQuat.clone().invert());
                
                group.members.forEach(m => {
                    if (m !== obj) {
                        m.position.add(deltaPos);
                        m.applyQuaternion(deltaQuat);
                        syncPhysics(m);
                    }
                });
            }

            lastPosition.copy(obj.position);
            lastQuat.copy(obj.quaternion);

            // Always sync physics for the main object
            syncPhysics(obj);

            updateProperties();
            updateSelectionBox();
        }
    });
    
    // Track removed welds during moves
    var removedWelds = [];
    
    control.addEventListener('dragging-changed', (e) => {
        if (typeof mouseState !== 'undefined') {
            mouseState.rightDown = false;
            window.isToolActive = e.value;
        }
        if (!e.value && removedWelds.length > 0 && !isPlaying) {
            // Re-add removed welds
            removedWelds.forEach(weld => {
                recreateWeld(weld.bodyA, weld.bodyB, weld.meshA, weld.meshB);
            });
            removedWelds = [];
        }
    });

    initFileMenu();
}

function togglePlay() {
    isPlaying = !isPlaying;
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        const btnText = playBtn.querySelector('.btn-text');
        const btnImg = playBtn.querySelector('.btn-img');
        if (btnText) btnText.innerText = isPlaying ? "Stop" : "Play";
        if (btnImg) {
            btnImg.innerHTML = `<img src="assets/icons/${isPlaying ? 'Stop.png' : 'Play.png'}" style="width:100%; height:100%; object-fit:contain;">`;
        }
    }

   if (isPlaying) {
    deselectAll();
    
    meshes.forEach((m, i) => {

        // Position & rotation (already good)
        m.userData.initialPosition = m.position.clone();
        m.userData.initialQuaternion = m.quaternion.clone();
        
        // Scale (visual scale)
        m.userData.initialScale = m.scale.clone();
        
        // ── Most important: current sizes & part type ──
        m.userData.initialSizeX   = m.userData.sizeX   ?? 2;
		m.userData.initialSizeY   = m.userData.sizeY   ?? 1;
		m.userData.initialSizeZ   = m.userData.sizeZ   ?? 4;
		m.userData.initialPartType = m.userData.partType || 'Block';
        
        // Other properties (keep as-is)
        m.userData.initialColor = m.material?.[0]?.color?.getHex() ?? 0xffffff;
        m.userData.initialName = m.name ?? 'Part';
        m.userData.initialAnchored = !!m.userData.anchored;
        m.userData.initialCanCollide = m.userData.cancollide !== false;
        m.userData.initialMass = m.userData.mass ?? 1;
        m.userData.initialSurfaces = JSON.parse(JSON.stringify(m.userData.surfaces || {
            topsurface: "Smooth", bottomsurface: "Smooth",
            frontsurface: "Smooth", backsurface: "Smooth",
            rightsurface: "Smooth", leftsurface: "Smooth"
        }));
    });
   
    // Wake up all physics bodies
    bodies.forEach(body => {
        if (body && body.wakeUp) body.wakeUp();
    });
   
    if (window.playerScript && typeof window.playerScript.spawn === 'function') {
        window.playerScript.spawn();
    }
} else {
        if (window.playerScript && typeof window.playerScript.despawn === 'function') {
            window.playerScript.despawn();
        }
        
        // Restore ALL properties
        meshes.forEach((m, i) => {
            if (m.userData.initialPosition && bodies[i]) {
                m.position.copy(m.userData.initialPosition);
                m.quaternion.copy(m.userData.initialQuaternion);
                m.scale.copy(m.userData.initialScale);
               
                // Rebuild geometry
                rebuildMeshGeometry(m);
                
                // Restore properties
                m.name = m.userData.initialName;
                m.userData.anchored = m.userData.initialAnchored;
                m.userData.cancollide = m.userData.initialCanCollide;
                m.userData.mass = m.userData.initialMass;
                m.userData.surfaces = JSON.parse(JSON.stringify(m.userData.initialSurfaces));
                
                // Restore color
                if (m.material && Array.isArray(m.material)) {
                    m.material.forEach(mat => mat.color.setHex(m.userData.initialColor));
                }
                
                // Restore physics
                bodies[i].position.copy(m.userData.initialPosition);
                bodies[i].quaternion.copy(m.userData.initialQuaternion);
                bodies[i].velocity.set(0, 0, 0);
                bodies[i].angularVelocity.set(0, 0, 0);
                
                if (bodies[i].sleep) bodies[i].sleep();
                
                syncPhysics(m);
            }
        });
        
        updateExplorer();
        updateProperties();
    }
    
    // Sync with main.js togglePhysics if it exists
    if (typeof togglePhysics === 'function') {
        togglePhysics(isPlaying);
    }
}

function initFileMenu() {
    // Wait for DOM to be ready
    setTimeout(() => {
        const fileTab = document.getElementById('file-tab');
        if (!fileTab) {
            console.error("File tab not found!");
            return;
        }
        
        const oldMenu = document.getElementById('file-dropdown');
        if (oldMenu) oldMenu.remove();
        
        const dropdown = document.createElement('div');
        dropdown.id = 'file-dropdown';
        dropdown.style.cssText = `
            position: fixed; display: none; flex-direction: column;
            background: #2b2b2b; border: 1px solid #444;
            box-shadow: 0px 4px 10px rgba(0,0,0,0.5); z-index: 9999999; min-width: 180px;
            pointer-events: auto; border-radius: 3px; overflow: hidden;
        `;
        
        dropdown.innerHTML = `
            <div class="dropdown-item" id="menu-new" style="padding:10px; cursor:pointer; color:#eee; border-bottom:1px solid #3d3d3d;">New</div>
            <div class="dropdown-item" id="menu-open" style="padding:10px; cursor:pointer; color:#eee; border-bottom:1px solid #3d3d3d;">Open from File...</div>
            <div class="dropdown-item" id="menu-save" style="padding:10px; cursor:pointer; color:#eee; border-bottom:1px solid #3d3d3d;">Save to File...</div>
            <div class="dropdown-item" id="menu-exit" style="padding:10px; cursor:pointer; color:#eee;">Return to Main Page</div>
        `;
        document.body.appendChild(dropdown);
        
        // Add hover effects
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('mouseenter', () => item.style.background = '#00a2ff');
            item.addEventListener('mouseleave', () => item.style.background = 'transparent');
        });
        
        fileTab.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = fileTab.getBoundingClientRect();
            dropdown.style.left = rect.left + "px";
            dropdown.style.top = rect.bottom + "px";
            const isVisible = dropdown.style.display === 'flex';
            dropdown.style.display = isVisible ? 'none' : 'flex';
            console.log("File menu toggled:", dropdown.style.display);
        });
        
        window.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== fileTab) {
                dropdown.style.display = 'none';
            }
        });

        document.getElementById('menu-new').onclick = (e) => { 
            e.stopPropagation();
            if(confirm("Clear scene? All unsaved changes will be lost.")) location.reload(); 
            dropdown.style.display = 'none';
        };
        
        document.getElementById('menu-exit').onclick = (e) => { 
            e.stopPropagation();
            window.location.href = "https://galaxia.ct.ws"; 
        };
        
        document.getElementById('menu-open').onclick = (e) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                loadMap(event.target.result);
            };
            reader.readAsText(file);
        }
    };
    input.click();
    dropdown.style.display = 'none';
};
        
        document.getElementById('menu-save').onclick = (e) => { 
            e.stopPropagation();
            saveMapToXML();
            dropdown.style.display = 'none';
        };
        
        console.log("File menu initialized successfully!");
    }, 500);
}

function saveMapToXML() {
    const now = new Date();
    const filename = `galaxia_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.xml`;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<galaxia-game>\n';

    // Workspace
    xml += '  <workspace>\n';
    xml += '    <config>\n';
    xml += `      <gravity val="${Workspace?.gravity ?? -100}"/>\n`;
    xml += '    </config>\n';

    // Track which meshes are in groups
    const meshesInGroups = new Set();
    
    // Save groups/models
    groups.forEach(g => {
        xml += `    <model name="${g.name}">\n`;
        
        // Calculate center point of the model
        let centerX = 0, centerY = 0, centerZ = 0;
        g.members.forEach(m => {
            centerX += m.position.x;
            centerY += m.position.y;
            centerZ += m.position.z;
        });
        centerX /= g.members.length;
        centerY /= g.members.length;
        centerZ /= g.members.length;
        
        g.members.forEach(mesh => {
            meshesInGroups.add(mesh);
            
            const size = {
                x: mesh.userData.sizeX || 2,
                y: mesh.userData.sizeY || 1,
                z: mesh.userData.sizeZ || 4
            };

            const surfaces = mesh.userData.surfaces || {
                topsurface: "Smooth", bottomsurface: "Smooth",
                frontsurface: "Smooth", backsurface: "Smooth",
                rightsurface: "Smooth", leftsurface: "Smooth"
            };

            xml += '      <object>\n';
            xml += '        <config ';
            xml += `id="${mesh.userData.id || '0000'}" `;
            xml += `name="${mesh.name || 'Part'}" `;
            xml += `parttype="${mesh.userData.partType?.toLowerCase() || 'brick'}" `;
            xml += `anchored="${!!mesh.userData.anchored}" `;
            xml += `cancollide="${mesh.userData.cancollide !== false}"`;
            xml += '>\n';

            // Save relative position to model center
            xml += `          <position x="${(mesh.position.x - centerX).toFixed(3)}" y="${(mesh.position.y - centerY).toFixed(3)}" z="${(mesh.position.z - centerZ).toFixed(3)}"/>\n`;
            xml += `          <size x="${size.x.toFixed(3)}" y="${size.y.toFixed(3)}" z="${size.z.toFixed(3)}"/>\n`;
            xml += `          <brickcolor>0x${parseInt(mesh.userData.brickcolor || 'ffffff').toString(16).padStart(6,'0')}</brickcolor>\n`;
            xml += '          <surface ';
            xml += `topsurface="${surfaces.topsurface}" `;
            xml += `bottomsurface="${surfaces.bottomsurface}" `;
            xml += `frontsurface="${surfaces.frontsurface}" `;
            xml += `backsurface="${surfaces.backsurface}" `;
            xml += `rightsurface="${surfaces.rightsurface}" `;
            xml += `leftsurface="${surfaces.leftsurface}"/>\n`;

            xml += '        </config>\n';
            xml += '      </object>\n';
        });
        
        xml += '    </model>\n';
    });

    // Save ungrouped meshes
    meshes.forEach(mesh => {
        if (meshesInGroups.has(mesh)) return;
        
        if (!mesh.userData) return;

        const size = {
            x: mesh.userData.sizeX || 2,
            y: mesh.userData.sizeY || 1,
            z: mesh.userData.sizeZ || 4
        };

        const surfaces = mesh.userData.surfaces || {
            topsurface: "Smooth", bottomsurface: "Smooth",
            frontsurface: "Smooth", backsurface: "Smooth",
            rightsurface: "Smooth", leftsurface: "Smooth"
        };

        xml += '    <object ';
        xml += `mass="${mesh.userData.mass || 0}"`;
        xml += '>\n';
        xml += '      <config ';
        xml += `id="${mesh.userData.id || '0000'}" `;
        xml += `name="${mesh.name || 'Part'}" `;
        xml += `parttype="${mesh.userData.partType?.toLowerCase() || 'brick'}" `;
        xml += `anchored="${!!mesh.userData.anchored}" `;
        xml += `cancollide="${mesh.userData.cancollide !== false}"`;
        xml += '>\n';

        xml += `        <position x="${mesh.position.x.toFixed(3)}" y="${mesh.position.y.toFixed(3)}" z="${mesh.position.z.toFixed(3)}"/>\n`;
        xml += `        <size x="${size.x.toFixed(3)}" y="${size.y.toFixed(3)}" z="${size.z.toFixed(3)}"/>\n`;
        xml += `        <brickcolor>0x${parseInt(mesh.userData.brickcolor || 'ffffff').toString(16).padStart(6,'0')}</brickcolor>\n`;
        xml += '        <surface ';
        xml += `topsurface="${surfaces.topsurface}" `;
        xml += `bottomsurface="${surfaces.bottomsurface}" `;
        xml += `frontsurface="${surfaces.frontsurface}" `;
        xml += `backsurface="${surfaces.backsurface}" `;
        xml += `rightsurface="${surfaces.rightsurface}" `;
        xml += `leftsurface="${surfaces.leftsurface}"/>\n`;

        xml += '      </config>\n';
        xml += '    </object>\n';
    });

    xml += '  </workspace>\n';

    // Lighting
    xml += '  <lighting>\n';
    xml += '    <config>\n';
    const sun = scene.getObjectByName("SunLight");
    xml += `      <brightness val="${sun ? sun.intensity : 1}"/>\n`;
    xml += `      <color val="${sun ? '#' + sun.color.getHexString() : '#ffffff'}"/>\n`;
    xml += '    </config>\n';
    xml += '  </lighting>\n';

    xml += '</galaxia-game>';

    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    console.log("Map saved as:", filename);
}

function loadMap(xmlString) {
    if (!confirm("Load this map? Current scene will be cleared.")) return;

    // Clear everything first
    meshes.forEach(mesh => scene.remove(mesh));
    bodies.forEach(body => world.removeBody(body));
    meshes = [];
    bodies = [];
    weldConstraints = [];
    groups = [];
    deselectAll();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    const errorNode = xmlDoc.querySelector('parsererror');
    if (errorNode) {
        console.error("XML Parsing Error:", errorNode.textContent);
        alert("Invalid XML format! Check console.");
        return;
    }
	
	console.log("XML parsed successfully. Root tag:", xmlDoc.documentElement.tagName);
	
    // Workspace
    const workspace = xmlDoc.querySelector('workspace');
    if (workspace) {
        // Gravity
        const gravityNode = workspace.querySelector('gravity');
        const gravity = gravityNode ? parseFloat(gravityNode.getAttribute('val')) : -100;
        world.gravity.set(0, gravity, 0);
        if (typeof Workspace !== 'undefined') Workspace.gravity = gravity;

        // Load models first
const models = workspace.getElementsByTagName('model');
for (let i = 0; i < models.length; i++) {
    parseGalaxiaModel(models[i]);
}

// Load ungrouped objects
const objects = Array.from(workspace.getElementsByTagName('object')).filter(obj => {
    return !obj.parentElement || obj.parentElement.tagName !== 'model';
});
for (let i = 0; i < objects.length; i++) {
    parseGalaxiaObject(objects[i]);
}
    }

    // Lighting
    const lighting = xmlDoc.querySelector('lighting');
    if (lighting) {
        const config = lighting.querySelector('config');
        if (config) {
            const brightness = parseFloat(config.querySelector('brightness')?.getAttribute('val')) || 1;
            const colorVal = config.querySelector('color')?.getAttribute('val') || '#ffffff';

            const sun = scene.getObjectByName("SunLight");
            if (sun) {
                sun.intensity = brightness;
                sun.color.set(colorVal);
            }
            if (typeof Lighting !== 'undefined') {
                Lighting.brightness = brightness;
            }
        }
    }

    // After loading all parts → bake initial connections (if you have this function)
    if (typeof bakeInitialConnections === 'function') {
        bakeInitialConnections();
    }

    updateExplorer();
	console.log("Load complete. Parts created:", meshes.length);
}

function parseGalaxiaObject(node) {
    const config = node.querySelector('config');
    if (!config) {
        console.warn("Object missing <config> tag:", node.outerHTML.substring(0, 100) + "...");
        return;
    }

    // Basic attributes
    const mass = parseFloat(node.getAttribute('mass')) || 0;
    const id = config.getAttribute('id') || 'obj_' + Date.now();
    const name = config.getAttribute('name') || 'Part';
    const partTypeRaw = (config.getAttribute('parttype') || 'brick').toLowerCase();
    const partType = partTypeRaw === 'brick' ? 'Block' : 'Block'; // Add more types later

    const anchored = config.getAttribute('anchored') === 'true';
    const cancollide = config.getAttribute('cancollide') !== 'false';

    // Position, Size, Color, Surface
    const pos = config.querySelector('position');
    const sizeNode = config.querySelector('size');
    const brickcolorNode = config.querySelector('brickcolor');
    const surfaceNode = config.querySelector('surface');

    const sx = parseFloat(sizeNode?.getAttribute('x')) || 2;
    const sy = parseFloat(sizeNode?.getAttribute('y')) || 1;
    const sz = parseFloat(sizeNode?.getAttribute('z')) || 4;

    // FIXED: brickcolor is TEXT CONTENT, not attribute!
    let colorHex = 'ffffff';
    if (brickcolorNode?.textContent) {
        colorHex = brickcolorNode.textContent.trim().replace(/^0x/i, '').padStart(6, '0');
    }
    const colorNum = parseInt(colorHex, 16);

    const surfaceData = {
        topsurface: surfaceNode?.getAttribute('topsurface') || 'Smooth',
        bottomsurface: surfaceNode?.getAttribute('bottomsurface') || 'Smooth',
        frontsurface: surfaceNode?.getAttribute('frontsurface') || 'Smooth',
        backsurface: surfaceNode?.getAttribute('backsurface') || 'Smooth',
        rightsurface: surfaceNode?.getAttribute('rightsurface') || 'Smooth',
        leftsurface: surfaceNode?.getAttribute('leftsurface') || 'Smooth'
    };

    console.log(`Attempting to create: ${name} | Color: 0x${colorHex} | Size: ${sx}x${sy}x${sz}`);

    // Create materials
    const materials = createMaterials(sx, sy, sz, colorNum, surfaceData);

    // Create the brick (make sure createBrick args match your main.js version!)
    const mesh = createBrick(
        parseFloat(pos?.getAttribute('x')) || 0,
        parseFloat(pos?.getAttribute('y')) || 0,
        parseFloat(pos?.getAttribute('z')) || 0,
        sx, sy, sz,
        mass,
        anchored,
        materials,
        partType
    );

    if (mesh) {
        mesh.name = name;
        mesh.userData = {
            ...mesh.userData,
            id: id,
            partType: partType,
            sizeX: sx,
            sizeY: sy,
            sizeZ: sz,
            anchored: anchored,
            cancollide: cancollide,
            brickcolor: '0x' + colorHex,
            surfaces: surfaceData,
            mass: mass
        };

        // Critical: rebuild to apply textures/surfaces properly
        rebuildMeshGeometry(mesh);

        console.log(`SUCCESS: Loaded ${name} (ID: ${id}, Color: 0x${colorHex})`);
    } else {
        console.error(`FAILED to create mesh for ${name} (ID: ${id})`);
    }
}

function parseGalaxiaModel(modelNode) {
    const modelName = modelNode.getAttribute('name') || 'Model';
    const modelId = "model_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    
    const objects = modelNode.getElementsByTagName('object');
    const groupMembers = [];
    
    // Calculate spawn position (in front of camera)
    var spawnPos = new THREE.Vector3();
    if (typeof camera !== 'undefined') {
        camera.getWorldDirection(spawnPos);
        spawnPos.multiplyScalar(15).add(camera.position);
    }
    
    for (let i = 0; i < objects.length; i++) {
        const node = objects[i];
        const config = node.querySelector('config');
        if (!config) continue;

        const mass = parseFloat(node.getAttribute('mass')) || 0;
        const id = config.getAttribute('id') || 'obj_' + Date.now();
        const name = config.getAttribute('name') || 'Part';
        const partTypeRaw = (config.getAttribute('parttype') || 'brick').toLowerCase();
        const partType = partTypeRaw === 'brick' ? 'Block' : partTypeRaw.charAt(0).toUpperCase() + partTypeRaw.slice(1);

        const anchored = config.getAttribute('anchored') === 'true';
        const cancollide = config.getAttribute('cancollide') !== 'false';

        const pos = config.querySelector('position');
        const sizeNode = config.querySelector('size');
        const brickcolorNode = config.querySelector('brickcolor');
        const surfaceNode = config.querySelector('surface');

        const sx = parseFloat(sizeNode?.getAttribute('x')) || 2;
        const sy = parseFloat(sizeNode?.getAttribute('y')) || 1;
        const sz = parseFloat(sizeNode?.getAttribute('z')) || 4;

        let colorHex = 'ffffff';
        if (brickcolorNode?.textContent) {
            colorHex = brickcolorNode.textContent.trim().replace(/^0x/i, '').padStart(6, '0');
        }
        const colorNum = parseInt(colorHex, 16);

        const surfaceData = {
            topsurface: surfaceNode?.getAttribute('topsurface') || 'Smooth',
            bottomsurface: surfaceNode?.getAttribute('bottomsurface') || 'Smooth',
            frontsurface: surfaceNode?.getAttribute('frontsurface') || 'Smooth',
            backsurface: surfaceNode?.getAttribute('backsurface') || 'Smooth',
            rightsurface: surfaceNode?.getAttribute('rightsurface') || 'Smooth',
            leftsurface: surfaceNode?.getAttribute('leftsurface') || 'Smooth'
        };

        const materials = createMaterials(sx, sy, sz, colorNum, surfaceData);

        // Position is relative to spawn point
        const relX = parseFloat(pos?.getAttribute('x')) || 0;
        const relY = parseFloat(pos?.getAttribute('y')) || 0;
        const relZ = parseFloat(pos?.getAttribute('z')) || 0;

        const mesh = createBrick(
            spawnPos.x + relX,
            spawnPos.y + relY,
            spawnPos.z + relZ,
            sx, sy, sz,
            mass,
            anchored,
            materials,
            partType
        );

        if (mesh) {
            mesh.name = name;
            mesh.userData = {
                ...mesh.userData,
                id: id,
                partType: partType,
                sizeX: sx,
                sizeY: sy,
                sizeZ: sz,
                anchored: anchored,
                cancollide: cancollide,
                brickcolor: '0x' + colorHex,
                surfaces: surfaceData,
                mass: mass
            };

            rebuildMeshGeometry(mesh);
            groupMembers.push(mesh);
        }
    }
    
    // Create the group
    if (groupMembers.length > 0) {
        const group = { 
            name: modelName, 
            members: groupMembers, 
            id: modelId 
        };
        groups.push(group);
        console.log(`Loaded model: ${modelName} with ${groupMembers.length} parts`);
    }
}

function parseObjectEditor(node) {
    const config = node.getElementsByTagName("config")[0];
    if (!config) return;

    const mass = parseFloat(node.getAttribute("mass")) || 1;
    const partType = node.getAttribute("parttype") || 'Block';
    const anchored = config.getAttribute("anchored") === "true";
    const canCollide = config.getAttribute("cancollide") !== "false";
    const name = config.getAttribute("name") || "Part";
    
    const posNode = config.getElementsByTagName("position")[0];
    const sizeNode = config.getElementsByTagName("size")[0];
    const colorHex = config.getElementsByTagName("brickcolor")[0].childNodes[0].nodeValue;

    const sx = parseFloat(sizeNode.getAttribute("x"));
    const sy = parseFloat(sizeNode.getAttribute("y"));
    const sz = parseFloat(sizeNode.getAttribute("z"));

    const surfaceNode = config.getElementsByTagName("surface")[0];
    const surfaceData = {
        topsurface: surfaceNode ? surfaceNode.getAttribute("topsurface") : "Smooth",
        bottomsurface: surfaceNode ? surfaceNode.getAttribute("bottomsurface") : "Smooth",
        frontsurface: surfaceNode ? surfaceNode.getAttribute("frontsurface") : "Smooth",
        backsurface: surfaceNode ? surfaceNode.getAttribute("backsurface") : "Smooth",
        rightsurface: surfaceNode ? surfaceNode.getAttribute("rightsurface") : "Smooth",
        leftsurface: surfaceNode ? surfaceNode.getAttribute("leftsurface") : "Smooth"
    };

    const materials = createMaterials(sx, sy, sz, parseInt(colorHex), surfaceData);
    const mesh = createBrick(
        parseFloat(posNode.getAttribute("x")), 
        parseFloat(posNode.getAttribute("y")), 
        parseFloat(posNode.getAttribute("z")), 
        sx, sy, sz, mass, anchored, materials
    );
    
    if (mesh) {
        mesh.name = name;
        mesh.userData = { 
            partType: partType,
            sizeX: sx,
            sizeY: sy,
            sizeZ: sz,
            anchored: anchored, 
            cancollide: canCollide,
            brickcolor: colorHex,
            id: config.getAttribute("id") || Date.now().toString(),
            surfaces: surfaceData,
            mass: mass
        };
        
        // Rebuild geometry based on partType
        rebuildMeshGeometry(mesh);
    }
}

function updateTextureScale(mesh) {
    if (!mesh.material || !Array.isArray(mesh.material) || mesh.userData.partType !== 'Block') return;
    
    const partType = mesh.userData.partType || 'Block';
    const sx = mesh.userData.sizeX || 2;
    const sy = mesh.userData.sizeY || 1;
    const sz = mesh.userData.sizeZ || 4;
    
    // Use the same scaling factors as main.js
    const textureScaleX = 0.5;
    const textureScaleY = 0.25;
    
    // Only apply textures to blocks
    if (partType === 'Block') {
        mesh.material.forEach((mat, i) => {
            if (mat.map && mat.map.image) { 
                if (i === 0 || i === 1) {
                    // Right/Left faces (Z x Y)
                    mat.map.repeat.set(sz * textureScaleX, sy * textureScaleY);
                } else if (i === 2 || i === 3) {
                    // Top/Bottom faces (X x Z)
                    mat.map.repeat.set(sx * textureScaleX, sz * textureScaleY);
                } else {
                    // Front/Back faces (X x Y)
                    mat.map.repeat.set(sx * textureScaleX, sy * textureScaleY);
                }
                mat.map.needsUpdate = true;
            }
        });
    }
}

function updateSelectionBox() {
    if (!selectionBox) return;
    if (selectedObjects.length > 0) {
        selectionBox.setFromObject(selectedObjects[0]);
        selectionBox.visible = true;
    } else { selectionBox.visible = false; }
}

document.addEventListener('DOMContentLoaded', () => {
    initEditorControls();
    loadToolboxModels();
    
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        const btnImg = btn.querySelector('.btn-img');
        const btnTextElem = btn.querySelector('.btn-text');
        if (!btnTextElem) return;
        
        let text = btnTextElem.innerText.trim().toLowerCase();
        
        if (btnImg) {
            let iconName = text.charAt(0).toUpperCase() + text.slice(1) + ".png";
            btnImg.innerHTML = `<img src="assets/icons/${iconName}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'">`;
        }
        
        btn.onclick = () => {
            if (text === "play" || text === "stop") { togglePlay(); return; }
            if (isPlaying) return;

            if (['select', 'move', 'scale', 'rotate'].includes(text)) {
                buttons.forEach(b => b.classList.remove('tool-active'));
                btn.classList.add('tool-active');
                activeTool = text;
                if (selectedObjects.length > 0 && control) {
                    if (text === "select") { control.detach(); control.visible = false; }
                    else { control.setMode(text === "move" ? "translate" : text); control.attach(selectedObjects[0]); control.visible = true; }
                }
            }
            if (text === "group") groupSelected();
            if (text === "color") openColorPicker();
            if (text.includes("part")) {
                // Toggle part type menu
                showPartTypeMenu = !showPartTypeMenu;
                if (showPartTypeMenu) {
                    showPartTypeDropdown(btn);
                }
            }
        };
    });
});

function showPartTypeDropdown(partBtn) {
    // Remove existing menu
    const existingMenu = document.getElementById('part-type-menu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.id = 'part-type-menu';
    const rect = partBtn.getBoundingClientRect();
    menu.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.bottom + 5}px;
        background: #2b2b2b;
        border: 1px solid #444;
        box-shadow: 0px 4px 10px rgba(0,0,0,0.5);
        z-index: 9999999;
        min-width: 120px;
        border-radius: 3px;
    `;
    
    const partTypes = ['Block', 'Sphere', 'Cylinder', 'Cone'];
    partTypes.forEach(type => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.style.cssText = 'padding: 8px 12px; cursor: pointer; color: #eee; font-size: 12px;';
        item.innerText = type;
        item.onmouseenter = () => item.style.background = '#00a2ff';
        item.onmouseleave = () => item.style.background = 'transparent';
        item.onclick = () => {
            deselectAll();
            spawnShapeAtCamera(type.toLowerCase());
            menu.remove();
            showPartTypeMenu = false;
        };
        menu.appendChild(item);
    });
    
    document.body.appendChild(menu);
    
    // Close on click outside
    setTimeout(() => {
        window.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== partBtn) {
                menu.remove();
                showPartTypeMenu = false;
                window.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

function spawnShapeAtCamera(shapeType) {
    var spawnPos = new THREE.Vector3();
    camera.getWorldDirection(spawnPos);
    spawnPos.multiplyScalar(15).add(camera.position);
    
    var sx = 2, sy = 1, sz = 4;
    var surfaces = { 
        topsurface: "Studs", 
        bottomsurface: "Inlets", 
        frontsurface: "Smooth", 
        backsurface: "Smooth", 
        rightsurface: "Smooth", 
        leftsurface: "Smooth" 
    };
    
    // Normalize shape type name
    const partType = shapeType.charAt(0).toUpperCase() + shapeType.slice(1);
    
    var geometry = createGeometryForPartType(partType, sx, sy, sz);
    var materials = createMaterials(sx, sy, sz, 0xff0000, surfaces);
    var mesh = new THREE.Mesh(geometry, materials);
    mesh.position.set(Math.round(spawnPos.x), Math.round(spawnPos.y), Math.round(spawnPos.z));
    mesh.scale.set(1, 1, 1);
    
    var shape;
    if (partType === 'Sphere') {
        shape = new CANNON.Sphere(Math.max(sx, sy, sz) / 2);
    } else if (partType === 'Cylinder' || partType === 'Cone') {
        shape = new CANNON.Cylinder(Math.max(sx, sz) / 2, partType === 'Cone' ? 0 : Math.max(sx, sz) / 2, sy, 16);
    } else {
        shape = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2));
    }
    
    var body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    body.addShape(shape);
    body.position.copy(mesh.position);
    
    world.addBody(body);
    scene.add(mesh);
    bodies.push(body);
    meshes.push(mesh);
    
    mesh.name = partType;
    mesh.userData = {
        partType: partType,
        sizeX: sx,
        sizeY: sy,
        sizeZ: sz,
        anchored: true,
        cancollide: true,
        brickcolor: "0xff0000",
        id: Date.now().toString(),
        surfaces: surfaces,
        mass: 1
    };
    
    if (typeof updateExplorer === "function") updateExplorer();
    selectObject(mesh);
}

// Legacy support for 'part' type
function spawnPartAtCamera() {
    spawnShapeAtCamera('block');
}

// Load models from toolbox folder
async function loadToolboxModels() {
    const toolboxDiv = document.querySelector('#left-sidebar');
    if (!toolboxDiv) return;
    
    try {
        // Try to fetch a list of models - you'll need to create a models.json file
        const response = await fetch('toolbox/models.json');
        if (response.ok) {
            const models = await response.json();
            
            models.forEach(modelFile => {
                const btn = document.createElement('div');
                btn.className = 'toolbox-item';
                btn.style.cssText = 'padding: 8px; margin: 5px 0; background: #3c3c3c; border-radius: 3px; cursor: pointer; font-size: 11px; transition: all 0.2s;';
                btn.innerText = modelFile.replace('.xml', '');
                
                btn.onmouseenter = () => btn.style.background = '#4a4a4a';
                btn.onmouseleave = () => btn.style.background = '#3c3c3c';
                
                btn.onclick = () => spawnModelAtCamera(`toolbox/${modelFile}`);
                
                toolboxDiv.appendChild(btn);
            });
        }
    } catch (e) {
        console.log("No toolbox models found. Create toolbox/models.json to add models.");
    }
}

// Spawn a model from toolbox at camera position
async function spawnModelAtCamera(modelPath) {
    try {
        const response = await fetch(modelPath);
        if (!response.ok) {
            console.error("Failed to load model:", modelPath);
            return;
        }
        
        const xmlString = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        
        // Get spawn position from camera
        var spawnPos = new THREE.Vector3();
        camera.getWorldDirection(spawnPos);
        spawnPos.multiplyScalar(15).add(camera.position);
        
        // Check if it's a model or standalone objects
        const modelNode = xmlDoc.getElementsByTagName('model')[0];

        if (modelNode) {
            // It's a model - parse it with grouping
            const modelName = modelNode.getAttribute('name') || 'Model';
            const modelId = "model_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
            
            const objects = modelNode.getElementsByTagName('object');
            const groupMembers = [];
            
            for (let i = 0; i < objects.length; i++) {
                const node = objects[i];
                const config = node.querySelector('config');
                if (!config) continue;

                const mass = parseFloat(node.getAttribute('mass')) || 0;
                const id = config.getAttribute('id') || 'obj_' + Date.now();
                const name = config.getAttribute('name') || 'Part';
                const partTypeRaw = (config.getAttribute('parttype') || 'brick').toLowerCase();
                const partType = partTypeRaw === 'brick' ? 'Block' : partTypeRaw.charAt(0).toUpperCase() + partTypeRaw.slice(1);

                const anchored = config.getAttribute('anchored') === 'true';
                const cancollide = config.getAttribute('cancollide') !== 'false';

                const pos = config.querySelector('position');
                const sizeNode = config.querySelector('size');
                const brickcolorNode = config.querySelector('brickcolor');
                const surfaceNode = config.querySelector('surface');

                const sx = parseFloat(sizeNode?.getAttribute('x')) || 2;
                const sy = parseFloat(sizeNode?.getAttribute('y')) || 1;
                const sz = parseFloat(sizeNode?.getAttribute('z')) || 4;

                let colorHex = 'ffffff';
                if (brickcolorNode?.textContent) {
                    colorHex = brickcolorNode.textContent.trim().replace(/^0x/i, '').padStart(6, '0');
                }
                const colorNum = parseInt(colorHex, 16);

                const surfaceData = {
                    topsurface: surfaceNode?.getAttribute('topsurface') || 'Smooth',
                    bottomsurface: surfaceNode?.getAttribute('bottomsurface') || 'Smooth',
                    frontsurface: surfaceNode?.getAttribute('frontsurface') || 'Smooth',
                    backsurface: surfaceNode?.getAttribute('backsurface') || 'Smooth',
                    rightsurface: surfaceNode?.getAttribute('rightsurface') || 'Smooth',
                    leftsurface: surfaceNode?.getAttribute('leftsurface') || 'Smooth'
                };

                const materials = createMaterials(sx, sy, sz, colorNum, surfaceData);

                // Position is relative to spawn point
                const relX = parseFloat(pos?.getAttribute('x')) || 0;
                const relY = parseFloat(pos?.getAttribute('y')) || 0;
                const relZ = parseFloat(pos?.getAttribute('z')) || 0;

                const mesh = createBrick(
                    spawnPos.x + relX,
                    spawnPos.y + relY,
                    spawnPos.z + relZ,
                    sx, sy, sz,
                    mass,
                    anchored,
                    materials,
                    partType
                );

                if (mesh) {
                    mesh.name = name;
                    mesh.userData = {
                        ...mesh.userData,
                        id: id,
                        partType: partType,
                        sizeX: sx,
                        sizeY: sy,
                        sizeZ: sz,
                        anchored: anchored,
                        cancollide: cancollide,
                        brickcolor: '0x' + colorHex,
                        surfaces: surfaceData,
                        mass: mass
                    };

                    rebuildMeshGeometry(mesh);
                    groupMembers.push(mesh);
                }
            }
            
            // Create the group
            if (groupMembers.length > 0) {
                const group = { 
                    name: modelName, 
                    members: groupMembers, 
                    id: modelId 
                };
                groups.push(group);
                
                deselectAll();
                groupMembers.forEach(m => selectObject(m));
                updateExplorer();
                console.log(`Spawned model: ${modelName} with ${groupMembers.length} parts`);
            }
            
        } else {
            // Legacy support - standalone objects (no model wrapper)
            const objects = xmlDoc.getElementsByTagName('object');
            const spawnedMeshes = [];
            
            for (let i = 0; i < objects.length; i++) {
                const node = objects[i];
                const config = node.getElementsByTagName("config")[0];
                if (!config) continue;

                const mass = parseFloat(node.getAttribute("mass")) || 1;
                const partType = node.getAttribute("parttype") || 'Block';
                const anchored = config.getAttribute("anchored") === "true";
                const canCollide = config.getAttribute("cancollide") !== "false";
                const name = config.getAttribute("name") || "Part";
                
                const posNode = config.getElementsByTagName("position")[0];
                const sizeNode = config.getElementsByTagName("size")[0];
                const colorHex = config.getElementsByTagName("brickcolor")[0].childNodes[0].nodeValue;

                const sx = parseFloat(sizeNode.getAttribute("x"));
                const sy = parseFloat(sizeNode.getAttribute("y"));
                const sz = parseFloat(sizeNode.getAttribute("z"));

                const surfaceNode = config.getElementsByTagName("surface")[0];
                const surfaceData = {
                    topsurface: surfaceNode ? surfaceNode.getAttribute("topsurface") : "Smooth",
                    bottomsurface: surfaceNode ? surfaceNode.getAttribute("bottomsurface") : "Smooth",
                    frontsurface: surfaceNode ? surfaceNode.getAttribute("frontsurface") : "Smooth",
                    backsurface: surfaceNode ? surfaceNode.getAttribute("backsurface") : "Smooth",
                    rightsurface: surfaceNode ? surfaceNode.getAttribute("rightsurface") : "Smooth",
                    leftsurface: surfaceNode ? surfaceNode.getAttribute("leftsurface") : "Smooth"
                };
                
                const relativeX = parseFloat(posNode.getAttribute("x"));
                const relativeY = parseFloat(posNode.getAttribute("y"));
                const relativeZ = parseFloat(posNode.getAttribute("z"));

                const materials = createMaterials(sx, sy, sz, parseInt(colorHex), surfaceData);
                const mesh = createBrick(
                    spawnPos.x + relativeX, 
                    spawnPos.y + relativeY, 
                    spawnPos.z + relativeZ, 
                    sx, sy, sz, mass, anchored, materials
                );
                
                if (mesh) {
                    mesh.name = name;
                    mesh.userData = { 
                        partType: partType,
                        sizeX: sx,
                        sizeY: sy,
                        sizeZ: sz,
                        anchored: anchored, 
                        cancollide: canCollide,
                        brickcolor: colorHex,
                        id: config.getAttribute("id") || Date.now().toString() + "_" + i,
                        surfaces: surfaceData,
                        mass: mass
                    };
                    
                    rebuildMeshGeometry(mesh);
                    spawnedMeshes.push(mesh);
                }
            }
            
            if (spawnedMeshes.length > 0) {
                deselectAll();
                spawnedMeshes.forEach(m => selectObject(m));
                updateExplorer();
                console.log("Spawned model:", modelPath);
            }
        }
        
    } catch (e) {
        console.error("Error spawning model:", e);
    }
}

function openColorPicker() {
    if (selectedObjects.length === 0) return;
    
    // Create color picker dropdown
    const existingPicker = document.getElementById('color-picker-dropdown');
    if (existingPicker) existingPicker.remove();
    
    const dropdown = document.createElement('div');
    dropdown.id = 'color-picker-dropdown';
    dropdown.style.cssText = `
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: #2b2b2b;
        border: 2px solid #444;
        box-shadow: 0px 4px 20px rgba(0,0,0,0.8);
        z-index: 99999999;
        padding: 15px;
        border-radius: 5px;
        min-width: 300px;
    `;
    
    dropdown.innerHTML = `
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #fff;">Choose Color</div>
        <div id="brick-colors" style="display: grid; grid-template-columns: repeat(8, 30px); gap: 5px; margin-bottom: 15px;"></div>
        <div style="margin-bottom: 10px;">
            <label style="font-size: 11px; color: #aaa;">Hex Color:</label>
            <input type="text" id="hex-input" placeholder="#FFFFFF" style="width: 100%; background: #3c3c3c; border: 1px solid #555; color: white; padding: 5px; margin-top: 3px; border-radius: 3px;">
        </div>
        <div style="margin-bottom: 10px;">
            <label style="font-size: 11px; color: #aaa;">RGB (R, G, B):</label>
            <input type="text" id="rgb-input" placeholder="255, 255, 255" style="width: 100%; background: #3c3c3c; border: 1px solid #555; color: white; padding: 5px; margin-top: 3px; border-radius: 3px;">
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="apply-color" style="flex: 1; background: #00a2ff; color: white; border: none; padding: 8px; cursor: pointer; border-radius: 3px; font-weight: bold;">Apply</button>
            <button id="cancel-color" style="flex: 1; background: #555; color: white; border: none; padding: 8px; cursor: pointer; border-radius: 3px;">Cancel</button>
        </div>
    `;
    
    document.body.appendChild(dropdown);
    
    // Roblox 2007 BrickColors (classic palette)
    const brickColors = [
        0xF2F3F3, 0xA1A5A2, 0x6D6E70, 0x292929, // Whites/Grays/Blacks
        0xC4281C, 0xCC702A, 0xF5CD30, 0x287F47, // Red, Orange, Yellow, Green
        0x0D69AC, 0x6074A1, 0x002060, 0x342B26, // Blues, Browns
        0xDA867A, 0xC4A867, 0x958A73, 0xA75E4D, // Tan/Rust colors
        0xB31004, 0xFF698F, 0xCD6298, 0xE8AB2D, // More reds/pinks
        0x5F8265, 0x669ACD, 0x4B974B, 0x5A93DB, // Greens/Blues
        0xD7C59A, 0xFEFCE8, 0x898788, 0x7C9C6B  // More variety
    ];
    
    const colorGrid = document.getElementById('brick-colors');
    brickColors.forEach(color => {
        const colorDiv = document.createElement('div');
        colorDiv.style.cssText = `
            width: 30px;
            height: 30px;
            background: #${color.toString(16).padStart(6, '0')};
            cursor: pointer;
            border: 2px solid #444;
            border-radius: 3px;
        `;
        colorDiv.onclick = () => {
            document.getElementById('hex-input').value = '#' + color.toString(16).padStart(6, '0').toUpperCase();
            const r = (color >> 16) & 255;
            const g = (color >> 8) & 255;
            const b = color & 255;
            document.getElementById('rgb-input').value = `${r}, ${g}, ${b}`;
        };
        colorGrid.appendChild(colorDiv);
    });
    
    // Apply button
    document.getElementById('apply-color').onclick = () => {
        let hexValue = document.getElementById('hex-input').value.trim();
        const rgbValue = document.getElementById('rgb-input').value.trim();
        
        // Parse RGB if provided
        if (rgbValue) {
            const rgb = rgbValue.split(',').map(v => parseInt(v.trim()));
            if (rgb.length === 3 && rgb.every(v => v >= 0 && v <= 255)) {
                hexValue = '#' + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1).toUpperCase();
            }
        }
        
        if (hexValue && /^#[0-9A-F]{6}$/i.test(hexValue)) {
            selectedObjects.forEach(obj => {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.color.set(hexValue));
                else obj.material.color.set(hexValue);
                obj.userData.brickcolor = hexValue;
            });
            updateProperties();
        }
        dropdown.remove();
    };
    
    // Cancel button
    document.getElementById('cancel-color').onclick = () => {
        dropdown.remove();
    };
    
    // Close on click outside
    setTimeout(() => {
        window.addEventListener('click', function closeColorPicker(e) {
            if (!dropdown.contains(e.target) && !e.target.closest('#color-btn')) {
                dropdown.remove();
                window.removeEventListener('click', closeColorPicker);
            }
        });
    }, 100);
}

function groupSelected() {
    if (selectedObjects.length < 2) return;
    const modelId = "model_" + Date.now();
    const group = { name: "Model_" + groups.length, members: [...selectedObjects], id: modelId };
    groups.push(group);
    deselectAll();
    updateExplorer();
}

function copySelected() {
    if (selectedObjects.length === 0) return;
    const obj = selectedObjects[0];
    clipboard = { 
        name: obj.name, 
        scale: obj.scale.clone(), 
        position: obj.position.clone(),
        rotation: obj.rotation.clone(), 
        color: obj.material[0] ? obj.material[0].color.getHex() : 0xffffff,
        sizeX: obj.userData.sizeX || 2,
        sizeY: obj.userData.sizeY || 1,
        sizeZ: obj.userData.sizeZ || 4,
        partType: obj.userData.partType || 'Block',
        userData: JSON.parse(JSON.stringify(obj.userData)) 
    };
}

function pasteObject() {
    if (!clipboard) return;
    const spawnPos = clipboard.position.clone().add(new THREE.Vector3(4, 0, 0));
    
    // Use canonical size from clipboard
    const mesh = createBrick(
        spawnPos.x, spawnPos.y, spawnPos.z, 
        clipboard.sizeX,
        clipboard.sizeY,
        clipboard.sizeZ,
        clipboard.userData.mass, 
        clipboard.userData.anchored, 
        createMaterials(
            clipboard.sizeX, 
            clipboard.sizeY, 
            clipboard.sizeZ, 
            clipboard.color, 
            clipboard.userData.surfaces
        )
    );
    
    mesh.name = clipboard.name + " (Copy)";
    mesh.userData = JSON.parse(JSON.stringify(clipboard.userData));
    mesh.userData.sizeX = clipboard.sizeX;
    mesh.userData.sizeY = clipboard.sizeY;
    mesh.userData.sizeZ = clipboard.sizeZ;
    mesh.userData.partType = clipboard.partType;
    mesh.rotation.copy(clipboard.rotation);
    
    // Rebuild geometry with correct partType
    rebuildMeshGeometry(mesh);
    
    updateExplorer();
    selectObject(mesh);
}

window.addEventListener('keydown', (e) => {
    if (e.key === "Shift") shiftDown = true;
    if (e.key === "Control") ctrlDown = true;
    if (e.key === "Alt") altDown = true;

    if (!isPlaying) {
        if (e.ctrlKey && e.key.toLowerCase() === 'c') copySelected();
        if (e.ctrlKey && e.key.toLowerCase() === 'v') pasteObject();
        if (e.ctrlKey && e.key.toLowerCase() === 'd') { copySelected(); pasteObject(); }
        if (e.key === "Delete") {
            selectedObjects.forEach(obj => {
                scene.remove(obj);
                let idx = meshes.indexOf(obj);
                if (idx !== -1) { 
                    meshes.splice(idx, 1); 
                    if (bodies[idx]) {
                        world.removeBody(bodies[idx]);
                        bodies.splice(idx, 1);
                    }
                }
            });
            deselectAll();
            updateExplorer();
        }

        if (selectedObjects.length > 0) {
            let group = groups.find(g => g.members.includes(selectedObjects[0]));
            let targetObjects = group ? group.members : selectedObjects;
            if (e.key.toLowerCase() === 'r') { targetObjects.forEach(obj => { obj.rotateY(Math.PI / 2); syncPhysics(obj); }); }
            if (e.key.toLowerCase() === 't') { targetObjects.forEach(obj => { obj.rotateX(Math.PI / 2); syncPhysics(obj); }); }
            updateProperties();
            updateSelectionBox();
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === "Shift") shiftDown = false;
    if (e.key === "Control") ctrlDown = false;
    if (e.key === "Alt") altDown = false;
});

window.addEventListener('mousedown', function(e) {
    if (e.target.closest('#right-sidebar') || e.target.closest('#left-sidebar') || e.target.closest('#top-bar') || e.target.closest('#file-dropdown')) return;
    if (!activeTool || isPlaying || (control && control.dragging) || e.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    let mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    let raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
        let target = intersects[0].object;
        let group = groups.find(g => g.members.includes(target));

        if (shiftDown) {
            if (selectedObjects.includes(target)) selectedObjects = selectedObjects.filter(o => o !== target);
            else selectedObjects.push(target);
        } else {
            deselectAll();
            if (group) {
                group.members.forEach(m => selectObject(m));
                selectedFolderId = group.id;
            } else { selectObject(target); }
        }
        
        if (activeTool === "select" && selectedObjects.length > 0) {
            isDraggingPart = true;
            
            // Determine drag axis based on clicked face
            const normal = intersects[0].face.normal.clone();
            normal.transformDirection(selectedObjects[0].matrixWorld);
            const absNormal = new THREE.Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
            
            // Lock to strongest axis and create appropriate plane
            if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
                // Vertical face clicked - move on XZ plane (horizontal movement)
                dragAxis = 'xz';
                dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -selectedObjects[0].position.y);
            } else if (absNormal.x > absNormal.z) {
                // Left/Right face clicked - move on YZ plane
                dragAxis = 'yz';
                dragPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -selectedObjects[0].position.x);
            } else {
                // Front/Back face clicked - move on XY plane
                dragAxis = 'xy';
                dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -selectedObjects[0].position.z);
            }
            
            // Calculate offset from click point to object center
            dragOffset.copy(intersects[0].point).sub(selectedObjects[0].position);
        }
        
        updateExplorer();
        updateProperties();
    } else { deselectAll(); }
});

window.addEventListener('mousemove', function(e) {
    if ((!isDraggingPart && !isScaling) || selectedObjects.length === 0 || isPlaying || !dragPlane) return;
    
    const rect = renderer.domElement.getBoundingClientRect();
    let mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    let raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    const planeIntersectPoint = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersectPoint)) {
        
        if (isDraggingPart) {
            // Moving logic
            let newPos = planeIntersectPoint.sub(dragOffset);
            
            // Apply snapping if shift is not held
            if (!shiftDown) {
                newPos.x = Math.round(newPos.x);
                newPos.y = Math.round(newPos.y);
                newPos.z = Math.round(newPos.z);
            }
            
            // Preserve the axis that shouldn't move based on the plane
            const oldPos = selectedObjects[0].position.clone();
            if (dragAxis === 'xz') {
                newPos.y = oldPos.y; // Keep Y fixed when dragging on XZ plane
            } else if (dragAxis === 'yz') {
                newPos.x = oldPos.x; // Keep X fixed when dragging on YZ plane
            } else if (dragAxis === 'xy') {
                newPos.z = oldPos.z; // Keep Z fixed when dragging on XY plane
            }

            // Calculate and apply delta to all selected objects
            let delta = newPos.clone().sub(oldPos);
            selectedObjects.forEach(obj => {
                obj.position.add(delta);
                syncPhysics(obj);
            });
        }
        
        
        updateProperties();
        updateSelectionBox();
    }
});

window.addEventListener('mouseup', () => { 
    isDraggingPart = false;
    isScaling = false;
    dragPlane = null;
    dragAxis = null;
});

function selectObject(obj) {
    if (selectedObjects.includes(obj)) return;
    selectedObjects.push(obj);
    updateSelectionBox();
    if (activeTool !== 'select' && control) { 
        control.setMode(activeTool === "move" ? "translate" : activeTool); 
        control.attach(selectedObjects[0]); 
        control.visible = true; 
    }
    updateExplorer();
    updateProperties();
}

function deselectAll() {
    selectedObjects = [];
    selectedFolderId = null;
    if (selectionBox) selectionBox.visible = false;
    if (control) { control.detach(); control.visible = false; }
    updateExplorer();
    updateProperties();
}

function updateExplorer() {
    const h = document.getElementById('hierarchy');
    if (!h) return;
    h.innerHTML = '';
    
    let ws = createFolderUI("Workspace", "Folder.png", "workspace", h);
    createFolderUI("Lighting", "Lighting.png", "lighting", h);
    createFolderUI("ServerScriptService", "SSS.png", "sss", h);
    
    groups.forEach(g => {
        let gDiv = document.createElement('div');
        gDiv.className = "explorer-item" + (selectedFolderId === g.id ? " explorer-selected" : "");
        gDiv.style.paddingLeft = "20px";
        gDiv.innerHTML = `<img src="assets/icons/Model.png" class="exp-icon"> ${g.name}`;
        gDiv.onclick = (e) => { 
            e.stopPropagation(); 
            deselectAll(); 
            selectedFolderId = g.id;
            updateExplorer(); 
            updateProperties();
        };
        ws.appendChild(gDiv);
        let childContainer = document.createElement('div');
        g.members.forEach(m => renderItemUI(m, childContainer, true));
        ws.appendChild(childContainer);
    });
    
    meshes.forEach(m => { if (!groups.some(g => g.members.includes(m))) renderItemUI(m, ws, false); });
}

function createFolderUI(n, i, id, p) {
    let d = document.createElement('div'); 
    d.className = "explorer-item" + (selectedFolderId === id ? " explorer-selected" : ""); 
    d.innerHTML = `<img src="assets/icons/${i}" class="exp-icon"> ${n}`;
    d.onclick = (e) => {
        e.stopPropagation(); deselectAll(); selectedFolderId = id;
        updateExplorer(); updateProperties();
    };
    p.appendChild(d); 
    let cnr = document.createElement('div');
    cnr.id = "folder-children-" + id;
    p.appendChild(cnr);
    return cnr;
}

function renderItemUI(m, p, isChild) {
    let d = document.createElement('div'); 
    d.className = "explorer-item" + (selectedObjects.includes(m) ? " explorer-selected" : "");
    d.style.paddingLeft = isChild ? "40px" : "20px";
    d.innerHTML = `<img src="assets/icons/Part2.png" class="exp-icon"> ${m.name || "Part"}`;
    d.onclick = (e) => { 
        e.stopPropagation(); 
        if (shiftDown) {
            if (selectedObjects.includes(m)) selectedObjects = selectedObjects.filter(o => o !== m);
            else selectedObjects.push(m);
        } else { deselectAll(); selectObject(m); }
        updateExplorer(); updateProperties();
    };
    p.appendChild(d);
}

function getMixedValue(propPath, isBool = false) {
    if (selectedObjects.length === 0) return "";
    let val = propPath(selectedObjects[0]);
    for (let i = 1; i < selectedObjects.length; i++) {
        if (propPath(selectedObjects[i]) !== val) return isBool ? "—" : "";
    }
    return val;
}

function updateProperties() {
    const p = document.getElementById('prop-list');
    if (!p) return;

    if (selectedFolderId === "workspace") {
        p.innerHTML = `<div class="prop-header">Workspace</div>`;
        createRow("Gravity", world.gravity.y, (v) => { 
            world.gravity.set(0, parseFloat(v), 0);
            if (typeof Workspace !== 'undefined') Workspace.gravity = parseFloat(v);
        });
        return;
    }

    if (selectedFolderId === "lighting") {
        p.innerHTML = `<div class="prop-header">Lighting</div>`;
        let sun = scene.children.find(c => c.type === "DirectionalLight");
        createRow("Brightness", sun ? sun.intensity : 1, (v) => { 
            if(sun) {
                sun.intensity = parseFloat(v);
                if (typeof Lighting !== 'undefined') Lighting.brightness = parseFloat(v);
            }
        });
        createRow("Color", sun ? "#" + sun.color.getHexString() : "#ffffff", (v) => { 
            if(sun) sun.color.set(v);
        });
        return;
    }
    
    // Check if a model/group is selected
    if (selectedFolderId && selectedFolderId.startsWith("model_")) {
        const group = groups.find(g => g.id === selectedFolderId);
        if (group) {
            p.innerHTML = `<div class="prop-header">Model</div>`;
            createRow("Name", group.name, (v) => { 
                group.name = v; 
                updateExplorer(); 
            });
            return;
        }
    }

    if (selectedObjects.length === 0) { p.innerHTML = "Select a part..."; return; }
    p.innerHTML = `<div class="prop-header">${selectedObjects.length > 1 ? "Multiple Selected" : selectedObjects[0].name}</div>`;
    
    createDropdownRow(
		"PartType",
		getMixedValue(o => o.userData.partType || "Block"),
		['Block', 'Sphere', 'Cylinder', 'Cone'],
		(v) => {
			selectedObjects.forEach(o => {
				o.userData.partType = v;
				rebuildMeshGeometry(o);   
				syncPhysics(o);          
			});
			updateSelectionBox();
			updateProperties();            
		}
	);
    
    createRow("Name", getMixedValue(o => o.name), (v) => { 
        selectedObjects.forEach(o => o.name = v); 
        updateExplorer(); 
    });
    
    createBoolRow("Anchored", getMixedValue(o => o.userData.anchored, true), (v) => { 
        selectedObjects.forEach(o => { 
            o.userData.anchored = v; 
            syncPhysics(o); 
        }); 
    });
    
    createBoolRow("CanCollide", getMixedValue(o => o.userData.cancollide, true), (v) => { 
        selectedObjects.forEach(o => {
            o.userData.cancollide = v;
        }); 
    });
    
    createRow("PosX", getMixedValue(o => o.position.x.toFixed(2)), (v) => {
    if (selectedObjects.length === 0) return;          
    selectedObjects.forEach(o => {
        o.position.x = parseFloat(v) || 0;              
        syncPhysics(o);
    });
    updateSelectionBox();
	});
    
    createRow("PosY", getMixedValue(o => o.position.y.toFixed(2)), (v) => { 
	if (selectedObjects.length === 0) return;  
        selectedObjects.forEach(o => { 
            o.position.y = parseFloat(v) || 0;     
            syncPhysics(o); 
        }); 
        updateSelectionBox(); 
    });
    
    createRow("PosZ", getMixedValue(o => o.position.z.toFixed(2)), (v) => {
	if (selectedObjects.length === 0) return;  
        selectedObjects.forEach(o => { 
            o.position.z = parseFloat(v) || 0;
            syncPhysics(o); 
        }); 
        updateSelectionBox(); 
    });

    createRow("SizeX", getMixedValue(o => (o.userData.sizeX || 2).toFixed(2)), (v) => { 
	if (selectedObjects.length === 0) return;  
        selectedObjects.forEach(o => {
            o.userData.sizeX = parseFloat(v) || 0;
            rebuildMeshGeometry(o);
            syncPhysics(o);
        }); 
        updateSelectionBox(); 
    });
    
    createRow("SizeY", getMixedValue(o => (o.userData.sizeY || 1).toFixed(2)), (v) => { 
	if (selectedObjects.length === 0) return;  
        selectedObjects.forEach(o => {
            o.userData.sizeY = parseFloat(v) || 0;
            rebuildMeshGeometry(o);
            syncPhysics(o);
        }); 
        updateSelectionBox(); 
    });
    
    createRow("SizeZ", getMixedValue(o => (o.userData.sizeZ || 4).toFixed(2)), (v) => { 
	if (selectedObjects.length === 0) return;  
        selectedObjects.forEach(o => {
            o.userData.sizeZ = parseFloat(v) || 0;
            rebuildMeshGeometry(o);
            syncPhysics(o);
        }); 
        updateSelectionBox(); 
    });

    const surfaces = ["TopSurface", "BottomSurface", "FrontSurface", "BackSurface", "LeftSurface", "RightSurface"];
    const surfaceOptions = ["Studs", "Inlets", "Weld", "Smooth"];
    
    surfaces.forEach(s => {
        createDropdownRow(
    s,
    getMixedValue(o => o.userData.surfaces ? o.userData.surfaces[s.toLowerCase()] : "Smooth"),
    surfaceOptions,
    (v) => {
        selectedObjects.forEach(o => {
            if (!o.userData.surfaces) o.userData.surfaces = {};
            o.userData.surfaces[s.toLowerCase()] = v;
            
            // CRITICAL: Fully recreate materials when surface changes
            const sizeX = o.userData.sizeX || 2;
            const sizeY = o.userData.sizeY || 1;
            const sizeZ = o.userData.sizeZ || 4;
            const color = parseInt(o.userData.brickcolor) || 0xffffff;
            
            o.material = createMaterials(sizeX, sizeY, sizeZ, color, o.userData.surfaces);
            
            // For non-block parts (if any)
            if (o.userData.partType !== 'Block') {
                o.material = o.material[0] || new THREE.MeshPhongMaterial({color});
            }
        });
    }
);
    });
}
// updateProperties = debounce(updateProperties, 300);  

function createRow(l, v, c) {
    const p = document.getElementById('prop-list');
    if (!p) return;
    
    let r = document.createElement('div'); 
    r.className = "prop-row";
    r.innerHTML = `<span class="prop-label">${l}</span><input class="prop-input" value="${v || ''}">`;
    
    let input = r.querySelector('input');
input.addEventListener('change', (e) => {
    c(e.target.value);
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        c(e.target.value);
        input.blur();
        updateProperties(); // only on Enter
    }
});

input.addEventListener('blur', (e) => {
    c(e.target.value);
    updateProperties(); // refresh when you finish editing
});
    
    p.appendChild(r);
}

function createDropdownRow(l, v, options, c) {
    const p = document.getElementById('prop-list');
    if (!p) return;
    
    let r = document.createElement('div'); 
    r.className = "prop-row";
    
    let selectHTML = `<select class="prop-input">`;
    options.forEach(opt => {
        selectHTML += `<option value="${opt}" ${v === opt ? 'selected' : ''}>${opt}</option>`;
    });
    selectHTML += `</select>`;
    
    r.innerHTML = `<span class="prop-label">${l}</span>${selectHTML}`;
    
    let select = r.querySelector('select');
    select.addEventListener('change', (e) => {
        c(e.target.value);
        updateProperties();
    });
    
    p.appendChild(r);
}

function createBoolRow(l, v, c) {
    const p = document.getElementById('prop-list');
    if (!p) return;
    
    let r = document.createElement('div'); 
    r.className = "prop-row";
    let checked = v === true ? 'checked' : '';
    let indeterminate = v === "—";
    r.innerHTML = `<span class="prop-label">${l}</span><input type="checkbox" ${checked}>`;
    
    let checkbox = r.querySelector('input');
    if (indeterminate) checkbox.indeterminate = true;
    
    checkbox.addEventListener('change', (e) => {
        c(e.target.checked);
        updateProperties();
    });
    
    p.appendChild(r);
}

function syncPhysics(m) {
    let i = meshes.indexOf(m);
    if (i === -1 || !bodies[i]) return;
   
    try {
        bodies[i].position.copy(m.position);
        bodies[i].quaternion.copy(m.quaternion);
       
        if (m.userData.anchored) {
            bodies[i].type = CANNON.Body.STATIC;
            bodies[i].mass = 0;
            bodies[i].velocity.set(0,0,0);
            bodies[i].angularVelocity.set(0,0,0);
        } else {
            bodies[i].type = CANNON.Body.DYNAMIC;
            bodies[i].mass = m.userData.mass || 1;
        }
       
        // Update the shape to match current size from userData
        const partType = m.userData.partType || 'Block';
        const sx = m.userData.sizeX || 2;
        const sy = m.userData.sizeY || 1;
        const sz = m.userData.sizeZ || 4;
       
        let newShape;
        if (partType === 'Sphere') {
            newShape = new CANNON.Sphere(Math.max(sx, sy, sz) / 2);
        } else if (partType === 'Cylinder' || partType === 'Cone') {
            newShape = new CANNON.Cylinder(
                Math.max(sx, sz) / 2,
                partType === 'Cone' ? 0 : Math.max(sx, sz) / 2,
                sy,
                16
            );
        } else {
            newShape = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2));
        }
       
        // Remove all old shapes first!
        while (bodies[i].shapes.length > 0) {
            bodies[i].removeShape(bodies[i].shapes[0]);
        }
       
        // Add the new shape
        bodies[i].addShape(newShape);
       
        // Important updates
        bodies[i].updateBoundingRadius();
        bodies[i].updateMassProperties();
        bodies[i].aabbNeedsUpdate = true;
		bodies[i].wakeUp();
    } catch(e) {
        console.error("Physics sync error:", e);
    }
}