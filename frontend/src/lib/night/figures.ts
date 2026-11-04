// Simple sculpted silhouettes — read mainly through moon rim light and lantern glow.
import * as THREE from "three";

const cloth = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, envMapIntensity: 0.4 });

function lathe(profile: [number, number][], mat: THREE.Material, segments = 18) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), mat);
  m.castShadow = true;
  return m;
}

function head(mat: THREE.Material, y: number) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat);
  m.position.y = y;
  m.scale.set(0.95, 1.1, 1);
  m.castShadow = true;
  return m;
}

/** Zahra — long haik robe with head covering. */
export function makeZahra() {
  const g = new THREE.Group();
  const robe = cloth(0x2a2c30);
  g.add(lathe([[0.0, 0], [0.32, 0], [0.3, 0.3], [0.24, 0.9], [0.2, 1.25], [0.17, 1.4], [0.13, 1.5], [0.0, 1.52]], robe));
  const veil = lathe([[0.0, 1.38], [0.18, 1.38], [0.16, 1.5], [0.13, 1.64], [0.07, 1.7], [0.0, 1.71]], cloth(0x3a3c42));
  g.add(veil);
  const face = head(cloth(0x6b5446), 1.56);
  face.scale.set(0.7, 0.85, 0.7);
  face.position.z = 0.04;
  g.add(face);
  return g;
}

/** Ammar — hooded burnous, a mountain silhouette. */
export function makeAmmar() {
  const g = new THREE.Group();
  const wool = cloth(0x3b342b);
  g.add(lathe([[0.0, 0], [0.42, 0], [0.38, 0.4], [0.3, 1.0], [0.27, 1.35], [0.2, 1.5], [0.0, 1.52]], wool));
  g.add(lathe([[0.0, 1.45], [0.17, 1.45], [0.16, 1.62], [0.1, 1.78], [0.02, 1.86], [0.0, 1.86]], wool));
  const face = head(cloth(0x5e4637), 1.6);
  face.scale.set(0.65, 0.8, 0.6);
  face.position.z = 0.07;
  g.add(face);
  return g;
}

/** French gendarme — kepi, greatcoat, slung rifle. Optional cigarette ember. */
export function makeGendarme(withCigarette = false) {
  const g = new THREE.Group();
  const coat = cloth(0x1f2a24);
  const dark = cloth(0x101418);
  // legs
  for (const x of [-0.1, 0.1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.7, 4, 8), dark);
    leg.position.set(x, 0.42, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  // greatcoat
  g.add(lathe([[0.0, 0.45], [0.27, 0.45], [0.25, 0.8], [0.22, 1.2], [0.24, 1.42], [0.14, 1.52], [0.0, 1.53]], coat));
  // arms
  for (const x of [-0.26, 0.26]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), coat);
    arm.position.set(x, 1.12, 0);
    arm.rotation.z = x > 0 ? 0.12 : -0.12;
    arm.castShadow = true;
    g.add(arm);
  }
  g.add(head(cloth(0x6e5a4c), 1.65));
  // kepi
  const kepi = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.13, 16), dark);
  kepi.position.y = 1.79;
  kepi.rotation.x = -0.08;
  kepi.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.09), dark);
  visor.position.set(0, 1.735, 0.12);
  g.add(kepi, visor);
  // slung rifle
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.5, metalness: 0.6 }));
  rifle.position.set(-0.16, 1.15, -0.17);
  rifle.rotation.z = 0.35;
  rifle.castShadow = true;
  g.add(rifle);
  let ember: THREE.MeshStandardMaterial | null = null;
  if (withCigarette) {
    ember = new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff4a10, emissiveIntensity: 6 });
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), ember);
    e.position.set(0.03, 1.6, 0.13);
    g.add(e);
  }
  return { group: g, ember };
}
