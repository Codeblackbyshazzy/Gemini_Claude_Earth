import * as THREE from 'three';

// Solar system — sun and planets in the ecliptic plane.
// Earth sits at the origin at its correct orbital distance from the sun.
// Distances are artistic (not to scale) but order and proportions are correct.
//
// Everything is built in a group's local XZ plane with the sun on local +X;
// alignTo() rotates the group so that axis tracks the real (tilted) sun
// direction, keeping the orbit rings passing through both Earth and the sun.

const PLANETS = [
    { name: 'Mercury', radius: 0.06, orbit: 8, speed: 0.9, color: 0xa0a0a0 },
    { name: 'Venus', radius: 0.10, orbit: 14, speed: 0.55, color: 0xe8c060 },
    // Earth orbit = sunDistance (~20 units) — earth is at origin
    { name: 'Mars', radius: 0.07, orbit: 30, speed: 0.3, color: 0xc04020 },
    { name: 'Jupiter', radius: 0.45, orbit: 50, speed: 0.12, color: 0xc8a050 },
    { name: 'Saturn', radius: 0.35, orbit: 68, speed: 0.07, color: 0xd4b870, hasRings: true },
    { name: 'Uranus', radius: 0.20, orbit: 85, speed: 0.04, color: 0x70c8e0 },
    { name: 'Neptune', radius: 0.19, orbit: 100, speed: 0.025, color: 0x3060d0 },
];

const _X_AXIS = new THREE.Vector3(1, 0, 0);
const _dir = new THREE.Vector3();

export class SolarSystem {
    constructor(scene, sunPosition) {
        this.scene = scene;
        this.sunDist = sunPosition.length();
        this.planets = [];

        this.group = new THREE.Group();
        scene.add(this.group);
        this.alignTo(sunPosition);

        this.createOrbitRings();
        this.createPlanets();
    }

    // Rotate the whole ecliptic so local +X points at the (scene-local) sun
    alignTo(sunDir) {
        this.group.quaternion.setFromUnitVectors(_X_AXIS, _dir.copy(sunDir).normalize());
    }

    createOrbitRings() {
        // All orbits are concentric circles centered on the sun, in the local XZ plane
        const allOrbits = [
            ...PLANETS.map(p => ({ r: p.orbit, color: 0x334455, opacity: 0.12 })),
            // Earth's orbit — highlighted in blue
            { r: this.sunDist, color: 0x4facfe, opacity: 0.2 }
        ];

        allOrbits.forEach(o => {
            const points = [];
            for (let i = 0; i <= 128; i++) {
                const a = (i / 128) * Math.PI * 2;
                points.push(new THREE.Vector3(
                    this.sunDist + Math.cos(a) * o.r,
                    0,
                    Math.sin(a) * o.r
                ));
            }
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({
                color: o.color, transparent: true, opacity: o.opacity
            });
            this.group.add(new THREE.Line(geo, mat));
        });
    }

    createPlanets() {
        PLANETS.forEach(p => {
            const geo = new THREE.SphereGeometry(p.radius, 32, 32);
            const mat = new THREE.MeshStandardMaterial({
                color: p.color,
                metalness: 0.1,
                roughness: 0.7,
                emissive: new THREE.Color(p.color).multiplyScalar(0.15)
            });
            const mesh = new THREE.Mesh(geo, mat);
            const startAngle = Math.random() * Math.PI * 2;

            if (p.hasRings) {
                const ringGeo = new THREE.RingGeometry(p.radius * 1.4, p.radius * 2.2, 64);
                const ringMat = new THREE.MeshBasicMaterial({
                    color: 0xd4b870, side: THREE.DoubleSide,
                    transparent: true, opacity: 0.5
                });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = Math.PI / 2.5;
                mesh.add(ring);
            }

            this.group.add(mesh);
            this.planets.push({
                mesh, orbit: p.orbit, speed: p.speed,
                startAngle, name: p.name
            });
        });
    }

    update(elapsed) {
        this.planets.forEach(p => {
            const angle = p.startAngle + elapsed * p.speed;
            // Orbit in the local XZ plane around the sun
            p.mesh.position.set(
                this.sunDist + Math.cos(angle) * p.orbit,
                0,
                Math.sin(angle) * p.orbit
            );
            p.mesh.rotation.y += 0.01;
        });
    }
}
