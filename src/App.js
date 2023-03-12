import logo from './logo.svg';
import React, { useRef, useEffect } from 'react'
import './App.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';

let container, stats;
let camera, scene, renderer, uniforms, geometry, particleSystem, uniformsSky, resolution, requestAnimationFrameTimer;
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

  // CAMERA

  camera = new THREE.PerspectiveCamera( 40, innerWidth / innerHeight, 1, 1000000 );
  camera.position.set( 700, 200, - 500 );

  // SCENE

  scene = new THREE.Scene();

  resolution = new THREE.Vector3( window.innerWidth, window.innerHeight, window.devicePixelRatio );

  // shader
  uniforms = {

    pointTexture: { value: new THREE.TextureLoader().load( 'textures/spark1.png' ) }

  };

  // LIGHTS

  const light = new THREE.DirectionalLight( 0xaabbff, 0.3 );
  light.position.x = 300;
  light.position.y = 250;
  light.position.z = - 500;
  console.log('light', light);
  scene.add( light );

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




  // scene.add( particleSystem );
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

  stats = new Stats();
  container.appendChild( stats.dom );

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
  renderer.render( scene, camera );

}
export default App;
