// Importer.js
import * as THREE from 'three';
import { createObject, parseVector, parseColor } from './builder.js';

export function Importer(scene, data, world) {
    const modelGroup = new THREE.Group();
    
    const walkItems = (items) => {
        if (!items) return;
        const itemList = Array.isArray(items) ? items : [items];
        
        itemList.forEach(item => {
if (item.class === "Part" || item.class === "SpawnLocation") {
    createObject(scene, item, world, modelGroup);
} else if (item.class === "Shirt" || item.class === "Pants" || item.class === "Decal") {
    createObject(scene, item, world, modelGroup);
} else if (item.class === "Model" || item.children) {
    walkItems(item.children);
}
        });
    };

    walkItems(data);
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
                        item.properties[p.nodeName] = p.textContent;
                    }
                });
            }

            Array.from(node.children).forEach(child => {
                if (child.nodeName === "Item") item.children.push(parseItem(child));
            });

            return item;
        };

        const rootItems = Array.from(xmlDoc.querySelectorAll(":scope > Item"));
        return rootItems.length > 0 ? rootItems.map(parseItem) : [];
    } catch (err) {
        console.error("XML Importer Error:", err);
        return [];
    }
};