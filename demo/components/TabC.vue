<template>
   <div class="tab-c-controls">
     <div>
       <input type="checkbox" id="stop" v-model="paused"> <label for="stop">paused</label>
     </div>
     <div class="camera-readout">
       <div class="camera-readout__header">
         <strong>Camera coordinates</strong>
         <button type="button" :disabled="!cameraPosePayload" @click="copyCameraPose">
           {{ cameraPoseCopied ? 'Copied' : 'Copy' }}
         </button>
       </div>
       <pre>{{ cameraPoseDisplay }}</pre>
     </div>
   </div>

   <vuetrex height="79vh" width="100%" :camera="camera" :stopped="paused" :settings="vsSettings" @ready="onStageReady">
     <vx-layer>
      <vx-row>
        <vx-box name="xx" id="xx" :text="'['+counter1+']'" @click="counter1++"/>
        <vx-box name="yy" id="yy" :text="'('+counter2+')'" @click="counter2++"/>
      </vx-row>
      <vx-row>
          <vx-cylinder ref="centralC" name="cc" id="cc" text="click me" @click="cylClick" size="0.1"/>
      </vx-row>
      <vx-row>
       <vx-box id="singleton" text="singleton" />
       <vx-box name="abc" id="abc" text="abc" size="0.5" />
     </vx-row>
     </vx-layer>
     <vx-connectors :graph="connections" />
   </vuetrex>
</template>

<script lang="ts">
let rs = {}

import * as THREE from 'three';

import {onBeforeUnmount, ref} from 'vue';
import {Vuetrex, connectors, particles, VxStage, VxSettings, VxMouseEvent} from '@/lib-components/index.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
// noinspection TypeScriptCheckImport
import {Text} from 'troika-three-text';
import gsap from 'gsap';

//import {PI} from 'three/examples/jsm/nodes/math/MathNode';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader';
//import {AdditiveBlending} from 'three';

