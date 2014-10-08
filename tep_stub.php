<?php

/*
This file contains the calls to the MET office API for weather forecasting, and generates JSON messages
that contain this information. In addition, it caches the content received from each of the various
sources so that usage limits are not reached - as such, it should be relatively scalable.

Author : Catalyst Project (Peter Newman)
*/

CONST TILLEY_MAX = 910;
CONST CHORE_SUITABILITY_THRESHOLD = 100;
CONST CACHE_LIFE_SECONDS = 518400;//6 days
$chores = array();
//array containing kW produced by Enercon e44 wind turbine - e.g. at 5 Metres per second, this turbine will produce ~50KW
$e44Curve = array(0, 0, 4, 20, 50, 96, 156, 238, 340, 466, 600, 710, 790, 850, 880, 905, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910, 910);
//[CHANGE]
$api_key = "";
$location_id = "";

$url = "http://datapoint.metoffice.gov.uk/public/data/val/wxfcs/all/json/$location_id?res=3hourly&key=$api_key";
$et_base_url = "http://www.earthtools.org/sun/";
	
//load chores
load_chores();
	
//call function name based on parameter in url supplied
$function_name = $_GET['func'];
if ( function_exists( $function_name )){
	call_user_func($function_name);
}
else{
	//return error to caller
	$params = array( "function" => $function_name );	
	report_error( "Unable to call function.", $params);				
}

/*
This set of classes is used by the digital assistant, which suggests a chore based on a pre-programmed profile - it will then match the profile based on supplied date (e.g. wind speed, 
time etc.).

========================================= [START] Profile Classes =======================================
*/
class Profile {
	public $resource_name = "";
	public $min_value = 25;
	public $max_value = 100;
	
	public function is_match( $value ){		
		if ( $value >= $this->min_value && $value <= $this->max_value)
			return true;
		return false;		
	}
}

class Reading{
	public $resource_name = "";
	public $value = 0;
}

class Chore {
	public $name = "";
	//default values for time
	public $min_hour = 6;
	public $max_hour = 17;
	public $message = "";
	public $profiles = array();
	
	public function is_suitable_time( $hour, $readings){
		//first check that the hour is suitable
		if ( $hour < $this->min_hour || $hour > $this->max_hour ) 
			return 0;
		//count how many matches (more is better)
		$matches = 0;
		//assume readings are all the possible wind speed and rain fall readings for selected time.
		for ( $i = 0; $i < count($readings); $i++){
			if (!array_key_exists($readings[$i]->resource_name, $this->profiles) )
				continue;
			$profile = $this->profiles[$readings[$i]->resource_name];	
			
			if ( $profile->is_match( $readings[$i]->value) )
				$matches++;			
		}
		
		//return match percentage
		return $matches / count($this->profiles) * 100;
	}
}
/*
========================================= [END] Profile Classes =======================================
*/

