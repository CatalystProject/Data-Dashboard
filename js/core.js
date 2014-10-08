/*
This file contains the asynchronous calls to the MET office API and other functions required to 
draw the various charts and figures used by the Tiree Energy Pulse. 

Author : Catalyst Project (Peter Newman)

Functions : 
-------------------------------
updateDisplay()
initAllCanvases()
initHeaderInformation( data )
getHeaderField( propertyName )
drawTodayChart( json, currentDate )
drawGoogleChart( divID, date, xAxis, seriesA, seriesB )
drawAvatar()
avatarBlink()
avatarColour( tilleyValue )
openEyes()
closeEyes()
changeEmotion( emotion )
getNextFiveDays()
drawAll()
drawPeriod( canvas, datePeriod, offsetY, maxXvalue, dayJson )
drawPercent(canvas, offsetY, percent)
drawWeather( canvas, offsetY, iconPath)
drawBar( canvas, offsetY, maxXvalue, percent )
clearMessages()
RGBtoHEX(color) (UNUSED)
HSVtoRGB(h, s, v) (UNUSED)
*/
//CONSTANTS
var BAR_TEXT_HEIGHT = 25;
var BOX_HEIGHT = 40;
var BOX_PADDING = 10;
var BAR_HEIGHT = 50;
var FONT_SIZE = 20;
var FONT_SIZE_SML = 15;
var FONT_SIZE_LRG = 30;
var BAR_GAP = 10;
var TILLEY_MAX = 910;
var DAYS = 5;

//timers 
var messageCloseTimer;
var avatarBlinkTimer;
//header hashmap (defined from json
var headerFields = [];

var clickBoxes = [];
//emotions hashmap
var emotions = {
	CONTENT: 0,
	ANGRY: 1,
	HUNGRY: 2,
	SAD: 3,
	AMBIV: 4,
	HAPPY: 5
};

var weatherVars = {
	"rain": "Pp",
	"tempc":"T",
	"wind": "S"
}

//'struct' of weather types and ranges (for google chart axis).
var titleVars = {
	"Pp": [ 0, 100, "Chance of rain (%)", "#0080FF"],	
	"T": [ 0, 30, "Temperature (C)", "red"],
	"S": [ 0, 50, "Wind speed (Mph)", "#82FA58"]
}

//Weather types as text (Not used)
var weatherTypes = ["Clear night", "Sunny day", "Partly cloudy (night)", "Partly Cloudy (day)", "-", "Mist", "Fog", "Cloudy", "Overcast", "Light rain shower (night)", "Light rain shower (day)", "Drizzle", "Light rain", "Heavy rain shower (night)", "Heavy rain shower (day)", "Heavy rain", "Sleet shower (night)", "Sleet shower (day)", "Sleet", "Hail shower (night)", "Hail shower (day)", "Hail", "Light snow shower (night)", "Light snow shower (day)", "Light snow", "Heavy snow shower (night)", "Heavy snow shower (day)", "Heavy snow", "Thunder shower (night)", "Thunder shower (day)", "Thunder"];

//Weather icons (for week prediction). We don't have enough, so many will share
var weatherIcons = ["1.png", "1.png", "7.png", "7.png", "7.png", "7.png", "7.png", "7.png", "7.png", "10.png", "10.png", "10.png", "10.png", "14.png", "14.png", "14.png", "20.png", "20.png", "20.png", "20.png", "20.png", "20.png", "23.png", "23.png", "23.png", "26.png", "26.png", "26.png", "30.png", "30.png", "30.png"];

//power curve for turbine
var e44Curve = [0, 0, 4, 20, 50, 96, 156, 238, 340, 466, 600, 710, 790, 850, 880, 905, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910];
var currentEmotion = emotions.CONTENT;

//arrays for human readable moths and days.
var month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var day = [ "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" ];
var currentWeatherKey = "Pp";

//canvas for each day
var dayPage = {};

var jsonData = null;

var avatar = null;
//avatars face
var face = null;
var blades = null;
var eyes = null;
//when .close element is clicked, any message open will be closed.
$(document).on( "mousedown", ".close", function(){
	clearMessages();
});