export default {
  components: {
    Vuetrex
  },
  props: {
    items: {
      type: Array,
      default: () => ([])
    }
  },
  setup() {
    const connections = connectors.edges([
      { from: 'cc', to: 'abc' }, { from: 'singleton', to: 'abc' },
    ], {
      keyBy: ({ item }) => item.from, from: ({ item }) => item.from, to: ({ item }) => item.to,
    }).stroke({ opacity: 0, markerEnd: false })
      .flow(route => particles.path(route.points, {
        count: Math.max(1, Math.round(route.totalLength * 5)), spread: 0.02 * route.scale,
      }).appearance({ color: 0x505050, size: 0.11 * route.scale, blending: 'normal', shape: 'disc' })
        .motion({ speed: 0.5 * route.scale }))
    const centralC = ref(null)
    const counter1 = ref(0), counter2 = ref(0)
    const paused = ref(false)
    const camera = ref("scene")
    const cameraPoseDisplay = ref('Waiting for stage…')
    const cameraPosePayload = ref('')
    const cameraPoseCopied = ref(false)
    let stopCameraReadout: (() => void) | undefined
    let thing = null
    //light scheme example
    const vsSettings: VxSettings = {
      unit: 1.25,
      gap: 1.5,
      color: 0x334755,
      highlightColor: 0x3377bb,
      floorColor: 0xffffff,
      captionColor: 0x333333,
      lightColor1: 0x7070ff,
      lightColor2: 0xffffff,
      lightColor3: 0x0000ff,
      mirrorOpacity: 0.92,
    };

    function cylClick(ev: VxMouseEvent) {
      console.log("cul click ",ev)
      const pos = ev.vxNode.element.mesh.position;
      if (camera.value === ev.vxNode.id) {
        camera.value = "scene"
        //jump the cylinder
        gsap.to(pos, {duration:0.1, x:0, y:-0.1});
        gsap.to(pos, {duration:0.1, x:0, y:0.2, delay: 0.1});
      } else {
        camera.value = ev.vxNode.id;
        gsap.to(pos, {duration:0.1, x:0, y:-0.1});
        gsap.to(pos, {duration:0.1, x:0, y:0.3, delay: 0.1});
      }

    }

    function loadGLTFModel(stage:VxStage) {
      //loading external model
      const loader = new GLTFLoader();
      //const dracoLoader = new DRACOLoader(stage.getScene());
      //loader.setDRACOLoader(dracoLoader);
     loader.load('/demo/assets/tripod2-2.gltf', gltf => {
            console.log("loaded...", gltf);
            const sceneGroup = gltf.scene;
            thing = sceneGroup;
            sceneGroup.scale.set(0.75,0.75,0.75);
            sceneGroup.position.set(0.0, -0.30,-0.3);
            sceneGroup.rotation.set(0.0,0.50,0.0);


            sceneGroup.traverse(o => {
              console.log(o);

              // if (o.parent !== null && (o as any).material.map) {
              //   //console.log(o.name, ':', o.isObject3D, o);
              //   //(o as any).material.map.colorSpace = 3001; //THREE.LinearEncoding, see also THREE.sRGBEncoding
              //   o.castShadow = true;
              //   o.receiveShadow = false;
              // }

            });
            stage.getScene().add(sceneGroup);

            // const myText = new Text();
            // stage.getScene().add(myText);
            // myText.text = 'Welcome to the demo!\nThis is an example of\na simple 3D chart'
            // myText.font = 'https://fonts.gstatic.com/s/notosans/v7/o-0IIpQlx3QUlC5A4PNr5TRG.woff'
            //
            // myText.anchorX = 'center'
            // myText.selectable = true
            // myText.lineHeight = '1.3'
            // myText.fontSize = 0.3
            // myText.position.z = 2
            // myText.position.y = -0.3
            // myText.position.x = 0
            // myText.rotation.x = -1.57
            // myText.color = 0x507090
            // myText.sync()

          },
          (xhr) => {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
          },
          (error) => {
            console.log('An error happened', error);
          });
    }

    function getDefaultControlPoints(p1: THREE.Vector3, p2: THREE.Vector3, d: number) {
      // Calculate the midpoint
      const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

      // Determine the offset factor (you can customize this)
      // This example uses 1/4th of the distance between the points
      const offsetFactor = p1.distanceTo(p2) * (0.2 + d/10.0);

      // Offset direction - this example uses the Y axis
      // You can modify the logic to choose the axis based on the points' distribution
      const offsetDirection = new THREE.Vector3(0, 1, 0);

      // Create control points
      const controlPoint1 = new THREE.Vector3().addVectors(midpoint, offsetDirection.clone().multiplyScalar(offsetFactor));
      const controlPoint2 = p2.clone(); //new THREE.Vector3().addVectors(midpoint, offsetDirection.clone().multiplyScalar(-offsetFactor));

      return [controlPoint1, controlPoint2];
    }

    function createPipeConnector(stage: VxStage, p1: THREE.Vector3, p2: THREE.Vector3, d: number) {
      // Define your two anchor points
      const point1 = p1; //new THREE.Vector3(0.0, -0.3, 1.0); // Replace x1, y1, z1 with your values
      const point2 = p2; //new THREE.Vector3(2.0, 1.3, 3.0); // Replace x2, y2, z2 with your values

      // Define control points for the curve (adjust these to shape the curve)
      //const [controlPoint1, controlPoint2] = getDefaultControlPoints(point1, point2, d);

      // Create a Cubic Bezier Curve
      //const curve = new THREE.CubicBezierCurve3(point1, controlPoint1, controlPoint2, point2);
      const curve = new THREE.LineCurve3(point1, point2);

      // Alternatively, for a smoother curve, you can use CatmullRomCurve3
      //const curve = new THREE.CatmullRomCurve3([point1, controlPoint1, controlPoint2, point2]);

      // TubeGeometry to create a pipe along the curve
      const tubeGeometry = new THREE.TubeGeometry(curve, 12, 0.01, 3, false);

      // Material for the tube
      const col: THREE.ColorRepresentation = new THREE.Color(0x8fa0b0);
      col.setHSL(0.3+d/20, 0.3+d/10, 0.5);
      const material = new THREE.MeshStandardMaterial({ color: col, roughness: 0.1, metalness: 0.5 }); // Choose your color

      // Create the mesh and add it to the scene
      const tubeMesh = new THREE.Mesh(tubeGeometry, material);
      tubeMesh.castShadow = true;
      stage.getScene().add(tubeMesh);
    }

    function updateCameraReadout(stage: VxStage) {
      const debugStage = stage as VxStage & {
        renderCamera: THREE.PerspectiveCamera
        cameraTarget: THREE.Vector3
        renderer: THREE.WebGLRenderer
        width: number
        height: number
      }
      const position = debugStage.renderCamera.position
      const target = debugStage.cameraTarget
      const offset = position.clone().sub(target)
      const distance = offset.length()
      const radiansToDegrees = THREE.MathUtils.radToDeg
      const azimuthDeg = radiansToDegrees(Math.atan2(offset.x, offset.z))
      const elevationDeg = distance > 0
          ? radiansToDegrees(Math.asin(THREE.MathUtils.clamp(offset.y / distance, -1, 1)))
          : 0
      const polarDeg = 90 - elevationDeg
      const round = (value: number) => Number(value.toFixed(6))
      const payload = {
        position: position.toArray().map(round),
        target: target.toArray().map(round),
        azimuthDeg: round(azimuthDeg),
        elevationDeg: round(elevationDeg),
        polarDeg: round(polarDeg),
        distance: round(distance),
        fovDeg: round(debugStage.renderCamera.fov),
        viewportCss: [debugStage.width, debugStage.height],
        pixelRatio: round(debugStage.renderer.getPixelRatio()),
      }
      const serialized = JSON.stringify(payload)
      if (serialized !== cameraPosePayload.value) cameraPoseCopied.value = false
      cameraPosePayload.value = serialized
      cameraPoseDisplay.value = [
        `position  [${payload.position.join(', ')}]`,
        `target    [${payload.target.join(', ')}]`,
        `azimuth   ${payload.azimuthDeg}°    elevation ${payload.elevationDeg}°    polar ${payload.polarDeg}°`,
        `distance  ${payload.distance}    fov ${payload.fovDeg}°`,
        `viewport  ${payload.viewportCss.join(' × ')} CSS px    DPR ${payload.pixelRatio}`,
      ].join('\n')
    }

    async function copyCameraPose() {
      if (!cameraPosePayload.value) return
      await navigator.clipboard.writeText(cameraPosePayload.value)
      cameraPoseCopied.value = true
    }

    function onStageReady(stage:VxStage) {
      stopCameraReadout?.()
      updateCameraReadout(stage)
      stopCameraReadout = stage.onEachFrame(() => updateCameraReadout(stage))
      loadGLTFModel(stage);
      //12 pipe connectors on the sides of a cylinder
      const N = 5;
      const R = 0.03;
      const S = 0.3;
      for (let s = 0; s < N; s++) {
        for (let i = 0; i < N; i++) {
          let b = (i);
          let e = (i+1);
          createPipeConnector(stage,
              new THREE.Vector3(R * Math.cos(b * Math.PI * 2 / N), S*s, R * Math.sin(b * Math.PI * 2 / N)),
              new THREE.Vector3(R * Math.cos(e * Math.PI * 2 / N), S*(s+1), R * Math.sin(e * Math.PI * 2 / N)), i);
        }
      }

      for (let i = 7; i < 12; i++) {
        createPipeConnector(stage, new THREE.Vector3(0.0+i*0.11, -0.35, 1.0),
            new THREE.Vector3(2.0+i*0.11, -0.35, 3.0), 0.00001/i);
        createPipeConnector(stage, new THREE.Vector3(2.0+i*0.11, -0.35, 3.0),
            new THREE.Vector3(1.0+i*0.11, -0.35, 4.0), 0.00001/i);
      }
      //animation simply counts fps
      // let pTime = ( performance || Date ).now();
      // let frames = 0;
      // stage.onEachFrame((time, tick) => {
      //    frames++;
      //    if (frames > 1000) {
      //      console.log("FPS:", ( frames * 1000 ) / ( time - pTime ))
      //      frames = 0;
      //      pTime = time;
      //    }
      // })
    }

    onBeforeUnmount(() => stopCameraReadout?.())

    return {
      connections, centralC,
      paused,
      counter1, counter2,
      vsSettings,
      camera,
      cameraPoseDisplay,
      cameraPosePayload,
      cameraPoseCopied,
      copyCameraPose,
      onStageReady,
      cylClick
    }
  }
}
</script>

<style scoped>
.tab-c-controls {
  display: grid;
  justify-items: center;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.camera-readout {
  box-sizing: border-box;
  width: min(46rem, calc(100% - 1rem));
  padding: 0.55rem 0.7rem;
  border: 1px solid #9aa4aa;
  border-radius: 0.35rem;
  background: #f4f6f7;
  color: #243039;
  text-align: left;
}

.camera-readout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.camera-readout pre {
  margin: 0;
  overflow-x: auto;
  font: 0.75rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
}
</style>
