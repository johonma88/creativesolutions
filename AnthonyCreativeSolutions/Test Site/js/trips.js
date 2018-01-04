var CITY_LEVEL_ZOOM = 13;
var EARTH_RADIUS = 6378137.0; // meters

// global vars
var jqxhrItineraryDistances, jqxhrLocationDistances, getMapIdeasXHR, getMapLocationsXHR, createNotepadLocationIdeasControlXHR;

var createNotepadLocationIdeasControlInterval;

var locationDirectionModel = Backbone.Model.extend({
    defaults: {
        on_map: 0,
        origin_id: '',
        destination_id: '',
        notes: '',
        selected_routes: [],
        routes: []
    },
    load: function () {
        var that = this;

        var origin = locationDirections.locations.findWhere({tl_id: that.get('origin_id')}),
            destination = locationDirections.locations.findWhere({tl_id: that.get('destination_id')});

        var searchDoneFunction = function () {
            that.get('routes').sort(function(a, b) {
                var getRouteWeights = function (routeType) {
                    switch(routeType) {
                        case 'plane': return 3;
                        case 'driving': return 2;
                        case 'train': return 1;
                        default: return 0;
                    }
                };

                return getRouteWeights(a.mode) > getRouteWeights(b.mode) ? -1 : 1;
            });

            var selectedRoutes = _.map(that.get('routes'), function(route){ return route.mode; });

            var intersectedSelectedRoutes = _.intersection(selectedRoutes, that.get('selected_routes') || []);

            if(intersectedSelectedRoutes.length){
                selectedRoutes = intersectedSelectedRoutes;
            }
            else if(selectedRoutes.length){
                selectedRoutes = [selectedRoutes[0]];
            }

            that.set('selected_routes', selectedRoutes);

            that.trigger('loaded');
        };

        if (origin.get('tl_location') == destination.get('tl_location')) {
            setTimeout(searchDoneFunction, 10);
        } else {
            var promises = [];

            var googleModeParams = {
                train: {
                    travelMode: google.maps.TravelMode.TRANSIT,
                    transitOptions: {
                        modes: [google.maps.TransitMode.TRAIN]
                    }
                },
                bus: {
                    travelMode: google.maps.TravelMode.TRANSIT,
                    transitOptions: {
                        modes: [google.maps.TransitMode.BUS]
                    }
                },
                driving: {
                    travelMode: google.maps.TravelMode.DRIVING
                }
            };

            var rome2RioModeParams = {
                plane: {
                    oKind: 'flight',
                    dKind: 'flight',

                    noAir: 0,
                    noAirLeg: 0,
                    noRail: 0,
                    noBus: 0,
                    noFerry: 1,
                    noCar: 1,
                    noBikeshare: 1,
                    noRideshare: 1,
                    noTowncar: 0,
                    noCommuter: 0,
                    noSpecial: 0,
                    noMinorStart: 1,
                    noMinorEnd: 1,
                    noPath: 1,
                    noPrice: 1,
                    noStop: 1
                },
                driving: {
                    noAir: 1,
                    noAirLeg: 1,
                    noRail: 1,
                    noBus: 1,
                    noFerry: 1,
                    noCar: 0,
                    noBikeshare: 1,
                    noRideshare: 1,
                    noTowncar: 1,
                    noCommuter: 1,
                    noSpecial: 1,
                    noMinorStart: 1,
                    noMinorEnd: 1,
                    noPath: 0,
                    noPrice: 1,
                    noStop: 0
                },
                train: {
                    noAir: 1,
                    noAirLeg: 1,
                    noRail: 0,
                    noBus: 1,
                    noFerry: 1,
                    noCar: 1,
                    noBikeshare: 1,
                    noRideshare: 1,
                    noTowncar: 1,
                    noCommuter: 1,
                    noSpecial: 1,
                    noMinorStart: 1,
                    noMinorEnd: 1,
                    noPath: 0,
                    noPrice: 1,
                    noStop: 0
                }
            };

            var directionsService = new google.maps.DirectionsService();

            ['driving'/*, 'train'*/].forEach(function (mode) {
                var query = _.clone(googleModeParams[mode]);

                $.extend(query, {
                    origin: { placeId: origin.get('tl_google_place_id') },
                    destination: { placeId: destination.get('tl_google_place_id') },
                    provideRouteAlternatives: false
                });

                var promise = $.Deferred();

                (function getGoogleDirection() {
                    $.get(APPLICATION_URL+'trips/getGoogleData', query, function (response) {
                        promise.resolve({
                            mode: mode,
                            vendor: 'google',
                            query: query,
                            response: response || {}
                        });
                    }, 'json').fail(function () {
                        directionsService.route(query, function(response, status) {
                            if (status == google.maps.DirectionsStatus.OVER_QUERY_LIMIT) {
                                setTimeout(getGoogleDirection, 100);
                            } else {
                                promise.resolve({
                                    mode: mode,
                                    vendor: 'google',
                                    query: query,
                                    response: response || {}
                                });

                                var data = JSON.parse(JSON.stringify(response));

                                if(data.routes && data.routes.length) {

                                    data.routes.forEach(function (route) {
                                        delete route.overview_path;
                                        delete route.overview_polyline;

                                        route.legs.forEach(function (leg) {
                                            delete leg.steps_points;
                                            delete leg.start_location;
                                            delete leg.end_location;
                                            delete leg.start_address;
                                            delete leg.end_address;

                                            leg.steps.forEach(function (step) {
                                                delete step.path;
                                                delete step.lat_lngs;
                                                delete step.encoded_lat_lngs;
                                                delete step.instructions;
                                                delete step.maneuver;
                                                delete step.start_location;
                                                delete step.end_location;
                                                delete step.start_point;
                                                delete step.end_point;
                                            });
                                        });
                                    });
                                }

                                $.post(APPLICATION_URL+'trips/setGoogleData?'+$.param(query), data, 'json');
                            }
                        });
                    });
                })();

                promises.push(promise.promise());
            });

            ['plane', /*'driving',*/ 'train'].forEach(function (mode) {
                var query = _.clone(rome2RioModeParams[mode]);

                $.extend(query, {
                    oName: origin.get('tl_location'),
                    dName: destination.get('tl_location'),
                    oPos: origin.get('tl_location_latitude')+','+origin.get('tl_location_longitude'),
                    dPos: destination.get('tl_location_latitude')+','+destination.get('tl_location_longitude')
                });

                if (!_.findWhere(that.get('routes'), {mode: mode})) {
                    var promise = $.Deferred();

                    $.get(APPLICATION_URL+'trips/getRome2RioData', query, function (response) {
                        promise.resolve({
                            mode: mode,
                            vendor: 'rome2rio',
                            query: query,
                            response: response || {}
                        });
                    }, 'json').fail(function () {
                        promise.resolve({
                            mode: mode,
                            vendor: 'rome2rio',
                            query: query,
                            response: {}
                        });
                    });

                    promises.push(promise.promise());
                }
            });

            $.when.apply(null, promises).always(function () {
                if(!arguments){ return false; }

                _.each(arguments, function (result) {
                    var response = result.response;
                    var routeParams = {};
                    var routes = _.clone(that.get('routes'));

                    if ('google' == result.vendor) {
                        if(response.routes && response.routes.length){
                            var duration = null;

                            response.routes.forEach(function (route, routeIndex) {
                                route.legs.forEach(function (leg) {
                                    leg.steps_duration_value = leg.duration.value;
                                    leg.steps_distance_value = leg.distance.value;

                                    if(result.query.travelMode == google.maps.TravelMode.TRANSIT){
                                        leg.stops = [];

                                        leg.steps.forEach(function (step) {
                                            if(step.travel_mode == google.maps.TravelMode.TRANSIT && step.duration.value){
                                                leg.stops.push(step.transit.departure_stop.name);
                                                leg.stops.push(step.transit.headsign);
                                            }
                                        });
                                    }

                                    leg.steps_points = [];

                                    leg.steps.forEach(function (step) {
                                        leg.steps_points.push(step.polyline.points);
                                    });

                                    if(leg.steps_duration_value && (duration > leg.steps_duration_value || !duration)){
                                        duration = leg.steps_duration_value;

                                        var hours = Math.floor(duration / 60 / 60);
                                        var minutes = Math.round(duration / 60 % 60);

                                        routeParams = {
                                            'route_index': routeIndex,
                                            'duration_value': duration,
                                            'duration': $.trim((hours ? hours + 'h' : '') + (minutes ? ' ' + minutes + 'm' : '')),
                                            'distance_value': leg.steps_distance_value,
                                            'distance': Math.round(leg.steps_distance_value/1000)+'km'
                                        };
                                    }
                                });
                            });

                            if(routeParams.distance_value && routeParams.duration_value){
                                routeParams['mode'] = result.mode;
                                routeParams['vendor'] = result.vendor;
                                routeParams['response'] = response;

                                routes.push(routeParams);

                                that.set('routes', routes);
                            }
                        }
                    } else if ('rome2rio' === result.vendor) {
                        if (response.routes && response.routes.length) {
                            $.each(response.routes, function (routeIndex, route) {
                                route.segments_points = [];

                                if (result.mode === 'plane') {
                                    if(route.name.toLowerCase().indexOf('fly') === -1) return true;

                                    route.totalDuration = 0;
                                    route.distance = 0;

                                    route.segments.forEach(function (segment) {
                                        var segmentPath = segment.path;

                                        if(segment['segmentKind'] === 'air'){
                                            route.totalDuration += segment['transitDuration'];
                                            route.distance += segment.distance;

                                            var origin = response['places'][segment['depPlace']],
                                                destination = response['places'][segment['arrPlace']];

                                            var startPoint = new google.maps.LatLng(origin['lat'], origin['lng']);
                                            var endPoint = new google.maps.LatLng(destination['lat'], destination['lng']);

                                            segmentPath = getGeodesicPolyline(startPoint, endPoint);
                                            segmentPath = google.maps.geometry.encoding.encodePath(segmentPath);
                                        }

                                        if(segmentPath){
                                            route.segments_points.push(segmentPath);
                                        }
                                    });
                                } else{
                                    route.segments.forEach(function (segment) {
                                        if (segment.path) {
                                            route.segments_points.push(segment.path);
                                        }
                                    });
                                }

                                var duration = routeParams['duration_value'];

                                if (route.totalDuration && (duration > route.totalDuration * 60 || !duration)) {
                                    duration = route.totalDuration;

                                    var hours = Math.floor(duration / 60);
                                    var minutes = duration % 60;

                                    routeParams = {
                                        'route_index': routeIndex,
                                        'duration_value': duration * 60,
                                        'duration': $.trim((hours ? hours + 'h' : '') + (minutes ? ' ' + minutes + 'm' : '')),
                                        'distance_value': route.distance * 1000,
                                        'distance': route.distance + 'km'
                                    };
                                }
                            });

                            if (routeParams.distance_value && routeParams.duration_value) {
                                routeParams['mode'] = result.mode;
                                routeParams['vendor'] = result.vendor;
                                routeParams['response'] = response;

                                routes.push(routeParams);

                                that.set('routes', routes);
                            }
                        }
                    }
                });

                searchDoneFunction();
            });
        }

        return that;
    }
});

var locationDirectionsCollection = Backbone.Collection.extend({
    model: locationDirectionModel,
    locations: new Backbone.Collection(),
    directions: new Backbone.Collection(),
    queries: new Backbone.Collection(),
    initialize: function() {
        var that = this;

        that.directions = new Backbone.Collection()
            .on('add', function (direction) {
                var locationDirection = new locationDirectionModel(direction.toJSON());

                locationDirection.load();

                locationDirection.on('loaded', function () {
                    direction.set('loaded', true);

                    direction.set('loadedDirectionId', locationDirection.cid);

                    that.add(locationDirection);

                    // console.log(locationDirection);

                    if (that.directions.where({loaded: true}).length === that.directions.length) {
                        that.trigger('loaded', that.directions);
                    }
                });
            })
            .on('remove', function (direction) {
                var removedMapObjects = [];
                var removedLocationDirection = that.get(direction.get('loadedDirectionId'));

                directionsMapObjects.forEach(function (renderedMapObject) {
                    if(renderedMapObject.directionId == removedLocationDirection.cid){
                        removedMapObjects.push(renderedMapObject);
                    }
                });

                removedMapObjects.forEach(function (renderedMapObject) {
                    renderedMapObject.setMap(null);
                    delete directionsMapObjects[directionsMapObjects.indexOf(renderedMapObject)];
                });

                that.remove(removedLocationDirection);

                if (that.directions.where({loaded: true}).length === that.directions.length) {
                    that.trigger('loaded', that.directions);
                }
            })
            .on('change:selected_routes', function (direction) {
                var existedDirection = that.get(direction.get('loadedDirectionId'));

                var selectedRoutes = _.map(existedDirection.get('routes'), function(route){ return route.mode; });

                var intersectedSelectedRoutes = _.intersection(selectedRoutes, direction.get('selected_routes') || []);

                if(intersectedSelectedRoutes.length){
                    selectedRoutes = intersectedSelectedRoutes;
                }
                else if(selectedRoutes.length){
                    selectedRoutes = [selectedRoutes[0]];
                }

                existedDirection.set('selected_routes', selectedRoutes);

                directionsMapObjects.forEach(function (renderedMapObject) {
                    if(existedDirection.get('selected_routes').indexOf(renderedMapObject.routeType) === -1 && renderedMapObject.directionId == existedDirection.cid){
                        renderedMapObject.setMap(null);
                        delete directionsMapObjects[directionsMapObjects.indexOf(renderedMapObject)];
                    }
                });

                if(that.directions.where({loaded: true}).length === that.directions.length){
                    that.trigger('loaded', that.directions);
                }
            })
            .on('change:notes', function (direction) {
                var existedDirection = that.get(direction.get('loadedDirectionId'));

                existedDirection.set('notes', direction.get('notes'));

                renderLogisticRow(existedDirection);

                if(that.directions.where({loaded: true}).length === that.directions.length){
                    that.trigger('loaded', that.directions);
                }
            })
        ;
    },
    update: function(locations, directions) {
        var that = this;

        this.locations.forEach(function(l) {
            that.locations.remove(l);
        });

        this.directions.forEach(function(d) {
            that.directions.remove(d);
        });

        setTimeout(function() {
            locationDirections.locations.set(locations);
            locationDirections.directions.set(directions);

            if (!directions.length) {
                that.trigger('loaded', that.directions);
            }
        }, 10);

        return this;
    }
});

var locationDirections = new locationDirectionsCollection();

locationDirections
    .on('add change:selected_routes', function (direction) {
        var routeTypesParams = {
            plane: {
                geodesic: false,
                iconClass: 'map-flying-icon'
            },
            driving: {
                geodesic: false,
                iconClass: 'map-driving-icon'
            },
            train: {
                geodesic: false,
                iconClass: 'train'
            }
        };

        if(direction.get('on_map')){
            direction.get('selected_routes').forEach(function(routeType){
                if(_.findWhere(directionsMapObjects, {directionId: direction.cid, routeType: routeType})){
                    return true;
                }

                var routeParams = _.findWhere(direction.get('routes'), {mode: routeType});

                $.each(routeParams['response']['routes'], function(routeIndex, route) {
                    var isShortestRoute = routeIndex == routeParams['route_index'],
                        routeDistance = 0, routeDuration = 0,
                        polilinePath = [], stops = [];

                    if(routeParams['vendor'] === 'rome2rio'){
                        routeDistance = route.distance * 1000;
                        routeDuration = route.totalDuration * 60;

                        $.each(route['segments'], function() {
                            $.each(this['stops'], function() {
                                var place = routeParams['response']['places'][this['place']];
                                stops.push(place['shortName']);
                            });
                        });

                        $.each(route['segments_points'], function(){
                            Array.prototype.push.apply(polilinePath, google.maps.geometry.encoding.decodePath(this));
                        });
                    } else if(routeParams['vendor'] === 'google') {
                        $.each(route['legs'], function (legIndex, leg) {
                            routeDistance += leg['steps_distance_value'];
                            routeDuration += leg['steps_duration_value'];

                            $.each(leg['steps_points'], function(){
                                Array.prototype.push.apply(polilinePath, google.maps.geometry.encoding.decodePath(this));
                            });
                        });

                        if(routeType === 'train') {
                            $.each(route['legs'], function (legIndex, leg) {
                                $.each(leg['stops'], function() {
                                    stops.push(this);
                                });
                            });
                        }
                    }

                    if (polilinePath.length && isShortestRoute) {
                        var polyline = new google.maps.Polyline({
                                geodesic: routeTypesParams[routeType]['geodesic'],
                                strokeColor: isShortestRoute ? '#0055FF' : 'lightGray',
                                strokeOpacity: isShortestRoute ? 0.6 : 0.8,
                                strokeWeight: 6,
                                map: map,
                                path: polilinePath,
                                zIndex: isShortestRoute ? 2 : 1,
                                directionId: direction.cid,
                                routeType: routeType
                            }),
                            polilineLength = google.maps.geometry.spherical.computeLength(polyline.getPath().getArray()),
                            polilineCenterPosition = polyline.GetPointAtDistance(polilineLength/2)
                            ;

                        var hours = Math.floor(routeDuration / 60 / 60),
                            minutes = Math.round(routeDuration / 60 % 60);

                        var infoBubbleMarker = makeInfoBubbleMarker({
                            class: isShortestRoute ? 'distance-info' : 'distance-info greyed',
                            content: '<i class="'+routeTypesParams[routeType]['iconClass']+' travel-icon"></i>' +
                            (hours ? hours+'h ' : '') +
                            (minutes ? minutes+'m ':'') +
                            (stops.length ? '<i class="fa fa-info-circle" title="'+escapeHtml(stops.join(' > '))+'"></i>' : ''),
                            position: polilineCenterPosition, //polyline.GetPointAtDistance(routeDistance/2),
                            zIndex: isShortestRoute ? 2 : 1,
                            directionId: direction.cid,
                            line: polyline,
                            routeType: routeType
                        });

                        infoBubbleMarker.addListener('click', function(e){
                            if(!$(e.target).hasClass('distance-info')){
                                return false;
                            }

                            var marker = this, $content = $(marker.getContent()).find('.distance-info');

                            if($content.hasClass('greyed')){
                                $.each(directionsMapObjects, function(){
                                    var mapObj = this;

                                    if(
                                        mapObj != infoBubbleMarker
                                        && mapObj instanceof RichMarker
                                        && mapObj.directionId == marker.directionId
                                        && mapObj.routeType == marker.routeType
                                        && $(mapObj.getContent()).find('.distance-info:not(.greyed)').length
                                    ){
                                        $(mapObj.getContent()).find('.distance-info').toggleClass('greyed');
                                        mapObj.setZIndex(2);

                                        mapObj.line.setMap(null);

                                        mapObj.line = new google.maps.Polyline({
                                            geodesic: mapObj.line.geodesic,
                                            strokeColor: 'lightGray',
                                            strokeOpacity: 0.8,
                                            strokeWeight: 6,
                                            map: map,
                                            path: mapObj.line.getPath(),
                                            zIndex: 1,
                                            directionId: direction.cid,
                                            routeType: routeType
                                        });

                                        directionsMapObjects[directionsMapObjects.indexOf(mapObj.line)] = mapObj.line;
                                    }
                                });

                                $content.toggleClass('greyed');
                                marker.setZIndex(2);

                                marker.line.setMap(null);

                                marker.line = new google.maps.Polyline({
                                    geodesic: marker.line.geodesic,
                                    strokeColor: '#0055FF',
                                    strokeOpacity: 0.6,
                                    strokeWeight: 6,
                                    map: map,
                                    path: marker.line.getPath(),
                                    zIndex: 2,
                                    directionId: direction.cid,
                                    routeType: routeType
                                });

                                directionsMapObjects[directionsMapObjects.indexOf(marker.line)] = marker.line;
                            }
                        });

                        directionsMapObjects.push(polyline, infoBubbleMarker);
                    }
                });
            });
        }

        renderLogisticRow(direction);
    })
    .on('remove', fixHomeLogisticRows)
;

var map;

var removedDates = [];

var infoWindow; var mapZoomListener;

var ideasMarkersClusterer = {}, locationsMarkersClusterer = {};

var directionsMapObjects = [], ideasDirectionsMapObjects = [];

var lastItineraryDistances = {}, lastItineraryDirections = {};

var sliderItemState = null;

var sliderLeftIndent = null;

var isNewIdeaAdded = false;

/**
 * Extend the Number object to convert degrees to radians
 *
 * @return {Number} Bearing in radians
 * @ignore
 */
Number.prototype.toRad = function () {
    return this * Math.PI / 180;
};

/**
 * Extend the Number object to convert radians to degrees
 *
 * @return {Number} Bearing in degrees
 * @ignore
 */
Number.prototype.toDeg = function () {
    return this * 180 / Math.PI;
};

/**
 * Normalize a heading in degrees to between 0 and +360
 *
 * @return {Number} Return
 * @ignore
 */
Number.prototype.toBrng = function () {
    return (this.toDeg() + 360) % 360;
};

(function($) {
    $.fn.hasScrollBar = function() {
        return this.get(0).scrollHeight > this.outerHeight();
    };

    google.maps.LatLng.prototype.DestinationPoint = function (brng, dist, radius) {
        var brngRad = brng.toRad();
        var lat1 = this.lat().toRad(), lon1 = this.lng().toRad();
        var lat2 = Math.asin( Math.sin(lat1)*Math.cos(dist/radius) +
            Math.cos(lat1)*Math.sin(dist/radius)*Math.cos(brngRad) );
        var lon2 = lon1 + Math.atan2(Math.sin(brngRad)*Math.sin(dist/radius)*Math.cos(lat1),
            Math.cos(dist/radius)-Math.sin(lat1)*Math.sin(lat2));

        return new google.maps.LatLng(lat2.toDeg(), lon2.toDeg());
    };

    google.maps.LatLng.prototype.Bearing = function(otherLatLng) {
        var from = this;
        var to = otherLatLng;
        if (from.equals(to)) {
            return 0;
        }
        var lat1 = from.latRadians();
        var lon1 = from.lngRadians();
        var lat2 = to.latRadians();
        var lon2 = to.lngRadians();
        var angle = - Math.atan2( Math.sin( lon1 - lon2 ) * Math.cos( lat2 ), Math.cos( lat1 ) * Math.sin( lat2 ) - Math.sin( lat1 ) * Math.cos( lat2 ) * Math.cos( lon1 - lon2 ) );
        if ( angle < 0.0 ) angle  += Math.PI * 2.0;
        if ( angle > Math.PI ) angle -= Math.PI * 2.0;
        return parseFloat(angle.toDeg());
    };
})(jQuery);

(function ($) {
    $.scrollbarWidth = function () {
        var $inner = $('<div />').css({height: 100}),

        $outer = $('<div />').css({width: 50, height: 50, overflow: 'hidden', position: 'absolute', top: -200, left: -200}).append($inner),
            inner = $inner[0],
            outer = $outer[0];

        $('body').append(outer);

        var width1 = inner.offsetWidth;
        $outer.css('overflow', 'scroll');
        var width2 = outer.clientWidth;
        $outer.remove();
        var result = width1 - width2;

        $.scrollbarWidth = function () {
            return result;
        };

        return result;
    };
})(jQuery);