$(document).ready(function(){
	//create drawing divs etc
	//get value of checked radio box
	var currentlySelected = $("input[name=weather]:checked").val();
	
	if ( currentlySelected === "undefined" || currentlySelected == null)
		currentlySelected = "rain";
	currentWeatherKey = weatherVars[currentlySelected];
	
	initAllCanvases( false );	
	//get data for next week/time period	
	getNextFiveDays();	
	
	//create listener for radio button - when clicked, redraw google chart
	$("input[name=weather]:radio").change( function(){
		document.cookie = "weather_set=" + $(this).val() +";";
		var weatherKey = weatherVars[$(this).val()];
		currentWeatherKey = weatherKey;
		//now, redraw charts with this as day 1.		
		var days = jsonData.SiteRep.DV.Location.Period;
		drawTodayChart( 'canvas-0', [days[0], days[1]], new Date() );
	});
	
	//update hourly (if page is still on (and not screen clicked)
	var refreshTime =  (1000 * 60) * 60;
	//start timer for ocelot avatar to blink.
	//setInterval(function(){avatarBlink()},4000);
	setInterval(function(){updateDisplay()},refreshTime);
});

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function refreshes all drawing canvases and charts drawn in the app (and clears their current content.
*/
function updateDisplay(){
	width = $(this).width();
	for ( var i = 1; i < DAYS; i++ ){
		dayPage[i].clear();
	}
		
	//clear all drawing panes etc
	//blades.hide();
	face.hide();
	avatar.clear();
	//$( "#canvas" ).empty();
	$( "#canvas-0" ).remove();
		
	initAllCanvases( true );
	getNextFiveDays();
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function copes with resize of frame, and refreshes content when change has been detected
*/
var width = $(window).width();
$(window).resize( function(){
	//if size is different from last size, redraw display
	if($(this).width() != width){
		updateDisplay();
	}
});

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function initialises all of the drawing canvas divs, and attaches raphael canvas elements to each
*/
function initAllCanvases( isRefresh ){
	//initialise other 4 canvas (1 for each day)	
	$("#day-canvas").prepend("<div id='canvas-" + 0 + "' class='sub_canvas'></div>");
	
	if ( !isRefresh){
		for ( var i = 1; i < DAYS; i++ ){
			//append new div to canvas
			$("#canvas").append("<div id='canvas-" + i + "' class='sub_canvas'></div>");
			dayPage[i] = Raphael(document.getElementById("canvas-" + i), "100%", 120 );
		}		
	}

	
	drawAvatar();
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function gets the keys for each weather type, and get's their unit of measurement (i.e. Mph etc)
@param : data - JSon object returned from datapoint
*/
function initHeaderInformation( data ){
	var headerParams = data.SiteRep.Wx.Param;
	//iterate through each header and store
	for ( var i = 0; i < headerParams.length; i++){
		headerFields.push( { "hr_name" : headerParams[i].$, "name" : headerParams[i].name, "units" : headerParams[i].units } );	
	}
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function returns the human readable version of the weather type heading
@param : propertyName - the string name of the property (key) to get
*/
function getHeaderField( propertyName ){
	for ( var i = 0; i < headerFields.length; i++){
		if ( headerFields[i].name == propertyName )
			return headerFields[i];		
	}
}

function drawSunRiseOverlay(){
	//get sunrise/set forecast for next 5 days (including today), and then add a box to the following days.	
	$.ajax({
		url: "tep_stub.php?func=get_all_sun_hours",
		context: document.body
	}).done(function( data  ) {		
		//assume the message is correctly formatted as json...
		var json = jQuery.parseJSON(data);
		
		//loop through each date (ignore first date for now
		var count = -1;
		for ( var date in  json ){
			//ignore first date for now... (google chart overlay)
			count++;
			if (count == 0 )
				continue;
		
			//go through each date element and place the sunrise/sunset times on the bars
			var sunrise = json[date]['sunrise'];
			var sunset = json[date]['sunset'];
			
			//trim seconds (too accurate)
			sunrise = sunrise.substring(0, 5);
			sunset = sunset.substring(0, 5);
			
			//draw control on corresponding bar
			drawTimes(dayPage[count], FONT_SIZE, sunrise, sunset) ;
			
			//now move click panel to front layer	
			clickBoxes[count].toFront();	
		}		
	})
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function gets all the data points for the current 24 hour period and then draws them via drawGoogleChart()
@param : div - div name to draw to
@param : json - json array of days
@param : currentDate - Date object (date to draw) 
*/
function drawTodayChart( div, json, currentDate ){
	//now, iterate through each data point and place in array for placement
	var dataPointsA = [];
	var dataPointsB = [];
	var xAxis = [];
	//var currentDate = new Date();
	var date = new Date(currentDate);		
		
	//at this point, assume json contains multiple days - keep going until we have 8 data points	
	var finished = false;
	var nextDay = false;
	var dataPoint = 0;
	for ( var day = 0; day < json.length; day++ ){	
		for ( var i = 0; i < json[day].length; i++ ){		
			//ensure we have 8 data points
			if ( xAxis.length >= 8 ){
				finished = true;
				break;
			}
		
			//get hours of day
			var hours = parseInt(json[day][i].$)/60;		
			//get current hours - use this to figure out if an hour is in the present or future
			var currentHours = currentDate.getHours();
			if ( (currentHours - 3) <= hours || nextDay ){
				//create time to display (and x axis)
				date.setHours(hours, 0, 0, 0);
				var dateStr = window.month[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear() + " " + date.getHours() + ":0" + date.getMinutes() + ":00";
				xAxis[dataPoint] = dateStr;
				
				//get first day, and iterate through its data points
				var windSpeed = Math.round(json[day][i].S * 0.44704);
				
				//figure out the percent of energy generated	
				var percent = parseInt(e44Curve[windSpeed]) / TILLEY_MAX * 100;			
				dataPointsA[dataPoint] = percent;		

				var precipitation = json[day][i][currentWeatherKey];
				dataPointsB[dataPoint] = precipitation;	
				
				dataPoint++;
			}
		}			
		nextDay = true;		
		date.setDate(date.getDate()+1);
		//just break for now...
		if ( finished )
			break;
	}
	
	drawGoogleChart( div, currentDate, xAxis, dataPointsA, dataPointsB );		
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function draws the google chart
@param : divID - div to attach to
@param : date - Date object (date to draw) 
@param : xAxis - ( array of dates )
@param : seriesA - data points of first series
@param : seriesB - data points of second series
*/
function drawGoogleChart( divID, date, xAxis, seriesA, seriesB ){
	//create data model for google chart
	var data = new google.visualization.DataTable();
	var pixelWidth = $("#canvas").width();		
	var percentPadding = (pixelWidth / 100) * 20;	
	
	//decide padding of chart depending on size of screen
	if ( pixelWidth < 500 )
		pixelWidth -= percentPadding;
	else
		pixelWidth -= percentPadding / 2;
		
	//place data within DataTable
	var options = {
		width: "100%", 
		height: "100%",
		vAxes: {
			0: {
				
				/*title : "Percent (%)",*/
				titleTextStyle: {
					color: 'orange'
				},
				logScale: false, 
				textStyle:{color: 'orange'}, 
				baselineColor: '#CCCCCC',
				minValue:0,
				maxValue:100,
				
				gridlines: {color: '#ffffff'}
			},
            1: {
				/*title : "Percent (%)",*/
				titleTextStyle: {
					color: titleVars[currentWeatherKey][3]
				},
				logScale: false, 
				textStyle:{color: titleVars[currentWeatherKey][3]}, 
				baselineColor:'#CCCCCC',
				/**/
				minValue: parseInt(titleVars[currentWeatherKey][0]),
				maxValue: parseInt(titleVars[currentWeatherKey][1]),
				
				gridlines: {color: '#ffffff'}
			}
		},	
		hAxes: {
			0 :{
				title:"Time",
				logScale: false,
				textStyle:{color: 'white'},	
				titleTextStyle: {
					color: 'white'
				},			
				gridlines: {color: '#ffffff'}
			}
		},	
		series:{
				0:{
					targetAxisIndex:0,
					color: "orange"
				},
				1:{
					targetAxisIndex:1,					
					color: titleVars[currentWeatherKey][3]
				},
		},
		backgroundColor: { 
			fill:'transparent' 
		}, 
		legend: {
			textStyle: {color: 'white'}
		},
		chartArea:{
			width: pixelWidth,
		},        
		annotations: {
			style: 'line',
			color: '#ffffff',
			textStyle:{
				color: '#ffffff',
				fontSize: 15
			}, 
		},
	};
	
	//add columns to chart (including the 'now' annotation)
	data.addColumn('datetime', 'Time');
    data.addColumn({type: 'string', role: 'annotation'});
	data.addColumn('number', 'Tilley Yield (%)');	
	data.addColumn('number', titleVars[currentWeatherKey][2]);
		
	//add rows to google chart
	var currentDate = new Date();
	for ( var i = 0; i < seriesA.length; i++ ){
		var dateObj = new Date(xAxis[i]);
		// add data to google chart
		data.addRow([dateObj, null, parseInt(seriesA[i]), parseInt(seriesB[i])]);
		
		//add annotation (This is only a guess at the estimate and is based on the vector between two points).
		if ( i+1 < xAxis.length ){
			var dateNext = new Date(xAxis[i+1]);
			var currentTime = currentDate.getTime();
			//figure out vector, work out where the time is on that vector, and then create value based on that.				
			if ( dateNext.getTime() > currentDate && dateObj.getTime() < currentDate){
				//get time differences				
				var totalDelta = dateNext.getTime() - dateObj.getTime();
				var pointDelta = currentTime - dateObj.getTime();
				
				//calc percent
				var distancePercent = pointDelta / totalDelta * 100;								
				
				//get points of both time periods
				var curA= parseInt(seriesA[i]);
				var curB = parseInt(seriesB[i]);
				
				var nextA = parseInt(seriesA[i+1]);
				var nextB = parseInt(seriesB[i+1]);
				
				var deltaA = nextA - curA;
				var deltaB = nextB - curB;
				
				var annoA = deltaA / 100 * distancePercent;
				var annoB = deltaB / 100 * distancePercent;
				
				//use curA +annoA to determine the colour of Ocelot
				avatarColour( curA + annoA );
				//animate blade
				//avatarBladeSpeed( curA + annoA );
				
				data.addRow([currentDate, "Now", parseInt(curA + annoA), curB + annoB]);			
			}
		}
	}	
	
	//finally, add google chart to div
	var div = document.getElementById( divID );
	var chart = new google.visualization.AreaChart( div );
	chart.draw( data, options );
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function draws the digital avatar and attaches the click listener 
*/
function drawAvatar(){	
	//clear timer 
	window.clearInterval(avatarBlinkTimer);

	//initialise Ocelot canvas	
	avatar = Raphael(document.getElementById("ocelot"), "100%", "100%");
	
	//avatar.path();
	
	//centre 
	face = avatar.circle(25, 25, 24);
	//draw blades...
	
	//avatar.path("m 47.60062,1044.7156");//m 47.60062,1044.7156 c -17.685633,-15.8122 -18.535322,-10.4911 -18.535322,-10.4911 0,0 -4.190826,3.4552 18.535322,10.4911 z
	
	//avatar.image("assets/stand.png",0,0,50,50);
	
	eyes = avatar.image("assets/eyes-content.png",0,0,50,50);
	//blades = avatar.image("assets/rotar_blade.png",0,0,50,50);
	
	face.attr("fill", "#f36717");	
	changeEmotion( currentEmotion );	
	eyes.click(function(){	
		//append message box to main div
		$("#content").append( "<div id='message_assist' class='message warning'></div>" );	
	
		//now append loading gif
		
		$("#message_assist").append( "<div class='message_title'>\"I'll have a quick think about that...\"</div>" );
		$("#message_assist").append( "<div id='loading_img'><img src='assets/loading.gif' arl='loading'/></div>");
	
	
		//get message and detail from the server.
		$.ajax({
			url: "tep_stub.php?func=ask_ocelot",
			context: document.body
		}).done(function( data  ) {
			//remove loading gif and append remaining content
			$('#message_assist').empty();
		
			//assume the message is correctly formatted as json...
			var json = jQuery.parseJSON(data);
			
			var msg = json['message'];			
			var detail = json['detail'];
			
			var data = json['energy_data'];
			var keys = Object.keys(data);
			//sort array
			keys.sort();
			//now, iterate through each key and get the associated output
			
			//loop through each data point, parse the date, and place in order
			$("#message_assist").append( "<div class='message_title'>\"" + msg + "\"</div>" );
			
			//detail to place times
			$("#message_assist").append( "<div id='message_times' class='message_detail'></div>");
			$("#message_times").append( "The best times to use energy over the next 24 hours are:<br />" );

			for ( var i =0; i < keys.length; i++ ){	
				var output = data[keys[i]];
				var timeParts = keys[i].split("_");
				
				//[0] should be day, whilst [1] should be time
				
				var hour = parseInt(timeParts[1]) / 60;
				var stringTime = hour + ":00" + ((hour < 12) ? "am" : "pm");
				var clarifier = (timeParts[0] == "1") ? " tomorrow": "";
				
				$("#message_times").append( stringTime + clarifier + " - " + parseInt(output) + "%<br />" );
			}
				
			$("#message_assist").append( "<div class='message_detail'>" + detail + "</div><div class='close'>Close X</div>" );
		})
		.fail(function() {
			//state that ocelot cannot be contacted right now...
			$("#content").append( "<div class='message warning'><div class='message_title'>Unable to contact Ocelot - please try again later</div><div class='close'>Close X</div></div>" );
		});
		
		//clear message after 50 seconds (giving the user time to read it)	
		messageCloseTimer = window.setTimeout( "clearMessages()", 50000);
		
	});
	
	//set blink interval of avatar
	avatarBlinkTimer = setInterval(function(){avatarBlink()},4000);	
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function performs the blink animation of the avatar
*/
function avatarBlink(){
	//close eyes
	closeEyes();
	//open eyes in 100ms
	window.setTimeout( "openEyes()", 150);
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function sets the colour of the avatar depends on the value of Tilley
@param : tilleyValue - The value of Tilley (in percent)
*/
function avatarColour( tilleyValue ){
	
	if ( tilleyValue >= 50 ){
		face.animate({ fill : "#4CC417",  stroke: "#000"}, 500);
		//eyes.node.href.baseVal = "assets/eyes-content.png";
		currentEmotion = emotions.HAPPY;
	}
	else if ( tilleyValue > 25 && tilleyValue < 50 ){
		face.animate({ fill : "#f36717",  stroke: "#000"}, 500);
		//eyes.node.href.baseVal = "assets/eyes-content.png";
		currentEmotion = emotions.CONTENT;
	}
	else {		
		face.animate({ fill : "#F70D1A",  stroke: "#000"}, 500);
		//eyes.node.href.baseVal = "assets/eyes-angry.png";
		currentEmotion = emotions.ANGRY;
	}
}

function avatarBladeSpeed( tilleyValue ){
	var bladeSpeed = 101 - tilleyValue;
	
	bladeSpeed *= 60;
		
	if ( bladeSpeed < 1000 )
		bladeSpeed = 1000;

	//var anim = Raphael.animation({transform: "r360"}, bladeSpeed ).repeat(Infinity);
	//blades.animate(anim);
}
/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function swaps the eye image of the avatar for open eyes
*/
function openEyes(){
	eyes.node.href.baseVal = "assets/eyes-content.png";
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function swaps the eye image of the avatar for closed eyes
*/
function closeEyes(){
	eyes.node.href.baseVal = "assets/eyes-closed.png";
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function changes the emotion of the avatar(Not really used...)
@param : emotion - enum of the emotion shown by the avatar
*/
function changeEmotion( emotion ){
	if ( emotion == emotions.HAPPY ){
		face.animate({ fill : "#00ff00",  stroke: "#000"}, 500);
		//eyes.node.href.baseVal = "assets/eyes-content.png";
		currentEmotion = emotions.HAPPY;
	}
	else if ( emotion == emotions.CONTENT ){
		face.animate({ fill : "#f36717",  stroke: "#000"}, 500);
		//eyes.node.href.baseVal = "assets/eyes-content.png";
		currentEmotion = emotions.CONTENT;
	}
	else if ( emotion == emotions.ANGRY ){		
		face.animate({ fill : "#ff0000",  stroke: "#000"}, 500);
		//eyes.node.href.baseVal = "assets/eyes-angry.png";
		currentEmotion = emotions.ANGRY;
	}
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function gets the next 5 days of forecast from Datapoint and then redraws all elements
*/
function getNextFiveDays(){
	//remove any message
	$(".message").remove();

	//make call to service
	$.ajax({
		url: "tep_stub.php?func=get_json_weather_prediction",
		context: document.body
	}).done(function( data  ) {		
		var json = jQuery.parseJSON( data );
		//$("#content").append( "<div class='message warning'>Unable to contact MET office - please try again later</div>" );	
		jsonData = json;
		//first, get header information (units etc)
		initHeaderInformation( json );		
		drawAll();
		
	})
	.fail(function() {
		//at this point, we need to draw a new div that says the app is down and needs to be refreshed		
		$("#content").append( "<div class='message warning'>Unable to contact MET office - please try again later</div>" );
	});
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function draws all of the charts using data stored globally
*/
function drawAll(){
	//get data from global variable
	var data = jsonData;
	
	var currentDate = new Date();
	var days = data.SiteRep.DV.Location.Period;
	var firstDayPeriods = {};
	var firstDayCount = 0;
	for (var i = 0; i < days.length; i++){
		days[i] = days[i].Rep;		
	}	
	
	drawTodayChart( 'canvas-0', [days[0], days[1]], currentDate );

	//draw rest of the week...
	for ( var i = 1; i < 5; i++){
		
		currentDate.setDate(currentDate.getDate() + 1 );
		
		var date = currentDate.getDate();
		var month = currentDate.getMonth();
		var year = currentDate.getFullYear();
		
		//draw next five days of tilley output 
		var dateStr = window.day[currentDate.getDay()] + " - " + date + "/" + (month + 1) + "/" + year;
		
		//get data for period - for now, just random		
		var dayJson = days[i];
		
		
		drawPeriod( dayPage[i], dateStr, 0, TILLEY_MAX, dayJson, i);
		//offsetY +=BAR_TEXT_HEIGHT + BOX_HEIGHT + BAR_GAP;
	}
	
	//finally, draw the sunrise overlays for each canvas
	drawSunRiseOverlay();
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function draws one of the bars (forecast for next 4 days) for the date specified
@param : canvas - The canvas to draw to
@param : datePeriod - String of the date to draw
@param : offsetY - offset to draw the elements at (Unused)
@param : maxXvalue - The maximum value of possible energy generated
@param : dayJson - Json object of the day being drawn
*/
function drawPeriod( canvas, datePeriod, offsetY, maxXvalue, dayJson, periodCount ){
	//using date above, retrieve predicted Tilley output for time period (assume average of wind speed over next hour)
	//draw entire box
	var dateString = datePeriod;
		
	var yDelta = offsetY + (FONT_SIZE/2);
	var barTitle = canvas.text( 5, yDelta, dateString );
	
	var color = $(".sub_canvas").css( "color" );
	var hex = RGBtoHEX(color);
	barTitle.attr({ "font-size": FONT_SIZE, 'text-anchor': 'start', "fill": hex/*,  "stroke": "#BABABA"*/})
	
	//draw out predicted wind speed - and aggregate for day
	var dayAgg = 0;
	var weatherType = -1;
	for (var i = 0; i < dayJson.length; i++){
	
		//convert into m/s
		var windSpeed = Math.round(dayJson[i].S * 0.44704);
		if ( windSpeed > e44Curve.length )
			windSpeed = e44Curve[length-1];	
		
		dayAgg += e44Curve[windSpeed];
	
		//if noon time period, remember the type of weather for the day
		if ( parseInt(dayJson[i].$) == 720 )
			weatherType = parseInt(dayJson[i].W);			
	}
	
	var value = dayAgg/dayJson.length;
	var percent = value/maxXvalue * 100;
	//draw xValue as percentage of bar
	
	drawBar(canvas, datePeriod, FONT_SIZE + BAR_TEXT_HEIGHT, maxXvalue, percent);
	
	var weatherIconPath = weatherIcons[weatherType];
	drawWeather(canvas, FONT_SIZE, weatherIconPath);
	drawPercent(canvas, FONT_SIZE, percent);	
	
	//finally, draw rectangle over area to form click area
	
	var pixelWidth = canvas.canvas.offsetWidth;	
	var pixelHeight = canvas.canvas.offsetHeight;
	var clickBox = canvas.rect(0, 0, pixelWidth, pixelHeight);
	clickBox.attr({fill: "#000000", stroke:"#000000", "fill-opacity": 0.0, "stroke-opacity": 0.0});	
		
	clickBox.node.id = datePeriod;	
	clickBoxes[periodCount] = clickBox; 
	clickBox.click(function () {
        //at this point, create new chart and display in new screen (add close button to the top
		var myself = $(this);
		//append message box to main div
		$("#content").append( "<div id='message_content' class='message content'></div>" );	
	
		//now append loading gif
		
		$("#message_content").append( "<div class='message_title'>\"I'll have a quick think about that...\"</div>" );
		$("#message_content").append( "<div id='loading_img'><img src='assets/loading.gif' arl='loading'/></div>");
	
		$.ajax({
			url: "tep_stub.php?func=get_json_weather_prediction",
			context: document.body
		}).done(function( data  ) {		
			//clear message box
			$("#message_content").empty();
			
			var json = jQuery.parseJSON( data );					
			var name = myself[0].node.id;
			$("#message_content").append( "<div class='message_title'>Here is an hourly breakdown for " + name + ".</div><div class='close'>Close X</div><div id='overlay_chart'></div>" );
			
			var docHeight = $(document).height();			
			$("#message_content").height(docHeight)
			
			//remove name of day 
			var simpleDate = name.split("-");
			
			if ( simpleDate.length > 1 ){
				var simpleName = simpleDate[1].trim();
				
				//set date to the selected chart
				var dateNums = simpleName.split("/");
				var month = parseInt(dateNums[1]) - 1;
				
				if (month < 0 )
					month++;
				var date = new Date(parseInt(dateNums[2]), month, parseInt(dateNums[0]));
				//use the date to create a new date
				
				//(start time at 0:00)
				date.setHours(0, 0, 0, 0);
				
				//compare date now, to date then, and then add the delta
				var currentDate = new Date();
				
				var delta = (date - currentDate);
				//convert millis into days
				delta = Math.ceil((((delta / 1000) / 60) / 60) / 24);
				
				var days = json.SiteRep.DV.Location.Period;
				for (var i = 0; i < days.length; i++){
					days[i] = days[i].Rep;		
				}	
				var day1 = days[0+delta];
				var day2;
				
				if ( delta + 1>  days.length - 1)
					day2 = day1;
				else
					day2 = days[1+delta];
				drawTodayChart( 'overlay_chart', [day1, day2], date );
				
				$('html,body').scrollTop(0);
			}			
		})		
    }); 
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function draws the percentage box on the specified canvas object
@param : canvas - The canvas to draw to
@param : offsetY - offset to draw the elements at (Unused)
@param : percent - String of the percentage
*/
function drawPercent(canvas, offsetY, percent){
	//draw white box around percent of output - draw slightly off centre
	var pixelWidth = $("#canvas").width();	
	var box = canvas.rect(pixelWidth - 90, 5 + offsetY, 80, BOX_HEIGHT, 5);
	box.attr({fill: "#ffffff", stroke:"#BABABA", "fill-opacity": 0.2});	
	
	//draw percentage
	var color = $(".sub_canvas").css( "color" );
	var hex = RGBtoHEX(color);
	var barPercent = canvas.text( pixelWidth - 50, BOX_HEIGHT/1.5  + offsetY, parseInt(percent) + "%" );
	barPercent.attr({ "font-size": FONT_SIZE_LRG, 'text-anchor': 'center', "fill": hex/*,  "stroke": "#BABABA"*/})
}

function drawTimes(canvas, offsetY, sunrise, sunset){

	var pixelWidth = $("#canvas").width();	
	
	//box for sunrise
	var box = canvas.rect(pixelWidth - 260, 5 + offsetY, 160, BOX_HEIGHT, 5);
	box.attr({fill: "#ffffff", stroke:"#BABABA", "fill-opacity": 0.2});	

	//draw titles
	var sunriseText = canvas.text( pixelWidth - 250, (5 + BOX_HEIGHT - FONT_SIZE) + offsetY, "Sunrise : "  );
	sunriseText.attr({ "font-size": FONT_SIZE, 'text-anchor': 'start', "fill": "#ffffff"/*,  "stroke": "#BABABA"*/})
	
	
	var sunriseTime = canvas.text( pixelWidth - 170, (5 + BOX_HEIGHT - FONT_SIZE)  + offsetY, sunrise  );
	sunriseTime.attr({ "font-size": FONT_SIZE, 'text-anchor': 'start', "fill": "#ffffff"/*,  "stroke": "#BABABA"*/})
	
	//box for sunset
	var box2 = canvas.rect(pixelWidth - 260,  BOX_HEIGHT + BOX_PADDING  + offsetY, 160, BOX_HEIGHT, 5);
	box2.attr({fill: "#ffffff", stroke:"#BABABA", "fill-opacity": 0.2});	
	
	var sunsetText = canvas.text( pixelWidth - 250, BOX_HEIGHT + FONT_SIZE + BOX_PADDING  + offsetY, "Sunset : " );
	sunsetText.attr({ "font-size": FONT_SIZE, 'text-anchor': 'start', "fill": "#ffffff"/*,  "stroke": "#BABABA"*/})	
		
	var sunsetTime = canvas.text( pixelWidth - 170, BOX_HEIGHT + FONT_SIZE + BOX_PADDING  + offsetY, sunset );
	sunsetTime.attr({ "font-size": FONT_SIZE, 'text-anchor': 'start', "fill": "#ffffff"/*,  "stroke": "#BABABA"*/})	
	
	//draw smaller text
	
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function draws the weather box on the specified canvas object
@param : canvas - The canvas to draw to
@param : offsetY - offset to draw the elements at (Unused)
@param : iconPath - String of the icon path
*/
function drawWeather( canvas, offsetY, iconPath){
	//draw the weather icon  180px from right side of screen
	var pixelWidth = $("#canvas").width();	
	var box = canvas.rect(pixelWidth - 90, BOX_HEIGHT + BOX_PADDING  + offsetY, 80, BOX_HEIGHT, 5);
	box.attr({fill: "#ffffff", stroke:"#BABABA", "fill-opacity": 0.2});	
	//draw image to supplied canvas
	canvas.image("assets/weather/" + iconPath,pixelWidth - 70 ,BOX_HEIGHT + BOX_PADDING + offsetY ,40,40);
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function draws the bar used to convey percent of Tilley Output
@param : canvas - The canvas to draw to
@param : offsetY - offset to draw the elements at (Unused)
@param : maxXvalue - int value of maximum value (Unused)
@param : percent - int value of percent
*/
function drawBar( canvas, date, offsetY, maxXvalue, percent ){
	//get width of canvas,
	var pixelWidth = $("#canvas").width() / 100 * percent;
	var bar = canvas.rect(0, offsetY, pixelWidth - 1, BAR_HEIGHT);
		
	bar.attr({fill: "orange", stroke: "orange", "fill-opacity": 0.8});		
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function clears all messages currently drawn to the screen
*/
function clearMessages(){
	$(".message").remove();
	
	//clear message timeout
	clearTimeout(messageCloseTimer);
}

/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function converts an RGB colour to a Hex string
@param : color - String of JS color object
*/
function RGBtoHEX(color) {
	return "#"+$.map(color.match(/\b(\d+)\b/g),function(digit){
	return ('0' + parseInt(digit).toString(16)).slice(-2)
	}).join('');
};

/*Thank you Paul S on Stack Overflow!*/
/*
///////////////////////////////////////FUNCTION/////////////////////////////////////////////
This function converts HSV colour to RGB (Unused)
@param : h - Hue of the colour
@param : s - Saturation of the colour
@param : v - Value of the colour
*/
function HSVtoRGB(h, s, v){
    var r, g, b, i, f, p, q, t;
    if (h && s === undefined && v === undefined) {
        s = h.s, v = h.v, h = h.h;
    }
	
	h /= 360;
	s /= 100;
	v /= 100;
	
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
	
    return {
        r: Math.floor(r * 255),
        g: Math.floor(g * 255),
        b: Math.floor(b * 255)
    };
}