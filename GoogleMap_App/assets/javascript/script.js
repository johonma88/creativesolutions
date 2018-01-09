// Initialize Firebase
var config = {
    apiKey: "AIzaSyBGfGLbPCTtwsV0c_zKb98VRXB4Ejs9yU4",
    authDomain: "project-1-trip-planner.firebaseapp.com",
    databaseURL: "https://project-1-trip-planner.firebaseio.com",
    projectId: "project-1-trip-planner",
    storageBucket: "project-1-trip-planner.appspot.com",
    messagingSenderId: "374112063927"
};

firebase.initializeApp(config);

//Firebase variable
let database = firebase.database();

// Global variables
let stops = [];
let infowindow;
let map;
let service;
let markers = [];
let radiusNumber;
let placeType;



//Initial firebase variables
let toPlaceFB;
let fromPlaceFB;
let placeTypeFB;
let radiusFB;


//This function display the initial map
function initMap() {
    var directionsService = new google.maps.DirectionsService;
    var directionsDisplay = new google.maps.DirectionsRenderer;
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 7,
        center: {
            lat: 41.85,
            lng: -87.65
        },
        // gestureHandling: 'none',
        // // zoomControl: false
    });
    infowindow = new google.maps.InfoWindow();
    directionsDisplay.setMap(map);

    var onChangeHandler = function() {
        calculateAndDisplayRoute(directionsService, directionsDisplay);
    };

  

    // Function when the GO  button is clicked
    $(".go").click(function() {
       
        $("#places").empty();
        let toPlace = $('#toPlace').val();
        let fromPlace = $('#fromPlace').val();

        //get the value from the selected option
        placeType = document.getElementById('placeType').value;

        //get the text from the selected option
        let placeTypeText = $( "#placeType option:selected" ).text();
        
        //create the table in the places div
        $("#places").append('<h3>' + placeTypeText  + '</h3>'+
        '<table class="table table-striped text-center">' +
        '<thead>' +
        '<tr>' +
        '<th>' + 'Place Name' + '</th>' +
        '<th>' + 'Located At' + '</th>' +
        '<th>' + 'Rating' + '</th>' +
        '<th>' + 'Price Level' + '</th>' +
        '</tr>' +
        '</thead>' +
        '<tbody id="tablePlaces">'+
        '</tbody>'+
         "</table>");

         //get the value from the selected radius 
        let radius = document.getElementById('radius').value;
        //convert the value into a number
        radiusNumber = parseInt(radius);
       
        onChangeHandler(fromPlace);
        onChangeHandler(toPlace);

        //firebase
        toPlaceFB = $('#toPlace').val().trim();
        fromPlaceFB = $('#fromPlace').val().trim();
        placeTypeFB = document.getElementById('placeType').value;
        radiusFB = document.getElementById('radius').value;

        //Creating an Object to store the data in firebase (key: value)
        userData = {
            toPlace: toPlaceFB,
            fromPlace: fromPlaceFB,
            placeType: placeTypeFB,
            radiusInMeters: radiusFB,
        }

        // push user input data into firebase
        database.ref().push(userData);

    });
    new AutocompleteDirectionsHandler(map);

}

//Autocomplete function from google map
function AutocompleteDirectionsHandler(map) {
    this.map = map;
    this.originPlaceId = null;
    this.destinationPlaceId = null;
    this.travelMode = 'DRIVING';
    var originInput = document.getElementById('fromPlace');
    var destinationInput = document.getElementById('toPlace');

    this.directionsService = new google.maps.DirectionsService;
    this.directionsDisplay = new google.maps.DirectionsRenderer;
    this.directionsDisplay.setMap(map);

    var originAutocomplete = new google.maps.places.Autocomplete(
        originInput, {
            placeIdOnly: true
        });
    var destinationAutocomplete = new google.maps.places.Autocomplete(
        destinationInput, {
            placeIdOnly: true
        });


    this.setupPlaceChangedListener(originAutocomplete, 'fromPlace');
    this.setupPlaceChangedListener(destinationAutocomplete, 'toPlace');



}

//Place Change listener for the Autocomplete function
AutocompleteDirectionsHandler.prototype.setupPlaceChangedListener = function(autocomplete, mode) {
    var me = this;
    autocomplete.bindTo('bounds', this.map);
    autocomplete.addListener('place_changed', function() {
      var place = autocomplete.getPlace();
    
    });

  };

//Calculate and display the route 
function calculateAndDisplayRoute(directionsService, directionsDisplay) {

    markers.forEach(marker => {
        marker.setMap(null);
    });

    markers = [];

    directionsService.route({
        origin: document.getElementById('fromPlace').value,
        destination: document.getElementById('toPlace').value,
        travelMode: 'DRIVING'
    }, function(response, status) {
        stops = [];
        stops.push({
            lat: response.routes[0].overview_path[0].lat(),
            long: response.routes[0].overview_path[0].lng()
        });
        for (let index = 1; index < 6; index++) {
            let stopIndex = Math.floor(response.routes[0].overview_path.length / 6) * index;

            stops.push({
                lat: response.routes[0].overview_path[stopIndex].lat(),
                long: response.routes[0].overview_path[stopIndex].lng()
            });
        }
        stops.push({
            lat: response.routes[0].overview_path[response.routes[0].overview_path.length - 1].lat(),
            long: response.routes[0].overview_path[response.routes[0].overview_path.length - 1].lng()
        });

         if (status === 'OK') {
            directionsDisplay.setDirections(response);
        } else {
            window.alert('Directions request failed due to ' + status);
        }

        service = new google.maps.places.PlacesService(map);

        stops.forEach((stop) => {
            service.nearbySearch({
                location: {
                    lat: stop.lat,
                    lng: stop.long
                },

                radius: radiusNumber,
                type: [placeType]
            }, callback);

        });
    });
}



//callback for googlemap
function callback(results, status) {
    if (status === google.maps.places.PlacesServiceStatus.OK) {
        for (var i = 0; i < results.length; i++) {
            createMarker(results[i]);
        }
    }
}


function createMarker(place) {
    console.log(place);
      var placeLoc = place.geometry.location;
      markers.push(new google.maps.Marker({
          map: map,
          position: place.geometry.location
      }));
      // append data into the table
        $("#tablePlaces").append( '<tr>' +
        '<td>' + place.name +'</td>' +
        '<td>' + place.vicinity +'</td>' +
        '<td>' + (place.rating ? place.rating: 'n/a' )+'</td>' +
        '<td>' + (place.price_level ? place.price_level: 'n/a') +'</td>' +
         '</tr>' ) ;     

      // put data into the marker info window
      google.maps.event.addListener(markers[markers.length - 1], 'click', function() {
        infowindow.setContent(`<div> <h3> ${place.name}</h3> <br>Address: ${place.vicinity}<br> Rating: ${place.rating}<br> 
        0 — Free    1 — Inexpensive      2 — Moderate       3 — Expensive      4 — Very Expensive <br> Price Level: ${place.price_level}  </div>`);

         infowindow.open(map, this);
    });
}
 



function hideShow() {
    var x = document.getElementById("floating-panel");
    if (x.style.display === "none") {
        x.style.display = "block";
    } else {
        x.style.display = "none";
    }
}

 
