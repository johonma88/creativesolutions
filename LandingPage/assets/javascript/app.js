$().ready(function(){

  $(document).on("click","button", function() {

  $("#intro").load("./GoogleMap_App/drivingfromAtoB.html", function(responseTxt, statusTxt, xhr){
    if(statusTxt == "success")
        alert("External content loaded successfully!");
    if(statusTxt == "error")
        alert("Error: " + xhr.status + ": " + xhr.statusText);
  });

  });

    // $(document).on("click","#buttonIni", function() {
    
    //     // Constructing a URL to search Giphy for the clicked/searched category
    //     var queryURL = "./GoogleMap_App/drivingfromAtoB.html";
    
    //     // Performing our AJAX GET request
    //     $.ajax({
    //         url: queryURL,
    //         method: "GET"
    //       })
    //   });

})