import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { ComplexAmplitude } from "./types";

interface QSphereProps {
  amplitudes: Record<string, ComplexAmplitude>;
}

interface QPoint {
  basis: string;
  probability: number;
  phase: number;
  position: [number, number, number];
}

function pointsFromState(amplitudes: Record<string, ComplexAmplitude>): QPoint[] {
  const entries = Object.entries(amplitudes);
  const n = entries.length ? Math.round(Math.log2(entries.length)) : 0;
  if (!n) return [];

  return entries.map(([basis, amplitude]) => {
    const probability = amplitude.real * amplitude.real + amplitude.imag * amplitude.imag;
    const phase = Math.atan2(amplitude.imag, amplitude.real);
    const integer = Number.parseInt(basis, 2);
    const ones = basis.split("").filter((bit) => bit === "1").length;

    // Q-sphere layout: Hamming weight determines latitude, while the
    // computational-basis index determines the azimuth within that ring.
    const theta = n <= 1 ? 0 : Math.PI * ones / n;
    const ringSize = Math.max(1, Math.round(binomial(n, ones)));
    const rank = rankWithinHammingWeight(integer, n, ones);
    const phi = ringSize === 1 ? 0 : (2 * Math.PI * rank) / ringSize;

    const radius = 1.05;
    return {
      basis,
      probability,
      phase,
      position: [
        radius * Math.sin(theta) * Math.cos(phi),
        radius * Math.cos(theta),
        radius * Math.sin(theta) * Math.sin(phi),
      ],
    };
  });
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - i + 1)) / i;
  return result;
}

function rankWithinHammingWeight(value: number, n: number, ones: number): number {
  let rank = 0;
  let remaining = ones;
  for (let bit = n - 1; bit >= 0; bit -= 1) {
    if (((value >> bit) & 1) === 1) {
      rank += binomial(bit, remaining);
      remaining -= 1;
      if (remaining === 0) break;
    }
  }
  return Math.max(0, rank);
}

function phaseColor(phase: number): string {
  const hue = ((phase + Math.PI) / (2 * Math.PI)) * 360;
  return `hsl(${hue.toFixed(1)} 85% 60%)`;
}

function QSphereScene({ points }: { points: QPoint[] }) {
  const linePositions = useMemo(() => {
    const values: number[] = [];
    for (const point of points) {
      values.push(0, 0, 0, ...point.position);
    }
    return new THREE.Float32BufferAttribute(values, 3);
  }, [points]);

  return (
    <>
      <ambientLight intensity={1.2} />
      <mesh>
        <sphereGeometry args={[1.05, 40, 40]} />
        <meshBasicMaterial wireframe transparent opacity={0.18} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <primitive attach="attributes-position" object={linePositions} />
        </bufferGeometry>
        <lineBasicMaterial transparent opacity={0.18} />
      </lineSegments>
      {points.map((point) => {
        const size = 0.035 + Math.min(0.13, Math.sqrt(point.probability) * 0.13);
        const color = phaseColor(point.phase);
        return (
          <group key={point.basis} position={point.position}>
            <mesh>
              <sphereGeometry args={[size, 16, 16]} />
              <meshBasicMaterial color={color} transparent opacity={point.probability > 1e-10 ? 1 : 0.28} />
            </mesh>
            <Text position={[0, size + 0.09, 0]} fontSize={0.095} color={color} anchorX="center" anchorY="middle">
              |{point.basis}⟩
            </Text>
          </group>
        );
      })}
      <Text position={[0, 1.38, 0]} fontSize={0.11}>|00…0⟩</Text>
      <Text position={[0, -1.38, 0]} fontSize={0.11}>|11…1⟩</Text>
      <OrbitControls enablePan={false} minDistance={2.4} maxDistance={5} />
    </>
  );
}

export default function QSphere({ amplitudes }: QSphereProps) {
  const points = useMemo(() => pointsFromState(amplitudes), [amplitudes]);
  const active = points.filter((point) => point.probability > 1e-10);
  const n = points.length ? Math.round(Math.log2(points.length)) : 0;

  return (
    <div className="space-y-3">
      <div className="h-80 rounded-md border border-[var(--bp-border)] bg-[var(--bp-bg)] overflow-hidden">
        <Canvas camera={{ position: [2.8, 2.2, 2.8], fov: 45 }}>
          <QSphereScene points={points} />
        </Canvas>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center font-mono text-[10px]">
        <div className="border border-[var(--bp-border)] rounded p-2"><span className="text-[var(--bp-text-faint)]">QUBITS</span><br />{n}</div>
        <div className="border border-[var(--bp-border)] rounded p-2"><span className="text-[var(--bp-text-faint)]">NON-ZERO</span><br />{active.length}</div>
        <div className="border border-[var(--bp-border)] rounded p-2"><span className="text-[var(--bp-text-faint)]">BASIS STATES</span><br />{points.length}</div>
      </div>
      <p className="text-[10px] text-[var(--bp-text-faint)] font-mono text-center">
        Point size represents √probability; point hue represents amplitude phase. Basis labels follow Qiskit’s computational-state convention.
      </p>
    </div>
  );
}
