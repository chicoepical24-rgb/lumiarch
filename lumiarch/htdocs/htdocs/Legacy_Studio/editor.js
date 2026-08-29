import * as THREE from "three";
import { TransformControls } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/TransformControls.js";

var control; 
var selectedObjects = [];
var selectedFolderId = null; 
var selectionBox; 
var clipboard = null; 
var groups = [];
var removedWelds = [];
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
let isScalingActive = false;
let originalScale = new THREE.Vector3();

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
    control.setRotationSnap(ROTATE_SNAP);
    
    control.setScaleSnap(0.5);
    
    control.enabled = true;
    scene.add(control);

    selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x00a2ff);
    selectionBox.visible = false;
    scene.add(selectionBox);

    // ── Track when we start scaling ──
    let isScalingActive = false;

    control.addEventListener('mouseDown', () => {
        if (control.object && !isPlaying) {
            const obj = control.object;
            const idx = meshes.indexOf(obj);
            
            // Remove welds if needed
            if (idx !== -1 && bodies[idx]) {
                removedWelds = removeWeldsForBody(bodies[idx]);
            }

            // Store original transform
            lastScale.copy(obj.scale);
            lastPosition.copy(obj.position);
            lastQuat.copy(obj.quaternion);

            // ── Special handling for scale mode ──
            if (control.mode === 'scale') {
                // Block scaling if object is part of a group
                const isGrouped = groups.some(g => g.members.includes(obj));
                if (isGrouped) {
                    console.warn("Scaling is disabled for grouped objects. Ungroup first.");
                    // Optional: visual feedback
                    control.detach();
                    // You can also show a temporary message in UI if you want
                    return;
                }

                isScalingActive = true;
            }
        }
    });

    // ── Scale mode: make preview PREDICT the final additive result ────────
    control.addEventListener('change', () => {
    if (!control.object || isPlaying) return;
    const obj = control.object;

if (control.mode === 'scale') {
     syncPhysics(obj);           // recreate physics shape based on current scale
}

    // ── Group movement sync (your existing logic) ─────────────────────────────
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

    // Update tracking vars
    lastPosition.copy(obj.position);
    lastQuat.copy(obj.quaternion);

    // Standard syncs
    syncPhysics(obj);
    updateProperties();
    updateSelectionBox();
});

    // ── Finalize scale on mouse up ──
    control.addEventListener('mouseUp', () => {
    if (!control.object) return;
    const obj = control.object;
    if (isScalingActive && control.mode === 'scale') {
        const currentSizeX = obj.userData.sizeX || 2;
        const currentSizeY = obj.userData.sizeY || 1;
        const currentSizeZ = obj.userData.sizeZ || 4;
        obj.userData.sizeX = Math.abs(currentSizeX * obj.scale.x);
        obj.userData.sizeY = Math.abs(currentSizeY * obj.scale.y);
        obj.userData.sizeZ = Math.abs(currentSizeZ * obj.scale.z);
        obj.userData.sizeX = Math.max(0.125, obj.userData.sizeX);
        obj.userData.sizeY = Math.max(0.125, obj.userData.sizeY);
        obj.userData.sizeZ = Math.max(0.125, obj.userData.sizeZ);
        if (!shiftDown) {
            obj.userData.sizeX = Math.round(obj.userData.sizeX * 8) / 8;
            obj.userData.sizeY = Math.round(obj.userData.sizeY * 8) / 8;
            obj.userData.sizeZ = Math.round(obj.userData.sizeZ * 8) / 8;
        }
        obj.scale.set(1, 1, 1);
        rebuildMeshGeometry(obj);
        syncPhysics(obj);
        updateProperties();
        updateSelectionBox();
    }
    isScalingActive = false;
    // Your weld restore logic...
    if (!isPlaying && removedWelds.length > 0) {
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
        // ── SNAPSHOT ORIGINAL STATE BEFORE ANY CHANGES ────────────────────────
        meshes.forEach((m) => {
            if (!m.userData) return;

            // Use a dedicated backup object to avoid polluting userData
            m.userData._playBackup = {
                position:        m.position.clone(),
                quaternion:      m.quaternion.clone(),
                scale:           m.scale.clone(),
                sizeX:           m.userData.sizeX ?? 2,
                sizeY:           m.userData.sizeY ?? 1,
                sizeZ:           m.userData.sizeZ ?? 4,
                partType:        m.userData.partType || 'Block',
                brickcolor:      m.userData.brickcolor || '0xffffff',
                anchored:        !!m.userData.anchored,
                cancollide:      m.userData.cancollide !== false,
                mass:            m.userData.mass ?? 1,
                surfaces:        JSON.parse(JSON.stringify(m.userData.surfaces || {
                    topsurface: "Smooth", bottomsurface: "Smooth",
                    frontsurface: "Smooth", backsurface: "Smooth",
                    rightsurface: "Smooth", leftsurface: "Smooth"
                })),
                name:            m.name || 'Part'
                // You can add velocity/angularVelocity here if you ever want to *preserve* motion on resume
            };
        });

        // Wake up physics bodies
        bodies.forEach(body => {
            if (body && body.wakeUp) body.wakeUp();
        });

        if (window.playerScript && typeof window.playerScript.spawn === 'function') {
            window.playerScript.spawn();
        }

        // (they should already be attached if something was selected)
        
    } else {
        // ── RESTORE EVERYTHING TO PRE-PLAY STATE ──────────────────────────────
        meshes.forEach((m, i) => {
            if (!m.userData?._playBackup) return;

            const bak = m.userData._playBackup;

            // Transform (position + rotation)
            m.position.copy(bak.position);
            m.quaternion.copy(bak.quaternion);
            m.scale.set(1, 1, 1);  // always reset visual scale — size is in geometry

            // Size & geometry rebuild
            m.userData.sizeX    = bak.sizeX;
            m.userData.sizeY    = bak.sizeY;
            m.userData.sizeZ    = bak.sizeZ;
            m.userData.partType = bak.partType;
            rebuildMeshGeometry(m);

            // Other properties
            m.name                      = bak.name;
            m.userData.anchored         = bak.anchored;
            m.userData.cancollide       = bak.cancollide;
            m.userData.mass             = bak.mass;
            m.userData.surfaces         = JSON.parse(JSON.stringify(bak.surfaces));
            m.userData.brickcolor       = bak.brickcolor;

            // Restore color/materials
            const colorHex = parseInt(bak.brickcolor.replace(/^0x/i, ''), 16);
            if (Array.isArray(m.material)) {
                m.material.forEach(mat => mat.color.setHex(colorHex));
            } else if (m.material) {
                m.material.color.setHex(colorHex);
            }

            // Physics body reset
            if (bodies[i]) {
                const body = bodies[i];
                body.position.copy(m.position);
                body.quaternion.copy(m.quaternion);
                body.velocity.set(0, 0, 0);
                body.angularVelocity.set(0, 0, 0);

                // Re-apply body type & mass
                if (bak.anchored) {
                    body.type = CANNON.Body.STATIC;
                    body.mass = 0;
                } else {
                    body.type = CANNON.Body.DYNAMIC;
                    body.mass = bak.mass || 1;
                }

                // Re-create shape to match restored size/partType
                syncPhysics(m);

                if (body.sleep) body.sleep();
            }

            // Clean up backup
            delete m.userData._playBackup;
        });

        // Cleanup player/script stuff
        if (window.playerScript && typeof window.playerScript.despawn === 'function') {
            window.playerScript.despawn();
        }

        // UI refresh
        deselectAll();  // optional — prevents stale selection after reset
        updateExplorer();
        updateProperties();
        updateSelectionBox();
    }

    // Sync with any external physics toggle if it exists
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
    xml += '<galaxia infostuff="addstuffhere">\n';
    
    // Workspace
    xml += '    <item className="Workspace">\n';
    xml += '        <properties>\n';
    xml += `            <gravity value="${Math.abs(world.gravity.y)}"/>\n`;
    xml += '        </properties>\n\n';

    const meshesInGroups = new Set();
    
    // Save groups/models
    groups.forEach(g => {
        xml += `        <item className="Model" name="${g.name}">\n`;
        xml += '            <properties>\n';
        xml += '            </properties>\n\n';
        
        g.members.forEach(mesh => {
            meshesInGroups.add(mesh);
            
            if (!mesh.userData) return;
            
            const name = mesh.name || 'Part';
            const partType = mesh.userData.partType || 'Block';
            const partTypeFormatted = partType === 'Block' ? 'Brick' : partType;
            
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
            
            let colorHex = (mesh.userData.brickcolor || '0xffffff').replace('0x', '#');
            if (!colorHex.startsWith('#')) colorHex = '#' + colorHex;
            
            xml += `            <item className="Part" name="${name}">\n`;
            xml += `                <properties>\n`;
            xml += `                    <partType>${partTypeFormatted}</partType>\n`;
            xml += `                    <position X="${mesh.position.x.toFixed(3)}" Y="${mesh.position.y.toFixed(3)}" Z="${mesh.position.z.toFixed(3)}"/>\n`;
            xml += `                    <size X="${size.x.toFixed(3)}" Y="${size.y.toFixed(3)}" Z="${size.z.toFixed(3)}"/>\n`;
            xml += `                    <brickcolor>${colorHex}</brickcolor>\n`;
            xml += `                    <cancollide>${mesh.userData.cancollide !== false}</cancollide>\n`;
            xml += `                    <anchored>${!!mesh.userData.anchored}</anchored>\n`;
            xml += `                    <surface topsurface="${surfaces.topsurface}" bottomsurface="${surfaces.bottomsurface}" frontsurface="${surfaces.frontsurface}" backsurface="${surfaces.backsurface}" rightsurface="${surfaces.rightsurface}" leftsurface="${surfaces.leftsurface}"/>\n`;
            xml += `                </properties>\n`;
            xml += `            </item>\n\n`;
        });
        
        xml += '        </item>\n\n';
    });

    // Save ungrouped meshes
    meshes.forEach(mesh => {
        if (meshesInGroups.has(mesh)) return;
        
        if (!mesh.userData) return;
        
        const name = mesh.name || 'Part';
        const partType = mesh.userData.partType || 'Block';
        const partTypeFormatted = partType === 'Block' ? 'Brick' : partType;
        
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
        
        let colorHex = (mesh.userData.brickcolor || '0xffffff').replace('0x', '#');
        if (!colorHex.startsWith('#')) colorHex = '#' + colorHex;
        
        xml += `        <item className="Part" name="${name}">\n`;
        xml += `            <properties>\n`;
        xml += `                <partType>${partTypeFormatted}</partType>\n`;
        xml += `                <position X="${mesh.position.x.toFixed(3)}" Y="${mesh.position.y.toFixed(3)}" Z="${mesh.position.z.toFixed(3)}"/>\n`;
        xml += `                <size X="${size.x.toFixed(3)}" Y="${size.y.toFixed(3)}" Z="${size.z.toFixed(3)}"/>\n`;
        xml += `                <brickcolor>${colorHex}</brickcolor>\n`;
        xml += `                <cancollide>${mesh.userData.cancollide !== false}</cancollide>\n`;
        xml += `                <anchored>${!!mesh.userData.anchored}</anchored>\n`;
        xml += `                <surface topsurface="${surfaces.topsurface}" bottomsurface="${surfaces.bottomsurface}" frontsurface="${surfaces.frontsurface}" backsurface="${surfaces.backsurface}" rightsurface="${surfaces.rightsurface}" leftsurface="${surfaces.leftsurface}"/>\n`;
        xml += `            </properties>\n`;
        xml += `        </item>\n\n`;
    });

    xml += '    </item>\n\n';
    
    // Lighting
    xml += '    <item className="Lighting">\n';
    xml += '        <properties>\n';
    const sun = scene.getObjectByName("SunLight");
    xml += `            <brightness value="${sun ? sun.intensity : 1}"/>\n`;
    xml += `            <ambient value="${sun ? '#' + sun.color.getHexString() : '#ffffff'}"/>\n`;
    xml += '        </properties>\n';
    xml += '    </item>\n';
    
    xml += '</galaxia>';

    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    console.log("Map saved as:", filename);
}

function formatPartXML(mesh, indent) {
    if (!mesh.userData) return '';
    
    const name = mesh.name || 'Part';
    const partType = mesh.userData.partType || 'Block';
    const partTypeFormatted = partType === 'Block' ? 'Brick' : partType;
    
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
    
    let colorHex = (mesh.userData.brickcolor || '0xffffff').replace('0x', '#');
    if (!colorHex.startsWith('#')) colorHex = '#' + colorHex;
    
    let xml = '';
    xml += `${indent}<item className="Part" name="${name}">\n`;
    xml += `${indent}    <properties>\n`;
    xml += `${indent}        <partType>${partTypeFormatted}</partType>\n`;
    xml += `${indent}        <position X="${mesh.position.x.toFixed(3)}" Y="${mesh.position.y.toFixed(3)}" Z="${mesh.position.z.toFixed(3)}"/>\n`;
    xml += `${indent}        <size X="${size.x.toFixed(3)}" Y="${size.y.toFixed(3)}" Z="${size.z.toFixed(3)}"/>\n`;
    xml += `${indent}        <brickcolor>${colorHex}</brickcolor>\n`;
    xml += `${indent}        <cancollide>${mesh.userData.cancollide !== false}</cancollide>\n`;
    xml += `${indent}        <anchored>${!!mesh.userData.anchored}</anchored>\n`;
    xml += `${indent}        <surface topsurface="${surfaces.topsurface}" bottomsurface="${surfaces.bottomsurface}" frontsurface="${surfaces.frontsurface}" backsurface="${surfaces.backsurface}" rightsurface="${surfaces.rightsurface}" leftsurface="${surfaces.leftsurface}"/>\n`;
    xml += `${indent}    </properties>\n`;
    xml += `${indent}</item>\n\n`;
    
    return xml;
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
    
    // Detect format based on root element
    const rootTag = xmlDoc.documentElement.tagName.toLowerCase();
    
    if (rootTag === 'galaxia-game') {
        // Old format
        loadOldFormat(xmlDoc);
    } else if (rootTag === 'galaxia') {
        // New format
        loadNewFormat(xmlDoc);
    } else {
        console.error("Unknown XML format. Root tag:", rootTag);
        alert("Unknown map format!");
        return;
    }

    // After loading all parts → bake initial connections (if you have this function)
    if (typeof bakeInitialConnections === 'function') {
        bakeInitialConnections();
    }

    updateExplorer();
    console.log("Load complete. Parts created:", meshes.length);
}

function loadOldFormat(xmlDoc) {
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
            parseModel(models[i]);
        }

        // Load ungrouped objects
        const objects = Array.from(workspace.getElementsByTagName('object')).filter(obj => {
            return !obj.parentElement || obj.parentElement.tagName !== 'model';
        });
        for (let i = 0; i < objects.length; i++) {
            parseObject(objects[i]);
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
}

function loadNewFormat(xmlDoc) {
    // Find Workspace item
    const workspaceItem = Array.from(xmlDoc.getElementsByTagName('item')).find(
        item => item.getAttribute('className') === 'Workspace'
    );
    
    if (workspaceItem) {
        // Load gravity
        const gravityNode = workspaceItem.querySelector('properties gravity');
        if (gravityNode) {
            const gravity = -parseFloat(gravityNode.getAttribute('value')) || -100;
            world.gravity.set(0, gravity, 0);
            if (typeof Workspace !== 'undefined') Workspace.gravity = gravity;
        }
        
        // Load Models first
        const models = Array.from(workspaceItem.children).filter(
            child => child.tagName === 'item' && child.getAttribute('className') === 'Model'
        );
        
        models.forEach(modelNode => {
            parseNewFormatModel(modelNode);
        });
        
        // Load standalone Parts (not in models)
        const standaloneParts = Array.from(workspaceItem.children).filter(
            child => child.tagName === 'item' && 
                     child.getAttribute('className') === 'Part' &&
                     child.parentElement === workspaceItem
        );
        
        standaloneParts.forEach(partNode => {
            parseNewFormatPart(partNode);
        });
    }
    
    // Find Lighting item
    const lightingItem = Array.from(xmlDoc.getElementsByTagName('item')).find(
        item => item.getAttribute('className') === 'Lighting'
    );
    
    if (lightingItem) {
        const props = lightingItem.querySelector('properties');
        if (props) {
            const brightnessNode = props.querySelector('brightness');
            const ambientNode = props.querySelector('ambient');
            
            const brightness = brightnessNode ? parseFloat(brightnessNode.getAttribute('value')) : 1;
            const ambient = ambientNode ? ambientNode.getAttribute('value') : '#ffffff';
            
            const sun = scene.getObjectByName("SunLight");
            if (sun) {
                sun.intensity = brightness;
                sun.color.set(ambient);
            }
            if (typeof Lighting !== 'undefined') {
                Lighting.brightness = brightness;
            }
        }
    }
}


function parseObject(node) {
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
    const partType = partTypeRaw === 'brick' ? 'Block' : partTypeRaw.charAt(0).toUpperCase() + partTypeRaw.slice(1);

    const anchored = config.getAttribute('anchored') === 'true';
    const cancollide = config.getAttribute('cancollide') !== 'false';

    // Position, Size, Color, Surface
    const pos = config.querySelector('position');
    const sizeNode = config.querySelector('size');
    const brickcolorNode = config.querySelector('brickcolor');
    const surfaceNode = config.querySelector('surface');

    // Rotation (already good)
    const rotNode = config.querySelector('rotation');
    let rx = 0, ry = 0, rz = 0;
    if (rotNode) {
        rx = parseFloat(rotNode.getAttribute('x')) || 0;
        ry = parseFloat(rotNode.getAttribute('y')) || 0;
        rz = parseFloat(rotNode.getAttribute('z')) || 0;
    }

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

    console.log(`Attempting to create: ${name} | Color: 0x${colorHex} | Size: ${sx}x${sy}x${sz}`);

    const mesh = createBrick(
        parseFloat(pos?.getAttribute('x')) || 0,
        parseFloat(pos?.getAttribute('y')) || 0,
        parseFloat(pos?.getAttribute('z')) || 0,
        sx, sy, sz,
        mass,
        anchored,
        materials,          // ← now correctly passed
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

        // Apply loaded rotation
        mesh.rotation.set(
            THREE.MathUtils.degToRad(rx),
            THREE.MathUtils.degToRad(ry),
            THREE.MathUtils.degToRad(rz)
        );

        // Sync physics body
        const idx = meshes.indexOf(mesh);
        if (idx !== -1 && bodies[idx]) {
            bodies[idx].quaternion.copy(mesh.quaternion);
        }

        rebuildMeshGeometry(mesh);
        console.log(`SUCCESS: Loaded ${name} (ID: ${id}, Color: 0x${colorHex}, Rotation: ${rx}°,${ry}°,${rz}°)`);
    } else {
        console.error(`FAILED to create mesh for ${name} (ID: ${id})`);
    }
}

function parseNewFormatPart(partNode) {
    const props = partNode.querySelector('properties');
    if (!props) {
        console.warn("Part missing properties:", partNode);
        return;
    }
    
    const name = partNode.getAttribute('name') || 'Part';
    
    // Parse properties
    const partTypeNode = props.querySelector('partType');
    const posNode = props.querySelector('position');
    const sizeNode = props.querySelector('size');
    const colorNode = props.querySelector('brickcolor');
    const anchoredNode = props.querySelector('anchored');
    const cancollideNode = props.querySelector('cancollide');
    const surfaceNode = props.querySelector('surface');
    
    const partTypeRaw = (partTypeNode?.textContent || 'Brick').toLowerCase();
    const partType = partTypeRaw === 'brick' ? 'Block' : partTypeRaw.charAt(0).toUpperCase() + partTypeRaw.slice(1);
    
    const px = parseFloat(posNode?.getAttribute('X')) || 0;
    const py = parseFloat(posNode?.getAttribute('Y')) || 0;
    const pz = parseFloat(posNode?.getAttribute('Z')) || 0;
    
    const sx = parseFloat(sizeNode?.getAttribute('X')) || 2;
    const sy = parseFloat(sizeNode?.getAttribute('Y')) || 1;
    const sz = parseFloat(sizeNode?.getAttribute('Z')) || 4;
    
    let colorHex = colorNode?.textContent?.trim() || '#ffffff';
    if (!colorHex.startsWith('#')) colorHex = '#' + colorHex;
    const colorNum = parseInt(colorHex.replace('#', ''), 16);
    
    const anchored = anchoredNode?.textContent === 'true';
    const cancollide = cancollideNode?.textContent !== 'false';
    
    const surfaceData = {
        topsurface: surfaceNode?.getAttribute('topsurface') || 'Smooth',
        bottomsurface: surfaceNode?.getAttribute('bottomsurface') || 'Smooth',
        frontsurface: surfaceNode?.getAttribute('frontsurface') || 'Smooth',
        backsurface: surfaceNode?.getAttribute('backsurface') || 'Smooth',
        rightsurface: surfaceNode?.getAttribute('rightsurface') || 'Smooth',
        leftsurface: surfaceNode?.getAttribute('leftsurface') || 'Smooth'
    };
    
    const materials = createMaterials(sx, sy, sz, colorNum, surfaceData);
    
    console.log(`Creating part: ${name} at (${px}, ${py}, ${pz})`);
    
    const mesh = createBrick(
        px, py, pz,
        sx, sy, sz,
        anchored ? 0 : 1,
        anchored,
        materials,
        partType
    );
    
    if (mesh) {
        mesh.name = name;
        mesh.userData = {
            ...mesh.userData,
            id: Date.now().toString() + '_' + Math.random(),
            partType: partType,
            sizeX: sx,
            sizeY: sy,
            sizeZ: sz,
            anchored: anchored,
            cancollide: cancollide,
            brickcolor: '0x' + colorHex.replace('#', ''),
            surfaces: surfaceData,
            mass: anchored ? 0 : 1
        };
        
        rebuildMeshGeometry(mesh);
        console.log(`SUCCESS: Loaded ${name} (${partType})`);
    } else {
        console.error(`FAILED to create mesh for ${name}`);
    }
}

function parseNewFormatModel(modelNode) {
    const modelName = modelNode.getAttribute('name') || 'Model';
    const modelId = "model_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    
    // Get all Part items within this Model
    const parts = modelNode.querySelectorAll('item[className="Part"]');
    const groupMembers = [];
    
    parts.forEach(partNode => {
        const props = partNode.querySelector('properties');
        if (!props) return;
        
        const name = partNode.getAttribute('name') || 'Part';
        
        // Parse properties (same as parseNewFormatPart)
        const partTypeNode = props.querySelector('partType');
        const posNode = props.querySelector('position');
        const sizeNode = props.querySelector('size');
        const colorNode = props.querySelector('brickcolor');
        const anchoredNode = props.querySelector('anchored');
        const cancollideNode = props.querySelector('cancollide');
        const surfaceNode = props.querySelector('surface');
        
        const partTypeRaw = (partTypeNode?.textContent || 'Brick').toLowerCase();
        const partType = partTypeRaw === 'brick' ? 'Block' : partTypeRaw.charAt(0).toUpperCase() + partTypeRaw.slice(1);
        
        const px = parseFloat(posNode?.getAttribute('X')) || 0;
        const py = parseFloat(posNode?.getAttribute('Y')) || 0;
        const pz = parseFloat(posNode?.getAttribute('Z')) || 0;
        
        const sx = parseFloat(sizeNode?.getAttribute('X')) || 2;
        const sy = parseFloat(sizeNode?.getAttribute('Y')) || 1;
        const sz = parseFloat(sizeNode?.getAttribute('Z')) || 4;
        
        let colorHex = colorNode?.textContent?.trim() || '#ffffff';
        if (!colorHex.startsWith('#')) colorHex = '#' + colorHex;
        const colorNum = parseInt(colorHex.replace('#', ''), 16);
        
        const anchored = anchoredNode?.textContent === 'true';
        const cancollide = cancollideNode?.textContent !== 'false';
        
        const surfaceData = {
            topsurface: surfaceNode?.getAttribute('topsurface') || 'Smooth',
            bottomsurface: surfaceNode?.getAttribute('bottomsurface') || 'Smooth',
            frontsurface: surfaceNode?.getAttribute('frontsurface') || 'Smooth',
            backsurface: surfaceNode?.getAttribute('backsurface') || 'Smooth',
            rightsurface: surfaceNode?.getAttribute('rightsurface') || 'Smooth',
            leftsurface: surfaceNode?.getAttribute('leftsurface') || 'Smooth'
        };
        
        const materials = createMaterials(sx, sy, sz, colorNum, surfaceData);
        
        const mesh = createBrick(
            px, py, pz,
            sx, sy, sz,
            anchored ? 0 : 1,
            anchored,
            materials,
            partType
        );
        
        if (mesh) {
            mesh.name = name;
            mesh.userData = {
                ...mesh.userData,
                id: Date.now().toString() + '_' + Math.random(),
                partType: partType,
                sizeX: sx,
                sizeY: sy,
                sizeZ: sz,
                anchored: anchored,
                cancollide: cancollide,
                brickcolor: '0x' + colorHex.replace('#', ''),
                surfaces: surfaceData,
                mass: anchored ? 0 : 1
            };
            
            rebuildMeshGeometry(mesh);
            groupMembers.push(mesh);
        }
    });
    
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


function parseModel(modelNode) {
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

    // ← NEW: Apply relative rotation from XML
    const rotNode = config.querySelector('rotation');
    if (rotNode) {
        const rx = parseFloat(rotNode.getAttribute('x')) || 0;
        const ry = parseFloat(rotNode.getAttribute('y')) || 0;
        const rz = parseFloat(rotNode.getAttribute('z')) || 0;
        mesh.rotation.set(
            THREE.MathUtils.degToRad(rx),
            THREE.MathUtils.degToRad(ry),
            THREE.MathUtils.degToRad(rz)
        );
    }

    rebuildMeshGeometry(mesh);
    groupMembers.push(mesh);
	
	const idx = meshes.indexOf(mesh);
    if (idx !== -1 && bodies[idx]) {
        bodies[idx].quaternion.copy(mesh.quaternion);
        }
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
    const partTypeRaw = (config.getAttribute("parttype") || 'brick').toLowerCase(); 
    const partType = partTypeRaw === 'brick' ? 'Block' : partTypeRaw.charAt(0).toUpperCase() + partTypeRaw.slice(1);
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
                    else { 
                        control.setMode(text === "move" ? "translate" : text); 
                        control.attach(selectedObjects[0]); 
                        control.visible = true; 
                    }
                }
            }
            if (text === "group") groupSelected();
            if (text === "color") openColorPicker();
            if (text.includes("part")) {
                showPartTypeMenu = !showPartTypeMenu;
                if (showPartTypeMenu) {
                    showPartTypeDropdown(btn);
                }
            }
        };
    });

    
});