/*
Function to generate message for ocelot to display - returns a json object containing a message and further details.
*/
function ask_ocelot(){	
	global $url, $e44Curve, $chores;
	//get current hour
	$currentHour = date('H');
	
	//contact datapoint service		
	$response = get_weather_prediction();
	//if failed, return error message
	if ( !$response ){
		$array_args = array('function' => "ask_ocelot" );
		report_error( "Unable to contact MET office.", $array_args);	
	}
	
	//get the next 24 hours - and look for periods of high usage (using energy curve)
	$metJsonMessage = json_decode($response);
	
	//get array of days from json object
	$days = $metJsonMessage->SiteRep->DV->Location->Period;
	
	//get the first 8 periods of data from json object
	$periodCount = 0;
	$minutes = $currentHour * 60;
	$storedPeriods = array();
	for ( $i = 0; $i < count($days); $i++){
		$periods = $days[$i]->Rep;	
		for ( $j = 0; $j < count($periods); $j++){
			//only store time periods after current time
			if ( $i > 0 || ($i == 0 && $periods[$j]->{"$"} > $minutes) ){
				$storedPeriods[$periodCount] = $periods[$j];
				$periodCount++;
				if ( $periodCount == 8 )
					break;
			}
		}		
		if ( $periodCount == 8 )
			break;
	}
	
	$day = 0;
	$lastTime = 0;
	$currentDay = 0;
	//iterate through each data point and figure out best points to do chores
	$most_suitable_chore = NULL;
	$highest_suitability = 0;	
	$highestOutput = 0;
	$best_time = 0;
	
	//store best 3 peaks of energy in this array
	$energy_map = array();
	//shuffle chore order for now - so each time a new chore may be picked
	shuffle ( $chores );
	for( $i = 0;$i < count($storedPeriods); $i++){
		//get windspeed in M/S (from Mph)
		$windSpeed = round(intval($storedPeriods[$i]->S) * 0.44704 );
		if ( $windSpeed > count($e44Curve) )
				$windSpeed = count($e44Curve) - 1;
								
		$output = $e44Curve[$windSpeed];		
		//check which day it is - today or tomorrow?
		$time = $storedPeriods[$i]->{"$"};	
		//package each reading into a reading object
		$readings = array();
		
		$wind_reading = new Reading();
		$wind_reading->resource_name = "S";
		$wind_reading->value = round($output / TILLEY_MAX * 100);
		
		$rain_reading = new Reading();
		$rain_reading->resource_name = "Pp";
		$rain_reading->value =$storedPeriods[$i]->Pp;
				
		$temp_reading = new Reading();
		$temp_reading->resource_name = "T";
		$temp_reading->value =$storedPeriods[$i]->T;
		
		array_push($readings, $wind_reading); 
		array_push($readings, $rain_reading); 				
		array_push($readings, $temp_reading); 
		
		//iterate through each chore, and ask it if the time and readings are suitable
		for ($j = 0; $j < count($chores); $j++){
			$suitability = $chores[$j]->is_suitable_time($time/60, $readings);
			//if chore is suitable, replace details of suggested chore with new one
			if ( $suitability >= CHORE_SUITABILITY_THRESHOLD && $suitability > $highest_suitability ){
				$highest_suitability = $suitability;
				$highestOutput = $output;
				$most_suitable_chore = $chores[$j];
				$best_time= $time/60;
				$day = $currentDay;
			}		
		}
		//if time value from object is lower than last time, new day has started...
		if ( $time < $lastTime )
			$currentDay++;		
						
		//store all peak energy in array
		$energy_map[ $currentDay . '_' . $time] = ($output / TILLEY_MAX * 100);
		
		//set last day to current day
		$lastTime = $time;	
	}
	//first, sort array by value (and time last elements),
	arsort($energy_map);
	$peak_energy = array_slice($energy_map, 0, 3);
	//then, resort array by time (key)
	
	//now, construct a message to return to the caller - most of this code just makes the message human readable.
	$percent = round($highestOutput / TILLEY_MAX * 100);
	$clarifier = ""; 	
	if ( $best_time < 12 )
		$clarifier = "am";
	else
		$clarifier = "pm";
		
	$data = array();
	$data['energy_data'] = $peak_energy;
	
	if ( $most_suitable_chore != NULL ){
		$chore  = $most_suitable_chore->name;
		
		if ( $day == 0 )
			$data['message'] = "I think " . $best_time . ":00$clarifier would be a good time to do some chores (i.e. " . $chore .").";		
		else
			$data['message'] = "I think tomorrow at " . $best_time . ":00$clarifier would be a good time to do some chores (i.e. " . $chore .").";		

		$data['message'] .= " " . $most_suitable_chore->message;
		$data['detail'] = "In the next 24 hours, Tilley is likely to produce up to " . $percent. "% of her maximum output, which means a large proportion of Tiree's energy is renewable - and home-grown.";

	}
	else{		
		$data['message'] = "I couldn't find a good time to do chores today. Maybe try again later?" ;
		$data['detail'] = "In the next 24 hours, Tilley is likely to only produce up to " . $percent. "% of her output.";
	}
	
	//return message as json
	echo json_encode($data);
}

function get_json_weather_prediction(){
	echo get_weather_prediction();
}

