import logo from './logo.svg';
import './App.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let container, stats;
let camera, scene, renderer, uniforms, geometry, particleSystem, uniformsSky, resolution;
const particles = 10000;
const vertexshaderSky = `
  varying vec2 vUv;
  varying vec3 vNormal;
  // varying vec3 fposition;

  void main()	{

    vUv = uv;
    vNormal = normal;
    // gl_Position = vec4( position, 1.0 );

    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

  }
`
const fragmentshaderSky = `
  varying vec2 vUv;
  varying vec3 vNormal;
  // varying vec3 fposition;

  uniform float time;
  uniform vec3 color;
  uniform sampler2D colorTexture;

  vec3 redColor = vec3(1,.5,0);
  vec3 blueColor = vec3(0,0,1);

  const mat2 m2 = mat2( 0.60, -0.80, 0.80, 0.60 );

  void main()	{

    vec3 light = vec3( 0.5, 0.2, 1.0 );
    light = normalize( light );

    float dProd = dot( vNormal, light ) * 0.5 + 0.5;
    float speed      = 1.0;
    vec4 tcolor = texture2D( colorTexture, vUv );
    vec4 gray = vec4( vec3( tcolor.r * 0.3 + tcolor.g * 0.59 + tcolor.b * 0.11 ) + (time*(speed/30.)), 1.0 );

    gl_FragColor = gray * vec4( vec3( dProd ) * vec3( color ), 1.0 );

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
init().then( animate );

function App() {
  return (
    <div className="App">
      
    </div>
  );
}

async function init() {

  const { innerWidth, innerHeight } = window;

  container = document.createElement( 'div' );
  document.body.appendChild( container );

  // CAMERA

  camera = new THREE.PerspectiveCamera( 40, innerWidth / innerHeight, 1, 1000000 );
  camera.position.set( 700, 200, - 500 );

  // SCENE

  scene = new THREE.Scene();

  resolution = new THREE.Vector3( window.innerWidth, window.innerHeight, window.devicePixelRatio );

  // shader
  uniforms = {

    pointTexture: { value: new THREE.TextureLoader().load( 'textures/sprites/spark1.png' ) }

  };
  uniformsSky = {
    time: { value: 1.0 },
    'colorTexture': { value: new THREE.TextureLoader().load( 'textures/water.jpg' ) },
    'color': { value: new THREE.Color( 0xff2200 ) },
    iResolution: { value: resolution },
  };
  // const shaderMaterial = new THREE.ShaderMaterial( {
  uniformsSky[ 'colorTexture' ].value.wrapS = uniformsSky[ 'colorTexture' ].value.wrapT = THREE.RepeatWrapping;


  // } );

  // LIGHTS

  const light = new THREE.DirectionalLight( 0x00BFFF, 0.3 );
  light.position.x = 300;
  light.position.y = 250;
  light.position.z = - 500;
  scene.add( light );

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
  // RENDERER

  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( innerWidth, innerHeight );
  container.appendChild( renderer.domElement );
  renderer.outputEncoding = THREE.sRGBEncoding;

  // CONTROLS

  const controls = new OrbitControls( camera, renderer.domElement );
  controls.maxPolarAngle = 0.9 * Math.PI / 2;
  // controls.enableZoom = false;

  // STATS

  //stats = new Stats();
  //container.appendChild( stats.dom );

  // MODEL

  const loader = new THREE.ObjectLoader();
  const object = await loader.loadAsync( 'lightmap/lightmap.json' );
  scene.add( object );

  //

  window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function animate() {

  requestAnimationFrame( animate );

  //nodeFrame.update();

  render();

  //stats.update();

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
  renderer.render( scene, camera );

}
export default App;
