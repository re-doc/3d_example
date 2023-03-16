import logo from './logo.svg';
import React, { useRef, useEffect } from 'react'
import './App.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import Stats from 'three/addons/libs/stats.module.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import TerrainLoader from './libs/TerrainLoader'

import { TransformControls } from 'three/addons/controls/TransformControls.js';

let container, stats;
let camera, scene, renderer, uniforms, geometry, particleSystem, uniformsSky, resolution, requestAnimationFrameTimer, mixer, clock, plane, params, shaders = [], 
previousRAF = null, gui, buildMaterial, control;
let totalTime = 0;
const particles = 10000;
let te;
const vertexshaderSky = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 fposition;

  void main()	{

    vUv = uv;
    vNormal = normal;
    // gl_Position = vec4( position, 1.0 );
    fposition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

  }
`
const fragmentshaderSky = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 fposition;

  uniform float time;
  uniform vec3 color;
  uniform sampler2D colorTexture;
  uniform vec3 lightDir;

  vec3 redColor = vec3(1,.5,0);
  vec3 blueColor = vec3(0,0,1);

  const mat2 m2 = mat2( 0.60, -0.80, 0.80, 0.60 );

  vec3 Cloud(vec3 bgCol,vec3 ro,vec3 rd,vec3 cloudCol,float spd)
    {
        vec3 col = bgCol;
        float t = time * 0.9 * spd;
        vec2 sc = ro.xz + rd.xz*((3.)*40000.0-ro.y)/rd.y;
        vec2 p = 0.00002*sc;
        float f = 0.0;
        float s = 0.5;
        float sum =0.;
        for(int i=0;i<20;i++){
          p += t;
          t *=1.5;
          f += s*textureLod( colorTexture, p/256.0, 0.0).x; p = m2*p*2.02;
          sum+= s;
            s*=0.6;
        }
        float val = f/sum; 
        col = mix( col, cloudCol, 0.5*smoothstep(0.5,0.8,val) );
        return col;
    }

  void main()	{

    //vec3 light = vec3( 0.5, 0.2, 1.0 );
    //light = normalize( light );
    vec3 _lightDir = normalize(lightDir);
    vec3 _fposition = normalize(fposition);
    vec3 col = vec3(1.0,1.0,1.0);  
    vec3 ro = vec3 (0.,0.,0.);
    vec3 Dir = normalize( vec3(0.5,0.25,-0.5) );

    //float dProd = dot( vNormal, light ) * 0.5 + 0.5;
    //float speed      = 1.0;
    //vec4 tcolor = texture2D( colorTexture, vUv );
    //vec4 gray = vec4( vec3( tcolor.r * 0.3 + tcolor.g * 0.59 + tcolor.b * 0.11 ) + (time*(speed/30.)), 1.0 );
    col = vec3(0.2,0.5,0.85)*1.1 - _fposition.y*_fposition.y * 0.5;
   

    float sundot = clamp(dot(_fposition,Dir),0.0,1.0);
    col += 0.25*vec3(1.0,0.7,0.4)*pow( sundot,5.0 );
    col += 0.25*vec3(1.0,0.8,0.6)*pow( sundot,64.0 );
    col += 0.4*vec3(1.0,0.8,0.6)*pow( sundot,512.0 );

    col = Cloud(col,ro,_fposition,vec3(1.0,0.95,1.0),1.);

    col = mix( col, 0.68*vec3(0.4,0.65,1.0), pow( 1.0-max(_fposition.y,0.0), 5.0 ) );
    //gl_FragColor = gray * vec4( vec3( dProd ) * vec3( color ), 1.0 );
    gl_FragColor = vec4(col,1.0);
  }
`

const vertexshader = `
  attribute float size;

  varying vec3 vColor;

  void main() {

    vColor = color;

    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

    gl_PointSize = size * ( 300.0 / -mvPosition.z );

    gl_Position = projectionMatrix * mvPosition;

  }
`
const fragmentshader = `
  uniform sampler2D pointTexture;

  varying vec3 vColor;

  void main() {

    gl_FragColor = vec4( vColor, 1.0 );

    gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord );

  }
`

THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  vec3 fogOrigin = cameraPosition;
  vec3 fogDirection = normalize(vWorldPosition - fogOrigin);
  float fogDepth = distance(vWorldPosition, fogOrigin);

  // f(p) = fbm( p + fbm( p ) )
  vec3 noiseSampleCoord = vWorldPosition * 0.00025 + vec3(
      0.0, 0.0, fogTime * 0.025);
  float noiseSample = FBM(noiseSampleCoord + FBM(noiseSampleCoord)) * 0.5 + 0.5;
  fogDepth *= mix(noiseSample, 1.0, saturate((fogDepth - 5000.0) / 5000.0));
  fogDepth *= fogDepth;

  float heightFactor = 0.05;
  float fogFactor = heightFactor * exp(-fogOrigin.y * fogDensity) * (
      1.0 - exp(-fogDepth * fogDirection.y * fogDensity)) / fogDirection.y;
  fogFactor = saturate(fogFactor);

  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

// change fog shader
const _NOISE_GLSL = `
//
// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20201014 (stegu)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
//

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
{
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}

float FBM(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 0.0;
  for (int i = 0; i < 6; ++i) {
    value += amplitude * snoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
`;

THREE.ShaderChunk.fog_pars_fragment = _NOISE_GLSL + `
#ifdef USE_FOG
  uniform float fogTime;
  uniform vec3 fogColor;
  varying vec3 vWorldPosition;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vec4 worldPosition = modelMatrix * vec4(position, 1.0); // From local position to global position
  vWorldPosition = worldPosition.xyz;
#endif`;

THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying vec3 vWorldPosition;
#endif`;

function App() {
  const renderRef  = useRef()

  

  useEffect(() => {
    let _renderRefC
    if (renderRef && renderRef.current) {
      
      init(renderRef).then( animate(previousRAF) )

      _renderRefC = renderRef.current
   
    }
    return () => {
      requestAnimationFrameTimer && cancelAnimationFrame(requestAnimationFrameTimer);
      renderer.dispose()
      if (gui) {
        console.log('domElement', gui.domElement)

        gui.domElement && gui.domElement.remove()
      }
      
      _renderRefC.removeChild(_renderRefC.firstElementChild)
    };
 
  }, [renderRef]);


  return (
    <div className="App">
      <div className='mask'></div>
      <div className='content' ref={renderRef}></div>
    </div>
  );
}