//NOT IMPLEMENTED FULLY - MISSING CODE
function get_sun_hours(){
	global $url, $et_base_url;
	
	//TODO GET LAT & LONG
	
	//look for month and day specified
	if ( !isset($_GET['m']) || !isset($_GET['d']) ){
		$array_args = array('function' => "get_sun_hours" );
		report_error( "Both month [m] and day [d] get variables must be set.", $array_args);	
	}
	
	//get month from 
	$month = $_GET['m'];
	$day = $_GET['d'];
	$et_url = $et_base_url . $latitude . "/" . $longitude . "/" . $day . "/" . $month . "/99/1";
		
	//http://www.earthtools.org/sun/<latitude>/<longitude>/<day>/<month>/<timezone>/<dst>
	$cached_sun_hours = get_cache_data($et_url, "et_data" . $day . "-" . $month );
	
	//parse returned xml 
	//	- sun->morning->sunrise && sun->evening->sunset
	$sun= new SimpleXMLElement($cached_sun_hours);
	$sunrise = $sun->morning->sunrise;		
	$sunset = $sun->evening->sunset; 
	
	//place in array
	$data[rtrim($date, 'Z')] = array( 'sunrise' => $sunrise->__toString(), 'sunset' => $sunset->__toString() );

	//DO SOMETHING WITH THIS CODE
}

function get_all_sun_hours(){
	global $url, $et_base_url;
	//array to store returned days
	$data = array();
	
	//get date (either cached or non-cached
	$cached_dp_data = get_cache_data($url, "dp_data");
	$metJsonMessage = json_decode($cached_dp_data);
	
	//first, get lat and long from the datapoint service
	$latitude = $metJsonMessage->SiteRep->DV->Location->lat;
	$longitude = $metJsonMessage->SiteRep->DV->Location->lon;
	
	//get dates needed 
	$days = $metJsonMessage->SiteRep->DV->Location->Period;
	for ($i = 0; $i < count($days); $i++ ){
		$date = $days[$i]->value;
	
		//split the date to extra day and month
		$exploded_date = explode('-', $date);
		//the second and last element will be the dates we want
		$month = $exploded_date[1];
		$day = rtrim($exploded_date[2], 'Z'); ;
		//create a new cache file for each day - and then each day, do another call to get the next one...
		//sleep for 2 seconds to allow time to make next call
		$et_url = $et_base_url . $latitude . "/" . $longitude . "/" . $day . "/" . $month . "/99/1";
				
		//if not cached already, wait for 2 seconds before calling service - limited to 1 call per second
		if ( $i > 0 && !cache_exists("et_data" . $day . "-" . $month))
			sleep(2);			
				
		//http://www.earthtools.org/sun/<latitude>/<longitude>/<day>/<month>/<timezone>/<dst>
		$cached_sun_hours = get_cache_data($et_url, "et_data" . $day . "-" . $month );
		
		//parse returned xml 
		//	- sun->morning->sunrise && sun->evening->sunset
		$sun= new SimpleXMLElement($cached_sun_hours);
		$sunrise = $sun->morning->sunrise;		
		$sunset = $sun->evening->sunset; 
		
		//place in array
		$data[rtrim($date, 'Z')] = array( 'sunrise' => $sunrise->__toString(), 'sunset' => $sunset->__toString() );
	}
			
	//clear any files that are 6 days old (or older)
	clear_old_cache_files();
	
	//return json
	echo json_encode( $data ); 
}

function clear_old_cache_files(){
	$dir = "cache";
	$objects = scandir($dir);
	//iterate through each file in the directory
	foreach ($objects as $object) {
		if ( $object != "." && $object != ".." ){
			//check expiry date of file...
			if (filemtime($dir . DIRECTORY_SEPARATOR . $object) > time() - CACHE_LIFE_SECONDS)
				continue;
			
			//remove file
			unlink($dir . DIRECTORY_SEPARATOR . $object);	
		}
	}
}

function get_weather_prediction() {
	global $url;
    //get the latest (ish) weather prediction from datapoint (global url)	
	return get_cache_data($url, "dp_data");
}

function cache_exists($cache_path){
	$dir = "cache";
	return file_exists($dir . DIRECTORY_SEPARATOR . md5($cache_path) );
}

function get_cache_data($url, $cache_path){	
	//if no cache directory, create one
	$dir = "cache";
	if ( !file_exists($dir ) ){
		//naughty I know, you may wish to change permissions to be less permissive...
		//[CHANGE]
		$r = mkdir ($dir, 0777);
	}
	
    $cache_file = $dir . DIRECTORY_SEPARATOR . md5($cache_path);
	file_exists($cache_file);
    if (file_exists($cache_file)) {
        $fh = file_get_contents($cache_file);
		//read in the timestamp in the cache file
		$arr = explode("\n", $fh, 2);		
		if ( count( $arr )){
			$cacheTime = $arr[0];
			//compare the current time stamp with the current time (- 1 hour )
			if ($cacheTime > strtotime('-60 minutes')) {
				//return data
				return $arr[1];
			}
		}

        // else delete/remove cache file reference
        fclose($fh);
        unlink($cache_file);
    }
	
	//if we are here, we need to get a new message from DataPoint
    $response = file_get_contents($url);
	//if failed, return error message
	if ( !$response ){
		$array_args = array('function' => "cache_data", 'file' => $url );
		report_error( "Unable to open file.", $array_args);	
	}
		
	$content = $response;

	//write and close file
    $fh = fopen($cache_file, 'w');	
    fwrite($fh, time() . "\n");
    fwrite($fh, $content);
    fclose($fh);

	return $content;
}