$(function(){
    $('body')
        // guest
        .on(
            'click',
            '.guest-trip .navbar-right li, ' +
            '.guest-trip .btn-add-trip-buddies, ' +
            '.guest-trip .btn-edit-trip-documents, ' +
            '.guest-trip .js-btn-send-itinerary, ' +
            '.guest-trip .print-itinerary, ' +
            '.guest-trip .print-map, ' +
            '.guest-trip .btn-login ',
            // '.guest-trip .location-idea-photo-icon img',
            function (e) {
                showRegistrationDialog(e);
            }
        )

        .on(
            'click',
            '.public-trip:not(.user-logged-in) .print-itinerary, ' +
            '.public-trip:not(.user-logged-in) .print-map, ' +
            '.public-trip .btn-login, ' +
            '.public-trip .location-idea-photo-icon img, ' +
            '.public-trip .btn-dates-edit, ' +
            '.public-trip .idea-date, ' +
            '.public-trip [data-type="3"] .idea-icon-dropdown .dropdown-menu a, ' +
            '.public-trip .remove-waypoint'
            ,
            function (e) {
                showRegistrationDialog(e);
            }
        )

        // header
        .on('click','.container:not(.user-logged-in):not(.guest-trip) .btn-save-itinerary-ideas',function(e){
            e.preventDefault();

            var $modal = $('#myModal');
            var login_url = APPLICATION_URL + '/trip/saveItineraryIdeas/' + t_id;

            var data = {
                'data[reference_trip_id]': t_id,
                'data[login_url]': login_url
            };

            $.post(APPLICATION_URL+"trips/getCopyItineraryRegistrationDialog", data, function(html){
                $modal.html(html);

                var autocomplete = new google.maps.places.Autocomplete(document.getElementById('home_city')/*,{types:['(cities)']}*/);

                google.maps.event.addListener(autocomplete, 'place_changed', function() {
                    var place = autocomplete.getPlace();

                    if (!place.geometry) {
                        return;
                    }

                    $modal.find('#UserULatitude').val(place.geometry.location.lat());
                    $modal.find('#UserULongitude').val(place.geometry.location.lng());
                });

                $modal
                    .on('click', '.np2_fbbutton', function(){
                        FB.login(function(response) {
                            if (response.authResponse) {
                                // user has auth'd your app and is logged into Facebook
                                FB.api('/me?fields=email,name,first_name,last_name,gender,location', function(me){
                                    if (me.id) {
                                        // console.log(me);
                                        $.ajax({
                                            url: APPLICATION_URL + "index/save_social_data",
                                            type: "POST",
                                            dataType: "json",
                                            data: {
                                                u_facebook_login_id: me.id,
                                                email: me.email,
                                                u_fname: me.first_name,
                                                u_lname: me.last_name,
                                                gender: me.gender,
                                                reference_trip_id: t_id
                                                //, login_url: login_url
                                            },
                                            success: function(data){
                                                if(data.success){
                                                    window.location.replace(login_url);
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                        }, {scope: 'email'});
                    })
                    .on('click','form.log-in [type="submit"]',function(e){
                        e.preventDefault();

                        var $form = $(this).closest('form');

                        var email = $.trim($form.find('[name="data[User][email]"]').val());

                        if (email == '') {
                            alert('Please enter email address');
                            return false;
                        } else if (!email.toLowerCase().match(/^[_a-z0-9-]+(\.[_a-z0-9-]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]{2,4})$/)){
                            alert('Please enter valid email address');
                            return false;
                        }

                        $form.ajaxSubmit({
                            data: data,
                            success: function(html) {
                                var message = '';

                                $(html).find('.errorbox, .error-message').each(function(i,el){
                                    message = message + $(el).text() + '\n';
                                });

                                if (message.length) {
                                    alert(message);
                                } else {
                                    window.location.replace(login_url);
                                }
                            }
                        });
                    })
                    .on('click','form.sign-up [type="submit"]',function(e){
                        e.preventDefault();

                        var $form = $(this).closest('form');

                        var email = $.trim($form.find('[name="data[User][email]"]').val());

                        if (email == '') {
                            alert('Please enter email address');
                            return false;
                        } else if (!email.toLowerCase().match(/^[_a-z0-9-]+(\.[_a-z0-9-]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]{2,4})$/)){
                            alert('Please enter valid email address');
                            return false;
                        }

                        $form.ajaxSubmit({
                            data: data,
                            success: function(html) {
                                var message = '';

                                $(html).find('.errorbox, .error-message').each(function(i,el){
                                    message = message + $(el).text() + '\n';
                                });

                                if(message.length){
                                    alert(message);
                                }
                                else{
                                    window.location.replace(login_url);
                                }
                            }
                        });
                    })
                ;

                $('#reload_captcha')
                    .on('click', function(){
                        $('#reload_captcha').attr('src',APPLICATION_URL+'img/loading.gif?y='+Math.random()*1000);
                        $.ajax({ url: APPLICATION_URL + 'Pages/get_captcha_image',
                            type: "POST",
                            data: ({rand : (Math.random()*1000)}),
                            success: function(data){
                                $('#security_image').attr('src', APPLICATION_URL+'images/captcha/captcha.jpg?y='+Math.random()*1000);
                                $('#reload_captcha').attr('src',APPLICATION_URL+'img/refresh.png?y='+Math.random()*1000);
                            }});
                    })
                    .trigger('click');

                $modal.modal('show');
            });
        })
        .on('click', '.btn-edit-trip', function(){
            setTimeout(function(){
                $('.js-trip-name').editable('show');
            },200);
        })
        .on('click', '.btn-add-trip-buddies', function(){
            $.ajax({
                url		:	APPLICATION_URL+"trip/getAddTripBuddiesDialog/"+t_id,
                type	:	"POST",
                dataType:	"html",
                success	:	function(html){
                    var $modal = $("#myModal");

                    $modal.html(html).modal('show');
                }
            });
        })
        .on('click', '.btn-edit-trip-documents', function(){
            $.ajax({
                url			:	APPLICATION_URL+"trips/eticket",
                type		: "POST",
                dataType:	"JSON",
                data		:	({ t_id: t_id}),
                success	:	function(data){
                    if(data.success == '1'){
                        $("#myModal").html(data.html).modal('show');
                    }
                }
            });
        })
        .on('click','.js-trip-documents li a', function(e){
            downloaddocs($(this).closest('li').data('id'));
        })
        .on('click','.js-delete-doc', function(e){
            e.preventDefault();
            e.stopPropagation();
            deleteDocs($(this).closest('li').data('id'));
        })
        .on('click','.js-edit-doc', function(e){
            e.preventDefault();
            e.stopPropagation();
            editDocs($(this).closest('li').data('id'));
        })
        .on('click','.btn-fb-share, .js-btn-fb-share',function(){
            FB.ui({
                method: 'share',
                href: APPLICATION_URL + 'trips/publicindex/' + t_id,
                picture : APPLICATION_URL + 'img/fb-share-logo.jpg',
                description: 'I am planning a trip using pebblar notepad. check it out!'
            }, function(response){});
        })
        .on('click','.btn-send-itinerary, .js-btn-send-itinerary',function(){
            $.ajax({
                url		:	APPLICATION_URL+"trips/getSendToFriendsDialog/"+t_id,
                type	:	"POST",
                dataType:	"json",
                success	:	function(data){
                    $("#myModal").html(data).modal('show');
                }
            });
        })
        .on('click','.print-map', printMap)

        // map
        .on('mouseover','.destination-idea, .itinerary-location-idea-wrapper', function(){
            var $this = $(this), ideaId = $this.data('id') || $this.data('idea-id');

            var ideaMarker = $.grep(ideasMarkersClusterer.getMarkers(), function(ideaMarker){
                return ideaMarker.idea.tii_id == ideaId;
            })[0];

            if(ideaMarker instanceof RichMarker){
                var $markerContent = $(ideaMarker.content);

                if($markerContent.hasClass('day-marker')){
                    google.maps.event.addListenerOnce(ideaMarker, 'domready', function() {
                        var $ideaName = $markerContent.find('.marker-idea-name');

                        $ideaName.css({
                            left: -$ideaName.outerWidth()/2,
                            bottom: $markerContent.outerHeight() + 6
                        });
                    });
                }

                $markerContent.toggleClass('big-marker', true);

                ideaMarker.content_changed();
            }
        })
        .on('mouseout','.destination-idea, .itinerary-location-idea-wrapper', function(){
            var $this = $(this), ideaId = $this.data('id') || $this.data('idea-id');

            var ideaMarker = $.grep(ideasMarkersClusterer.getMarkers(), function(ideaMarker){
                return ideaMarker.idea.tii_id == ideaId;
            })[0];

            if(ideaMarker instanceof RichMarker){
                var $markerContent = $(ideaMarker.content);

                if($markerContent.hasClass('day-marker')){
                    google.maps.event.addListenerOnce(ideaMarker, 'domready', function() {
                        var $ideaName = $markerContent.find('.marker-idea-name');

                        $ideaName.css({
                            left: -$ideaName.outerWidth()/2,
                            bottom: $markerContent.outerHeight() + 6
                        });
                    });
                }

                $markerContent.toggleClass('big-marker', false);

                ideaMarker.content_changed();
            }
        })
        //.on('mouseleave', '.idea-marker', function(e) {
        //    e.preventDefault(); e.stopPropagation();
        //
        //    var $this = $(this);
        //
        //    var ideaMarker = $.grep(ideasMarkersClusterer.getMarkers(), function(ideaMarker){
        //        return ideaMarker.idea.tii_id == $this.data('idea-id');
        //    })[0];
        //
        //    if (infoWindow.isOpen() || infoWindow.getPosition() == ideaMarker.getPosition()) {
        //        infoWindow.close();
        //    }
        //})
        .on('click mouseenter','.idea-marker',function(e){
            e.preventDefault(); e.stopPropagation();

            var $this = $(this);

            var ideaMarker = $.grep(ideasMarkersClusterer.getMarkers(), function(ideaMarker){
                return ideaMarker.idea.tii_id == $this.data('idea-id');
            })[0];

            var $content = $(
                '<div id="marker-content">'+
                    '<div class="title">'+
                        '<div>'+
                            '<img src="'+ideaMarker.idea['tii_icon']+'" width="20">'+
                            '<span>'+ideaMarker.idea['tii_idea_title']+'</span>'+
                        '</div>'+
                    '</div>'+
                    '<div class="content">'+
                        '<p>'+
                            '<strong>Address: </strong>'+
                            '<span>'+(ideaMarker.idea['tii_idea_address'] || 'Unavailable')+'</span>'+
                        '</p>'+
                        '<p>'+
                            '<strong>Phone: </strong>'+
                            '<span>'+(ideaMarker.idea['tii_idea_phone'].replace(/\s/g, '') || 'Unavailable')+'</span>'+
                        '</p>'+
                        '<p>'+
                            '<strong>Email: </strong>'+
                            (ideaMarker.idea['tii_idea_email']
                                ? '<a target="_blank" href="mailto:'+ideaMarker.idea['tii_idea_email']+'">'+(ideaMarker.idea['tii_idea_email'])+'</a>'
                                : '<span>Unavailable</span>') +
                        '</p>'+
                        '<p>'+
                            '<strong>Website: </strong>'+
                                (ideaMarker.idea['tii_idea_website']
                                    ? '<a target="_blank" href="'+ideaMarker.idea['tii_idea_website']+'">'+(ideaMarker.idea['tii_idea_website'])+'</a>'
                                    : '<span>Unavailable</span>') +
                        '</p>'+
                        '<p>'+
                            '<strong>Opening Hours: </strong>'+
                            '<span>'+(ideaMarker.idea['tii_idea_opening_hours'].replace(/\s/g, '') || '00:00-00:00')+'</span>'+
                        '</p>'+
                    '</div>'+
                '</div>'
            );

            var $locations = $('.notepad-control .destination:not([data-tl-id="'+ideaMarker.idea['tii_tl_id']+'"])'),
                $link = $('<div class="move-google-idea"><select class="locations" data-style="btn-warning"><option value="" disabled selected>Move idea to</option></select></div>'),
                $linkLocations = $link.find('.locations');

            var closeFunction = function(){
                infoWindow.close();
                $linkLocations.selectpicker('destroy');
            };

            if($locations.length){
                $locations.each(function(){
                    var $location = $(this);
                    $linkLocations.append('<option value="'+$location.attr('data-tl-id')+'">'+$location.find('.destination-name').text()+'</option>');
                });

                $content.find('.content').append($link);

                $linkLocations.selectpicker({container: 'body'});

                $linkLocations
                    .on('shown.bs.select', function () {
                        $('.bs-container.locations').on('mouseleave', function (e) {
                            if(!$(e.relatedTarget).closest('.info-window').length){
                                closeFunction();
                            }
                        });
                    })
                    .on('change', function(e) {
                        if ($('.container.public-trip').length) {
                            showRegistrationDialog(e);
                            closeFunction();
                            return;
                        }

                        var tlId = $(this).val();

                        $.post(APPLICATION_URL + 'trip/moveIdea', {tii_id: $this.data('idea-id'), tl_id: tlId}).done(function(){
                            $.when.apply([], [
                                getLocation(tlId),
                                getLocation(ideaMarker.idea['tii_tl_id'])
                            ]).done(function(){
                                createNotepadLocationIdeasControl(map, tlId);

                                setLocationsCollapseState();

                                ideaMarker.idea['tii_tl_id'] = tlId;

                                closeFunction();
                            });
                        });
                    })
                ;
            }

            if (!infoWindow.isOpen() || infoWindow.getPosition() != ideaMarker.getPosition()) {
                infoWindow.setContent($content.get(0));

                infoWindow.open(map, ideaMarker);

                infoWindow.bubble_.addEventListener('mouseleave', function (e) {
                    if (e.relatedTarget && e.relatedTarget.tagName === "DIV" && !$(e.relatedTarget).closest('.bootstrap-select').length) {
                        closeFunction();
                    }
                });

                $this.on('mouseleave', function (e) {
                    if (!$(e.relatedTarget).closest('.info-window').length) {
                        closeFunction();
                    }
                });
            }

            if(e.type === 'click'){
                var getPixelOffset = function(map, marker) {
                    // Calculate marker position in pixels form upper left corner
                    var scale = Math.pow(2, map.getZoom());
                    var nw = new google.maps.LatLng(
                        map.getBounds().getNorthEast().lat(),
                        map.getBounds().getSouthWest().lng()
                    );
                    var worldCoordinateNW = map.getProjection().fromLatLngToPoint(nw);
                    var worldCoordinate = map.getProjection().fromLatLngToPoint(marker.getPosition());

                    return new google.maps.Point(
                        Math.floor((worldCoordinate.x - worldCoordinateNW.x) * scale),
                        Math.floor((worldCoordinate.y - worldCoordinateNW.y) * scale)
                    );
                };

                var interval = setInterval(function(){
                    if($('.info-window').length){
                        clearInterval(interval);

                        var pixelOffset = getPixelOffset(map, ideaMarker);

                        var $control = $('.notepad-location-ideas-control-wrapper');

                        if(!$control.length){
                            $control = $('.notepad-control-wrapper .in');
                        }

                        if($control.length){
                            var controlOffset = controlOffset = $control.offset().left - 5 + $control.outerWidth();
                            var $mapCanvas = $('#mapCanvas');

                            // Do the pan
                            map.panBy(
                                pixelOffset.x - (controlOffset + ($mapCanvas.outerWidth() - controlOffset) / 2),
                                pixelOffset.y - $mapCanvas.outerHeight() / 2
                            );
                        }
                    }
                });
            }
        })

        // notepad events
        .on('focus','.notepad-control .tactile-searchbox-input',function(){
            var $searchbox = $(this).closest('.searchbox');

            $searchbox.addClass('sbox-focus');

            $searchbox.toggleClass('sbox-empty', $searchbox.find('.destination-name').hasClass('editable-empty'));
        })
        .on('focusout','.notepad-control .tactile-searchbox-input',function(){
            $(this).closest('.searchbox').removeClass('sbox-focus');
        })
        .on('mouseover','.notepad-control .searchbox',function(){
            var $searchbox = $(this);

            $searchbox.addClass('sbox-hover');

            $searchbox.toggleClass('sbox-empty', $searchbox.find('.destination-name').hasClass('editable-empty'));
        })
        .on('mouseout','.notepad-control .searchbox',function(){
            $(this).removeClass('sbox-hover');
        })
        .on('click', '.widget-directions-remove-waypoint', function() {
            $('body').click();

            $('.loadingDiv').show();

            var $this = $(this);
            var location = $this.closest('[data-tl-id]');
            var locationId = location.attr('data-tl-id');
            var locationType = location.attr('data-tl-type');

            $.ajax({
                url: APPLICATION_URL + 'trip/deleteLocation',
                type: 'post',
                dataType: 'json',
                data: {tripId: t_id, locationId: locationId},
                success: function(data) {
                    if (data.success == '1') {

                        $('[data-location-id='+locationId+'].destination-logistic').remove();

                        if (locationType == 2 || locationType == 3) {
                            var locationCopy = location.clone();

                            locationCopy.attr('data-tl-id', '');
                            locationCopy.attr('data-place-id', '');
                            locationCopy.find('.destination-name').text('');
                            locationCopy.find('.destination-logistic').remove();

                            location.replaceWith(locationCopy);

                            initNotepadLocation(locationCopy);
                        } else {
                            var $prevLocation = location.prev();

                            if($prevLocation.hasClass('new-destination')){
                                $prevLocation = $prevLocation.prev();
                            }

                            var spinnerHtml = '<i class="fa fa-spin fa-spinner"></i>';

                            $('[data-location-id="'+$prevLocation.data('tl-id')+'"].destination-logistic .routes').html(spinnerHtml);

                            location.fadeOut(300).remove();
                        }

                        if (!$('.notepad-control .destination').length){
                            setViewType('new-view');

                            map.controls[google.maps.ControlPosition.TOP_RIGHT].clear();
                            map.controls[google.maps.ControlPosition.LEFT_CENTER].clear();

                            createSearchControl(map);
                        }

                        initMapObjects().done(function(){
                            getItineraryPanel();
                            getItineraryLeftPanel();

                            fitMapToLocationsBounds();
                        });

                        $('.loadingDiv').hide();
                    }
                }
            });
        })
        .on('click','.notepad-control .js-btn-hotels',function(){
            var $parent = $(this).closest('.searchbox'),
                $datesContainer = $parent.find('.dates-container'),
                $destinationContainer = $parent.find('.destination-container')
                ;

            var url = 'https://www.google.com/#tbm=lcl&q=hotels+in+'+$destinationContainer.find('.destination-name').text().replace(" ", "+");

            var dateFrom = new Date($datesContainer.find('.datepicker-from:first').val()),
                dateTo = new Date($datesContainer.find('.datepicker-to:first').val());

            if (
                Object.prototype.toString.call(dateFrom) == "[object Date]" && !isNaN(dateFrom.getTime()) &&
                Object.prototype.toString.call(dateTo) == "[object Date]" && !isNaN(dateTo.getTime())
            ) {
                if(dateFrom.getTime() == dateTo.getTime()){
                    dateTo.setTime( dateTo.getTime() + 86400000 );
                }

                var formattedDateFrom = dateFrom.getFullYear() + '-' + ('0' + (dateFrom.getMonth() + 1)).slice(-2) + '-' + ('0' + dateFrom.getDate()).slice(-2),
                    formattedDateTo = dateTo.getFullYear() + '-' + ('0' + (dateTo.getMonth() + 1)).slice(-2) + '-' + ('0' + dateTo.getDate()).slice(-2);

                url = url + '&hotel_dates=' + formattedDateFrom + ',' + formattedDateTo;
            }

            var win = window.open(url, '_blank');
            win.focus();

            $.post(APPLICATION_URL+"trips/updatecounter", {trip_id: t_id, counter: 't_hotel_prices_clicks'});
        })
        .on('click','.notepad-control .js-btn-dates-add, .notepad-control .btn-dates-edit',function(){
            var $parent = $(this).closest('.searchbox'),
                $datesContainer = $parent.find('.dates-container'),
                $destinationContainer = $parent.find('.destination-container'),
                $location = $parent.closest('.destination')
            ;

            var selectedRanges = [];

            $parent.closest('.widget-directions-searchboxes').find(".destination .dates-container:not(.hide) .btn-dates-done").each(function(){
                $(this).trigger('click');
            });

            $parent.closest('.widget-directions-searchboxes').find(".destination:not([data-tl-id='"+$location.attr('data-tl-id')+"']) .dates-container").each(function(){
                var $currentDatesContainer = $(this);

                $currentDatesContainer.find('.dates').each(function(){
                    var $dates = $(this), $datepickerFrom = $dates.find('.datepicker-from'), $datepickerTo = $dates.find('.datepicker-to');

                    if($datepickerFrom.val() && $datepickerTo.val()){
                        selectedRanges.push([ new Date($datepickerFrom.val()), new Date($datepickerTo.val()) ]);
                    }
                });
            });

            $destinationContainer.toggleClass('hide',true);
            $datesContainer.toggleClass('hide',false);

            $datesContainer.find(".datepicker-from").datepicker({
                showButtonPanel:false,
                changeMonth:true,
                changeYear:true,
                onSelect: function() {
                    var $this = $(this), $datepickerTo = $this.parent().find('.datepicker-to');

                    if($this.val()){
                        $this.attr('data-saved-date', $this.val());

                        if($datepickerTo.attr('data-saved-date')){
                            $parent.find('.btn-dates-done').trigger('click');
                        }
                        else{
                            $datepickerTo.attr('data-saved-date', null);

                            if(!$datepickerTo.val().length){
                                $datepickerTo.datepicker("setDate", $this.val());
                            }
                        }
                    }
                },
                beforeShow: function(){
                    var $this = $(this),
                        $datepickerTo = $this.parent().find('.datepicker-to'),
                        datepickerToDate = $datepickerTo.attr('data-saved-date') ? new Date($datepickerTo.attr('data-saved-date')) : null,
                        datepickerFromDate = null
                    ;

                    if(datepickerToDate){
                        $.each(selectedRanges, function(i, selectedRange){
                            if(datepickerFromDate < selectedRange[0]){
                                if(
                                    selectedRange[0] < datepickerToDate
                                    ||
                                    (
                                        selectedRange[1].getTime() == datepickerToDate.getTime()
                                        &&
                                        selectedRange[0].getTime() != selectedRange[1].getTime()
                                    )
                                ){
                                    datepickerFromDate = selectedRange[1];
                                }
                            }
                        });
                    }

                    $this.datepicker('option', 'minDate', datepickerFromDate);
                    $this.datepicker('option', 'maxDate', datepickerToDate);
                },
                beforeShowDay: function(day){
                    var $this = $(this),
                        maxDate = $this.datepicker('option', 'maxDate'),
                        minDate = $this.datepicker('option', 'minDate'),
                        result = [true, '', '']
                    ;

                    if(maxDate && day > maxDate){
                        result = [false, '', 'This date is greater than date to'];
                    }
                    else if(minDate && day < minDate){
                        result = [false, '', 'Invalid date! The resulting interval will contain the date ranges of other cities'];
                    }
                    else{
                        $.each(selectedRanges, function(i, selectedRange){
                            if(selectedRange[0] < day && day < selectedRange[1]){
                                result = [false, '', 'This date has already been selected for another city'];
                                return false;
                            }
                        });
                    }

                    return result;
                }
            });

            $datesContainer.find(".datepicker-to").datepicker({
                showButtonPanel:false, changeMonth:true, changeYear:true,
                onSelect: function() {
                    var $this = $(this), $datepickerFrom = $this.parent().find('.datepicker-from');

                    if($this.val()){
                        $this.attr('data-saved-date', $this.val());

                        if($datepickerFrom.attr('data-saved-date')){
                            $parent.find('.btn-dates-done').trigger('click');
                        }
                        else{
                            $datepickerFrom.attr('data-saved-date', null);

                            if(!$datepickerFrom.val().length){
                                $datepickerFrom.datepicker("setDate", $this.val());
                            }
                        }
                    }
                },
                beforeShow: function(){
                    var $this = $(this),
                        $datepickerFrom = $this.parent().find('.datepicker-from'),
                        datepickerFromDate = $datepickerFrom.attr('data-saved-date') ? new Date($datepickerFrom.attr('data-saved-date')) : null,
                        datepickerToDate = null
                    ;

                    if(datepickerFromDate){
                        $.each(selectedRanges, function(i, selectedRange){
                            if(!datepickerToDate || datepickerToDate > selectedRange[0]){
                                if(
                                    selectedRange[0] > datepickerFromDate
                                    ||
                                    (
                                        selectedRange[0].getTime() == datepickerFromDate.getTime()
                                        &&
                                        selectedRange[0].getTime() != selectedRange[1].getTime()
                                    )
                                ){
                                    datepickerToDate = selectedRange[0];
                                }
                            }
                        });
                    }

                    $this.datepicker('option','minDate', datepickerFromDate);
                    $this.datepicker('option','maxDate', datepickerToDate);
                },
                beforeShowDay: function(day){
                    var $this = $(this),
                        minDate = $this.datepicker('option', 'minDate'),
                        maxDate = $this.datepicker('option', 'maxDate'),
                        result = [true, '', '']
                    ;

                    if(minDate && day < minDate){

                        result = [false, '', 'This date is less than date from'];
                    }
                    else if(maxDate && day > maxDate){
                        result = [false, '', 'Invalid date! The resulting interval will contain the date ranges of other cities'];
                    }
                    else{
                        $.each(selectedRanges, function(i, selectedRange){
                            if(selectedRange[0] < day && day < selectedRange[1]){
                                result = [false, '', 'This date has already been selected for another city'];
                                return false;
                            }
                        });
                    }

                    return result;
                }
            });

            if(!$datesContainer.find(".dates:first-child .datepicker-from").val()){
                var lastDateTo = null;

                $parent.closest('.widget-directions-searchboxes').find(".datepicker-to").each(function(i, el) {
                    var $el = $(el), pickerDate = $el.val() ? new Date($el.val()) : new Date();

                    if ($el.closest('.destination').attr('data-tl-id') == $location.attr('data-tl-id')) { return false; }

                    pickerDate.setHours(0,0,0,0);

                    if(pickerDate && (!lastDateTo || lastDateTo.getTime() < pickerDate.getTime())){
                        lastDateTo = pickerDate;
                    }
                });

                if(lastDateTo != null){
                    $datesContainer.find(".dates:first-child .datepicker-from").attr('data-saved-date',lastDateTo).datepicker("setDate", lastDateTo);
                }
            }
        })
        .on('click','.notepad-control .btn-dates-reset',function(){
            var $parent = $(this).closest('.searchbox'),
                $container = $parent.closest('.widget-directions-searchbox-container'),
                $datesContainer = $parent.find('.dates-container'),
                $firstDates = $datesContainer.find('.dates:first-child')
            ;

            $datesContainer.find('.dates:not(:first-child)').each(function(i,el){
                var $el = $(el);

                if($el.data('tld-id')){
                    removedDates.push($el.data('tld-id'));
                }

                $el.remove();
            });

            if($firstDates.data('tld-id')){
                removedDates.push($firstDates.data('tld-id'));
            }

            $firstDates.attr('data-tld-id',0);
            $firstDates.data('tld-id',0);

            $firstDates.find('input').val('');

            $container.find('.btn-dates-edit').val('').toggleClass('hide',true);
            $container.find('.btn-dates-add').val('').toggleClass('hide',false);
        })
        .on('click','.notepad-control .btn-dates-done', function(e) {
            var $location = $(this).closest('.widget-directions-searchbox-container');

            if ($('.container.public-trip').length) {
                $location.find('.destination-container').toggleClass('hide', false);
                $location.find('.dates-container').toggleClass('hide', true);

                $location.find('.dates').each(function(i,el){
                    var $datesContainer = $(el);

                    var tld_id = $datesContainer.data('tld-id')||0;

                    var dateFromInput = $datesContainer.find('.datepicker-from');
                    var dateToInput = $datesContainer.find('.datepicker-to');

                    dateFromInput.datepicker("setDate", null);
                    dateToInput.datepicker("setDate", null);
                });

                showRegistrationDialog(e);
                return false;
            }

            var $locations = $location.closest('.widget-directions-searchboxes');

            var tl_id = $location.data('tl-id');

            var deferreds = [];

            while(removedDates.length){
                var tld_id = removedDates.pop();

                deferreds.push($.ajax({
                    url			:	APPLICATION_URL+"trips/removelocationdate",
                    type		:	"POST",
                    data		:	({t_id:t_id, tl_id:tl_id, tld_id:tld_id}),
                    dataType:	"JSON",
                    success	:	function(data){
                        if(data.success == '1'){
                            addLog(data.log);
                        }else{
                            alert("Error: unable to remove date successfully.");
                        }
                    }
                }));
            }

            $location.find('.dates').each(function(i,el){
                var $datesContainer = $(el);

                var tld_id = $datesContainer.data('tld-id')||0;

                var dateFromInput = $datesContainer.find('.datepicker-from');
                var dateToInput = $datesContainer.find('.datepicker-to');

                if(dateFromInput.val() && dateToInput.val())
                {
                    deferreds.push($.ajax({
                        url			:	APPLICATION_URL+"trips/savetriplocationdate",
                        async		:	true,
                        type		:	"POST",
                        dataType:	"JSON",
                        data		:	({t_id: t_id, tl_id: tl_id, tld_id: tld_id, tl_s_dates: dateFromInput.val(), tl_e_dates: dateToInput.val() }),
                        success	:	function(data){
                            if(data.success == '1'){
                                addLog(data.log);
                            }else{
                                alert("Error: " + data.msg);
                            }
                        }
                    }));
                }
                else{
                    dateFromInput.datepicker( "setDate", null );
                    dateToInput.datepicker( "setDate", null );
                }
            });

            $.when.apply(null, deferreds).done(function() {
                $.post(APPLICATION_URL+"trip/getNotepadLocation/" + t_id + '/' +tl_id, function(html){
                    var $html = $(html);

                    var $targetLocation, targetDirection;

                    $('.popover').remove();

                    $location.find('.dates').each(function(i,el){
                        var $datesContainer = $(el);

                        var dateFromInput = $datesContainer.find('.datepicker-from');
                        var dateToInput = $datesContainer.find('.datepicker-to');

                        if(dateFromInput.val() && dateToInput.val())
                        {
                            if($location.closest('.widget-directions-searchboxes').find('.datepicker-from[value!=""]').length > 1){
                                var dateFrom = new Date(dateFromInput.val()),
                                    dateTo = new Date(dateToInput.val());

                                $location.prevAll('.destination').each(function(){
                                    var $prevDateFromInput = $(this).find('.datepicker-from'),
                                        $prevDateToInput = $(this).find('.datepicker-to'),
                                        prevDateFrom = $prevDateFromInput.val() ? new Date($prevDateFromInput.val()) : null,
                                        prevDateTo = $prevDateToInput.val() ? new Date($prevDateToInput.val()) : null;

                                    if(prevDateFrom){
                                        if(prevDateFrom.getTime() == prevDateTo.getTime() && dateFrom.getTime() == dateTo.getTime() && prevDateFrom.getTime() == dateFrom.getTime()){
                                            targetDirection = 'after';
                                            $targetLocation = $prevDateFromInput.closest('.destination');
                                            return false;
                                        }
                                        else if(dateTo <= prevDateFrom){
                                            targetDirection = 'before';
                                            $targetLocation = $prevDateFromInput.closest('.destination');
                                        }
                                        else{
                                            //return false;
                                        }
                                    }
                                    else if($targetLocation){
                                        //$targetLocation = $currentDateFromInput.closest('.destination');
                                    }
                                });

                                if(!$targetLocation){
                                    targetDirection = 'after';

                                    $location.nextAll('.destination').each(function(){
                                        var $nextDateToInput = $(this).find('.datepicker-to');
                                        var nextDateTo = $nextDateToInput.val() ? new Date($nextDateToInput.val()) : null;

                                        if(nextDateTo){
                                            if(dateFrom >= nextDateTo){
                                                $targetLocation = $nextDateToInput.closest('.destination');
                                            }
                                        }
                                    });
                                }

                                if($targetLocation){
                                    if(targetDirection === 'before'){
                                        $location.insertBefore($targetLocation);
                                    }
                                    else{
                                        $location.insertAfter($targetLocation);
                                    }
                                }
                            }
                        }
                    });

                    $location.replaceWith($html);

                    $locations.sortable( "refresh" );

                    if($targetLocation){
                        $locations.sortable('option','update')(null, {item: $html});
                    }

                    initNotepadLocation($html);

                    getItineraryPanel();
                    getItineraryLeftPanel();

                    getLogisticInfo();

                    initMapObjects();

                    setLocationsCollapseState($('.widget-directions-searchbox-container[data-tl-id="'+tl_id+'"]'));
                });
            });

            $location.find('.destination-container').toggleClass('hide',false);
            $location.find('.dates-container').toggleClass('hide',true);
        })
        .on('click','.notepad-control .btn-dates-delete', function(){
            var $datesContainer = $(this).closest('.dates');

            if($datesContainer.data('tld-id')){
                removedDates.push($datesContainer.data('tld-id'));
            }
            $datesContainer.remove();
        })
        .on('click','.notepad-control .btn-show-ideas', function(){
            createNotepadLocationIdeasControl(map, $(this).closest('.destination').data('tl-id'));

            var $location = $(this).closest('.destination');

            if($location.attr('data-place-id')){
                var placesService = new google.maps.places.PlacesService(map);

                placesService.getDetails({placeId: $location.attr('data-place-id')}, function(place, status) {
                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                        if(place.geometry && place.geometry.viewport){
                            map.fitBounds(place.geometry.viewport);

                            if (map.getZoom() < CITY_LEVEL_ZOOM) {
                                map.setZoom(CITY_LEVEL_ZOOM);
                            }
                        }
                    }
                });
            }
        })
        .on('click','.notepad-control .btn-show-itinerary', function(e){ showItinerary(e); })

        // notepad location ideas control events
        .on('click', '.location-idea-photo-icon img', function () {
            var $idea = $(this).closest('.itinerary-location-idea-wrapper');

            var d = new Date(parseInt($idea.attr('data-location-date')) * 1000);

            d.setTime(d.valueOf() - 60000 * d.getTimezoneOffset());
            addNotesPhotos($idea.attr('data-location-id'), $idea.attr('data-idea-id'), d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2), '0', '2')
        })
        .on('click','.notepad-location-ideas-control .idea-dates-wrapper .idea-date',function(){
            var $this = $(this);

            $this.toggleClass('selected');

            var locationId = $this.data('locationid');
            var ideaId     = $this.data('ideaid');
            var date       = $this.data('date');

            var ideasCost = getIdeasCost($this.closest('.notepad-location-ideas-control'));

            $('.notepad-control .destination[data-tl-id="'+locationId+'"]').find('.location-cost').html(ideasCost > 0 ? ideasCost : '');

            $.ajax({
                //url: APPLICATION_URL + 'trips/addeditideadate',
                url: APPLICATION_URL + 'trip/setIdeaDate',
                type: 'post',
                dataType: 'json',
                async: false,
                data: {t_id: t_id, tl_id: locationId, tii_id: ideaId, val: date},
                success: function(data) {
                    if (data.success == '1') {
                        alertmessage("Idea date saved successfully.", "success");
                    } else if(data.success == '2') {
                        alertmessage("Idea date removed successfully.", "success");
                    }

                    addLog(data.log);

                    initMapIdeas();

                    getItineraryPanel();
                    getItineraryLeftPanel();
                }
            });
        })
        .on('mouseover','.notepad-location-ideas-control .destination-idea',function(){
            $(this).find('.widget-ideas-remove-waypoint').addClass('idea-hover');
        })
        .on('mouseout','.notepad-location-ideas-control .destination-idea',function(){
            $(this).find('.widget-ideas-remove-waypoint').removeClass('idea-hover');
        })
        .on('mouseleave', '.notepad-location-ideas-control .idea-notes form', function(){
            var $this = $(this).find('.form-control'), $editable = $this.closest('.idea-notes').find('.editable');

            if($editable.editable('getValue')['notes'] != $this.val()){
                $editable.trigger('save', {newValue: $this.val()});
            }

            $editable.editable('hide');
        })
        .on('mouseleave', '.notepad-control .destination-logistic form', function(){
            var $this = $(this).find('.form-control'), $editable = $this.closest('.destination-logistic').find('.editable');

            if($editable.editable('getValue')['notes'] != $this.val()){
                $editable.trigger('save', {newValue: $this.val()});
            }

            $editable.editable('hide');
        })
        .on('click','.notepad-location-ideas-control .show-viator-ideas', function(e){
            e.preventDefault();

            var $location = $('.notepad-control .destination[data-tl-id="'+$(this).closest('.panel').data('tl-id')+'"]'), city = $location.find('.destination-name').text();

            $.get(APPLICATION_URL+'trip/getViatorIdeas/', {city: city}, function(viatorIdeas){
                var $modalDialog = $(
                    '<div class="modal fade" id="viatorDialog">' +
                    '<div class="modal-dialog modal-md">' +
                    '<div class="modal-content">' +
                    '<div class="modal-header">' +
                    '<button type="button" class="close" data-dismiss="modal" aria-hidden="true" style="z-index:999999; position:relative;">×</button>' +
                    '<h4 class="modal-title" style="display: inline-block; margin-right: 15px;">Things to do in '+city+'</h4> <i>powered by <img class="viator-logo" src="/img/viator100x40.png" /></i>' +
                    '</div>' +
                    '<div class="modal-body"></div>' +
                    '<div class="modal-footer row">' +
                    '<div class="col-sm-12 viator-description">pebblar will always be free. Help us keep it this way by purchasing tours and activities from our partners at no extra cost to you.</div>' +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '</div>'
                );

                if(viatorIdeas && viatorIdeas.length){
                    var $viatorProducts = $('<table class="viator-products table-hover"></table>');

                    $.each(viatorIdeas, function(){
                        var productData = this;

                        var viatorProduct = $(
                            '<tr data-rank="'+productData['Rank']+'">' +
                            '<td class="product-name"></td>' +
                            '<td class="product-price"></td>' +
                            '<td class="product-link"><a class="btn-orange" target="_blank">Details</a></td>' +
                            '</tr>'
                        );

                        viatorProduct.find('.product-name').html(productData['ProductName']).on('click', function(){
                            $.post(APPLICATION_URL+"trips/updatecounter", {trip_id: t_id, counter: 't_viator_clicks'});
                            window.open(productData['ProductURL'], '_blank');
                        });

                        viatorProduct.find('.product-price').html('$'+Math.round(parseFloat(productData['PriceUSD'])));

                        viatorProduct.find('.product-link a').attr('href',productData['ProductURL']).on('click', function(){
                            $.post(APPLICATION_URL+"trips/updatecounter", {trip_id: t_id, counter: 't_viator_clicks'});
                        });

                        $viatorProducts.append(viatorProduct);
                    });

                    $viatorProducts.append('<tr><td colspan="3"><a class="btn-orange" target="_blank" href="https://www.partner.viator.com/prodSearch.jspa?PUID=18601&destinationID='+viatorIdeas[0]['DestinationID']+'">See more activities for '+city+'...</a></td></tr>');

                    $modalDialog.find('.modal-body').append($viatorProducts);
                }
                else{
                    $modalDialog.find('.modal-body').append('No Viator ideas found!');
                }

                $modalDialog.modal('show');
            }, 'json');

            return false;
        })
        .on('click','.notepad-location-ideas-control .btn-hotels-booking',function(e){
            $.post(APPLICATION_URL+"trips/updatecounter", {trip_id: t_id, counter: 't_hotels_clicks'});
        })
        .on('click', '.notepad-location-ideas-control .widget-ideas-remove-waypoint', function() {
            $('body').click();

            var $this     = $(this);
            var $panel    = $this.closest('.panel');
            var $location = $('.notepad-control .destination[data-tl-id="'+$panel.data('tl-id')+'"]');
            var ideaId    = $this.closest('.destination-idea').data('id');

            $(".loadingDiv").show();

            $.ajax({
                url: APPLICATION_URL + 'trips/deleteidea',
                type: 'post',
                dataType: 'json',
                data: {t_id: t_id, tii_id: ideaId},
                success: function(data) {
                    if (data.success == '1') {
                        $this.closest('div').fadeOut(300).remove();

                        $('.popover').remove();

                        reInitScrollPane();

                        initMapIdeas();

                        getItineraryPanel();
                        getItineraryLeftPanel();

                        $location.attr('data-ideas-count', $location.attr('data-ideas-count') - 1);

                        setLocationsCollapseState($location);

                        addLog(data.log);

                        alertmessage('Trip location idea removed.', 'success');
                    } else {
                        alertmessage('Unable to remove trip location idea.', 'error');
                    }

                    $(".loadingDiv").hide();
                }
            });
        })
        .on('click', '.notepad-location-ideas-control .panel-heading:not(.collapsed)', function () {
            setTimeout(removeNotepadLocationIdeasControl, 500);
        })
        .on('click touchstart','.notepad-location-ideas-control [data-type="2"] .idea-icon img',function(){
            var tii_id = $(this).closest('.destination-idea').data('id'),
                tl_id = $(this).closest('.panel').data('tl-id');

            getIdeaDetailsDialog(tii_id, tl_id);
        })
        .on('click touchstart','.notepad-location-ideas-control .idea-icon img',function() {
            var $idea = $(this).closest('.destination-idea'),
                ideaLatLng = new google.maps.LatLng($idea.attr('data-lat'), $idea.attr('data-lng')),
                bounds = new google.maps.LatLngBounds(),
                tii_id = $idea.data('id');

            if (ideaLatLng.toString() != '(0, 0)'){
                map.panTo(ideaLatLng);

                fitBoundsWithHalfZoom(bounds.extend(ideaLatLng));

                /*map.fitBounds(bounds.extend(ideaLatLng));*/

                if(map.getZoom() > 18){
                    map.setZoom(18);
                }

                var interval = setInterval(function(){
                    var $marker = $('.idea-marker[data-idea-id="'+tii_id+'"]');

                    if($marker.length){
                        $('.idea-marker[data-idea-id="'+tii_id+'"]').trigger('click');
                        clearInterval(interval);
                    }
                },150);
            }
        })
        .on('click','.notepad-location-ideas-control .restaurant-reviews a',increaseReviewSitesClicksCounter)
        .on('click touchstart','.notepad-location-ideas-control [data-type="3"] .idea-icon-dropdown .dropdown-menu a', function () {
            var $this = $(this), $idea = $this.closest('.destination-idea'), imgSrc = $this.find('img').attr('src');

            updateIdea({
                tii_id: $idea.data('id'),
                tii_icon: imgSrc
            }).done(function(){
                $idea.find('.idea-icon img').attr('src', imgSrc);

                var ideaMarker = $.grep(ideasMarkersClusterer.getMarkers(), function(ideaMarker){
                    return ideaMarker.idea.tii_id == $idea.data('id');
                })[0];

                if (ideaMarker && (infoWindow.isOpen() || infoWindow.getPosition() == ideaMarker.getPosition())) {
                    infoWindow.close();
                }

                initMapIdeas();
            });

            $('body').trigger('click');
        })
        .on('click','.notepad-location-ideas-control .editable a', function (e) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            var win = window.open($(this).attr('href'), '_blank');
            win.focus();
        })

        // itinerary
        .on('click touchstart','.container:not(.public-trip) .your-itinerary [data-idea-type="2"] .location-idea-icon img', function(){
            var $idea = $(this).closest('.itinerary-location-idea-wrapper');

            getIdeaDetailsDialog($idea.data('idea-id'), $idea.data('location-id'));
        })
        .on('click touchstart','.your-itinerary .location-idea-icon img',function(){
            var $idea = $(this).closest('.itinerary-location-idea-wrapper'),
                ideaLatLng = new google.maps.LatLng($idea.attr('data-idea-lat'), $idea.attr('data-idea-lng')),
                bounds = new google.maps.LatLngBounds(),
                tii_id = $idea.data('idea-id');

            if(ideaLatLng.toString() !== '(0, 0)'){
                map.panTo(ideaLatLng);

                fitBoundsWithHalfZoom(bounds.extend(ideaLatLng));

                /*map.fitBounds(bounds.extend(ideaLatLng));*/

                if(map.getZoom() > 18){
                    map.setZoom(18);
                }

                var interval = setInterval(function(){
                    var $marker = $('.idea-marker[data-idea-id="'+tii_id+'"]');

                    if($marker.length){
                        $('.idea-marker[data-idea-id="'+tii_id+'"]').trigger('click');
                        clearInterval(interval);
                    }
                },150);
            }
        })
        .on('blur','.your-itinerary .notes',function(e){
            var $this = $(this), oldValue = $this.attr('data-old-value')||'', value = $.trim($this.val());

            if (oldValue != value) {
                $this.attr('data-old-value', value);
                updateDayNoteText($this.attr('data-pk'), $this.attr('data-trip-date'), value);
            }
        })
        .on('mouseleave', '.your-itinerary', function() {
            $(this).find('.notes').each(function(){
                var $thisNote = $(this),
                    oldValue = $thisNote.attr('data-old-value'),
                    value = $.trim($thisNote.val());

                if (oldValue != undefined && oldValue != value) {
                    $thisNote.blur();
                }
            });
        })
        .on('mouseenter focusin','.your-itinerary .notes',function(){
            var $this = $(this);
            $this.attr('data-old-value',$.trim($this.val()));
        })
        .on('keypress', '.your-itinerary .notes', function(e) {
            if (e.keyCode == 10 || e.keyCode == 13) {
                e.preventDefault();

                if (e.ctrlKey || e.shiftKey) $(this).val($(this).val()+'\n');
                else $(this).blur();
            }
        })
        .on('click touchstart','.tripit_slider_pencilhover .tripit_slider_show',function(){
            var $container = $(this).closest('li');

            $container.find('a').trigger('click');

            $('.tripit_slider_pencilhover').hide();
        })
        .on('click touchstart','ul#photo-list img.itineray-photo',function() {
            var $container = $(this).closest('li');

            $container.find('a').trigger('click');

            // $('.tripit_slider_pencilhover').hide();
        })
        .on('click touchstart','.tripit_slider_pencilhover .tripit_slider_cover',function(){
            var $container = $(this).closest('li');

            makeCoverPage($container.data('tnp-image-name'));
            $('.tripit_slider_pencilhover').hide();
        })
        .on('click touchstart','.tripit_slider_pencilhover .tripit_slider_delete',function(){
            var $container = $(this).closest('li');

            deleteNoteImage($container.data('tnp-id'), $container.data('tnp-image-name'));
            $('.tripit_slider_pencilhover').hide();
        })
        .on('click', '.print-itinerary', function () {
            $.post(APPLICATION_URL + "trips/updatecounter", {trip_id: t_id, counter: 't_print_clicks'});

            var $notepadControl = $('.notepad-control');

            if ($notepadControl.length) {
                var $panel = $notepadControl.find('.panel-collapse');

                if ($panel.length && $panel.hasClass('collapse')) {
                    $notepadControl.find('.panel-heading').toggleClass('collapsed', false);
                    $panel.collapse('show');
                }

                if (!$notepadControl.find('.btn-dates-edit:not(.hide)').length) {
                    var $addDatesBtn = $notepadControl.find('.js-btn-dates-add:not(.hide)').first();
                    var tl_id = $addDatesBtn.closest('.widget-directions-searchbox-container').data('tl-id');

                    $notepadControl.find('.panel-body').scrollTop(0);

                    $addDatesBtn.trigger('click');

                    introJs()
                        .setOptions({
                            steps: [
                                {
                                    element: '.notepad-control [data-tl-id="' + tl_id + '"] .dates-container',
                                    intro: "We'll need some dates from you first before we can generate your itinerary"
                                }
                            ],
                            showBullets: false,
                            showStepNumbers: false,
                            doneLabel: 'Ok'
                        })
                        .start();
                } else {
                    window.open(APPLICATION_URL + 'trip/printItinerary/' + t_id, '_blank');
                }
            }
            else {
                window.open(APPLICATION_URL + 'trip/printItinerary/' + t_id, '_blank');
            }
        })
        .on('click', '.idea-carousel-arrow', function() {
            $(this).next().fadeToggle(150);
            $(this).find('i').toggleClass('fa-plus fa-times');
        })
        .on('click', '#slider a', function(e, changeMapBounds) {
            changeMapBounds = (changeMapBounds === undefined ? true : changeMapBounds);

            var $this = $(this);
            var date = sliderItemState = $this.attr('href');

            $('#slider').find('a').removeClass('selected');

            $this.addClass('selected');

            $('.itinerary-date-item').removeClass('selected');
            $('.itinerary-date-item[data-location-date='+date+']').addClass('selected');
            $('.itinerary-date-item[data-location-date='+date+'] .notes').xautoresize();

            initMapIdeasDirections(changeMapBounds);

            e.preventDefault();
        })

        // other
        .on('click', '[data-target="#log"]', function(){
            setLogCollapseState();
        })
        .on('click','#affilateBoxContent a',function(){
            $.post(APPLICATION_URL+"trips/updatecounter", {trip_id: t_id, counter: 't_affiliate_clicks'});
        })
    ;

    setLogCollapseState();

    $('.container:not(.public-trip) .js-trip-name')
        .on('save', function(e, params) {
            params.newValue = $.trim(params.newValue);

            $.ajax({
                url		:	APPLICATION_URL+"trips/updatetripname",
                type	:	"POST",
                dataType:	"json",
                data	:	({tripid: t_id, name: params.newValue}),
                success	:	function(data){
                    if(data.success == '1'){
                        addLog(data.log);
                    }
                }
            });
        })
        .editable({
            type: 'text',
            showbuttons: false,
            emptytext: 'enter trip name',
            placeholder: 'enter trip name',
            mode: 'inline',
            unsavedclass: null
        });

    var rtime;
    var timeout = false;
    var delta = 200;

    $(window).resize(function() {
        rtime = new Date();
        if (timeout === false) {
            timeout = true;
            setTimeout(resizeend, delta);
        }
    });

    function resizeend() {
        if (new Date() - rtime < delta) {
            setTimeout(resizeend, delta);
        } else {
            timeout = false;
            resizeView();
        }
    }

    setViewType();

    initMap();

    if (isMobile()) {
        $('.mobile-navigation').show();
    }

    if($('.container').hasClass('guest-trip')){
        setInterval(showRegistrationDialog, 60000);
    }

    $(".orgFooter").remove();

    window.fbAsyncInit = function() {
        FB.init({
            appId      : FACEBOOK_APP_ID,
            xfbml      : true,
            status     : false, // check login status
            cookie     : true,  // enable cookies to allow the server to access the session
            version    : 'v2.10'
        });
    };

    (function(d){
        var js, id = 'facebook-jssdk', ref = d.getElementsByTagName('script')[0];
        if (d.getElementById(id)) {return;}
        js = d.createElement('script'); js.id = id; js.async = true;
        js.src = "//connect.facebook.net/en_US/all.js";
        ref.parentNode.insertBefore(js, ref);
    }(document));

    (function(d, sc, u) {
        var s = d.createElement(sc), p = d.getElementsByTagName(sc)[0];
        s.type = 'text/javascript';
        s.async = true;
        s.src = u + '?v=' + (+new Date());
        p.parentNode.insertBefore(s,p);
    })(document, 'script', '//aff.bstatic.com/static/affiliate_base/js/flexiproduct.js');
});

function showRegistrationDialog(e, url) {
    if (e) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    }

    var $originalModal = $('#registrationDialog');

    if($originalModal.attr('data-is-showed') == 'false'){
        var $modal = $originalModal.clone();
        var login_url = url||'';

        var data = {
            'data[reference_trip_id]': t_id,
            'data[login_url]': login_url
        };

        var $homeCity = $modal.find('#home_city');

        var autocomplete = new google.maps.places.Autocomplete($homeCity.get(0)/*,{types:['(cities)']}*/);

        google.maps.event.addListener(autocomplete, 'place_changed', function() {
            var place = autocomplete.getPlace();

            if (!place.geometry) {
                return;
            }

            $homeCity.val(place.name);

            $modal.find('#UserULatitude').val(place.geometry.location.lat());
            $modal.find('#UserULongitude').val(place.geometry.location.lng());
        });

        $modal
            .on('click', '.np2_fbbutton', function(){
                FB.login(function(response) {
                    if (response.authResponse) {
                        // user has auth'd your app and is logged into Facebook
                        FB.api('/me?fields=email,name,first_name,last_name,gender,location', function(me){
                            if (me.id) {
                                // console.log(me);
                                $.ajax({
                                    url: APPLICATION_URL + "index/save_social_data",
                                    type: "POST",
                                    dataType: "json",
                                    data: {
                                        u_facebook_login_id: me.id,
                                        email: me.email,
                                        u_fname: me.first_name,
                                        u_lname: me.last_name,
                                        gender: me.gender,
                                        reference_trip_id: t_id,
                                        login_url: login_url
                                    },
                                    success: function(data){
                                        if(data.success){
                                            window.location.replace(login_url);
                                        }
                                    }
                                });
                            }
                        });
                    }
                }, {scope: 'email'});
            })
            .on('click','form.log-in [type="submit"]',function(e){
                e.preventDefault();

                var $form = $(this).closest('form');

                var email = $.trim($form.find('[name="data[User][email]"]').val());

                if (email == '') {
                    alert('Please enter email address');
                    return false;
                } else if (!email.toLowerCase().match(/^[_a-z0-9-]+(\.[_a-z0-9-]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]{2,4})$/)){
                    alert('Please enter valid email address');
                    return false;
                }

                $form.ajaxSubmit({
                    data: data,
                    success: function(html) {
                        var message = '';

                        $(html).find('.errorbox, .error-message').each(function(i,el){
                            message = message + $(el).text() + '\n';
                        });

                        if(message.length) {
                            alert(message);
                        } else {
                            window.location.replace(login_url);
                        }
                    }
                });
            })
            .on('click','form.sign-up [type="submit"]',function(e){
                e.preventDefault();

                var $form = $(this).closest('form');

                var email = $.trim($form.find('[name="data[User][email]"]').val());

                if (email == '') {
                    alert('Please enter email address');
                    return false;
                } else if (!email.toLowerCase().match(/^[_a-z0-9-]+(\.[_a-z0-9-]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]{2,4})$/)){
                    alert('Please enter valid email address');
                    return false;
                }

                setTimeout(function(){
                    $form.ajaxSubmit({
                        data: data,
                        success: function(html) {
                            var message = '';

                            $(html).find('.errorbox, .error-message').each(function(i,el){
                                message = message + $(el).text() + '\n';
                            });

                            if (message.length) {
                                alert(message);
                            } else {
                                window.location.replace(login_url);
                            }
                        }
                    });
                }, 300);
            })
            .on('hidden.bs.modal', function(){
                $originalModal.attr('data-is-showed', false);
                $modal.remove();
            })
        ;

        $modal.modal('show');

        $originalModal.attr('data-is-showed', true);
    }
}

