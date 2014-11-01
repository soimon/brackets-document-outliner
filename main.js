/*jslint white: true, vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, Mustache, document */

/**
 * DOCUMENT OUTLINER
 * @author soimon
 * http://www.soimon.com/
 *
 * Shows the outline of the currently selected HTML5 document.
 */

define( function( require, exports, module )
{
	'use strict';
	
	var NAME			= "soimon.DocumentOutliner",
		TOGGLE_ENABLE	= NAME + ".showOutline",
		MENU_NAME		= "Show Document Outline";
	
	// Get dependencies
	
	var CommandManager		= brackets.getModule( "command/CommandManager" ),
		Menus				= brackets.getModule( "command/Menus" ),
		DocumentManager		= brackets.getModule( "document/DocumentManager" ),
		PanelManager		= brackets.getModule( "view/PanelManager" ),
		ExtensionUtils		= brackets.getModule( "utils/ExtensionUtils" ),
		PreferencesManager	= brackets.getModule( "preferences/PreferencesManager" ),
		EditorManager		= brackets.getModule( "editor/EditorManager" );
	
	var panelTemplate		= require( "text!htmlContent/panel.html" ),
		resultsTemplate		= require( "text!htmlContent/results.html" );
	
	var outline				= require( "h5o" ).outline;
	var getHeadingText		= require( "h5o" ).getHeadingText;
	var preferences			= PreferencesManager.getExtensionPrefs( NAME );
	
	preferences.definePreference( "enabled", " boolean", "true" );
	ExtensionUtils.loadStyleSheet( module, "outliner.css" );
	
	// Properties
	
	var _empty			= /^\s*$/,
		_bodyOpen		= /<body/i,
		_bodyClose		= /<\/\s*body/i,
		_isHTMLDocument = false;
	var $panel			= $( panelTemplate ),
		$content		= $panel.children( ":last" ),
		$selectedRow	= null;
	var panel			= PanelManager.createBottomPanel( NAME + ".panel", $panel, 100 ),
		enabled			= preferences.get( "enabled" );
	
	/**
	 * jQuery extensions by stackoverflow user nickf as asnwered on the question below.
	 * http://stackoverflow.com/questions/322912/jquery-to-find-all-previous-elements-that-match-an-expression
	 */
	
	$.fn.reverse = function( )
	{
		return this.pushStack( this.get( ).reverse( ), arguments );
	};
	$.each( ['prev', 'next'], function( unusedIndex, name )
	{
		$.fn[ name + 'ALL' ] = function( matchExpr )
		{
			// Get all the elements in the body, including the body.
			var $all = $( this ).closest( "body" ).find( '*' ).andSelf( );
	
			// Slice the $all object according to which way we're looking
			
			$all = ( name === 'prev' )
				 ? $all.slice( 0, $all.index( this ) ).reverse( )
				 : $all.slice( $all.index( this ) + 1 )
			;
			
			// Filter the matches if specified
			
			if ( matchExpr ) { $all = $all.filter( matchExpr ); }
			return $all;
		};
	} );
	
	/**
	 * Judge whether this document is an html document
	 */
	
	function judgeDocument( )
	{
		var currentDoc = DocumentManager.getCurrentDocument( );
		_isHTMLDocument = currentDoc ? currentDoc.language._mode.indexOf( "html" ) !== -1 : false;
	}
	
	/**
	 * Gets called when a section gets selected in the panel
	 */
	
	function onSelect( e )
	{
		// Deselect the previous selection
		
		if( $selectedRow )
		{
			$selectedRow.removeClass( "selected" );
		}
		
		// Retrieve the selection
		
		$selectedRow = $( e.target ).closest( "tr" ).addClass( "selected" );
		var line = $selectedRow.attr( "data-line" );
		var collumn = $selectedRow.attr( "data-collumn" );
		
		// Set the focus
		
		var editor = EditorManager.getCurrentFullEditor( );
		editor.setCursorPos( line - 1, collumn - 1, true );
		EditorManager.focusEditor( );
	}
	
	/**
	 * Process the hierarchy down to a flat list of table rows
	 */
	
	function process( value, prefix, number, level, input, output )
	{
		// Fetch the basic information
		
		var name = getHeadingText( value.heading );
		var nodeName = value.startingNode.nodeName;
	
		// Find out where in the document this section starts
		
		var countBefore = $( value.startingNode ).prevALL( nodeName ).length;
		var i, position = 0,
			queryLength = ("<" + nodeName).length,
			reg = new RegExp( "<" + nodeName, "gi" );
		
		for( i = 0; i <= countBefore; i ++ )
		{
			position += input.substr( position + ( i === 0 ? 0 : queryLength ) ).search( reg ) + ( i === 0 ? 0 : queryLength );
		}
		
		var before = input.substr( 0, position );
		var newlines = before.match( /\n/g );
		var line = newlines ? newlines.length + 1 : 1;
		var collumn = position - before.lastIndexOf( "\n" );
		
		// Add to the output and process child sections
		
		output.push( { no: prefix + number, name: name, level: Math.max( 0, ( level - 1 ) ) * 25, line: line, collumn: collumn, isChild: level ++ !== 0 } );
		$.each( value.sections, function( k, v ) { process( v, prefix + number + ".", k + 1, level, input, output ); } );
	}
	
	/**
	 * Refreshes the document outline
	 */
	
	function refresh( )
	{
		var input = DocumentManager.getCurrentDocument( ).getText( );
		
		// Strip the comments from the input
		
		var start;
		while( ( start = input.search( "<!--" ) ) !== -1 )
		{
			var length = input.substr( start ).search( "-->" ) + 3;
			input = input.substr( 0, start ) + ( new Array( length + 1 ).join( " " ) ) + input.substr( start + length );
		}
		
		// Get the body of the document
		var body = _bodyOpen.test( input ) ? "<body" + input.split( _bodyOpen )[1].split( _bodyClose )[0] + "</body>" : input;
		
		// Inject this body inside a new HTML document
		
		var doc = document.implementation.createHTMLDocument( "Outline" );
		doc.write( body );
		
		// Run the outliner
		var sections = outline( doc.body ).sections;
		
		// Display the result in the panel		
		
		var output = [];
		$.each( sections, function( k, v ) { process( v, "", k + 1, 0, input, output ); } );
		$content.html( Mustache.render( resultsTemplate, { list: output } ) ).scrollTop( 0 ).on( "click", onSelect );
	}
	
	/**
	 * Gets called when another document has become active
	 */
	
	function onDocumentChanged( )
	{
		judgeDocument( );
		if( _isHTMLDocument )
		{
			panel.show( );
			refresh( );
		} else
		{
			panel.hide( );
		}
	}
	
	/**
	 * Gets called when the document is saved
	 */
	
	function onDocumentSaved( e, document )
	{
		if( _isHTMLDocument && document === DocumentManager.getCurrentDocument( ) ) {
			refresh( );
		}
	}
	
	/**
     * Update DocumentManager listeners
     */
	
    function updateListeners( )
	{
        if( enabled )
		{
            $( DocumentManager )
				.on( "currentDocumentChange.outliner", onDocumentChanged )
				.on( "documentSaved.outliner documentRefreshed.outliner", onDocumentSaved );
        }
		else
		{
            $( DocumentManager ).off( ".outliner" );
        }
    }
	
	/**
	 * Enables the document outliner
	 */
	
	function enable( )
	{
		judgeDocument( );
		if( _isHTMLDocument )
		{
			refresh( );
			panel.show( );
		}
		enabled = true;
		preferences.set( "enabled", true );
		updateListeners( );
		CommandManager.get( TOGGLE_ENABLE ).setChecked( true );
	}
	
	/**
	 * Disables the document outliner
	 */
	
	function disable( )
	{
		panel.hide( );
		enabled = false;
		preferences.set( "enabled", false );
		updateListeners( );
		CommandManager.get( TOGGLE_ENABLE ).setChecked( false );
	}
	
	/**
	 * Toggles the state of the panel
	 */
	
	function toggle( )
	{
		if( enabled )
		{
			disable( );
		}
		else
		{
			enable( );
		}
	}
	
	// Register the command and add it to the menu

	CommandManager.register( MENU_NAME, TOGGLE_ENABLE, toggle );
	var menu = Menus.getMenu( Menus.AppMenuBar.VIEW_MENU );
	menu.addMenuItem( TOGGLE_ENABLE );
	
	// Close button
	$( ".close", $panel ).click( function( ) { disable( ); } );
	
	// Enable the panel
	
	if( enabled )
	{
		enable( );
	}
	
} );