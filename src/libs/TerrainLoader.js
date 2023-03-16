/**
 * @author Bjorn Sandvik / http://thematicmapping.org/
 */
import { DefaultLoadingManager } from 'three';

const TerrainLoader = function ( manager ) {

	this.manager = ( manager !== undefined ) ? manager : DefaultLoadingManager;

};

TerrainLoader.prototype = {

	constructor: TerrainLoader,

	load: function ( url, onLoad, onProgress, onError ) {

		var scope = this;
		var request = new XMLHttpRequest();

		if ( onLoad !== undefined ) {

			request.addEventListener( 'load', function ( event ) {

				onLoad( new Int16Array( event.target.response ) );
				scope.manager.itemEnd( url );

			}, false );

		}

		if ( onProgress !== undefined ) {

			request.addEventListener( 'progress', function ( event ) {

				onProgress( event );

			}, false );

		}

		if ( onError !== undefined ) {

			request.addEventListener( 'error', function ( event ) {

				onError( event );

			}, false );

		}

		if ( this.crossOrigin !== undefined ) request.crossOrigin = this.crossOrigin;

		request.open( 'GET', url, true );

		request.responseType = 'arraybuffer';

		request.send( null );

		scope.manager.itemStart( url );

	},

	setCrossOrigin: function ( value ) {

		this.crossOrigin = value;

	}

};

export default TerrainLoader;