function renderLogisticRow(direction) {
    fixHomeLogisticRows();

    var $logisticRow = $('.destination-logistic[data-location-id='+direction.get('origin_id')+']');

    var origin = locationDirections.locations.findWhere({tl_id: direction.get('origin_id')}),
        destination = locationDirections.locations.findWhere({tl_id: direction.get('destination_id')});

    var $routes = $logisticRow.find('.routes').html('');

    direction.get('routes').forEach(function(route){
        if(!route['duration']) return false;

        var $checkbox = $('<input>').attr({type: 'checkbox', value: route['mode']});

        if($.inArray(route['mode'], direction.get('selected_routes'))>-1){
            $checkbox.attr({checked:'checked'});
        }

        var $route = $('<label>').addClass('route').html('<i class="travel-icon '+route['mode']+'"></i>'+route['duration']);

        $route.prepend($checkbox);

        if(route['mode'] === 'plane'){
            var $expediaFlightsLink = $('<a>')
                .attr({
                    target:'_blank',
                    href:'//www.dpbolvw.net/click-8041685-10581071?GOTO=EXPFLTWIZ&load=1&TripType='+($logisticRow.closest('.first-destination').length ? 'RoundTrip' : 'OneWay')+'&FrAirport='+origin.get('tl_location')+'&ToAirport='+destination.get('tl_location')+'&FromDate='+direction.get('departure_date')+'&ToDate='+direction.get('departure_date')+'&NumAdult=2',
                    title:'See Expedia for flights from '+origin.get('tl_location')+' to '+destination.get('tl_location'),
                    class:'text-underline'
                })
                .on('click', increaseFlyingCounter)
                .text('flights');

            $route.append(' ', $expediaFlightsLink);
        }

        $routes.append($route);
    });

    var $itineraryLogisticRow = $('.locations-distance[data-location-start-id="'+direction.get('origin_id')+'"][data-location-end-id="'+direction.get('destination_id')+'"]');

    $itineraryLogisticRow.find('.notes-input').html(direction.get('notes'));

    var $itineraryLogisticRowRoutes = $itineraryLogisticRow.find('.durations').html('');

    direction.get('routes').forEach(function(route){
        if($.inArray(route['mode'], direction.get('selected_routes'))>-1){
            var $route = $('<label>').addClass('route').html('<i class="travel-icon '+route['mode']+'"></i>'+route['duration']);
            $itineraryLogisticRowRoutes.append($route);
        }
    });
}