async function init(renderRef) {
  params = {
    intensity: 1.1,
    AmbientlightIntensity: 3,
    aoMapIntensity: 1,
    displacementScale: 1,
    offsetX: 35,
    offsetY: 56,
    repeatX: 24,
    repeatY: 24,
    rotation: -Math.PI / 4, // positive is counter-clockwise
    centerX: 62,
    centerY: 42,
    roughness: 1,
    metalness: 0,
    scaleNum: 2.9,
    fogNum: 0.00045
  };
  const { innerWidth, innerHeight } = window;
 
  container = document.createElement( 'div' );
  renderRef.current.appendChild( container );

  clock = new THREE.Clock();

  // SCENE

  scene = new THREE.Scene();
  // scene.fog = new THREE.FogExp2( 0xcccccc, params.fogNum );
  // CAMERA

  camera = new THREE.PerspectiveCamera( 40, innerWidth / innerHeight, 1, 1000000 );
  camera.position.set( 700, 200, - 500 );

  const helperCamera = new THREE.CameraHelper( camera );
  //scene.add( helperCamera );



  const colorFormats = {
    buildMaterial: '#b1b2b2',
    int: 0xb1b2b2,
    object: { r: 1, g: 1, b: 1 },
    array: [ 1, 1, 1 ]
  };
  // RENDERER

  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( innerWidth, innerHeight );
  container.appendChild( renderer.domElement );
  renderer.outputEncoding = THREE.sRGBEncoding;

  //const pmremGenerator = new THREE.PMREMGenerator( renderer );

  // scene.environment = pmremGenerator.fromScene( new RoomEnvironment(), 0.04 ).texture;

  resolution = new THREE.Vector3( window.innerWidth, window.innerHeight, window.devicePixelRatio );

  // shader
  uniforms = {

    pointTexture: { value: new THREE.TextureLoader().load( 'textures/spark1.png' ) }

  };

  // LIGHTS

  const light = new THREE.DirectionalLight( 0xaabbff, params.intensity );
  light.position.x = 600;
  light.position.y = 400;
  light.position.z = - 1000;

  scene.add( light );

  const Ambientlight = new THREE.AmbientLight( 0x404040, params.AmbientlightIntensity  ); // soft white light
  scene.add( Ambientlight );

  const helper = new THREE.DirectionalLightHelper( light, 5 );
  scene.add( helper );

  const size = 8000;
  const divisions = 100;

  const gridHelper = new THREE.GridHelper( size, divisions );
  // scene.add( gridHelper );

  uniformsSky = {
    time: { value: 1.0 },
    'colorTexture': { value: new THREE.TextureLoader().load( 'textures/noise.png' ) },
    'color': { value: new THREE.Color( 0xff2200 ) },
    iResolution: { value: resolution },
    lightDir: light.position
  };
  // const shaderMaterial = new THREE.ShaderMaterial( {
  uniformsSky[ 'colorTexture' ].value.wrapS = uniformsSky[ 'colorTexture' ].value.wrapT = THREE.RepeatWrapping;


  // } );



  // SKYDOME

  const topColor = new THREE.Color().copy( light.color ).convertSRGBToLinear();
  const bottomColor = new THREE.Color( 0xffffff ).convertSRGBToLinear();
  const offset = 400;
  const exponent = 0.6;

  //const h = positionLocal.add( offset ).normalize().y;

  const skyMat = new THREE.ShaderMaterial( {
    uniforms: uniformsSky,
    vertexShader: vertexshaderSky,
    fragmentShader: fragmentshaderSky,
  } );



  // skyMat.colorNode = vec4( mix( color( bottomColor ), color( topColor ), h.max( 0.0 ).pow( exponent ) ), 1.0 );
  skyMat.side = THREE.BackSide;
  const sky = new THREE.Mesh( new THREE.SphereGeometry( 4000, 32, 15 ), skyMat );

  sky.material.onBeforeCompile = ModifyShader;

  scene.add( sky );

  // star
  const radius = 4000;

  geometry = new THREE.BufferGeometry();

  const positions = [];
  const colors = [];
  const sizes = [];

  const colorr = new THREE.Color();

  for ( let i = 0; i < particles; i ++ ) {

    positions.push( ( Math.random() * 2 - 1 ) * radius );
    positions.push( ( Math.random() * 2 - 1 ) * radius );
    positions.push( ( Math.random() * 2 - 1 ) * radius );

    colorr.setHSL( i / particles, 1.0, 0.5 );

    colors.push( colorr.r, colorr.g, colorr.b );

    sizes.push( 100 );

  }

  geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
  geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
  geometry.setAttribute( 'size', new THREE.Float32BufferAttribute( sizes, 1 ).setUsage( THREE.DynamicDrawUsage ) );

  const shaderMaterial = new THREE.ShaderMaterial( {

    uniforms: uniforms,
    vertexShader: vertexshader,
    fragmentShader: fragmentshader,

    blending: THREE.AdditiveBlending,
    depthTest: false,
    transparent: true,
    vertexColors: true

  } );

  particleSystem = new THREE.Points( geometry, shaderMaterial );




  scene.add( particleSystem );

  // CONTROLS

  const controls = new OrbitControls( camera, renderer.domElement );

  control = new TransformControls( camera, renderer.domElement );
  control.addEventListener( 'change', () => {
    renderer.render( scene, camera );
  } );
  control.addEventListener( 'dragging-changed', function ( event ) {
    console.log('event', event)
    controls.enabled = ! event.value;

  } );
  // controls.maxPolarAngle = 0.9 * Math.PI / 2;
  // controls.enableZoom = false;

  // STATS

  stats = new Stats();
  container.appendChild( stats.dom );

  // 

  // MODEL

  //const loader = new THREE.ObjectLoader();
  //const object = await loader.loadAsync( 'lightmap/lightmap.json' );
  // scene.add( object );
  const planeGeometry = new THREE.CircleGeometry( 4000);
  const material = new THREE.MeshStandardMaterial( {
    // color: colorFormats.int, 
    side: THREE.DoubleSide,
    map: new THREE.TextureLoader().load(
      'textures/groundColor.jpg', (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // texture.repeat.set( 100, 100 );
        // texture.format = THREE.RGBAFormat
        updateUvTransform();
      }
    ),
    // normalMap: new THREE.TextureLoader().load(
    //   'textures/Ground_Grass_001_NORM.jpg', (texture) => {
    //     texture.wrapS = THREE.RepeatWrapping;
    //     texture.wrapT = THREE.RepeatWrapping;
    //     texture.repeat.set( 80, 80 );
    //   }
    // ),
    // aoMap: new THREE.TextureLoader().load(
    //   'textures/Ground_Grass_001_OCC.jpg', (texture) => {
    //     texture.wrapS = THREE.RepeatWrapping;
    //     texture.wrapT = THREE.RepeatWrapping;
    //     texture.repeat.set( 80, 80 );
    //   }
    // ),
    displacementMap: new THREE.TextureLoader().load(
      'textures/Ground_Grass_001_DISP.jpg', (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set( 80, 80 );
      }
    ),
    //displacementScale: params.displacementScale,
    //aoMapIntensity: params.aoMapIntensity,
    roughness: params.roughness,
    metalness: params.metalness,
    shininess: 0
  } );

  plane = new THREE.Mesh( planeGeometry, material );
  plane.rotateX(Math.PI/2)
  // scene.add( plane );

  console.log('scene', scene)

  // terrian
  let terrainLoader = new TerrainLoader();
  terrainLoader.load('TerrainData/groundInt.bin', function(data) {
    console.log('data', data)
    let terrainGeometry = new THREE.PlaneGeometry(8000, 8000, 199, 199);
    console.log('terrainGeometry', terrainGeometry)
    const count = terrainGeometry.attributes.position.count
    const verticesArray = terrainGeometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      const _i = (i + 1) * 3 - 1
      verticesArray[_i] = data[i] / 65535 * 800;
    }

    let terrainMaterial = new THREE.MeshLambertMaterial({
        map: new THREE.TextureLoader().load('textures/colorGround2.jpg')
    });

    let terrainplane = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrainplane.rotateX( -Math.PI / 2 );
    terrainplane.translateZ(292);
    scene.add(terrainplane);
    terrainplane.name = 'terrainplane';
    control.attach( terrainplane );
    scene.add( control );


  });

  const buildsGroup = new THREE.Group()
  scene.add(buildsGroup);
  buildsGroup.translateX(2083.8)
  buildsGroup.translateZ(-2058.6)
  // 2083.7792052676978, y: 292, z: 2058.6449035209525
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath( 'draco/gltf/' );

  const glftloader = new GLTFLoader();
  glftloader.setDRACOLoader( dracoLoader );
  const librarywithTexture = await glftloader.loadAsync( 'models/librarywithTexture.glb')
  librarywithTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)

  const groundwithTexture = await glftloader.loadAsync( 'models/groundwithTexture.glb')
  groundwithTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  groundwithTexture.scene.position.set(0, 1, 0);
  buildsGroup.add( groundwithTexture.scene);
  //console.log('groundwithTexture.scene', groundwithTexture.scene)

  const monitoringwithTexture = await glftloader.loadAsync( 'models/monitoringwithTexture.glb')
  monitoringwithTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( monitoringwithTexture.scene);

  const streetLampwithTexture = await glftloader.loadAsync( 'models/streetLampwithTexture.glb')
  streetLampwithTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( streetLampwithTexture.scene);

  const stadiumTexture = await glftloader.loadAsync( 'models/stadiumTexture.glb')
  stadiumTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( stadiumTexture.scene);

  const fenceTexture = await glftloader.loadAsync( 'models/fenceTexture.glb')
  fenceTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( fenceTexture.scene);

  const clockTexture = await glftloader.loadAsync( 'models/clockTexture.glb')
  clockTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( clockTexture.scene);
  
  const playgroundTexture = await glftloader.loadAsync( 'models/playgroundTexture.glb')
  playgroundTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  playgroundTexture.scene.position.set(0, 1, 0);
  buildsGroup.add( playgroundTexture.scene);

  const dormTexture = await glftloader.loadAsync( 'models/dormTexture.glb')
  dormTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( dormTexture.scene);

  const teaching_A1Texture = await glftloader.loadAsync( 'models/teaching_A1Texture.glb')
  teaching_A1Texture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( teaching_A1Texture.scene);

  const teaching_A3Texutre = await glftloader.loadAsync( 'models/teaching_A3Texutre.glb')
  teaching_A3Texutre.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( teaching_A3Texutre.scene);
  
  const teaching_A2Texture = await glftloader.loadAsync( 'models/teaching_A2Texture.glb')
  teaching_A2Texture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( teaching_A2Texture.scene);
  
  const teaching_A4Texture = await glftloader.loadAsync( 'models/teaching_A4Texture.glb')
  teaching_A4Texture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( teaching_A4Texture.scene);

  const diningTexture = await glftloader.loadAsync( 'models/diningTexture.glb')
  diningTexture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( diningTexture.scene);
  
  const office_A1Texture = await glftloader.loadAsync( 'models/office_A1Texture.glb')
  office_A1Texture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( office_A1Texture.scene);

  const office_A2Texture = await glftloader.loadAsync( 'models/office_A2Texture.glb')
  office_A2Texture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( office_A2Texture.scene);
  
  const office_A3Texture = await glftloader.loadAsync( 'models/office_A3Texture.glb')
  office_A3Texture.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( office_A3Texture.scene);
  
  const teaching_B1T = await glftloader.loadAsync( 'models/teaching_B1T.glb')
  teaching_B1T.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( teaching_B1T.scene);

  const teaching_B2T = await glftloader.loadAsync( 'models/teaching_B2T.glb')
  teaching_B2T.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( teaching_B2T.scene);

  const teaching_B3T = await glftloader.loadAsync( 'models/teaching_B3T.glb')
  teaching_B3T.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( teaching_B3T.scene);

  const teaching_B4T = await glftloader.loadAsync( 'models/teaching_B4T.glb')
  teaching_B4T.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  buildsGroup.add( teaching_B4T.scene);

  
  // LittlestTokyoObject.scene.traverseVisible((obj) => {
  //   if(obj.isMesh) {
 
  //     if (obj.material.map) {
  //       obj.material.map.encoding = THREE.LinearEncoding 
  //       obj.material.needsUpdate = true;
  //     }

  //   }
  // })
 
  // LittlestTokyoObject.scene.material.map.encoding = THREE.sRGBEncoding;
  // LittlestTokyoObject.scene.material.needsUpdate = true;
  buildsGroup.add( librarywithTexture.scene);
  // mixer = new THREE.AnimationMixer( LittlestTokyoObject.scene );
	// mixer.clipAction( LittlestTokyoObject.animations[ 0 ] ).play();
  //

  // addBuilding()
  
  window.addEventListener( 'resize', onWindowResize );

  gui = new GUI();
 
  gui.add( params, 'intensity', 0, 3 ).step( 0.1 ).name( 'intensity' ).onChange( function ( value ) {

    light.intensity = value;

  } );
  gui.add( params, 'AmbientlightIntensity', 0, 3 ).step( 0.1 ).name( 'AmbientlightIntensity' ).onChange( function ( value ) {

    Ambientlight.intensity = value;

  } );
  
  gui.add( params, 'aoMapIntensity', 0, 1 ).step( 0.1 ).name( 'aoMapIntensity' ).onChange( function ( value ) {

    material.aoMapIntensity = value;

  } );
  gui.add( params, 'displacementScale', 0, 1 ).step( 0.1 ).name( 'displacementScale' ).onChange( function ( value ) {

    material.displacementScale = value;

  } );
  gui.add( params, 'roughness', 0, 1 ).step( 0.1 ).name( 'roughness' ).onChange( function ( value ) {

    material.roughness = value;

  } );
  gui.add( params, 'metalness', 0, 1 ).step( 0.1 ).name( 'metalness' ).onChange( function ( value ) {

    material.metalness = value;

  } );
  gui.add( params, 'scaleNum', 0, 4 ).step( 0.1 ).name( 'scaleNum' ).onChange( function ( value ) {

    LittlestTokyoObject.scene.scale.set(value,value,value)

  } ); 
  gui.add( params, 'fogNum', 0, 0.000025 ).step( 0.0000005 ).name( 'fogNum' ).onChange( function ( value ) {

    scene.fog.density = value

  } );
  gui.add( params, 'offsetX', 0.0, 100.0 ).step( 1.0 ).name( 'offset.x' ).onChange( updateUvTransform );
  gui.add( params, 'offsetY', 0.0, 100.0 ).step( 1.0 ).name( 'offset.y' ).onChange( updateUvTransform );
  gui.add( params, 'repeatX', 0.25, 100.0 ).step( 1.0 ).name( 'repeat.x' ).onChange( updateUvTransform );
  gui.add( params, 'repeatY', 0.25, 200.0 ).step( 1.0 ).name( 'repeat.y' ).onChange( updateUvTransform );
  gui.add( params, 'rotation', - 2.0, 2.0 ).step( 0.1 ).name( 'rotation' ).onChange( updateUvTransform );
  gui.add( params, 'centerX', 0.0, 100.0 ).step( 1.0 ).name( 'center.x' ).onChange( updateUvTransform );
  gui.add( params, 'centerY', 0.0, 100.0 ).step( 1.0 ).name( 'center.y' ).onChange( updateUvTransform );

  gui.addColor( colorFormats, 'buildMaterial' ).onChange( function ( value ) {

    buildMaterial.color = new THREE.Color(value)

  } );
}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function animate(t) {

  requestAnimationFrameTimer = requestAnimationFrame( animate );

  //nodeFrame.update();

  render(t);

  stats.update();

}