function report_error( $msg, $array_args){	
	$array_args["msg"] = $msg;
	//return error to caller
	echo json_encode($array_args);
	exit();
}

function get_best_chore(){
	//TODO give date to this function, then iterate through each chore
}

/*
This function manually creates a number of profiles for several types of chores a person might do (e.g. washing). Feel free to create your own or read from a database - this was a quick fix 
during a quick research project.
*/
function load_chores(){
	//would normally get these from the database, but for now, just construct arrays and place within chore array
	global $chores;
	
	//washing and drying
	$washing_drying_chore = new Chore();
	$washing_drying_chore->name = "washing and drying clothes";
	$washing_drying_chore->message = "I chose this time as there is likely to be plenty of energy being generated by Tilley and a low chance of rain.";
	
	//create new profile - default profile is correct for washing
	$wind_profile = new Profile();
	$wind_profile->resource_name = "S";
	
	//go for a low chance of rain
	$rain_profile = new Profile();
	$rain_profile->resource_name = "Pp";
	$rain_profile->min_value = 0;
	$rain_profile->max_value = 10;
	
	$washing_drying_chore->profiles['S'] =  $wind_profile;
	$washing_drying_chore->profiles['Pp'] =  $rain_profile;
	
	//just washing
	$washing_chore = new Chore();
	$washing_chore->name = "washing clothes";
	$washing_chore->message = "I chose this time as there is likely to be plenty of energy being generated by Tilley - however, there may be a spot of rain so maybe you should get the clothes horse out...";
	
	$washing_chore->min_hour = 6;	
	$washing_chore->max_hour = 21;
	//create new profile - default profile is correct for washing
	$wind_profile = new Profile();
	$wind_profile->resource_name = "S";

	$wet_profile = new Profile();
	$wet_profile->resource_name = "S";
	$wet_profile->min_value = 50;
	$wet_profile->max_value = 100;

	$washing_chore->profiles['S'] = $wind_profile;	
	$washing_chore->profiles['Pp'] = $wet_profile;
	
	//dish washer
	$dish_washing_chore = new Chore();
	$dish_washing_chore->name = "putting the dishwasher on";
	$dish_washing_chore->message = "Turning on your dishwasher consumes electricity by warming up water - turning it on at the suggested time means you are using energy at a time where there is plenty of renewable energy.";
	
	$dish_washing_chore->min_hour = 9;	
	$dish_washing_chore->max_hour = 21;
	//create new profile - default profile is correct for washing
	$wind_profile = new Profile();
	$wind_profile->resource_name = "S";
	
	$dish_washing_chore->profiles['S'] =  $wind_profile;
	
	//heating
	$heating_chore = new Chore();
	$heating_chore->name = "put the heating on";
	$heating_chore->min_hour = 0;	
	$heating_chore->max_hour = 24;
	$heating_chore->message = "Turning on your heating on at this time will help keep your house warm whilst using energy at a time where it is plentiful.";
	//create new profile - default profile is correct for washing
	$temp_profile = new Profile();
	$temp_profile->resource_name = "T";	
	$temp_profile->min_value = -10;
	$temp_profile->max_value = 13;
	
	$short_wind_profile = new Profile();
	$short_wind_profile->resource_name = "S";
	$short_wind_profile->min_value = 25;
	$short_wind_profile->max_value = 100;
	
	$heating_chore->profiles['T'] =  $temp_profile;
	$heating_chore->profiles['S'] =  $short_wind_profile;
	
	//add the four chores to the system
	array_push($chores, $washing_drying_chore );
	array_push($chores, $washing_chore );
	array_push($chores, $dish_washing_chore );	
	array_push($chores, $heating_chore );
	
}
?>