function updateDayNoteText(tripId, tripDate, text) {
    $.ajax({
        url: APPLICATION_URL + 'trip/updateDayNoteText',
        type: 'post',
        dataType: 'json',
        data: {tripId: tripId, tripDate: tripDate, text: text}
    });
}

function showItinerary(e) {
    var btnType = $(e.target).hasClass('show-itinerary-control') ? 'show-itinerary-control' : 'btn-show-itinerary';

    var $notepadControl = $('.notepad-control');
    var $panel = $notepadControl.find('.panel-collapse');

    if(!$notepadControl.find('.btn-dates-edit:not(.hide)').length){
        if (btnType === 'show-itinerary-control') {
            if (!tripOptions['notShowDatesMsg']) {
                setTripOptions({ notShowDatesMsg: 1 });
            } else {
                setViewType('full-view');
                return false;
            }
        }

        var $addDatesBtn = $notepadControl.find('.js-btn-dates-add:not(.hide)').first();
        var tl_id = $addDatesBtn.closest('.widget-directions-searchbox-container').data('tl-id');

        if($panel.length && $panel.hasClass('collapse')){
            $notepadControl.find('.panel-heading').toggleClass('collapsed',false);
            $panel.collapse('show');
        }

        $notepadControl.find('.panel-body').scrollTop(0);

        $addDatesBtn.trigger('click');

        introJs()
            .setOptions({
                steps: [
                    {
                        element: '.notepad-control [data-tl-id="'+tl_id+'"] .dates-container',
                        intro: "We'll need some dates from you first before we can generate your itinerary"
                    }
                ],
                showBullets:false,
                showStepNumbers:false,
                doneLabel: 'Ok'
            })
            .start();
    } else if(!$notepadControl.find('.destination:not([data-ideas-count="0"])').length) {
        if(btnType === 'show-itinerary-control'){
            if(!tripOptions['notShowForgetIdeasMsg']){
                setTripOptions({ notShowForgetIdeasMsg: 1 });
            }
            else{
                setViewType('full-view');
                return false;
            }
        }

        if($panel.length && $panel.hasClass('collapse')){
            $notepadControl.find('.panel-heading').toggleClass('collapsed',false);
            $panel.collapse('show');
        }

        $notepadControl.find('.panel-body').scrollTop(0);

        introJs()
            .setOptions({
                steps: [
                    {
                        element: '.btn-show-ideas',
                        intro: "Don't forget to add attractions, restaurants and hotels to this city"
                    }
                ],
                showBullets:false,
                showStepNumbers:false,
                doneLabel: 'Ok'
            })
            .oncomplete(function(){
                if(getViewType() === 'full-view'){
                    setTimeout(function(){
                        introJs()
                            .setOptions({
                                steps: [
                                    {
                                        element: '#itineraryCanvas',
                                        intro: "Your itinerary",
                                        position:'left'
                                    }
                                ],
                                showBullets:false,
                                showStepNumbers:false,
                                doneLabel: 'Ok'
                            })
                            .start();
                        $('body').scrollTop(0);
                    }, 100);
                } else {
                    setViewType('full-view');
                    //$('body').scrollTop(0);
                }
            })
            .start();
    } else if(getViewType() === 'full-view') {
        if (btnType === 'show-itinerary-control') {
            return false;
        }

        introJs()
            .setOptions({
                steps: [
                    {
                        element: '#itineraryCanvas',
                        intro: "Your itinerary",
                        position: $(document).width() > 991 ? 'left' : 'top'
                    }
                ],
                showBullets:false,
                showStepNumbers:false,
                doneLabel: 'Ok'
            })
            .start();
        $('body').scrollTop(0);
        fitMapToLocationsBounds();
    } else {
        setViewType('full-view');
        //$('body').scrollTop(0);
        fitMapToLocationsBounds();
    }

    return false;
}

function setTripOptions(options){
    $.post(APPLICATION_URL+"trip/setTripOptions/"+t_id, options, function (response) {
        tripOptions = response;
    }, 'json');
}

function fitMapToLocationsBounds(){
    var bounds = new google.maps.LatLngBounds();

    $.each(locationsMarkersClusterer.getMarkers(), function(i, marker){
        bounds.extend(marker.getPosition());
    });

    if(!bounds.isEmpty()){
        // fitBoundsWithHalfZoom(bounds);

        map.fitBounds(bounds);

        if(map.getZoom() > CITY_LEVEL_ZOOM){
            map.setZoom(CITY_LEVEL_ZOOM);
        }
    }
}

function fitBoundsWithHalfZoom(bounds) {
    var oldZoom = map.getZoom();
    map.fitBounds(bounds);
    map.setZoom(map.getZoom() + Math.ceil((oldZoom - map.getZoom()) / 2));
}

function fitMapToLocationIdeasBounds(locationId){
    var bounds = new google.maps.LatLngBounds();

    ideasMarkersClusterer.getMarkers().forEach(function(marker){
        if(marker.idea.tii_tl_id == locationId){
            bounds.extend(marker.getPosition());
        }
    });

    if(!bounds.isEmpty()){
        fitBoundsWithHalfZoom(bounds);

        /*map.fitBounds(bounds);*/

        if(map.getZoom() > 15){
            map.setZoom(15);
        }
    }
}

function deletePhotoSet(noteId) {
    $('.loadingDiv').show();

    $.ajax({
        url: APPLICATION_URL + 'trips/deletenotesandphoto',
        type: 'post',
        dataType: 'json',
        data: {t_id: t_id, tn_id: noteId},
        success: function(data) {
            if (data.success == '1') {
                getItineraryPanel();
                getItineraryLeftPanel();

                addLog(data.log);

                alertmessage('Photos / notes deleted successfully.', 'success');

                $('.loadingDiv').hide();
            }
        }
    });
}

/** Global Functions */
function validateeticket() {
    if(($.trim($("#TripEticketEtComment").val()) != "" || $.trim($("#TripEticketEtFilename").val()) != "") && $.trim($("#TripEticketEtName").val()) != ""){
        $(".eticketSave").attr("disabled", "disabled");

        $(".loadingnearsave").fadeIn();

        var options = {
            target	:	'',   									// target element(s) to be updated with server response
            type	:	'POST',  							// pre-submit callback
            dataType:	"JSON",
            success			: function(data){
                if(data.success == "1"){
                    $(".close").trigger('click');

                    addLog(data.log);

                    rebuilteticketdocs();
                }

                if(data.success == "0"){
                    alert("Only doc, docx ,xls, xlsx, ppt, pptx, pdf, jpg, jpeg, png, txt, rtf files are allowed.");
                }
            },
            url	: APPLICATION_URL+"trips/eticket",	// post-submit callback
            error:	function(xhr, ajaxOptions, thrownError){	return false	}
        };
        $("#TripEticketEticketForm").ajaxSubmit(options);
    }else{
        if($.trim($("#TripEticketEtName").val()) == ""){
            $("#TripEticketEtName").css("border","red solid 1px");
        }else{
            $("#TripEticketEtComment").css("border","red solid 1px");
        }
    }
    return false;
}

function getIdeaDetailsDialog(tii_id, tl_id){
    var $location = $('.destination[data-tl-id="'+tl_id+'"]'),
        placeId = $location.attr('data-place-id');

    return $.post(
        APPLICATION_URL+"trip/getIdeaDetailsDialog",
        { tii_id: tii_id },
        function(html){
            var $modal = $("#myModal").html(html).modal('show');

            $modal.find('.selectpicker').selectpicker();

            $modal.find('.save-idea-details button').on('click', function(e) {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

                $modal.find('[data-field-name] .editable-open').each(function(i,el){
                    var $el = $(el), newValue = $.trim($el.next().find('input').val());

                    if($el.editable('getValue')[$el.closest('[data-field-name]').data('field-name')] != newValue){
                        $el.trigger('save', {newValue: newValue});
                    }

                    $el.editable('hide');
                });

                $modal.modal('hide');
            });

            $modal.find('[data-field-name]').each(function(){
                var $field = $(this), fieldName = $field.data('field-name');

                $field.find('.input-field')
                    .editable({
                        type: 'text',
                        name: $field.data('field-name'),
                        showbuttons: false,
                        emptytext: 'enter ' + $field.find('div:first').text().replace(':','').toLowerCase(),
                        placeholder: '',
                        mode: 'inline',
                        defaultValue: fieldName == 'tii_idea_opening_hours' ? '00:00-00:00' : null,
                        unsavedclass: null
                    })
                    .on('shown', function(e, editable) {
                        if(fieldName == 'tii_idea_address'){
                            var autoComplete = new google.maps.places.Autocomplete(editable.input.$input.get(0),{types:['address']});

                            if(placeId){
                                var placesService = new google.maps.places.PlacesService(map);

                                placesService.getDetails({placeId: placeId}, function(place, status) {
                                    if (status == 'OK') {
                                        if(place.geometry && place.geometry.viewport){
                                            autoComplete.setBounds(place.geometry.viewport);
                                        }
                                    }
                                });
                            }

                            google.maps.event.addListener(autoComplete, 'place_changed', function() {
                                var place = autoComplete.getPlace();

                                editable.input.$input.on('blur', function(){editable.input.$input.val('');});

                                place.address = $.trim(editable.input.$input.val());

                                editable.setValue(place.address);

                                editable.hide();

                                updateIdea({
                                    tii_id: tii_id,
                                    tii_idea_latitude: (place.geometry && place.geometry.location.lat()) ? place.geometry.location.lat() : '',
                                    tii_idea_longitude: (place.geometry && place.geometry.location.lng()) ? place.geometry.location.lng() : '',
                                    tii_idea_address: place.address,
                                    tii_icon: $modal.find('[data-field-name="tii_icon"] select').val(),
                                    tii_google_place_id: place['place_id'] || ''
                                }).done(function(){
                                    initMapIdeas().done(function(){
                                        if(place.geometry){
                                            var ideaBounds = new google.maps.LatLngBounds();

                                            ideaBounds.extend(place.geometry.location);

                                            fitBoundsWithHalfZoom(ideaBounds);

                                            /*map.fitBounds(ideaBounds);*/

                                            if(map.getZoom() > 15){
                                                map.setZoom(15);
                                            }

                                            map.panTo(place.geometry.location);
                                        }
                                    });
                                });
                            });
                        }
                    })
                    .on('save', function(e, params) {
                        params.newValue = $.trim(params.newValue);

                        if(fieldName != 'tii_idea_address'){
                            var options = {tii_id: tii_id};

                            options[fieldName] = params.newValue;

                            updateIdea(options).done(function(){
                                initMapIdeas().done(function(){
                                    var ideaMarker = $.grep(ideasMarkersClusterer.getMarkers(), function(ideaMarker){
                                        return ideaMarker.idea.tii_id == tii_id;
                                    })[0];

                                    if (ideaMarker && (infoWindow.isOpen() || infoWindow.getPosition() == ideaMarker.getPosition())) {
                                        infoWindow.close();
                                    }
                                });
                            });
                        }
                    })
                    .on('hidden', function(event, reason){
                        if(reason == 'manual') {
                            event.preventDefault();
                            event.stopPropagation();
                            //auto-open next editable
                            //$(this).closest('tr').next().find('.editable').editable('show');
                            //$(this).trigger('save');

                            var $this = $(this);

                            $this.editable('activate');
                            //$this.blur();

                            var e = jQuery.Event("keypress");
                            e.which = 13; //enter
                            e.keyCode = 13;
                            $this.trigger(e);
                        }
                    })
                ;

                $field.find('select').on('change', function () {
                    var options = {tii_id: tii_id}, imageSrc = $(this).val();

                    options[fieldName] = imageSrc;

                    updateIdea(options).done(function(){
                        $('.destination-idea[data-id="'+tii_id+'"] .idea-icon img').attr('src', imageSrc);

                        initMapIdeas().done(function(){
                            var ideaMarker = $.grep(ideasMarkersClusterer.getMarkers(), function(ideaMarker){
                                return ideaMarker.idea.tii_id == tii_id;
                            })[0];

                            if (ideaMarker && (infoWindow.isOpen() || infoWindow.getPosition() == ideaMarker.getPosition())) {
                                infoWindow.close();
                            }
                        });
                    });
                })
            });
        }
    );
}

function getViewType() {
    var $container = $('.container'),
        viewType = 'map-view';

    if($container.hasClass('full-view')){
        viewType = 'full-view';
    }

    if($container.hasClass('new-view'))
    {
        viewType = 'new-view';
    }

    return viewType;
}

