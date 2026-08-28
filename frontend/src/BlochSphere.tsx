import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { ComplexAmplitude } from "./types";

interface BlochVector { x: number; y: number; z: number; length: number; }

function normalize(v: BlochVector): THREE.Vector3 {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (length < 1e-12) return new THREE.Vector3(0, 0, 0);
  return new THREE.Vector3(v.x / length, v.y / length, v.z / length);
}

function SphereScene({ vector }: { vector: BlochVector }) {
  const direction = useMemo(() => normalize(vector), [vector.x, vector.y, vector.z]);
  const point = useMemo(
    () => new THREE.Vector3(vector.x, vector.z, vector.y),
    [vector.x, vector.y, vector.z],
  );

  return (
    <>
      <ambientLight intensity={1.2} />
      <mesh>
        <sphereGeometry args={[1, 40, 40]} />
        <meshBasicMaterial wireframe transparent opacity={0.2} />
      </mesh>
      <line>
        <bufferGeometry attach="geometry" attributes-position={new THREE.BufferAttribute(new Float32Array([-1.25, 0, 0, 1.25, 0, 0]), 3)} />
        <lineBasicMaterial />
      </line>
      <line>
        <bufferGeometry attach="geometry" attributes-position={new THREE.BufferAttribute(new Float32Array([0, -1.25, 0, 0, 1.25, 0]), 3)} />
        <lineBasicMaterial />
      </line>
      <line>
        <bufferGeometry attach="geometry" attributes-position={new THREE.BufferAttribute(new Float32Array([0, 0, -1.25, 0, 0, 1.25]), 3)} />
        <lineBasicMaterial />
      </line>
      <arrowHelper args={[direction, new THREE.Vector3(0, 0, 0), vector.length, 0x4fd8f0]} />
      <mesh position={point}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#4fd8f0" />
      </mesh>
      <Text position={[0, 1.4, 0]} fontSize={0.14}>|0⟩ / +Z</Text>
      <Text position={[0, -1.4, 0]} fontSize={0.14}>|1⟩ / -Z</Text>
      <Text position={[1.4, 0, 0]} fontSize={0.14}>+X</Text>
      <Text position={[0, 0, 1.4]} fontSize={0.14}>+Y</Text>
      <OrbitControls enablePan={false} minDistance={2.4} maxDistance={5} />
    </>
  );
}

/**
 * Compute the reduced single-qubit density matrix from the full statevector.
 * For rho = [[rho00, rho01], [rho10, rho11]], the Bloch vector is:
 * x = 2 Re(rho01), y = 2 Im(rho01), z = rho00 - rho11.
 * This works for both pure and entangled multi-qubit states.
 */
function reducedBlochVector(
  amplitudes: Record<string, ComplexAmplitude>,
  qubit: number,
): BlochVector {
  let p0 = 0;
  let p1 = 0;
  let rho01Real = 0;
  let rho01Imag = 0;

  // Qiskit statevector basis labels are displayed as |q[n-1] ... q[1] q[0]>.
  // After parsing the binary label as an integer, q[0] is therefore the
  // least-significant bit (bit 0), q[1] is bit 1, etc. Do not reverse the
  // selected UI qubit index here. Reversing it swaps q[0] and q[n-1].
  const bitPosition = qubit;
  const mask = 1 << bitPosition;
  const state = new Map<number, ComplexAmplitude>();

  for (const [basis, amplitude] of Object.entries(amplitudes)) {
    state.set(Number.parseInt(basis, 2), amplitude);
  }

  for (const [index, amplitude] of state.entries()) {
    const probability = amplitude.real * amplitude.real + amplitude.imag * amplitude.imag;
    if ((index & mask) === 0) {
      p0 += probability;
    } else {
      p1 += probability;
    }
  }

  // Sum a*conj(b) over all pairs differing only in the selected qubit.
  // a corresponds to the selected qubit being |0>, b to |1>.
  for (const [baseIndex] of state.entries()) {
    if ((baseIndex & mask) !== 0) continue;
    const zero = state.get(baseIndex);
    const one = state.get(baseIndex | mask);
    if (!zero || !one) continue;
    rho01Real += zero.real * one.real + zero.imag * one.imag;
    rho01Imag += zero.imag * one.real - zero.real * one.imag;
  }

  const x = Math.max(-1, Math.min(1, 2 * rho01Real));
  const y = Math.max(-1, Math.min(1, 2 * rho01Imag));
  const z = Math.max(-1, Math.min(1, p0 - p1));
  const length = Math.min(1, Math.sqrt(x * x + y * y + z * z));

  return { x, y, z, length };
}

export default function BlochSphere({
  amplitudes,
  qubits,
  selectedQubit,
}: {
  amplitudes: Record<string, ComplexAmplitude>;
  qubits: number;
  selectedQubit: number;
}) {
  const keys = Object.keys(amplitudes);
  if (!keys.length || selectedQubit < 0 || selectedQubit >= qubits) return null;

  const vector = useMemo(
    () => reducedBlochVector(amplitudes, selectedQubit),
    [amplitudes, qubits, selectedQubit],
  );

  return (
    <div className="space-y-3">
      <div className="h-80 rounded-md border border-[var(--bp-border)] bg-[var(--bp-bg)] overflow-hidden">
        <Canvas camera={{ position: [2.7, 2.2, 2.7], fov: 45 }}>
          <SphereScene vector={vector} />
        </Canvas>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center font-mono text-[10px]">
        <div className="border border-[var(--bp-border)] rounded p-2"><span className="text-[var(--bp-text-faint)]">QUBIT</span><br />q[{selectedQubit}]</div>
        <div className="border border-[var(--bp-border)] rounded p-2"><span className="text-[var(--bp-text-faint)]">X</span><br />{vector.x.toFixed(3)}</div>
        <div className="border border-[var(--bp-border)] rounded p-2"><span className="text-[var(--bp-text-faint)]">Y</span><br />{vector.y.toFixed(3)}</div>
        <div className="border border-[var(--bp-border)] rounded p-2"><span className="text-[var(--bp-text-faint)]">Z</span><br />{vector.z.toFixed(3)}</div>
      </div>
      <p className="text-[10px] text-[var(--bp-text-faint)] font-mono text-center">
        |r| = {vector.length.toFixed(3)} · derived from the simulated reduced density matrix
      </p>
    </div>
  );
}