// Prevent clicks inside properties panel from deselecting parts (but NOT hierarchy)
const propPanel = document.getElementById('prop-list');
if (propPanel) {
    ['click', 'mousedown', 'mouseup'].forEach(eventType => {
        propPanel.addEventListener(eventType, (e) => {
            e.stopPropagation();
        }, { capture: true });
    });
}

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
    // Ignore clicks inside UI panels
    if (
        e.target.closest('#top-bar') ||
        e.target.closest('#file-dropdown') ||
        e.target.closest('#color-picker-dropdown') ||
        e.target.closest('#part-type-menu') ||
        e.target.closest('#right-sidebar') ||    
        e.target.closest('#left-sidebar') ||      
        e.target.closest('#hierarchy') ||         
        e.target.closest('#bottom-panel')        
    ) {
        return; 
    }
	
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
    if ((!isDraggingPart && !isScaling) || selectedObjects.length === 0 || !dragPlane) return;
    
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

    // ── HEADER / SPECIAL CASES ───────────────────────────────────────────────
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
            if (sun) {
                sun.intensity = parseFloat(v);
                if (typeof Lighting !== 'undefined') Lighting.brightness = parseFloat(v);
            }
        });
        createRow("Color", sun ? "#" + sun.color.getHexString() : "#ffffff", (v) => {
            if (sun) sun.color.set(v);
        });
        return;
    }

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

    if (selectedObjects.length === 0) {
        p.innerHTML = "Select a part...";
        return;
    }

    p.innerHTML = `<div class="prop-header">${selectedObjects.length > 1 ? "Multiple Selected" : selectedObjects[0].name}</div>`;

    // ── PART TYPE ─────────────────────────────────────────────────────────────
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

    // ── NAME ──────────────────────────────────────────────────────────────────
    createRow("Name", getMixedValue(o => o.name), (v) => {
        selectedObjects.forEach(o => o.name = v);
        updateExplorer();
    });

    // ── POSITION (single combined field) ──────────────────────────────────────
    const pos = selectedObjects[0].position;
    let posDisplay = `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`;
    if (selectedObjects.length > 1) posDisplay = "—";

    let posRow = document.createElement('div');
    posRow.className = "prop-row";
    posRow.innerHTML = `
        <span class="prop-label">Position</span>
        <input class="prop-input" type="text" value="${posDisplay}" placeholder="0, 0, 0">
    `;
    p.appendChild(posRow);

    posRow.querySelector('input').addEventListener('change', (e) => {
        const text = e.target.value.trim();
        if (!text) return;
        const parts = text.split(',').map(v => parseFloat(v.trim()));
        if (parts.length === 3 && !parts.some(isNaN)) {
            selectedObjects.forEach(obj => {
                obj.position.set(parts[0], parts[1], parts[2]);
                syncPhysics(obj);
            });
            updateSelectionBox();
            updateProperties(); // refresh display
        }
    });

    // ── ROTATION (single combined field – degrees) ────────────────────────────
    const firstRot = selectedObjects[0].rotation;
    let rotDisplay = `${THREE.MathUtils.radToDeg(firstRot.x).toFixed(1)}, ` +
                     `${THREE.MathUtils.radToDeg(firstRot.y).toFixed(1)}, ` +
                     `${THREE.MathUtils.radToDeg(firstRot.z).toFixed(1)}`;
    if (selectedObjects.length > 1) rotDisplay = "—";

    let rotRow = document.createElement('div');
    rotRow.className = "prop-row";
    rotRow.innerHTML = `
        <span class="prop-label">Rotation</span>
        <input class="prop-input" type="text" value="${rotDisplay}" placeholder="0, 0, 0">
    `;
    p.appendChild(rotRow);

    rotRow.querySelector('input').addEventListener('change', (e) => {
        const text = e.target.value.trim().replace(/°/g, '');
        const parts = text.split(',').map(v => parseFloat(v.trim()));
        if (parts.length === 3 && !parts.some(isNaN)) {
            selectedObjects.forEach(obj => {
                obj.rotation.set(
                    THREE.MathUtils.degToRad(parts[0]),
                    THREE.MathUtils.degToRad(parts[1]),
                    THREE.MathUtils.degToRad(parts[2])
                );
                syncPhysics(obj);           // IMPORTANT: update physics quaternion
            });
            updateSelectionBox();
            updateProperties();             // refresh the displayed values
        }
    });

    // ── SCALE (single combined field) ─────────────────────────────────────────
    const scl = selectedObjects[0].scale;
    let scaleDisplay = `${scl.x.toFixed(2)}, ${scl.y.toFixed(2)}, ${scl.z.toFixed(2)}`;
    if (selectedObjects.length > 1) scaleDisplay = "—";

    let scaleRow = document.createElement('div');
    scaleRow.className = "prop-row";
    scaleRow.innerHTML = `
        <span class="prop-label">Scale</span>
        <input class="prop-input" type="text" value="${scaleDisplay}" placeholder="1, 1, 1">
    `;
    p.appendChild(scaleRow);

    scaleRow.querySelector('input').addEventListener('change', (e) => {
        const text = e.target.value.trim();
        const parts = text.split(',').map(v => parseFloat(v.trim()));
        if (parts.length === 3 && !parts.some(isNaN) && parts.every(v => v > 0)) {
            selectedObjects.forEach(obj => {
                obj.scale.set(parts[0], parts[1], parts[2]);
                syncPhysics(obj);
            });
            updateSelectionBox();
            updateProperties();
        }
    });

    // ── SIZE (keeping separate for precision) ─────────────────────────────────
    createRow("SizeX", getMixedValue(o => (o.userData.sizeX || 2).toFixed(2)), (v) => {
        selectedObjects.forEach(o => {
            o.userData.sizeX = parseFloat(v) || 2;
            rebuildMeshGeometry(o);
            syncPhysics(o);
        });
        updateSelectionBox();
    });

    createRow("SizeY", getMixedValue(o => (o.userData.sizeY || 1).toFixed(2)), (v) => {
        selectedObjects.forEach(o => {
            o.userData.sizeY = parseFloat(v) || 1;
            rebuildMeshGeometry(o);
            syncPhysics(o);
        });
        updateSelectionBox();
    });

    createRow("SizeZ", getMixedValue(o => (o.userData.sizeZ || 4).toFixed(2)), (v) => {
        selectedObjects.forEach(o => {
            o.userData.sizeZ = parseFloat(v) || 4;
            rebuildMeshGeometry(o);
            syncPhysics(o);
        });
        updateSelectionBox();
    });

	// ── BRICK COLOR ───────────────────────────────────────────────────────────