function setViewType(viewType) {
    var currentViewType = getViewType();

    if (!viewType) {
        viewType = currentViewType;
    }

    var $mapPanel = $("#mapPanel"),
        $itineraryPanel = $("#itineraryPanel"),
        $showItineraryControl = $('.show-itinerary-control')
    ;

    var $container = $('body>.container');

    $container
        .removeClass(currentViewType)
        .addClass(viewType)
    ;

    if (viewType === 'map-view') {
        $mapPanel.prop('class','col-sm-12');
        $itineraryPanel.prop('class','hide');
        $showItineraryControl.toggleClass('collapse-control');
    } else if (viewType === 'full-view') {
        $mapPanel.prop('class','col-sm-12 col-md-8 col-lg-8');
        $itineraryPanel.prop('class','col-sm-12 col-md-4 col-lg-4');
        $showItineraryControl.toggleClass('collapse-control');
    } else if (viewType === 'new-view') {
        $mapPanel.prop('class','col-sm-12');
        $itineraryPanel.prop('class','hide');
    }

    if ($container.hasClass('public-trip')) {
        $mapPanel.prop('class','col-sm-12 col-md-8 col-lg-8');
        $itineraryPanel.prop('class','col-sm-12 col-md-4 col-lg-4');
    }

    resizeView();
    initMapIdeasDirections(true);
}

function resizeView() {
    var $notepadControlBody = $('.notepad-control .panel-body'),
        $notepadLocationIdeasControlBody = $('.notepad-location-ideas-control .panel-body'),
        $mapCanvas = $('#mapCanvas');

    var windowHeight = $(window).height(), headerHeight = $('header').height();

    if (isMobile()) {
        $notepadControlBody.css({
            maxHeight: windowHeight - 35,
            minHeight: windowHeight - 35
        });

        $notepadLocationIdeasControlBody.css({
            marginTop: 5,
            maxHeight: windowHeight - 35,
            minHeight: windowHeight - 35
        });

        $notepadLocationIdeasControlBody.find('.new-idea').css({
            position: 'inherit'
        });

        if (map != undefined) {
            var lastCenter = map.getCenter();

            $mapCanvas.height(windowHeight - headerHeight - 2);

            $('.trip-section').show("fast", function() {
                google.maps.event.trigger(map, "resize");

                map.setCenter(lastCenter);
            });
        }
    } else {
        var height = windowHeight - headerHeight;

        if (map != undefined) {
            var lastCenter = map.getCenter();

            var notepadLocationIdeasControlBodyMaxHeight = 0;

            $notepadControlBody.css({maxHeight: null});
            $mapCanvas.height(null);
            $notepadLocationIdeasControlBody.css({marginTop: null});
            $notepadLocationIdeasControlBody.outerHeight(null);

            if(window.innerWidth < 768 && headerHeight){
                var sliderHeight = $('#slider-wrapper').length ? 59 : 20,
                    affilateBoxHeight = 36
                ;

                $notepadControlBody.css({maxHeight: height-35/*-affilateBoxHeight*/-40-sliderHeight});
                notepadLocationIdeasControlBodyMaxHeight = height-35/*-affilateBoxHeight*/-40-sliderHeight;

                $mapCanvas.height(height/*-affilateBoxHeight*/-40-sliderHeight);
            }
            else{
                $notepadControlBody.css({maxHeight: height-35});
                notepadLocationIdeasControlBodyMaxHeight = height-35;
                $mapCanvas.height(height);

                $('.itinerary-data').height(height-37);
            }

            setTimeout(function () {
                var ideasLocationControlPush = 27 + $notepadLocationIdeasControlBody.find('.destination-idea.new-idea .idea-name').outerHeight();

                $notepadLocationIdeasControlBody.css({marginTop: ideasLocationControlPush});
                notepadLocationIdeasControlBodyMaxHeight = notepadLocationIdeasControlBodyMaxHeight - ideasLocationControlPush;

                $notepadLocationIdeasControlBody.css({maxHeight: notepadLocationIdeasControlBodyMaxHeight});

                setTimeout(function () {
                    if($notepadLocationIdeasControlBody.outerHeight() + ideasLocationControlPush < $notepadControlBody.outerHeight()){
                        $notepadLocationIdeasControlBody.outerHeight($notepadControlBody.outerHeight() - ideasLocationControlPush);
                    }

                    setTimeout(function () {
                        if($notepadLocationIdeasControlBody.length && $notepadLocationIdeasControlBody.hasScrollBar()){
                            $('.destination-idea.new-idea').css({
                                right: $.scrollbarWidth()
                            });
                        }
                        else{
                            $('.destination-idea.new-idea').css({
                                right: 0
                            });
                        }
                    }, 50);
                }, 50);
            }, 50);

            $('.trip-section').show("fast", function(){
                google.maps.event.trigger(map, "resize");

                map.setCenter(lastCenter);

                var controlDiv, i;

                if(window.innerWidth < 768){
                    for (i = 0; i < map.controls[google.maps.ControlPosition.LEFT_CENTER].length; i++){
                        controlDiv = map.controls[google.maps.ControlPosition.LEFT_CENTER].pop();

                        if(controlDiv){
                            map.controls[google.maps.ControlPosition.TOP_CENTER].push(controlDiv);
                        }
                    }
                }
                else{
                    for (i = 0; i < map.controls[google.maps.ControlPosition.TOP_CENTER].length; i++){
                        controlDiv = map.controls[google.maps.ControlPosition.TOP_CENTER].pop();

                        if(controlDiv){
                            map.controls[google.maps.ControlPosition.LEFT_CENTER].push(controlDiv);
                        }
                    }
                }
            });
        }
    }

    setheightToStripLine();
}

function deleteDocs(et_id) {
    $(".loadingDiv").show();
    $.ajax({
        url			:	APPLICATION_URL+"trips/deletedocs",
        type		: "POST",
        dataType:	"JSON",
        data		:	({t_id:t_id, et_id:et_id}),
        success	:	function(data){
            if(data.success == '1'){
                rebuilteticketdocs();

                addLog(data.log);

                alertmessage("Trip Documents removed successfully.", "success");
            }else{
                alertmessage("Oops! Some thing went wrong. Please try again.", "error");
            }

            $(".loadingDiv").hide();
        }
    });
}

function downloaddocs(et_id) {
    //window.location = APPLICATION_URL+"trips/download/"+et_id;
    window.open(APPLICATION_URL + 'trips/download/' + et_id, '_blank');
}

function rebuilteticketdocs() {
    $(".loadingDiv").show();
    $.ajax({
        url			:	APPLICATION_URL+"trips/rebuilteticketdocs",
        type		: "POST",
        dataType    :	"html",
        data		:	({t_id:t_id}),
        success	:	function(html){
            var $tripDocuments = $('.js-trip-documents .dropdown-menu');

            $tripDocuments.find('li:not(.info)').remove();

            $tripDocuments.prepend(html);

            var tripDocumentsCount = $tripDocuments.find('li:not(.info)').length;

            $('.js-trip-docs-count').html(tripDocumentsCount);

            if(tripDocumentsCount){
                $tripDocuments.find('.info').toggleClass('hide',true);
            }else{
                $tripDocuments.find('.info').toggleClass('hide',false);
            }

            $(".loadingDiv").hide();
        }
    });
}

function postcomment(e) {
    evt=e || window.event;
    var keypressed	=	evt.which || evt.keyCode;

    var $commentTxtBox = $(".newplanningtab_tab2content_third_comment_textbox");

    if(keypressed=="13" && trim($commentTxtBox.val()) != ""){
        $commentTxtBox
            .css("background", "url("+APPLICATION_URL+"img/loading1.gif)")
            .css("background-repeat","no-repeat")
            .css("background-position","right 5px top 8px");
        var comment = trim($commentTxtBox.val());
        $commentTxtBox.val("");
        $.ajax({
            url			:	APPLICATION_URL+"trips/postcomment",
            type		:	"POST",
            data		:	({t_id : t_id, comment : comment}),
            dataType:	'JSON',
            success	:	function(data){
                if(data.success == '1'){
                    $(".commentsOuter").append(data.div);
                    $(".firstcomment_"+data.tlc_id).slideDown("slow");
                    $(".commentsOuter").animate({ scrollTop: 10000}, 1000);

                    addLog(data.log);

                    $commentTxtBox.css("background", "none");
                }else{
                    $commentTxtBox.css("background", "none");
                }
            }
        });
    }
}

function removecomment(tlc_id) {
    $(".firstcomment_"+tlc_id).slideUp("slow");
    $.ajax({
        url		:	APPLICATION_URL+"trips/removecomment",
        type	: "POST",
        dataType:	"JSON",
        data	:	({ t_id:t_id, tlc_id:tlc_id }),
        success	:	function(data){
            if(data.success == '1'){
                setTimeout('$(".firstcomment_'+tlc_id+'").remove();', 1000);

                addLog(data.log);
            }else{
                $(".firstcomment_"+tlc_id).slideDown("slow");
            }
        }
    });
}

function updateItineraryLogisticRows($rows) {
    var directions = [];

    $rows.each(function(i, row) {
        var $row = $(row);

        directions.push({
            location_date     : $row.data('location-date'),
            start_location_id : $row.data('location-start-id'),
            end_location_id   : $row.data('location-end-id')
        });
    });

    if (jqxhrLocationDistances) {
        jqxhrLocationDistances.abort();
    }

    jqxhrLocationDistances = $.ajax({
        url      : APPLICATION_URL + 'trip/getLocationDistances',
        data     : {directions: directions},
        type     : 'post',
        dataType : 'json',
        success: function(directions) {
            lastItineraryDirections = directions;

            updateItineraryLogisticsRowsByDirections(directions);
        }
    });
}

function updateItineraryLogisticsRowsByDirections(directions){
    $.each(directions,function(i,direction){
        var $row         = $('.locations-distance[data-location-id="'+direction['locationId']+'"]'),
            routes       = direction['routes'],
            $durations   = $row.find('.durations');

        $durations.html('');

        if ($.isEmptyObject(routes)) {
            return;
        }

        $.each(routes, function(type, params) {
            var $duration = $('<label>');

            $duration.append('<i class="travel-icon '+type+'"></i>'+params.duration);

            $durations.append($duration);

            setheightToStripLine();
        });
    });
}

function updateItineraryDistancesByDistances(distances){
    $.each(distances, function(loc_date, locations) {
        $.each(locations, function(tl_id, ideas) {
            $.each(ideas, function(tii_order, idea_distances) {
                var itineraryDistances = $('<div />');

                $.each(['driving','walking','bus','subway','train'], function(){
                    var mode = this;

                    if(idea_distances[mode]){
                        itineraryDistances.append('<span class="'+mode+'"><i></i>'+idea_distances[mode].duration+'</span>');
                    }
                });

                $('.itinerary-data [data-location-date="'+loc_date+'"] [data-location-id="'+tl_id+'"] [data-idea-id]:nth-child('+tii_order+') .new-distance')
                    .html(itineraryDistances.get(0).outerHTML);
            });
        });
    });
}

function updateItineraryDistances() {
    if(jqxhrItineraryDistances){
        jqxhrItineraryDistances.abort();
    }

    jqxhrItineraryDistances = $.ajax({
        url      : APPLICATION_URL + 'trip/getItineraryDistances/' + t_id,
        type     : 'GET',
        dataType : 'JSON',
        success: function(distances) {
            lastItineraryDistances = distances;

            updateItineraryDistancesByDistances(distances);
        }
    });
}

function deleteNoteImage(idofimage, nameofimage){
    $.ajax({
        url : APPLICATION_URL + 'trips/deleteimage',
        type: 'POST',
        data: ({idofimage: idofimage, nameofimage: nameofimage}),
        dataType: 'json',
        success: function(data) {
            if (data.success == '1') {
                $(".liwidth"+idofimage).fadeOut("slow");
                setTimeout(function() {
                    $(".liwidth"+idofimage).remove();
                }, 1000);
                alertmessage("Image deleted successfully.", "success");
            }
        }
    });
}

function makeCoverPage(image) {
    $(".loadingDiv").show();
    $.ajax({
        url: APPLICATION_URL + 'trips/makecoverpage',
        type: 'POST',
        data: ({image: image, tripid: t_id}),
        dataType: 'json',
        success: function(data){
            if (data.success == '1') {
                $(".loadingDiv").hide();
                alertmessage("Trip cover photo created successfully.", "success");
            }
        }
    });
}

function addNotesPhotos(tl_id, tii_id, tdate, tn_id, tn_is_date_note) {
    // console.log(tl_id, tii_id, tdate, tn_id, tn_is_date_note);
    var opt = 'save';
    if (tn_id != '0') opt	= 'update';

    $.ajax({
        url: APPLICATION_URL + 'trip/addNotesAndPhoto',
        async: false,
        type: 'POST',
        dataType: 'html',
        data: {t_id: t_id, tl_id: tl_id, tii_id: tii_id, tdate: tdate, tn_id: tn_id, tn_is_date_note: tn_is_date_note},
        success: function(html) {
            $('#myModal').html(html);
        }
    });
}

function rebuiltAddNotesAndPhoto(tl_id, tii_id, tdate, tn_id, opt, tn_is_date_note) {
    $.ajax({
        url: APPLICATION_URL + 'trip/rebuiltAddNotesAndPhoto',
        type: 'POST',
        dataType: 'JSON',
        data: ({t_id:t_id, tl_id:tl_id, tii_id:tii_id, tdate:tdate, tn_id:tn_id}),
        success: function(data) {
            //var $tii = $('.catDropable [data-tii-id="'+tii_id+'"]:not(.duplicated)');
            //
            //if(tn_is_date_note == 3){
            //    $tii = $('.catDropable [data-tii-id="'+tii_id+'"].duplicated');
            //}
            if (opt == "save") {
                $('#comments-photos-container-'+tii_id).replaceWith(data.html);

                setTimeout(function(){
                    //$(".tab2dropable"+data.kk).draggable({
                    //    revertDuration: 10,
                    //    drag: function() { idrag_id = this.id; },
                    //    revert: true,
                    //    handle: ".imagehandle"
                    //});

                    refreshFancyBox();

                    //$('a[rel=idea-gallery]').fancybox({
                    //    'transitionIn': 'none',
                    //    'transitionOut': 'none',
                    //    'titlePosition': 'over',
                    //    titleFormat: function(title, currentArray, currentIndex, currentOpts) {
                    //        return '<span id="fancybox-title-over">Image ' + (currentIndex + 1) + ' / ' + currentArray.length + (title.length ? ' &nbsp; ' + title : '') + '</span>';
                    //    }
                    //});
                }, 2000);
            } else {
                $('#comments-photos-container-'+tii_id).replaceWith(data.html);
            }


            //initShowPhotosSwitch();
        }
    });
}

function increaseFlyingCounter(){
    $.post(APPLICATION_URL+"trips/updatecounter", {trip_id: t_id, counter: 't_flight_info_clicks'});
}

function increaseReviewSitesClicksCounter(){
    $.post(APPLICATION_URL+"trips/updatecounter", {trip_id: t_id, counter: 't_review_sites_clicks'});
}

/** Creating Map Controls */
function createShowItineraryControl(map) {
    if(map.controls[google.maps.ControlPosition.TOP_RIGHT].length == 0) {
        var controlDiv = document.createElement('div'),
            controlUI = document.createElement('div'),
            $container = $('.container')
        ;

        if($container.hasClass('map-view')) {
            controlUI.className = 'show-itinerary-control';
        } else{
            controlUI.className = 'show-itinerary-control collapse-control';
        }

        controlUI.title = 'Click to update view type';
        controlUI.setAttribute('data-intro','<b>STEP 3</b>: tap to see your trip itinerary');
        controlUI.setAttribute('data-step',3);
        controlUI.setAttribute('data-position','left');

        controlDiv.appendChild(controlUI);

        map.controls[google.maps.ControlPosition.TOP_RIGHT].push(controlDiv);

        // Setup the click event listeners
        google.maps.event.addDomListener(controlUI, 'click', function(e) {
            var viewType = getViewType();

            if(viewType === 'map-view'){
                showItinerary(e);
                //setViewType('full-view');
            }else {
                setViewType('map-view');
            }
        });
    }
}

function initNotepadLocation($location) {
    var $loadingDiv = $(".loadingDiv");

    $location.find('[data-toggle="popover"]').popover({container: 'body', trigger: 'hover', placement: 'auto'});

    $location.find('.destination-name')
        .editable({
            type: 'text',
            title: 'Enter city/town',
            showbuttons: false,
            emptytext: $location.data('tl-type') == 1 ? 'enter city/town' : 'enter home city/town',
            placeholder: '',
            mode: 'inline',
            onblur: 'cancel',
            unsavedclass: null,
            clear: false
        })
        .on('shown', function (e, editable) {
            var $el = editable.input.$input;

            var location = $el.closest('div[role="listitem"]'),
                locationId = location.attr('data-tl-id'),
                locationType = location.attr('data-tl-type');

            fitMapToLocationsBounds();

            var autoComplete = new google.maps.places.Autocomplete($el.get(0)/*,{types:['(cities)']}*/);

            google.maps.event.addListener(autoComplete, 'place_changed', function (e) {
                if ($('.container.public-trip').length) {
                    showRegistrationDialog(e);
                    return;
                }

                $loadingDiv.show();

                var place = autoComplete.getPlace();

                if (!place.geometry) {
                    window.alert("Autocomplete's returned place contains no geometry. Please select another item in dropdown list if it exists.");
                    $loadingDiv.hide();
                }
                else {
                    /*if(place.geometry.viewport && !location.hasClass('new-destination')){
                        map.fitBounds(place.geometry.viewport);
                    }*/

                    place.locationId = locationId;
                    place.locationType = locationType;

                    var locationOptions = initLocationOptions(place);

                    editable.setValue(locationOptions.location);
                    editable.hide();

                    if (locationId) {
                        createLocation(locationOptions, function() {
                            location.attr({'data-place-id': place.place_id});

                            var $prevLocation = location.prev();
                            if($prevLocation.hasClass('new-destination')){
                                $prevLocation = $prevLocation.prev();
                            }

                            var spinnerHtml = '<i class="fa fa-spin fa-spinner"></i>';

                            $('[data-location-id="'+$prevLocation.data('tl-id')+'"].destination-logistic .routes').html(spinnerHtml);
                            $('[data-location-id="'+locationId+'"].destination-logistic .routes').html(spinnerHtml);

                            initMapObjects().done(getItineraryPanel, fitMapToLocationsBounds);

                            setLocationsCollapseState(location);

                            //$location.find('.idea-name-input').trigger('init');

                            $loadingDiv.hide();
                        });
                    }
                    else{
                        $.post(APPLICATION_URL + 'trip/insertLocation', locationOptions, function(html) {
                            var $html = $(html);

                            var $newDestination = $('.widget-directions-searchboxes .new-destination');

                            if (place.locationType == 2) {
                                $('.widget-directions-searchboxes .first-destination').replaceWith($html);
                            } else if (place.locationType == 3) {
                                $('[data-location-id="'+$newDestination.prev().attr('data-tl-id')+'"].destination-logistic .routes').html('<i class="fa fa-spin fa-spinner"></i>');
                                $('.widget-directions-searchboxes .last-destination').replaceWith($html);
                            }
                            else{
                                $('[data-location-id="'+$newDestination.prev().data('tl-id')+'"].destination-logistic .routes').html('<i class="fa fa-spin fa-spinner"></i>');
                                $newDestination.before($html);
                            }

                            if (place.locationType == 2 || place.locationType == 3) {
                                var logistic = $('.new-destination').find('.destination-logistic');

                                if (!logistic.is(':visible')) {
                                    logistic.show();
                                }

                                getItineraryPanel();
                                getItineraryLeftPanel();
                            }
                            else {
                                $('#notepad_new_location')
                                    .editable('setValue', null)
                                    .editable('option', 'pk', null)
                                    .editable('show');

                                var $panel = $('.notepad-control .panel-body');
                                $panel.scrollTop($panel.get(0).scrollHeight);
                            }

                            initNotepadLocation($html);

                            initMapObjects().done(fitMapToLocationsBounds);

                            $loadingDiv.hide();
                        });
                    }
                }
            });
        });

    $location.find('.logistic-notes')
        .on('init', function(e, editable){
            $(this).closest('.destination-logistic').find('.btn-add-details').on('click', function(e) {
                if ($('.container.public-trip').length) {
                    showRegistrationDialog(e);
                    return;
                }

                $(this)
                    .toggleClass('hide')
                    .closest('.destination-logistic')
                    .find('.logistic-notes')
                    .toggleClass('hide')
                ;

                setTimeout(function(){
                    editable.show();
                },100);
            })
        })
        .on('save', function(e, params) {
            if ($('.container.public-trip').length) {
                showRegistrationDialog(e);
                return;
            }

            var selected_routes = [], $container = $(this).closest('.destination-logistic');

            $container.find(':checked').each(function(i, el){
                selected_routes.push($(el).val());
            });

            $.post(
                APPLICATION_URL+"trip/updateLocationLogisticInfo",
                {
                    notes: params.newValue,
                    selected_routes: selected_routes,
                    tl_id: $container.data('location-id')
                },
                initLocationDirections
            );
        })
        .editable({
            type: 'text',
            title: 'Enter flight/train number; booking number; terminal name',
            showbuttons: false,
            emptytext: 'Enter flight/train number; booking number; terminal name',
            placeholder: '',
            mode: 'inline'
        })
    ;

    $location.on('change','.destination-logistic :checkbox', function(e) {
        if ($('.container.public-trip').length) {
            showRegistrationDialog(e);
            this.checked = !this.checked;
            return;
        }

        var $this = $(this), value = $this.val(), selected_routes = [], $container = $this.closest('.destination-logistic');

        $container.find(':checked').each(function(i, el){
            if ($(el).val() == value) {
                selected_routes.push(value);
            } else {
                $(el).attr('checked', false);
            }
        });

        $.post(
            APPLICATION_URL+"trip/updateLocationLogisticInfo",
            {
                selected_routes: selected_routes,
                tl_id: $container.data('location-id'),
                notes: $container.find('.logistic-notes').editable('getValue', true)
            },
            function(){
                var directionMapObjects = $.grep(directionsMapObjects, function(obj){
                    return obj && obj.direction && obj.direction.originPlaceId == $container.data('google-place-id');
                });

                directionMapObjects.forEach(function (obj) {
                    obj.setMap(null);
                    delete directionsMapObjects[directionsMapObjects.indexOf(obj)];
                });

                initLocationDirections().done(function () {
                    getLogisticInfo();
                });
            }
        );
    });

    $('.popover').remove();
}

function createLocation(locationOptions, callback) {
    return $.ajax({
        url: APPLICATION_URL + 'trip/setLocation',
        type: 'post',
        dataType: 'json',
        data: locationOptions,
        success: function (data) {
            callback(data.success, data);
        }
    });
}

function createIdea(place) {
    var options = initIdeaOptions(place, null);

    return setIdea(options);
}

function editIdea(place, ideaId) {
    var options = initIdeaOptions(place, ideaId);

    return setIdea(options);
}

function setIdea(options) {
    return $.post(APPLICATION_URL + 'trip/setLocationIdea', options, getItineraryPanel, 'json');
}

function updateIdea(idea){
    return $.post(APPLICATION_URL + 'trip/updateIdea', idea, getItineraryPanel);
}

function updateLocation(location){
    return $.post(APPLICATION_URL + 'trip/updateLocation', location);
}

