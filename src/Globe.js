import * as THREE from 'three';
import { EarthVert, EarthFrag, AtmoVert, AtmoFrag, AuroraVert, AuroraFrag } from './shaders.js';

const R = 1.0;

export async function createGlobe(scene) {
    const texLoader = new THREE.TextureLoader();

    const base = import.meta.env.BASE_URL;
    const [tDay, tNight, tCloud, tHeight, tMilkyWay] = await Promise.all([
        texLoader.loadAsync(`${base}textures/earth_day_8k.jpg`).catch(() => texLoader.loadAsync(`${base}textures/earth_day_4k.jpg`)),
        texLoader.loadAsync(`${base}textures/earth_night_8k.jpg`).catch(() => texLoader.loadAsync(`${base}textures/earth_night_4k.jpg`)),
        texLoader.loadAsync(`${base}textures/earth_clouds_8k.jpg`).catch(() => texLoader.loadAsync(`${base}textures/earth_clouds.jpg`)),
        texLoader.loadAsync(`${base}textures/earth_heightmap.png`),
        texLoader.loadAsync(`${base}textures/milkyway_8k.jpg`).catch(() => texLoader.loadAsync(`${base}textures/milkyway.png`)).catch(() => null)
    ]);

    // Earth textures — ClampToEdge prevents seam
    [tDay, tNight, tHeight].forEach(tex => {
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 16;
    });

    // Cloud texture — RepeatWrapping on S axis so the cloud scroll doesn't seam
    tCloud.wrapS = THREE.RepeatWrapping;
    tCloud.wrapT = THREE.ClampToEdgeWrapping;
    tCloud.minFilter = THREE.LinearMipmapLinearFilter;
    tCloud.magFilter = THREE.LinearFilter;
    tCloud.anisotropy = 8;

    tDay.colorSpace = THREE.SRGBColorSpace;
    tNight.colorSpace = THREE.SRGBColorSpace;
    if (tMilkyWay) tMilkyWay.colorSpace = THREE.SRGBColorSpace;

    // REAL-TIME SOLAR SYNC — subsolar point from current UTC (declination + hour angle),
    // so the day/night terminator on the globe matches reality right now
    function computeSunDir(date) {
        const start = Date.UTC(date.getUTCFullYear(), 0, 0);
        const doy = (date.getTime() - start) / 86400000;
        const decl = -23.44 * Math.cos((2 * Math.PI / 365.24) * (doy + 10));
        const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
        const subLon = (12 - utcH) * 15;
        const phi = (90 - decl) * Math.PI / 180;
        const theta = (subLon + 180) * Math.PI / 180;
        return new THREE.Vector3(
            -Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta)
        ).normalize();
    }
    const sunDir = computeSunDir(new Date());

    let milkyWay = null;
    if (tMilkyWay) {
        const mwGeo = new THREE.SphereGeometry(90, 64, 64);
        const mwMat = new THREE.MeshBasicMaterial({
            map: tMilkyWay,
            side: THREE.BackSide,
            depthWrite: false,
            toneMapped: false,
            fog: false
        });
        const mwMesh = new THREE.Mesh(mwGeo, mwMat);
        mwMesh.rotation.z = Math.PI / 4;
        mwMesh.rotation.x = Math.PI / 6;
        mwMesh.renderOrder = -1;
        scene.add(mwMesh);
        milkyWay = mwMesh;
    }

    // Sun — bright emissive sphere
    const sunGeo = new THREE.SphereGeometry(0.5, 32, 32);
    // Try to load sun texture, fall back to emissive white
    let sunMat;
    try {
        const sunTex = await texLoader.loadAsync(`${base}textures/sun_8k.jpg`);
        sunTex.colorSpace = THREE.SRGBColorSpace;
        sunMat = new THREE.MeshBasicMaterial({ map: sunTex });
    } catch {
        sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
    }
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.copy(sunDir).multiplyScalar(20);
    scene.add(sunMesh);

    // Corona glow — additive radial sprite parented to the sun
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0.0, 'rgba(255,245,210,1)');
    grad.addColorStop(0.25, 'rgba(255,210,120,0.55)');
    grad.addColorStop(0.55, 'rgba(255,150,60,0.18)');
    grad.addColorStop(1.0, 'rgba(255,120,40,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 256, 256);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(glowCanvas),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
    }));
    glow.scale.set(4.5, 4.5, 1);
    sunMesh.add(glow);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.copy(sunDir);
    scene.add(dirLight);

    const uniforms = {
        uDay: { value: tDay },
        uNight: { value: tNight },
        uCloud: { value: tCloud },
        uHeightMap: { value: tHeight },
        // Own vector, NOT a reference to sunDir — main.js overwrites this uniform
        // with the world-space sun direction every frame; sunDir must stay scene-local
        uSunDir: { value: sunDir.clone() },
        uCloudOff: { value: 0.0 },
        uDisplaceScale: { value: 0.07 },
        uDisplaceBias: { value: 0.3 }
    };

    const earthGeo = new THREE.SphereGeometry(R, 512, 256);
    const earthMat = new THREE.ShaderMaterial({
        vertexShader: EarthVert,
        fragmentShader: EarthFrag,
        uniforms: uniforms,
        wireframe: false
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);

    const atmoGeo = new THREE.SphereGeometry(R * 1.018, 128, 64);
    const atmoMat = new THREE.ShaderMaterial({
        vertexShader: AtmoVert,
        fragmentShader: AtmoFrag,
        uniforms: { uSunDir: uniforms.uSunDir },
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);

    const auroraGeo = new THREE.SphereGeometry(R * 1.025, 200, 100);
    const auroraMat = new THREE.ShaderMaterial({
        vertexShader: AuroraVert,
        fragmentShader: AuroraFrag,
        uniforms: { uTime: { value: 0.0 }, uSunDir: uniforms.uSunDir },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const auroraMesh = new THREE.Mesh(auroraGeo, auroraMat);

    scene.add(earthMesh);
    scene.add(atmoMesh);
    scene.add(auroraMesh);

    function setSunFromDate(date) {
        const d = computeSunDir(date);
        sunDir.copy(d);
        sunMesh.position.copy(d).multiplyScalar(20);
        dirLight.position.copy(d);
    }

    return { earth: earthMesh, atmosphere: atmoMesh, aurora: auroraMesh, uniforms, sunDir, sunMesh, setSunFromDate, milkyWay };
}