if (selectedObjects.length > 0) {
    const firstColor = selectedObjects[0].userData.brickcolor || "#ffffff";
    let colorMixed = firstColor;
    let isMixed = false;

    for (let i = 1; i < selectedObjects.length; i++) {
        if (selectedObjects[i].userData.brickcolor !== firstColor) {
            isMixed = true;
            break;
        }
    }

    let colorRow = document.createElement('div');
    colorRow.className = "prop-row";
    colorRow.innerHTML = `
        <span class="prop-label">BrickColor</span>
        <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <div id="color-swatch" style="
                width:24px; height:24px; border:1px solid #555; border-radius:4px;
                background-color: ${isMixed ? '#888' : firstColor};
            "></div>
            <span id="color-value" style="color:#ccc; font-family:monospace;">
                ${isMixed ? "Mixed" : firstColor.toUpperCase()}
            </span>
        </div>
    `;

    // Make the whole row clickable to open picker
    colorRow.style.cursor = "pointer";
    colorRow.onclick = () => {
        openColorPicker();  // your existing function
    };

    p.appendChild(colorRow);
}

    // ── ANCHORED & CAN COLLIDE ────────────────────────────────────────────────
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

    // ── SURFACES ──────────────────────────────────────────────────────────────
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

                    const sizeX = o.userData.sizeX || 2;
                    const sizeY = o.userData.sizeY || 1;
                    const sizeZ = o.userData.sizeZ || 4;
                    const color = parseInt(o.userData.brickcolor) || 0xffffff;

                    o.material = createMaterials(sizeX, sizeY, sizeZ, color, o.userData.surfaces);

                    if (o.userData.partType !== 'Block') {
                        o.material = o.material[0] || new THREE.MeshPhongMaterial({ color });
                    }
                });
            }
        );
    });

    updateSelectionBox();
}
// updateProperties = debounce(updateProperties, 300);  