function initLocationOptions(place) {
    var addressComponent = place.address_components;
    var addressComponentLength = addressComponent.length;

    var name = place.name || place.vicinity || '';

    if (_.contains(place['types'], 'postal_code')) {
        name = place['formatted_address'];
    }

    if(!name && addressComponentLength > 0){
        for (var i = 0; i < addressComponentLength; i++) {
            if (addressComponentLength == (i + 1)) {
                name += addressComponent[i].long_name;
            } else {
                name += addressComponent[i].long_name + ', ';
            }
        }
    }

    var country = '';

    (addressComponent||[]).forEach(function (item) {
        if (_.contains(item['types'], 'country')) {
            country = item['long_name'];
        }
    });

    var options = {
        tripId: t_id,
        country: country,
        location: name,
        lat: (place.geometry && place.geometry.location.lat()) ? place.geometry.location.lat() : '',
        lng: (place.geometry && place.geometry.location.lng()) ? place.geometry.location.lng() : '',
        place_id: place['place_id'],
        locationType: place.locationType
    };

    if (place.locationId) {
        options.locationId = place.locationId;
    }

    console.log(place, options);

    return options;
}

function initIdeaOptions(place, ideaId) {
    var ohr = '00:00-00:00';

    if (place.opening_hours) {
        ohr = '';
        if (place.opening_hours.periods[0].open) {
            ohr = place.opening_hours.periods[0].open.hours+' : '+ place.opening_hours.periods[0].open.minutes;
        }

        if (place.opening_hours.periods[0].close) {
            ohr = ohr +' - '+place.opening_hours.periods[0].close.hours +' : '+ place.opening_hours.periods[0].close.minutes;
        }
    }

    var type = 2; // custom place

    if (place.place_id) {
        type = 1; // google point_of_interest

        if (place.types.indexOf('point_of_interest') === -1) {
            type = 3; // google address
        }
    }

    var options = {
        name: place.name || place.vicinity || '',
        lat: (place.geometry && place.geometry.location.lat()) ? place.geometry.location.lat() : '',
        lng: (place.geometry && place.geometry.location.lng()) ? place.geometry.location.lng() : '',
        img: place.photos ? place.photos[0].getUrl({'maxWidth': 900, 'maxHeight': 900}) : '',
        phone: place.formatted_phone_number || '',
        address: place.formatted_address || place.vicinity || '',
        web: place.website || '',
        ohr: ohr,
        icon: place.icon || '/img/plus.png',
        tripId: t_id,
        locationId: place.locationId,
        place_id: place['place_id'] || '',
        type: type
    };

    if (ideaId != null) {
        options.ideaId = ideaId;
    }

    return options;
}

function reInitScrollPane() {
    var $control = $('.notepad-location-ideas-control');

    $control.find('.destination-ideas .jspContainer').each(function(i,el){
        $(el).parent().jScrollPane().data().jsp.destroy();
    });

    $control.find('.destination-ideas .destination-idea.new-idea .idea-dates-wrapper')
        .jScrollPane({hideFocus:true})
        .on('jsp-scroll-x', function(event, scrollPositionX, isAtLeft, isAtRight) {
            $(this).closest('.destination-ideas').find('.destination-idea:not(.new-idea) .idea-dates-wrapper').scrollLeft(scrollPositionX);
        });

    resizeView();
}

function fixHomeLogisticRows(){
    $.sequence([
        function(){
            $('.destination-logistic').each(function(){
                var $this = $(this);

                if(!$this.closest('.widget-directions-searchbox-container').data('tl-id')){
                    var $destinationSearchbox = $('.widget-directions-searchbox-container[data-tl-id="'+$this.data('location-id')+'"] .searchbox');
                    if($destinationSearchbox.find('.destination-logistic').length) {
                        $this.remove();
                    }
                    else{
                        $destinationSearchbox.append($this);
                    }
                }

                //$this.find('.routes').html('<i class="fa fa-spin fa-spinner"></i>');

                $this.show();
            });
        },
        function(){
            var $newDestination = $('.new-destination'),
                $lastHomeCity = $newDestination.next();

            if($lastHomeCity.length && $lastHomeCity.attr('data-tl-id')){
                $newDestination.find('.searchbox').append($newDestination.prev().find('.destination-logistic'));
            }
            else {
                $newDestination.prev().find('.destination-logistic').hide();
            }
        }
    ], true);
}

function getLogisticInfo(){
    if(locationDirections.length){
        locationDirections.each(function (direction) {
            renderLogisticRow(direction);
        });
    }
    else{
        fixHomeLogisticRows();
    }
}

function updateItineraryLogisticInfo(){
    getLogisticInfo();
}

function isMobile() {
    return /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent)
        || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0,4));
}

function createNotepadControl(map) {
    $.get(APPLICATION_URL+"trip/getNotepad/"+t_id, function(html){
        var controlUI = document.createElement('div');

        controlUI.className = 'notepad-control';
        controlUI.innerHTML = html;

        var $controlUI = $(controlUI);

        if (isMobile()) {
            $('#mapPanel').after(controlUI);
        } else {
            var controlDiv = document.createElement('div');
            controlDiv.appendChild(controlUI);
            controlDiv.className ='notepad-control-wrapper';
            map.controls[google.maps.ControlPosition.LEFT_CENTER].push(controlDiv);
        }

        var interval = setInterval(function(){
            var $notepad = $('.notepad-control');

            if($notepad.length){
                clearInterval(interval);

                $controlUI.find('.widget-directions-searchboxes')
                    .sortable({
                        items: 'div.widget-directions-searchbox-container:not(.new-destination,.first-destination,.last-destination)',
                        handle: '.destination-container, .widget-directions-input-underline, .widget-directions-remove-waypoint, .widget-directions-searchbox-handle',
                        cancel: 'input',
                        forcePlaceholderSize: true,
                        delay: 150,
                        cursor: 'move',
                        placeholder: 'ui-state-highlight',
                        update: function(e, ui){
                            if ($('.container.public-trip').length) {
                                showRegistrationDialog(e);
                                return;
                            }

                            $.ajax({
                                url: APPLICATION_URL + 'trip/reorderNotePadLocations',
                                type: 'post',
                                data: {
                                    locations: $controlUI.find('.widget-directions-searchboxes').sortable('toArray',{attribute: 'data-tl-id'}),
                                    tripId: t_id
                                },
                                dataType: 'json',
                                success: function() {
                                    $('[data-location-id="'+ui.item.closest('[role="listitem"]').data('tl-id')+'"].destination-logistic .routes').html('<i class="fa fa-spin fa-spinner"></i>');
                                    $('[data-location-id="'+ui.item.closest('[role="listitem"]').prev().data('tl-id')+'"].destination-logistic .routes').html('<i class="fa fa-spin fa-spinner"></i>');
                                    $('[data-location-id="'+ui.item.attr('data-prev-tl-id')+'"].destination-logistic .routes').html('<i class="fa fa-spin fa-spinner"></i>');

                                    initMapLocations().done(getItineraryPanel);
                                }
                            });
                        },
                        start: function( event, ui ) {
                            ui.item.attr('data-prev-tl-id', ui.item.closest('[role="listitem"]').prev().data('tl-id'));
                        }
                    });

                resizeView();

                $controlUI.find('.panel-heading').trigger('click');

                $controlUI.find('.widget-directions-searchbox-container').each(function(i, el){
                    initNotepadLocation($(el));
                });

                getLogisticInfo();

                setLocationsCollapseState();

                $controlUI.find('#notepad_new_location').editable('show');

                var ClickEventHandler = function(map) {
                    this.map = map;
                    this.directionsDisplay = new google.maps.DirectionsRenderer;
                    this.directionsDisplay.setMap(map);
                    this.placesService = new google.maps.places.PlacesService(map);
                    this.infowindow = new google.maps.InfoWindow;
                    this.infowindowContent = document.getElementsByClassName('poi-info-window').item(0);
                    this.infowindow.setContent(this.infowindowContent);

                    // Listen for clicks on the map.
                    this.map.addListener('click', this.handleClick.bind(this));

                    this.infowindow.addListener('closeclick', function(){
                        $(this.getContent()).find('select.locations').selectpicker('destroy');
                    });
                };

                ClickEventHandler.prototype.handleClick = function(event) {
                    console.log('You clicked on: ' + event.latLng);
                    // If the event has a placeId, use it.
                    if (event.placeId) {
                        console.log('You clicked on place:' + event.placeId);

                        // Calling e.stop() on the event prevents the default info window from
                        // showing.
                        // If you call stop here when there is no placeId you will prevent some
                        // other map click event handlers from receiving the event.
                        event.stop();
                        this.getPlaceInformation(event.placeId);
                    }
                };

                ClickEventHandler.prototype.getPlaceInformation = function(placeId) {
                    var me = this, existedIdeaMarker = false;

                    me.infowindow.close();

                    ideasMarkersClusterer.getMarkers().forEach(function (marker) {
                        if(marker.idea.tii_google_place_id == placeId){
                            existedIdeaMarker = marker;
                            return false;
                        }
                    });

                    if (existedIdeaMarker) {
                        var interval = setInterval(function() {
                            var $marker = $('.idea-marker[data-idea-id="'+existedIdeaMarker.idea.tii_id+'"]');

                            if($marker.length){
                                $marker.trigger('click');
                                clearInterval(interval);
                            }
                        }, 10);
                    } else {
                        this.placesService.getDetails({placeId: placeId}, function(place, status) {
                            if (status === google.maps.places.PlacesServiceStatus.OK) {
                                me.infowindow.setPosition(place.geometry.location);
                                me.infowindowContent.children['place-icon'].src = place.icon;
                                me.infowindowContent.children['place-name'].textContent = place.name;
                                me.infowindowContent.children['place-address'].textContent = place.formatted_address;

                                var $addIdeaBtn = $(me.infowindowContent.children['place-add-idea-btn']);
                                var $addIdeaBtnLocations = $addIdeaBtn.find('select.locations');
                                var $locations = $notepad.find('.destination');

                                $addIdeaBtnLocations.off('change');
                                $addIdeaBtnLocations.selectpicker('destroy');
                                $addIdeaBtnLocations.val('');

                                $addIdeaBtnLocations.find('option:not(:disabled)').remove();

                                $locations.each(function(){
                                    var $location = $(this);
                                    $addIdeaBtnLocations.append('<option value="'+$location.attr('data-tl-id')+'">'+$location.find('.destination-name').text()+'</option>');
                                });

                                $addIdeaBtnLocations.selectpicker({container: 'body'});

                                $addIdeaBtnLocations.on('change', function(e) {
                                    if ($('.container.public-trip').length) {
                                        $addIdeaBtnLocations.selectpicker('destroy');
                                        me.infowindow.close();
                                        showRegistrationDialog(e);
                                        return;
                                    }

                                    var $location =  $('.notepad-control [data-tl-id="'+$(this).val()+'"]');

                                    place.locationId = $location.attr('data-tl-id');

                                    createIdea(place).done(function(){
                                        getLocation(place.locationId).done(function(){
                                            setLocationsCollapseState($('.notepad-control .destination[data-tl-id="'+place.locationId+'"]'));

                                            var $notepadLocationIdeasControlPanel = $('.notepad-location-ideas-control .panel');

                                            if($notepadLocationIdeasControlPanel.data('tl-id') == place.locationId){
                                                $.get(APPLICATION_URL+"trip/getNotepadLocationIdeas/"+place.locationId, function(html){
                                                    var $html = $(html);

                                                    $notepadLocationIdeasControlPanel.find('.panel-body').replaceWith($html.find('.panel-body'));

                                                    initNotepadLocationIdeas($notepadLocationIdeasControlPanel.parent());
                                                });
                                            }
                                            else{
                                                createNotepadLocationIdeasControl(map, place.locationId);
                                            }
                                        });

                                        initMapIdeas();
                                    });

                                    $addIdeaBtnLocations.selectpicker('destroy');
                                    me.infowindow.close();
                                });

                                me.infowindow.open(me.map);
                            }
                        });
                    }
                };

                new ClickEventHandler(map);

                InfoBubble.prototype.addEvents_ = function() {
                    // We want to cancel all the events so they do not go to the map
                    var events = ['mousedown', 'mousemove', 'mouseover', 'mouseout', 'mouseup',
                        'mousewheel', 'DOMMouseScroll', 'touchstart', 'touchend', 'touchmove',
                        'dblclick', 'contextmenu'];

                    var bubble = this.bubble_;
                    this.listeners_ = [];
                    for (var i = 0, event; event = events[i]; i++) {
                        this.listeners_.push(
                            google.maps.event.addDomListener(bubble, event, function(e) {
                                e.cancelBubble = true;
                                if (e.stopPropagation) {
                                    e.stopPropagation();
                                }
                            })
                        );
                    }
                };
            }
        },100);
    });
}

function removeNotepadLocationIdeasControl() {
    map.controls[google.maps.ControlPosition.LEFT_CENTER].forEach(function (control, index) {
        if($(control).hasClass('notepad-location-ideas-control-wrapper')){
            map.controls[google.maps.ControlPosition.LEFT_CENTER].removeAt(index);
        }
    });

    map.controls[google.maps.ControlPosition.TOP_CENTER].forEach(function (control, index) {
        if($(control).hasClass('notepad-location-ideas-control-wrapper')){
            map.controls[google.maps.ControlPosition.TOP_CENTER].removeAt(index);
        }
    });

    $('.notepad-location-ideas-control').remove();
    $('.btn-mobile-show-ideas').toggleClass('hide', true);
}

function createNotepadLocationIdeasControl(map, tl_id) {
    if(createNotepadLocationIdeasControlXHR){
        createNotepadLocationIdeasControlXHR.abort();
    }

    createNotepadLocationIdeasControlXHR = $.get(APPLICATION_URL+"trip/getNotepadLocationIdeas/"+tl_id, function(html) {
        removeNotepadLocationIdeasControl();

        var controlUI = document.createElement('div');

        controlUI.className = 'notepad-location-ideas-control fixed-new-idea';
        controlUI.innerHTML = html;

        var $controlUI = $(controlUI);

        if (isMobile()) {
            $('.notepad-control').after(controlUI);
        } else {
            var controlDiv = document.createElement('div');
            controlDiv.appendChild(controlUI);
            controlDiv.className ='notepad-location-ideas-control-wrapper';
            map.controls[google.maps.ControlPosition.LEFT_CENTER].push(controlDiv);
        }

        if (createNotepadLocationIdeasControlInterval) {
            clearInterval(createNotepadLocationIdeasControlInterval);
        }

        createNotepadLocationIdeasControlInterval = setInterval(function(){
            var $control = $('.notepad-location-ideas-control');

            if ($control.length) {
                clearInterval(createNotepadLocationIdeasControlInterval);

                initNotepadLocationIdeas($control);

                $controlUI.find('.panel-heading').trigger('click');

                var interval2 = setInterval(function(){
                    var $control = $('.notepad-location-ideas-control .panel-collapse.in');

                    if ($control.length) {
                        clearInterval(interval2);

                        reInitScrollPane();

                        if (isMobile()) {
                            $('.btn-mobile-show-ideas').toggleClass('hide', false);

                            $('html, body').animate(
                                {scrollTop: $control.parent().offset().top},
                                1000
                            );
                        }
                    }
                }, 50);
            }
        }, 50);
    });
}

function initNotepadLocationIdeas($control){
    var tl_id = $control.find('[data-tl-id]').data('tl-id');

    var $notepad = $('.notepad-control'), $location = $notepad.find('[data-tl-id="'+tl_id+'"]');

    var $loadingDiv = $(".loadingDiv");

    $control.find('[data-toggle="popover"]').popover({container: 'body', trigger: 'hover', placement: 'auto'});

    $control.find('.destination-ideas').sortable({
        items: "div.destination-idea:not(.new-idea)",
        handle: '.idea-name, .idea-notes-input, .idea-dates, .widget-ideas-remove-waypoint',
        cancel: 'input',
        cursor: 'move',
        forcePlaceholderSize: true,
        delay: 150,
        placeholder: 'ui-state-highlight',
        update: function(e, ui) {
            if ($('.container.public-trip').length) {
                showRegistrationDialog(e);
                return;
            }

            $.ajax({
                url: APPLICATION_URL + 'trip/reorderNotePadIdeas',
                type: 'post',
                data: {
                    ideas: $(this).sortable('toArray',{attribute:'data-id'}),
                    tripId: t_id,
                    locationId: tl_id
                },
                dataType: 'json',
                success: function() {
                    reInitScrollPane();
                }
            });
        }
    });

    $control.find('.idea-name-input')
        .on('init', function(e, editable) {
            var $this = $(this), $idea = $this.closest('.destination-idea');

            if($idea.hasClass('new-idea')){
                var emptyText = 'Add ideas for '+$location.find('.destination-name').text()+' (hotels, restaurants, attractions etc)';

                $this.html(emptyText);

                if(editable){
                    editable.option({
                        title: emptyText,
                        emptytext: emptyText
                    });
                }
                else{
                    $(this).editable('option', {
                        title: emptyText,
                        emptytext: emptyText
                    });
                }

                if(isNewIdeaAdded){
                    setTimeout(function () {
                        editable.show();
                    }, 150);
                }
            }
        })
        .editable({
            type: 'text',
            title: 'Add restaurants, hotels, attractions and places of interest (e.g. airports)',
            showbuttons: false,
            emptytext: 'Add restaurants, hotels, attractions and places of interest (e.g. airports)',
            placeholder: '',
            mode: 'inline',
            unsavedclass: null
        })
        .on('shown', function(e, editable) {
            var $el             = editable.input.$input,
                autoComplete    = new google.maps.places.Autocomplete($el.get(0)),
                $destinationIdea = $el.closest('.destination-idea'),
                ideaId          = $destinationIdea.attr('data-id'),
                placeId         = $location.attr('data-place-id'),
                bounds;

            if(placeId){
                var placesService = new google.maps.places.PlacesService(map);

                placesService.getDetails({placeId: placeId}, function(place, status) {
                    if (status === 'OK') {
                        if(place.geometry && place.geometry.viewport){
                            bounds = place.geometry.viewport;
                            autoComplete.setBounds(bounds);
                        }

                        if(isNewIdeaAdded){
                            isNewIdeaAdded = false;
                        }

                        setTimeout(function(){
                            google.maps.event.trigger(map, 'bounds_changed');
                        }, 200);
                    }
                    else{
                        google.maps.event.trigger(map, 'bounds_changed');
                    }
                });
            }
            else{
                google.maps.event.trigger(map, 'bounds_changed');
            }

            google.maps.event.addListener(autoComplete, 'place_changed', function (e) {
                if ($('.container.public-trip').length) {
                    showRegistrationDialog(e);
                    return;
                }

                $loadingDiv.show();

                var place = autoComplete.getPlace();

                $el.on('blur', function(){$el.val('');});

                place.locationId = tl_id; // add key/value of locationId to place object

                editable.setValue(place.name || place.vicinity || '');

                editable.hide();

                console.log(place);

                if ($destinationIdea.hasClass('new-idea')) {
                    // create new idea
                    createIdea(place).done(function(){
                        $loadingDiv.hide();
                        getLocation(tl_id).done(function(){
                            $loadingDiv.hide();

                            isNewIdeaAdded = true;

                            setLocationsCollapseState($('.notepad-control .destination[data-tl-id="'+tl_id+'"]'));

                            $.get(APPLICATION_URL+"trip/getNotepadLocationIdeas/"+tl_id, function(html){
                                var $html = $(html);

                                $control.find('.panel-body').replaceWith($html.find('.panel-body'));

                                initNotepadLocationIdeas($control);
                            });
                        });

                        initMapIdeas().done(function(){
                            //fitMapToLocationIdeasBounds(tl_id);
                        });
                    });
                } else {
                    // edit existing idea
                    editIdea(place, ideaId).done(function(idea){
                        $destinationIdea.find('.idea-icon img').attr('src', idea['tii_icon']);
                        $destinationIdea.attr('data-type', idea['type']);

                        $loadingDiv.hide();

                        initMapIdeas().done(function(){
                            /*panToIdea(15);*/
                        });
                    });
                }
            });
        });

    $control.find('.idea-notes-input')
        .editable({
            type: 'textarea',
            title: 'Add notes / reservation details',
            showbuttons: false,
            emptytext: 'Add notes / reservation details',
            mode: 'inline',
            unsavedclass: null,
            rows: 1,
            name: 'notes',
            escape: false
        })
        .on('shown', function(e, editable){
            var $el = editable.input.$input, destinationIdea = $el.closest('.destination-idea');

            $el.xautoresize();

            $el.off('keypress').on('keypress', function(event) {
                if (event.keyCode == 10 || event.keyCode == 13) {
                    if (!event.ctrlKey && !event.shiftKey){
                        event.preventDefault();
                        $el.closest('form').submit();
                    }
                }
            });

            $el.off('keydown').on('keydown', function(event) {
                if (event.keyCode == 10 || event.keyCode == 13) {
                    if (event.altKey){
                        event.preventDefault();
                        $el.val($el.val() + String.fromCharCode(13, 10));
                    }
                }
            });

            var ideaLatLng = new google.maps.LatLng(destinationIdea.attr('data-lat'), destinationIdea.attr('data-lng'));

            if(ideaLatLng.toString() != '(0, 0)'){
                var ideaBounds = new google.maps.LatLngBounds();

                ideaBounds.extend(ideaLatLng);

                fitBoundsWithHalfZoom(ideaBounds);

                /*map.fitBounds(ideaBounds);*/

                if(map.getZoom() > 15){
                    map.setZoom(15);
                }

                map.panTo(ideaLatLng);
            }
        })
        .on('save', function(e, params){
            if ($('.container.public-trip').length) {
                showRegistrationDialog(e);
                return;
            }

            var value = $.trim(params.newValue.linkify());

            params.newValue = value;

            updateIdea({
                tii_id: $(this).closest('.destination-idea').data('id'),
                tii_idea_reservation_detail: value
            });
        });

    $control.find('.idea-cost-value')
        .on('init', function(e, editable){
            $(this).prev().on('click', function(){
                setTimeout(function(){
                    editable.show();
                },100);
            });
        })
        .editable({
            type: 'text',
            title: 'Add idea cost',
            showbuttons: false,
            emptytext: '0.00',
            mode: 'inline',
            unsavedclass: null,
            clear: false
        })
        .on('shown', function(e, editable){
            var $el = editable.input.$input;

            $el.val('');

            $el.off('keypress').on('keypress', function(event) {
                if (event.keyCode == 10 || event.keyCode == 13) {
                    if (!event.ctrlKey && !event.shiftKey){
                        event.preventDefault();
                        $el.closest('.idea-cost').off('mouseleave');
                        $el.closest('form').submit();
                    }
                }
                else{
                    var regex = /[0-9]|\.|\+|\-|\*|\//;

                    if( !regex.test(String.fromCharCode(event.keyCode)) ) {
                        event.returnValue = false;

                        if(event.preventDefault){
                            event.preventDefault();
                        }
                    }
                }
            });

            $el.closest('.idea-cost').off().one('mouseleave', function(){
                $el.closest('form').submit();
            });
        })
        .on('save', function(e, params) {
            if ($('.container.public-trip').length) {
                showRegistrationDialog(e);
                return;
            }

            var value = 0;

            try {
                value = Math.round(parseFloat(eval(params.newValue) || 0));
            } catch (e) {
                if (e instanceof SyntaxError) {
                    alert(e.message);
                    return false;
                }
            }

            params.newValue = value;

            var $idea = $(this).closest('.destination-idea');

            $idea.attr('data-cost', value);

            var ideasCost = getIdeasCost($('.notepad-location-ideas-control'));

            $location.find('.location-cost').html(ideasCost > 0 ? ideasCost : '');

            $.post(
                APPLICATION_URL+"trip/updateIdeaCost/"+$idea.attr('data-id'),
                { cost: value },
                getItineraryPanel
            );
        });

    //resizeView();

    reInitScrollPane();

    $('.popover').remove();
}

