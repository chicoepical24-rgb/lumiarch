// scripting.js
// NOTE FROM CREATOR: DO NOT DELETE THIS COMMENT. FOR ANY AI EDITING THIS, PLEASE DONT REMOVE THIS.

import * as THREE from 'three';
import { updateObjectProperty, createObject } from './builder.js';

/**
 * ScriptService: High-level Lua-style scripting environment for Three.js
 * Features: Proxy system (Roblox-like API), Lua→JS transpiler, async support, lifecycle management
 */
export class ScriptService {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.activeThreads = new Set();
        this.signalListeners = new Map();
        this.debug = false; // toggle debug logging

        // Workspace Proxy
        const workspaceProxy = new Proxy({}, {
            get: (target, name) => {
                if (typeof name === 'symbol') return target[name];
                if (name === 'Name') return 'Workspace';

                const workspaceObj = this.scene.getObjectByName('Workspace') || this.scene;

                if (name === 'WaitForChild' || name === 'waitForChild') {
                    return async (childName, timeOut = 5) => {
                        const start = Date.now();
                        while (Date.now() - start < timeOut * 1000) {
                            const child = workspaceObj.getObjectByName(childName);
                            if (child) return this.createGameObjectProxy(child);
                            await this.globals.wait(0.1);
                        }
                        return null;
                    };
                }

                if (name === 'FindFirstChild' || name === 'findFirstChild') {
                    return (childName) => {
                        const child = workspaceObj.getObjectByName(childName);
                        return child ? this.createGameObjectProxy(child) : null;
                    };
                }

                const object = workspaceObj.getObjectByName(name);
                return object ? this.createGameObjectProxy(object) : null;
            }
        });