function createRow(l, v, callback) {
    const p = document.getElementById('prop-list');
    if (!p) return;
  
    let r = document.createElement('div');
    r.className = "prop-row";
    r.innerHTML = `<span class="prop-label">${l}</span><input class="prop-input" type="text" value="${v || ''}">`;
  
    p.appendChild(r);
  
    if (callback) {
        const input = r.querySelector('.prop-input');
        input.addEventListener('change', (e) => {
            const val = e.target.value.trim();
            callback(val);
            updateProperties(); 
        });
    }
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
      
        // Compute effective sizes (original * abs(scale)) for live preview during scaling
        const partType = m.userData.partType || 'Block';
        const baseX = m.userData.sizeX || 2;
        const baseY = m.userData.sizeY || 1;
        const baseZ = m.userData.sizeZ || 4;
        const effX = baseX * Math.abs(m.scale.x);
        const effY = baseY * Math.abs(m.scale.y);
        const effZ = baseZ * Math.abs(m.scale.z);
      
        let newShape;
        if (partType === 'Sphere') {
            const effRadius = Math.max(effX, effY, effZ) / 2; // Approx for non-uniform scale
            newShape = new CANNON.Sphere(effRadius);
        } else if (partType === 'Cylinder' || partType === 'Cone') {
            const effRadius = Math.max(effX, effZ) / 2;
            newShape = new CANNON.Cylinder(
                effRadius,
                partType === 'Cone' ? 0 : effRadius,
                effY,
                16
            );
        } else {
            newShape = new CANNON.Box(new CANNON.Vec3(effX / 2, effY / 2, effZ / 2));
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

window.loadNewFormat = loadNewFormat;
window.loadOldFormat = loadOldFormat;
window.parseNewFormatPart = parseNewFormatPart;
window.parseNewFormatModel = parseNewFormatModel;
window.parseObject = parseObject;
window.parseModel = parseModel;