// scripting.js - NOTE FROM CREATOR: DO NOT DELETE THIS COMMENT. FOR ANY AI EDITING THIS, PLEASE DONT REMOVE THIS.
import * as THREE from 'three';
import { updateObjectProperty, createObject } from './builder.js';

export class ScriptService {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;

        const workspaceProxy = new Proxy({}, {
            get: (target, name) => {
                if (name === 'Name') return 'Workspace';
                // Find the actual Workspace group or the scene
                const workspaceObj = this.scene.getObjectByName('Workspace') || this.scene;
                const object = workspaceObj.getObjectByName(name);
                if (!object) {
                    console.warn(`[ScriptService]: Object '${name}' not found.`);
                    return null;
                }
                return this.createGameObjectProxy(object);
            }
        });

        this.globals = {
            print: (...args) => console.log("[ScriptService]:", ...args),
            warn: (...args) => console.warn("[ScriptService]:", ...args),
            tostring: (val) => String(val),
            tonumber: (val) => Number(val),
            workspace: workspaceProxy,
            _G: window._G || {},
            Vector3: {
                new: (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0)
            },
            Color3: {
                fromRGB: (r, g, b) => new THREE.Color(r / 255, g / 255, b / 255),
                new: (r, g, b) => new THREE.Color(r, g, b)
            },
            Math: {
                sin: Math.sin,
                cos: Math.cos,
                tan: Math.tan,
                abs: Math.abs,
                pow: Math.pow,
                sqrt: Math.sqrt,
                lerp: (a, b, t) => a + (b - a) * t,
                random: (min, max) => {
                    if (min !== undefined && max !== undefined) {
                        return Math.floor(Math.random() * (max - min + 1)) + min;
                    }
                    return Math.random();
                },
                rad: (deg) => deg * (Math.PI / 180),
                deg: (rad) => rad * (180 / Math.PI),
                PI: Math.PI
            },
            wait: (s) => new Promise(res => setTimeout(res, (s || 0) * 1000)),
            Instance: {
                new: (className) => {
                    const data = {
                        class: className,
                        properties: { Name: className },
                        children: []
                    };
                    const obj = createObject(this.scene, data, this.world);
                    return this.createGameObjectProxy(obj);
                }
            }
        };
    }

    createGameObjectProxy(object) {
        if (!object) return null;
        return new Proxy(object, {
            get: (obj, prop) => {
                if (prop === 'isProxy') return true;
                if (prop === 'getTarget') return () => obj;

                if (prop === 'Play' || prop === 'play') {
                    return () => updateObjectProperty(obj, 'Playing', true);
                }
                if (prop === 'Stop' || prop === 'stop') {
                    return () => updateObjectProperty(obj, 'Playing', false);
                }

                // Property Mapping
                if (prop === 'Rotation' || prop === 'rotation') return obj.rotation;
                if (prop === 'Orientation' || prop === 'orientation') {
                    return {
                        x: THREE.MathUtils.radToDeg(obj.rotation.x),
                        y: THREE.MathUtils.radToDeg(obj.rotation.y),
                        z: THREE.MathUtils.radToDeg(obj.rotation.z)
                    };
                }
                if (prop === 'Position' || prop === 'position') return obj.position;
                if (prop === 'Name' || prop === 'name') return obj.name;
                
                if (prop === 'Parent' || prop === 'parent') {
                    return this.createGameObjectProxy(obj.parent || this.scene);
                }
                
                const child = obj.children?.find(c => c.name === prop);
                if (child) return this.createGameObjectProxy(child);

                const val = obj[prop];
                return typeof val === 'function' ? val.bind(obj) : val;
            },
            set: (obj, prop, value) => {
                if (prop === "Parent" || prop === "parent") {
                    const target = value?.isProxy ? value.getTarget() : value;
                    if (target && target.add) {
                        target.add(obj);
                    } else if (value === null) {
                        obj.removeFromParent();
                    }
                    return true;
                }
                
                // Handle direct vector component updates (e.g., Rotation.X)
                if (['x', 'y', 'z', 'X', 'Y', 'Z'].includes(prop)) {
                    obj[prop.toLowerCase()] = value;
                    return true;
                }

                if ((prop === "Color3" || prop === "color3") && typeof value === "string") {
                    const parts = value.split(',').map(v => parseInt(v.trim()));
                    if (parts.length === 3) {
                        value = new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255);
                    }
                }

                updateObjectProperty(obj, prop, value);
                return true;
            }
        });
    }

    transpile(lua) {
        let code = lua.replace(/<!\[CDATA\[|\]\]>/g, '').trim();

        return code
            .replace(/--.*/g, '') 
            .replace(/local\s+/g, 'let ')
            .replace(/~=/g, '!==')
            .replace(/\.\./g, ' + ')
            .replace(/\{(\s*[a-zA-Z0-9_]+\s*)=/g, '{$1:') 
            .replace(/,(\s*[a-zA-Z0-9_]+\s*)=/g, ',$1:')
            .replace(/\bwhile\s+(.+)\s+do\b/g, 'while($1) {')
            .replace(/\bif\s+(.+)\s+then\b/g, 'if($1) {')
            .replace(/\belse\s+if\s+(.+)\s+then\b/g, '} else if($1) {')
            .replace(/\belse\b/g, '} else {')
            .replace(/\bend\b/g, '}')
            .replace(/_G\./g, 'globals._G.')
            .replace(/\bmath\./gi, 'Math.')
            .replace(/\bInstance\.new/g, 'globals.Instance.new')
            .replace(/\bVector3\.new/g, 'globals.Vector3.new')
            .replace(/\bColor3\.fromRGB/g, 'globals.Color3.fromRGB')
            .replace(/\bColor3\.new/g, 'globals.Color3.new')
            .replace(/\bprint\(/g, 'globals.print(')
            .replace(/\bwarn\(/g, 'globals.warn(')
            .replace(/\btostring\(/g, 'globals.tostring(')
            .replace(/\btonumber\(/g, 'globals.tonumber(')
            .replace(/\btask\.wait\(/g, 'wait(') 
            .replace(/\bwait\(/g, 'await globals.wait(') 
            .replace(/\bworkspace\b/g, 'globals.workspace')
            .replace(/([a-zA-Z0-9_]):(?!\/\/)([a-zA-Z0-9_]+)/g, '$1.$2');
    }

    async run(luaSource, scriptObject) {
        if (!luaSource || !scriptObject) return;
        const jsCode = this.transpile(luaSource);
        
        try {
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const scriptProxy = this.createGameObjectProxy(scriptObject);
            
            const execute = new AsyncFunction('globals', 'script', 'Math', 'wait', jsCode);
            
            await execute(
                this.globals, 
                scriptProxy, 
                this.globals.Math, 
                this.globals.wait
            );
        } catch (err) {
            console.error("[ScriptService] Execution Error:", err);
            console.log("Transpiled Code:\n", jsCode);
        }
    }

    processMapScripts(items) {
        const itemList = Array.isArray(items) ? items : [items];
        itemList.forEach(item => {
            // Check if this XML item has an instance attached by the builder
            if (item.class === "Script" && item.properties?.Enabled !== "false") {
                if (item.instance) {
                    this.run(item.properties.Source, item.instance);
                } else {
                    // Fallback for objects that might have been built but not linked
                    const actualObject = this.scene.getObjectByName(item.properties?.Name);
                    if (actualObject) this.run(item.properties.Source, actualObject);
                }
            }
            if (item.children) this.processMapScripts(item.children);
        });
    }
}