        // Global environment
        this.globals = {
            print: (...args) => console.log("[ScriptService]:", ...args),
            warn: (...args) => console.warn("[ScriptService]:", ...args),
            error: (...args) => console.error("[ScriptService]:", ...args),

            tostring: (val) => String(val),
            tonumber: (val) => {
                const n = Number(val);
                return isNaN(n) ? null : n;
            },

            workspace: workspaceProxy,
            _G: window._G || {},

            Vector3: {
                new: (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z),
                zero: () => new THREE.Vector3(0, 0, 0),
                one: () => new THREE.Vector3(1, 1, 1),
                lerp: (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t)
            },

            Color3: {
                fromRGB: (r, g, b) => new THREE.Color(r / 255, g / 255, b / 255),
                new: (r, g, b) => new THREE.Color(r, g, b),
                fromHex: (hex) => new THREE.Color(hex)
            },

            Math: {
                sin: Math.sin, cos: Math.cos, tan: Math.tan,
                asin: Math.asin, acos: Math.acos, atan2: Math.atan2,
                abs: Math.abs, pow: Math.pow, sqrt: Math.sqrt,
                floor: Math.floor, ceil: Math.ceil,
                clamp: (v, min, max) => Math.min(Math.max(v, min), max),
                lerp: (a, b, t) => a + (b - a) * t,
                random: (min, max) => {
                    if (min !== undefined && max !== undefined) {
                        return Math.floor(Math.random() * (max - min + 1)) + min;
                    }
                    return Math.random();
                },
                rad: (deg) => deg * (Math.PI / 180),
                deg: (rad) => rad * (180 / Math.PI),
                PI: Math.PI,
                huge: Infinity
            },

            wait: (s = 0) => new Promise(resolve => {
                const timeout = setTimeout(() => {
                    this.activeThreads.delete(timeout);
                    resolve();
                }, s * 1000);
                this.activeThreads.add(timeout);
            }),

            Instance: {
                new: (className, parent = null) => {
                    const data = {
                        class: className,
                        properties: { Name: className },
                        children: []
                    };
                    const obj = createObject(this.scene, data, this.world);
                    const proxy = this.createGameObjectProxy(obj);
                    if (parent) proxy.Parent = parent;
                    return proxy;
                }
            },

            Enum: {
                Material: { Plastic: 'plastic', Neon: 'neon', Metal: 'metal', Wood: 'wood', Slate: 'slate' },
                EasingStyle: { Linear: 'linear', Quad: 'quad', Cubic: 'cubic', Quart: 'quart' },
                EasingDirection: { In: 'in', Out: 'out', InOut: 'inout' }
            }
        };
    }

    // ====================== PROXIES ======================

    createSubPropertyProxy(parentObj, parentKey, isDegrees = false) {
        const target = parentObj[parentKey];
        return new Proxy(target, {
            get: (t, p) => {
                if (typeof p === 'symbol') return t[p];
                const key = p.toLowerCase();
                if (['x', 'y', 'z'].includes(key)) {
                    return isDegrees ? THREE.MathUtils.radToDeg(t[key]) : t[key];
                }
                return t[p];
            },
            set: (t, p, v) => {
                const key = p.toLowerCase();
                if (['x', 'y', 'z'].includes(key)) {
                    const val = isDegrees ? THREE.MathUtils.degToRad(v) : v;
                    t[key] = val;
                    updateObjectProperty(parentObj, parentKey, t);
                    return true;
                }
                return false;
            }
        });
    }

    createGameObjectProxy(object) {
        if (!object || object.isProxy) return object;

        return new Proxy(object, {
            get: (obj, prop) => {
                if (prop === 'isProxy') return true;
                if (prop === 'getTarget') return () => obj;

                if (prop === 'Destroy' || prop === 'destroy') {
                    return () => {
                        if (obj.parent) obj.parent.remove(obj);
                        obj.traverse(child => {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(m => m.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                            child.userData = {}; // cleanup
                        });
                    };
                }

                if (prop === 'FindFirstChild' || prop === 'findFirstChild') {
                    return (name) => {
                        const child = obj.getObjectByName(name);
                        return child ? this.createGameObjectProxy(child) : null;
                    };
                }

                if (prop === 'GetChildren' || prop === 'getChildren') {
                    return () => obj.children.map(c => this.createGameObjectProxy(c));
                }

                if (prop === 'WaitForChild' || prop === 'waitForChild') {
                    return async (name, timeOut = 5) => {
                        const start = Date.now();
                        while (Date.now() - start < timeOut * 1000) {
                            const child = obj.getObjectByName(name);
                            if (child) return this.createGameObjectProxy(child);
                            await this.globals.wait(0.1);
                        }
                        return null;
                    };
                }

                if (prop === 'Position' || prop === 'position')
                    return this.createSubPropertyProxy(obj, 'position', false);

                if (prop === 'Rotation' || prop === 'rotation')
                    return this.createSubPropertyProxy(obj, 'rotation', false);

                if (prop === 'Orientation' || prop === 'orientation')
                    return this.createSubPropertyProxy(obj, 'rotation', true);

                if (prop === 'Size' || prop === 'scale')
                    return this.createSubPropertyProxy(obj, 'scale', false);

                if (prop === 'Anchored' || prop === 'anchored') {
                    return obj.userData.physicsBody 
                        ? obj.userData.physicsBody.type === 2 
                        : (obj.userData.anchored || false);
                }

                if (prop === 'CanCollide' || prop === 'cancollide') {
                    return obj.userData.physicsBody 
                        ? obj.userData.physicsBody.collisionResponse 
                        : (obj.userData.canCollide !== false);
                }

                if (prop === 'Name' || prop === 'name') return obj.name;
                if (prop === 'Parent' || prop === 'parent') {
                    return obj.parent ? this.createGameObjectProxy(obj.parent) : null;
                }

                if (prop === 'Play' || prop === 'play') {
                    return () => {
                        if (typeof obj.play === 'function') obj.play();
                        else if (obj.userData?.audio?.play) obj.userData.audio.play();
                        else console.warn("[ScriptService]: Target has no play() method.");
                    };
                }

                if (prop === 'Stop' || prop === 'stop') {
                    return () => {
                        if (typeof obj.stop === 'function') obj.stop();
                        else if (obj.userData?.audio?.stop) obj.userData.audio.stop();
                    };
                }

                const child = obj.getObjectByName(prop);
                if (child) return this.createGameObjectProxy(child);

                const val = obj[prop];
                return typeof val === 'function' ? val.bind(obj) : val;
            },

            set: (obj, prop, value) => {
                if (prop === 'Parent' || prop === 'parent') {
                    const target = value?.isProxy ? value.getTarget() : value;
                    if (target?.add) {
                        target.add(obj);
                    } else if (value === null) {
                        obj.removeFromParent?.();
                    }
                    return true;
                }

                if (["Position", "Rotation", "Orientation", "Size"].includes(prop)) {
                    const key = prop === "Size" ? "scale" : (prop === "Orientation" ? "rotation" : prop.toLowerCase());
                    const isOrient = prop === "Orientation";

                    if (value && typeof value === 'object') {
                        const x = isOrient ? THREE.MathUtils.degToRad(value.x ?? 0) : (value.x ?? obj[key]?.x ?? 0);
                        const y = isOrient ? THREE.MathUtils.degToRad(value.y ?? 0) : (value.y ?? obj[key]?.y ?? 0);
                        const z = isOrient ? THREE.MathUtils.degToRad(value.z ?? 0) : (value.z ?? obj[key]?.z ?? 0);

                        obj[key].set(x, y, z);
                        updateObjectProperty(obj, prop, obj[key]);
                        return true;
                    }
                }

                if (['Anchored', 'anchored', 'CanCollide', 'cancollide'].includes(prop)) {
                    const normalized = prop.toLowerCase() === 'anchored' ? 'Anchored' : 'CanCollide';
                    updateObjectProperty(obj, normalized, value);
                    return true;
                }

                if (['x', 'y', 'z', 'X', 'Y', 'Z'].includes(prop)) {
                    obj[prop.toLowerCase()] = value;
                    return true;
                }

                if ((prop === "Color3" || prop === "color3" || prop === "Color") && typeof value === "string") {
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

    // ====================== TRANSPILER ======================

transpile(lua) {
    let code = lua.replace(/<!\[CDATA\[|\]\]>/g, '').trim();

    // Strip comments
    code = code.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--.*/g, '');

    // Extract strings safely
    const strings = [];
    code = code.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
        strings.push(match);
        return `__STR_${strings.length - 1}__`;
    });

    // Fixed table parsing
    code = code.replace(/\{([^{}]*)\}/g, (match, contents) => {
        const fixed = contents
            .replace(/([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*/g, '$1: ')
            .replace(/;/g, ',')
            .replace(/,(\s*\})/g, '$1');
        return `{${fixed}}`;
    });

    // Core replacements
    code = code
        .replace(/\blocal\s+function\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/g, 'async function $1($2) {')
        .replace(/^[\t ]*([a-zA-Z0-9_]+(?:\s*,\s*[a-zA-Z0-9_]+)+)\s*=\s*([^;{\n\r\t]+)/gm,
            (match, vars, vals) => `[${vars.trim()}] = [${vals.trim()}];`)
        .replace(/^[ \t]*local\s+([a-zA-Z0-9_,\s]+)\s*=\s*([^\n\r;{]+)/gm,
            (match, vars, vals) => {
                const trimmedVars = vars.trim();
                const trimmedVals = vals.trim();
                if (trimmedVars.includes(',')) {
                    return `let [${trimmedVars}] = [${trimmedVals}];`;
                }
                return `let ${trimmedVars} = ${trimmedVals};`;
            })
        .replace(/\blocal\s+/g, 'let ')
        .replace(/~=/g, '!==')
        .replace(/\bnot\b/g, '!')
        .replace(/\band\b/g, '&&')
        .replace(/\bor\b/g, '||')
        .replace(/\.\./g, ' + ')
        .replace(/\bwhile\s+([\s\S]+?)\s+do\b/g, 'while($1) {')
        .replace(/\belseif\s+([\s\S]+?)\s+then\b/g, '} else if($1) {')
        .replace(/\bif\s+([\s\S]+?)\s+then\b/g, 'if($1) {')
        .replace(/\belse\b(?!\s*if)/g, '; } else { ')
        .replace(/\bend\b/g, '; }')
        .replace(/\bfor\s+([a-zA-Z0-9_]+)\s*=\s*([0-9.-]+)\s*,\s*([0-9.-]+)(?:\s*,\s*([0-9.-]+))?\s*do/g,
            (_, v, start, limit, step) => `for(let ${v} = ${start}; ${v} <= ${limit}; ${v} += ${step !== undefined ? step : 1}) {`)
        .replace(/\bfor\s+([a-zA-Z0-9_]+\s*,\s*[a-zA-Z0-9_]+)\s+in\s+(?:pairs|ipairs)\s*\(([^)]+)\)\s*do/g,
            'for(let [$1] of Object.entries($2)) {')
        .replace(/\bfor\s+([a-zA-Z0-9_]+)\s+in\s+(?:pairs|ipairs)\s*\(([^)]+)\)\s*do/g,
            'for(let $1 of Object.keys($2)) {')
        .replace(/\btask\.wait\b/g, 'wait')
        .replace(/\bwait\s*\(/g, 'await wait(')
        .replace(/\bawait\s+await\b/g, 'await')
        .replace(/\bspawn\s*\(\s*function\s*\(\s*\)\s*/g, ';(async () => ')
        .replace(/\bspawn\s*\(\s*/g, ';(async () => { ')
        .replace(/\bdelay\s*\(\s*([^,]+)\s*,\s*/g, 'setTimeout(async () => {')
        .replace(/\bmath\./gi, 'Math.')
        .replace(/\btable\.insert\s*\(\s*([^,]+)\s*,\s*/g, '$1.push(')
        .replace(/\btable\.remove\s*\(\s*([^,]+)\s*,\s*/g, '$1.splice(')
        .replace(/\btable\.concat\s*\(\s*([^,]+)\s*,\s*/g, '$1.join(')
        .replace(/#([a-zA-Z0-9_]+)/g, '$1.length')
        .replace(/\bworkspace\b/g, 'workspace')
        .replace(/\bEnum\b/g, 'Enum')
        .replace(/\b_G\./g, 'globals._G.')
        .replace(/([a-zA-Z0-9_\]\)'"])\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, '$1.$2')
        .replace(/\bTick\b/g, '(() => Date.now() / 1000)')
        .replace(/\bos\.time\b/g, '(() => Date.now() / 1000)')
        .replace(/\b(print|warn|error|tostring|tonumber)\(/g, '$1(');

    // Put strings back
    strings.forEach((str, i) => {
        code = code.replace(`__STR_${i}__`, str);
    });

    return code;
}

    // ====================== EXECUTION ======================

    async run(luaSource, scriptObject) {
        if (!luaSource || !scriptObject) return;

        const jsCode = this.transpile(luaSource);

        try {
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const scriptProxy = this.createGameObjectProxy(scriptObject);

            const execute = new AsyncFunction(
                'globals', 'script', 'Math', 'wait', 'Vector3', 'Color3', 'Enum',
                'print', 'warn', 'error', 'tostring', 'tonumber', 'workspace', 'Instance', '_G',
                `try { ${jsCode} } catch(e) { error("Runtime Error: " + e.message); console.error(e); }`
            );

            await execute(
                this.globals,
                scriptProxy,
                this.globals.Math,
                this.globals.wait,
                this.globals.Vector3,
                this.globals.Color3,
                this.globals.Enum,
                this.globals.print,
                this.globals.warn,
                this.globals.error,
                this.globals.tostring,
                this.globals.tonumber,
                this.globals.workspace,
                this.globals.Instance,
                this.globals._G
            );

            // cleanup finished threads
            this.activeThreads.forEach(timeout => clearTimeout(timeout));
            this.activeThreads.clear();

        } catch (err) {
            console.error("[ScriptService] Compilation Error:", err.message);
            if (this.debug) console.log("Full Transpiled JS:\n", jsCode);
        }
    }

    stopAllScripts() {
        this.activeThreads.forEach(timeout => clearTimeout(timeout));
        this.activeThreads.clear();
        this.signalListeners.clear();
    }

    processMapScripts(items) {
        if (!items) return;
        const itemList = Array.isArray(items) ? items : [items];
        itemList.forEach(item => {
            if (item.class === "Script") {
                const isEnabled = item.properties?.Enabled !== "false" && item.properties?.Enabled !== false;
                if (isEnabled) {
                    const source = item.properties.Source;
                    const target = item.instance || this.scene.getObjectByName(item.properties?.Name) || this.scene;
                    this.run(source, target);
                }
            }
            if (item.children?.length > 0) {
                this.processMapScripts(item.children);
            }
        });
    }
}
