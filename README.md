Data-Dashboard
==============

A web application that uses weather forecast information (obtained from MET office) to predict the energy output of a wind turbine.
Currently, it is set to predict energy output of the wind turbine located on the island of Tiree. This predicted output is overlaid
with local weather information to help the user synchronise their energy use (and thus household chores) with the production of 
local renewable energy.

Firstly, it is important to note that the software included herein only provides an estimate based on forecasted weather and may
not reflect the actual output of renewable energy. Secondly, it should also be noted that the software was developed very quickly
and may still contain bugs that have yet to surface.


Setup notes
===========

This software should work on any web server that supports PHP 5 (and MySQL should usage logging be enabled). In addition, results 
from the MET office API are cached to keep within usage limits of a free DataPoint account. As such, the web server requires write
permissions to the cache folder.

You also need to supply the API key for DataPoint (as well as other information) for this application to work. The following files
contain references that need to [CHANGE]:

* index.php
* tep_stub.php
* js/core.js

Thanks
======

Firstly, we would like to thank the island community of Tiree for their valuable input in the design and development of this web
application.

We would also like to use this space to point to all the libraries\tools\content that was used to make this web application. Below is a list of sources used to make this content.

* TODO
