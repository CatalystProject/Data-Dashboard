<!--
This file contains the static content and landing page of the Tiree Energy Pulse (data Dashboard) application.
In addition, it contains the code used to connect to a database to log page loads. If enabled, this code 
(if database exists) will assign a unique ID to each user (stored in cookie).

Author : Catalyst Project (Peter Newman)
-->

<?php
	$enable_logging = false;
		
	//[CHANGE]
	$db_user = "";
	$db_pass = "";
	$db_name = "";

	error_reporting(E_ERROR | E_PARSE);
	$uuid = Null;	
	//connect to mysql db
	$connectionFailed = false;
	
	if ( $enable_logging ){	
		//[CHANGE]
		$connection = mysql_connect('localhost',$db_user, $db_pass);
		//check if connection made
		if ( !$connection )
			$connectionFailed = true;
			
		//connect to db
		if ( !$connectionFailed ){
			//[CHANGE]
			$selectedDB = mysql_select_db( $db_name, $connection);
			//check if connected to db
			if ( !$selectedDB )
				$connectionFailed = true;
		}
			
		$selected_weather = "";
		if ( $connectionFailed == false ){	
			//check if cookie exists on user machine - if so, update visit count,
			$developer = false;
			if ( isset($_COOKIE['user_id'])){
				$uuid = $_COOKIE['user_id'];
				
				$result = mysql_query( "SELECT user_id, developer FROM users WHERE user_id='" . $uuid . "'" ) or 
					die(mysql_error());
					
				//check that the user exists (if not, add)
				if ( mysql_num_rows( $result ) < 1 ){
					//create new user in the db
					mysql_query( "INSERT INTO users (user_id) VALUES('" . $uuid . "')" ) or 
						die(mysql_error());
				}
				else{
					//check if user is developer
					while($row = mysql_fetch_array( $result )) {				
						if ( $row['developer'] == "1" ){
							$developer = true;								
						}
					}		
				}		
			}
			else{
				//set id of user to be a unique ID
				$uuid = uniqid();
				setcookie( "user_id", $uuid, time() + 86400 * 365 * 2 );
				
				//create new user in the db
				mysql_query( "INSERT INTO users (user_id) VALUES('" . $uuid . "')" ) or 
					die(mysql_error());
			}
			
		}
		//get the previously selected weather from the cookie (if it exists)
		if ( !isset( $_COOKIE['weather_set'])){
			setcookie( 'weather_set', 'rain', time() + 86400 * 365 * 2 );		
		}
		$selected_weather = $_COOKIE['weather_set'];
		
		//create new log entry - if the user is not a developer
		if ( !$developer ){	
			$login_id = uniqid();
			//create new login entry
			mysql_query( "INSERT INTO user_logins (login_id, user_id) VALUES('" . $login_id . "', '" . $uuid . "' )" ) or 
				die(mysql_error());
		}
	}
?>
<html lang="en-US">
	<head>			
		<meta name="viewport" content="width=device-width" />		
		<link href='http://fonts.googleapis.com/css?family=Lato' rel='stylesheet' type='text/css'>
		<link rel='stylesheet' id='dashboard-main-css'  href='css/main.css' type='text/css' media='all'/>
		<link rel='stylesheet' id='dashboard-large-css'  href='css/large.css' type='text/css' media='only screen and (min-width:401px)'/>
		<link rel='stylesheet' id='dashboard-mobile-css'  href='css/mobile.css' type='text/css' media='only screen and (max-width:400px)'/>
		<script type="text/javascript" src='js/jquery-1.11.1.min.js'></script>		
		
		<script type="text/javascript" src="https://www.google.com/jsapi"></script>
		<script type="text/javascript">
			google.load("visualization", "1", {packages:["corechart"]});
		</script>
			
		<script type='text/javascript' src='js/raphael-min.js'></script>		
		<script type='text/javascript' src='js/raphael-svg-import.min.js'></script>
		<!--Raphael chart stuff-->
		<!--
		<script type='text/javascript' src='js/g.raphael-min.js'></script>		
		<script type='text/javascript' src='js/g.line-min.js'></script>
		-->	
		<script type='text/javascript' src='js/core.js'></script>
		<title>Data Dashboard</title>		
	</head>
	<body>
		<div id="content">
			<div id="banner">
				<div class="title float-left">
					24 Hour Forecast
				</div>	
				<div id="ocelot" class="drawingCanvas float-right">
				</div>
				<div class="clear"></div>
			</div>	
			<div id="day-canvas" class="drawingCanvas">					
				<div class="radio-panel">
				
					<?php
						$checked = 'checked="checked" />';
						//check for rain
						if ($selected_weather == "rain")
							echo '<input type="radio" id="weather-rain" name="weather" value="rain"' . $checked;
						else
							echo '<input type="radio" id="weather-rain" name="weather" value="rain" />';
						echo '<label for="weather-rain">Rain</label>';
						
						if ($selected_weather == "tempc")
							echo '<input type="radio" id="weather-temp" name="weather" value="tempc"' . $checked;
						else
							echo '<input type="radio" id="weather-temp" name="weather" value="tempc" />';
						echo '<label for="weather-temp">Temp (C)</label>';
						
						if ($selected_weather == "wind")
							echo '<input type="radio" id="weather-wind" name="weather" value="wind"' . $checked;
						else
							echo '<input type="radio" id="weather-wind" name="weather" value="wind" />';
						echo '<label for="weather-wind">Wind</label>';
						
						
					?>
				</div>
			</div>
			<div class="title">
				Week Renewable Forecast
			</div>	
			<!--Place in which all drawing canvas' live-->
			<div id="canvas" class="drawingCanvas">		
			</div>
			<div id="id-bar">
				<?php
					echo "User ID : " . $uuid;
				?>			
			</div>
		</div>
	</body>
</html>