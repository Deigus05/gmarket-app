// Codemagic sometimes installs with NODE_ENV=production and skips devDependencies.
// This shim makes TypeScript robust by ensuring the `three` import always resolves.
//
// We intentionally keep all THREE types as `any` to avoid failing CI when
// `@types/three` is not present.
declare module 'three' {
  namespace THREE {
    type Material = any;
    type WebGLProgramParametersWithUniforms = any;
    type BufferGeometry = any;
    type Line = any;
    type Sprite = any;
    type InstancedMesh = any;
    type Texture = any;
    type Color = any;
    type SpriteMaterial = any;
    type MeshBasicMaterial = any;
    type BufferAttribute = any;
    type PlaneGeometry = any;
    type Vector2 = any;
    type Vector3 = any;
    type Matrix4 = any;
    type WebGLRenderer = any;
    type PerspectiveCamera = any;
    type Group = any;
    type Scene = any;
    type LineBasicMaterial = any;
  }

  const THREE: any;
  export = THREE;
}