function getLocation(tl_id) {
    return $.get(APPLICATION_URL + 'trip/getNotepadLocation/' + t_id + '/' + tl_id, function(html) {
        var $html = $(html);

        $(".widget-directions-searchboxes .destination[data-tl-id='"+tl_id+"']").replaceWith($html);

        initNotepadLocation($html);

        getLogisticInfo();
    });
}

function createSearchControl(map) {
    if(map.controls[google.maps.ControlPosition.LEFT_TOP].length == 0) {
        var controlDiv = document.createElement('div'),
            controlUI = document.createElement('input')
            ;

        controlUI.type = 'text';
        controlUI.className = 'search-control';
        controlUI.placeholder = 'add your first city/town';

        controlDiv.className ='search-control-wrapper';
        controlDiv.appendChild(controlUI);

        map.controls[google.maps.ControlPosition.LEFT_TOP].push(controlDiv);

        var autocomplete = new google.maps.places.Autocomplete(controlUI/*,{types:['(cities)']}*/);

        google.maps.event.addListenerOnce(autocomplete, 'place_changed', function() {
            var place = autocomplete.getPlace();

            if (place.geometry) {
                place.locationType = 1;

                createLocation(initLocationOptions(place), function(status, response){
                    if(status == 1){
                        addLog(response.log);

                        map.controls[google.maps.ControlPosition.LEFT_TOP].clear();

                        setViewType('map-view');

                        createNotepadControl(map);
                        createShowItineraryControl(map);

                        initMapObjects();

                        map.panTo(place.geometry.location);
                        map.fitBounds(place.geometry.viewport);
                    }
                });
            } else {
                controlUI.value = '';
            }
        });
    }
}

function setheightToStripLine(){
    $('.strip').each(function () {
        var stripHeight = $(this).parents('.itinerary-locations').outerHeight();

        $(this).height(stripHeight);
    });
}

function getItineraryPanel() {
    return $.ajax({
        url: APPLICATION_URL + 'trip/getItineraryPanel',
        type: 'post',
        dataType: 'html',
        data: {tripId: t_id},
        success: function(html) {
            var $itineraryData = $('.itinerary-data');
            $itineraryData.html(html).promise().done(function(){
                updateItineraryDistancesByDistances(lastItineraryDistances);
                updateItineraryDistances();
                updateItineraryLogisticInfo();
                refreshFancyBox();
                initializeDragAndDrop();
                initSlider();
                initMapIdeasDirections(false);
                if($('.container').hasClass('guest-trip') && !$('.container').hasClass('user-logged-in')){
                    showRegistrationDialog();
                }
                if($.inArray(getViewType(), ['full-view'])>0){
                    setTimeout(function(){
                        $itineraryData.find('.notes').xautoresize();
                    },50);
                }
                else{
                    $('.show-itinerary-control:not(.collapse-control)').one('click', function(){
                        setTimeout(function(){
                            $itineraryData.find('.notes').xautoresize();
                        },50);
                    });
                }
                if ($('.public-trip').length) {
                    $('.itinerary-locations:last .locations-distance').hide();
                    var location = $('.itinerary-locations[data-location-type="3"]');
                    if (location.length) {
                        location.prev().find('.strip').hide();
                    }

                    $('textarea.notes').attr({readonly: true});
                }
                setheightToStripLine();

            });

            // var photos = $( html ).find( '#comments-photos-container-'+$('#TripsNoteTnTiiId').val() );
            // $('#comments-photos-container-'+$('#TripsNoteTnTiiId').val()).html(photos);

            // var $leftSidebar = $('.left-map-sidebar');
            // var photos = $( html ).find( '.'+$(this).attr('id') );
            // $leftSidebar.html(photos).promise().done(function(){
            //     // var $idea = $(this).closest('.itinerary-location-idea-wrapper');
            //
            //     // $(this).html(photos);
            //
            //
            //
            // });

        }
    });
}
function getItineraryLeftPanel() {
    return $.ajax({
        url: APPLICATION_URL + 'trip/getItineraryLeft',
        type: 'post',
        dataType: 'html',
        data: {tripId: t_id},
        success: function(html) {
            var photos = $( html ).find( '#comments-photos-container-'+$('#TripsNoteTnTiiId').val() );
            $('#comments-photos-container-'+$('#TripsNoteTnTiiId').val() ).html(photos);

        }
    });
}

function initSlider() {
    var ul = $('#slider').find('ul');
    var itemLength = ul.children().length;
    ul.css('width', itemLength * 40);

    ul.css({'left': sliderLeftIndent||0+'px'});

    $('.controls div:last').on('click', function() {
        var itemWidth = $('li', ul).outerWidth() + 4;
        sliderLeftIndent = parseInt(ul.css('left')) - itemWidth;

        ul.animate({'left': sliderLeftIndent}, {queue: true, duration: 200},function(){});
    });

    $('.controls div:first').on('click', function() {
        if (parseInt(ul.css('left')) < 0) {
            var itemWidth = $('li', ul).outerWidth() + 4;
            sliderLeftIndent = parseInt(ul.css('left')) + itemWidth;

            ul.animate({'left': sliderLeftIndent}, {queue: true, duration: 200},function(){});
        }
    });

    if (sliderItemState) {
        $('li a[href=' + sliderItemState + ']', ul).trigger('click', false);
    }
}

function checkFlightsNumbers(){
    return false; // avoid this function work

    /*$('.your-itinerary .distance-notes, .notepad-control .logistic-notes').each(function(){
        var $notes = $(this);

        var flightNumbers = $notes.text().match(/([a-z][a-z]|[a-z][0-9]|[0-9][a-z])[a-z]?[0-9]{1,4}[a-z]?/i);

        if(flightNumbers && flightNumbers.length){
            var $flightNumberInfoContainer = $notes.parent().find('.flight-number-info');

            if(!$flightNumberInfoContainer.length){
                $flightNumberInfoContainer = $('<div class="flight-number-info"></div>');
            }

            var $button = $('<a class="btn-orange">Find departure info by flight number</a>')
                .on('click', function(){
                    $flightNumberInfoContainer.html('<i class="fa fa-spin fa-spinner"></i>');

                    $.get(APPLICATION_URL + 'trip/getFlightNumberGoogleWidget/' + flightNumbers[0], function(html){
                        if(!html){
                            html = 'No departure info was found!';
                        }
                        $flightNumberInfoContainer.html(html);
                        setheightToStripLine();
                    });
                });

            $flightNumberInfoContainer.html($button);

            $notes.parent().append($flightNumberInfoContainer);
        }
    });*/
}

function initializeDragAndDrop() {
    $('.container:not(.public-trip) .itinerary-location-ideas').each(function(index, value) {
        var current = $(value);
        if (current.find('div').length > 0) {
            var currentId = current.attr('id');
            current.attr('id', currentId+'-'+index);

            current.sortable({
                handle: '.itinerary-location-idea',
                revert: true,
                //containment: 'parent',
                cursor: 'move',
                update: function (event, ui) {
                    if ($('.container.public-trip').length) {
                        showRegistrationDialog(event);
                        return;
                    }

                    var data = $(this).sortable('serialize');

                    var tripId = $(ui.item).data('trip-id');
                    var locationId = $(ui.item).data('location-id');
                    var locationDate = $(ui.item).data('location-date');

                    var query = data+'&tripId='+tripId+'&locationId='+locationId+'&locationDate='+locationDate;

                    $('.loadingDiv').show();

                    $.ajax({
                        data: query,
                        type: 'post',
                        url: APPLICATION_URL + 'trip/reorderLocationIdeas',
                        dataType: 'json',
                        success: function(response) {
                            if (response.status == 'ok') {
;                                getItineraryPanel();
                                getItineraryLeftPanel();

                            } else {
                                alert('ERROR');
                            }

                            initMapIdeasDirections(false);

                            $('.loadingDiv').hide();
                        },
                        error:function(){
                            $('.loadingDiv').hide();
                        }
                    });
                }
            });
        }
    });
}

function refreshFancyBox() {
    $('a[rel=idea-gallery]').fancybox({
        'transitionIn': 'none',
        'transitionOut': 'none',
        'titlePosition': 'over'
    });
}

function initMap() {
    if(document.getElementById("mapCanvas") != undefined){

        map = new google.maps.Map(document.getElementById("mapCanvas"),{
            zoom			    : 2,
            center			    : new google.maps.LatLng(0, 0),
            minZoom			    : 2,
            //maxZoom			    : 18,
            mapTypeId		    : google.maps.MapTypeId.ROADMAP,
            mapTypeControl	    : false,
            zoomControl         : true,
            scaleControl        : true,
            panControl          : false,
            overviewMapControl  : false,
            streetViewControl   : false,
            zoomControlOptions: {
                style: google.maps.ZoomControlStyle.SMALL,
                position: google.maps.ControlPosition.RIGHT_BOTTOM
            }
        });

        var styledAirports = new google.maps.StyledMapType(
            [{
                featureType: "transit.station.airport",
                elementType: "geometry.fill",
                stylers: [{ hue: "#cc6666" }, { lightness: -20 }, { saturation: 50 }]
                }
            ],
            {name: "Styled Airports"}
        );

        map.mapTypes.set('styledAirports', styledAirports);
        map.setMapTypeId('styledAirports');

        google.maps.event.addListenerOnce(map, 'idle', function(){
            ideasMarkersClusterer = new MarkerClusterer(map, [], {
                minimumClusterSize: 10000 // disable clusterer
                //,maxZoom: 20
            });

            locationsMarkersClusterer = new MarkerClusterer(map, [], {
                minimumClusterSize: 10000 // disable clusterer
                //,maxZoom: 20
            });

            InfoBubble.prototype.baseZIndex_ = 1000;
            InfoBubble.baseZIndex_ = 1000;

            infoWindow = new InfoBubble({
                minWidth: 240,
                maxWidth: 240,
                minHeight: '100%',
                borderRadius: 2,
                borderWidth: 0,
                arrowSize: 16,
                disableAutoPan: true,
                closeSrc: 'js/ckeditor/skins/moono/images/close.png',
                arrowPosition: 25,
                shadowStyle: 3,
                zIndex: 1000
            });

            infoWindow.bubble_.className += 'info-window';

            $.get(APPLICATION_URL + 'trip/updateLocationsAndIdeasFromGoogle/' + t_id, function(objects){
                var placesService = new google.maps.places.PlacesService(map);
                var autocompleteService = new google.maps.places.AutocompleteService();

                var processIdeas = function() {
                    var process = $.Deferred();

                    var ideas = objects['ideas'] || [];

                    (function recursiveProcess() {
                        if (ideas.length) {
                            if(!$('#pleaseWaitDialog').length){
                                $(
                                    '<div class="modal fade" tabindex="-1" role="dialog" id="pleaseWaitDialog">' +
                                    '<div class="modal-dialog">' +
                                    '<div class="modal-content">' +
                                    '<div class="modal-body">' +
                                    '<h4 class="modal-title">Please wait! Updating ideas <i class="fa fa-spinner fa-spin"></i></h4>' +
                                    '</div>' +
                                    '</div>' +
                                    '</div>' +
                                    '</div>'
                                )
                                    .modal({backdrop: 'static', keyboard: false})
                                ;
                            }

                            var idea = ideas.shift();

                            var subProcess = $.Deferred();

                            var updateIdea = function(idea){
                                this.updateIdea(idea)
                                    .done(function(){ subProcess.resolve(); })
                                    .error(function(){ subProcess.resolve(); });
                            };

                            var getDetails = function(params){
                                placesService.getDetails(params, function(place, status) {
                                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                                        if (place.icon) {idea['tii_icon'] = place.icon;}
                                        else {idea['tii_icon'] = '/img/plus.png';}

                                        if(place['place_id']){idea['tii_google_place_id'] = place['place_id'];}

                                        if (place.geometry) {
                                            idea['tii_idea_latitude'] = place.geometry.location.lat();
                                            idea['tii_idea_longitude'] = place.geometry.location.lng();
                                        } else {
                                            idea['tii_idea_latitude'] = 0;
                                            idea['tii_idea_longitude'] = 0;
                                        }

                                        if(place.formatted_phone_number){idea['tii_idea_phone'] = place.formatted_phone_number;}

                                        if(place.formatted_address || place.vicinity){idea['tii_idea_address'] = (place.formatted_address || place.vicinity);}

                                        if(place.website){idea['tii_idea_website'] = place.website;}

                                        if (place.opening_hours) {
                                            var ohr = '';
                                            if (place.opening_hours.periods[0].open) {
                                                ohr = place.opening_hours.periods[0].open.hours+' : '+ place.opening_hours.periods[0].open.minutes;
                                            }

                                            if (place.opening_hours.periods[0].close) {
                                                ohr = ohr +' - '+place.opening_hours.periods[0].close.hours +' : '+ place.opening_hours.periods[0].close.minutes;
                                            }

                                            idea['tii_idea_opening_hours'] = ohr;
                                        }

                                        updateIdea(idea);
                                    } else if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
                                        setTimeout(getDetails(params), 1000);
                                    } else {
                                        idea['tii_icon'] = '/img/plus.png';
                                        idea['tii_idea_latitude'] = 0;
                                        idea['tii_idea_longitude'] = 0;

                                        updateIdea(idea);
                                    }
                                });
                            };

                            var getQueryPredictions = function(params) {
                                autocompleteService.getQueryPredictions(params, function(results, status) {
                                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                                        var place = results[0];

                                        if (!place['place_id']) {

                                            idea['tii_icon'] = '/img/plus.png';
                                            idea['tii_idea_latitude'] = 0;
                                            idea['tii_idea_longitude'] = 0;

                                            updateIdea(idea);
                                        } else {
                                            getDetails({placeId: place['place_id']});
                                        }
                                    } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                                        idea['tii_icon'] = '/img/plus.png';
                                        idea['tii_idea_latitude'] = 0;
                                        idea['tii_idea_longitude'] = 0;

                                        updateIdea(idea);
                                    } else if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
                                        setTimeout(getQueryPredictions(params), 1000);
                                    } else {
                                        subProcess.resolve();
                                    }
                                });
                            };

                            getQueryPredictions({
                                input: idea['tii_idea_title'],
                                location: new google.maps.LatLng(parseFloat(idea['tii_idea_latitude']), parseFloat(idea['tii_idea_longitude'])),
                                radius: 0.1
                            });

                            subProcess.promise().done(function(){
                                recursiveProcess();
                            });
                        }
                        else{
                            setTimeout(function() {
                                $('#pleaseWaitDialog').detach().modal('hide');
                                process.resolve();
                            }, 150);
                        }
                    })();

                    return process.promise();
                };

                var processLocations = function() {
                    var process = $.Deferred();

                    var locations = objects['locations'] || [];

                    (function recursiveProcess() {
                        if (locations.length) {
                            if (!$('#pleaseWaitDialog').length) {
                                $(
                                    '<div class="modal fade" tabindex="-1" role="dialog" id="pleaseWaitDialog">' +
                                    '<div class="modal-dialog">' +
                                    '<div class="modal-content">' +
                                    '<div class="modal-body">' +
                                    '<h4 class="modal-title">Please wait! Updating locations <i class="fa fa-spinner fa-spin"></i></h4>' +
                                    '</div>' +
                                    '</div>' +
                                    '</div>' +
                                    '</div>'
                                )
                                    .modal({backdrop: 'static', keyboard: false})
                                ;
                            }

                            var location = locations.shift();

                            var subProcess = $.Deferred();

                            var updateLocation = function (location) {
                                this.updateLocation(location)
                                    .done(function(){ subProcess.resolve(); })
                                    .error(function(){ subProcess.resolve(); });
                            };

                            var getDetails = function(params){
                                placesService.getDetails(params, function(place, status) {
                                    if (status === 'OK') {
                                        var country = '';

                                        (place['address_components']||[]).forEach(function (item) {
                                            if (_.contains(item['types'], 'country')) {
                                                country = item['long_name'];
                                            }
                                        });

                                        location['tl_country'] = country;

                                        location['tl_google_place_id'] = place['place_id'];

                                        if(place.geometry){
                                            location['tl_location_latitude'] = place.geometry.location.lat();
                                            location['tl_location_longitude'] = place.geometry.location.lng();
                                        }

                                        updateLocation(location);
                                    }
                                    else if(status === 'OVER_QUERY_LIMIT'){
                                        setTimeout(getDetails(params), 1000);
                                    }
                                    else{
                                        subProcess.resolve();
                                    }
                                });
                            };

                            var getPlacePredictions = function (params) {
                                autocompleteService.getPlacePredictions(params, function (results, status) {
                                    if (status === 'OK') {
                                        var place = results[0];

                                        if(place && place['place_id']){
                                            getDetails({placeId: place['place_id']});
                                        }
                                        else{
                                            subProcess.resolve();
                                        }
                                    }
                                    else if (status === 'OVER_QUERY_LIMIT') {
                                        setTimeout(getPlacePredictions(params), 1000);
                                    }
                                    else {
                                        subProcess.resolve();
                                    }
                                });
                            };

                            getPlacePredictions({
                                input: location['tl_location'],
                                location: new google.maps.LatLng(parseFloat(location['tl_location_latitude']), parseFloat(location['tl_location_longitude'])),
                                radius: 0.1
                                //, types: ['(cities)']
                            });

                            subProcess.promise().done(function () {
                                recursiveProcess();
                            });
                        } else {
                            setTimeout(function () {
                                $('#pleaseWaitDialog').detach().modal('hide');
                                process.resolve();
                            }, 150);
                        }
                    })();

                    return process.promise();
                };

                $.sequence([processIdeas, processLocations, function () {
                    var viewType = getViewType();

                    if (viewType === 'new-view') {
                        createSearchControl(map);
                    } else {
                        createShowItineraryControl(map);

                        if (!$('.container').hasClass('public-trip')) {
                            createNotepadControl(map);
                        }
                    }

                    resizeView();

                    getItineraryPanel();
                    getItineraryLeftPanel();

                    initMapObjects().done(function() {
                        fitMapToLocationsBounds();
                        $('#mapCanvas').removeClass('loading');
                    });
                }], true);
            }, 'json');

            mapZoomListener = google.maps.event.addListener(map, 'zoom_changed', function() {
                var $itineraryPanel = $('#itineraryPanel');

                if (locationsMarkersClusterer.loaded && ideasMarkersClusterer.loaded) {
                    if($itineraryPanel.is(':visible')){
                        ideasDirectionsMapObjects.forEach(function(obj){
                            if(obj.getMap() == null){
                                obj.setMap(map);
                            }
                        });
                    }
                    else{
                        ideasDirectionsMapObjects.forEach(function(obj){
                            if(obj.getMap() != null){
                                obj.setMap(null);
                            }
                        });
                    }

                    if($itineraryPanel.is(':visible') && $itineraryPanel.find('.itinerary-date-item.selected .itinerary-locations').length < 2){
                        directionsMapObjects.forEach(function(obj){
                            if(obj.getMap() != null){
                                obj.setMap(null);
                            }
                        });
                    }
                    else{
                        if(map.getZoom() < CITY_LEVEL_ZOOM){
                            directionsMapObjects.forEach(function(obj){
                                if(obj.getMap() == null){
                                    obj.setMap(map);
                                }
                            });
                        } else{
                            directionsMapObjects.forEach(function(obj){
                                if(obj.getMap() != null){
                                    obj.setMap(null);
                                }
                            });
                        }
                    }

                    /*if(locationsMarkersClusterer.getMap() != null){
                         locationsMarkersClusterer.setMap(null);
                         locationsMarkersClusterer.resetViewport(true);
                         locationsMarkersClusterer.redraw();
                     }*/
                }
            });
        });
    }
}

var makeInfoBubbleMarker = function(params){
    $.extend(this,{
        content: '',
        position: new google.maps.LatLng(0,0),
        //width: 78,
        //height: 30,
        map: map,
        class: 'distance-info',
        zIndex: 1
    }, params);

    var $mainContainer = $('<div>').css({
        paddingBottom: 10,
        marginLeft: '30%'
    });

    var $container = $('<div>').css({
        /*overflow: 'auto',*/
        cursor: 'default',
        clear: 'both',
        position: 'relative',
        padding: '3px 4px 2px 5px',
        width: this.width,
        whiteSpace: 'nowrap',
        height: this.height,
        borderRadius: 4,
        display: 'inline-block',
        border: '1px solid rgb(221, 221, 221)',
        backgroundColor: 'white'
    }).toggleClass(this.class);

    var $arrow = $(
        '<div style="position: relative; margin-top: -1px;">' +
            '<div style="position: absolute; left: 30%; height: 0; width: 0; margin-left: 0; border-width: 10px 10px 0 0; border-color: rgb(221, 221, 221) transparent transparent; border-style: solid;"></div>' +
            '<div style="position: absolute; left: 30%; height: 0; width: 0; border-color: white transparent transparent; border-width: 9px 9px 0 0; margin-left: 0; border-style: solid;"></div>' +
        '</div>'
    );

    return new RichMarker({
        position:   this.position,
        draggable:  false,
        content:    $mainContainer.append($container.html(this.content),$arrow).get(0),
        shadow:     false,
        map:        this.map,
        zIndex:     this.zIndex,
        directionId:  this.directionId,
        routeType: this.routeType,
        line: this.line
    });
};

function initMapIdeas() {
    var process = $.Deferred();

    ideasMarkersClusterer.loaded = false;

    if(getMapIdeasXHR){
        getMapIdeasXHR.abort();
    }

    getMapIdeasXHR = $.get(APPLICATION_URL + 'trip/getMapIdeas/' + t_id, function(ideas){
        var removedMarkers = [];

        $.each(ideasMarkersClusterer.getMarkers(), function(i, renderedMarker){
            if(!ideas[renderedMarker.idea.tii_id] || JSON.stringify(ideas[renderedMarker.idea.tii_id]) != JSON.stringify(renderedMarker.idea)){
                removedMarkers.push(renderedMarker);
            }
        });

        $.each(removedMarkers, function(i, removedMarker) {
            ideasMarkersClusterer.removeMarker(removedMarker);
        });

        $.each(ideas, function(ideaId, idea) {
            var renderedMarker = $.grep(ideasMarkersClusterer.getMarkers(), function(marker) {
                return marker.idea.tii_id == ideaId;
            })[0];

            if (!renderedMarker) {
                var $marker = $('<div>').attr({
                    'data-idea-id': idea['tii_id'],
                    class: "idea-marker",
                    title: idea['tii_idea_title']
                }).html('<img src="'+idea['tii_icon']+'"/>');

                ideasMarkersClusterer.addMarker(new RichMarker({
                    position: new google.maps.LatLng(idea['tii_idea_latitude'], idea['tii_idea_longitude']),
                    draggable: false,
                    content: $marker.get(0),
                    idea: idea,
                    shadow: false,
                    anchor: RichMarkerPosition.MIDDLE,
                    zIndex: 3
                }));
            }
        });

        ideasMarkersClusterer.loaded = true;

        process.resolve();
    },'json');

    return process.promise();
}