function render(t) {

  const time = Date.now() * 0.005;

  particleSystem.rotation.z = 0.01 * time;

  const sizes = geometry.attributes.size.array;

  for ( let i = 0; i < particles; i ++ ) {

    sizes[ i ] = 100 * ( 1 + Math.sin( 0.1 * i + time ) );

  }

  geometry.attributes.size.needsUpdate = true;

  uniformsSky[ 'time' ].value = performance.now() / 1000;
  // uniformsSky[ 'color' ].value.offsetHSL( 0.0005, 0, 0 );

  //const delta = clock.getDelta();
  //mixer.update( delta );

  if (previousRAF === null) {
    previousRAF = t;
  }

  Step((t - previousRAF) * 0.001);
  previousRAF = t;

  renderer.render( scene, camera );

}
function updateUvTransform() {

  const texture = plane.material.map;

  if ( texture.matrixAutoUpdate === true ) {

    texture.offset.set( params.offsetX, params.offsetY );
    texture.repeat.set( params.repeatX, params.repeatY );
    texture.center.set( params.centerX, params.centerY );
    texture.rotation = params.rotation; // rotation is around [ 0.5, 0.5 ]

  } else {

    // one way...
    //texture.matrix.setUvTransform( params.offsetX, params.offsetY, params.repeatX, params.repeatY, params.rotation, params.centerX, params.centerY );

    // another way...
    texture.matrix
        .identity()
        .translate( - params.centerX, - params.centerY )
        .rotate( params.rotation )					// I don't understand how rotation can preceed scale, but it seems to be required...
        .scale( params.repeatX, params.repeatY )
        .translate( params.centerX, params.centerY )
        .translate( params.offsetX, params.offsetY );

  }

  renderer.render( scene, camera );

}
function Step(timeElapsed) {
  totalTime += timeElapsed;
  for (let s of shaders) {
    s.uniforms.fogTime.value = totalTime;
  }
}
function addBuilding() {
  // const trunkMat = new THREE.MeshStandardMaterial({color: 0x808080});
  // const leavesMat = new THREE.MeshStandardMaterial({color: 0x80FF80});
  // const trunkGeo = new THREE.BoxGeometry(1, 1, 1);
  // const leavesGeo = new THREE.ConeGeometry(1, 1, 32);

  // trunkMat.onBeforeCompile = ModifyShader;
  // leavesMat.onBeforeCompile = ModifyShader;

  // for (let x = 0; x < 10; ++x) {
  //   for (let y = 0; y < 10; ++y) {
  //     const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  //     const leaves = new THREE.Mesh(leavesGeo, leavesMat);
  //     trunk.scale.set(20, (Math.random() + 1.0) * 100.0, 20);
  //     trunk.position.set(
  //         4000.0 * (Math.random() * 2.0 - 1.0),
  //         trunk.scale.y / 2.0,
  //         4000.0 * (Math.random() * 2.0 - 1.0));

  //     leaves.scale.copy(trunk.scale);
  //     leaves.scale.set(100, trunk.scale.y * 5.0, 100);
  //     leaves.position.set(
  //         trunk.position.x,
  //         leaves.scale.y / 2 + (Math.random() + 1) * 25,
  //         trunk.position.z);

  //         leaves.scale.set(leaves.scale.x * params.scaleNum, leaves.scale.y , leaves.scale.z * params.scaleNum,)
  //         trunk.scale.set(trunk.scale.x * params.scaleNum, trunk.scale.y , trunk.scale.z * params.scaleNum,)
  //     scene.add(trunk);
  //     scene.add(leaves);
  //   }
  // }

  // const monolith = new THREE.Mesh(
  //     new THREE.BoxGeometry(500, 2000, 100),
  //     new THREE.MeshStandardMaterial({color: 0x000000, metalness: 0.9}));
  // monolith.position.set(0, 1000, 5000);
  // monolith.material.onBeforeCompile = ModifyShader;
  // scene.add(monolith);

  const buildGeometry = new THREE.BoxGeometry( 1, 1, 1 );
  geometry.translate( 0, 0.5, 0 );
  buildMaterial = new THREE.MeshPhongMaterial( { color: '#b1b2b2', flatShading: true } );

  for ( let i = 0; i < 100; i ++ ) {

    const build = new THREE.Mesh( buildGeometry, buildMaterial );
    build.position.x = Math.random() * 2000 - 1000;

    build.position.y = 0;
    build.position.z = Math.random() * 2000 - 1000;
    if (build.position.z < 600 && build.position.z > -600 && build.position.x < 600 && build.position.x > -600) continue;
    build.scale.x = 20;
    build.scale.y = Math.random() * 80 + 70;
    build.scale.z = 20;
    build.updateMatrix();
    build.matrixAutoUpdate = false;
    build.material.onBeforeCompile = ModifyShader;
    scene.add( build );

  }
}
function ModifyShader(s) {
  shaders.push(s);
  s.uniforms.fogTime = {value: 0.0};
}
export default App;
