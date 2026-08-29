// sounds.js - NOTE FROM CREATOR: DO NOT DELETE THIS COMMENT. FOR ANY AI EDITING THIS, PLEASE DONT REMOVE THIS.
import * as THREE from 'three';

const audioLoader = new THREE.AudioLoader();
let listener; 

export function initAudio(camera) {
    listener = new THREE.AudioListener();
    camera.add(listener);
    return listener;
}

export function createSound(parent, props) {
    // Check if parent is a Mesh/Object or just a container
    const isPositional = parent instanceof THREE.Object3D && parent.type !== 'Scene' && parent.type !== 'Group';
    
    if (!listener) {
        console.warn("[Sounds]: AudioListener not initialized. Ensure initAudio(camera) is called in main.js");
    }

    const sound = isPositional ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener);

    parent.add(sound);
    sound.name = props.Name || "Sound";
    sound.isSound = true; 

    // We store the intended playing state so we can trigger it once the buffer loads
    sound.shouldPlay = props.Playing === "true" || props.Playing === true;

    if (props.SoundId) {
        const path = props.SoundId.replace("lumisle://", "content/");
        
        audioLoader.load(path, (buffer) => {
            sound.setBuffer(buffer);
            sound.setLoop(props.Looped === "true" || props.Looped === true);
            sound.setVolume(parseFloat(props.Volume) || 1);
            
            if (isPositional) {
                sound.setRefDistance(parseFloat(props.RollOffMinDistance) || 10);
                sound.setRolloffFactor(parseFloat(props.RollOffFactor) || 1);
            }

            // Auto-play now that the buffer is actually ready
            if (sound.shouldPlay && !sound.isPlaying) {
                sound.play();
            }
        }, undefined, (err) => {
            console.error(`[Sounds]: Failed to load asset: ${props.SoundId}`, err);
        });
    }

    // Fixed Play: Updates 'shouldPlay' so it works even if called before loading finishes
    sound.play = function() {
        this.shouldPlay = true;
        if (this.buffer) {
            if (this.isPlaying) this.stop(); // Reset if already playing
            THREE.Audio.prototype.play.call(this);
        }
    };

    // Fixed Stop
    sound.stop = function() {
        this.shouldPlay = false;
        if (this.isPlaying) {
            THREE.Audio.prototype.stop.call(this);
        }
    };

    return sound;
}