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

let container, stats;
let camera, scene, renderer, uniforms, geometry, particleSystem, uniformsSky, resolution, requestAnimationFrameTimer, mixer, clock, plane, params;
const particles = 10000;
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
        float t = time * 1.9 * spd;
        vec2 sc = ro.xz + rd.xz*((1.)*50.0-ro.y)/rd.y;
        vec2 p = 0.1*sc;
        float f = 0.0;
        float s = 0.5;
        float sum =0.;
        for(int i=0;i<2;i++){
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
    vec3 Dir = normalize( vec3(0.5,0.3,0.0) );

    //float dProd = dot( vNormal, light ) * 0.5 + 0.5;
    //float speed      = 1.0;
    //vec4 tcolor = texture2D( colorTexture, vUv );
    //vec4 gray = vec4( vec3( tcolor.r * 0.3 + tcolor.g * 0.59 + tcolor.b * 0.11 ) + (time*(speed/30.)), 1.0 );
    col = vec3(0.2,0.5,0.85)*1.0 - _fposition.y*_fposition.y;
    col = Cloud(col,ro,_fposition,vec3(1.0,1.0,1.0),1.);

    float sundot = clamp(dot(_fposition,Dir),0.0,1.0);
    col += 0.25*vec3(1.0,0.7,0.4)*pow( sundot,5.0 );
    col += 0.25*vec3(1.0,0.8,0.6)*pow( sundot,64.0 );
    col += 0.4*vec3(1.0,0.8,0.6)*pow( sundot,512.0 );

    col = mix( col, 0.68*vec3(0.4,0.65,1.0), pow( 1.0-max(_fposition.y,0.0), 12.0 ) );
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


function App() {
  const renderRef  = useRef()

  

  useEffect(() => {
    let _renderRefC
    if (renderRef && renderRef.current) {
      
      init(renderRef).then( animate )

      _renderRefC = renderRef.current
   
    }
    return () => {
      requestAnimationFrameTimer && cancelAnimationFrame(requestAnimationFrameTimer);
      renderer.dispose()
      _renderRefC.removeChild(_renderRefC.firstElementChild)
    };
 
  }, [renderRef]);


  return (
    <div className="App">
      <div ref={renderRef}></div>
    </div>
  );
}

async function init(renderRef) {

  const { innerWidth, innerHeight } = window;
  console.log(renderRef)
  container = document.createElement( 'div' );
  renderRef.current.appendChild( container );

  clock = new THREE.Clock();

  // SCENE

  scene = new THREE.Scene();
  // scene.background = new THREE.Color( 0xcccccc );
  // scene.fog = new THREE.FogExp2( 0xcccccc, 0.0002 );
  // CAMERA

  camera = new THREE.PerspectiveCamera( 40, innerWidth / innerHeight, 1, 1000000 );
  camera.position.set( 700, 200, - 500 );

  const helperCamera = new THREE.CameraHelper( camera );
  //scene.add( helperCamera );


  params = {
    intensity: 1,
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
    scaleNum: 0.2
  };
  const colorFormats = {
    planeColor: '#ffffff',
    int: 0xffffff,
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
  light.position.x = 300;
  light.position.y = 250;
  light.position.z = - 500;
  console.log('light', light);
  scene.add( light );

  const Ambientlight = new THREE.AmbientLight( 0x404040, params.AmbientlightIntensity  ); // soft white light
  scene.add( Ambientlight );

  const helper = new THREE.DirectionalLightHelper( light, 5 );
  scene.add( helper );

  const size = 8000;
  const divisions = 100;

  const gridHelper = new THREE.GridHelper( size, divisions );
  scene.add( gridHelper );

  uniformsSky = {
    time: { value: 1.0 },
    'colorTexture': { value: new THREE.TextureLoader().load( 'textures/water.jpg' ) },
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
  // controls.maxPolarAngle = 0.9 * Math.PI / 2;
  // controls.enableZoom = false;

  // STATS

  stats = new Stats();
  container.appendChild( stats.dom );

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
  scene.add( plane );

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath( 'draco/gltf/' );

  const glftloader = new GLTFLoader();
  glftloader.setDRACOLoader( dracoLoader );
  const LittlestTokyoObject = await glftloader.loadAsync( 'models/LittlestTokyoLiner.glb')
  console.log('LittlestTokyoObject', LittlestTokyoObject)
  LittlestTokyoObject.scene.scale.set(params.scaleNum,params.scaleNum,params.scaleNum)
  // LittlestTokyoObject.scene.traverseVisible((obj) => {
  //   if(obj.isMesh) {
  //     console.log('obj', obj)
  //     if (obj.material.map) {
  //       obj.material.map.encoding = THREE.LinearEncoding 
  //       obj.material.needsUpdate = true;
  //     }

  //   }
  // })
 
  // LittlestTokyoObject.scene.material.map.encoding = THREE.sRGBEncoding;
  // LittlestTokyoObject.scene.material.needsUpdate = true;
  scene.add( LittlestTokyoObject.scene);
  // mixer = new THREE.AnimationMixer( LittlestTokyoObject.scene );
	// mixer.clipAction( LittlestTokyoObject.animations[ 0 ] ).play();
  //

  window.addEventListener( 'resize', onWindowResize );


  const gui = new GUI();

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
  gui.add( params, 'scaleNum', 0, 1 ).step( 0.1 ).name( 'scaleNum' ).onChange( function ( value ) {

    LittlestTokyoObject.scene.scale.set(value,value,value)

  } );
  
  gui.add( params, 'offsetX', 0.0, 100.0 ).step( 1.0 ).name( 'offset.x' ).onChange( updateUvTransform );
  gui.add( params, 'offsetY', 0.0, 100.0 ).step( 1.0 ).name( 'offset.y' ).onChange( updateUvTransform );
  gui.add( params, 'repeatX', 0.25, 100.0 ).step( 1.0 ).name( 'repeat.x' ).onChange( updateUvTransform );
  gui.add( params, 'repeatY', 0.25, 200.0 ).step( 1.0 ).name( 'repeat.y' ).onChange( updateUvTransform );
  gui.add( params, 'rotation', - 2.0, 2.0 ).step( 0.1 ).name( 'rotation' ).onChange( updateUvTransform );
  gui.add( params, 'centerX', 0.0, 100.0 ).step( 1.0 ).name( 'center.x' ).onChange( updateUvTransform );
  gui.add( params, 'centerY', 0.0, 100.0 ).step( 1.0 ).name( 'center.y' ).onChange( updateUvTransform );

  gui.addColor( colorFormats, 'planeColor' ).onChange( function ( value ) {

    material.color = new THREE.Color(value)

  } );
}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function animate() {

  requestAnimationFrameTimer = requestAnimationFrame( animate );

  //nodeFrame.update();

  render();

  stats.update();

}

function render() {

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
export default App;
