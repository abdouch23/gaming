import * as THREE from "three";
import { makeGendarme } from "@/lib/night/figures";

/** mujahid silhouette: field jacket, chèche (head-wrap) instead of the kepi, old rifle */
export function makeMujahid(jacket: number, scarf: number) {
  const fig = makeGendarme(false);
  const g = fig.group;
  g.children[6].visible = false; // kepi
  g.children[7].visible = false; // visor
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && m.color && m.color.getHex() === 0x1f2a24) {
      const c = m.clone();
      c.color.set(jacket);
      (o as THREE.Mesh).material = c;
    }
  });
  const wrapMat = new THREE.MeshStandardMaterial({ color: scarf, roughness: 1 });
  const turban = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 16), wrapMat);
  turban.rotation.x = Math.PI / 2;
  turban.position.y = 1.72;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), wrapMat);
  top.position.y = 1.73;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.05), wrapMat);
  tail.position.set(0, 1.5, -0.11);
  const neck = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 6, 14), wrapMat);
  neck.rotation.x = Math.PI / 2;
  neck.position.y = 1.5;
  g.add(turban, top, tail, neck);
  g.traverse((o) => (o.castShadow = true));
  return g;
}