function initMapLocations() {
    var process = $.Deferred();

    locationsMarkersClusterer.loaded = false;

    if (getMapLocationsXHR) {
        getMapLocationsXHR.abort();
    }

    getMapLocationsXHR = $.get(APPLICATION_URL + 'trip/getMapLocations/' + t_id, function(locations) {
        var removedMarkers = [];

        $.each(locationsMarkersClusterer.getMarkers(), function(i, renderedMarker){
            if(!locations[renderedMarker.getLatLng()] || JSON.stringify(locations[renderedMarker.getLatLng()]) != JSON.stringify(renderedMarker.locations)){
                removedMarkers.push(renderedMarker);
            }
        });

        $.each(removedMarkers, function(i, removedMarker){
            locationsMarkersClusterer.removeMarker(removedMarker);
        });

        $.each(locations, function(markerLatLng, markerLocations) {
            var renderedMarker = $.grep(locationsMarkersClusterer.getMarkers(), function(renderedMarker){
                return renderedMarker.getLatLng() == markerLatLng;
            })[0];

            if (!renderedMarker) {
                var locationName = '', placeId;

                $.each(markerLocations, function(locationOrder, location){
                    locationName = location['tl_location'].split(', ')[0];
                    placeId = location['tl_google_place_id'];

                    return false;
                });

                var $marker = $('<div class="location-marker" title="'+locationName+'">').append('<div class="location-marker-name">'+locationName+'</div>');

                $.each(markerLocations, function(locationOrder, location){
                    var $markerLocation = $('<div>').attr({
                        class: 'location-marker-location',
                        'data-location-id': location['tl_id']
                    });

                    $markerLocation.append('<img src="'+APPLICATION_URL+'img/pins/'+locationOrder+'.png" />');

                    $marker.append($markerLocation);
                });

                if (placeId) {
                    $marker.on('click', function(){
                        var bounds = new google.maps.LatLngBounds();

                        $('.destination[data-place-id="'+placeId+'"] .destination-idea').each(function(){
                            var $ideaRow = $(this);

                            var lat = Number($ideaRow.attr('data-lat')),
                                lng = Number($ideaRow.attr('data-lng'));

                            if (lat && lng){
                                bounds.extend(new google.maps.LatLng({lat: lat, lng: lng}));
                            }
                        });

                        if (!bounds.isEmpty()) {
                            fitBoundsWithHalfZoom(bounds);

                            /*map.fitBounds(bounds);*/

                            if (map.getZoom() > 19) {
                                map.setZoom(19);
                            }

                            if (map.getZoom() < CITY_LEVEL_ZOOM) {
                                map.setZoom(CITY_LEVEL_ZOOM);
                            }
                        } else {
                            var placesService = new google.maps.places.PlacesService(map);

                            placesService.getDetails({placeId: placeId}, function(place, status) {
                                if (status == 'OK') {
                                    if(place.geometry && place.geometry.viewport){
                                        map.fitBounds(place.geometry.viewport);

                                        if (map.getZoom() > 19) {
                                            map.setZoom(19);
                                        }

                                        if (map.getZoom() < CITY_LEVEL_ZOOM) {
                                            map.setZoom(CITY_LEVEL_ZOOM);
                                        }
                                    }
                                }
                            });
                        }
                    });
                }

                locationsMarkersClusterer.addMarker(new RichMarker({
                    position:   new google.maps.LatLng(markerLatLng.split(',')[0], markerLatLng.split(',')[1]),
                    draggable:  false,
                    content:    $marker.get(0),
                    locations:  markerLocations,
                    shadow:     false,
                    map:        map,
                    zIndex:     5,
                    getLatLng: function () {
                        return this.position.toString().replace(/[() ]/g, '');
                    },
                    getLocation: function () {
                        return this.locations[0];
                    }
                }));
            }
        });

        locationsMarkersClusterer.loaded = true;

        initLocationDirections().done(process.resolve);
    },'json');

    return process.promise();
}

function initMapObjects() {
    return $.when(
        initMapLocations(),
        initMapIdeas(),
        initMapIdeasDirections(false)
    );
}

function initLocationDirections(){
    var process = $.Deferred();

    $.get(APPLICATION_URL + 'trip/getLocationDirections/' + t_id, function(directionsData) {
        locationDirections.update(
            directionsData['locations'],
            directionsData['directions']
        ).on('loaded', process.resolve);
    }, 'json');

    return process.promise();
}

function initMapIdeasDirections(changeMapBounds) {
    changeMapBounds = !!changeMapBounds;

    var process = $.Deferred();

    var interval = setInterval(function () {
        if (ideasMarkersClusterer.loaded && locationsMarkersClusterer.loaded) {
            clearInterval(interval);

            var dayIdeaMarkers = [],
                dayLocationMarkers = [],
                ideasBounds = new google.maps.LatLngBounds(),
                locationsBounds = new google.maps.LatLngBounds(),
                mapObjects = [];

            $('#itineraryPanel:not(:hidden)').find('.itinerary-date-item.selected .itinerary-locations').each(function () {
                var $location = $(this), locationIdeaMarkers = [];

                var locationMarker = $.grep(locationsMarkersClusterer.getMarkers(), function (marker) {
                    var result = false;

                    $.each(marker.locations, function (locationIndex, location) {
                        if (location.tl_id == $location.attr('data-location-id')) {
                            result = true;
                            return false;
                        }
                    });

                    return result;
                });

                if (locationMarker.length) {
                    dayLocationMarkers.push(locationMarker[0]);
                    locationsBounds.extend(locationMarker[0].getPosition());
                }

                $location.find('.itinerary-location-idea-wrapper').each(function () {
                    var $ideaRow = $(this);

                    var ideaLat = Number($ideaRow.attr('data-idea-lat')),
                        ideaLng = Number($ideaRow.attr('data-idea-lng')),
                        ideaId = Number($ideaRow.attr('data-idea-id'));

                    if (ideaLat && ideaLng) {
                        locationIdeaMarkers.push({id: ideaId, lat: ideaLat, lng: ideaLng});

                        ideasBounds.extend(new google.maps.LatLng({lat: ideaLat, lng: ideaLng}));
                    }
                });

                if (locationIdeaMarkers.length) {
                    dayIdeaMarkers.push(locationIdeaMarkers);
                }
            });

            if (changeMapBounds) {
                if (dayLocationMarkers.length > 1 || ideasBounds.isEmpty()) {
                    if (!locationsBounds.isEmpty()) {
                        // fitBoundsWithHalfZoom(locationsBounds);

                        map.fitBounds(locationsBounds);

                        if (map.getZoom() > CITY_LEVEL_ZOOM) {
                            map.setZoom(CITY_LEVEL_ZOOM);
                        }
                    }
                } else {
                    // fitBoundsWithHalfZoom(ideasBounds);

                    map.fitBounds(ideasBounds);

                    if (map.getZoom() > 19) {
                        map.setZoom(19);
                    }
                }
            }

            $.each(ideasMarkersClusterer.getMarkers(), function (i, marker) {
                var $markerContent = $(marker.content);

                /*var isDayMarker = dayIdeaMarkers.some(function (dayIdeaMarkers) {
                    return dayIdeaMarkers.some(function (dayIdeaMarker) {
                        return dayIdeaMarker.id == marker.idea.tii_id;
                    });
                });*/

                /*if (isDayMarker) {*/
                    if (!$markerContent.hasClass('day-marker')) {
                        var $ideaName = $('<div class="marker-idea-name">').text(marker['idea']['tii_idea_title']);

                        google.maps.event.addListenerOnce(marker, 'domready', function () {
                            var interval = setInterval(function () {
                                if ($ideaName.outerWidth()) {
                                    clearInterval(interval);

                                    $ideaName.css({
                                        left: -$ideaName.outerWidth() / 2,
                                        visibility: 'visible',
                                        bottom: $markerContent.outerHeight() + 6
                                    });
                                }
                            }, 100);
                        });

                        $markerContent.toggleClass('day-marker');

                        $markerContent.prepend($ideaName).promise().done(function () {
                            marker.content_changed();
                        });
                    }
                /*}
                else if ($markerContent.hasClass('day-marker')) {
                    $markerContent.toggleClass('day-marker', false);
                    $markerContent.find('.marker-idea-name').remove();
                    marker.content_changed();
                }*/
            });

            dayIdeaMarkers.forEach(function (markers) {
                var dayMarkersPath = [];

                markers.forEach(function (marker) {
                    if (marker.lat && marker.lng) {
                        dayMarkersPath.push(new google.maps.LatLng(marker.lat, marker.lng));
                    }
                });

                var polyline = new google.maps.Polyline({
                    path: dayMarkersPath,
                    geodesic: false,
                    strokeOpacity: 0,
                    icons: [{
                        icon: {
                            path: 'M 0,-1 0,1',
                            strokeColor: '#0055FF',
                            strokeOpacity: 0.6,
                            strokeWeight: 6,
                            scale: 1
                        },
                        offset: '0',
                        repeat: '15px'
                    }]
                });

                mapObjects.push(polyline);
            });

            $.each(ideasDirectionsMapObjects, function () {
                this.setMap(null);
            });

            $.each(mapObjects, function () {
                this.setMap(map);
            });

            ideasDirectionsMapObjects = mapObjects;

            process.resolve();
        }
    }, 100);

    return process.promise();
}

function deleteuserbuddy(user_id){	//remove user from trip
    $.ajax({
        url		:	APPLICATION_URL+"trips/deleteuserbuddy",
        type	:	"POST",
        data	:	({tripid: t_id, user_id: user_id }),
        dataType:	"JSON",
        success	:	function(data){
            if(data.success == '1'){
                $("#userbuddydiv"+user_id).slideUp("slow", function(){
                    $(this).remove();
                });

                $("#tripbuddy"+user_id).slideUp("slow", function(){
                    $(this).remove();

                    $('.js-trip-buddies .js-trip-buddies-count').html($('.js-trip-buddies .dropdown-menu li').length);
                });

                addLog(data.log);
            }

            if(data.reload == '1'){	//reload page if current user is removed
                window.location.reload();
            }
        }
    });
}

function drawArc(center, initialBearing, finalBearing, radius) {
    var points = 40, extp = [];

    if (initialBearing > finalBearing) finalBearing += 360;

    var deltaBearing = finalBearing - initialBearing;

    deltaBearing = deltaBearing/points;

    for (var i=0; (i < points+1); i++)
    {
        extp.push(center.DestinationPoint(initialBearing + i*deltaBearing, radius, EARTH_RADIUS));
    }

    return extp;
}

function getGeodesicPolyline(start, end) {
    var geodesicPoints = [];

    var lat1 = start.lat() * (Math.PI/180);
    var lon1 = start.lng() * (Math.PI/180);
    var lat2 = end.lat() * (Math.PI/180);
    var lon2 = end.lng() * (Math.PI/180);

    var d = 2*Math.asin(Math.sqrt( Math.pow((Math.sin((lat1-lat2)/2)),2) + Math.cos(lat1)*Math.cos(lat2)*Math.pow((Math.sin((lon1-lon2)/2)),2)));

    for (var n = 0 ; n < 61 ; n++ ) {
        var f = (1/60) * n;
        f = f.toFixed(6);
        var A = Math.sin((1-f)*d)/Math.sin(d);
        var B = Math.sin(f*d)/Math.sin(d);

        var x = A*Math.cos(lat1)*Math.cos(lon1) + B*Math.cos(lat2)*Math.cos(lon2);
        var y = A*Math.cos(lat1)*Math.sin(lon1) + B*Math.cos(lat2)*Math.sin(lon2);
        var z = A*Math.sin(lat1) + B*Math.sin(lat2);

        var latN = Math.atan2(z,Math.sqrt(Math.pow(x,2)+Math.pow(y,2)));
        var lonN = Math.atan2(y,x);
        var p = new google.maps.LatLng(latN/(Math.PI/180), lonN/(Math.PI/180));
        geodesicPoints.push(p);
    }

    return geodesicPoints;
}

function setLocationsCollapseState($destinations) {
    if(!$destinations){
        $destinations = $('.notepad-control .destination');
    }

    $destinations.each(function(){
        var $destination = $(this),
            $btnShowIdeasSpan = $destination.find('.btn-show-ideas span'),
            ideasCount = parseInt($destination.attr('data-ideas-count'))||0
        ;

        $btnShowIdeasSpan.html('');

        if(ideasCount){
            $btnShowIdeasSpan.html(ideasCount+(ideasCount == 1 ? ' place' : ' places'));
        }
    });
}

function setLogCollapseState(){
    var $log = $('#log'), $collapseBtn = $log.prev(), changesCount = $log.find('div').length;

    $collapseBtn.find('.items-count').html('');

    if(changesCount){
        $collapseBtn.find('.items-count').html(' ('+changesCount+(changesCount == 1 ? ' change' : ' changes')+')');
        $collapseBtn.find('.icon-collapse').toggleClass('hide', false);
    }
    else{
        $collapseBtn.find('.icon-collapse').toggleClass('hide', true);
    }
}

function addLog(log){
    if(log && log != ""){
        $("#log").prepend(log);  //add log
        setLogCollapseState();
    }
}

function getIdeasCost($location){
    var cost = 0;

    $location.find('.destination-idea[data-cost]').each(function(){
        var $idea = $(this);

        cost += parseFloat($idea.attr('data-cost')) * $idea.find('.idea-dates .selected').length;
    });

    cost = Math.round(cost);

    return cost;
}

function escapeHtml(string){
    var entityMap = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': '&quot;',
        "'": '&#39;',
        "/": '&#x2F;'
    };

    return String(string).replace(/[&<>"'\/]/g, function (s) {
        return entityMap[s];
    });
}

function printMap(){
    window.open("", "Map");

    var mapControls = $('.notepad-control-wrapper, .show-itinerary-control, .notepad-location-ideas-control-wrapper')
        .toggleClass('hide');

    console.log(map.getDiv());

    html2canvas(map.getDiv(), {
        useCORS: true,
        onrendered: function (canvas) {
            mapControls.toggleClass('hide');

            var $form = $(
                '<form method="post" action="/trip/printImage" target="Map">' +
                    '<input type="hidden" name="image" value="'+canvas.toDataURL("image/png")+'">' +
                '</form>'
            );

            $('body').append($form);

            $form.submit();
        }
    });
}

(function() {
    function PlacesSearch(element, options) {
        this.element = $(element);

        this.options = $.extend({
            types: undefined,
            bounds: undefined,
            resultTypes: []
        }, options);

        this.onSelectAddress = this.options.onSelectAddress || $.noop;

        this.autocompleteService = new google.maps.places.AutocompleteService();
        this.placesService = new google.maps.places.PlacesService($('<div />')[0]);

        this.element.off();

        this.element.typeahead({
            source: $.proxy(this.getPredictions, this),
            updater: $.proxy(this.selectAddress, this),
            appendToBody: true
        });
    }

    PlacesSearch.prototype = {
        constructor: PlacesSearch,

        getPredictions: function(query, process) {
            var that = this;

            this.autocompleteService.getPlacePredictions(
                {
                    input: query,
                    types: that.options.types,
                    bounds: $.isFunction(that.options.bounds) ? that.options.bounds() : that.options.bounds
                },
                $.proxy(this.onGetPrediction, this, process)
            );
        },

        onGetPrediction: function(process, predictions, status) {
            var that = this;

            if (status === google.maps.places.PlacesServiceStatus.OK) {
                predictions = $.map(predictions, function(prediction) {
                    if(prediction.types && prediction.place_id){
                        return prediction;
                    }
                    else{
                        return null;
                    }
                });

                // filter predictions by result types
                if(that.options.resultTypes.length){
                    predictions = $.map(predictions, function(prediction) {
                        if($(prediction.types).filter(that.options.resultTypes).length){
                            return prediction;
                        }
                        else{
                            return null;
                        }
                    });
                }

                this.predictions = predictions;

                process($.map(predictions, function(prediction) {
                    return prediction.description;
                }));
            }
        },

        onGetPlaceDetails:  function(result, status) {
            if (status !== google.maps.GeocoderStatus.OK) {
                return window.alert('Location was not found. Please try again.');
            }
            this.options.onSelectAddress(result);
        },

        selectAddress: function(address) {
            // Get the prediction reference.
            var reference = $.grep(this.predictions, function(prediction) {
                return prediction.description == address;
            })[0]['reference'];

            // Now we can reliably geocode the address.
            this.placesService.getDetails({ reference: reference }, $.proxy(this.onGetPlaceDetails, this));

            return address;
        }
    };

    $.fn.placesSearch = function (options) {
        return this.each(function () {
            new PlacesSearch(this, options);
        });
    };

    var resizeTimeout = false;
    $(window).resize(onWindowResize); // bind resize event.

    setWidthToTripName(); //run once at start.

    function onWindowResize() {
        if(resizeTimeout){
            clearTimeout(resizeTimeout);
        }
        resizeTimeout = setTimeout(function(e){
            resizeTimeout = false;

            // this is code that is ran at the "end" of a resize.
            setWidthToTripName();
        }, 400);
    }

    function setWidthToTripName(){
        var width;

        if($(window).width() < 768){
            width = $('.about_inner .navbar-default').width() - $('.navbar-brand-logo').outerWidth() - $('.btn-edit-trip').width() - $('.navbar-toggle').outerWidth() - 52;
        }else{
            width = $('.about_inner .navbar-default').width() - $('.navbar-brand-logo').outerWidth() - $('#bs-navbar-collapse .navbar-right').width() - $('.btn-edit-trip').width() - 40;
        }

        $('.js-trip-name').css('maxWidth', width);
    }
}());

InfoBubble.prototype.shadowStyle_changed = function() {
    var shadowStyle = this.getShadowStyle_();

    var display = '';
    var shadow = '';
    var backgroundColor = '';
    switch (shadowStyle) {
        case 0:
            display = 'none';
            break;
        case 1:
            shadow = '40px 15px 10px rgba(33,33,33,0.3)';
            backgroundColor = 'transparent';
            break;
        case 2:
            shadow = '0 0 2px rgba(33,33,33,0.3)';
            backgroundColor = 'rgba(33,33,33,0.35)';
            break;
        case 3:
            shadow = '1px 2px 5px 0 rgba(107, 107, 107, 1)';
            backgroundColor = 'transparent';
            break;
    }

    this.bubbleShadow_.style['boxShadow'] = this.bubbleShadow_.style['webkitBoxShadow'] = this.bubbleShadow_.style['MozBoxShadow'] = shadow;

    this.bubbleShadow_.style['backgroundColor'] = backgroundColor;

    if (this.isOpen_) {
        this.bubbleShadow_.style['display'] = display;
        this.draw();
    }
};

InfoBubble.prototype.draw = function() {
    var projection = this.getProjection();

    if (!projection) {
        // The map projection is not ready yet so do nothing
        return;
    }

    var latLng = /** @type {google.maps.LatLng} */ (this.get('position'));

    if (!latLng) {
        this.close();
        return;
    }

    var tabHeight = 0;

    if (this.activeTab_) {
        tabHeight = this.activeTab_.offsetHeight;
    }

    var anchorHeight = this.getAnchorHeight_();
    var arrowSize = this.getArrowSize_();
    var arrowPosition = this.getArrowPosition_();
    var borderWidth = this.getBorderWidth_() > 0 ? this.getBorderWidth_() : 3;

    arrowPosition = arrowPosition / 100;

    var pos = projection.fromLatLngToDivPixel(latLng);
    var width = this.contentContainer_.offsetWidth;
    var height = this.bubble_.offsetHeight;

    if (!width) {
        return;
    }

    // Adjust for the height of the info bubble
    var top = pos.y - (height + arrowSize);

    if (anchorHeight) {
        // If there is an anchor then include the height
        top -= anchorHeight;
    }

    var left = pos.x - (width * arrowPosition);

    this.bubble_.style['top'] = this.px(top);
    this.bubble_.style['left'] = this.px(left);

    var shadowStyle = parseInt(this.get('shadowStyle'), 10);

    switch (shadowStyle) {
        case 1:
            // Shadow is behind
            this.bubbleShadow_.style['top'] = this.px(top + tabHeight - 1);
            this.bubbleShadow_.style['left'] = this.px(left);
            this.bubbleShadow_.style['width'] = this.px(width);
            this.bubbleShadow_.style['height'] =
                this.px(this.contentContainer_.offsetHeight - arrowSize);
            break;
        case 2:
            // Shadow is below
            width = width * 0.8;
            if (anchorHeight) {
                this.bubbleShadow_.style['top'] = this.px(pos.y);
            } else {
                this.bubbleShadow_.style['top'] = this.px(pos.y + arrowSize);
            }
            this.bubbleShadow_.style['left'] = this.px(pos.x - width * arrowPosition);

            this.bubbleShadow_.style['width'] = this.px(width);
            this.bubbleShadow_.style['height'] = this.px(2);
            break;
        case 3:
            // Custom shadow and arrow
            var arrowWidthIncreaseValue = 9;

            this.bubbleShadow_.style['top'] = this.px(top);
            this.bubbleShadow_.style['left'] = this.px(left);
            this.bubbleShadow_.style['width'] = this.px(width);
            this.bubbleShadow_.style['height'] = this.px(height);

            this.arrowInner_.style['marginLeft'] = this.px(-(arrowSize + arrowWidthIncreaseValue));
            this.arrowInner_.style['borderLeftWidth'] = this.px(arrowSize + arrowWidthIncreaseValue);
            this.arrowInner_.style['borderRightWidth'] = this.px(arrowSize + arrowWidthIncreaseValue);

            this.arrowOuter_.style['borderWidth'] = null;
            this.arrowOuter_.style['borderLeftWidth'] = this.px(arrowSize + arrowWidthIncreaseValue + borderWidth + 1);
            this.arrowOuter_.style['borderRightWidth'] = this.px(arrowSize + arrowWidthIncreaseValue + borderWidth + 1);
            this.arrowOuter_.style['borderTopWidth'] = this.px(arrowSize + borderWidth);
            this.arrowOuter_.style['marginLeft'] = this.px(-(arrowSize + arrowWidthIncreaseValue + borderWidth + 1));
            this.arrowOuter_.style['display'] = 'block';
            this.arrowOuter_.style['borderColor'] = "rgba(107, 107, 107, 0.5) transparent transparent";

            this.bubble_.parentNode.style['zIndex'] = this.getZIndex();
            this.bubbleShadow_.parentNode.style['zIndex'] = this.getZIndex()-1;

            break;
    }
};

if(!String.linkify) {
    String.prototype.linkify = function() {

        // http://, https://, ftp://
        var urlPattern = /\b(?:https?|ftp):\/\/[a-z0-9-+&@#\/%?=~_|!:,.;]*[a-z0-9-+&@#\/%=~_|]/gim;

        // www. sans http:// or https://
        var pseudoUrlPattern = /(^|[^\/])(www\.[\S]+(\b|$))/gim;

        // Email addresses
        var emailAddressPattern = /[\w.]+@[a-zA-Z_-]+?(?:\.[a-zA-Z]{2,6})+/gim;

        return this
            .replace(urlPattern, '<a href="$&">$&</a>')
            .replace(pseudoUrlPattern, '$1<a href="http://$2">$2</a>')
            .replace(emailAddressPattern, '<a href="mailto:$&">$&</a>');
    };
}