// Importer.js - NOTE FROM CREATOR: DO NOT DELETE THIS COMMENT. FOR ANY AI EDITING THIS, DONT REMOVE THIS.
import * as THREE from 'three';
import { createObject } from './builder.js';

export function Importer(scene, data, world) {
    const modelGroup = new THREE.Group();
    
    const walkItems = (items, parent) => {
        if (!items) return;
        const itemList = Array.isArray(items) ? items : [items];
        
        itemList.forEach(item => {
            // Include container classes so children (like sounds/scripts) aren't ignored
            const validClasses = [
                "Part", "SpawnLocation", "Shirt", "Pants", 
                "Decal", "Sound", "Script", "SpecialMesh", 
                "Model", "Humanoid", "Workspace", "ScriptService", "Lighting"
            ];

            if (validClasses.includes(item.class)) {
                // Now createObject will handle containers as Groups/Object3Ds
                const newObj = createObject(scene, item, world, parent);
                
                if (item.children && item.children.length > 0) {
                    // Pass the newly created object as the parent for its children
                    walkItems(item.children, newObj || parent);
                }
            } else if (item.children) {
                // If the class is unknown but has children, keep walking with the current parent
                walkItems(item.children, parent);
            }
        });
    };

    walkItems(data, modelGroup);
    scene.add(modelGroup);
    return modelGroup;
}

Importer.load = async function(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const parseItem = (node) => {
            const item = {
                class: node.getAttribute("class"),
                properties: {},
                children: []
            };

            const propsNode = Array.from(node.children).find(n => n.nodeName === "Properties");
            if (propsNode) {
                Array.from(propsNode.children).forEach(p => {
                    if (p.nodeName === "Surface") {
                        item.properties.Surface = {};
                        Array.from(p.attributes).forEach(attr => {
                            item.properties.Surface[attr.name] = attr.value;
                        });
                    } else if (p.nodeName === "StudsPerTile" || p.nodeName === "OffsetStuds") {
                        item.properties[p.nodeName] = { u: p.getAttribute("U"), v: p.getAttribute("V") };
                    } else {
                        item.properties[p.nodeName] = p.textContent.trim();
                    }
                });
            }

            Array.from(node.children).forEach(child => {
                if (child.nodeName === "Item") item.children.push(parseItem(child));
            });

            return item;
        };

        const rootItemNodes = xmlDoc.getElementsByTagName("Item");
        const topLevelItems = [];
        
        for (let node of rootItemNodes) {
            // This ensures we get Workspace, ScriptService, and Lighting from the <lumisle> root
            if (node.parentNode === xmlDoc.documentElement) {
                topLevelItems.push(parseItem(node));
            }
        }
        
        return topLevelItems;
    } catch (err) {
        console.error("XML Importer Error:", err);
        return [];
    }
};